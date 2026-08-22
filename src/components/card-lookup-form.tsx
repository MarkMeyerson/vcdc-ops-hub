'use client'

import { useActionState } from 'react'
import { lookupCard, type CardLookupState } from '@/app/card/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const initialState: CardLookupState = { error: null }

export function CardLookupForm() {
  const [state, formAction, pending] = useActionState(lookupCard, initialState)

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <div className="space-y-1">
        <Label htmlFor="memberNumber">Member number</Label>
        <Input
          id="memberNumber"
          name="memberNumber"
          // Numeric keypad on a phone, which is where members will be
          // standing when they need this.
          inputMode="numeric"
          required
          placeholder="24001"
          defaultValue={state.values?.memberNumber ?? ''}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="lastName">Last name</Label>
        <Input
          id="lastName"
          name="lastName"
          required
          autoComplete="family-name"
          placeholder="Mangano"
          defaultValue={state.values?.lastName ?? ''}
        />
      </div>

      {state.error && <p className="text-sm text-vcdc-red">{state.error}</p>}

      <Button type="submit" disabled={pending}>
        {pending ? 'Finding your card...' : 'Get my card'}
      </Button>
    </form>
  )
}
