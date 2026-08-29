import { createClient } from '@supabase/supabase-js'
import { envVar } from '@/lib/env'

// Service-role Supabase client. Bypasses RLS and can write auth.users, so it
// is server-only and every call site must already have passed requireAdmin().
//
// It exists for exactly one job in this app: setting a user's role in
// app_metadata. Role must never live in user_metadata, which users can edit
// themselves, and only the service role can write app_metadata.

export function adminAuthConfigured(): { configured: boolean; missing: string[] } {
  const missing: string[] = []
  if (!envVar('NEXT_PUBLIC_SUPABASE_URL')) missing.push('NEXT_PUBLIC_SUPABASE_URL')
  if (!envVar('SUPABASE_SERVICE_ROLE_KEY')) missing.push('SUPABASE_SERVICE_ROLE_KEY')
  return { configured: missing.length === 0, missing }
}

export function createAdminClient() {
  const url = envVar('NEXT_PUBLIC_SUPABASE_URL')
  const key = envVar('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) {
    throw new Error(
      'Supabase admin client needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'
    )
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// Finds a user by email without pulling the whole user list into memory
// twice. Supabase has no get-by-email endpoint, so this pages through.
export async function findUserByEmail(email: string) {
  const supabase = createAdminClient()
  const target = email.trim().toLowerCase()
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    })
    if (error) throw error
    const found = data.users.find((u) => u.email?.toLowerCase() === target)
    if (found) return found
    if (data.users.length < 200) return null
  }
  return null
}
