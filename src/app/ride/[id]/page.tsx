import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { requireRideAccess } from '@/lib/auth'
import { commentsForRide } from '@/lib/ride/comments'
import { attendanceForRide, rideForActor } from '@/lib/ride/rides'
import {
  RIDE_STATUS_LABELS,
  RIDE_STATUS_NOTES,
  acceptsScans,
} from '@/lib/ride/status'
import { displayDate, waiverUrl } from '@/lib/display'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Ride | VCDC',
  robots: { index: false, follow: false },
}

export default async function RidePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const actor = await requireRideAccess()
  const ride = await rideForActor(id, actor)
  if (!ride) notFound()

  const attendance = await attendanceForRide(ride.id)
  const unresolved = attendance.filter((row) => row.unresolvedReason)
  const comments = await commentsForRide(ride.id)
  const waiver = waiverUrl()

  return (
    <div className="space-y-6">
      <div>
        <Link href="/ride" className="text-sm text-vcdc-cog hover:underline">
          All rides
        </Link>
        <h1 className="mt-1 text-xl font-semibold">{ride.routeName}</h1>
        <p className="text-sm text-vcdc-cog">
          {displayDate(ride.rideDate)}
          {ride.startLocation && ` · ${ride.startLocation}`}
        </p>
        {actor.isAdmin && ride.leaderName && (
          <p className="text-sm text-vcdc-cog">Led by {ride.leaderName}</p>
        )}
        {ride.notes && <p className="mt-2 text-sm">{ride.notes}</p>}
      </div>

      <div className="rounded-lg border border-vcdc-cog/30 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-vcdc-cog">
          {RIDE_STATUS_LABELS[ride.status]}
        </p>
        <p className="mt-1 text-sm">{RIDE_STATUS_NOTES[ride.status]}</p>
        {acceptsScans(ride.status) && (
          <Link href={`/ride/${ride.id}/scan`} className="mt-3 block">
            <Button type="button" className="w-full">
              Open sign-in
            </Button>
          </Link>
        )}
      </div>

      {acceptsScans(ride.status) && (
        <div className="rounded-md bg-vcdc-sunburst/30 p-3 text-xs">
          <p className="font-medium">Before you leave the house</p>
          <p className="mt-1">
            Open sign-in once while you still have signal. That copies the
            member roster onto this phone, which is what lets the scanner
            work in a gravel lot with no bars.
          </p>
        </div>
      )}

      {unresolved.length > 0 && (
        <div className="rounded-lg border-2 border-vcdc-red bg-vcdc-red/10 p-4">
          <p className="text-sm font-semibold">
            {unresolved.length} scan{unresolved.length === 1 ? '' : 's'} could
            not be matched to a person
          </p>
          <p className="mt-1 text-xs">
            Nothing was thrown away. Each one is listed below with the code
            that was scanned, so somebody can work out who it was.
          </p>
        </div>
      )}

      <div>
        <h2 className="text-sm font-medium uppercase text-vcdc-cog">
          Signed in ({attendance.length})
        </h2>
        {attendance.length === 0 ? (
          <p className="mt-2 text-sm text-vcdc-cog">
            Nobody yet. Scans reach this page as they are sent from the
            leader&rsquo;s phone.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-vcdc-cog/20 rounded-lg border border-vcdc-cog/30">
            {attendance.map((row) => (
              <li key={row.id} className="px-4 py-2 text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <span>{row.name}</span>
                  <span className="font-mono text-xs text-vcdc-cog">
                    {row.detail}
                  </span>
                </div>
                {row.unresolvedReason && (
                  <p className="mt-1 text-xs text-vcdc-red">
                    {row.unresolvedReason}
                  </p>
                )}
                {row.scannedOffline && (
                  <p className="mt-1 text-xs text-vcdc-cog">
                    Scanned with no signal.
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {comments.length > 0 && (
        <div>
          <h2 className="text-sm font-medium uppercase text-vcdc-cog">
            Notes ({comments.length})
          </h2>
          <ul className="mt-2 space-y-2">
            {comments.map((comment) => (
              <li
                key={comment.id}
                className="rounded-lg border border-vcdc-cog/30 p-3 text-sm"
              >
                <p className="whitespace-pre-wrap">{comment.comment}</p>
                <p className="mt-1 text-xs text-vcdc-cog">
                  {comment.kind === 'finish' ? 'End-of-ride note' : 'Note'}
                  {actor.isAdmin && ` · ${comment.leaderName}`} ·{' '}
                  {comment.createdAt.toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {waiver && (
        <p className="text-xs text-vcdc-cog">
          Waiver link for guests:{' '}
          <a href={waiver} className="underline">
            {waiver}
          </a>
        </p>
      )}
    </div>
  )
}
