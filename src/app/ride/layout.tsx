import Link from 'next/link'
import type { Metadata, Viewport } from 'next'
import { requireRideAccess } from '@/lib/auth'
import { SignOutButton } from '@/components/sign-out-button'
import { ServiceWorkerRegistrar } from '@/components/service-worker'
import { FeedbackWidget } from '@/components/feedback-widget'

// Installable from here down. A leader adds this to their home screen and
// gets a full-screen app with no browser chrome eating the viewport, which
// matters when the camera preview and the check-in list have to share a
// phone screen held in one hand.
export const metadata: Metadata = {
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'VCDC Rides', statusBarStyle: 'default' },
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  themeColor: '#E48125',
  // The scanner has tap targets next to a live camera preview. A pinch zoom
  // there is always an accident.
  maximumScale: 1,
}

// The ride leader app. Deliberately not nested under /admin: a leader who
// is not an admin has to be able to live entirely inside this route, and an
// admin who is leading a ride should get the same screen the leaders get
// rather than a privileged variant of it.
export default async function RideLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const actor = await requireRideAccess()

  return (
    <div className="min-h-screen bg-white">
      <ServiceWorkerRegistrar />
      <header className="border-b border-vcdc-cog/30 bg-vcdc-charcoal text-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/ride" className="font-semibold">
            VCDC Rides
          </Link>
          <div className="flex items-center gap-3 text-sm text-white/70">
            {actor.isAdmin && (
              <Link href="/admin" className="hover:text-white">
                Admin
              </Link>
            )}
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-6">{children}</main>
      <FeedbackWidget />
    </div>
  )
}
