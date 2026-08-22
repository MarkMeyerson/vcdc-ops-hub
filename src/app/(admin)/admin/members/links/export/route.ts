import { NextResponse } from 'next/server'
import { asc } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { members } from '@/lib/db/schema'
import { requireAdmin } from '@/lib/auth'
import { membersCsv, membersCsvFilename } from '@/lib/member-links'

// CSV of every member and their permanent card link, for the mail merge
// that sends members their card. Admin only: this file is the whole roster
// plus a working link to each person's card.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  await requireAdmin()

  const roster = await db
    .select()
    .from(members)
    .orderBy(asc(members.memberNumber))

  const today = new Date().toISOString().slice(0, 10)

  return new NextResponse(membersCsv(roster), {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${membersCsvFilename(today)}"`,
      'Cache-Control': 'no-store',
    },
  })
}
