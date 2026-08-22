import type { Metadata } from 'next'
import Link from 'next/link'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { members } from '@/lib/db/schema'
import { displayDate, tierLabels } from '@/lib/display'
import { memberCardStatus } from '@/lib/pdf/card'
import { appleWalletStatus } from '@/lib/wallet/apple'
import { googleWalletStatus } from '@/lib/wallet/google'
import { createDownloadToken } from '@/lib/wallet/token'

// A member's permanent card link, the one the club emails out.
//
// The URL carries the member's row id and never changes, but the download
// links on the page are minted fresh on every render and expire in 30 days.
// That split is the point: the club can send this link once and keep it in
// old emails forever, while the files behind it stay short-lived and signed.
//
// It is also why the link works as a placeholder. Apple and Google are not
// configured yet, so today the page offers the printable card alone. Switch
// either one on in Vercel and its button appears here for every member at
// once, with no second email.
//
// Members have no accounts, so holding the URL is what proves membership.
// The page shows nothing the printed card does not already show.

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Your membership card | VCDC',
  // A forwarded link should never end up in search results.
  robots: { index: false, follow: false },
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-vcdc-sky/20 p-4">
      <div className="w-full max-w-sm rounded-lg border border-vcdc-cog/30 bg-white p-8 shadow-sm">
        {children}
      </div>
    </main>
  )
}

function NotRecognised() {
  return (
    <Shell>
      <h1 className="text-xl font-semibold">We do not recognise that link</h1>
      <p className="mt-2 text-sm text-vcdc-cog">
        It may have been mistyped, or cut short by an email program. Try
        opening it again from the original message.
      </p>
      <p className="mt-4 text-sm text-vcdc-cog">
        You can also look your card up with your member number and last name.
      </p>
      <Link
        href="/card"
        className="mt-2 inline-block text-sm font-medium text-vcdc-amber hover:underline"
      >
        Find my card
      </Link>
    </Shell>
  )
}

export default async function MemberCardPage({
  params,
}: {
  params: Promise<{ memberId: string }>
}) {
  const { memberId } = await params

  // Anything that is not a uuid cannot be a member, and asking Postgres to
  // compare it against a uuid column raises rather than returning nothing.
  if (!/^[0-9a-f-]{36}$/.test(memberId)) return <NotRecognised />

  const [member] = await db
    .select()
    .from(members)
    .where(eq(members.id, memberId))
    .limit(1)

  if (!member) return <NotRecognised />

  const today = new Date().toISOString().slice(0, 10)
  const expired = member.expiresAt < today

  const cardStatus = memberCardStatus()
  const google = googleWalletStatus()
  const apple = appleWalletStatus()

  // Relative links: the browser already knows the host, so this page does
  // not depend on NEXT_PUBLIC_APP_URL being set.
  const token = createDownloadToken(member.id)
  const link = (surface: string) =>
    `/api/wallet/${surface}/${member.id}?t=${token}`

  return (
    <Shell>
      <p className="text-xs font-semibold uppercase tracking-wider text-vcdc-cog">
        Vespa Club of D.C.
      </p>
      <h1 className="mt-1 text-xl font-semibold">
        {member.firstName} {member.lastName}
      </h1>

      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-vcdc-cog">Member number</dt>
          <dd className="font-mono font-medium">{member.memberNumber}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-vcdc-cog">Tier</dt>
          <dd className="font-medium">{tierLabels[member.membershipTier]}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-vcdc-cog">{expired ? 'Expired' : 'Expires'}</dt>
          <dd className="font-medium">{displayDate(member.expiresAt)}</dd>
        </div>
      </dl>

      {expired ? (
        <div className="mt-6 rounded-md bg-vcdc-sunburst/40 p-3 text-sm">
          <p className="font-medium">This membership has lapsed.</p>
          <p className="mt-1">
            Renew with the club and this same link will start working again.
            Nothing here needs to be re-sent.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {cardStatus.configured ? (
            <a
              href={link('pdf')}
              className="flex w-full items-center justify-center rounded-md bg-vcdc-amber px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-vcdc-amber/90"
            >
              Download my card (PDF)
            </a>
          ) : (
            <p className="rounded-md bg-vcdc-sunburst/40 p-3 text-sm">
              Cards are not switched on yet. Please try this link again later.
            </p>
          )}

          {google.configured && (
            <a
              href={link('google')}
              className="flex w-full items-center justify-center rounded-md border border-vcdc-cog/40 bg-white px-4 py-3 text-sm font-medium text-vcdc-charcoal transition-colors hover:bg-vcdc-cog/10"
            >
              Add to Google Wallet
            </a>
          )}

          {apple.configured && (
            <a
              href={link('apple')}
              className="flex w-full items-center justify-center rounded-md border border-vcdc-cog/40 bg-white px-4 py-3 text-sm font-medium text-vcdc-charcoal transition-colors hover:bg-vcdc-cog/10"
            >
              Add to Apple Wallet
            </a>
          )}
        </div>
      )}

      <p className="mt-6 border-t border-vcdc-cog/20 pt-4 text-xs text-vcdc-cog">
        {cardStatus.configured && !expired
          ? 'The PDF opens on your phone and prints at home. Save it, or keep this email and open the link whenever you need it. Show the code at ride sign-in.'
          : 'Keep this link. It stays valid and the card appears here as soon as it is ready.'}
      </p>
    </Shell>
  )
}
