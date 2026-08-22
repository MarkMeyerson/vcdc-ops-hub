import Link from 'next/link'
import { asc } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { members } from '@/lib/db/schema'
import { requireAdmin } from '@/lib/auth'
import { MembersTable } from '@/components/members-table'

export default async function MembersPage() {
  await requireAdmin()

  const allMembers = await db
    .select()
    .from(members)
    .orderBy(asc(members.memberNumber))

  // Compare against the server's date; expires_at is a date string (YYYY-MM-DD).
  const today = new Date().toISOString().slice(0, 10)

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Members</h1>
        <div className="flex items-center gap-3">
          <Link
            href="/admin/members/import"
            className="rounded-md border border-vcdc-cog/40 bg-white px-4 py-2 text-sm font-medium text-vcdc-charcoal hover:bg-vcdc-cog/10"
          >
            Bulk update
          </Link>
          <Link
            href="/admin/members/links"
            className="rounded-md border border-vcdc-cog/40 bg-white px-4 py-2 text-sm font-medium text-vcdc-charcoal hover:bg-vcdc-cog/10"
          >
            Card links
          </Link>
          <Link
            href="/admin/members/new"
            className="rounded-md bg-vcdc-amber px-4 py-2 text-sm font-medium text-white hover:bg-vcdc-amber/90"
          >
            Add member
          </Link>
        </div>
      </div>
      <div className="mt-6">
        <MembersTable members={allMembers} today={today} />
      </div>
    </div>
  )
}
