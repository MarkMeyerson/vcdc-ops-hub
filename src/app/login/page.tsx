'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

function LoginForm() {
  const searchParams = useSearchParams()
  const urlError = searchParams.get('error')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(
    urlError === 'forbidden'
      ? 'Your account does not have access to that area.'
      : urlError === 'link'
        ? 'That sign-in link is invalid or expired. Request a new one.'
        : null
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setStatus('sending')

    const supabase = createClient()

    if (password) {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (error) {
        setStatus('idle')
        setError('Incorrect email or password.')
        return
      }
      // Where they belong is decided by the role on the account, which the
      // browser does not get to pick. / redirects on the server.
      window.location.href = '/'
      return
    }

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        // Accounts are provisioned by the admin; never self-serve.
        shouldCreateUser: false,
        // Used by the default Supabase email template (ConfirmationURL).
        // Must be in the Supabase auth redirect allow-list.
        emailRedirectTo: `${window.location.origin}/auth/callback?next=/`,
      },
    })

    if (error) {
      setStatus('idle')
      // The overwhelmingly common cause is an address that has no account,
      // because shouldCreateUser is false and nobody can sign themselves up.
      // The old wording ("check the address") sent people hunting for a
      // typo in an address that was spelled perfectly and simply was not a
      // user, which is a genuinely hard dead end to get out of. This says
      // what to actually do without confirming whether any particular
      // address exists.
      setError(
        'No sign-in link was sent. Accounts here are created by an admin, so the address has to be one that was already set up. If you are sure it was, the email service may be having trouble.'
      )
      return
    }
    setStatus('sent')
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-vcdc-sky/20 p-4">
      <div className="w-full max-w-sm rounded-lg border border-vcdc-cog/30 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold">VCDC Operations Hub</h1>
        <p className="mt-1 text-sm text-vcdc-cog">
          Vespa Club of Washington DC
        </p>

        {status === 'sent' ? (
          <p className="mt-6 rounded-md bg-vcdc-green/10 p-3 text-sm text-vcdc-green">
            Check your email for a sign-in link. It works on any device.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">Password (admin only)</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Leave blank for a magic link instead"
              />
            </div>
            {error && <p className="text-sm text-vcdc-red">{error}</p>}
            <Button type="submit" disabled={status === 'sending'}>
              {status === 'sending'
                ? 'Signing in...'
                : password
                  ? 'Sign in'
                  : 'Email me a sign-in link'}
            </Button>
          </form>
        )}
      </div>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
