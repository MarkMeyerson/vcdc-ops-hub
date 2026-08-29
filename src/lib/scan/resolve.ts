import type { Member } from '@/lib/db/schema'
import { verifyMemberQrPayload } from '@/lib/qr/payload'
import { parseScan, signaturesMatch } from '@/lib/scan/parse'

export { formatGuestNumber } from '@/lib/scan/parse'

// What a scanned code turned out to be, and what the leader has to do about
// it. Kept as pure functions over plain rows so the rules are testable
// without a camera or a database, and so the online path and the offline
// path can produce the identical shape. The scanner renders one component
// either way: a leader must never have to work out which mode they are in
// to read the screen.

// The subset of a member row the scanner shows. Deliberately narrower than
// Member: the offline roster carries no contact details (brief Section 9),
// so anything the offline path cannot know is not in this type at all.
export type ScannedMember = {
  id: string | null
  memberNumber: number
  firstName: string
  lastName: string
  membershipTier: Member['membershipTier']
  expiresAt: string
}

export type WaiverStatus =
  | { state: 'signed'; signedAt: string; version: number | null }
  | { state: 'missing' }
  // Offline, for a guest code. The roster carries member waiver status, but
  // guest waivers are signed after the roster syncs, so a guest code seen
  // with no signal cannot be checked at all. Saying so is the honest answer;
  // showing a green check would be a lie and a red cross would turn away
  // somebody who signed ten minutes ago.
  | { state: 'unknown' }

export type GuestDetail = {
  firstName: string
  lastName: string
  signedAt: string
  waiverVersion: number
}

export type GuestStatus =
  | 'valid'
  | 'expired'
  | 'unknown-code'
  | 'unverified'

export type ScanOutcome =
  | {
      kind: 'member'
      member: ScannedMember
      gaps: MemberGap[]
      waiver: WaiverStatus
    }
  | {
      kind: 'expired-member'
      member: ScannedMember
      waiver: WaiverStatus
    }
  | {
      kind: 'guest'
      guestNumber: string
      qrToken: string
      guest: GuestDetail | null
      status: GuestStatus
    }
  | { kind: 'unknown-member'; memberNumber: number }
  | { kind: 'not-ours'; raw: string }
  | { kind: 'tampered'; raw: string }

// Things worth stopping a rider for at sign-in. Deliberately not called
// "errors": a member with no email on file is still a member and still gets
// on the ride. The leader collects what is missing while they are standing
// there, which is the only moment the club reliably has their attention.
export type MemberGap = 'email' | 'phone'

export const GAP_LABELS: Record<MemberGap, string> = {
  email: 'No email on file',
  phone: 'No phone on file',
}

export function memberGaps(member: Pick<Member, 'email' | 'phone'>): MemberGap[] {
  const gaps: MemberGap[] = []
  if (!member.email) gaps.push('email')
  if (!member.phone) gaps.push('phone')
  return gaps
}

export function toScannedMember(member: Member): ScannedMember {
  return {
    id: member.id,
    memberNumber: member.memberNumber,
    firstName: member.firstName,
    lastName: member.lastName,
    membershipTier: member.membershipTier,
    expiresAt: member.expiresAt,
  }
}

export function memberWaiverStatus(
  member: Pick<Member, 'waiverSignedAt' | 'waiverVersion'>
): WaiverStatus {
  if (!member.waiverSignedAt) return { state: 'missing' }
  return {
    state: 'signed',
    signedAt: member.waiverSignedAt.toISOString(),
    version: member.waiverVersion,
  }
}

