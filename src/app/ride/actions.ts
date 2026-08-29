'use server'

import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import {
  guestWaivers,
  members,
  rideAttendance,
  rides,
} from '@/lib/db/schema'
import { requireRideAccess } from '@/lib/auth'
import { rideForActor, buildRoster } from '@/lib/ride/rides'
import { acceptsScans, todayIso } from '@/lib/ride/status'
import {
  classifyScan,
  memberGaps,
  memberWaiverStatus,
  toScannedMember,
  type Roster,
  type ScanOutcome,
} from '@/lib/scan/resolve'

// Ride leader server actions.
//
// Two rules shape this whole file:
//
//   1. Every action guards first. The Drizzle connection bypasses RLS, so a
//      missing requireRideAccess() is a missing authorization check, not a
//      missing convenience.
//   2. Nothing here is on the critical path of a scan. The phone records a
//      scan locally and then tells the server about it. If any of this fails
//      the leader still has their list. See src/lib/offline/db.ts.

export type ScanResult =
  | { ok: true; outcome: ScanOutcome }
  | { ok: false; error: string }

// Online enrichment for a single code. The phone can already answer most of
// this from its synced roster; this call adds the things the roster
// deliberately does not carry, and confirms a guest waiver, which cannot be
// checked offline at all.
export async function lookupScan(raw: string): Promise<ScanResult> {
  await requireRideAccess()

  const classified = classifyScan(raw)

  if (classified.kind === 'not-ours') {
    return { ok: true, outcome: { kind: 'not-ours', raw } }
  }
  if (classified.kind === 'tampered') {
    return { ok: true, outcome: { kind: 'tampered', raw } }
  }

  if (classified.kind === 'guest') {
    const [waiver] = await db
      .select()
      .from(guestWaivers)
      .where(eq(guestWaivers.qrToken, classified.qrToken))
      .limit(1)

    if (!waiver) {
      return {
        ok: true,
        outcome: {
          kind: 'guest',
          guestNumber: classified.guestNumber,
          qrToken: classified.qrToken,
          guest: null,
          status: 'unknown-code',
        },
      }
    }

    return {
      ok: true,
      outcome: {
        kind: 'guest',
        guestNumber: String(waiver.guestNumber),
        qrToken: classified.qrToken,
        guest: {
          firstName: waiver.firstName,
          lastName: waiver.lastName,
          signedAt: waiver.signedAt.toISOString(),
          waiverVersion: waiver.waiverTextVersion,
        },
        status: waiver.expiresAt.getTime() < Date.now() ? 'expired' : 'valid',
      },
    }
  }

  const [member] = await db
    .select()
    .from(members)
    .where(eq(members.memberNumber, classified.memberNumber))
    .limit(1)

  if (!member) {
    return {
      ok: true,
      outcome: {
        kind: 'unknown-member',
        memberNumber: classified.memberNumber,
      },
    }
  }

  const expired = member.expiresAt < todayIso()
  const waiver = memberWaiverStatus(member, expired)

  // A signature can be valid while the membership is not. The leader still
  // sees who it is, because turning somebody away is a conversation, not an
  // error state.
  if (expired) {
    return {
      ok: true,
      outcome: {
        kind: 'expired-member',
        member: toScannedMember(member),
        waiver,
      },
    }
  }

  return {
    ok: true,
    outcome: {
      kind: 'member',
      member: toScannedMember(member),
      gaps: memberGaps(member),
      waiver,
    },
  }
}

// ---------- Roster sync ----------

export type RosterResult =
  | { ok: true; roster: Roster }
  | { ok: false; error: string }

export async function syncRoster(): Promise<RosterResult> {
  await requireRideAccess()
  try {
    return { ok: true, roster: await buildRoster() }
  } catch {
    return {
      ok: false,
      error: 'Could not download the roster. Try again while you have signal.',
    }
  }
}

// ---------- Ride CRUD ----------

const rideSchema = z.object({
  rideDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date for the ride'),
  routeName: z.string().trim().min(1, 'Give the ride a name'),
  startLocation: z
    .string()
    .trim()
    .transform((v) => (v === '' ? null : v)),
  notes: z
    .string()
    .trim()
    .transform((v) => (v === '' ? null : v)),
})

export type RideFormState = { error: string | null; rideId: string | null }

