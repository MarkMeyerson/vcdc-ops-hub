import type { Metadata } from 'next'
import { currentWaiver } from '@/lib/waiver/queries'
import { renderWaiverMarkdown, waiverTitle } from '@/lib/waiver/markdown'
import { WaiverForm } from '@/components/waiver-form'

// Public. No account, no login, no app to install: a rider follows a texted
// link on their own phone while the group is putting helmets on.

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Ride waiver | Vespa Club of Washington DC',
  description: 'Sign the Vespa Club of Washington DC ride waiver.',
}

export default async function WaiverPage() {
  const waiver = await currentWaiver()

  if (!waiver) {
    return (
      <main className="mx-auto min-h-screen max-w-2xl px-4 py-10">
        <h1 className="text-xl font-semibold">Ride waiver</h1>
        <p className="mt-3 text-sm">
          The club has not published its waiver text yet, so there is nothing
          to sign. Tell a ride leader.
        </p>
      </main>
    )
  }

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 py-8">
      <h1 className="text-xl font-semibold">{waiverTitle(waiver.bodyMarkdown)}</h1>
      <p className="mt-1 text-xs text-vcdc-cog">
        Version {waiver.version}
      </p>

      <article
        className="waiver-body mt-6 rounded-lg border border-vcdc-cog/30 p-4 text-sm"
        dangerouslySetInnerHTML={{
          __html: renderWaiverMarkdown(waiver.bodyMarkdown),
        }}
      />

      <div className="mt-8">
        <WaiverForm version={waiver.version} />
      </div>
    </main>
  )
}
