// Apple Wallet pass-signing certificate, without a Mac.
//
// WALLET-SETUP.md step A3 assumes Keychain Access. This does the same
// three things with node-forge (already a dependency via passkit-generator)
// so it runs anywhere Node runs, and repeats cleanly for the yearly
// renewal:
//
//   npm run apple:csr
//     Generates a private key and a certificate signing request into
//     ./apple-cert/. Upload the .csr to developer.apple.com, download
//     pass.cer into the same folder.
//
//   npm run apple:p12
//     Bundles the key and pass.cer into a password-protected .p12, checks
//     that the certificate actually matches the key and was issued by
//     Apple's WWDR CA, and prints every APPLE_* Vercel value ready to
//     paste. The Team ID and Pass Type ID are read out of the certificate
//     itself, so the enrollment-ID-vs-Team-ID trap in the doc cannot bite.
//
// Nothing here is committed: ./apple-cert/ is gitignored, and the private
// key never leaves that folder except inside the base64 you paste into
// Vercel.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import forge from 'node-forge'

const DIR = join(process.cwd(), 'apple-cert')
const KEY_FILE = join(DIR, 'pass-signing.key.pem')
const CSR_FILE = join(DIR, 'pass-signing.csr')
const CER_FILE = join(DIR, 'pass.cer')
const WWDR_FILE = join(DIR, 'AppleWWDRCAG4.cer')
const P12_FILE = join(DIR, 'pass-signing.p12')

const WWDR_URL = 'https://www.apple.com/certificateauthority/AppleWWDRCAG4.cer'

// Apple puts the Pass Type ID in the subject's userID attribute (RFC 1274
// UID). node-forge has no name for that OID, so look it up by number and
// teach forge the name so subjects print readably in error messages.
const OID_UID = '0.9.2342.19200300.100.1.1'
const OID_OU = '2.5.4.11'
forge.pki.oids[OID_UID] = 'userID'
forge.pki.oids.userID = OID_UID

function fail(message: string): never {
  console.error(`\n${message}\n`)
  process.exit(1)
}

// Apple serves .cer as DER; a hand-converted file may be PEM. Take both.
function readCertificate(path: string): forge.pki.Certificate {
  const raw = readFileSync(path)
  const text = raw.toString('utf8')
  if (text.includes('BEGIN CERTIFICATE')) {
    return forge.pki.certificateFromPem(text)
  }
  const asn1 = forge.asn1.fromDer(forge.util.createBuffer(raw.toString('binary')))
  return forge.pki.certificateFromAsn1(asn1)
}

function subjectField(
  cert: forge.pki.Certificate,
  oid: string
): string | undefined {
  const attr = cert.subject.attributes.find((a) => a.type === oid)
  return typeof attr?.value === 'string' ? attr.value : undefined
}

function csr() {
  if (existsSync(KEY_FILE)) {
    fail(
      `${KEY_FILE} already exists.\n` +
        'If you are renewing, move or delete the old apple-cert folder first ' +
        'so the old key cannot be mixed up with the new certificate.'
    )
  }
  mkdirSync(DIR, { recursive: true })

  console.log('Generating a 2048-bit RSA key (a few seconds)...')
  const keys = forge.pki.rsa.generateKeyPair({ bits: 2048 })

  const request = forge.pki.createCertificationRequest()
  request.publicKey = keys.publicKey
  request.setSubject([
    { name: 'commonName', value: 'VCDC Pass Signing' },
    { name: 'organizationName', value: 'The Vespa Club of D.C., Inc.' },
    { name: 'countryName', value: 'US' },
  ])
  request.sign(keys.privateKey, forge.md.sha256.create())

  writeFileSync(KEY_FILE, forge.pki.privateKeyToPem(keys.privateKey), {
    mode: 0o600,
  })
  writeFileSync(CSR_FILE, forge.pki.certificationRequestToPem(request))

  console.log(`
Wrote:
  ${KEY_FILE}   (private key: never share, never commit)
  ${CSR_FILE}

Next, on https://developer.apple.com/account/resources/certificates/add
  1. Under Services choose "Pass Type ID Certificate", Continue.
  2. Pick the Pass Type ID (pass.org.vespaclubofdc.member), then upload
     ${CSR_FILE}
  3. Download the result and save it as
     ${CER_FILE}

Then run:  npm run apple:p12
`)
}

