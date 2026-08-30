'use client'

import {
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  addRideComment,
  lookupScan,
  pushScans,
  saveContact,
  submitRide,
  syncRoster,
  type ContactState,
  type QueuedScan,
} from '@/app/ride/actions'
import { useQrScanner } from '@/lib/scan/use-qr-scanner'
import {
  attendanceKey,
  formatGuestNumber,
  resolveOffline,
  GAP_LABELS,
  type RosterEntry,
  type ScanOutcome,
  type WaiverStatus,
} from '@/lib/scan/resolve'
import { parseScan } from '@/lib/scan/parse'
import { todayIso } from '@/lib/ride/status'
import {
  clearRide,
  listScans,
  loadRoster,
  putScan,
  saveRoster,
  updateScans,
  usingMemoryFallback,
  type ScanRecord,
} from '@/lib/offline/db'
import { primeFeedback, signal, type FeedbackKind } from '@/lib/scan/feedback'
import { displayDate, tierLabels } from '@/lib/display'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ScanWaiverModal } from '@/components/scan-waiver-modal'

// Ride sign-in scanner. Phone-first: the leader is standing in a parking lot
// holding this in one hand.
//
// Order of operations on every scan, and the reason this component is
// shaped the way it is (brief Section 9):
//
//   1. Decide who it is from the roster already on the phone. No network.
//   2. Write the scan to IndexedDB. Still no network.
//   3. Only then tell the server, and only as a best effort.
//
// An expired access token, a dead cell, a backgrounded tab, a server error:
// none of them can take a rider off the list, because the list is on the
// phone and the server is a copy.

type Flash = 'green' | 'amber' | 'red' | null

function toneFor(kind: ScanOutcome['kind']): {
  border: string
  bg: string
  label: string
  flash: Flash
  sound: FeedbackKind
} {
  switch (kind) {
    case 'member':
      return {
        border: 'border-vcdc-green',
        bg: 'bg-vcdc-green/10',
        label: 'Checked in',
        flash: 'green',
        sound: 'member',
      }
    case 'guest':
      return {
        border: 'border-vcdc-green',
        bg: 'bg-vcdc-green/10',
        label: 'Guest',
        flash: 'green',
        sound: 'guest',
      }
    case 'expired-member':
      return {
        border: 'border-vcdc-amber',
        bg: 'bg-vcdc-amber/10',
        label: 'Expired',
        flash: 'amber',
        sound: 'reject',
      }
    default:
      return {
        border: 'border-vcdc-red',
        bg: 'bg-vcdc-red/10',
        label: 'Not recognized',
        flash: 'red',
        sound: 'reject',
      }
  }
}

function WaiverLine({ waiver }: { waiver: WaiverStatus }) {
  if (waiver.state === 'signed') {
    return (
      <p className="mt-2 text-sm font-medium text-vcdc-green">
        Waiver signed {displayDate(waiver.signedAt.slice(0, 10))}
      </p>
    )
  }
  // The club's rule: membership carries the cover, and only guests and
  // non-members go through the waiver flow. Every one of the 95 imported
  // members is in this state, so rendering it as a problem would paint the
  // whole roster red and train leaders to ignore the line that matters.
  if (waiver.state === 'covered') {
    return (
      <p className="mt-2 text-sm font-medium text-vcdc-green">
        Covered by membership.
      </p>
    )
  }
  if (waiver.state === 'unknown') {
    return (
      <p className="mt-2 text-sm font-medium text-vcdc-cog">
        Waiver cannot be checked without signal.
      </p>
    )
  }
  return (
    <p className="mt-2 text-sm font-medium text-vcdc-red">
      No waiver on file.
    </p>
  )
}

// Opens the phone's own SMS composer with the waiver link already in it.
// Deliberately not a texting integration (brief Section 12): the leader
// sends it from their own number, which is the number the rider will reply
// to anyway.
function TextWaiverButton({ waiverUrl }: { waiverUrl: string | null }) {
  if (!waiverUrl) return null
  const body = encodeURIComponent(
    `Sign the VCDC ride waiver here before we set off: ${waiverUrl}`
  )
  return (
    <a
      href={`sms:?&body=${body}`}
      className="mt-3 inline-flex items-center justify-center rounded-md bg-vcdc-amber px-4 py-2 text-sm font-medium text-white"
    >
      Text them the waiver link
    </a>
  )
}

