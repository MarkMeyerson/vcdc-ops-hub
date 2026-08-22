// One-off import of the club's member master sheet into the members table.
//
// Usage:
//   npm run import:members -- --dry-run     preview, touches nothing
//   npm run import:members                  insert
//
// Source file: documents/members-2026.csv, exported from
// "VCDC 2026 Member Master Sheet.xlsx". That sheet carries two columns, a
// name and a member number, so every other required field is derived here
// and every derivation is printed so it can be checked and corrected in the
// admin UI afterwards.
//
// Idempotent: rows whose member number already exists are left alone, so a
// second run never overwrites an admin's later corrections.

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { members } from '../src/lib/db/schema'

const SOURCE = join(process.cwd(), 'documents', 'members-2026.csv')

// Everyone on the 2026 sheet is a 2026 member; the club renews on the
// calendar year.
const EXPIRES_AT = '2026-12-31'

const DRY_RUN = process.argv.includes('--dry-run')

// --sql writes a file to paste into the Supabase SQL editor instead of
// connecting to anything. That is the path that needs no connection string
// and no database password on the machine running this.
const SQL_OUT = process.argv.includes('--sql')
const SQL_PATH = join(process.cwd(), 'documents', 'import-members.sql')

type SourceRow = { name: string; memberNumber: number; line: number }

