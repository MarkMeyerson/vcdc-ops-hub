import Link from 'next/link'
import { asc } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { members } from '@/lib/db/schema'
import { requireAdmin } from '@/lib/auth'
import { displayDate } from '@/lib/display'
import {
  EXPIRING_SOON_DAYS,
  FLAG_ORDER,
  FLAG_SPECS,
  reviewRoster,
} from '@/lib/member-health'

// The dashboard answers one question: what needs a person today. Counts are
// of people rather than of findings, because a member with three gaps is
// one member to chase.

export const dynamic = 'force-dynamic'

function Tile({
  label,
  value,
  tone,
  note,
  href,
}: {
  label: string
  value: number
  tone: 'good' | 'warn' | 'bad' | 'plain'
  note: string
  href?: string
}) {
  const valueTone = {
    good: 'text-vcdc-green',
    warn: 'text-vcdc-amber',
    bad: 'text-vcdc-red',
    plain: '',
  }[tone]

  const body = (
    <>
      <p className="text-sm text-vcdc-cog">{label}</p>
      <p className={`mt-1 text-3xl font-semibold ${valueTone}`}>{value}</p>
      <p className="mt-1 text-xs text-vcdc-cog">{note}</p>
    </>
  )

  if (!href) {
    return (
      <div className="rounded-lg border border-vcdc-cog/30 p-6">{body}</div>
    )
  }

  return (
    <Link
      href={href}
      className="block rounded-lg border border-vcdc-cog/30 p-6 transition-colors hover:border-vcdc-amber hover:bg-vcdc-amber/5"
    >
      {body}
    </Link>
  )
}

export default async function AdminHome() {
  await requireAdmin()

  const roster = await db
    .select()
    .from(members)
    .orderBy(asc(members.memberNumber))

  const today = new Date().toISOString().slice(0, 10)
  const review = reviewRoster(roster, today)

  const active = roster.filter((m) => m.expiresAt >= today).length
  const expiringSoon = review.byFlag['expiring-soon']
  const problems = FLAG_ORDER.filter(
    (flag) => FLAG_SPECS[flag].kind === 'problem'
  )

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label="Active members"
          value={active}
          tone="good"
          note={`of ${review.total} on the roster`}
        />
        <Tile
          label="Problems"
          value={review.countsByKind.problem}
          tone={review.countsByKind.problem > 0 ? 'bad' : 'plain'}
          note="Records that are wrong, not just thin"
          href="/admin/members/review"
        />
        <Tile
          label="Expiring soon"
          value={expiringSoon.length}
          tone={expiringSoon.length > 0 ? 'warn' : 'plain'}
          note={`Within ${EXPIRING_SOON_DAYS} days`}
          href="/admin/members/review#expiring-soon"
        />
        <Tile
          label="Missing information"
          value={review.countsByKind.missing}
          tone="plain"
          note="Members with a gap in their record"
          href="/admin/members/review#no-email"
        />
      </div>

      {review.countsByKind.problem > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-medium uppercase text-vcdc-cog">
            Needs a decision
          </h2>
          <div className="mt-3 divide-y divide-vcdc-cog/20 rounded-lg border border-vcdc-cog/30">
            {problems.map((flag) => {
              const affected = review.byFlag[flag]
              if (affected.length === 0) return null
              return (
                <Link
                  key={flag}
                  href={`/admin/members/review#${flag}`}
                  className="flex items-baseline justify-between gap-4 px-4 py-3 text-sm transition-colors hover:bg-vcdc-amber/5"
                >
                  <span>
                    <span className="font-medium">
                      {FLAG_SPECS[flag].label}
                    </span>
                    <span className="mt-0.5 block text-xs text-vcdc-cog">
                      {affected
                        .slice(0, 3)
                        .map((m) => `${m.firstName} ${m.lastName}`)
                        .join(', ')}
                      {affected.length > 3 && ` and ${affected.length - 3} more`}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-vcdc-red">
                    {affected.length}
                  </span>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {expiringSoon.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-medium uppercase text-vcdc-cog">
            Renewing next
          </h2>
          <div className="mt-3 divide-y divide-vcdc-cog/20 rounded-lg border border-vcdc-cog/30">
            {[...expiringSoon]
              .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt))
              .slice(0, 8)
              .map((member) => (
                <Link
                  key={member.id}
                  href={`/admin/members/${member.id}/edit`}
                  className="flex items-baseline justify-between gap-4 px-4 py-3 text-sm transition-colors hover:bg-vcdc-amber/5"
                >
                  <span>
                    {member.firstName} {member.lastName}
                    <span className="ml-2 font-mono text-xs text-vcdc-cog">
                      {member.memberNumber}
                    </span>
                  </span>
                  <span className="shrink-0 text-vcdc-cog">
                    {displayDate(member.expiresAt)}
                  </span>
                </Link>
              ))}
          </div>
        </section>
      )}

      <div className="mt-8 flex flex-wrap gap-4 text-sm font-medium">
        <Link href="/admin/members" className="text-vcdc-amber hover:underline">
          Manage members
        </Link>
        <Link
          href="/admin/members/review"
          className="text-vcdc-amber hover:underline"
        >
          Roster review
        </Link>
        <Link
          href="/admin/members/links"
          className="text-vcdc-amber hover:underline"
        >
          Card links
        </Link>
      </div>
    </div>
  )
}
