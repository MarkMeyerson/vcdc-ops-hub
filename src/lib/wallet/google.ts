import { createSign } from 'node:crypto'
import type { Member } from '@/lib/db/schema'
import { appOrigin, displayDate, tierLabels } from '@/lib/display'
import { buildMemberQrPayload, qrSigningConfigured } from '@/lib/qr/payload'
import { envVar } from '@/lib/env'

// Google Wallet pass generation, brief Section 6. Generic class and generic
// object carrying the same fields and the same signed QR payload as the
// Apple pass, so one scanner path in Slice 5 handles both wallets.
//
// Distribution is a "Save to Google Wallet" link: a JWT signed with the
// service account key, containing the whole object inline. Google creates
// the object on first save and updates it on later saves, so member create
// and renew need no REST round trip. Only the class is created ahead of
// time, once, by scripts/google-wallet-class.ts.
//
// Like the Apple certificates, the service account JSON arrives as a base64
// environment variable and is decoded in memory. Vercel has no writable
// filesystem and the key must never sit on disk.

const SKY_BLUE = '#89CBE5'

const SAVE_URL_PREFIX = 'https://pay.google.com/gp/v/save/'

const REQUIRED_ENV = [
  'GOOGLE_WALLET_SERVICE_ACCOUNT_B64',
  'GOOGLE_WALLET_ISSUER_ID',
  'GOOGLE_WALLET_CLASS_ID',
] as const

export type ServiceAccount = {
  clientEmail: string
  privateKey: string
}

export function googleWalletStatus(): {
  configured: boolean
  missing: string[]
} {
  const missing: string[] = REQUIRED_ENV.filter((name) => !envVar(name))
  if (!qrSigningConfigured()) missing.push('QR_SIGNING_SECRET')
  return { configured: missing.length === 0, missing }
}

// The service account JSON downloaded from Google Cloud, base64 encoded so
// it survives as a single-line environment variable. Only two of its fields
// matter here: the issuer identity and the signing key.
export function readServiceAccount(): ServiceAccount {
  const b64 = envVar('GOOGLE_WALLET_SERVICE_ACCOUNT_B64')
  if (!b64) {
    throw new Error('GOOGLE_WALLET_SERVICE_ACCOUNT_B64 is not set')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))
  } catch {
    throw new Error(
      'GOOGLE_WALLET_SERVICE_ACCOUNT_B64 is not valid base64-encoded JSON. Re-encode the whole service account file, see WALLET-SETUP.md.'
    )
  }

  const record = parsed as Record<string, unknown>
  const clientEmail = record.client_email
  const privateKey = record.private_key
  if (typeof clientEmail !== 'string' || typeof privateKey !== 'string') {
    throw new Error(
      'GOOGLE_WALLET_SERVICE_ACCOUNT_B64 decoded but has no client_email or private_key. It should be the service account key file, not the issuer profile.'
    )
  }

  return { clientEmail, privateKey }
}

// Class IDs are always "{issuerId}.{suffix}". Catching a mismatch here turns
// a silent Google 404 at save time into a named configuration error.
export function readClassId(): string {
  const issuerId = envVar('GOOGLE_WALLET_ISSUER_ID')
  const classId = envVar('GOOGLE_WALLET_CLASS_ID')
  if (!issuerId) throw new Error('GOOGLE_WALLET_ISSUER_ID is not set')
  if (!classId) throw new Error('GOOGLE_WALLET_CLASS_ID is not set')
  if (!classId.startsWith(`${issuerId}.`)) {
    throw new Error(
      `GOOGLE_WALLET_CLASS_ID must start with "${issuerId}." (the issuer ID), got "${classId}".`
    )
  }
  return classId
}

function localized(value: string) {
  return { defaultValue: { language: 'en-US', value } }
}

// Stable per member, so saving the same pass twice updates it rather than
// creating a duplicate in the member's wallet.
export function googleObjectId(memberNumber: number): string {
  return `${envVar('GOOGLE_WALLET_ISSUER_ID')}.vcdc-member-${memberNumber}`
}

// The generic class. Shared shape for every member pass, created once by
// npm run google:class. Exported so the script and any future patch share
// one definition.
export function buildGoogleClass(classId: string) {
  return {
    id: classId,
    // Passes carry no server-side updates, matching the static Apple pass.
    enableSmartTap: false,
  }
}

export function buildGoogleObject(member: Member) {
  return {
    id: googleObjectId(member.memberNumber),
    classId: readClassId(),
    state: 'ACTIVE',
    hexBackgroundColor: SKY_BLUE,
    cardTitle: localized('Vespa Club of D.C.'),
    subheader: localized('VCDC MEMBER'),
    header: localized(`${member.firstName} ${member.lastName}`),
    textModulesData: [
      {
        id: 'member_number',
        header: 'MEMBER #',
        body: String(member.memberNumber),
      },
      {
        id: 'tier',
        header: 'TIER',
        body: tierLabels[member.membershipTier],
      },
      {
        id: 'expires',
        header: 'EXPIRES',
        body: displayDate(member.expiresAt),
      },
    ],
    barcode: {
      type: 'QR_CODE',
      value: buildMemberQrPayload(member.memberNumber),
      alternateText: `Member ${member.memberNumber}`,
    },
    // End of the expiry day, US Eastern, matching the Apple expirationDate.
    // Google greys the pass out on its own once this passes.
    validTimeInterval: {
      end: { date: `${member.expiresAt}T23:59:59.000-05:00` },
    },
  }
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

// Save to Google Wallet link, brief Section 6. The JWT is signed RS256 with
// the service account key. Signing directly with node:crypto keeps the
// request path dependency-free; google-auth-library is only needed by the
// class script, which runs on a workstation rather than on Vercel.
export function buildGoogleSaveUrl(member: Member): string {
  const status = googleWalletStatus()
  if (!status.configured) {
    throw new Error(
      `Google Wallet is not configured. Missing: ${status.missing.join(', ')}`
    )
  }

  const { clientEmail, privateKey } = readServiceAccount()
  const origin = appOrigin()

  const claims = {
    iss: clientEmail,
    aud: 'google',
    typ: 'savetowallet',
    iat: Math.floor(Date.now() / 1000),
    ...(origin ? { origins: [origin] } : {}),
    payload: { genericObjects: [buildGoogleObject(member)] },
  }

  const signingInput = `${base64url(
    JSON.stringify({ alg: 'RS256', typ: 'JWT' })
  )}.${base64url(JSON.stringify(claims))}`

  const signature = createSign('RSA-SHA256')
    .update(signingInput)
    .sign(privateKey)

  return `${SAVE_URL_PREFIX}${signingInput}.${base64url(signature)}`
}