type Prepared = {
  memberNumber: number
  firstName: string
  lastName: string
  joinedAt: string
  line: number
  raw: string
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        field += ch
      }
      continue
    }
    if (ch === '"') {
      quoted = true
    } else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (ch !== '\r') {
      field += ch
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

function readSource(): SourceRow[] {
  const rows = parseCsv(readFileSync(SOURCE, 'utf8'))
  const header = rows[0]
  if (!header) throw new Error(`${SOURCE} is empty`)

  const nameIndex = header.findIndex((h) => h.trim().toLowerCase() === 'name')
  const numberIndex = header.findIndex(
    (h) => h.trim().toLowerCase() === 'member_number'
  )
  if (nameIndex < 0 || numberIndex < 0) {
    throw new Error(
      `${SOURCE} needs "name" and "member_number" columns, found: ${header.join(', ')}`
    )
  }

  const out: SourceRow[] = []
  rows.slice(1).forEach((cells, index) => {
    const name = (cells[nameIndex] ?? '').trim()
    const numberText = (cells[numberIndex] ?? '').trim()
    if (name === '' && numberText === '') return

    const memberNumber = Number(numberText)
    if (!Number.isInteger(memberNumber) || memberNumber <= 0) {
      throw new Error(
        `Row ${index + 2}: "${numberText}" is not a member number (name: ${name})`
      )
    }
    if (name === '') {
      throw new Error(
        `Row ${index + 2}: member number ${memberNumber} has no name`
      )
    }
    out.push({ name, memberNumber, line: index + 2 })
  })
  return out
}

const HONORIFICS = new Set(['mr', 'mrs', 'ms', 'miss', 'dr', 'prof', 'rev'])

// Only fixes names typed entirely in lower case ("mark meyerson"). Anything
// with a deliberate capital is left alone so "Di Maggio", "Ryan-Silva" and
// "McLeod" survive untouched.
function fixCasing(token: string): string {
  if (/[A-Z]/.test(token)) return token
  return token.replace(
    /(^|[-'])([a-z])/g,
    (_match, separator: string, letter: string) =>
      separator + letter.toUpperCase()
  )
}

function splitName(raw: string): { firstName: string; lastName: string } {
  let tokens = raw.split(/\s+/).filter(Boolean).map(fixCasing)

  // Drop a leading honorific: the card prints a name, not a title.
  const lead = tokens[0]
  if (lead && HONORIFICS.has(lead.replace(/\.$/, '').toLowerCase())) {
    tokens = tokens.slice(1)
  }

  // Drop a middle initial ("Manuel D. Cruz Machado" becomes Manuel / Cruz
  // Machado). Middle position only: a trailing initial is somebody's surname.
  if (tokens.length > 2) {
    const last = tokens.length - 1
    tokens = tokens.filter(
      (token, i) => i === 0 || i === last || !/^[A-Za-z]\.?$/.test(token)
    )
  }

  const firstToken = tokens[0]
  if (!firstToken) throw new Error(`Cannot read a name from "${raw}"`)
  if (tokens.length === 1) {
    // Single-word name: the schema wants both halves, so it lands in the
    // surname and the given name repeats it rather than being empty.
    return { firstName: firstToken, lastName: firstToken }
  }
  return { firstName: firstToken, lastName: tokens.slice(1).join(' ') }
}

// 24001 becomes 2024, 25083 becomes 2025, 26129 becomes 2026. The club
// encodes the year a number was issued in its first two digits, which is
// the only joining signal the sheet carries.
function joinedFromMemberNumber(memberNumber: number): string {
  const prefix = Math.floor(memberNumber / 1000)
  if (prefix < 20 || prefix > 99) {
    throw new Error(
      `Member number ${memberNumber} does not start with a two-digit year`
    )
  }
  return `20${prefix}-01-01`
}

function prepare(rows: SourceRow[]) {
  const prepared: Prepared[] = []
  const duplicateRows: SourceRow[] = []
  const numberConflicts: { kept: Prepared; rejected: SourceRow }[] = []
  const byNumber = new Map<number, Prepared>()

  for (const row of rows) {
    const { firstName, lastName } = splitName(row.name)
    const candidate: Prepared = {
      memberNumber: row.memberNumber,
      firstName,
      lastName,
      joinedAt: joinedFromMemberNumber(row.memberNumber),
      line: row.line,
      raw: row.name,
    }

    const existing = byNumber.get(row.memberNumber)
    if (existing) {
      const sameName =
        existing.firstName.toLowerCase() === firstName.toLowerCase() &&
        existing.lastName.toLowerCase() === lastName.toLowerCase()
      if (sameName) duplicateRows.push(row)
      else numberConflicts.push({ kept: existing, rejected: row })
      continue
    }

    byNumber.set(row.memberNumber, candidate)
    prepared.push(candidate)
  }

  // Same person listed twice under different numbers. Not a constraint
  // violation, so these import as written and are only reported.
  const byName = new Map<string, Prepared[]>()
  for (const person of prepared) {
    const key = `${person.firstName} ${person.lastName}`.toLowerCase()
    const list = byName.get(key)
    if (list) list.push(person)
    else byName.set(key, [person])
  }
  const repeatedNames = [...byName.values()].filter((list) => list.length > 1)

  return { prepared, duplicateRows, numberConflicts, repeatedNames }
}

// Postgres string literal. Names here come from a spreadsheet the club
// maintains, so the apostrophe in O'Brien has to survive the trip.
function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function buildSql(
  prepared: Prepared[],
  duplicateRows: SourceRow[],
  numberConflicts: { kept: Prepared; rejected: SourceRow }[],
  repeatedNames: Prepared[][]
): string {
  const lines: string[] = [
    '-- VCDC member roster import.',
    '-- Generated by scripts/import-members.ts from the 2026 master sheet.',
    '-- Paste into the Supabase SQL editor and run. Safe to run twice: the',
    '-- insert ends in ON CONFLICT DO NOTHING, so existing members and any',
    '-- corrections made in the admin UI are left untouched.',
    '--',
    `-- ${prepared.length} members. Tier is regular for everyone and email is`,
    '-- left blank, because the sheet carries only a name and a number.',
    '-- Joined dates come from the member number: the club encodes the year a',
    '-- number was issued in its first two digits (24001 -> 2024).',
    `-- Expiry is ${EXPIRES_AT} for everyone: this is the 2026 sheet and the`,
    '-- club renews on the calendar year.',
  ]

  if (numberConflicts.length > 0) {
    lines.push('--')
    lines.push('-- NOT INCLUDED BELOW, needs a decision:')
    for (const { kept, rejected } of numberConflicts) {
      lines.push(
        `--   ${kept.memberNumber} is used by both "${kept.raw}" and "${rejected.name}".`
      )
      lines.push(
        `--   member_number is unique, so "${rejected.name}" is left out until`
      )
      lines.push('--   one of them is given a new number.')
    }
  }

  if (duplicateRows.length > 0) {
    lines.push('--')
    for (const row of duplicateRows) {
      lines.push(
        `-- "${row.name}" (${row.memberNumber}) was listed twice in the sheet; the second copy was dropped.`
      )
    }
  }

  if (repeatedNames.length > 0) {
    lines.push('--')
    lines.push('-- Worth checking, imported as written:')
    for (const list of repeatedNames) {
      const first = list[0]
      if (!first) continue
      lines.push(
        `--   ${first.firstName} ${first.lastName} appears under ${list.map((p) => p.memberNumber).join(' and ')}.`
      )
    }
  }

  lines.push('')
  lines.push('-- Step 1 of 2: let members exist without an email address.')
  lines.push('-- The club has never collected addresses for most of the')
  lines.push('-- roster. The column stays unique, so real addresses collected')
  lines.push('-- later still cannot collide. Harmless if already applied.')
  lines.push('alter table members alter column email drop not null;')
  lines.push('')
  lines.push(`-- Step 2 of 2: the ${prepared.length} members.`)
  lines.push('insert into members')
  lines.push(
    '  (member_number, first_name, last_name, membership_tier, joined_at, expires_at)'
  )
  lines.push('values')

  const values = prepared.map(
    (person) =>
      `  (${person.memberNumber}, ${quote(person.firstName)}, ${quote(person.lastName)}, 'regular', ${quote(person.joinedAt)}, ${quote(EXPIRES_AT)})`
  )
  lines.push(values.join(',\n'))
  lines.push('on conflict (member_number) do nothing;')
  lines.push('')
  lines.push('-- Confirm what landed:')
  lines.push('select count(*) as members_now from members;')
  lines.push('')

  return lines.join('\n')
}

async function main() {
  const source = readSource()
  const { prepared, duplicateRows, numberConflicts, repeatedNames } =
    prepare(source)

  console.log(`Read ${source.length} rows from documents/members-2026.csv`)
  console.log(`Prepared ${prepared.length} members to import`)
  console.log(
    `Expiry set to ${EXPIRES_AT}, tier set to regular, email left blank`
  )

  if (duplicateRows.length > 0) {
    console.log(`\nDropped ${duplicateRows.length} duplicate row(s):`)
    for (const row of duplicateRows) {
      console.log(
        `  line ${row.line}: ${row.name} (${row.memberNumber}) listed twice`
      )
    }
  }

  if (numberConflicts.length > 0) {
    console.log(
      `\nNOT IMPORTED: ${numberConflicts.length} member number collision(s). Two different people share one number, so one of them needs a new number before it can be imported:`
    )
    for (const { kept, rejected } of numberConflicts) {
      console.log(
        `  ${kept.memberNumber}: kept "${kept.raw}" (line ${kept.line}), skipped "${rejected.name}" (line ${rejected.line})`
      )
    }
  }

  if (repeatedNames.length > 0) {
    console.log('\nWorth a look: same name under more than one number.')
    for (const list of repeatedNames) {
      const first = list[0]
      if (!first) continue
      const numbers = list.map((person) => person.memberNumber).join(' and ')
      console.log(`  ${first.firstName} ${first.lastName}: ${numbers}`)
    }
  }

  if (SQL_OUT) {
    writeFileSync(
      SQL_PATH,
      buildSql(prepared, duplicateRows, numberConflicts, repeatedNames),
      'utf8'
    )
    console.log(`\nWrote documents/import-members.sql (${prepared.length} members).`)
    console.log('Paste it into the Supabase SQL editor and run it.')
    return
  }

  if (DRY_RUN) {
    console.log('\nDry run: nothing was written. Every prepared row:')
    for (const person of prepared) {
      console.log(
        `  ${person.memberNumber}  ${person.firstName} | ${person.lastName}  joined ${person.joinedAt}`
      )
    }
    return
  }

  const connectionString = process.env.DATABASE_URL ?? process.env.POSTGRES_URL
  if (!connectionString) {
    throw new Error('Set DATABASE_URL (or POSTGRES_URL) before importing')
  }
  const sql = postgres(connectionString, { prepare: false })
  const db = drizzle(sql)

  let inserted = 0
  for (const person of prepared) {
    const result = await db
      .insert(members)
      .values({
        memberNumber: person.memberNumber,
        firstName: person.firstName,
        lastName: person.lastName,
        membershipTier: 'regular',
        joinedAt: person.joinedAt,
        expiresAt: EXPIRES_AT,
      })
      .onConflictDoNothing({ target: members.memberNumber })
      .returning({ id: members.id })
    if (result.length > 0) inserted++
  }

  await sql.end()
  console.log(
    `\nInserted ${inserted} member(s). ${prepared.length - inserted} already existed and were left untouched.`
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
