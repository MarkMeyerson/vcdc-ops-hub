// Creates the Google Wallet generic class, once, idempotently.
//
// Every member pass points at one shared class. Google needs it to exist
// before any pass can be saved, and it never changes per member, so this
// runs on a workstation rather than in the app (brief Section 6).
//
// Usage: npm run google:class
// Reads GOOGLE_WALLET_SERVICE_ACCOUNT_B64, GOOGLE_WALLET_ISSUER_ID, and
// GOOGLE_WALLET_CLASS_ID from .env.local. Safe to run repeatedly: it
// creates the class if missing and updates it if it already exists.

import { GoogleAuth } from 'google-auth-library'
import {
  buildGoogleClass,
  googleWalletStatus,
  readClassId,
  readServiceAccount,
} from '../src/lib/wallet/google'

const BASE_URL = 'https://walletobjects.googleapis.com/walletobjects/v1'
const SCOPE = 'https://www.googleapis.com/auth/wallet_object.issuer'

async function main(): Promise<void> {
  // QR_SIGNING_SECRET is irrelevant to the class, which carries no member
  // data, so it is not required here even though the shared status check
  // reports it.
  const missing = googleWalletStatus().missing.filter(
    (name) => name !== 'QR_SIGNING_SECRET'
  )
  if (missing.length > 0) {
    console.error(
      `Cannot create the class. Missing in .env.local: ${missing.join(', ')}`
    )
    console.error('See WALLET-SETUP.md for where each value comes from.')
    process.exit(1)
  }

  const classId = readClassId()
  const { clientEmail, privateKey } = readServiceAccount()

  const auth = new GoogleAuth({
    credentials: { client_email: clientEmail, private_key: privateKey },
    scopes: [SCOPE],
  })
  const client = await auth.getClient()
  const body = buildGoogleClass(classId)

  // Does it exist already? A 404 here is the normal first-run answer.
  let exists = false
  try {
    await client.request({ url: `${BASE_URL}/genericClass/${classId}` })
    exists = true
  } catch (err) {
    const httpStatus = (err as { response?: { status?: number } }).response
      ?.status
    if (httpStatus !== 404) throw err
  }

  if (exists) {
    await client.request({
      url: `${BASE_URL}/genericClass/${classId}`,
      method: 'PUT',
      data: body,
    })
    console.log(`Class ${classId} already existed, updated in place.`)
  } else {
    await client.request({
      url: `${BASE_URL}/genericClass`,
      method: 'POST',
      data: body,
    })
    console.log(`Class ${classId} created.`)
  }

  console.log('Members can now save passes to Google Wallet.')
}

main().catch((err: unknown) => {
  const response = (err as { response?: { data?: unknown } }).response
  if (response?.data) {
    console.error('Google rejected the request:')
    console.error(JSON.stringify(response.data, null, 2))
  } else {
    console.error(err)
  }
  process.exit(1)
})
