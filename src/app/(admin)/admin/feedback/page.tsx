import type { Metadata } from 'next'
import { requireAdmin } from '@/lib/auth'
import { feedbackForAdmin } from '@/lib/feedback/queries'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Feedback | VCDC',
  robots: { index: false, follow: false },
}

const TYPE_LABELS: Record<string, string> = {
  bug: 'Something broke',
  confusing: 'Confusing',
  idea: 'Idea',
  question: 'Question',
  other: 'Other',
}

export default async function FeedbackPage() {
  await requireAdmin()
  const feedback = await feedbackForAdmin()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Feedback</h1>
        <p className="mt-1 text-sm text-vcdc-cog">
          Everything sent from the always-there feedback button in the ride
          leader app, newest first. This is what used to get typed into the
          Notion feedback database by hand.
        </p>
      </div>

      {feedback.length === 0 ? (
        <p className="text-sm text-vcdc-cog">Nothing sent yet.</p>
      ) : (
        <ul className="divide-y divide-vcdc-cog/20 rounded-lg border border-vcdc-cog/30">
          {feedback.map((row) => (
            <li key={row.id} className="p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-vcdc-amber/20 px-2 py-0.5 text-xs font-medium">
                    {TYPE_LABELS[row.type] ?? row.type}
                  </span>
                  <span className="font-medium">{row.leaderName}</span>
                </div>
                <span className="text-xs text-vcdc-cog">
                  {row.createdAt.toLocaleString()}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap">{row.message}</p>
              <p className="mt-2 font-mono text-xs text-vcdc-cog">{row.path}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
