'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import type { MemberFormState } from '@/app/(admin)/admin/members/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'

type MemberDefaults = {
  memberNumber?: number
  firstName?: string
  lastName?: string
  email?: string
  phone?: string | null
  membershipTier?: string
  joinedAt?: string
  expiresAt?: string
}

export function MemberForm({
  action,
  defaults,
  submitLabel,
}: {
  action: (prev: MemberFormState, formData: FormData) => Promise<MemberFormState>
  defaults: MemberDefaults
  submitLabel: string
}) {
  const [state, formAction, pending] = useActionState(action, { error: null })

  // On a validation error, re-show what the admin typed, not the defaults.
  const v = (key: string, fallback: string) => state.values?.[key] ?? fallback

  return (
    <form action={formAction} className="max-w-lg space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="memberNumber">Member number</Label>
          <Input
            id="memberNumber"
            name="memberNumber"
            type="number"
            min={1}
            required
            defaultValue={v('memberNumber', defaults.memberNumber?.toString() ?? '')}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="membershipTier">Tier</Label>
          <Select
            id="membershipTier"
            name="membershipTier"
            required
            defaultValue={v('membershipTier', defaults.membershipTier ?? 'regular')}
          >
            <option value="regular">Regular</option>
            <option value="lifetime">Lifetime</option>
            <option value="honorary">Honorary</option>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="firstName">First name</Label>
          <Input
            id="firstName"
            name="firstName"
            required
            defaultValue={v('firstName', defaults.firstName ?? '')}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="lastName">Last name</Label>
          <Input
            id="lastName"
            name="lastName"
            required
            defaultValue={v('lastName', defaults.lastName ?? '')}
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          defaultValue={v('email', defaults.email ?? '')}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="phone">Phone (optional)</Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          defaultValue={v('phone', defaults.phone ?? '')}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="joinedAt">Joined</Label>
          <Input
            id="joinedAt"
            name="joinedAt"
            type="date"
            required
            defaultValue={v('joinedAt', defaults.joinedAt ?? '')}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="expiresAt">Expires</Label>
          <Input
            id="expiresAt"
            name="expiresAt"
            type="date"
            required
            defaultValue={v('expiresAt', defaults.expiresAt ?? '')}
          />
        </div>
      </div>

      {state.error && <p className="text-sm text-vcdc-red">{state.error}</p>}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving...' : submitLabel}
        </Button>
        <Link
          href="/admin/members"
          className="text-sm text-vcdc-cog hover:underline"
        >
          Cancel
        </Link>
      </div>
    </form>
  )
}
