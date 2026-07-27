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
    const { error } = await supabase.auth.signInWithOtp({
      email,
      // Accounts are provisioned by the admin; never self-serve.
      options: { shouldCreateUser: false },
    })

    if (error) {
      setStatus('idle')
      setError(
        'Could not send the sign-in link. Check the address, or contact the club if the problem persists.'
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
            {error && <p className="text-sm text-vcdc-red">{error}</p>}
            <Button type="submit" disabled={status === 'sending'}>
              {status === 'sending' ? 'Sending...' : 'Email me a sign-in link'}
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
