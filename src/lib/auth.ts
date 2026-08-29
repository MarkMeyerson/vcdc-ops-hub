import { redirect } from 'next/navigation'
import { eq, sql } from 'drizzle-orm'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db/client'
import { rideLeaders } from '@/lib/db/schema'

export type Role = 'admin' | 'ride_leader'

// Role comes from app_metadata, which only the service role can set.
// Never trust user_metadata for authorization: users can edit it.
export async function getUserRole(): Promise<{
  userId: string
  email: string | undefined
  role: Role | null
} | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const raw = user.app_metadata?.role
  const role: Role | null =
    raw === 'admin' || raw === 'ride_leader' ? raw : null
  return { userId: user.id, email: user.email, role }
}

// Data-access-layer guard for everything under /admin.
export async function requireAdmin() {
  const user = await getUserRole()
  if (!user) redirect('/login')
  if (user.role !== 'admin') redirect('/login?error=forbidden')
  return user
}

// Where a signed-in user belongs. Used by the login screen and the root
// route so a leader is never dropped on an admin page they cannot open.
export function homeFor(role: Role | null): string {
  if (role === 'admin') return '/admin'
  if (role === 'ride_leader') return '/ride'
  return '/login?error=forbidden'
}

export type RideActor = {
  userId: string
  email: string | undefined
  role: Role
  isAdmin: boolean
  leaderId: string
  leaderName: string
}

// Guard for everything under /ride.
//
// Admins pass too, and get a ride_leaders row created for them on the way
// through. The club has two admins and a handful of leaders, and the admins
// lead rides; making them create a second account to do it would guarantee
// that the ride they lead is the one nobody signs in for.
//
// The leader row is linked to the auth user on first visit rather than at
// account creation, because a leader can be added to the roster by email
// long before they ever click a sign-in link.
//
// Runs on the Drizzle connection, which is not subject to RLS. That is safe
// only because the role check above it has already happened; do not move
// these queries above it.
export async function requireRideAccess(): Promise<RideActor> {
  const user = await getUserRole()
  if (!user) redirect('/login')
  if (user.role !== 'admin' && user.role !== 'ride_leader') {
    redirect('/login?error=forbidden')
  }

  const [linked] = await db
    .select()
    .from(rideLeaders)
    .where(eq(rideLeaders.userId, user.userId))
    .limit(1)

  if (linked) {
    if (!linked.active && user.role !== 'admin') {
      redirect('/login?error=inactive')
    }
    return {
      userId: user.userId,
      email: user.email,
      role: user.role,
      isAdmin: user.role === 'admin',
      leaderId: linked.id,
      leaderName: linked.fullName,
    }
  }

  const email = user.email?.trim().toLowerCase()
  if (email) {
    const [byEmail] = await db
      .select()
      .from(rideLeaders)
      .where(sql`lower(${rideLeaders.email}) = ${email}`)
      .limit(1)

    if (byEmail) {
      if (!byEmail.active && user.role !== 'admin') {
        redirect('/login?error=inactive')
      }
      // First sign-in for a leader who was added by email.
      await db
        .update(rideLeaders)
        .set({ userId: user.userId })
        .where(eq(rideLeaders.id, byEmail.id))
      return {
        userId: user.userId,
        email: user.email,
        role: user.role,
        isAdmin: user.role === 'admin',
        leaderId: byEmail.id,
        leaderName: byEmail.fullName,
      }
    }
  }

  if (user.role === 'admin' && email) {
    const [created] = await db
      .insert(rideLeaders)
      .values({
        userId: user.userId,
        email,
        fullName: email.split('@')[0] ?? 'Admin',
      })
      .returning()
    if (created) {
      return {
        userId: user.userId,
        email: user.email,
        role: user.role,
        isAdmin: true,
        leaderId: created.id,
        leaderName: created.fullName,
      }
    }
  }

  // A ride_leader role with no matching roster row. Nothing here is theirs
  // to see, so say so rather than showing an empty ride list.
  redirect('/login?error=no-leader-record')
}
