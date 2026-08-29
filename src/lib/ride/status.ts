import type { Ride } from '@/lib/db/schema'

// Pure ride vocabulary, shared by the server pages and the client scanner so
// the words on a leader's phone cannot drift from the words in the database.

export type RideStatus = Ride['status']

export const RIDE_STATUS_LABELS: Record<RideStatus, string> = {
  planned: 'Planned',
  active: 'Signing in',
  submitted: 'Submitted',
}

export const RIDE_STATUS_NOTES: Record<RideStatus, string> = {
  planned: 'Not started. Open it when riders arrive.',
  active: 'Sign-in is open. Scan cards as riders arrive.',
  submitted: 'Closed. The roster has been sent in.',
}

// A ride moves forward only. Reopening a submitted ride would let a roster
// that has already been reported change underneath the report.
const NEXT: Record<RideStatus, RideStatus[]> = {
  planned: ['active'],
  active: ['submitted'],
  submitted: [],
}

export function canMoveTo(from: RideStatus, to: RideStatus): boolean {
  return NEXT[from].includes(to)
}

export function acceptsScans(status: RideStatus): boolean {
  // Planned rides accept scans too: an early rider turns up before the
  // leader has tapped anything, and making them wait to be counted is how a
  // rider ends up not counted at all. Scanning a planned ride starts it.
  return status !== 'submitted'
}

// Today in the club's own terms. Rides are dated, not timestamped, and a
// leader looking at the list at 9pm on Saturday still means Saturday.
export function todayIso(now: Date = new Date()): string {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
  const iso = local.toISOString().slice(0, 10)
  return iso
}
