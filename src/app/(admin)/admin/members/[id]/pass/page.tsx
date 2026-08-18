import Link from 'next/link'
import { notFound } from 'next/navigation'
import { eq } from 'drizzle-orm'
import QRCode from 'qrcode'
import { db } from '@/lib/db/client'
import { members } from '@/lib/db/schema'
import { requireAdmin } from '@/lib/auth'
import { appOrigin, displayDate, tierLabels } from '@/lib/display'
import { buildMemberQrPayload, qrSigningConfigured } from '@/lib/qr/payload'
import { memberCardStatus } from '@/lib/pdf/card'
import { appleWalletStatus } from '@/lib/wallet/apple'
import { googleWalletStatus } from '@/lib/wallet/google'
import { createDownloadToken } from '@/lib/wallet/token'

// Per-member membership card page: a faithful preview of the pass, the
// member's signed QR, and one download QR per way of carrying the card. All
// three carry the same signed payload, so a ride leader scan resolves to the
// same member whichever one a rider shows.

async function qrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 480,
    color: { dark: '#2b2d2e', light: '#ffffff' },
  })
}

type DeliveryOption = {
  key: string
  title: string
  instructions: string
  qr: string
  status: { configured: boolean; missing: string[] }
  pendingNote: string
  // Set when the file is useful on a desktop too, so an admin can download
  // it and attach it to an email by hand until Slice 7 sends it for them.
  href?: string
  hrefLabel?: string
}

