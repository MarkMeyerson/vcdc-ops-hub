'use server'

import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { members } from '@/lib/db/schema'
import { requireAdmin } from '@/lib/auth'
import { classifyScan, memberGaps, type ScanOutcome } from '@/lib/scan/resolve'

// Scan lookup for ride sign-in.
//
// Online only for now, which is deliberate and temporary: the brief's target
// is a scanner that runs entirely against a synced roster in IndexedDB with
// zero network calls, because the start point of a ride is usually a gravel
// lot with one bar of signal. That is Slice 6. This is Slice 5, where the
// point is proving the camera and the payload work on the leaders' actual
// phones before building an offline layer on top.

export type ScanResult =
  | { ok: true; outcome: ScanOutcome }
  | { ok: false; error: string }

export async function lookupScan(raw: string): Promise<ScanResult> {
  await requireAdmin()

  const classified = classifyScan(raw)

  if (classified.kind === 'not-ours') {
    return { ok: true, outcome: { kind: 'not-ours', raw } }
  }
  if (classified.kind === 'tampered') {
    return { ok: true, outcome: { kind: 'tampered', raw } }
  }
  if (classified.kind === 'guest') {
    return {
      ok: true,
      outcome: {
        kind: 'guest',
        guestNumber: classified.guestNumber,
        qrToken: classified.qrToken,
      },
    }
  }

  const [member] = await db
    .select()
    .from(members)
    .where(eq(members.memberNumber, classified.memberNumber))
    .limit(1)

  if (!member) {
    return {
      ok: true,
      outcome: {
        kind: 'unknown-member',
        memberNumber: classified.memberNumber,
      },
    }
  }

  // A signature can be valid while the membership is not. The leader still
  // sees who it is, because turning somebody away is a conversation, not an
  // error state.
  const today = new Date().toISOString().slice(0, 10)
  if (member.expiresAt < today) {
    return { ok: true, outcome: { kind: 'expired-member', member } }
  }

  return {
    ok: true,
    outcome: { kind: 'member', member, gaps: memberGaps(member) },
  }
}

const contactSchema = z.object({
  memberId: z.string().uuid(),
  email: z
    .string()
    .trim()
    .transform((v) => (v === '' ? null : v))
    .refine((v) => v === null || z.email().safeParse(v).success, {
      message: 'Enter a valid email or leave it blank',
    }),
  phone: z
    .string()
    .trim()
    .transform((v) => (v === '' ? null : v)),
})

export type ContactState = { error: string | null; saved: boolean }

// Fills a contact gap from the parking lot. Blank leaves the current value
// alone, matching the bulk update: a leader who only got a phone number must
// not wipe an email somebody else collected last month.
export async function saveContact(
  _prev: ContactState,
  formData: FormData
): Promise<ContactState> {
  await requireAdmin()

  const parsed = contactSchema.safeParse({
    memberId: formData.get('memberId'),
    email: formData.get('email') ?? '',
    phone: formData.get('phone') ?? '',
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form', saved: false }
  }

  const patch: { email?: string; phone?: string; updatedAt: Date } = {
    updatedAt: new Date(),
  }
  if (parsed.data.email) patch.email = parsed.data.email
  if (parsed.data.phone) patch.phone = parsed.data.phone

  if (!patch.email && !patch.phone) {
    return { error: 'Nothing to save.', saved: false }
  }

  try {
    await db
      .update(members)
      .set(patch)
      .where(eq(members.id, parsed.data.memberId))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes('duplicate key')) {
      return {
        error: 'Another member already has that email address.',
        saved: false,
      }
    }
    throw err
  }

  return { error: null, saved: true }
}
