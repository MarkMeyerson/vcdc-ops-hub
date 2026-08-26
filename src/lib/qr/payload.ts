import { createHmac, timingSafeEqual } from 'node:crypto'

// Member QR payload, brief Section 5:
//   vcdc:m:{member_number}:{sig}
// sig is HMAC-SHA256 of "vcdc:m:{member_number}" keyed with
// QR_SIGNING_SECRET, truncated to 16 hex characters. The vcdc: scheme is
// deliberate: never encode a URL in the QR, so random camera and banking
// apps treat it as inert text.

const SIG_LENGTH = 16

export function qrSigningConfigured(): boolean {
  return Boolean(process.env.QR_SIGNING_SECRET)
}

// Deliberately not read through envVar() (src/lib/env.ts): see the matching
// note in src/lib/wallet/token.ts. This is live HMAC key material, not a
// config string, and every already-issued QR code is validating against
// whatever exact bytes are set today.
function secret(): string {
  const value = process.env.QR_SIGNING_SECRET
  if (!value) {
    throw new Error('QR_SIGNING_SECRET is not set')
  }
  return value
}

export function memberQrSignature(memberNumber: number): string {
  return createHmac('sha256', secret())
    .update(`vcdc:m:${memberNumber}`)
    .digest('hex')
    .slice(0, SIG_LENGTH)
}

export function buildMemberQrPayload(memberNumber: number): string {
  return `vcdc:m:${memberNumber}:${memberQrSignature(memberNumber)}`
}

// Used by the scanner in later slices. Returns the member number when the
// payload parses and the signature matches, null otherwise.
export function verifyMemberQrPayload(payload: string): number | null {
  const match = /^vcdc:m:(\d+):([0-9a-f]{16})$/.exec(payload)
  if (!match) return null
  const [, numberText, given] = match
  if (!numberText || !given) return null
  const memberNumber = Number(numberText)
  const expected = memberQrSignature(memberNumber)
  if (expected.length !== given.length) return null
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(given))) return null
  return memberNumber
}
