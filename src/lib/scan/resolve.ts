import type { Member } from '@/lib/db/schema'
import { verifyMemberQrPayload } from '@/lib/qr/payload'

// What a scanned code turned out to be, and what the leader has to do about
// it. Kept as pure functions over a member row so the rules are testable
// without a camera or a database.

export type ScanOutcome =
  | { kind: 'member'; member: Member; gaps: MemberGap[] }
  | { kind: 'guest'; guestNumber: string; qrToken: string }
  | { kind: 'expired-member'; member: Member }
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

export function memberGaps(member: Member): MemberGap[] {
  const gaps: MemberGap[] = []
  if (!member.email) gaps.push('email')
  if (!member.phone) gaps.push('phone')
  return gaps
}

// Guest QR, brief Section 5: vcdc:g:{guest_number}:{qr_token}
const GUEST_QR = /^vcdc:g:(\d+):([A-Za-z0-9_-]{16,128})$/

// Classifies a raw scanned string before any database work, so the caller
// knows whether a lookup is even worth doing.
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

  const guest = GUEST_QR.exec(trimmed)
  if (guest) {
    const [, guestNumber, qrToken] = guest
    if (guestNumber && qrToken) return { kind: 'guest', guestNumber, qrToken }
  }

  return { kind: 'not-ours' }
}

// Displayed guest number, brief Section 4: G00001.
export function formatGuestNumber(guestNumber: string | number): string {
  return `G${String(guestNumber).padStart(5, '0')}`
}