export async function createRide(
  _prev: RideFormState,
  formData: FormData
): Promise<RideFormState> {
  const actor = await requireRideAccess()

  const parsed = rideSchema.safeParse({
    rideDate: formData.get('rideDate') ?? '',
    routeName: formData.get('routeName') ?? '',
    startLocation: formData.get('startLocation') ?? '',
    notes: formData.get('notes') ?? '',
  })
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? 'Check the form',
      rideId: null,
    }
  }

  const [created] = await db
    .insert(rides)
    .values({
      rideLeaderId: actor.leaderId,
      rideDate: parsed.data.rideDate,
      routeName: parsed.data.routeName,
      startLocation: parsed.data.startLocation,
      notes: parsed.data.notes,
    })
    .returning({ id: rides.id })

  if (!created) return { error: 'Could not create the ride.', rideId: null }

  revalidatePath('/ride')
  return { error: null, rideId: created.id }
}

export type StatusResult = { ok: boolean; error: string | null }

export async function startRide(rideId: string): Promise<StatusResult> {
  const actor = await requireRideAccess()
  const ride = await rideForActor(rideId, actor)
  if (!ride) return { ok: false, error: 'That ride is not yours to open.' }
  if (ride.status === 'submitted') {
    return { ok: false, error: 'That ride has already been submitted.' }
  }
  if (ride.status === 'planned') {
    await db.update(rides).set({ status: 'active' }).where(eq(rides.id, rideId))
    revalidatePath(`/ride/${rideId}`)
    revalidatePath('/ride')
  }
  return { ok: true, error: null }
}

// ---------- Attendance ----------

// One scan as the phone recorded it. scannedAt is a client clock, which can
// be wrong; it is stored as given rather than replaced with the server time,
// because the order riders arrived in is the thing the leader will recognise
// and a submit an hour later would flatten it.
export type QueuedScan = {
  id: string
  raw: string
  scannedAt: number
  offline: boolean
}

export type ScanPushResult = {
  id: string
  status: 'recorded' | 'duplicate' | 'unresolved'
  reason: string | null
}

export type PushResult =
  | { ok: true; results: ScanPushResult[] }
  | { ok: false; error: string }

async function resolveForAttendance(scan: QueuedScan): Promise<{
  memberId: string | null
  guestWaiverId: string | null
  reason: string | null
}> {
  const classified = classifyScan(scan.raw)

  if (classified.kind === 'member') {
    const [member] = await db
      .select({ id: members.id })
      .from(members)
      .where(eq(members.memberNumber, classified.memberNumber))
      .limit(1)
    if (member) return { memberId: member.id, guestWaiverId: null, reason: null }
    return {
      memberId: null,
      guestWaiverId: null,
      reason: `No member has number ${classified.memberNumber}.`,
    }
  }

  if (classified.kind === 'guest') {
    const [waiver] = await db
      .select({ id: guestWaivers.id, expiresAt: guestWaivers.expiresAt })
      .from(guestWaivers)
      .where(eq(guestWaivers.qrToken, classified.qrToken))
      .limit(1)
    if (!waiver) {
      return {
        memberId: null,
        guestWaiverId: null,
        reason: 'That guest code is not on file. They may not have finished signing.',
      }
    }
    // An expired guest code still records the person. They were there; the
    // club can decide afterwards what an out-of-date waiver means.
    return { memberId: null, guestWaiverId: waiver.id, reason: null }
  }

  if (classified.kind === 'tampered') {
    return {
      memberId: null,
      guestWaiverId: null,
      reason: 'The card signature did not check out. It may predate a key change.',
    }
  }

  return {
    memberId: null,
    guestWaiverId: null,
    reason: 'Not a VCDC code.',
  }
}

// Pushes queued scans to the ride. Safe to call repeatedly with the same
// scans: every insert is ON CONFLICT DO NOTHING against the ride's unique
// pairs, so a leader whose signal comes and goes cannot double-count anyone.
export async function pushScans(
  rideId: string,
  scans: QueuedScan[]
): Promise<PushResult> {
  const actor = await requireRideAccess()
  const ride = await rideForActor(rideId, actor)
  if (!ride) return { ok: false, error: 'That ride is not yours to add to.' }
  if (!acceptsScans(ride.status)) {
    return { ok: false, error: 'That ride has already been submitted.' }
  }

  const results: ScanPushResult[] = []

  for (const scan of scans) {
    const resolved = await resolveForAttendance(scan)
    const scannedAt = new Date(scan.scannedAt)

    const inserted = await db
      .insert(rideAttendance)
      .values({
        rideId,
        memberId: resolved.memberId,
        guestWaiverId: resolved.guestWaiverId,
        scannedAt: Number.isFinite(scannedAt.getTime()) ? scannedAt : new Date(),
        scannedOffline: scan.offline,
        // The raw code is kept only when nothing else identifies the row.
        // Storing it alongside a resolved member would be a second copy of
        // their signed QR for no reason.
        rawCode: resolved.memberId || resolved.guestWaiverId ? null : scan.raw,
        unresolvedReason: resolved.reason,
      })
      .onConflictDoNothing()
      .returning({ id: rideAttendance.id })

    if (inserted.length === 0) {
      results.push({ id: scan.id, status: 'duplicate', reason: null })
    } else if (resolved.reason) {
      results.push({ id: scan.id, status: 'unresolved', reason: resolved.reason })
    } else {
      results.push({ id: scan.id, status: 'recorded', reason: null })
    }
  }

  // A ride being scanned into is a ride that has started, whatever the
  // leader remembered to tap.
  if (ride.status === 'planned' && scans.length > 0) {
    await db.update(rides).set({ status: 'active' }).where(eq(rides.id, rideId))
  }

  revalidatePath(`/ride/${rideId}`)
  return { ok: true, results }
}

