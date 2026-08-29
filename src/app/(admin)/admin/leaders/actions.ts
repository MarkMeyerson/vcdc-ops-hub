'use server'

import { eq, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db/client'
import { members, rideLeaders } from '@/lib/db/schema'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient, findUserByEmail } from '@/lib/supabase/admin'

// Ride leader accounts.
//
// Two separate things have to line up before a leader can do anything:
//
//   an auth user carrying role: ride_leader in app_metadata, which is what
//   the JWT and every RLS policy read, and
//   a row in ride_leaders, which is what rides are owned by.
//
// This action does both at once, because doing one without the other
// produces a leader who can log in and see nothing, or a roster entry that
// nobody can sign in as, and both look like the app is broken.

const schema = z.object({
  fullName: z.string().trim().min(1, 'Enter their name'),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email('Enter a valid email address')),
  memberNumber: z
    .string()
    .trim()
    .transform((v) => (v === '' ? null : v))
    .refine((v) => v === null || /^\d{1,9}$/.test(v), {
      message: 'A member number is digits only, or leave it blank',
    }),
})

export type LeaderState = { error: string | null; notice: string | null }

export async function addLeader(
  _prev: LeaderState,
  formData: FormData
): Promise<LeaderState> {
  await requireAdmin()

  const parsed = schema.safeParse({
    fullName: formData.get('fullName') ?? '',
    email: formData.get('email') ?? '',
    memberNumber: formData.get('memberNumber') ?? '',
  })
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? 'Check the form',
      notice: null,
    }
  }

  let memberId: string | null = null
  if (parsed.data.memberNumber) {
    const [member] = await db
      .select({ id: members.id })
      .from(members)
      .where(eq(members.memberNumber, Number(parsed.data.memberNumber)))
      .limit(1)
    if (!member) {
      return {
        error: `No member has number ${parsed.data.memberNumber}. Leave it blank if they are not a member.`,
        notice: null,
      }
    }
    memberId = member.id
  }

  // The auth user first. If this fails there is no half-made leader row to
  // clean up, and the admin sees the real reason.
  let userId: string | null = null
  try {
    const existing = await findUserByEmail(parsed.data.email)
    const supabase = createAdminClient()

    if (existing) {
      // Never demote an admin into a ride leader by adding them to the
      // roster: admins already pass the ride guard.
      const currentRole = existing.app_metadata?.role
      if (currentRole !== 'admin') {
        const { error } = await supabase.auth.admin.updateUserById(existing.id, {
          app_metadata: { ...existing.app_metadata, role: 'ride_leader' },
        })
        if (error) throw error
      }
      userId = existing.id
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        email: parsed.data.email,
        email_confirm: true,
        app_metadata: { role: 'ride_leader' },
      })
      if (error) throw error
      userId = data.user?.id ?? null
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      error: `Could not create the sign-in account: ${message}`,
      notice: null,
    }
  }

  try {
    await db
      .insert(rideLeaders)
      .values({
        userId,
        email: parsed.data.email,
        fullName: parsed.data.fullName,
        memberId,
        active: true,
      })
      .onConflictDoUpdate({
        target: rideLeaders.email,
        set: {
          userId,
          fullName: parsed.data.fullName,
          memberId,
          active: true,
        },
      })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { error: `Could not save the leader: ${message}`, notice: null }
  }

  revalidatePath('/admin/leaders')
  return {
    error: null,
    notice: `${parsed.data.fullName} can now sign in at the login page with ${parsed.data.email}. They request a sign-in link; there is no password to send.`,
  }
}

export async function setLeaderActive(
  leaderId: string,
  active: boolean
): Promise<{ ok: boolean; error: string | null }> {
  await requireAdmin()
  await db
    .update(rideLeaders)
    .set({ active })
    .where(eq(rideLeaders.id, leaderId))
  revalidatePath('/admin/leaders')
  return { ok: true, error: null }
}

export type LeaderRow = {
  id: string
  fullName: string
  email: string
  active: boolean
  linked: boolean
  memberNumber: number | null
  rideCount: number
}

export async function listLeaders(): Promise<LeaderRow[]> {
  await requireAdmin()
  const rows = await db
    .select({
      id: rideLeaders.id,
      fullName: rideLeaders.fullName,
      email: rideLeaders.email,
      active: rideLeaders.active,
      userId: rideLeaders.userId,
      memberNumber: members.memberNumber,
      rideCount: sql<number>`(
        select count(*)::int from rides r where r.ride_leader_id = ${rideLeaders.id}
      )`,
    })
    .from(rideLeaders)
    .leftJoin(members, eq(members.id, rideLeaders.memberId))
    .orderBy(rideLeaders.fullName)

  return rows.map((row) => ({
    id: row.id,
    fullName: row.fullName,
    email: row.email,
    active: row.active,
    linked: row.userId !== null,
    memberNumber: row.memberNumber,
    rideCount: row.rideCount,
  }))
}
