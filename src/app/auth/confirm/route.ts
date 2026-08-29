import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import type { EmailOtpType } from '@supabase/supabase-js'

// Magic-link confirm route. Uses verifyOtp(token_hash), no PKCE
// code-verifier, so login links work from any browser or device.
// Requires the Supabase Magic Link email template to point at:
//   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const token_hash = url.searchParams.get('token_hash')
  const type = url.searchParams.get('type') as EmailOtpType | null
  // Only a same-site path. new URL(next, origin) would happily follow an
  // absolute URL somebody appended to a sign-in link, which is an open
  // redirect off the back of an authentication flow.
  const requested = url.searchParams.get('next') ?? '/'
  const next = requested.startsWith('/') && !requested.startsWith('//')
    ? requested
    : '/'

  const response = NextResponse.redirect(new URL(next, url.origin))

  if (token_hash && type) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            )
          },
        },
      }
    )

    const { error } = await supabase.auth.verifyOtp({ type, token_hash })
    if (!error) return response
  }

  return NextResponse.redirect(new URL('/login?error=link', url.origin))
}
