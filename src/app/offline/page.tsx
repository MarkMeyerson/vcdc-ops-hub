import type { Metadata } from 'next'

// Served by the service worker when a page is asked for with no signal and
// nothing cached. Static on purpose: it must render with no database, no
// session, and no network.

export const metadata: Metadata = {
  title: 'No signal | VCDC',
  robots: { index: false, follow: false },
}

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="text-xl font-semibold">No signal</h1>
      <p className="mt-3 text-sm">
        This page has not been opened on this phone yet, so there is no copy
        to show you.
      </p>
      <p className="mt-3 text-sm">
        Anyone you have already scanned is still saved on this phone. Nothing
        is lost. Open the ride again once you have a bar of signal and it will
        send.
      </p>
      <p className="mt-6 text-xs text-vcdc-cog">
        Next time, open the sign-in screen once before you leave. That copies
        the roster onto the phone and makes this screen unnecessary.
      </p>
    </main>
  )
}
