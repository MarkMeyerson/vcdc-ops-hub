import Link from 'next/link'
import { asc } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { members, type Member } from '@/lib/db/schema'
import { requireAdmin } from '@/lib/auth'
import { displayDate, tierLabels } from '@/lib/display'
import {
  FLAG_ORDER,
  FLAG_SPECS,
  reviewRoster,
  type Flag,
} from '@/lib/member-health'

// Everything the roster needs a human for, grouped by what is wrong. Each
// row links straight to that member's edit form, because every one of these
// is fixed in the same place.

export const dynamic = 'force-dynamic'

const KIND_HEADINGS = {
  problem: {
    title: 'Problems',
    blurb:
      'Something here is wrong rather than merely absent. These are worth fixing before the roster is used for anything.',
  },
  missing: {
    title: 'Missing information',
    blurb:
      'The club never collected this. Nothing is broken; these fill in over time as members are contacted.',
  },
  renewal: {
    title: 'Renewals',
    blurb:
      'Moving the expiry date is the whole of a renewal. A member’s card link never changes, so nothing has to be re-sent.',
  },
} as const

function FlagSection({ flag, roster }: { flag: Flag; roster: Member[] }) {
  const spec = FLAG_SPECS[flag]

  return (
    <div id={flag} className="scroll-mt-4 rounded-lg border border-vcdc-cog/30">
      <div className="border-b border-vcdc-cog/20 bg-vcdc-cog/5 px-4 py-3">
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="font-medium">{spec.label}</h3>
          <span className="shrink-0 text-sm text-vcdc-cog">
            {roster.length} {roster.length === 1 ? 'member' : 'members'}
          </span>
        </div>
        <p className="mt-1 text-xs text-vcdc-cog">{spec.explanation}</p>
      </div>
      <table className="w-full text-left text-sm">
        <tbody>
          {roster.map((member) => (
            <tr
              key={member.id}
              className="border-b border-vcdc-cog/15 last:border-0"
            >
              <td className="px-4 py-2 font-mono">{member.memberNumber}</td>
              <td className="px-4 py-2">
                {member.firstName} {member.lastName}
              </td>
              <td className="px-4 py-2 text-vcdc-cog">
                {tierLabels[member.membershipTier]}
              </td>
              <td className="px-4 py-2 text-vcdc-cog">
                {flag === 'placeholder-joined'
                  ? `joined ${displayDate(member.joinedAt)}`
                  : `expires ${displayDate(member.expiresAt)}`}
              </td>
              <td className="px-4 py-2 text-right">
                <Link
                  href={`/admin/members/${member.id}/edit`}
                  className="font-medium text-vcdc-amber hover:underline"
                >
                  Fix
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default async function MemberReviewPage() {
  await requireAdmin()

  const roster = await db
    .select()
    .from(members)
    .orderBy(asc(members.memberNumber))

  const today = new Date().toISOString().slice(0, 10)
  const review = reviewRoster(roster, today)

  const kinds = ['problem', 'missing', 'renewal'] as const

  return (
    <div className="max-w-4xl">
      <Link href="/admin" className="text-sm text-vcdc-cog hover:underline">
        Back to dashboard
      </Link>

      <h1 className="mt-2 text-2xl font-semibold">Roster review</h1>
      <p className="mt-2 text-sm text-vcdc-cog">
        {review.flaggedMembers.length} of {review.total} members need something.
        A member can appear in more than one list.
      </p>

      {review.flaggedMembers.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-vcdc-cog/40 p-10 text-center text-sm text-vcdc-cog">
          Nothing to fix. Every member has a full record and a current
          membership.
        </div>
      ) : (
        <div className="mt-8 space-y-10">
          {kinds.map((kind) => {
            const flags = FLAG_ORDER.filter(
              (flag) =>
                FLAG_SPECS[flag].kind === kind && review.byFlag[flag].length > 0
            )
            if (flags.length === 0) return null

            return (
              <section key={kind}>
                <h2 className="text-sm font-medium uppercase text-vcdc-cog">
                  {KIND_HEADINGS[kind].title}
                </h2>
                <p className="mt-1 max-w-2xl text-sm text-vcdc-cog">
                  {KIND_HEADINGS[kind].blurb}
                </p>
                <div className="mt-4 space-y-4">
                  {flags.map((flag) => (
                    <FlagSection
                      key={flag}
                      flag={flag}
                      roster={review.byFlag[flag]}
                    />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
