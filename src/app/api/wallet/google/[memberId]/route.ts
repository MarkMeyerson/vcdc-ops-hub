import { type NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { members } from '@/lib/db/schema'
import { buildGoogleSaveUrl, googleWalletStatus } from '@/lib/wallet/google'
import { verifyDownloadToken } from '@/lib/wallet/token'

// Save to Google Wallet redirect, the Android counterpart to the Apple
// .pkpass download. Same signed expiring token guard, so passes stay
// non-enumerable: /api/wallet/google/{id}?t={token}.
//
// Why a redirect rather than handing out the Google link directly: the save
// JWT carries the whole pass inline and runs well over a thousand
// characters, which makes an unscannable QR code. This route keeps the URL
// short enough to scan and mints a fresh JWT on each visit.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ memberId: string }> }
) {
  const { memberId } = await params
  const token = request.nextUrl.searchParams.get('t')

  if (!/^[0-9a-f-]{36}$/.test(memberId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  let authorized = false
  try {
    authorized = verifyDownloadToken(memberId, token)
  } catch {
    // QR_SIGNING_SECRET unset: fall through to the status branch below,
    // which names the missing configuration instead of a bare 404.
  }

  const status = googleWalletStatus()
  if (!status.configured) {
    return NextResponse.json(
      {
        error:
          'Google Wallet is not configured yet. Set the missing environment variables in Vercel and redeploy. See WALLET-SETUP.md.',
        missing: status.missing,
      },
      { status: 503 }
    )
  }

  if (!authorized) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const [member] = await db
    .select()
    .from(members)
    .where(eq(members.id, memberId))
    .limit(1)

  if (!member) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.redirect(buildGoogleSaveUrl(member), {
    status: 302,
    headers: { 'Cache-Control': 'no-store' },
  })
}