function DeliveryBlock({ option }: { option: DeliveryOption }) {
  return (
    <div>
      <h2 className="text-sm font-medium uppercase text-vcdc-cog">
        {option.title}
      </h2>
      <div className="mt-3 rounded-lg border border-vcdc-cog/30 p-4">
        <div className="flex items-start gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={option.qr}
            alt={`${option.title} QR code`}
            className="h-32 w-32 rounded border border-vcdc-cog/20"
          />
          <div>
            <p className="text-sm">{option.instructions}</p>
            {option.href && (
              <a
                href={option.href}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block text-sm font-medium text-vcdc-amber hover:underline"
              >
                {option.hrefLabel}
              </a>
            )}
          </div>
        </div>
        {!option.status.configured && (
          <div className="mt-3 rounded-md bg-vcdc-sunburst/40 p-3 text-xs">
            <p className="font-medium">{option.pendingNote}</p>
            <p className="mt-1">
              Still needed in Vercel: {option.status.missing.join(', ')}. The
              exact click-path is in WALLET-SETUP.md.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export default async function MemberPassPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireAdmin()
  const { id } = await params

  const [member] = await db.select().from(members).where(eq(members.id, id))
  if (!member) notFound()

  const signingReady = qrSigningConfigured()
  const appUrl = appOrigin()

  let payload: string | null = null
  let payloadQr: string | null = null
  let options: DeliveryOption[] = []

  if (signingReady) {
    payload = buildMemberQrPayload(member.memberNumber)
    payloadQr = await qrDataUrl(payload)

    if (appUrl) {
      // One token covers all three routes: same member, same expiry.
      const token = createDownloadToken(member.id)
      const link = (surface: string) =>
        `${appUrl}/api/wallet/${surface}/${member.id}?t=${token}`

      // Printable card first: it is the only one needing no vendor account,
      // so it is what the club can send members today.
      options = [
        {
          key: 'pdf',
          title: 'Printable card',
          instructions:
            'Scan with any phone camera to open the card as a PDF. Works on iPhone and Android, and prints on a home printer. Members can save it to their photos or keep the email.',
          qr: await qrDataUrl(link('pdf')),
          status: memberCardStatus(),
          pendingNote: 'The printable card is not configured yet.',
          href: link('pdf'),
          hrefLabel: 'Open the card here to save or email it',
        },
        {
          key: 'google',
          title: 'Add to Android',
          instructions:
            'Scan with the Android camera. Chrome opens Google Wallet and offers Save to Wallet. The link is signed and expires after 30 days.',
          qr: await qrDataUrl(link('google')),
          status: googleWalletStatus(),
          pendingNote:
            'Google Wallet is not configured yet, so the link returns an explanatory error for now.',
        },
        {
          key: 'apple',
          title: 'Add to iPhone',
          instructions:
            'Scan with the iPhone camera. Safari downloads the pass and offers Add to Wallet. The link is signed and expires after 30 days.',
          qr: await qrDataUrl(link('apple')),
          status: appleWalletStatus(),
          pendingNote:
            'Apple signing is not configured yet, so the download returns an explanatory error for now. Send the printable card in the meantime.',
        },
      ]
    }
  }

  return (
    <div className="max-w-3xl">
      <Link
        href="/admin/members"
        className="text-sm text-vcdc-cog hover:underline"
      >
        Back to members
      </Link>

      <h1 className="mt-2 text-2xl font-semibold">
        Membership card: {member.firstName} {member.lastName}
      </h1>

      <div className="mt-6 grid gap-8 md:grid-cols-2">
        <section>
          <h2 className="text-sm font-medium uppercase text-vcdc-cog">
            Pass preview
          </h2>
          <div className="mt-3 rounded-2xl bg-vcdc-sky p-5 text-vcdc-charcoal shadow-md">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-semibold">
                Vespa Club of D.C.
              </span>
              <span className="text-xs font-semibold tracking-wide">
                VCDC MEMBER
              </span>
            </div>
            <p className="mt-6 text-2xl font-semibold">
              {member.firstName} {member.lastName}
            </p>
            <div className="mt-4 flex gap-10">
              <div>
                <p className="text-[10px] font-semibold tracking-wider">
                  MEMBER #
                </p>
                <p className="text-lg">{member.memberNumber}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold tracking-wider">
                  TIER
                </p>
                <p className="text-lg">{tierLabels[member.membershipTier]}</p>
              </div>
            </div>
            <div className="mt-3">
              <p className="text-[10px] font-semibold tracking-wider">
                EXPIRES
              </p>
              <p className="text-base">{displayDate(member.expiresAt)}</p>
            </div>
            <div className="mt-5 flex justify-center">
              {payloadQr ? (
                <div className="rounded-lg bg-white p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={payloadQr}
                    alt={`Member ${member.memberNumber} QR code`}
                    className="h-40 w-40"
                  />
                  <p className="mt-1 text-center font-mono text-xs">
                    Member {member.memberNumber}
                  </p>
                </div>
              ) : (
                <div className="rounded-lg bg-white/60 p-6 text-center text-xs">
                  QR appears once QR_SIGNING_SECRET is set
                </div>
              )}
            </div>
          </div>
          <p className="mt-2 text-xs text-vcdc-cog">
            The Apple pass, the Google pass, and the printable card all use
            this layout and this same QR. The icon is a placeholder until club
            artwork is added.
          </p>
        </section>

        <section className="space-y-6">
          <div>
            <h2 className="text-sm font-medium uppercase text-vcdc-cog">
              Membership dates
            </h2>
            <div className="mt-3 rounded-lg border border-vcdc-cog/30 p-4 text-sm">
              <div className="flex justify-between">
                <span>Starts (joined)</span>
                <span className="font-medium">
                  {displayDate(member.joinedAt)}
                </span>
              </div>
              <div className="mt-2 flex justify-between">
                <span>Expires</span>
                <span className="font-medium">
                  {displayDate(member.expiresAt)}
                </span>
              </div>
              <p className="mt-3 text-xs text-vcdc-cog">
                Both wallet passes retire themselves at the expiry date. The
                printable card shows it as text.
              </p>
              <Link
                href={`/admin/members/${member.id}/edit`}
                className="mt-2 inline-block font-medium text-vcdc-amber hover:underline"
              >
                Change dates
              </Link>
            </div>
          </div>

          {!signingReady ? (
            <div className="rounded-lg border border-vcdc-cog/30 p-4 text-sm">
              Set QR_SIGNING_SECRET in Vercel (generate one with
              <span className="mx-1 rounded bg-vcdc-cog/10 px-1 font-mono text-xs">
                openssl rand -hex 32
              </span>
              ), redeploy, and the delivery options activate.
            </div>
          ) : !appUrl ? (
            <div className="rounded-lg border border-vcdc-cog/30 p-4 text-sm">
              Set NEXT_PUBLIC_APP_URL in Vercel so the download links can be
              built, then redeploy.
            </div>
          ) : (
            options.map((option) => (
              <DeliveryBlock key={option.key} option={option} />
            ))
          )}

          {payload && (
            <div>
              <h2 className="text-sm font-medium uppercase text-vcdc-cog">
                QR payload
              </h2>
              <p className="mt-2 break-all rounded-md bg-vcdc-cog/10 p-3 font-mono text-xs">
                {payload}
              </p>
              <p className="mt-1 text-xs text-vcdc-cog">
                Signed with QR_SIGNING_SECRET. Ride leader scanners verify
                this signature offline against the synced roster.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
