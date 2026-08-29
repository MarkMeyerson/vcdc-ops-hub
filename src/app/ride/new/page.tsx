import Link from 'next/link'
import type { Metadata } from 'next'
import { requireRideAccess } from '@/lib/auth'
import { todayIso } from '@/lib/ride/status'
import { RideForm } from '@/components/ride-form'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'New ride | VCDC',
  robots: { index: false, follow: false },
}

export default async function NewRidePage() {
  await requireRideAccess()

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">New ride</h1>
        <Link href="/ride" className="text-sm text-vcdc-cog hover:underline">
          Cancel
        </Link>
      </div>
      <RideForm defaultDate={todayIso()} />
    </div>
  )
}
