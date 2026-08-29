'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { waiverVersions } from '@/lib/db/schema'
import { requireAdmin } from '@/lib/auth'

// Publishing waiver text.
//
// Insert only. There is no edit and no delete on purpose: every signature
// points at a version number, and a version whose text can change afterwards
// evidences nothing. Fixing a typo means publishing version 4; version 3
// stays exactly as the people who signed it saw it.

const schema = z.object({
  bodyMarkdown: z
    .string()
    .trim()
    .min(200, 'That looks too short to be a waiver. Paste the full text.'),
})

export type PublishState = { error: string | null; version: number | null }

export async function publishWaiver(
  _prev: PublishState,
  formData: FormData
): Promise<PublishState> {
  const admin = await requireAdmin()

  const parsed = schema.safeParse({
    bodyMarkdown: formData.get('bodyMarkdown') ?? '',
  })
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? 'Check the text',
      version: null,
    }
  }

  const [created] = await db
    .insert(waiverVersions)
    .values({
      bodyMarkdown: parsed.data.bodyMarkdown,
      createdBy: admin.userId,
    })
    .returning({ version: waiverVersions.version })

  if (!created) {
    return { error: 'Could not publish the text.', version: null }
  }

  revalidatePath('/admin/waiver')
  revalidatePath('/waiver')
  return { error: null, version: created.version }
}