async function fetchWwdr(): Promise<void> {
  if (existsSync(WWDR_FILE)) return
  console.log(`Downloading Apple WWDR G4 intermediate from ${WWDR_URL} ...`)
  const response = await fetch(WWDR_URL)
  if (!response.ok) {
    fail(
      `Could not download the WWDR certificate (HTTP ${response.status}).\n` +
        `Download it by hand from https://www.apple.com/certificateauthority/\n` +
        `("Worldwide Developer Relations - G4") and save it as ${WWDR_FILE}`
    )
  }
  writeFileSync(WWDR_FILE, Buffer.from(await response.arrayBuffer()))
}

async function p12() {
  if (!existsSync(KEY_FILE)) fail(`No key at ${KEY_FILE}. Run: npm run apple:csr`)
  if (!existsSync(CER_FILE)) {
    fail(
      `No certificate at ${CER_FILE}.\n` +
        'Download the Pass Type ID certificate from developer.apple.com and ' +
        'save it there (the download is usually named pass.cer).'
    )
  }
  await fetchWwdr()

  const privateKey = forge.pki.privateKeyFromPem(readFileSync(KEY_FILE, 'utf8'))
  const cert = readCertificate(CER_FILE)
  const wwdr = readCertificate(WWDR_FILE)

  // The certificate must be for the key we generated. A mismatch here is
  // the "I uploaded an old CSR" mistake, and it would otherwise surface as
  // an unreadable pass on a member's phone.
  const certKey = cert.publicKey as forge.pki.rsa.PublicKey
  if (certKey.n.compareTo(privateKey.n) !== 0) {
    fail(
      'pass.cer was not issued for the key in apple-cert/. ' +
        'Re-run npm run apple:csr, upload the NEW .csr, download again.'
    )
  }

  // And it must be Apple-issued, chaining to the WWDR intermediate.
  try {
    if (!wwdr.verify(cert)) throw new Error('signature mismatch')
  } catch (error) {
    fail(
      `pass.cer is not signed by the WWDR G4 certificate (${String(error)}).\n` +
        'Confirm you downloaded a Pass Type ID certificate, not a development ' +
        'or distribution certificate, and that AppleWWDRCAG4.cer is the G4 file.'
    )
  }

  const passTypeId = subjectField(cert, OID_UID)
  const teamId = subjectField(cert, OID_OU)
  if (!passTypeId?.startsWith('pass.') || !teamId) {
    const subject = cert.subject.attributes
      .map((a) => `${a.shortName ?? a.name ?? a.type}=${String(a.value)}`)
      .join(', ')
    fail(
      'This certificate does not look like a Pass Type ID certificate ' +
        `(subject: ${subject}).`
    )
  }

  const password = forge.util.bytesToHex(forge.random.getBytesSync(16))
  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(privateKey, [cert], password, {
    algorithm: '3des',
    friendlyName: `Pass Type ID: ${passTypeId}`,
  })
  const p12Der = forge.asn1.toDer(p12Asn1).getBytes()
  writeFileSync(P12_FILE, Buffer.from(p12Der, 'binary'), { mode: 0o600 })

  const p12B64 = Buffer.from(p12Der, 'binary').toString('base64')
  const wwdrB64 = readFileSync(WWDR_FILE).toString('base64')

  console.log(`
Certificate checks passed.
  Pass Type ID : ${passTypeId}
  Team ID      : ${teamId}
  Valid until  : ${cert.validity.notAfter.toISOString().slice(0, 10)}  <-- calendar reminder one month before

Wrote ${P12_FILE}

Paste these into Vercel (project vcdc-ops-hub, Settings, Environment
Variables, scope Production and Preview), then Redeploy:

APPLE_TEAM_ID=${teamId}
APPLE_PASS_TYPE_ID=${passTypeId}
APPLE_PASS_CERT_PASSWORD=${password}
APPLE_WWDR_CERT_B64=${wwdrB64}
APPLE_PASS_CERT_P12_B64=${p12B64}

QR_SIGNING_SECRET must already be set (it is, if the PDF cards work).
`)
}

const command = process.argv[2]
if (command === 'csr') csr()
else if (command === 'p12') void p12()
else fail('Usage: npm run apple:csr   or   npm run apple:p12')
