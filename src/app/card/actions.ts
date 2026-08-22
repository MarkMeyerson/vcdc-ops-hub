'use server'

import { redirect } from 'next/navigation'
import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { members } from '@/lib/db/schema'
import { displayDate } from '@/lib/display'
import { memberCardStatus } from '@/lib/pdf/card'
import { createDownloadToken } from '@/lib/wallet/token'

// Member-facing card lookup. Members have no accounts and most have no
// email on file, so the only thing they can prove is what is printed on
// their old card: the member number plus their own surname. That pair is
// the credential here.
//
// This deliberately does not confirm which half was wrong. Confirming the
// number exists would turn the form into a roster enumerator.

const lookupSchema = z.object({
  memberNumber: z.coerce
    .number('Enter your member number')
    .int('Enter your member number')
    .min(1, 'Enter your member number'),
  lastName: z.string().trim().min(1, 'Enter your last name'),
})

export type CardLookupState = {
  error: string | null
  values?: { memberNumber: string; lastName: string }
}

const NOT_FOUND =
  'We could not match that member number and last name. Check the spelling, or email the club and we will sort it out.'

export async function lookupCard(
  _prev: CardLookupState,
  formData: FormData
): Promise<CardLookupState> {
  const submitted = {
    memberNumber: String(formData.get('memberNumber') ?? ''),
    lastName: String(formData.get('lastName') ?? ''),
  }

  const parsed = lookupSchema.safeParse(submitted)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return { error: first?.message ?? 'Check the form', values: submitted }
  }

  const status = memberCardStatus()
  if (!status.configured) {
    return {
      error:
        'Membership cards are not switched on yet. Please try again later.',
      values: submitted,
    }
  }

  const [member] = await db
    .select({
      id: members.id,
      expiresAt: members.expiresAt,
    })
    .from(members)
    .where(
      and(
        eq(members.memberNumber, parsed.data.memberNumber),
        // Surnames get typed with stray case and spacing far more often
        // than they get typed exactly.
        sql`lower(trim(${members.lastName})) = lower(trim(${parsed.data.lastName}))`
      )
    )
    .limit(1)

  if (!member) {
    return { error: NOT_FOUND, values: submitted }
  }

  const today = new Date().toISOString().slice(0, 10)
  if (member.expiresAt < today) {
    return {
      error: `That membership expired on ${displayDate(member.expiresAt)}. Renew with the club and the card will work again.`,
      values: submitted,
    }
  }

  redirect(`/api/wallet/pdf/${member.id}?t=${createDownloadToken(member.id)}`)
}
