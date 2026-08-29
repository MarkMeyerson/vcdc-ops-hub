// Parsing a scanned code, with no verification and no Node crypto.
//
// Split out from resolve.ts so the browser can use it. The signing secret
// must never reach a leader's phone, so the offline path cannot compute an
// HMAC; it parses the payload here and compares the signature it read
// against the one the server precomputed and shipped in the roster.
//
// Payload shapes, brief Section 5:
//   member  vcdc:m:{member_number}:{sig}
//   guest   vcdc:g:{guest_number}:{qr_token}

const MEMBER_QR = /^vcdc:m:(\d+):([0-9a-f]{16})$/
const GUEST_QR = /^vcdc:g:(\d+):([A-Za-z0-9_-]{16,128})$/

export type ParsedScan =
  | { kind: 'member'; memberNumber: number; signature: string }
  | { kind: 'guest'; guestNumber: string; qrToken: string }
  | { kind: 'not-ours' }

export function parseScan(raw: string): ParsedScan {
  const trimmed = raw.trim()

  const member = MEMBER_QR.exec(trimmed)
  if (member) {
    const [, numberText, signature] = member
    if (numberText && signature) {
      return { kind: 'member', memberNumber: Number(numberText), signature }
    }
  }

  const guest = GUEST_QR.exec(trimmed)
  if (guest) {
    const [, guestNumber, qrToken] = guest
    if (guestNumber && qrToken) return { kind: 'guest', guestNumber, qrToken }
  }

  // A code shaped like ours but unreadable is still ours: "vcdc:m:" with a
  // mangled signature is a stale card, not a stranger's QR, and the leader
  // needs to tell those apart because the rider will insist it is their
  // card and they will be right.
  if (trimmed.startsWith('vcdc:m:') || trimmed.startsWith('vcdc:g:')) {
    return { kind: 'not-ours' }
  }

  return { kind: 'not-ours' }
}

// True when the code claims to be one of ours, whatever state it is in.
export function looksLikeOurs(raw: string): boolean {
  return raw.trim().startsWith('vcdc:')
}

// Constant-ish time compare. Not defending a secret here (the signature is
// public once it is printed on a card), only avoiding an early-exit compare
// out of habit.
export function signaturesMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

// Displayed guest number, brief Section 4: G00001.
export function formatGuestNumber(guestNumber: string | number): string {
  return `G${String(guestNumber).padStart(5, '0')}`
}
