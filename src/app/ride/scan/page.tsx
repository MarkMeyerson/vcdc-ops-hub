import Link from 'next/link'
import type { Metadata } from 'next'
import { requireAdmin } from '@/lib/auth'
import { RideScanner } from '@/components/ride-scanner'

// Ride sign-in, Slice 5: scan a member's QR and see who it is.
//
// Admin-only for now. Ride leader accounts are Slice 4 and do not exist yet,
// so the people who will actually use this cannot log in to it. That is the
// next thing to build; the point of shipping this first is finding out
// whether the camera works on the leaders' phones before anything is built
// on top of it.

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Ride sign-in | VCDC',
  robots: { index: false, follow: false },
}

export default async function RideScanPage() {
  await requireAdmin()

  return (
    <main className="mx-auto min-h-screen max-w-md px-4 py-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Ride sign-in</h1>
        <Link href="/admin" className="text-sm text-vcdc-cog hover:underline">
          Admin
        </Link>
      </div>

      <div className="mt-4 rounded-md bg-vcdc-sunburst/30 p-3 text-xs">
        <p className="font-medium">Early version, needs a signal.</p>
        <p className="mt-1">
          Every scan looks the rider up on the server, and the list below lives
          only in this tab: reloading loses it. Working with no bars, and a
          list that survives a locked screen, is the next piece of work.
        </p>
      </div>

      <div className="mt-6">
        <RideScanner />
      </div>
    </main>
  )
}
