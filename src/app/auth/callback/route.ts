import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// PKCE code-exchange callback. This is the path the DEFAULT Supabase email
// template uses ({{ .ConfirmationURL }} -> verify endpoint -> redirect here
// with ?code=). Works without custom SMTP, but the link must be opened in
// the same browser that requested it (the code verifier lives in a cookie).
// Once custom SMTP lands (Slice 7, Resend), switch the email template to the
// token-hash link handled by /auth/confirm, which works from any browser.
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  // Only a same-site path. new URL(next, origin) would happily follow an
  // absolute URL somebody appended to a sign-in link, which is an open
  // redirect off the back of an authentication flow.
  const requested = url.searchParams.get('next') ?? '/'
  const next = requested.startsWith('/') && !requested.startsWith('//')
    ? requested
    : '/'

  const response = NextResponse.redirect(new URL(next, url.origin))

  if (code) {
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

    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return response
  }

  return NextResponse.redirect(new URL('/login?error=link', url.origin))
}
