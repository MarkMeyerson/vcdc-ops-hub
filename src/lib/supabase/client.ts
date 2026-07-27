import { createBrowserClient } from '@supabase/ssr'

// Browser-side Supabase client (Client Components).
// Only ever sees the public anon key plus the logged-in user's session.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