// Server-side classification. Verifies the signature with the signing
// secret, which only ever exists on the server.
export function classifyScan(
  raw: string
):
  | { kind: 'member'; memberNumber: number }
  | { kind: 'guest'; guestNumber: string; qrToken: string }
  | { kind: 'not-ours' }
  | { kind: 'tampered' } {
  const trimmed = raw.trim()

  if (trimmed.startsWith('vcdc:m:')) {
    const memberNumber = verifyMemberQrPayload(trimmed)
    // Right shape, wrong signature. Either a code from before the signing
    // secret was rotated, or something hand-made. Worth telling the leader
    // apart from a random QR, because the rider will insist it is their card.
    if (memberNumber === null) return { kind: 'tampered' }
    return { kind: 'member', memberNumber }
  }

  const parsed = parseScan(trimmed)
  if (parsed.kind === 'guest') {
    return {
      kind: 'guest',
      guestNumber: parsed.guestNumber,
      qrToken: parsed.qrToken,
    }
  }

  return { kind: 'not-ours' }
}

// ---------- Offline ----------

// One member as the phone holds them. Contact details are deliberately
// absent (brief Section 9: member number, name, tier, signature and nothing
// more). needsContact carries the one bit the leader actually acts on, so
// the prompt to collect an address still appears with no signal without any
// address ever leaving the server.
export type RosterEntry = {
  memberNumber: number
  firstName: string
  lastName: string
  membershipTier: Member['membershipTier']
  expiresAt: string
  waiverSignedAt: string | null
  waiverVersion: number | null
  needsContact: boolean
  signature: string
}

export type Roster = {
  syncedAt: string
  entries: RosterEntry[]
}

// Offline classification. Identical output shape to the online path, built
// without the signing secret: the signature read off the card is compared
// against the one the server precomputed for that member number.
//
// today is passed in rather than read from the clock so expiry is testable,
// and so a phone left running past midnight is judged against the date the
// caller means.
export function resolveOffline(
  raw: string,
  roster: RosterEntry[],
  today: string
): ScanOutcome {
  const parsed = parseScan(raw)

  if (parsed.kind === 'not-ours') return { kind: 'not-ours', raw }

  if (parsed.kind === 'guest') {
    return {
      kind: 'guest',
      guestNumber: parsed.guestNumber,
      qrToken: parsed.qrToken,
      guest: null,
      status: 'unverified',
    }
  }

  const entry = roster.find((r) => r.memberNumber === parsed.memberNumber)
  if (!entry) {
    // Could be a member added since the roster synced, or a number that no
    // longer exists. The leader sees the same message either way and the
    // scan is kept, so the server settles it at submit.
    return { kind: 'unknown-member', memberNumber: parsed.memberNumber }
  }

  if (!signaturesMatch(entry.signature, parsed.signature)) {
    return { kind: 'tampered', raw }
  }

  const member: ScannedMember = {
    id: null,
    memberNumber: entry.memberNumber,
    firstName: entry.firstName,
    lastName: entry.lastName,
    membershipTier: entry.membershipTier,
    expiresAt: entry.expiresAt,
  }

  const waiver: WaiverStatus = entry.waiverSignedAt
    ? {
        state: 'signed',
        signedAt: entry.waiverSignedAt,
        version: entry.waiverVersion,
      }
    : { state: 'missing' }

  if (entry.expiresAt < today) {
    return { kind: 'expired-member', member, waiver }
  }

  // needsContact is one bit standing in for both gaps, because the phone was
  // never told which of the two is missing. The leader is prompted; the form
  // asks for both and blanks leave whatever is already on file alone.
  const gaps: MemberGap[] = entry.needsContact ? ['email', 'phone'] : []

  return { kind: 'member', member, gaps, waiver }
}

// The line the leader reads on the check-in list, and the key that stops one
// rider appearing twice. Shared so the online and offline paths cannot drift
// into producing different keys for the same person.
export function attendanceKey(outcome: ScanOutcome, raw: string): string | null {
  switch (outcome.kind) {
    case 'member':
    case 'expired-member':
      return `m:${outcome.member.memberNumber}`
    case 'guest':
      return `g:${outcome.guestNumber}`
    case 'unknown-member':
      return `u:${outcome.memberNumber}`
    case 'tampered':
      return `t:${raw.trim()}`
    default:
      // A stranger's QR code puts nobody on a ride.
      return null
  }
}
