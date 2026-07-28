import { createHmac, timingSafeEqual } from 'node:crypto'

// Signed expiring token guarding GET /api/wallet/apple/[memberId], brief
// Section 6: pass downloads must not be enumerable by walking member IDs.
// Format: "{expiresEpochSeconds}.{hmac}" where the HMAC covers the member
// id and expiry, keyed with QR_SIGNING_SECRET (one secret for the whole QR
// and wallet surface; rotating it invalidates outstanding links, which the
// README documents). The "wallet-download:" prefix keeps this HMAC domain
// separate from the pass barcode signature.

const TOKEN_TTL_DAYS = 30
const MAC_LENGTH = 32

function secret(): string {
  const value = process.env.QR_SIGNING_SECRET
  if (!value) {
    throw new Error('QR_SIGNING_SECRET is not set')
  }
  return value
}

function mac(memberId: string, expires: number): string {
  return createHmac('sha256', secret())
    .update(`wallet-download:${memberId}:${expires}`)
    .digest('hex')
    .slice(0, MAC_LENGTH)
}

export function createDownloadToken(memberId: string): string {
  const expires =
    Math.floor(Date.now() / 1000) + TOKEN_TTL_DAYS * 24 * 60 * 60
  return `${expires}.${mac(memberId, expires)}`
}

export function verifyDownloadToken(
  memberId: string,
  token: string | null
): boolean {
  if (!token) return false
  const match = /^(\d{1,12})\.([0-9a-f]{32})$/.exec(token)
  if (!match) return false
  const [, expiresText, given] = match
  if (!expiresText || !given) return false
  const expires = Number(expiresText)
  if (expires * 1000 < Date.now()) return false
  const expected = mac(memberId, expires)
  return timingSafeEqual(Buffer.from(expected), Buffer.from(given))
}
