import Link from 'next/link'
import { count, gte, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { members } from '@/lib/db/schema'
import { requireAdmin } from '@/lib/auth'

export default async function AdminHome() {
  await requireAdmin()

  const [total] = await db.select({ value: count() }).from(members)
  const [active] = await db
    .select({ value: count() })
    .from(members)
    .where(gte(members.expiresAt, sql`current_date`))

  return (
    <div>
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-vcdc-cog/30 p-6">
          <p className="text-sm text-vcdc-cog">Active members</p>
          <p className="mt-1 text-3xl font-semibold text-vcdc-green">
            {active?.value ?? 0}
          </p>
        </div>
        <div className="rounded-lg border border-vcdc-cog/30 p-6">
          <p className="text-sm text-vcdc-cog">Total members</p>
          <p className="mt-1 text-3xl font-semibold">{total?.value ?? 0}</p>
        </div>
      </div>
      <div className="mt-6">
        <Link
          href="/admin/members"
          className="text-sm font-medium text-vcdc-amber hover:underline"
        >
          Manage members
        </Link>
      </div>
    </div>
  )
}
