'use server'

import { z } from 'zod'
import { db } from '@/lib/db/client'
import { appFeedback } from '@/lib/db/schema'
import { requireRideAccess } from '@/lib/auth'

// Backs the always-available feedback widget (src/components/feedback-widget.tsx),
// mounted once in the ride layout so it is reachable from any leader-facing
// screen, ride or no ride. Guards first, same rule as every action in
// src/app/ride/actions.ts: the Drizzle connection bypasses RLS.

const feedbackSchema = z.object({
  path: z.string().trim().min(1).max(500),
  message: z.string().trim().min(1, 'Say a bit about what happened').max(2000),
  type: z.enum(['bug', 'confusing', 'idea', 'question', 'other']),
  userAgent: z.string().trim().max(500).optional(),
})

export type SubmitFeedbackResult = { ok: boolean; error: string | null }

export async function submitFeedback(input: {
  path: string
  message: string
  type: string
  userAgent?: string
}): Promise<SubmitFeedbackResult> {
  const actor = await requireRideAccess()

  const parsed = feedbackSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the form' }
  }

  await db.insert(appFeedback).values({
    rideLeaderId: actor.leaderId,
    path: parsed.data.path,
    message: parsed.data.message,
    type: parsed.data.type,
    userAgent: parsed.data.userAgent ?? null,
  })

  return { ok: true, error: null }
}
