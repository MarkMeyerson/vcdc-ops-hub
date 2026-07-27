'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { eq, max } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { members } from '@/lib/db/schema'
import { requireAdmin } from '@/lib/auth'

const memberSchema = z.object({
  memberNumber: z.coerce.number().int().min(1, 'Member number is required'),
  firstName: z.string().trim().min(1, 'First name is required'),
  lastName: z.string().trim().min(1, 'Last name is required'),
  email: z.string().trim().email('A valid email is required'),
  phone: z
    .string()
    .trim()
    .transform((v) => (v === '' ? null : v)),
  membershipTier: z.enum(['regular', 'lifetime', 'honorary']),
  joinedAt: z.string().date('Joined date is required'),
  expiresAt: z.string().date('Expiry date is required'),
})

export type MemberFormState = {
  error: string | null
  values?: Record<string, string>
}

function formValues(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {}
  formData.forEach((value, key) => {
    if (typeof value === 'string') out[key] = value
  })
  return out
}

function parseMember(formData: FormData) {
  return memberSchema.safeParse({
    memberNumber: formData.get('memberNumber'),
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName'),
    email: formData.get('email'),
    phone: formData.get('phone') ?? '',
    membershipTier: formData.get('membershipTier'),
    joinedAt: formData.get('joinedAt'),
    expiresAt: formData.get('expiresAt'),
  })
}

// Postgres unique_violation, surfaced as a friendly message.
function uniqueError(err: unknown): string | null {
  const message = err instanceof Error ? err.message : String(err)
  if (!message.includes('duplicate key')) return null
  if (message.includes('member_number')) {
    return 'That member number is already taken.'
  }
  if (message.includes('email')) {
    return 'A member with that email already exists.'
  }
  return 'A member with those details already exists.'
}

export async function createMember(
  _prev: MemberFormState,
  formData: FormData
): Promise<MemberFormState> {
  await requireAdmin()

  const parsed = parseMember(formData)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return { error: first?.message ?? 'Invalid input', values: formValues(formData) }
  }

  try {
    await db.insert(members).values(parsed.data)
  } catch (err) {
    const friendly = uniqueError(err)
    if (friendly) return { error: friendly, values: formValues(formData) }
    throw err
  }

  revalidatePath('/admin/members')
  redirect('/admin/members')
}

export async function updateMember(
  id: string,
  _prev: MemberFormState,
  formData: FormData
): Promise<MemberFormState> {
  await requireAdmin()

  const parsed = parseMember(formData)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return { error: first?.message ?? 'Invalid input', values: formValues(formData) }
  }

  try {
    await db.update(members).set(parsed.data).where(eq(members.id, id))
  } catch (err) {
    const friendly = uniqueError(err)
    if (friendly) return { error: friendly, values: formValues(formData) }
    throw err
  }

  revalidatePath('/admin/members')
  redirect('/admin/members')
}

export async function deleteMember(id: string) {
  await requireAdmin()
  await db.delete(members).where(eq(members.id, id))
  revalidatePath('/admin/members')
}

// Prefill for the new-member form. Existing GoDaddy-assigned numbers can
// always be typed over this suggestion; nothing enforces the sequence.
export async function suggestNextMemberNumber(): Promise<number> {
  await requireAdmin()
  const [row] = await db
    .select({ maxNumber: max(members.memberNumber) })
    .from(members)
  return row?.maxNumber != null ? row.maxNumber + 1 : 10001
}
