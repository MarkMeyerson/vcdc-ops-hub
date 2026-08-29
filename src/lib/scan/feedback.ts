'use client'

// Sound and touch feedback at sign-in, brief Section 8.
//
// The leader is not looking at the screen. They are looking at the rider,
// holding the phone at waist height, in a parking lot, with a queue behind
// them. The chime is the interface; the screen is the appeal process.
//
// Tones are synthesized rather than shipped as audio files: four short
// beeps do not justify four network requests that have to succeed before
// the scanner is usable, and a synthesized tone is available offline on the
// first ride without any caching to reason about.
//
// iOS Safari refuses to start an AudioContext outside a user gesture, and a
// context created before one stays permanently suspended. prime() is called
// from the same tap that starts the camera, which is the one gesture every
// session is guaranteed to have.

type Tone = { frequency: number; duration: number; delay: number; gain?: number }

const PATTERNS: Record<string, Tone[]> = {
  // Rising two-note: recognised, on the list.
  member: [
    { frequency: 660, duration: 0.09, delay: 0 },
    { frequency: 990, duration: 0.13, delay: 0.09 },
  ],
  // Distinct from a member on purpose. A leader needs to hear the
  // difference without looking, because a guest is a different
  // conversation.
  guest: [
    { frequency: 520, duration: 0.09, delay: 0 },
    { frequency: 700, duration: 0.09, delay: 0.1 },
    { frequency: 880, duration: 0.12, delay: 0.2 },
  ],
  // Flat repeat: already scanned. Not an error, just "you have them".
  duplicate: [
    { frequency: 440, duration: 0.07, delay: 0 },
    { frequency: 440, duration: 0.07, delay: 0.11 },
  ],
  // Falling: stop, this one needs a word.
  reject: [
    { frequency: 400, duration: 0.14, delay: 0 },
    { frequency: 260, duration: 0.22, delay: 0.14 },
  ],
}

export type FeedbackKind = keyof typeof PATTERNS

let context: AudioContext | null = null
let primed = false

export function isPrimed(): boolean {
  return primed
}

// Call from inside a real user gesture (the tap that starts the camera).
export function primeFeedback(): void {
  if (primed) return
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext
    if (!Ctor) return
    context = new Ctor()
    // A zero-length silent buffer inside the gesture is what actually
    // unlocks playback on iOS; resume() alone is not reliably enough.
    const buffer = context.createBuffer(1, 1, 22050)
    const source = context.createBufferSource()
    source.buffer = buffer
    source.connect(context.destination)
    source.start(0)
    void context.resume()
    primed = true
  } catch {
    // No audio on this device. The visual flash and the on-screen result
    // carry the whole message; nothing here is the only signal.
    context = null
  }
}

export function playFeedback(kind: FeedbackKind): void {
  const ctx = context
  if (!ctx) return
  try {
    if (ctx.state === 'suspended') void ctx.resume()
    const now = ctx.currentTime
    for (const tone of PATTERNS[kind] ?? []) {
      const oscillator = ctx.createOscillator()
      const gain = ctx.createGain()
      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(tone.frequency, now + tone.delay)
      // Ramped rather than switched, so the tone does not click on cheap
      // phone speakers held at arm's length.
      gain.gain.setValueAtTime(0.0001, now + tone.delay)
      gain.gain.exponentialRampToValueAtTime(
        tone.gain ?? 0.25,
        now + tone.delay + 0.012
      )
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        now + tone.delay + tone.duration
      )
      oscillator.connect(gain)
      gain.connect(ctx.destination)
      oscillator.start(now + tone.delay)
      oscillator.stop(now + tone.delay + tone.duration + 0.02)
    }
  } catch {
    // Never let feedback break a scan.
  }
}

const VIBRATION: Record<FeedbackKind, number | number[]> = {
  member: 40,
  guest: [30, 40, 30],
  duplicate: [60, 60, 60],
  reject: [120, 70, 120],
}

// iOS Safari has never supported navigator.vibrate and shows no sign of
// starting. Duplicate feedback therefore cannot rely on a buzz; the caller
// pairs this with a full-screen colour flash, which is the fallback that
// actually reaches an iPhone leader.
export function vibrate(kind: FeedbackKind): void {
  try {
    const pattern = VIBRATION[kind]
    if (pattern !== undefined) navigator.vibrate?.(pattern)
  } catch {
    // Ignored on purpose.
  }
}

export function signal(kind: FeedbackKind): void {
  playFeedback(kind)
  vibrate(kind)
}
