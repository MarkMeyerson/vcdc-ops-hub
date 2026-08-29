'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { signWaiver, type WaiverState } from '@/app/waiver/actions'
import { SignaturePad } from '@/components/signature-pad'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// The form a rider fills in on their own phone, standing in the car park,
// usually while somebody waits for them. Every field earns its place: the
// club needs a name to check off, an address to reach them, and somebody to
// call if the worst happens.

function Field({
  id,
  label,
  hint,
  ...props
}: {
  id: string
  label: string
  hint?: string
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={id} {...props} />
      {hint && <p className="text-xs text-vcdc-cog">{hint}</p>}
    </div>
  )
}

// The version is shown, not submitted. Which text a signature is bound to is
// decided on the server from the current version at the moment it lands; a
// version number posted from a form is a number the client picked.
export function WaiverForm({ version }: { version: number }) {
  const [state, action, pending] = useActionState<WaiverState, FormData>(
    signWaiver,
    { status: 'idle', error: null }
  )
  const [isMember, setIsMember] = useState(false)

  if (state.status === 'member') {
    return (
      <div className="rounded-lg border-2 border-vcdc-green bg-vcdc-green/10 p-5">
        <h2 className="text-lg font-semibold">
          Thank you, {state.firstName}.
        </h2>
        <p className="mt-2 text-sm">
          Your waiver is on file against member {state.memberNumber}. Nothing
          else to do: your usual member card is what the ride leader scans.
        </p>
        <Link href="/card" className="mt-3 inline-block text-sm underline">
          Get your member card
        </Link>
      </div>
    )
  }

  if (state.status === 'guest') {
    return (
      <div className="rounded-lg border-2 border-vcdc-green bg-vcdc-green/10 p-5">
        <h2 className="text-lg font-semibold">
          Thank you, {state.firstName}.
        </h2>
        <p className="mt-2 text-sm">
          Show this code to the ride leader. Screenshot it now: this page will
          not come back, and the code is the only proof you signed.
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={state.qrDataUrl}
          alt={`Guest check-in code G${String(state.guestNumber).padStart(5, '0')}`}
          className="mx-auto mt-4 w-56 max-w-full rounded-md bg-white p-2"
        />
        <p className="mt-2 text-center font-mono text-lg">
          G{String(state.guestNumber).padStart(5, '0')}
        </p>
        <p className="mt-3 text-xs">
          Good until{' '}
          {new Date(state.expiresAt).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          })}
          . If you lose it, sign again and you will get a new one.
        </p>
      </div>
    )
  }

  return (
    <form action={action} className="space-y-5">
      <p className="text-xs text-vcdc-cog">
        Signing version {version} of the text above.
      </p>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium uppercase text-vcdc-cog">
          Who you are
        </legend>
        <div className="grid grid-cols-2 gap-3">
          <Field id="firstName" label="First name" required autoComplete="given-name" />
          <Field id="lastName" label="Last name" required autoComplete="family-name" />
        </div>
        <Field
          id="email"
          label="Email"
          type="email"
          inputMode="email"
          required
          autoComplete="email"
        />
        <Field id="phone" label="Phone" type="tel" inputMode="tel" autoComplete="tel" />
      </fieldset>

      <fieldset className="space-y-3 rounded-md border border-vcdc-cog/30 p-3">
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={isMember}
            onChange={(e) => setIsMember(e.target.checked)}
            className="mt-1"
          />
          <span>
            I am a VCDC member. Tick this and the waiver goes on your
            membership record instead of issuing a guest code.
          </span>
        </label>
        {isMember && (
          <Field
            id="memberNumber"
            label="Member number"
            inputMode="numeric"
            hint="On your member card. Your surname above has to match the roster."
          />
        )}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium uppercase text-vcdc-cog">
          If something happens
        </legend>
        <Field
          id="emergencyContactName"
          label="Emergency contact name"
          required
          autoComplete="off"
        />
        <Field
          id="emergencyContactPhone"
          label="Emergency contact phone"
          type="tel"
          inputMode="tel"
          required
          autoComplete="off"
        />
        <Field
          id="guardianName"
          label="Parent or guardian name"
          hint="Only if the rider is under 18. The guardian signs below."
          autoComplete="off"
        />
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium uppercase text-vcdc-cog">
          Signature
        </legend>
        <SignaturePad name="signatureStrokes" />
        <Field
          id="signatureName"
          label="Type your full name"
          required
          autoComplete="off"
          hint="Typing your name here is your signature, with or without the drawing above."
        />
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="photoConsent" defaultChecked className="mt-1" />
          <span>
            The club may use photos of me from rides. Untick to opt out.
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm font-medium">
          <input type="checkbox" name="agreed" required className="mt-1" />
          <span>
            I have read the waiver above, I understand it, and I accept it.
          </span>
        </label>
      </fieldset>

      {state.status === 'error' && (
        <p className="rounded-md bg-vcdc-red/10 p-3 text-sm text-vcdc-red">
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Signing...' : 'Sign the waiver'}
      </Button>
      <p className="text-xs text-vcdc-cog">
        Signing records the date and time, the version of the text above, and
        the address and browser you signed from.
      </p>
    </form>
  )
}
