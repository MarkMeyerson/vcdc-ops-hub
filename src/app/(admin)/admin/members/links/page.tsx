import Link from 'next/link'
import { asc } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { members } from '@/lib/db/schema'
import { requireAdmin } from '@/lib/auth'
import { appOrigin, displayDate, tierLabels } from '@/lib/display'
import { memberCardUrl } from '@/lib/member-links'

// The handoff page: every member, their number, and their permanent card
// link, plus the CSV to mail merge from. This is what gets sent to whoever
// is emailing members their cards.

export const dynamic = 'force-dynamic'

const EMAIL_TEMPLATE = `Subject: Your VCDC membership card

Hi {{first_name}},

Your Vespa Club of D.C. membership card is ready. Open this link on your
phone and tap Download:

{{card_url}}

It saves as a PDF you can keep on your phone or print at home. Your member
number is {{member_number}} and the card is good through {{expires}}.

Show the code at ride sign-in. The link keeps working, so hang on to this
email rather than the file if that is easier.

See you on a ride,
Vespa Club of D.C.`

export default async function MemberLinksPage() {
  await requireAdmin()

  const roster = await db
    .select()
    .from(members)
    .orderBy(asc(members.memberNumber))

  const today = new Date().toISOString().slice(0, 10)
  const origin = appOrigin()
  const expiredCount = roster.filter((m) => m.expiresAt < today).length

  return (
    <div className="max-w-5xl">
      <Link
        href="/admin/members"
        className="text-sm text-vcdc-cog hover:underline"
      >
        Back to members
      </Link>

      <div className="mt-2 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Card links</h1>
        {origin && (
          <a
            href="/admin/members/links/export"
            className="rounded-md bg-vcdc-amber px-4 py-2 text-sm font-medium text-white hover:bg-vcdc-amber/90"
          >
            Download CSV
          </a>
        )}
      </div>

      <p className="mt-3 max-w-2xl text-sm text-vcdc-cog">
        Each member has a permanent link to their own card. Email it to them
        individually. The link never expires, and when Google Wallet and Apple
        Wallet are switched on those buttons appear on the same page by
        themselves, so nothing has to be re-sent.
      </p>

      <div className="mt-4 rounded-md bg-vcdc-sunburst/30 p-3 text-sm">
        <p>
          <span className="font-medium">{roster.length} members</span> in the
          roster
          {expiredCount > 0 && (
            <>
              , <span className="font-medium">{expiredCount} expired</span>.
              Expired members get a renewal notice instead of a card, so their
              link is safe to send but will not produce a download
            </>
          )}
          . Anyone holding one of these links can open that member&rsquo;s
          card, so send them individually rather than posting the list.
        </p>
      </div>

      {!origin && (
        <div className="mt-4 rounded-md bg-vcdc-red/10 p-3 text-sm">
          <p className="font-medium">
            NEXT_PUBLIC_APP_URL is not set, so no links can be built.
          </p>
          <p className="mt-1">
            Set it in Vercel to the site address with no trailing slash, then
            redeploy and this page will fill in.
          </p>
        </div>
      )}

      {roster.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-vcdc-cog/40 p-10 text-center text-sm text-vcdc-cog">
          No members yet, so there is nothing to send.
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-lg border border-vcdc-cog/30">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-vcdc-cog/30 bg-vcdc-cog/10 text-xs uppercase text-vcdc-cog">
              <tr>
                <th className="px-4 py-3">Number</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Tier</th>
                <th className="px-4 py-3">Expires</th>
                <th className="px-4 py-3">Card link</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((member) => {
                const url = memberCardUrl(member)
                return (
                  <tr
                    key={member.id}
                    className="border-b border-vcdc-cog/20 last:border-0"
                  >
                    <td className="px-4 py-3 font-mono">
                      {member.memberNumber}
                    </td>
                    <td className="px-4 py-3">
                      {member.firstName} {member.lastName}
                    </td>
                    <td className="px-4 py-3">
                      {tierLabels[member.membershipTier]}
                    </td>
                    <td className="px-4 py-3">
                      {displayDate(member.expiresAt)}
                    </td>
                    <td className="px-4 py-3">
                      {url ? (
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="break-all font-mono text-xs text-vcdc-amber hover:underline"
                        >
                          {url}
                        </a>
                      ) : (
                        <span className="text-vcdc-cog/60">
                          Needs NEXT_PUBLIC_APP_URL
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-8">
        <h2 className="text-sm font-medium uppercase text-vcdc-cog">
          Email template
        </h2>
        <p className="mt-2 text-sm text-vcdc-cog">
          The fields in double braces match the CSV column names, so most mail
          merge tools will fill them in as-is.
        </p>
        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-md bg-vcdc-cog/10 p-4 text-xs">
          {EMAIL_TEMPLATE}
        </pre>
      </div>
    </div>
  )
}