export type SubmitResult =
  | { ok: true; recorded: number; unresolved: number }
  | { ok: false; error: string }

// Closes the ride. Pushes anything still queued first, so a leader who taps
// submit the moment they get a bar of signal does not lose the tail of their
// list to a race between the sync and the close.
export async function submitRide(
  rideId: string,
  scans: QueuedScan[]
): Promise<SubmitResult> {
  const actor = await requireRideAccess()
  const ride = await rideForActor(rideId, actor)
  if (!ride) return { ok: false, error: 'That ride is not yours to submit.' }
  if (ride.status === 'submitted') {
    return { ok: false, error: 'That ride has already been submitted.' }
  }

  if (scans.length > 0) {
    const pushed = await pushScans(rideId, scans)
    if (!pushed.ok) return { ok: false, error: pushed.error }
  }

  const rows = await db
    .select({ id: rideAttendance.id, reason: rideAttendance.unresolvedReason })
    .from(rideAttendance)
    .where(eq(rideAttendance.rideId, rideId))

  await db
    .update(rides)
    .set({ status: 'submitted', submittedAt: new Date() })
    .where(eq(rides.id, rideId))

  revalidatePath(`/ride/${rideId}`)
  revalidatePath('/ride')

  return {
    ok: true,
    recorded: rows.filter((r) => !r.reason).length,
    unresolved: rows.filter((r) => r.reason).length,
  }
}

export type RemoveResult = { ok: boolean; error: string | null }

export async function removeAttendance(
  rideId: string,
  attendanceId: string
): Promise<RemoveResult> {
  const actor = await requireRideAccess()
  const ride = await rideForActor(rideId, actor)
  if (!ride) return { ok: false, error: 'That ride is not yours to change.' }
  if (ride.status === 'submitted') {
    return { ok: false, error: 'That ride has already been submitted.' }
  }
  await db
    .delete(rideAttendance)
    .where(
      and(
        eq(rideAttendance.id, attendanceId),
        eq(rideAttendance.rideId, rideId)
      )
    )
  revalidatePath(`/ride/${rideId}`)
  return { ok: true, error: null }
}

// ---------- Contact gaps ----------

const contactSchema = z.object({
  memberNumber: z.coerce.number().int().positive(),
  email: z
    .string()
    .trim()
    .transform((v) => (v === '' ? null : v))
    .refine((v) => v === null || z.email().safeParse(v).success, {
      message: 'Enter a valid email or leave it blank',
    }),
  phone: z
    .string()
    .trim()
    .transform((v) => (v === '' ? null : v)),
})

export type ContactState = { error: string | null; saved: boolean }

// Fills a contact gap from the parking lot. Keyed by member number rather
// than by row id, because the offline roster carries the number and not the
// id, and the leader must get the same form either way.
//
// Blank leaves the current value alone, matching the bulk update: a leader
// who only got a phone number must not wipe an email somebody else
// collected last month.
export async function saveContact(
  _prev: ContactState,
  formData: FormData
): Promise<ContactState> {
  await requireRideAccess()

  const parsed = contactSchema.safeParse({
    memberNumber: formData.get('memberNumber'),
    email: formData.get('email') ?? '',
    phone: formData.get('phone') ?? '',
  })
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? 'Check the form',
      saved: false,
    }
  }

  const patch: { email?: string; phone?: string; updatedAt: Date } = {
    updatedAt: new Date(),
  }
  if (parsed.data.email) patch.email = parsed.data.email
  if (parsed.data.phone) patch.phone = parsed.data.phone

  if (!patch.email && !patch.phone) {
    return { error: 'Nothing to save.', saved: false }
  }

  try {
    await db
      .update(members)
      .set(patch)
      .where(eq(members.memberNumber, parsed.data.memberNumber))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('duplicate key')) {
      return {
        error: 'Another member already has that email address.',
        saved: false,
      }
    }
    throw err
  }

  return { error: null, saved: true }
}
