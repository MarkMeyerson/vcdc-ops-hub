import type { Member } from '@/lib/db/schema'

// What is wrong with the roster, defined once.
//
// The club's records came from a spreadsheet with two columns, so most of
// what is missing is missing for a reason and will be filled in over time.
// The point of these checks is to make that visible and finite rather than
// something an admin has to remember, and to separate the rows that are
// genuinely broken from the ones that are merely incomplete.
//
// Everything here is a pure function over the roster so it can be tested
// without a database and reused by any page that needs it.

export type FlagKind = 'problem' | 'missing' | 'renewal'

export type Flag =
  | 'expired'
  | 'expiring-soon'
  | 'no-email'
  | 'no-phone'
  | 'placeholder-joined'
  | 'number-out-of-scheme'
  | 'expiry-before-joined'
  | 'permanent-tier-expires'
  | 'duplicate-name'

type FlagSpec = {
  kind: FlagKind
  label: string
  // What the check actually asserts, in a sentence an admin can act on.
  explanation: string
}

// A membership is worth chasing this far ahead of its expiry. The club
// renews on the calendar year, so this catches everyone through November.
export const EXPIRING_SOON_DAYS = 60

// The club numbers members YYnnn: 24001 was the first of 2024. Anything
// below this did not come from that scheme and is almost always a test row.
const LOWEST_REAL_MEMBER_NUMBER = 20000

// Tiers that are not supposed to lapse. An expiry inside a year on one of
// these means the tier and the date disagree, and one of them is wrong.
const PERMANENT_TIERS: ReadonlySet<Member['membershipTier']> = new Set([
  'lifetime',
  'honorary',
])

export const FLAG_SPECS: Record<Flag, FlagSpec> = {
  'expiry-before-joined': {
    kind: 'problem',
    label: 'Expiry is before the join date',
    explanation:
      'The membership ends before it starts, so one of the two dates was entered wrong.',
  },
  'number-out-of-scheme': {
    kind: 'problem',
    label: 'Member number is not a club number',
    explanation: `The club numbers members YYnnn, so 24001 was the first of 2024. Anything under ${LOWEST_REAL_MEMBER_NUMBER} did not come from that scheme and is usually a test row left over from setup.`,
  },
  'permanent-tier-expires': {
    kind: 'problem',
    label: 'Lifetime or honorary, but expires soon',
    explanation:
      'The tier says this membership never lapses and the date says it lapses within a year. One of them needs correcting, or the card will retire itself.',
  },
  'duplicate-name': {
    kind: 'problem',
    label: 'Same name under more than one number',
    explanation:
      'Either one person was issued a second number on renewal, or two people share a name. The first case means they get two cards and two emails.',
  },
  'no-email': {
    kind: 'missing',
    label: 'No email address',
    explanation:
      'Nothing to send their card to. They can still fetch it themselves at /card with their number and last name.',
  },
  'placeholder-joined': {
    kind: 'missing',
    label: 'Join date is a placeholder',
    explanation:
      'The year came from their member number and the day was filled in as January 1. The year is real; the day is not.',
  },
  'no-phone': {
    kind: 'missing',
    label: 'No phone number',
    explanation: 'Optional, and only worth collecting alongside something else.',
  },
  expired: {
    kind: 'renewal',
    label: 'Expired',
    explanation:
      'Their card link shows a renewal notice instead of a download until the expiry date is moved.',
  },
  'expiring-soon': {
    kind: 'renewal',
    label: `Expires within ${EXPIRING_SOON_DAYS} days`,
    explanation:
      'Still works today. Moving the expiry date is all a renewal takes; the card link itself never changes.',
  },
}

// Presentation order: broken first, then the renewal calendar, then the
// gaps that are only worth filling opportunistically.
export const FLAG_ORDER: readonly Flag[] = [
  'expiry-before-joined',
  'number-out-of-scheme',
  'permanent-tier-expires',
  'duplicate-name',
  'expired',
  'expiring-soon',
  'no-email',
  'placeholder-joined',
  'no-phone',
]

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  const result = date.toISOString().slice(0, 10)
  if (!result) throw new Error(`could not shift date ${isoDate}`)
  return result
}

function normalizedName(member: Member): string {
  return `${member.firstName} ${member.lastName}`.trim().toLowerCase()
}

export function flagsFor(
  member: Member,
  today: string,
  duplicateNames: ReadonlySet<string>
): Flag[] {
  const flags: Flag[] = []

  if (member.joinedAt > member.expiresAt) flags.push('expiry-before-joined')
  if (member.memberNumber < LOWEST_REAL_MEMBER_NUMBER) {
    flags.push('number-out-of-scheme')
  }
  if (
    PERMANENT_TIERS.has(member.membershipTier) &&
    member.expiresAt < addDays(today, 365)
  ) {
    flags.push('permanent-tier-expires')
  }
  if (duplicateNames.has(normalizedName(member))) flags.push('duplicate-name')

  if (member.expiresAt < today) {
    flags.push('expired')
  } else if (member.expiresAt <= addDays(today, EXPIRING_SOON_DAYS)) {
    flags.push('expiring-soon')
  }

  if (!member.email) flags.push('no-email')
  // Only a placeholder when the address is missing too: those rows came from
  // the sheet import together. A January date typed in by an admin who also
  // has the member's email is a real January date.
  if (!member.email && member.joinedAt.endsWith('-01-01')) {
    flags.push('placeholder-joined')
  }
  if (!member.phone) flags.push('no-phone')

  return flags
}

export type Review = {
  today: string
  total: number
  // Members carrying each flag, in roster order, keyed by flag.
  byFlag: Record<Flag, Member[]>
  // Distinct members carrying at least one flag of each kind. A member with
  // three gaps is one person to chase, not three, so counts are of people.
  countsByKind: Record<FlagKind, number>
  flaggedMembers: { member: Member; flags: Flag[] }[]
}

export function reviewRoster(roster: Member[], today: string): Review {
  const nameCounts = new Map<string, number>()
  for (const member of roster) {
    const key = normalizedName(member)
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1)
  }
  const duplicateNames = new Set(
    [...nameCounts.entries()].filter(([, n]) => n > 1).map(([name]) => name)
  )

  const byFlag = Object.fromEntries(
    FLAG_ORDER.map((flag) => [flag, [] as Member[]])
  ) as Record<Flag, Member[]>

  const countsByKind: Record<FlagKind, number> = {
    problem: 0,
    missing: 0,
    renewal: 0,
  }

  const flaggedMembers: { member: Member; flags: Flag[] }[] = []

  for (const member of roster) {
    const flags = flagsFor(member, today, duplicateNames)
    if (flags.length === 0) continue

    flaggedMembers.push({ member, flags })
    const kinds = new Set<FlagKind>()
    for (const flag of flags) {
      byFlag[flag].push(member)
      kinds.add(FLAG_SPECS[flag].kind)
    }
    for (const kind of kinds) countsByKind[kind]++
  }

  return {
    today,
    total: roster.length,
    byFlag,
    countsByKind,
    flaggedMembers,
  }
}
