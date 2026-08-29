'use client'

import { useActionState } from 'react'
import { addLeader, type LeaderState } from '@/app/(admin)/admin/leaders/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function LeaderForm() {
  const [state, action, pending] = useActionState<LeaderState, FormData>(
    addLeader,
    { error: null, notice: null }
  )

  return (
    <form action={action} className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="fullName">Name</Label>
        <Input id="fullName" name="fullName" required placeholder="Rob Smith" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          placeholder="them@example.com"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="memberNumber">Member number</Label>
        <Input
          id="memberNumber"
          name="memberNumber"
          inputMode="numeric"
          placeholder="Optional"
        />
        <p className="text-xs text-vcdc-cog">
          Not every leader is a member. Leave it blank if theirs is not on the
          roster.
        </p>
      </div>
      {state.error && <p className="text-sm text-vcdc-red">{state.error}</p>}
      {state.notice && (
        <p className="rounded-md bg-vcdc-green/10 p-3 text-sm">{state.notice}</p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? 'Adding...' : 'Add ride leader'}
      </Button>
    </form>
  )
}
