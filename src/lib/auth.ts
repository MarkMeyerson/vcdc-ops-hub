import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

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
