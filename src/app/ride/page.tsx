import Link from 'next/link'
import type { Metadata } from 'next'
import { requireRideAccess } from '@/lib/auth'
import { ridesForActor } from '@/lib/ride/rides'
import { RIDE_STATUS_LABELS, todayIso } from '@/lib/ride/status'
import { displayDate } from '@/lib/display'
import { Button } from '@/components/ui/button'

// The leader's home screen. One question: which ride am I running, and is
// it open. Everything else is one tap away.

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Rides | VCDC',
  robots: { index: false, follow: false },
}

const STATUS_TONE: Record<string, string> = {
  planned: 'bg-vcdc-cog/15 text-vcdc-charcoal',
  active: 'bg-vcdc-green/15 text-vcdc-green',
  submitted: 'bg-vcdc-sky/30 text-vcdc-charcoal',
}

export default async function RidesPage() {
  const actor = await requireRideAccess()
  const rides = await ridesForActor(actor)
  const today = todayIso()

  const open = rides.filter((r) => r.status !== 'submitted')
  const done = rides.filter((r) => r.status === 'submitted')

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Rides</h1>
          <p className="text-sm text-vcdc-cog">{actor.leaderName}</p>
        </div>
        <Link href="/ride/new">
          <Button type="button">New ride</Button>
        </Link>
      </div>

      {rides.length === 0 && (
        <div className="rounded-lg border border-vcdc-cog/30 p-6">
          <p className="text-sm">
            No rides yet. Create one, then open sign-in when riders start
            arriving.
          </p>
        </div>
      )}

      {open.length > 0 && (
        <section>
          <h2 className="text-sm font-medium uppercase text-vcdc-cog">Open</h2>
          <ul className="mt-2 space-y-2">
            {open.map((ride) => (
              <li key={ride.id}>
                <Link
                  href={`/ride/${ride.id}`}
                  className="block rounded-lg border border-vcdc-cog/30 p-4 transition-colors hover:border-vcdc-amber hover:bg-vcdc-amber/5"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium">{ride.routeName}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[ride.status]}`}
                    >
                      {RIDE_STATUS_LABELS[ride.status]}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-vcdc-cog">
                    {displayDate(ride.rideDate)}
                    {ride.rideDate === today && ' · today'}
                    {ride.startLocation && ` · ${ride.startLocation}`}
                  </p>
                  <p className="mt-1 text-sm text-vcdc-cog">
                    {ride.attendanceCount} signed in
                    {actor.isAdmin && ` · ${ride.leaderName}`}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {done.length > 0 && (
        <section>
          <h2 className="text-sm font-medium uppercase text-vcdc-cog">
            Submitted
          </h2>
          <ul className="mt-2 space-y-2">
            {done.map((ride) => (
              <li key={ride.id}>
                <Link
                  href={`/ride/${ride.id}`}
                  className="block rounded-lg border border-vcdc-cog/20 p-4 text-vcdc-cog transition-colors hover:border-vcdc-cog/40"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium text-vcdc-charcoal">
                      {ride.routeName}
                    </span>
                    <span className="text-xs">{ride.attendanceCount} riders</span>
                  </div>
                  <p className="mt-1 text-sm">
                    {displayDate(ride.rideDate)}
                    {actor.isAdmin && ` · ${ride.leaderName}`}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
