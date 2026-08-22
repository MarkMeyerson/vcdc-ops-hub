import type { Member } from '@/lib/db/schema'
import { parseCsv, toCsv } from '@/lib/csv'

// Bulk update of the roster from a spreadsheet.
//
// The everyday path is the admin UI, one member at a time. This exists for
// the catch-up: the roster was imported from a two-column sheet, so almost
// every member is missing an email, a phone, and a real join date, and
// collecting that is spreadsheet work rather than web-form work.
//
// Two rules make this safe to hand to somebody who is not a developer:
//
//   1. A blank cell means "leave it alone", never "erase it". Somebody
//      filling in twenty addresses must not wipe the other seventy-six.
//   2. Nothing is written from a parse. The upload produces a plan, the
//      plan is shown, and only a second deliberate action applies it.
//
// Member number is the key and is never updated. Everything else in the
// template can be corrected, including names, because the sheet split
// "Ana Marie Diaz" as a guess and only a human knows where it belongs.

export const TEMPLATE_HEADERS = [
  'member_number',
  'first_name',
  'last_name',
  'email',
  'phone',
  'tier',
  'joined',
  'expires',
] as const

export type ImportField =
  | 'firstName'
  | 'lastName'
  | 'email'
  | 'phone'
  | 'membershipTier'
  | 'joinedAt'
  | 'expiresAt'

// Column name in the file, the member field it writes, and how it reads.
const COLUMNS: {
  header: (typeof TEMPLATE_HEADERS)[number]
  field: ImportField
  label: string
}[] = [
  { header: 'first_name', field: 'firstName', label: 'First name' },
  { header: 'last_name', field: 'lastName', label: 'Last name' },
  { header: 'email', field: 'email', label: 'Email' },
  { header: 'phone', field: 'phone', label: 'Phone' },
  { header: 'tier', field: 'membershipTier', label: 'Tier' },
  { header: 'joined', field: 'joinedAt', label: 'Joined' },
  { header: 'expires', field: 'expiresAt', label: 'Expires' },
]

export const FIELD_LABELS: Record<ImportField, string> = Object.fromEntries(
  COLUMNS.map((c) => [c.field, c.label])
) as Record<ImportField, string>

export type FieldChange = {
  field: ImportField
  from: string | null
  to: string | null
}

export type RowChange = {
  memberId: string
  memberNumber: number
  name: string
  changes: FieldChange[]
}

export type RowError = {
  line: number
  reference: string
  message: string
}

export type ImportPlan = {
  changes: RowChange[]
  unchangedRows: number
  errors: RowError[]
}

export function templateFilename(today: string): string {
  return `vcdc-members-${today}.csv`
}

// Pre-filled with what is already on file, so the person editing it can see
// what exists and only fills the gaps.
export function buildTemplate(roster: Member[]): string {
  const rows = roster.map((member) => [
    String(member.memberNumber),
    member.firstName,
    member.lastName,
    member.email ?? '',
    member.phone ?? '',
    member.membershipTier,
    member.joinedAt,
    member.expiresAt,
  ])
  return toCsv(TEMPLATE_HEADERS, rows)
}

const TIERS = new Set<Member['membershipTier']>([
  'regular',
  'lifetime',
  'honorary',
])

// Excel rewrites 2026-12-31 as 12/31/2026 the moment somebody opens the
// file and saves it, so both have to be readable or the round trip breaks
// for reasons nobody can see.
function parseDate(raw: string): string | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
  if (iso) return isRealDate(raw) ? raw : null

  const us = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(raw)
  if (us) {
    const [, month, day, year] = us
    const padded = `${year}-${month!.padStart(2, '0')}-${day!.padStart(2, '0')}`
    return isRealDate(padded) ? padded : null
  }
  return null
}

