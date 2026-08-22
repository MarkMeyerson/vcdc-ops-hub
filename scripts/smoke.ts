// Wallet and QR smoke test. No database, no network, no real secrets:
// runs the entire signing pipeline in memory using a throwaway self-signed
// certificate. Apple would reject that signature, but every code path we
// own executes for real: payload signing and tamper rejection, download
// token roundtrip, PNG icon structure, p12 and WWDR decoding, pass
// assembly, and the final .pkpass zip.
//
// Usage: npm run smoke   (also runs in CI on every PR)

import { createVerify, generateKeyPairSync } from 'node:crypto'
import forge from 'node-forge'
import type { Member } from '../src/lib/db/schema'
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
import {
  buildGoogleSaveUrl,
  googleObjectId,
  googleWalletStatus,
  readClassId,
} from '../src/lib/wallet/google'
import {
  buildMemberCardPdf,
  memberCardFilename,
  memberCardStatus,
} from '../src/lib/pdf/card'
import { CSV_HEADERS, memberCardUrl, membersCsv } from '../src/lib/member-links'
import {
  FLAG_ORDER,
  FLAG_SPECS,
  reviewRoster,
  type Flag,
} from '../src/lib/member-health'
import { buildTemplate, planImport } from '../src/lib/member-import'
import { isUuid } from '../src/lib/uuid'

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

  // One member record, shared by the Apple pass and the Google save link
  // below, so both wallets are proven to carry the same identity.
  const member: Member = {
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
  }

  const pkpass = await buildApplePass(member)

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


  // 6. Google Wallet save link: real RS256 signature over a real object
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })
  process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_B64 = Buffer.from(
    JSON.stringify({
      client_email: 'smoke@vcdc-smoke.iam.gserviceaccount.com',
      private_key: privateKey,
    })
  ).toString('base64')
  process.env.GOOGLE_WALLET_ISSUER_ID = '3388000000000000000'
  process.env.GOOGLE_WALLET_CLASS_ID = '3388000000000000000.vcdc-member'

  assert(googleWalletStatus().configured, 'google status should be configured')
  assert(
    readClassId() === '3388000000000000000.vcdc-member',
    'class id read wrong'
  )

  const saveUrl = buildGoogleSaveUrl(member)
  const prefix = 'https://pay.google.com/gp/v/save/'
  assert(saveUrl.startsWith(prefix), `save url wrong: ${saveUrl.slice(0, 40)}`)

  const jwt = saveUrl.slice(prefix.length)
  const [headerB64, claimsB64, signatureB64] = jwt.split('.')
  assert(headerB64 && claimsB64 && signatureB64, 'save JWT is not three parts')

  const verified = createVerify('RSA-SHA256')
    .update(`${headerB64}.${claimsB64}`)
    .verify(publicKey, Buffer.from(signatureB64, 'base64url'))
  assert(verified, 'save JWT signature does not verify')

  const claims = JSON.parse(
    Buffer.from(claimsB64, 'base64url').toString('utf8')
  )
  assert(claims.aud === 'google', 'wrong aud')
  assert(claims.typ === 'savetowallet', 'wrong typ')
  assert(claims.iss === 'smoke@vcdc-smoke.iam.gserviceaccount.com', 'wrong iss')

  const object = claims.payload?.genericObjects?.[0]
  assert(object, 'no generic object in save JWT')
  assert(object.id === googleObjectId(10001), 'wrong object id')
  assert(object.classId === readClassId(), 'wrong class id on object')
  assert(
    object.barcode?.value === payload,
    'google barcode is not the member payload'
  )
  assert(object.barcode?.type === 'QR_CODE', 'wrong barcode type')
  assert(object.hexBackgroundColor === '#89CBE5', 'wrong background color')
  assert(object.header?.defaultValue?.value === 'Test Member', 'wrong header')
  assert(
    object.validTimeInterval?.end?.date?.startsWith('2027-07-16'),
    'wrong expiry on google object'
  )
  console.log('google save link ok')

  // 7. A class ID that does not sit under the issuer ID is a named error,
  //    not a silent 404 from Google at save time.
  process.env.GOOGLE_WALLET_CLASS_ID = '9999999999999999999.vcdc-member'
  let rejectedClassId = false
  try {
    readClassId()
  } catch {
    rejectedClassId = true
  }
  assert(rejectedClassId, 'mismatched class id was accepted')

  delete process.env.GOOGLE_WALLET_ISSUER_ID
  assert(
    googleWalletStatus().missing.includes('GOOGLE_WALLET_ISSUER_ID'),
    'google missing-var reporting broken'
  )
  console.log('google status reporting ok')


  // 8. Printable membership card. Needs no vendor account, only the QR
  //    secret, which is why it is the interim credential for iPhone
  //    members while Apple enrollment is pending.
  assert(memberCardStatus().configured, 'card status should be configured')
  const pdf = await buildMemberCardPdf(member)
  assert(
    pdf.subarray(0, 5).toString('latin1') === '%PDF-',
    'card output is not a PDF'
  )
  assert(pdf.length > 2000, `card PDF suspiciously small: ${pdf.length} bytes`)
  assert(
    pdf.toString('latin1').includes('/Image'),
    'card PDF has no embedded QR image'
  )
  console.log(`member card ok (${pdf.length} bytes)`)

  const savedSecret = process.env.QR_SIGNING_SECRET
  delete process.env.QR_SIGNING_SECRET
  assert(
    memberCardStatus().missing.includes('QR_SIGNING_SECRET'),
    'card missing-var reporting broken'
  )
  process.env.QR_SIGNING_SECRET = savedSecret
  console.log('card status reporting ok')


  // 9. Card filename. Members save this to a phone, so the surname has to
  //    be in it, and it has to survive punctuation and accents intact.
  assert(
    memberCardFilename(member) === 'vcdc-member-10001-member.pdf',
    `unexpected filename: ${memberCardFilename(member)}`
  )
  assert(
    memberCardFilename({ ...member, memberNumber: 24037, lastName: 'Di Maggio' }) ===
      'vcdc-member-24037-di-maggio.pdf',
    'spaces in a surname should become hyphens'
  )
  assert(
    memberCardFilename({ ...member, memberNumber: 24005, lastName: "O'Brien-Ryan" }) ===
      'vcdc-member-24005-o-brien-ryan.pdf',
    'punctuation in a surname should collapse to hyphens'
  )
  assert(
    memberCardFilename({ ...member, memberNumber: 25096, lastName: 'Togliàtti' }) ===
      'vcdc-member-25096-togliatti.pdf',
    'accents should be folded, not dropped with the letter'
  )
  console.log('card filename ok')


  // 10. Mail merge CSV. This is the file the club sends members their cards
  //     from, so a broken quote or a missing link is 96 emails gone wrong.
  process.env.NEXT_PUBLIC_APP_URL = 'https://example.org/'
  const csv = membersCsv([
    member,
    { ...member, id: '9c1d4a70-2222-4e6f-8b1a-fedcbafedcba', memberNumber: 24001, firstName: 'Ana', lastName: 'Marie "Nina" Diaz' },
  ])
  const csvLines = csv.split('\r\n')
  assert(csv.charCodeAt(0) === 0xfeff, 'CSV needs a BOM for Excel')
  assert(
    csvLines[0] === `﻿${CSV_HEADERS.join(',')}`,
    `unexpected CSV header: ${csvLines[0]}`
  )
  assert(
    csvLines[1]?.includes(`https://example.org/card/${memberId}`) === true,
    'CSV row is missing the card link, or the trailing slash was not trimmed'
  )
  assert(
    csvLines[2]?.includes('"Marie ""Nina"" Diaz"') === true,
    'CSV does not escape quotes inside a name'
  )
  assert(csvLines.length === 4, `expected 2 rows and a trailing newline, got ${csvLines.length - 1}`)

  const savedAppUrl = process.env.NEXT_PUBLIC_APP_URL
  delete process.env.NEXT_PUBLIC_APP_URL
  assert(
    memberCardUrl(member) === null,
    'card URL should be null without NEXT_PUBLIC_APP_URL, never a relative string'
  )
  process.env.NEXT_PUBLIC_APP_URL = savedAppUrl
  console.log('member links CSV ok')


  // 11. Roster review. The admin dashboard decides what needs a human from
  //     these rules, so a wrong one either hides a broken record or sends
  //     someone chasing a member who is fine.
  const today = '2026-08-22'
  const base = { ...member, email: 'someone@example.com', phone: '202-555-0100' }

  const roster: Member[] = [
    // Healthy: full record, current membership, real-looking number.
    { ...base, id: 'a0000000-0000-4000-8000-000000000001', memberNumber: 24001, firstName: 'Fine', lastName: 'Member', membershipTier: 'regular', joinedAt: '2024-03-04', expiresAt: '2026-12-31' },
    // Imported from the sheet: no email, January placeholder join date.
    { ...base, id: 'a0000000-0000-4000-8000-000000000002', memberNumber: 24002, firstName: 'Sheet', lastName: 'Import', email: null, phone: null, membershipTier: 'regular', joinedAt: '2024-01-01', expiresAt: '2026-12-31' },
    // Test row left from setup: number is below the club's YYnnn scheme.
    { ...base, id: 'a0000000-0000-4000-8000-000000000003', memberNumber: 10001, firstName: 'Test', lastName: 'Row', membershipTier: 'regular', joinedAt: '2026-07-16', expiresAt: '2027-07-16' },
    // Lapsed.
    { ...base, id: 'a0000000-0000-4000-8000-000000000004', memberNumber: 24004, firstName: 'Lapsed', lastName: 'Rider', membershipTier: 'regular', joinedAt: '2024-05-05', expiresAt: '2026-06-30' },
    // Renewing inside the window.
    { ...base, id: 'a0000000-0000-4000-8000-000000000005', memberNumber: 24005, firstName: 'Renewing', lastName: 'Rider', membershipTier: 'regular', joinedAt: '2024-05-05', expiresAt: '2026-10-02' },
    // Dates contradict each other.
    { ...base, id: 'a0000000-0000-4000-8000-000000000006', memberNumber: 24006, firstName: 'Backwards', lastName: 'Dates', membershipTier: 'regular', joinedAt: '2027-01-01', expiresAt: '2026-12-31' },
    // Tier says never lapses, date says next month.
    { ...base, id: 'a0000000-0000-4000-8000-000000000007', memberNumber: 24007, firstName: 'Forever', lastName: 'Member', membershipTier: 'lifetime', joinedAt: '2024-01-15', expiresAt: '2026-09-30' },
    // Two rows, one name, two numbers.
    { ...base, id: 'a0000000-0000-4000-8000-000000000008', memberNumber: 25008, firstName: 'Jason', lastName: 'Estrada', membershipTier: 'regular', joinedAt: '2025-02-02', expiresAt: '2026-12-31' },
    { ...base, id: 'a0000000-0000-4000-8000-000000000009', memberNumber: 26009, firstName: 'Jason', lastName: 'Estrada', membershipTier: 'regular', joinedAt: '2026-02-02', expiresAt: '2026-12-31' },
  ]

  const review = reviewRoster(roster, today)

  const numbersWith = (flag: Flag) =>
    review.byFlag[flag].map((m) => m.memberNumber).sort((a, b) => a - b)

  const sameNumbers = (flag: Flag, expected: number[]) =>
    JSON.stringify(numbersWith(flag)) === JSON.stringify(expected)

  assert(review.total === 9, 'review should count the whole roster')
  assert(
    !review.flaggedMembers.some((f) => f.member.memberNumber === 24001),
    'a member with a full record and a current membership should not be flagged'
  )
  assert(sameNumbers('expiry-before-joined', [24006]), 'backwards dates missed')
  assert(sameNumbers('number-out-of-scheme', [10001]), 'test row not caught')
  assert(sameNumbers('permanent-tier-expires', [24007]), 'lifetime expiry missed')
  assert(sameNumbers('duplicate-name', [25008, 26009]), 'duplicate names missed')
  assert(sameNumbers('expired', [24004]), 'expired detection wrong')
  // 24007 belongs here as well as in the problem list: its date really is
  // imminent, whatever its tier claims.
  assert(
    sameNumbers('expiring-soon', [24005, 24007]),
    `expiring-soon window wrong: ${numbersWith('expiring-soon')}`
  )
  assert(sameNumbers('no-email', [24002]), 'missing email detection wrong')
  assert(
    sameNumbers('placeholder-joined', [24002]),
    'January placeholder should only flag when the email is missing too'
  )

  // Expired and expiring-soon are exclusive: a lapsed member is not also
  // about to lapse, and showing them in both lists double-counts the work.
  assert(
    !review.byFlag['expiring-soon'].some((m) => m.expiresAt < today),
    'an expired member should not also count as expiring soon'
  )

  // Counts are of people. 24007 carries two problems and must count once.
  const problemPeople = new Set(
    review.flaggedMembers
      .filter((f) => f.flags.some((flag) => FLAG_SPECS[flag].kind === 'problem'))
      .map((f) => f.member.memberNumber)
  )
  assert(
    review.countsByKind.problem === problemPeople.size,
    `problem count should be people not findings: ${review.countsByKind.problem} vs ${problemPeople.size}`
  )
  assert(
    review.countsByKind.problem === 5,
    `expected 5 members with problems, got ${review.countsByKind.problem}`
  )

  // Every flag that can be raised has a spec, or the page renders blanks.
  for (const flag of FLAG_ORDER) {
    assert(FLAG_SPECS[flag]?.label, `flag ${flag} has no spec`)
  }
  console.log('roster review ok')


  // 12. Bulk update round trip. This writes to the whole roster at once, so
  //     the rules that keep it safe are worth pinning: blanks leave values
  //     alone, and any error rejects the entire file.
  const importRoster: Member[] = [
    { ...base, id: 'b0000000-0000-4000-8000-000000000001', memberNumber: 24001, firstName: 'David', lastName: 'Mangano', email: null, phone: null, membershipTier: 'regular', joinedAt: '2024-01-01', expiresAt: '2026-12-31' },
    { ...base, id: 'b0000000-0000-4000-8000-000000000002', memberNumber: 24002, firstName: 'Ana', lastName: 'Marie Diaz', email: 'ana@example.com', phone: null, membershipTier: 'regular', joinedAt: '2024-01-01', expiresAt: '2026-12-31' },
  ]

  // The template is what the club edits, so it must round trip unchanged.
  const template = buildTemplate(importRoster)
  const untouched = planImport(template, importRoster)
  assert(untouched.errors.length === 0, 'the template should read cleanly')
  assert(
    untouched.changes.length === 0,
    'downloading and re-uploading the template unchanged should change nothing'
  )
  assert(untouched.unchangedRows === 2, 'both rows should be seen')

  // A partly filled sheet: one email added, one name corrected, one date in
  // the format Excel produces, and blanks everywhere else.
  const filled = [
    'member_number,first_name,last_name,email,phone,tier,joined,expires',
    '24001,David,Mangano,david@example.com,,,3/4/2024,',
    '24002,Ana,Diaz,,202-555-0143,lifetime,,',
  ].join('\r\n')

  const plan = planImport(filled, importRoster)
  assert(plan.errors.length === 0, `unexpected errors: ${JSON.stringify(plan.errors)}`)
  assert(plan.changes.length === 2, `expected 2 members changed, got ${plan.changes.length}`)

  const first = plan.changes.find((c) => c.memberNumber === 24001)
  const changed = (row: typeof first, field: string) =>
    row?.changes.find((c) => c.field === field)

  assert(changed(first, 'email')?.to === 'david@example.com', 'email not picked up')
  assert(changed(first, 'joinedAt')?.to === '2024-03-04', 'US date not converted to ISO')
  assert(
    !changed(first, 'expiresAt') && !changed(first, 'phone'),
    'a blank cell must leave the current value alone, not clear it'
  )
  assert(
    !changed(first, 'firstName') && !changed(first, 'lastName'),
    'an unchanged name should not be reported as a change'
  )

  const second = plan.changes.find((c) => c.memberNumber === 24002)
  assert(changed(second, 'lastName')?.to === 'Diaz', 'name correction missed')
  assert(changed(second, 'lastName')?.from === 'Marie Diaz', 'previous value wrong')
  assert(changed(second, 'membershipTier')?.to === 'lifetime', 'tier change missed')
  assert(
    !changed(second, 'email'),
    'a blank email must not clear an address that is already on file'
  )

  // Every rejection path. Each of these must stop the whole file.
  const rejected: [string, string][] = [
    ['24001,,,not-an-email,,,,', 'a bad email'],
    ['24001,,,,,platinum,,', 'an unknown tier'],
    ['24001,,,,,,,31/12/2026', 'an unreadable date'],
    ['24001,,,,,,,2026-02-31', 'a date that does not exist'],
    ['24001,,,,,,2027-01-01,2026-12-31', 'joined after expires'],
    ['99999,,,,,,,', 'a member number that does not exist'],
    ['notanumber,,,,,,,', 'a member number that is not a number'],
    ['24001,,,,,,,\r\n24001,,,,,,,', 'the same member twice'],
  ]
  for (const [row, description] of rejected) {
    const bad = planImport(
      `member_number,first_name,last_name,email,phone,tier,joined,expires\r\n${row}`,
      importRoster
    )
    assert(bad.errors.length > 0, `${description} should be rejected`)
    assert(
      bad.changes.length === 0,
      `${description} must reject the whole file, not just its own row`
    )
  }

  // An address already on another member would break the unique index, and
  // the raw database error would name a constraint rather than a person.
  const collision = planImport(
    'member_number,email\r\n24001,ana@example.com',
    importRoster
  )
  assert(
    collision.errors[0]?.message.includes('Ana'),
    'an email taken by another member should name that member'
  )

  // Two rows claiming one address fails the same way, before the database
  // sees it.
  const doubleAssigned = planImport(
    'member_number,email\r\n24001,shared@example.com\r\n24002,shared@example.com',
    importRoster
  )
  assert(
    doubleAssigned.errors.length > 0 && doubleAssigned.changes.length === 0,
    'one address on two members should be rejected'
  )

  // Two members swapping addresses is a correction somebody will make (the
  // roster has couples on it), and the end state is valid, so it must not be
  // rejected as a duplicate.
  const swapRoster: Member[] = [
    { ...importRoster[0]!, email: 'his@example.com' },
    { ...importRoster[1]!, email: 'hers@example.com' },
  ]
  const swap = planImport(
    'member_number,email\r\n24001,hers@example.com\r\n24002,his@example.com',
    swapRoster
  )
  assert(
    swap.errors.length === 0,
    `swapping two addresses should be allowed: ${JSON.stringify(swap.errors)}`
  )
  assert(swap.changes.length === 2, 'both sides of a swap should change')

  // Taking an address from somebody who is keeping it is still a collision.
  const steal = planImport(
    'member_number,email\r\n24001,hers@example.com',
    swapRoster
  )
  assert(
    steal.errors.length === 1 && steal.changes.length === 0,
    'taking an address nobody is releasing should still be rejected'
  )

  // A file that is not the template at all.
  const wrongFile = planImport('name,notes\r\nSomebody,hello', importRoster)
  assert(
    wrongFile.errors[0]?.message.includes('member_number'),
    'a file without member_number should say so'
  )
  console.log('bulk update ok')


  // 13. Member id validation. These ids arrive from links members were
  //     emailed, so they turn up truncated by mail clients and hand-retyped.
  //     A loose check reaches a uuid comparison, which raises in Postgres
  //     rather than returning no rows, and the friendly "we do not recognise
  //     that link" page becomes a 500.
  assert(isUuid('2b7f3e28-1111-4a5b-9c3d-abcdefabcdef'), 'a real uuid was rejected')
  assert(isUuid('2B7F3E28-1111-4A5B-9C3D-ABCDEFABCDEF'), 'uppercase uuid rejected')
  for (const bad of [
    '------------------------------------', // 36 hyphens
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', // 36 hex, no dashes
    '2b7f3e28-1111-4a5b-9c3d-abcdefabcde', // one short
    '2b7f3e28-1111-4a5b-9c3d-abcdefabcdefa', // one long
    '2b7f3e28_1111_4a5b_9c3d_abcdefabcdef', // underscores
    '2b7f3e28-1111-4a5b-9c3d-abcdefabcdeg', // g is not hex
    '',
  ]) {
    assert(!isUuid(bad), `${JSON.stringify(bad)} should not pass as a member id`)
  }
  console.log('member id validation ok')

  console.log('ALL SMOKE TESTS PASSED')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
