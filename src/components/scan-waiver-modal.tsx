'use client'

import { useActionState } from 'react'
import { signMemberWaiverAtScan, type WaiverSignResult } from '@/app/ride/actions'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// Modal for collecting a waiver signature during scanner check-in. Shows when
// a member with no waiver on file is scanned.

export function ScanWaiverModal({
  open,
  onOpenChange,
  memberNumber,
  firstName,
  lastName,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  memberNumber: number
  firstName: string
  lastName: string
  onSuccess?: () => void
}) {
  const [state, action, pending] = useActionState<WaiverSignResult, FormData>(
    signMemberWaiverAtScan,
    { ok: false, error: '' }
  )

  // Success: show confirmation and close after a moment
  if (state.ok) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent onOpenChange={onOpenChange}>
          <div className="rounded-lg border-2 border-vcdc-green bg-vcdc-green/10 p-5">
            <h2 className="text-lg font-semibold">Waiver signed</h2>
            <p className="mt-2 text-sm">
              Thank you, {state.firstName}. You&apos;re all set to ride.
            </p>
            <Button
              onClick={() => {
                onOpenChange(false)
                onSuccess?.()
              }}
              className="mt-4 w-full"
            >
              Continue
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onOpenChange={onOpenChange}>
        <DialogHeader>
          <DialogTitle>Waiver required</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium">
              {firstName} {lastName}
            </p>
            <p className="text-xs text-vcdc-cog">Member {memberNumber}</p>
          </div>

          <div className="rounded-md border border-vcdc-cog/30 bg-vcdc-cog/5 p-3 max-h-48 overflow-y-auto">
            <p className="text-xs leading-relaxed text-vcdc-cog space-y-2">
              <span className="block font-medium">Code of Conduct</span>
              <span className="block">
                The Vespa Club of D.C. does not tolerate violence, reckless driving, or weapons during rides.
              </span>
              <span className="block font-medium mt-2">Waiver of Liability</span>
              <span className="block">
                I understand and agree that motorcycle riding involves risks of injury or death. I assume all such risks and hold the Vespa Club of D.C. harmless from any claims.
              </span>
            </p>
          </div>

          <form action={action} className="space-y-4">
            <input type="hidden" name="memberNumber" value={memberNumber} />

            <div>
              <Label htmlFor="signatureName" className="text-sm">
                Type your full name to sign
              </Label>
              <Input
                id="signatureName"
                name="signatureName"
                type="text"
                placeholder={`${firstName} ${lastName}`}
                required
                autoComplete="off"
                autoFocus
                disabled={pending}
              />
              <p className="mt-1 text-xs text-vcdc-cog">
                Typing your name is your signature.
              </p>
            </div>

            <label className="flex items-start gap-2">
              <input type="checkbox" name="agreed" required className="mt-1" />
              <span className="text-sm">
                I have read and accept the waiver above
              </span>
            </label>

            {state.ok === false && state.error && (
              <p className="rounded-md bg-vcdc-red/10 p-2 text-sm text-vcdc-red">
                {state.error}
              </p>
            )}

            <div className="flex gap-2 pt-2">
              <Button
                type="submit"
                disabled={pending}
                className="flex-1"
              >
                {pending ? 'Signing...' : 'Sign waiver'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => onOpenChange(false)}
                disabled={pending}
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
