import { requireAdmin } from '@/lib/auth'
import { allWaiverVersions } from '@/lib/waiver/queries'
import {
  STARTER_WAIVER_MARKDOWN,
  STARTER_WAIVER_VERSION_NOTE,
} from '@/lib/waiver/starter-text'
import { waiverUrl } from '@/lib/display'
import { WaiverPublishForm } from '@/components/waiver-publish-form'

export const dynamic = 'force-dynamic'

export default async function AdminWaiverPage() {
  await requireAdmin()
  const versions = await allWaiverVersions()
  const current = versions[0]
  const link = waiverUrl()

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Waiver text</h1>
        <p className="mt-1 text-sm text-vcdc-cog">
          This is what a rider reads and signs. Publishing never rewrites an
          older version: signatures keep pointing at the exact text that was on
          screen when they were made.
        </p>
        {link && (
          <p className="mt-2 text-sm">
            Riders sign at{' '}
            <a href={link} className="underline">
              {link}
            </a>
          </p>
        )}
      </div>

      {current && current.bodyMarkdown.includes('Interim text.') && (
        <div className="rounded-lg border-2 border-vcdc-amber bg-vcdc-amber/10 p-4 text-sm">
          <p className="font-medium">The starter text is live.</p>
          <p className="mt-1">{STARTER_WAIVER_VERSION_NOTE}</p>
        </div>
      )}

      <section>
        <h2 className="text-sm font-medium uppercase text-vcdc-cog">
          {current ? `Current text (version ${current.version})` : 'No text published yet'}
        </h2>
        <div className="mt-3">
          <WaiverPublishForm
            current={current?.bodyMarkdown ?? STARTER_WAIVER_MARKDOWN}
            starter={STARTER_WAIVER_MARKDOWN}
          />
        </div>
      </section>

      {versions.length > 1 && (
        <section>
          <h2 className="text-sm font-medium uppercase text-vcdc-cog">
            History
          </h2>
          <ul className="mt-2 divide-y divide-vcdc-cog/20 rounded-lg border border-vcdc-cog/30">
            {versions.map((version) => (
              <li
                key={version.version}
                className="flex items-baseline justify-between px-4 py-2 text-sm"
              >
                <span>Version {version.version}</span>
                <span className="text-xs text-vcdc-cog">
                  {version.effectiveFrom.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
