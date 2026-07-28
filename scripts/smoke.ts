// Wallet and QR smoke test. No database, no network, no real secrets:
// runs the entire signing pipeline in memory using a throwaway self-signed
// certificate. Apple would reject that signature, but every code path we
// own executes for real: payload signing and tamper rejection, download
// token roundtrip, PNG icon structure, p12 and WWDR decoding, pass
// assembly, and the final .pkpass zip.
//
// Usage: npm run smoke   (also runs in CI on every PR)

import forge from 'node-forge'
import {
  buildMemberQrPayload,
  verifyMemberQrPayload,
} from '../src/lib/qr/payload'
import {
  createDownloadToken,
  verifyDownloadToken,
} from '../src/lib/wallet/token'
import { solidPng } from '../src/lib/wallet/png'
import { appleWalletStatus, buildApplePass } from '../src/lib/wallet/apple'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`SMOKE FAIL: ${message}`)
}

async function main() {
  process.env.QR_SIGNING_SECRET = 'a'.repeat(64)

  // 1. QR payload roundtrip and tamper rejection
  const payload = buildMemberQrPayload(10001)
  assert(
    /^vcdc:m:10001:[0-9a-f]{16}$/.test(payload),
    `payload format wrong: ${payload}`
  )
  assert(verifyMemberQrPayload(payload) === 10001, 'payload verify failed')
  const tampered = payload.slice(0, -1) + (payload.endsWith('0') ? '1' : '0')
  assert(verifyMemberQrPayload(tampered) === null, 'tampered payload accepted')
  console.log('payload ok')

  // 2. Download token roundtrip and wrong-member rejection
  const memberId = '2b7f3e28-1111-4a5b-9c3d-abcdefabcdef'
  const token = createDownloadToken(memberId)
  assert(verifyDownloadToken(memberId, token), 'token verify failed')
  assert(
    !verifyDownloadToken('2b7f3e28-2222-4a5b-9c3d-abcdefabcdef', token),
    'token accepted for wrong member'
  )
  console.log('token ok')

  // 3. PNG icon structure
  const png = solidPng(29, 29, '#89CBE5')
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  assert(png.subarray(0, 8).equals(signature), 'bad PNG signature')
  assert(
    png.readUInt32BE(16) === 29 && png.readUInt32BE(20) === 29,
    'bad PNG dimensions'
  )
  console.log('png ok')

  // 4. Full pass build with a throwaway self-signed certificate
  const keys = forge.pki.rsa.generateKeyPair(2048)
  const cert = forge.pki.createCertificate()
  cert.publicKey = keys.publicKey
  cert.serialNumber = '01'
  cert.validity.notBefore = new Date('2026-01-01')
  cert.validity.notAfter = new Date('2036-01-01')
  const attrs = [{ name: 'commonName', value: 'Smoke Test Pass Signing' }]
  cert.setSubject(attrs)
  cert.setIssuer(attrs)
  cert.sign(keys.privateKey, forge.md.sha256.create())

  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], 'testpass', {
    algorithm: '3des',
  })
  process.env.APPLE_PASS_CERT_P12_B64 = Buffer.from(
    forge.asn1.toDer(p12Asn1).getBytes(),
    'binary'
  ).toString('base64')
  process.env.APPLE_PASS_CERT_PASSWORD = 'testpass'
  // WWDR stand-in, DER encoded exactly like Apple ships the real one.
  process.env.APPLE_WWDR_CERT_B64 = Buffer.from(
    forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes(),
    'binary'
  ).toString('base64')
  process.env.APPLE_PASS_TYPE_ID = 'pass.org.vespaclubofdc.member'
  process.env.APPLE_TEAM_ID = 'FAKETEAM01'

  assert(appleWalletStatus().configured, 'status should report configured')

  const pkpass = await buildApplePass({
    id: memberId,
    memberNumber: 10001,
    firstName: 'Test',
    lastName: 'Member',
    email: 'test@example.com',
    phone: null,
    membershipTier: 'lifetime',
    joinedAt: '2026-07-16',
    expiresAt: '2027-07-16',
    createdAt: new Date(),
    updatedAt: new Date(),
  })

  assert(pkpass[0] === 0x50 && pkpass[1] === 0x4b, 'pass output is not a zip')
  const listing = pkpass.toString('latin1')
  for (const name of ['pass.json', 'manifest.json', 'signature', 'icon.png']) {
    assert(listing.includes(name), `zip missing ${name}`)
  }
  console.log(`pkpass ok (${pkpass.length} bytes)`)

  // 5. Missing-var reporting stays accurate
  delete process.env.APPLE_TEAM_ID
  const status = appleWalletStatus()
  assert(
    !status.configured && status.missing.includes('APPLE_TEAM_ID'),
    'missing-var reporting broken'
  )
  console.log('status reporting ok')

  console.log('ALL SMOKE TESTS PASSED')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
