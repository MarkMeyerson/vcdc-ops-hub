import { asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { rideComments, rideLeaders } from '@/lib/db/schema'

// Reads for the ride-comments feature. Like the rest of src/lib/ride, these
// run on the Drizzle connection (no RLS) and are only reachable from a page
// or action that already called requireRideAccess() and scoped the ride to
// the actor. The matching RLS policy exists too (migration 0005).

export type RideCommentRow = {
  id: string
  leaderName: string
  comment: string
  kind: 'note' | 'finish'
  createdAt: Date
}

export async function commentsForRide(rideId: string): Promise<RideCommentRow[]> {
  const rows = await db
    .select({
      id: rideComments.id,
      leaderName: rideLeaders.fullName,
      comment: rideComments.comment,
      kind: rideComments.kind,
      createdAt: rideComments.createdAt,
    })
    .from(rideComments)
    .innerJoin(rideLeaders, eq(rideLeaders.id, rideComments.rideLeaderId))
    .where(eq(rideComments.rideId, rideId))
    .orderBy(asc(rideComments.createdAt))

  return rows
}
