'use server'

import { revalidatePath } from 'next/cache'
import { asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { members } from '@/lib/db/schema'
import { requireAdmin } from '@/lib/auth'
import { planImport, type ImportPlan } from '@/lib/member-import'

// Upload is two deliberate steps. The first produces a plan and writes
// nothing; the second applies it.
//
// The uploaded text is carried between them rather than the plan, and the
// plan is derived again at apply time. That means there is one code path
// from a file to a change, the browser cannot hand back an edited plan that
// skips validation, and a member edited in another tab between the two
// steps is diffed against their current row rather than a stale one.

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024

export type ImportState = {
  stage: 'idle' | 'preview' | 'applied'
  plan: ImportPlan | null
  csvText: string | null
  error: string | null
  appliedCount?: number
}

export const initialImportState: ImportState = {
  stage: 'idle',
  plan: null,
  csvText: null,
  error: null,
}

async function currentRoster() {
  return db.select().from(members).orderBy(asc(members.memberNumber))
}

export async function previewImport(
  _prev: ImportState,
  formData: FormData
): Promise<ImportState> {
  await requireAdmin()

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return { ...initialImportState, error: 'Choose a CSV file first.' }
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      ...initialImportState,
      error: 'That file is larger than 2 MB, which is far larger than the roster. Check it is the right file.',
    }
  }

  const csvText = await file.text()
  const plan = planImport(csvText, await currentRoster())

  return { stage: 'preview', plan, csvText, error: null }
}

export async function applyImport(
  _prev: ImportState,
  formData: FormData
): Promise<ImportState> {
  await requireAdmin()

  const csvText = formData.get('csvText')
  if (typeof csvText !== 'string' || csvText === '') {
    return { ...initialImportState, error: 'Nothing to apply. Upload the file again.' }
  }

  const plan = planImport(csvText, await currentRoster())

  if (plan.errors.length > 0) {
    return {
      stage: 'preview',
      plan,
      csvText,
      error:
        'The file no longer applies cleanly, so nothing was changed. Review the problems below.',
    }
  }
  if (plan.changes.length === 0) {
    return {
      stage: 'preview',
      plan,
      csvText,
      error: 'There is nothing left to change. Someone may have applied this already.',
    }
  }

  await db.transaction(async (tx) => {
    // Email is unique and these updates run one statement at a time, so two
    // members swapping addresses would collide on whichever went first even
    // though the end state is valid. Releasing every address that is about
    // to move, before assigning any, makes the order stop mattering. It is
    // invisible outside the transaction.
    const movingEmail = plan.changes.filter((row) =>
      row.changes.some((change) => change.field === 'email')
    )
    for (const row of movingEmail) {
      await tx
        .update(members)
        .set({ email: null })
        .where(eq(members.id, row.memberId))
    }

    for (const row of plan.changes) {
      const patch: Record<string, string> = {}
      for (const change of row.changes) {
        if (change.to !== null) patch[change.field] = change.to
      }
      await tx
        .update(members)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(members.id, row.memberId))
    }
  })

  revalidatePath('/admin')
  revalidatePath('/admin/members')
  revalidatePath('/admin/members/review')
  revalidatePath('/admin/members/links')

  return {
    stage: 'applied',
    plan: null,
    csvText: null,
    error: null,
    appliedCount: plan.changes.length,
  }
}
