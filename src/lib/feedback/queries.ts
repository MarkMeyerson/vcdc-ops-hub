import { desc, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { appFeedback, rideLeaders, type AppFeedback } from '@/lib/db/schema'

// Admin reads for the app-feedback widget. Runs on the Drizzle connection
// (no RLS); only reachable from a page that already called requireAdmin().
// RLS (migration 0006) backs it up regardless.

export type FeedbackRow = AppFeedback & { leaderName: string }

export async function feedbackForAdmin(): Promise<FeedbackRow[]> {
  const rows = await db
    .select({
      feedback: appFeedback,
      leaderName: rideLeaders.fullName,
    })
    .from(appFeedback)
    .innerJoin(rideLeaders, eq(rideLeaders.id, appFeedback.rideLeaderId))
    .orderBy(desc(appFeedback.createdAt))
    .limit(200)

  return rows.map((r) => ({ ...r.feedback, leaderName: r.leaderName }))
}

export type FeedbackCounts = { total: number; last7Days: number }

export async function feedbackCounts(): Promise<FeedbackCounts> {
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      last7Days: sql<number>`count(*) filter (where created_at > now() - interval '7 days')::int`,
    })
    .from(appFeedback)

  return row ?? { total: 0, last7Days: 0 }
}
