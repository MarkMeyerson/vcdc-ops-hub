import type { Member } from '@/lib/db/schema'
import { appOrigin, tierLabels } from '@/lib/display'

// The per-member card link and the CSV built from it. Shared by the admin
// links page and its CSV download so the two can never disagree about a URL.

export function memberCardUrl(member: Pick<Member, 'id'>): string | null {
  const origin = appOrigin()
  return origin ? `${origin}/card/${member.id}` : null
}

// RFC 4180: quote every field and double any quote inside it. Names come
// from a club spreadsheet, so commas and apostrophes both turn up.
function csvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

export const CSV_HEADERS = [
  'name',
  'first_name',
  'last_name',
  'member_number',
  'tier',
  'expires',
  'card_url',
] as const

export function membersCsv(roster: Member[]): string {
  const rows = roster.map((member) =>
    [
      `${member.firstName} ${member.lastName}`,
      member.firstName,
      member.lastName,
      String(member.memberNumber),
      tierLabels[member.membershipTier],
      member.expiresAt,
      memberCardUrl(member) ?? '',
    ]
      .map(csvField)
      .join(',')
  )

  // Excel on Windows needs the BOM to read UTF-8, and without it names like
  // Togliatti and Brutout come out mangled in the mail merge.
  return `﻿${[CSV_HEADERS.join(','), ...rows].join('\r\n')}\r\n`
}

export function membersCsvFilename(today: string): string {
  return `vcdc-member-card-links-${today}.csv`
}
