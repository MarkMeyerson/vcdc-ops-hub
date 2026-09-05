import type { Metadata } from 'next'
import Link from 'next/link'
import { requireAdmin } from '@/lib/auth'
import { usageStats } from '@/lib/stats/queries'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Usage | VCDC',
  robots: { index: false, follow: false },
}

function Tile({
  label,
  value,
  sub,
}: {
  label: string
  value: string | number
  sub?: string
}) {
  return (
    <div className="rounded-lg border border-vcdc-cog/30 p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-vcdc-cog">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {sub && <p className="mt-1 text-xs text-vcdc-cog">{sub}</p>}
    </div>
  )
}

const STATUS_LABELS: Record<string, string> = {
  planned: 'Planned',
  active: 'Active',
  submitted: 'Submitted',
}

export default async function StatsPage() {
  await requireAdmin()
  const stats = await usageStats()

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Usage</h1>
        <p className="mt-1 text-sm text-vcdc-cog">
          A read on whether Phase 5 testing is actually being used, not a
          full report. See{' '}
          <Link href="/admin/feedback" className="underline">
            Feedback
          </Link>{' '}
          for what people are saying.
        </p>
      </div>

      <section>
        <h2 className="text-sm font-medium uppercase text-vcdc-cog">
          Ride leaders
        </h2>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Tile label="Active" value={stats.leaders.active} />
          <Tile label="Total on roster" value={stats.leaders.total} />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium uppercase text-vcdc-cog">Rides</h2>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label="Total" value={stats.rides.total} />
          <Tile label="Last 7 days" value={stats.rides.last7Days} />
          {Object.entries(stats.rides.byStatus).map(([status, count]) => (
            <Tile
              key={status}
              label={STATUS_LABELS[status] ?? status}
              value={count}
            />
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium uppercase text-vcdc-cog">
          Sign-ins
        </h2>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Tile label="Total scans" value={stats.attendance.totalScans} />
          <Tile
            label="Members scanned in"
            value={stats.attendance.uniqueMembers}
            sub="At least once, ever"
          />
          <Tile label="Guests scanned in" value={stats.attendance.uniqueGuests} />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium uppercase text-vcdc-cog">
          Waiver adoption
        </h2>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Tile label="Members signed" value={stats.waivers.signed} />
          <Tile
            label="Of total members"
            value={stats.waivers.totalMembers}
            sub={
              stats.waivers.totalMembers > 0
                ? `${Math.round((stats.waivers.signed / stats.waivers.totalMembers) * 100)}%`
                : undefined
            }
          />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium uppercase text-vcdc-cog">
          Feedback &amp; notes
        </h2>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label="Feedback sent" value={stats.feedback.total} />
          <Tile label="Feedback, last 7 days" value={stats.feedback.last7Days} />
          <Tile label="Check-in notes" value={stats.comments.notes} />
          <Tile label="End-of-ride comments" value={stats.comments.finishComments} />
        </div>
      </section>
    </div>
  )
}
