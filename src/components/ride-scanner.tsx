'use client'

import { useActionState, useCallback, useEffect, useRef, useState } from 'react'
import {
  lookupScan,
  saveContact,
  type ContactState,
} from '@/app/ride/scan/actions'
import { useQrScanner } from '@/lib/scan/use-qr-scanner'
import { GAP_LABELS, formatGuestNumber, type ScanOutcome } from '@/lib/scan/resolve'
import { displayDate, tierLabels } from '@/lib/display'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// Ride sign-in scanner. Phone-first: the leader is standing in a parking lot
// holding this in one hand.
//
// The check-in list lives in component state for now. Slice 6 moves it to
// IndexedDB, which is what makes it survive a locked screen and a dead
// signal; until then a leader who reloads the page loses the list, and the
// page says so rather than pretending otherwise.

type CheckedIn = {
  key: string
  name: string
  detail: string
  at: number
}

function tone(kind: ScanOutcome['kind']): {
  border: string
  bg: string
  label: string
} {
  switch (kind) {
    case 'member':
      return { border: 'border-vcdc-green', bg: 'bg-vcdc-green/10', label: 'Checked in' }
    case 'guest':
      return { border: 'border-vcdc-green', bg: 'bg-vcdc-green/10', label: 'Guest' }
    case 'expired-member':
      return { border: 'border-vcdc-amber', bg: 'bg-vcdc-amber/10', label: 'Expired' }
    default:
      return { border: 'border-vcdc-red', bg: 'bg-vcdc-red/10', label: 'Not recognized' }
  }
}

