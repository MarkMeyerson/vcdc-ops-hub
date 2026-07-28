import Link from 'next/link'
import { notFound } from 'next/navigation'
import { eq } from 'drizzle-orm'
import QRCode from 'qrcode'
import { db } from '@/lib/db/client'
import { members, type Member } from '@/lib/db/schema'
import { requireAdmin } from '@/lib/auth'
import { buildMemberQrPayload, qrSigningConfigured } from '@/lib/qr/payload'
import { appleWalletStatus } from '@/lib/wallet/apple'
import { createDownloadToken } from '@/lib/wallet/token'

// Per-member wallet pass page: a faithful preview of the Apple pass, the
// member's signed QR, and a second QR that downloads the real .pkpass on
// an iPhone once signing certificates are configured.

const tierLabels: Record<Member['membershipTier'], string> = {
  regular: 'Regular',
  lifetime: 'Lifetime',
  honorary: 'Honorary',
}

function displayDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

async function qrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 480,
    color: { dark: '#2b2d2e', light: '#ffffff' },
  })
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
  const apple = appleWalletStatus()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL

  let payload: string | null = null
  let payloadQr: string | null = null
  let downloadUrl: string | null = null
  let downloadQr: string | null = null

  if (signingReady) {
    payload = buildMemberQrPayload(member.memberNumber)
    payloadQr = await qrDataUrl(payload)
    if (appUrl) {
      downloadUrl = `${appUrl}/api/wallet/apple/${member.id}?t=${createDownloadToken(member.id)}`
      downloadQr = await qrDataUrl(downloadUrl)
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
        Wallet pass: {member.firstName} {member.lastName}
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
            The real pass uses this exact layout and the same QR. The icon is
            a placeholder until club artwork is added.
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
                The pass retires itself in Apple Wallet at the expiry date.
              </p>
              <Link
                href={`/admin/members/${member.id}/edit`}
                className="mt-2 inline-block font-medium text-vcdc-amber hover:underline"
              >
                Change dates
              </Link>
            </div>
          </div>

          <div>
            <h2 className="text-sm font-medium uppercase text-vcdc-cog">
              Add to iPhone
            </h2>
            <div className="mt-3 rounded-lg border border-vcdc-cog/30 p-4">
              {!signingReady ? (
                <p className="text-sm">
                  Set QR_SIGNING_SECRET in Vercel (generate one with
                  <span className="mx-1 rounded bg-vcdc-cog/10 px-1 font-mono text-xs">
                    openssl rand -hex 32
                  </span>
                  ), redeploy, and this section activates.
                </p>
              ) : !appUrl ? (
                <p className="text-sm">
                  Set NEXT_PUBLIC_APP_URL in Vercel so the download link can
                  be built, then redeploy.
                </p>
              ) : (
                <>
                  <div className="flex items-start gap-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={downloadQr!}
                      alt="Pass download QR code"
                      className="h-32 w-32 rounded border border-vcdc-cog/20"
                    />
                    <p className="text-sm">
                      Scan with the iPhone camera. Safari downloads the pass
                      and offers Add to Wallet. The link is signed and
                      expires after 30 days.
                    </p>
                  </div>
                  {!apple.configured && (
                    <div className="mt-3 rounded-md bg-vcdc-sunburst/40 p-3 text-xs">
                      <p className="font-medium">
                        Signing is not configured yet, so the download
                        returns an explanatory error for now.
                      </p>
                      <p className="mt-1">
                        Still needed in Vercel: {apple.missing.join(', ')}.
                        The exact click-path is in WALLET-SETUP.md.
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

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
