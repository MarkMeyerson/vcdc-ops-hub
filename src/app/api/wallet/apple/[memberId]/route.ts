import { type NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { members } from '@/lib/db/schema'
import { appleWalletStatus, buildApplePass } from '@/lib/wallet/apple'
import { verifyDownloadToken } from '@/lib/wallet/token'

// Apple Wallet pass download. Unauthenticated by design (the member taps
// this from an email or scans it from the admin pass page), so the URL
// carries a signed expiring token: /api/wallet/apple/{id}?t={token}.
// Without a valid token the route 404s, keeping passes non-enumerable.
// pass generation happens synchronously inside the request (Section 7:
// no fire-and-forget work on serverless).

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

  const status = appleWalletStatus()
  if (!status.configured) {
    return NextResponse.json(
      {
        error:
          'Apple Wallet signing is not configured yet. Set the missing environment variables in Vercel and redeploy. See WALLET-SETUP.md.',
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

  const buffer = await buildApplePass(member)

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.apple.pkpass',
      'Content-Disposition': `attachment; filename="vcdc-member-${member.memberNumber}.pkpass"`,
      'Cache-Control': 'no-store',
    },
  })
}
