import { desc } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { waiverVersions, type WaiverVersion } from '@/lib/db/schema'

// The waiver text on screen right now. Publishing a new version never
// rewrites an old one: a signature points at the version number that was
// shown when it was made, which is the whole reason the table is versioned.
export async function currentWaiver(): Promise<WaiverVersion | null> {
  const [row] = await db
    .select()
    .from(waiverVersions)
    .orderBy(desc(waiverVersions.version))
    .limit(1)
  return row ?? null
}

export async function allWaiverVersions(): Promise<WaiverVersion[]> {
  return db
    .select()
    .from(waiverVersions)
    .orderBy(desc(waiverVersions.version))
    .limit(50)
}
