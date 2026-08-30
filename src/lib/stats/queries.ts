import { sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import {
  appFeedback,
  members,
  rideAttendance,
  rideComments,
  rideLeaders,
  rides,
} from '@/lib/db/schema'
import { feedbackCounts } from '@/lib/feedback/queries'

// One query per table, each a single aggregate row. This is a testing-phase
// adoption dashboard ("is anybody actually using this"), not a reporting
// system, so it favors a handful of cheap counts over a general-purpose
// analytics layer.

export type UsageStats = {
  leaders: { total: number; active: number }
  rides: { total: number; last7Days: number; byStatus: Record<string, number> }
  attendance: { totalScans: number; uniqueMembers: number; uniqueGuests: number }
  waivers: { totalMembers: number; signed: number }
  feedback: { total: number; last7Days: number; byType: Record<string, number> }
  comments: { notes: number; finishComments: number }
}

export async function usageStats(): Promise<UsageStats> {
  const [
    [leaderRow],
    rideRows,
    [attendanceRow],
    [waiverRow],
    feedbackRows,
    commentRows,
    feedbackTotals,
  ] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)::int`,
        active: sql<number>`count(*) filter (where active)::int`,
      })
      .from(rideLeaders),
    db
      .select({
        status: rides.status,
        count: sql<number>`count(*)::int`,
        last7Days: sql<number>`count(*) filter (where created_at > now() - interval '7 days')::int`,
      })
      .from(rides)
      .groupBy(rides.status),
    db
      .select({
        totalScans: sql<number>`count(*)::int`,
        uniqueMembers: sql<number>`count(distinct member_id)::int`,
        uniqueGuests: sql<number>`count(distinct guest_waiver_id)::int`,
      })
      .from(rideAttendance),
    db
      .select({
        totalMembers: sql<number>`count(*)::int`,
        signed: sql<number>`count(*) filter (where waiver_signed_at is not null)::int`,
      })
      .from(members),
    db
      .select({ type: appFeedback.type, count: sql<number>`count(*)::int` })
      .from(appFeedback)
      .groupBy(appFeedback.type),
    db
      .select({ kind: rideComments.kind, count: sql<number>`count(*)::int` })
      .from(rideComments)
      .groupBy(rideComments.kind),
    feedbackCounts(),
  ])

  const byStatus: Record<string, number> = {}
  let ridesTotal = 0
  let ridesLast7Days = 0
  for (const row of rideRows) {
    byStatus[row.status] = row.count
    ridesTotal += row.count
    ridesLast7Days += row.last7Days
  }

  const byType: Record<string, number> = {}
  for (const row of feedbackRows) byType[row.type] = row.count

  const comments = { notes: 0, finishComments: 0 }
  for (const row of commentRows) {
    if (row.kind === 'finish') comments.finishComments = row.count
    else comments.notes = row.count
  }

  return {
    leaders: leaderRow ?? { total: 0, active: 0 },
    rides: { total: ridesTotal, last7Days: ridesLast7Days, byStatus },
    attendance: attendanceRow ?? { totalScans: 0, uniqueMembers: 0, uniqueGuests: 0 },
    waivers: waiverRow ?? { totalMembers: 0, signed: 0 },
    feedback: {
      total: feedbackTotals.total,
      last7Days: feedbackTotals.last7Days,
      byType,
    },
    comments,
  }
}
