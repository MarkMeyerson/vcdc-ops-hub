import forge from 'node-forge'
import { PKPass } from 'passkit-generator'
import type { Member } from '@/lib/db/schema'
import { displayDate, tierLabels } from '@/lib/display'
import { buildMemberQrPayload, qrSigningConfigured } from '@/lib/qr/payload'
import { envVar } from '@/lib/env'
import { solidPng } from './png'

// Apple Wallet pass generation, brief Section 6. Generic style (reads like
// a membership card at a shop counter), static by design: no webServiceURL,
// no authenticationToken. expirationDate lets Wallet retire the pass on its
// own, so no pass update service is needed.
//
// Vercel gotcha (Section 6): no writable filesystem. Certificates arrive as
// base64 env vars, are decoded to PEM in memory, and the .pkpass is built
// and streamed as a Buffer. Nothing touches disk.

// Sky blue is the authoritative badge token from brief Section 2 (#89CBE5).
// Section 6 quotes #7EC8E3 for the pass background; the badge token wins as
// the single source of brand truth. Charcoal passes contrast on both blues
// (white does not), so foreground and labels are charcoal.
const SKY_BLUE = '#89CBE5'
const CHARCOAL = '#2B2D2E'

const REQUIRED_ENV = [
  'APPLE_WWDR_CERT_B64',
  'APPLE_PASS_CERT_P12_B64',
  'APPLE_PASS_CERT_PASSWORD',
  'APPLE_PASS_TYPE_ID',
  'APPLE_TEAM_ID',
] as const

export function appleWalletStatus(): {
  configured: boolean
  missing: string[]
} {
  const missing: string[] = REQUIRED_ENV.filter((name) => !envVar(name))
  if (!qrSigningConfigured()) missing.push('QR_SIGNING_SECRET')
  return { configured: missing.length === 0, missing }
}

function rgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgb(${r}, ${g}, ${b})`
}

// Apple ships WWDR as DER (.cer). Accept either DER or PEM base64.
function wwdrToPem(b64: string): string {
  const buffer = Buffer.from(b64, 'base64')
  const text = buffer.toString('utf8')
  if (text.includes('BEGIN CERTIFICATE')) return text
  const asn1 = forge.asn1.fromDer(
    forge.util.createBuffer(buffer.toString('binary'))
  )
  return forge.pki.certificateToPem(forge.pki.certificateFromAsn1(asn1))
}

// The pass signing identity is exported from Keychain as a single .p12.
// passkit-generator wants separate PEM cert and key, so split it here.
function p12ToPem(
  b64: string,
  password: string
): { signerCert: string; signerKey: string } {
  const asn1 = forge.asn1.fromDer(forge.util.decode64(b64))
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, password)

  const certBagOid = forge.pki.oids.certBag!
  const shroudedKeyOid = forge.pki.oids.pkcs8ShroudedKeyBag!
  const keyBagOid = forge.pki.oids.keyBag!

  const certBags = p12.getBags({ bagType: certBagOid })[certBagOid]
  const cert = certBags?.[0]?.cert
  if (!cert) {
    throw new Error('No certificate found in APPLE_PASS_CERT_P12_B64')
  }

  const shrouded = p12.getBags({ bagType: shroudedKeyOid })[shroudedKeyOid]
  const plain = p12.getBags({ bagType: keyBagOid })[keyBagOid]
  const key = shrouded?.[0]?.key ?? plain?.[0]?.key
  if (!key) {
    throw new Error('No private key found in APPLE_PASS_CERT_P12_B64')
  }

  return {
    signerCert: forge.pki.certificateToPem(cert),
    signerKey: forge.pki.privateKeyToPem(key),
  }
}

export async function buildApplePass(member: Member): Promise<Buffer> {
  const status = appleWalletStatus()
  if (!status.configured) {
    throw new Error(
      `Apple Wallet signing is not configured. Missing: ${status.missing.join(', ')}`
    )
  }

  const passJson = {
    formatVersion: 1,
    passTypeIdentifier: envVar('APPLE_PASS_TYPE_ID')!,
    teamIdentifier: envVar('APPLE_TEAM_ID')!,
    organizationName: 'The Vespa Club of D.C., Inc.',
    description: 'VCDC membership card',
    serialNumber: `vcdc-member-${member.memberNumber}`,
    logoText: 'Vespa Club of D.C.',
    backgroundColor: rgb(SKY_BLUE),
    foregroundColor: rgb(CHARCOAL),
    labelColor: rgb(CHARCOAL),
    generic: {
      headerFields: [
        { key: 'header', label: '', value: 'VCDC MEMBER' },
      ],
      primaryFields: [
        {
          key: 'name',
          label: '',
          value: `${member.firstName} ${member.lastName}`,
        },
      ],
      secondaryFields: [
        {
          key: 'memberNumber',
          label: 'MEMBER #',
          value: String(member.memberNumber),
        },
        {
          key: 'tier',
          label: 'TIER',
          value: tierLabels[member.membershipTier],
        },
      ],
      auxiliaryFields: [
        {
          key: 'expires',
          label: 'EXPIRES',
          value: displayDate(member.expiresAt),
        },
      ],
      // Present but empty, filled in a later phase (brief Section 6).
      backFields: [],
    },
  }

  const pass = new PKPass(
    {
      'pass.json': Buffer.from(JSON.stringify(passJson)),
      'icon.png': solidPng(29, 29, SKY_BLUE),
      'icon@2x.png': solidPng(58, 58, SKY_BLUE),
      'icon@3x.png': solidPng(87, 87, SKY_BLUE),
    },
    {
      wwdr: wwdrToPem(envVar('APPLE_WWDR_CERT_B64')!),
      ...p12ToPem(
        envVar('APPLE_PASS_CERT_P12_B64')!,
        envVar('APPLE_PASS_CERT_PASSWORD')!
      ),
    }
  )

  pass.setBarcodes({
    format: 'PKBarcodeFormatQR',
    message: buildMemberQrPayload(member.memberNumber),
    messageEncoding: 'iso-8859-1',
    altText: `Member ${member.memberNumber}`,
  })

  // End of the expiry day, US Eastern. Wallet retires the pass on its own.
  pass.setExpirationDate(new Date(`${member.expiresAt}T23:59:59-05:00`))

  return pass.getAsBuffer()
}