function ContactForm({
  memberId,
  onDone,
}: {
  memberId: string
  onDone: () => void
}) {
  const [state, action, pending] = useActionState<ContactState, FormData>(
    saveContact,
    { error: null, saved: false }
  )

  useEffect(() => {
    if (state.saved) onDone()
  }, [state.saved, onDone])

  return (
    <form action={action} className="mt-3 space-y-2">
      <input type="hidden" name="memberId" value={memberId} />
      <div className="space-y-1">
        <Label htmlFor="scan-email">Email</Label>
        <Input
          id="scan-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="off"
          placeholder="them@example.com"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="scan-phone">Phone</Label>
        <Input
          id="scan-phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          placeholder="202-555-0100"
        />
      </div>
      {state.error && <p className="text-sm text-vcdc-red">{state.error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving...' : 'Save'}
        </Button>
        <Button type="button" variant="secondary" onClick={onDone}>
          Skip
        </Button>
      </div>
    </form>
  )
}

function Result({
  outcome,
  onCollected,
}: {
  outcome: ScanOutcome
  onCollected: () => void
}) {
  const [collecting, setCollecting] = useState(false)
  const t = tone(outcome.kind)

  return (
    <div className={`rounded-lg border-2 ${t.border} ${t.bg} p-4`}>
      {outcome.kind === 'member' && (
        <>
          <p className="text-xs font-semibold uppercase tracking-wider">
            {t.label}
          </p>
          <p className="mt-1 text-xl font-semibold">
            {outcome.member.firstName} {outcome.member.lastName}
          </p>
          <p className="mt-1 text-sm">
            <span className="font-mono">{outcome.member.memberNumber}</span>
            <span className="mx-2">·</span>
            {tierLabels[outcome.member.membershipTier]}
            <span className="mx-2">·</span>
            through {displayDate(outcome.member.expiresAt)}
          </p>

          {outcome.gaps.length > 0 && !collecting && (
            <div className="mt-3 rounded-md bg-white/70 p-3">
              <p className="text-sm font-medium">
                {outcome.gaps.map((g) => GAP_LABELS[g]).join(' · ')}
              </p>
              <p className="mt-1 text-xs">
                They are on the ride either way. This is the easiest moment to
                ask.
              </p>
              <Button
                type="button"
                className="mt-2"
                onClick={() => setCollecting(true)}
              >
                Add contact info
              </Button>
            </div>
          )}

          {collecting && (
            <div className="mt-3 rounded-md bg-white/70 p-3">
              <ContactForm
                memberId={outcome.member.id}
                onDone={() => {
                  setCollecting(false)
                  onCollected()
                }}
              />
            </div>
          )}

          {outcome.gaps.length === 0 && (
            <p className="mt-2 text-sm">Contact details on file.</p>
          )}
        </>
      )}

      {outcome.kind === 'expired-member' && (
        <>
          <p className="text-xs font-semibold uppercase tracking-wider">
            {t.label}
          </p>
          <p className="mt-1 text-xl font-semibold">
            {outcome.member.firstName} {outcome.member.lastName}
          </p>
          <p className="mt-1 text-sm">
            Membership ended {displayDate(outcome.member.expiresAt)}. They can
            still ride as a guest; they need a waiver on file.
          </p>
        </>
      )}

      {outcome.kind === 'guest' && (
        <>
          <p className="text-xs font-semibold uppercase tracking-wider">
            {t.label}
          </p>
          <p className="mt-1 text-xl font-semibold">
            {formatGuestNumber(outcome.guestNumber)}
          </p>
          <p className="mt-1 text-sm">
            Guest waiver codes are not verified yet. That lands with the waiver
            page.
          </p>
        </>
      )}

      {outcome.kind === 'unknown-member' && (
        <>
          <p className="text-xs font-semibold uppercase tracking-wider">
            {t.label}
          </p>
          <p className="mt-1 text-sm">
            Card reads as member {outcome.memberNumber}, but nobody has that
            number. It may have been removed from the roster.
          </p>
        </>
      )}

      {outcome.kind === 'tampered' && (
        <>
          <p className="text-xs font-semibold uppercase tracking-wider">
            {t.label}
          </p>
          <p className="mt-1 text-sm">
            That is a VCDC card, but its signature does not check out. Most
            likely it was issued before the signing key changed. Have them open
            their card link again for a fresh one.
          </p>
        </>
      )}

      {outcome.kind === 'not-ours' && (
        <>
          <p className="text-xs font-semibold uppercase tracking-wider">
            {t.label}
          </p>
          <p className="mt-1 text-sm">
            Not a VCDC code. If they are new, they need to sign a waiver before
            riding.
          </p>
        </>
      )}
    </div>
  )
}

export function RideScanner() {
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null)
  const [checkedIn, setCheckedIn] = useState<CheckedIn[]>([])
  const [looking, setLooking] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)

  // Read inside the scan handler without making it a dependency, so the
  // camera loop is never torn down and restarted by a state change.
  const checkedInRef = useRef(checkedIn)
  useEffect(() => {
    checkedInRef.current = checkedIn
  }, [checkedIn])

  const handleScan = useCallback(async (raw: string) => {
    setLooking(true)
    setLookupError(null)
    try {
      const result = await lookupScan(raw)
      if (!result.ok) {
        setLookupError(result.error)
        return
      }
      setOutcome(result.outcome)

      // Only these three kinds put somebody on the list. Building the row
      // inside each branch keeps the union narrowed; a shared key computed
      // first would widen it back out again.
      const found = result.outcome
      let row: CheckedIn | null = null

      if (found.kind === 'member') {
        row = {
          key: `m:${found.member.memberNumber}`,
          name: `${found.member.firstName} ${found.member.lastName}`,
          detail: String(found.member.memberNumber),
          at: Date.now(),
        }
      } else if (found.kind === 'expired-member') {
        row = {
          key: `m:${found.member.memberNumber}`,
          name: `${found.member.firstName} ${found.member.lastName}`,
          detail: `${found.member.memberNumber} · expired`,
          at: Date.now(),
        }
      } else if (found.kind === 'guest') {
        row = {
          key: `g:${found.guestNumber}`,
          name: formatGuestNumber(found.guestNumber),
          detail: 'Guest',
          at: Date.now(),
        }
      }
      if (!row) return

      // Already on the list: show them again but do not add a second row.
      const existing = row
      if (checkedInRef.current.some((r) => r.key === existing.key)) return

      setCheckedIn((rows) => [existing, ...rows])
    } catch {
      setLookupError('Lost the connection. This needs signal until offline mode lands.')
    } finally {
      setLooking(false)
    }
  }, [])

  const { videoRef, canvasRef, state, message, start, stop } =
    useQrScanner(handleScan)

  // Narrowed into a local first: referencing outcome.member inside the
  // callback below would lose the narrowing across the closure boundary.
  const scannedNumber =
    outcome && (outcome.kind === 'member' || outcome.kind === 'expired-member')
      ? outcome.member.memberNumber
      : null
  const alreadyOnList =
    scannedNumber !== null &&
    checkedIn.some((row) => row.key === `m:${scannedNumber}`)

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-lg border border-vcdc-cog/30 bg-black">
        <video
          ref={videoRef}
          className="aspect-[4/3] w-full object-cover"
          playsInline
          muted
        />
      </div>
      <canvas ref={canvasRef} className="hidden" />

      {state !== 'scanning' ? (
        <div className="space-y-2">
          <Button type="button" onClick={() => void start()} className="w-full">
            {state === 'starting' ? 'Starting camera...' : 'Start camera'}
          </Button>
          {message && <p className="text-sm text-vcdc-red">{message}</p>}
          {state === 'idle' && (
            <p className="text-xs text-vcdc-cog">
              Your browser will ask for camera permission. Point it at the QR on
              the rider&rsquo;s card, whether that is a PDF, an Apple pass, or a
              Google pass. They all carry the same code.
            </p>
          )}
        </div>
      ) : (
        <Button
          type="button"
          variant="secondary"
          onClick={stop}
          className="w-full"
        >
          Stop camera
        </Button>
      )}

      {looking && <p className="text-sm text-vcdc-cog">Looking up...</p>}
      {lookupError && <p className="text-sm text-vcdc-red">{lookupError}</p>}

      {outcome && (
        <>
          {alreadyOnList && (
            <p className="text-sm font-medium text-vcdc-amber">
              Already on the list.
            </p>
          )}
          <Result outcome={outcome} onCollected={() => setOutcome(null)} />
        </>
      )}

      <div>
        <h2 className="text-sm font-medium uppercase text-vcdc-cog">
          On this ride ({checkedIn.length})
        </h2>
        {checkedIn.length === 0 ? (
          <p className="mt-2 text-sm text-vcdc-cog">Nobody scanned yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-vcdc-cog/20 rounded-lg border border-vcdc-cog/30">
            {checkedIn.map((row) => (
              <li
                key={row.key}
                className="flex items-baseline justify-between px-4 py-2 text-sm"
              >
                <span>{row.name}</span>
                <span className="font-mono text-xs text-vcdc-cog">
                  {row.detail}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
