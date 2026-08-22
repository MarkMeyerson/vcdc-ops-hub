// Member ids reach us from URLs members were emailed, so they arrive
// truncated by mail clients, re-wrapped by newsletters, and hand-retyped.
//
// A loose check is worse than none: anything that gets past this goes
// straight into a uuid comparison, and Postgres raises on malformed input
// rather than returning no rows. That surfaces as a 500 on a page whose
// whole job is to explain politely that the link did not work.
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: string): boolean {
  return UUID.test(value)
}
