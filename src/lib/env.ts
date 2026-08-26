// Every credential in this app arrives in Vercel by copy-paste: a terminal,
// a JSON file, a certificate export. A stray leading or trailing character
// (a tab, a trailing newline) pastes in as part of the value and is
// invisible in the Vercel dashboard's text field.
//
// That is not hypothetical: on 2026-08-26 a leading tab in
// GOOGLE_WALLET_CLASS_ID turned an otherwise-correct value into a 500 for
// every member who tapped Add to Google Wallet, for hours, before anyone
// noticed. envVar() is the fix applied everywhere a credential is read, not
// only where it was caught: QR_SIGNING_SECRET alone underpins every pass
// and every download link, and Apple's five variables are typed and pasted
// by hand across several different tools, which is the same failure mode
// with a wider blast radius.
//
// Returns undefined for unset or whitespace-only, so a blank-pasted value
// is treated the same as a missing one rather than silently passing
// validation as an empty string.
export function envVar(name: string): string | undefined {
  const value = process.env[name]
  if (value === undefined) return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}
