import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Refreshes the Supabase session on every request and keeps auth cookies in
// sync. Runs from src/proxy.ts (the Next.js 16 replacement for middleware).
// Optimistic gate only: real authorization happens in layouts, server
// actions, and RLS.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: do not run code between createServerClient and getUser().
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  // Stale or invalid session (for example a deleted user): clear it.
  if (error) {
    await supabase.auth.signOut()
  }

  const path = request.nextUrl.pathname
  // /waiver stays public forever (guests never log in). /card is the
  // member card lookup, which members reach without an account. /auth
  // handles the magic-link callback. Everything else under /admin and
  // /ride needs a user.
  const isPublic =
    path === '/' ||
    path === '/login' ||
    path === '/offline' ||
    path === '/sw.js' ||
    path === '/manifest.webmanifest' ||
    path.startsWith('/auth') ||
    path.startsWith('/waiver') ||
    path.startsWith('/card')

  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return response
}
