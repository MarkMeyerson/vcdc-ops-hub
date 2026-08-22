import { NextResponse } from 'next/server'
import { asc } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { members } from '@/lib/db/schema'
import { requireAdmin } from '@/lib/auth'
import { buildTemplate, templateFilename } from '@/lib/member-import'

// The bulk-update template, pre-filled with what is already on file so the
// person editing it can see the gaps rather than retyping the roster.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  await requireAdmin()

  const roster = await db
    .select()
    .from(members)
    .orderBy(asc(members.memberNumber))

  const today = new Date().toISOString().slice(0, 10)

  return new NextResponse(buildTemplate(roster), {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${templateFilename(today)}"`,
      'Cache-Control': 'no-store',
    },
  })
}