// Catches 2026-02-31, which Date happily rolls forward into March.
function isRealDate(iso: string): boolean {
  const date = new Date(`${iso}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === iso
}

function parseEmail(raw: string): string | null {
  const value = raw.trim()
  // Deliberately loose: the job here is catching a name typed into the
  // email column, not adjudicating RFC 5322.
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) ? value : null
}

function parsePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  if (digits.length < 7 || digits.length > 15) return null
  return raw.trim()
}

export function planImport(csvText: string, roster: Member[]): ImportPlan {
  const rows = parseCsv(csvText)
  const header = rows[0]
  const errors: RowError[] = []

  if (!header) {
    return {
      changes: [],
      unchangedRows: 0,
      errors: [
        { line: 1, reference: '', message: 'The file is empty.' },
      ],
    }
  }

  const index = (name: string) =>
    header.findIndex((h) => h.trim().toLowerCase() === name)

  const numberIndex = index('member_number')
  if (numberIndex < 0) {
    return {
      changes: [],
      unchangedRows: 0,
      errors: [
        {
          line: 1,
          reference: '',
          message:
            'No member_number column. Download the template and edit that file rather than building one from scratch.',
        },
      ],
    }
  }

  const byNumber = new Map(roster.map((m) => [m.memberNumber, m]))
  const seen = new Map<number, number>()
  const changes: RowChange[] = []
  let unchangedRows = 0

  rows.slice(1).forEach((cells, i) => {
    const line = i + 2
    const numberText = (cells[numberIndex] ?? '').trim()
    const memberNumber = Number(numberText)

    if (!Number.isInteger(memberNumber) || memberNumber <= 0) {
      errors.push({
        line,
        reference: numberText || '(blank)',
        message: 'Not a member number.',
      })
      return
    }

    const firstSeen = seen.get(memberNumber)
    if (firstSeen) {
      errors.push({
        line,
        reference: numberText,
        message: `Already appears on line ${firstSeen}. Remove one of the two rows.`,
      })
      return
    }
    seen.set(memberNumber, line)

    const member = byNumber.get(memberNumber)
    if (!member) {
      errors.push({
        line,
        reference: numberText,
        message:
          'No member has that number. This tool updates existing members; add new ones from the Members page.',
      })
      return
    }

    const rowChanges: FieldChange[] = []
    let rowFailed = false

    for (const column of COLUMNS) {
      const cellIndex = index(column.header)
      if (cellIndex < 0) continue

      const raw = (cells[cellIndex] ?? '').trim()
      // Blank means leave it alone. Clearing a value is done in the admin
      // UI, deliberately, one member at a time.
      if (raw === '') continue

      const current = member[column.field] ?? null
      let value: string | null = raw

      switch (column.field) {
        case 'email':
          value = parseEmail(raw)
          if (!value) {
            errors.push({
              line,
              reference: numberText,
              message: `"${raw}" is not an email address.`,
            })
            rowFailed = true
          }
          break
        case 'phone':
          value = parsePhone(raw)
          if (!value) {
            errors.push({
              line,
              reference: numberText,
              message: `"${raw}" is not a phone number.`,
            })
            rowFailed = true
          }
          break
        case 'membershipTier': {
          const tier = raw.toLowerCase()
          if (!TIERS.has(tier as Member['membershipTier'])) {
            errors.push({
              line,
              reference: numberText,
              message: `"${raw}" is not a tier. Use regular, lifetime, or honorary.`,
            })
            rowFailed = true
          }
          value = tier
          break
        }
        case 'joinedAt':
        case 'expiresAt':
          value = parseDate(raw)
          if (!value) {
            errors.push({
              line,
              reference: numberText,
              message: `"${raw}" is not a date. Use 2026-12-31 or 12/31/2026.`,
            })
            rowFailed = true
          }
          break
        default:
          break
      }

      if (value !== null && value !== current) {
        rowChanges.push({ field: column.field, from: current, to: value })
      }
    }

    if (rowFailed) return

    // Whatever the row leaves untouched keeps its current value, so the
    // check has to run against the result rather than against the file.
    const joined =
      rowChanges.find((c) => c.field === 'joinedAt')?.to ?? member.joinedAt
    const expires =
      rowChanges.find((c) => c.field === 'expiresAt')?.to ?? member.expiresAt
    if (joined > expires) {
      errors.push({
        line,
        reference: numberText,
        message: `Joined ${joined} is after expires ${expires}, so the membership would end before it starts.`,
      })
      return
    }

    if (rowChanges.length === 0) {
      unchangedRows++
      return
    }

    changes.push({
      memberId: member.id,
      memberNumber: member.memberNumber,
      name: `${member.firstName} ${member.lastName}`,
      changes: rowChanges,
    })
  })

  // An email arriving on two different members breaks the unique index, and
  // the database error would name a constraint rather than the two people.
  const incomingEmails = new Map<string, number[]>()
  for (const change of changes) {
    const email = change.changes.find((c) => c.field === 'email')?.to
    if (!email) continue
    const key = email.toLowerCase()
    const list = incomingEmails.get(key)
    if (list) list.push(change.memberNumber)
    else incomingEmails.set(key, [change.memberNumber])
  }
  for (const [email, numbers] of incomingEmails) {
    if (numbers.length > 1) {
      errors.push({
        line: 0,
        reference: numbers.join(', '),
        message: `${email} is assigned to more than one member. Each address can belong to only one.`,
      })
    }
  }

  const takenElsewhere = new Set(
    roster
      .filter((m) => m.email)
      .map((m) => `${m.email!.toLowerCase()}:${m.memberNumber}`)
  )
  for (const change of changes) {
    const email = change.changes.find((c) => c.field === 'email')?.to
    if (!email) continue
    const owner = roster.find(
      (m) =>
        m.email?.toLowerCase() === email.toLowerCase() &&
        m.memberNumber !== change.memberNumber
    )
    if (owner && !takenElsewhere.has(`${email.toLowerCase()}:${change.memberNumber}`)) {
      errors.push({
        line: 0,
        reference: String(change.memberNumber),
        message: `${email} already belongs to ${owner.firstName} ${owner.lastName} (${owner.memberNumber}).`,
      })
    }
  }

  // Any error means nothing applies. A partly-applied spreadsheet is worse
  // than a rejected one, because nobody can tell which half landed.
  if (errors.length > 0) {
    return { changes: [], unchangedRows, errors }
  }

  return { changes, unchangedRows, errors }
}
