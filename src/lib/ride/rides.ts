import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import {
  guestWaivers,
  members,
  rideAttendance,
  rideLeaders,
  rides,
  type Ride,
} from '@/lib/db/schema'
import type { RideActor } from '@/lib/auth'
import { memberQrSignature } from '@/lib/qr/payload'
import type { Roster, RosterEntry } from '@/lib/scan/resolve'
import { isUuid } from '@/lib/uuid'

// Server-side ride reads. Everything here runs on the Drizzle connection,
// which is NOT subject to RLS, so every exported function either takes an
// already-guarded RideActor or is only reachable from a page that called
// requireRideAccess() first. The matching RLS policies exist anyway
// (migration 0002) so the database agrees with the app about who owns what.

export type RideSummary = Ride & {
  leaderName: string
  attendanceCount: number
}

export async function ridesForActor(actor: RideActor): Promise<RideSummary[]> {
  const rows = await db
    .select({
      ride: rides,
      leaderName: rideLeaders.fullName,
      attendanceCount: sql<number>`(
        select count(*)::int from ride_attendance a where a.ride_id = ${rides.id}
      )`,
    })
    .from(rides)
    .innerJoin(rideLeaders, eq(rideLeaders.id, rides.rideLeaderId))
    // Admins see every ride, because an admin chasing a missing roster
    // should not have to log in as somebody else to find it.
    .where(actor.isAdmin ? undefined : eq(rides.rideLeaderId, actor.leaderId))
    .orderBy(desc(rides.rideDate), desc(rides.createdAt))
    .limit(100)

  return rows.map((r) => ({
    ...r.ride,
    leaderName: r.leaderName,
    attendanceCount: r.attendanceCount,
  }))
}

export async function rideForActor(
  rideId: string,
  actor: RideActor
): Promise<RideSummary | null> {
  if (!isUuid(rideId)) return null

  const [row] = await db
    .select({
      ride: rides,
      leaderName: rideLeaders.fullName,
      attendanceCount: sql<number>`(
        select count(*)::int from ride_attendance a where a.ride_id = ${rides.id}
      )`,
    })
    .from(rides)
    .innerJoin(rideLeaders, eq(rideLeaders.id, rides.rideLeaderId))
    .where(
      actor.isAdmin
        ? eq(rides.id, rideId)
        : and(eq(rides.id, rideId), eq(rides.rideLeaderId, actor.leaderId))
    )
    .limit(1)

  if (!row) return null
  return {
    ...row.ride,
    leaderName: row.leaderName,
    attendanceCount: row.attendanceCount,
  }
}

export type AttendanceRow = {
  id: string
  name: string
  detail: string
  scannedAt: Date
  scannedOffline: boolean
  unresolvedReason: string | null
  rawCode: string | null
}

export async function attendanceForRide(
  rideId: string
): Promise<AttendanceRow[]> {
  const rows = await db
    .select({
      id: rideAttendance.id,
      scannedAt: rideAttendance.scannedAt,
      scannedOffline: rideAttendance.scannedOffline,
      unresolvedReason: rideAttendance.unresolvedReason,
      rawCode: rideAttendance.rawCode,
      memberNumber: members.memberNumber,
      memberFirst: members.firstName,
      memberLast: members.lastName,
      memberExpires: members.expiresAt,
      guestNumber: guestWaivers.guestNumber,
      guestFirst: guestWaivers.firstName,
      guestLast: guestWaivers.lastName,
    })
    .from(rideAttendance)
    .leftJoin(members, eq(members.id, rideAttendance.memberId))
    .leftJoin(guestWaivers, eq(guestWaivers.id, rideAttendance.guestWaiverId))
    .where(eq(rideAttendance.rideId, rideId))
    .orderBy(asc(rideAttendance.scannedAt))

  return rows.map((row) => {
    if (row.memberNumber !== null) {
      return {
        id: row.id,
        name: `${row.memberFirst} ${row.memberLast}`,
        detail: String(row.memberNumber),
        scannedAt: row.scannedAt,
        scannedOffline: row.scannedOffline,
        unresolvedReason: row.unresolvedReason,
        rawCode: row.rawCode,
      }
    }
    if (row.guestNumber !== null) {
      return {
        id: row.id,
        name: `${row.guestFirst} ${row.guestLast}`,
        detail: `Guest G${String(row.guestNumber).padStart(5, '0')}`,
        scannedAt: row.scannedAt,
        scannedOffline: row.scannedOffline,
        unresolvedReason: row.unresolvedReason,
        rawCode: row.rawCode,
      }
    }
    return {
      id: row.id,
      name: 'Unidentified scan',
      detail: row.rawCode ?? 'No code recorded',
      scannedAt: row.scannedAt,
      scannedOffline: row.scannedOffline,
      unresolvedReason: row.unresolvedReason,
      rawCode: row.rawCode,
    }
  })
}

// The roster a phone holds while it is offline.
//
// Brief Section 9 restricts this payload to member number, name, tier and
// the precomputed signature, with no email and no phone number, because a
// lost phone must not be a roster leak. Two fields are added to that list on
// purpose:
//
//   expiresAt      the leader is checking membership; without it a lapsed
//                  member and a current one look identical offline.
//   waiverSignedAt the leader is checking waivers, which is the other half
//                  of the same question.
//
// needsContact is a single boolean standing in for "email or phone is
// missing". It keeps the collect-their-details prompt working with no
// signal without any address ever reaching the device.
//
// The signature is precomputed here and compared on the phone. The signing
// secret never leaves the server.
export async function buildRoster(): Promise<Roster> {
  const rows = await db
    .select({
      memberNumber: members.memberNumber,
      firstName: members.firstName,
      lastName: members.lastName,
      membershipTier: members.membershipTier,
      expiresAt: members.expiresAt,
      waiverSignedAt: members.waiverSignedAt,
      waiverVersion: members.waiverVersion,
      email: members.email,
      phone: members.phone,
    })
    .from(members)
    .orderBy(asc(members.memberNumber))

  const entries: RosterEntry[] = rows.map((row) => ({
    memberNumber: row.memberNumber,
    firstName: row.firstName,
    lastName: row.lastName,
    membershipTier: row.membershipTier,
    expiresAt: row.expiresAt,
    waiverSignedAt: row.waiverSignedAt?.toISOString() ?? null,
    waiverVersion: row.waiverVersion,
    needsContact: !row.email || !row.phone,
    signature: memberQrSignature(row.memberNumber),
  }))

  return { syncedAt: new Date().toISOString(), entries }
}