function ContactForm({
  memberNumber,
  onDone,
}: {
  memberNumber: number
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
      <input type="hidden" name="memberNumber" value={memberNumber} />
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
      <p className="text-xs text-vcdc-cog">
        This one needs signal. The rider stays on the list either way.
      </p>
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
  duplicate,
  waiverUrl,
  onCollected,
  onWaiverSign,
}: {
  outcome: ScanOutcome
  duplicate: boolean
  waiverUrl: string | null
  onCollected: () => void
  onWaiverSign?: (member: {
    memberNumber: number
    firstName: string
    lastName: string
  }) => void
}) {
  const [collecting, setCollecting] = useState(false)
  const t = toneFor(outcome.kind)

  return (
    <div className={`rounded-lg border-2 ${t.border} ${t.bg} p-4`}>
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider">
          {t.label}
        </p>
        {duplicate && (
          <p className="rounded bg-vcdc-amber px-2 py-0.5 text-xs font-semibold uppercase text-white">
            Already on the list
          </p>
        )}
      </div>

      {(outcome.kind === 'member' || outcome.kind === 'expired-member') && (
        <>
          <p className="mt-1 text-2xl font-semibold">
            {outcome.member.firstName} {outcome.member.lastName}
          </p>
          <p className="mt-1 text-sm">
            <span className="font-mono">{outcome.member.memberNumber}</span>
            <span className="mx-2">&middot;</span>
            {tierLabels[outcome.member.membershipTier]}
            <span className="mx-2">&middot;</span>
            {outcome.kind === 'expired-member' ? 'ended ' : 'through '}
            {displayDate(outcome.member.expiresAt)}
          </p>
          <WaiverLine waiver={outcome.waiver} />
          {outcome.waiver.state !== 'signed' && (
            <div className="mt-3 flex gap-2">
              {onWaiverSign && (
                <button
                  type="button"
                  onClick={() =>
                    onWaiverSign({
                      memberNumber: outcome.member.memberNumber,
                      firstName: outcome.member.firstName,
                      lastName: outcome.member.lastName,
                    })
                  }
                  className="flex-1 rounded-md bg-vcdc-green px-4 py-2 text-sm font-medium text-white hover:bg-vcdc-green/90"
                >
                  Sign waiver now
                </button>
              )}
              <TextWaiverButton waiverUrl={waiverUrl} />
            </div>
          )}
        </>
      )}

      {outcome.kind === 'expired-member' && (
        <p className="mt-2 text-sm">
          They can still ride as a guest, and they need a waiver on file.
        </p>
      )}

      {outcome.kind === 'member' && (
        <>
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
                memberNumber={outcome.member.memberNumber}
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

      {outcome.kind === 'guest' && (
        <>
          <p className="mt-1 text-2xl font-semibold">
            {outcome.guest
              ? `${outcome.guest.firstName} ${outcome.guest.lastName}`
              : formatGuestNumber(outcome.guestNumber)}
          </p>
          <p className="mt-1 text-sm font-mono">
            {formatGuestNumber(outcome.guestNumber)}
          </p>
          {outcome.status === 'valid' && outcome.guest && (
            <p className="mt-2 text-sm font-medium text-vcdc-green">
              Waiver signed {displayDate(outcome.guest.signedAt.slice(0, 10))}
            </p>
          )}
          {outcome.status === 'expired' && (
            <p className="mt-2 text-sm font-medium text-vcdc-amber">
              That waiver has expired. They are on the list; have them sign
              again.
            </p>
          )}
          {outcome.status === 'unverified' && (
            <p className="mt-2 text-sm font-medium text-vcdc-cog">
              Guest codes cannot be checked without signal. They are on the
              list and the club will confirm the waiver when this ride is
              submitted.
            </p>
          )}
          {outcome.status === 'unknown-code' && (
            <>
              <p className="mt-2 text-sm font-medium text-vcdc-red">
                That guest code is not on file. They may not have finished
                signing.
              </p>
              <TextWaiverButton waiverUrl={waiverUrl} />
            </>
          )}
        </>
      )}

      {outcome.kind === 'unknown-member' && (
        <>
          <p className="mt-1 text-sm">
            Card reads as member {outcome.memberNumber}, but nobody on this
            phone has that number. They are on the list; the club will settle
            it when the ride is submitted.
          </p>
        </>
      )}

      {outcome.kind === 'tampered' && (
        <p className="mt-1 text-sm">
          That is a VCDC card, but its signature does not check out. Most
          likely it was issued before the signing key changed. Have them open
          their card link again for a fresh one.
        </p>
      )}

      {outcome.kind === 'not-ours' && (
        <>
          <p className="mt-1 text-sm">
            Not a VCDC code. If they are new, they need to sign a waiver
            before riding.
          </p>
          <TextWaiverButton waiverUrl={waiverUrl} />
        </>
      )}
    </div>
  )
}

export function RideScanner({
  rideId,
  rideStatus,
  waiverUrl,
  waiverQrDataUrl,
}: {
  rideId: string
  rideStatus: 'planned' | 'active' | 'submitted'
  waiverUrl: string | null
  // Rendered on the server: the waiver URL does not change between riders,
  // so there is no reason to ship a QR encoder to the phone for it.
  waiverQrDataUrl: string | null
}) {
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null)
  const [duplicate, setDuplicate] = useState(false)
  const [scans, setScans] = useState<ScanRecord[]>([])
  const [roster, setRoster] = useState<RosterEntry[] | null>(null)
  const [rosterSyncedAt, setRosterSyncedAt] = useState<string | null>(null)
  const [rosterError, setRosterError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [online, setOnline] = useState(true)
  const [flash, setFlash] = useState<Flash>(null)
  const [uncheckedNotice, setUncheckedNotice] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(rideStatus === 'submitted')
  const [memoryOnly, setMemoryOnly] = useState(false)
  const [showingWaiver, setShowingWaiver] = useState(false)
  const [signingWaiver, setSigningWaiver] = useState<{
    memberNumber: number
    firstName: string
    lastName: string
  } | null>(null)
  const [notingRide, setNotingRide] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [noteSaving, setNoteSaving] = useState(false)
  const [noteError, setNoteError] = useState<string | null>(null)
  const [noteSaved, setNoteSaved] = useState(false)
  const [finishComment, setFinishComment] = useState('')

  // Read inside the scan handler without making it a dependency, so the
  // camera loop is never torn down and restarted by a state change.
  const rosterRef = useRef<RosterEntry[] | null>(null)
  useEffect(() => {
    rosterRef.current = roster
  }, [roster])

  const refreshScans = useCallback(async () => {
    const rows = await listScans(rideId)
    setScans(rows)
    setMemoryOnly(usingMemoryFallback())
  }, [rideId])

  const downloadRoster = useCallback(async () => {
    setSyncing(true)
    setRosterError(null)
    try {
      const result = await syncRoster()
      if (!result.ok) {
        setRosterError(result.error)
        return
      }
      await saveRoster(result.roster)
      setRoster(result.roster.entries)
      setRosterSyncedAt(result.roster.syncedAt)
    } catch {
      setRosterError(
        'Could not reach the server. The roster already on this phone still works.'
      )
    } finally {
      setSyncing(false)
    }
  }, [])

  const syncQueue = useCallback(async () => {
    // Read the queue from IndexedDB rather than from React state. State is
    // one render behind at the moments this is called (straight after a
    // refresh, or from an event handler), and a queue that reads as empty
    // because a setState has not landed yet is a ride that never sends.
    const queue = (await listScans(rideId)).filter((s) => !s.synced)
    if (queue.length === 0) return
    setSyncing(true)
    try {
      const result = await pushScans(
        rideId,
        queue.map((s) => ({
          id: s.id,
          raw: s.raw,
          scannedAt: s.scannedAt,
          offline: s.offline,
        }))
      )
      if (result.ok) {
        const byId = new Map(result.results.map((r) => [r.id, r]))
        await updateScans(
          queue.map((s) => {
            const r = byId.get(s.id)
            return {
              ...s,
              synced: Boolean(r),
              rejected: r?.status === 'unresolved' ? r.reason : null,
            }
          })
        )
        await refreshScans()
      }
    } catch {
      // Still queued.
    } finally {
      setSyncing(false)
    }
  }, [rideId, refreshScans])

  const pending = scans.filter((s) => !s.synced).length

  // On mount: read whatever is already on the phone, then refresh it if
  // there is signal. The stored copy is shown immediately either way, so a
  // leader who opens this in a dead spot is not staring at a spinner.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const stored = await loadRoster()
      if (!cancelled && stored) {
        setRoster(stored.entries)
        setRosterSyncedAt(stored.syncedAt)
      }
      await refreshScans()
      if (cancelled || !navigator.onLine) return
      await downloadRoster()
      // Anything left queued by a previous session on this phone, for
      // instance a ride the leader closed the tab on before it sent.
      await syncQueue()
    })()
    return () => {
      cancelled = true
    }
  }, [refreshScans, downloadRoster, syncQueue])

  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  const showFlash = useCallback((colour: Flash) => {
    setFlash(colour)
    window.setTimeout(() => setFlash(null), 420)
  }, [])

  // Best effort, always after the local write. Failure here is invisible to
  // the leader on purpose: the scan is already safe and the queue retries.
  const pushOne = useCallback(
    async (record: ScanRecord) => {
      try {
        const queued: QueuedScan = {
          id: record.id,
          raw: record.raw,
          scannedAt: record.scannedAt,
          offline: record.offline,
        }
        const result = await pushScans(rideId, [queued])
        if (!result.ok) return
        const first = result.results[0]
        if (!first) return
        const updated: ScanRecord = {
          ...record,
          synced: true,
          rejected: first.status === 'unresolved' ? first.reason : null,
        }
        await updateScans([updated])
        await refreshScans()
      } catch {
        // Stays queued. submitRide sends it again.
      }
    },
    [rideId, refreshScans]
  )

  const handleScan = useCallback(
    async (raw: string) => {
      if (submitted) return

      const hasSignal = navigator.onLine
      const currentRoster = rosterRef.current

      // 1. Decide, locally, with no network at all.
      let decided: ScanOutcome | null = null
      if (currentRoster) {
        decided = resolveOffline(raw, currentRoster, todayIso())
      } else {
        const parsed = parseScan(raw)
        if (parsed.kind === 'not-ours') {
          decided = { kind: 'not-ours', raw }
        }
        // A code of ours with no roster to check it against stays undecided
        // until the enrichment call below. It is still recorded.
      }

      const key = decided
        ? attendanceKey(decided, raw)
        : `p:${raw.trim()}`

      // A stranger's QR code puts nobody on a ride and is not worth storing.
      if (decided && key === null) {
        setOutcome(decided)
        setDuplicate(false)
        setUncheckedNotice(false)
        showFlash('red')
        signal('reject')
        return
      }
      if (key === null) return

      const id = `${rideId}|${key}`
      // Asked of the store, not of React state, which is a render behind at
      // this point. Getting this wrong would overwrite an already-sent scan
      // with an unsent copy of itself.
      const isDuplicate = (await listScans(rideId)).some((s) => s.id === id)

      const name = decided ? nameFor(decided, raw) : 'Unchecked scan'
      const detail = decided ? detailFor(decided) : 'Waiting for signal'

      const record: ScanRecord = {
        id,
        rideId,
        key,
        raw,
        name,
        detail,
        scannedAt: Date.now(),
        offline: !hasSignal,
        synced: false,
        rejected: null,
      }

      // 2. Write it down before anything else can fail.
      if (!isDuplicate) {
        await putScan(record)
        await refreshScans()
      }

      // 3. Now the feedback, then the network.
      if (decided) {
        const t = toneFor(decided.kind)
        setOutcome(decided)
        setUncheckedNotice(false)
        setDuplicate(isDuplicate)
        showFlash(isDuplicate ? 'amber' : t.flash)
        signal(isDuplicate ? 'duplicate' : t.sound)
      } else {
        setOutcome(null)
        setUncheckedNotice(true)
        setDuplicate(isDuplicate)
        showFlash('amber')
        signal(isDuplicate ? 'duplicate' : 'guest')
      }

      if (!hasSignal) return

      // Online enrichment. Confirms a guest waiver, which cannot be checked
      // offline at all, and replaces the roster's single needsContact bit
      // with the two real gaps.
      try {
        const enriched = await lookupScan(raw)
        if (enriched.ok) {
          setOutcome(enriched.outcome)
          setUncheckedNotice(false)
          const enrichedName = nameFor(enriched.outcome, raw)
          const enrichedDetail = detailFor(enriched.outcome)
          if (enrichedName !== record.name || enrichedDetail !== record.detail) {
            await updateScans([
              { ...record, name: enrichedName, detail: enrichedDetail },
            ])
            await refreshScans()
          }
        }
      } catch {
        // The local decision stands.
      }

      if (!isDuplicate) await pushOne(record)
    },
    [rideId, submitted, showFlash, refreshScans, pushOne]
  )

  const { videoRef, canvasRef, state, message, start, stop } =
    useQrScanner(handleScan)

  const startCamera = useCallback(() => {
    // Same tap: iOS will not unlock audio outside a user gesture, and a
    // context created any later stays silent for the whole session.
    primeFeedback()
    void start()
  }, [start])

  // Catch up the moment signal returns, without the leader tapping anything.
  // Driven by the browser's own online event rather than by watching the
  // queue length: the queue draining is the result, not the trigger.
  useEffect(() => {
    const onReconnect = () => {
      void syncQueue()
    }
    window.addEventListener('online', onReconnect)
    return () => window.removeEventListener('online', onReconnect)
  }, [syncQueue])

  const handleSubmit = useCallback(async () => {
    if (!finishComment.trim()) {
      setSubmitError('Add a quick note on how the ride went before submitting.')
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    try {
      const queue = (await listScans(rideId)).filter((s) => !s.synced)
      const result = await submitRide(
        rideId,
        queue.map((s) => ({
          id: s.id,
          raw: s.raw,
          scannedAt: s.scannedAt,
          offline: s.offline,
        })),
        finishComment
      )
      if (!result.ok) {
        setSubmitError(result.error)
        return
      }
      setSubmitted(true)
      stop()
      // Only now, with the server's confirmation in hand, is the local copy
      // no longer the only copy.
      await clearRide(rideId)
      await refreshScans()
    } catch {
      setSubmitError(
        'Could not reach the server. Nothing was lost: everyone you scanned is still on this phone. Try again when you have signal.'
      )
    } finally {
      setSubmitting(false)
    }
  }, [rideId, stop, refreshScans, finishComment])

  const handleSaveNote = useCallback(async () => {
    setNoteSaving(true)
    setNoteError(null)
    try {
      const result = await addRideComment(rideId, noteText)
      if (!result.ok) {
        setNoteError(result.error)
        return
      }
      setNoteText('')
      setNotingRide(false)
      setNoteSaved(true)
    } catch {
      setNoteError(
        'Could not reach the server. Try again once you have signal.'
      )
    } finally {
      setNoteSaving(false)
    }
  }, [rideId, noteText])

  // After a signature lands, the screen and the phone's roster both still say
  // the rider has no waiver. Neither can be fixed by re-scanning: the roster
  // is a copy taken before they signed, and re-reading the card would answer
  // from that same stale copy.
  //
  // So the signature is applied where the leader will actually see it. The
  // card on screen is marked signed, and the matching roster entry is patched
  // in place and written back to IndexedDB, so a second scan of the same
  // rider agrees with the first and a leader who loses signal keeps the
  // answer. The server already holds the authoritative row; the next sync
  // overwrites all of this with it.
  const handleWaiverSigned = useCallback(
    async (memberNumber: number) => {
      setSigningWaiver(null)

      const signedAt = new Date().toISOString()

      setOutcome((current) => {
        if (
          !current ||
          (current.kind !== 'member' && current.kind !== 'expired-member') ||
          current.member.memberNumber !== memberNumber
        ) {
          return current
        }
        return {
          ...current,
          waiver: { state: 'signed', signedAt, version: null },
        }
      })

      const stored = await loadRoster()
      if (!stored) return
      const patched = {
        ...stored,
        entries: stored.entries.map((entry) =>
          entry.memberNumber === memberNumber
            ? { ...entry, waiverSignedAt: signedAt }
            : entry
        ),
      }
      await saveRoster(patched)
      setRoster(patched.entries)
    },
    []
  )

  if (submitted) {
    return (
      <div className="rounded-lg border-2 border-vcdc-green bg-vcdc-green/10 p-4">
        <p className="text-sm font-semibold uppercase tracking-wider">
          Submitted
        </p>
        <p className="mt-1 text-sm">
          The roster has been sent in. Sign-in for this ride is closed.
        </p>
      </div>
    )
  }

  return (
    <>
      {signingWaiver && (
        <ScanWaiverModal
          open={true}
          onOpenChange={(open) => !open && setSigningWaiver(null)}
          memberNumber={signingWaiver.memberNumber}
          firstName={signingWaiver.firstName}
          lastName={signingWaiver.lastName}
          onSuccess={() => void handleWaiverSigned(signingWaiver.memberNumber)}
        />
      )}

      <div className="space-y-4">
      {flash && (
        <div
          aria-hidden
          className={`pointer-events-none fixed inset-0 z-50 animate-pulse ${
            flash === 'green'
              ? 'bg-vcdc-green/40'
              : flash === 'amber'
                ? 'bg-vcdc-amber/40'
                : 'bg-vcdc-red/40'
          }`}
        />
      )}

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span
          className={`rounded-full px-2 py-1 font-medium ${
            online
              ? 'bg-vcdc-green/15 text-vcdc-green'
              : 'bg-vcdc-amber/20 text-vcdc-charcoal'
          }`}
        >
          {online ? 'Online' : 'No signal'}
        </span>
        <span className="rounded-full bg-vcdc-cog/15 px-2 py-1 text-vcdc-charcoal">
          {roster
            ? `${roster.length} on this phone`
            : 'Roster not downloaded'}
        </span>
        {pending > 0 && (
          <span className="rounded-full bg-vcdc-sunburst/50 px-2 py-1 text-vcdc-charcoal">
            {pending} waiting to send
          </span>
        )}
        <button
          type="button"
          onClick={() => void downloadRoster()}
          disabled={syncing}
          className="rounded-full border border-vcdc-cog/40 px-2 py-1 disabled:opacity-50"
        >
          {syncing ? 'Syncing...' : 'Sync now'}
        </button>
      </div>

      {rosterSyncedAt && (
        <p className="text-xs text-vcdc-cog">
          Roster copied {new Date(rosterSyncedAt).toLocaleString()}
        </p>
      )}
      {rosterError && <p className="text-sm text-vcdc-red">{rosterError}</p>}
      {memoryOnly && (
        <p className="rounded-md bg-vcdc-red/10 p-3 text-xs text-vcdc-charcoal">
          This browser will not let the app store anything on the phone,
          usually because it is a private window. Scans are held in memory
          only and closing this tab loses them. Open the app in a normal
          window before the ride starts.
        </p>
      )}

      <div className="rounded-lg border border-vcdc-cog/30 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">Anything worth flagging?</p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setNoteSaved(false)
              setNotingRide((open) => !open)
            }}
          >
            {notingRide ? 'Cancel' : 'Leave a note'}
          </Button>
        </div>
        {notingRide && (
          <div className="mt-3 space-y-2">
            <Textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Anything the club should know right now — a hazard, a no-show, a confusing spot on the route."
              rows={3}
            />
            <Button
              type="button"
              onClick={() => void handleSaveNote()}
              disabled={noteSaving || !noteText.trim()}
              className="w-full"
            >
              {noteSaving ? 'Saving...' : 'Save note'}
            </Button>
            {noteError && <p className="text-sm text-vcdc-red">{noteError}</p>}
          </div>
        )}
        {noteSaved && !notingRide && (
          <p className="mt-2 text-xs text-vcdc-green">Note saved.</p>
        )}
      </div>

      {waiverQrDataUrl && (
        <div className="rounded-lg border border-vcdc-cog/30 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">Somebody with no card?</p>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowingWaiver((open) => !open)}
            >
              {showingWaiver ? 'Hide' : 'Show waiver code'}
            </Button>
          </div>
          {showingWaiver && (
            <div className="mt-3 text-center">
              {/* Turn the phone around and let them scan it. Works with no
                  signal on the leader's phone, since the image is already
                  here; the rider needs their own connection to open it.
                  eslint-disable-next-line @next/next/no-img-element */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={waiverQrDataUrl}
                alt="Scan to sign the VCDC ride waiver"
                className="mx-auto w-56 max-w-full rounded-md bg-white p-2"
              />
              <p className="mt-2 text-xs text-vcdc-cog">
                Hold this up. They scan it, sign on their own phone, and show
                you the code it gives them.
              </p>
              {waiverUrl && (
                <p className="mt-1 break-all text-xs text-vcdc-cog">
                  {waiverUrl}
                </p>
              )}
            </div>
          )}
        </div>
      )}

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
          <Button type="button" onClick={startCamera} className="w-full">
            {state === 'starting' ? 'Starting camera...' : 'Start camera'}
          </Button>
          {message && <p className="text-sm text-vcdc-red">{message}</p>}
          {state === 'idle' && (
            <p className="text-xs text-vcdc-cog">
              Your browser will ask for camera permission. Point it at the QR
              on the rider&rsquo;s card, whether that is a PDF, an Apple pass,
              or a Google pass. They all carry the same code.
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

      {uncheckedNotice && (
        <div className="rounded-lg border-2 border-vcdc-amber bg-vcdc-amber/10 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider">
            Saved, not yet checked
          </p>
          <p className="mt-1 text-sm">
            This phone has no roster to check the card against and no signal
            to ask the server. They are on the list, and the club will match
            the card up when the ride is submitted.
          </p>
        </div>
      )}

      {outcome && (
        <Result
          outcome={outcome}
          duplicate={duplicate}
          waiverUrl={waiverUrl}
          onCollected={() => setOutcome(null)}
          onWaiverSign={(member) => setSigningWaiver(member)}
        />
      )}

      <div>
        <h2 className="text-sm font-medium uppercase text-vcdc-cog">
          On this ride ({scans.length})
        </h2>
        {scans.length === 0 ? (
          <p className="mt-2 text-sm text-vcdc-cog">Nobody scanned yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-vcdc-cog/20 rounded-lg border border-vcdc-cog/30">
            {scans.map((row) => (
              <li key={row.id} className="px-4 py-2 text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <span>{row.name}</span>
                  <span className="font-mono text-xs text-vcdc-cog">
                    {row.detail}
                  </span>
                </div>
                {row.rejected && (
                  <p className="mt-1 text-xs text-vcdc-red">{row.rejected}</p>
                )}
                {!row.synced && (
                  <p className="mt-1 text-xs text-vcdc-cog">
                    On this phone, not sent yet.
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2 border-t border-vcdc-cog/30 pt-4">
        <Label htmlFor="finish-comment">
          What went well? Any issues? (required to submit)
        </Label>
        <Textarea
          id="finish-comment"
          value={finishComment}
          onChange={(e) => setFinishComment(e.target.value)}
          placeholder="A sentence or two is plenty."
          rows={3}
        />
        <Button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={submitting || scans.length === 0 || !finishComment.trim()}
          className="w-full"
        >
          {submitting ? 'Submitting...' : `Submit ${scans.length} riders`}
        </Button>
        {submitError && <p className="text-sm text-vcdc-red">{submitError}</p>}
        <p className="text-xs text-vcdc-cog">
          Submitting closes sign-in for this ride. Everyone stays on this
          phone until the server confirms it has them.
        </p>
      </div>
    </div>
    </>
  )
}

// Row text for the check-in list. Kept out of the component so the offline
// write and the online enrichment cannot label the same person differently.
function nameFor(outcome: ScanOutcome, raw: string): string {
  switch (outcome.kind) {
    case 'member':
    case 'expired-member':
      return `${outcome.member.firstName} ${outcome.member.lastName}`
    case 'guest':
      return outcome.guest
        ? `${outcome.guest.firstName} ${outcome.guest.lastName}`
        : formatGuestNumber(outcome.guestNumber)
    case 'unknown-member':
      return `Member ${outcome.memberNumber}`
    case 'tampered':
      return 'Unreadable card'
    default:
      return raw.slice(0, 24)
  }
}

function detailFor(outcome: ScanOutcome): string {
  switch (outcome.kind) {
    case 'member':
      return String(outcome.member.memberNumber)
    case 'expired-member':
      return `${outcome.member.memberNumber} · expired`
    case 'guest':
      return formatGuestNumber(outcome.guestNumber)
    case 'unknown-member':
      return 'not on the roster'
    case 'tampered':
      return 'bad signature'
    default:
      return 'not a VCDC code'
  }
}
