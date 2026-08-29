import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import QRCode from 'qrcode'
import { requireRideAccess } from '@/lib/auth'
import { rideForActor } from '@/lib/ride/rides'
import { acceptsScans } from '@/lib/ride/status'
import { displayDate, waiverUrl } from '@/lib/display'
import { qrSigningConfigured } from '@/lib/qr/payload'
import { RideScanner } from '@/components/ride-scanner'

// Ride sign-in. The one screen a leader actually uses, and the reason the
// rest of this app exists.

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Sign-in | VCDC',
  robots: { index: false, follow: false },
}

export default async function RideScanPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const actor = await requireRideAccess()
  const ride = await rideForActor(id, actor)
  if (!ride) notFound()
  if (!acceptsScans(ride.status)) redirect(`/ride/${ride.id}`)

  // A leader holds their own phone up and a stranger scans it. Rendered here
  // rather than on the device because the URL is the same for every rider,
  // and because it then works with no signal: the image travels with the
  // page the leader already has open.
  const waiver = waiverUrl()
  const waiverQrDataUrl = waiver
    ? await QRCode.toDataURL(waiver, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 512,
      })
    : null

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">{ride.routeName}</h1>
          <p className="text-sm text-vcdc-cog">
            {displayDate(ride.rideDate)}
          </p>
        </div>
        <Link
          href={`/ride/${ride.id}`}
          className="text-sm text-vcdc-cog hover:underline"
        >
          Ride
        </Link>
      </div>

      {!qrSigningConfigured() && (
        <div className="rounded-md bg-vcdc-red/10 p-3 text-sm">
          <p className="font-medium">Card checking is not configured.</p>
          <p className="mt-1">
            QR_SIGNING_SECRET is not set on the server, so no card can be
            verified. Scans are still recorded.
          </p>
        </div>
      )}

      <RideScanner
        rideId={ride.id}
        rideStatus={ride.status}
        waiverUrl={waiver}
        waiverQrDataUrl={waiverQrDataUrl}
      />
    </div>
  )
}
