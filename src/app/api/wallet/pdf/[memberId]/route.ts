import { type NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { members } from '@/lib/db/schema'
import {
  buildMemberCardPdf,
  memberCardFilename,
  memberCardStatus,
} from '@/lib/pdf/card'
import { verifyDownloadToken } from '@/lib/wallet/token'

// Printable membership card download, same signed expiring token guard as
// the Apple and Google routes: /api/wallet/pdf/{id}?t={token}.
//
// This is the one credential that needs no external vendor account, so it
// works as soon as QR_SIGNING_SECRET is set. It is the interim card for
// iPhone members while Apple Developer enrollment is pending.

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

  const status = memberCardStatus()
  if (!status.configured) {
    return NextResponse.json(
      {
        error:
          'The membership card is not configured yet. Set the missing environment variables in Vercel and redeploy. See WALLET-SETUP.md.',
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

  const pdf = await buildMemberCardPdf(member)

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      // inline so a phone opens it in the viewer rather than dumping it in
      // Files, which is where members lose it.
      'Content-Disposition': `inline; filename="${memberCardFilename(member)}"`,
      'Cache-Control': 'no-store',
    },
  })
}
