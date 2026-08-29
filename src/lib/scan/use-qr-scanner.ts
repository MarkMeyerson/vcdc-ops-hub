'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// Camera QR scanning for the ride leader's phone.
//
// Two decode paths, because the leaders' phones are split between them:
//
//   Android Chrome ships BarcodeDetector natively. It is faster and does not
//   cost us a frame copy, so it is used when present.
//   iOS Safari does not have it at all, and never has. There it falls back
//   to jsQR over a canvas frame, which is slower but works everywhere.
//
// jsQR is loaded lazily so Android phones never download a decoder they will
// not run.
//
// The camera needs HTTPS. Production is fine; local dev over plain http will
// silently refuse, which is why this can only really be tested on the
// deployed URL from an actual phone.

export type ScannerState =
  | 'idle'
  | 'starting'
  | 'scanning'
  | 'denied'
  | 'unsupported'
  | 'error'

type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>
}

// Between reads of the same code. A leader holding the camera on one pass
// would otherwise fire dozens of scans a second.
const REPEAT_SUPPRESSION_MS = 2500

// Roughly 8 frames a second. Fast enough to feel instant, slow enough that
// jsQR does not pin the CPU on an older iPhone in a parking lot.
const FRAME_INTERVAL_MS = 120

export function useQrScanner(onScan: (value: string) => void) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const detectorRef = useRef<BarcodeDetectorLike | null>(null)
  const lastValueRef = useRef<{ value: string; at: number } | null>(null)
  const busyRef = useRef(false)

  // Kept in a ref so the frame loop never restarts when the handler identity
  // changes, which it does on every parent render.
  const onScanRef = useRef(onScan)
  useEffect(() => {
    onScanRef.current = onScan
  }, [onScan])

  const [state, setState] = useState<ScannerState>('idle')
  const [message, setMessage] = useState<string | null>(null)

  const emit = useCallback((value: string) => {
    const now = Date.now()
    const last = lastValueRef.current
    if (last && last.value === value && now - last.at < REPEAT_SUPPRESSION_MS) {
      return
    }
    lastValueRef.current = { value, at: now }
    onScanRef.current(value)
  }, [])

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    for (const track of streamRef.current?.getTracks() ?? []) track.stop()
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setState('idle')
  }, [])

  const readFrame = useCallback(async () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    // Skip while a previous decode is still running: jsQR on a large frame
    // can outlast the interval, and queuing them up would only add latency.
    if (!video || !canvas || busyRef.current) return
    if (video.readyState < video.HAVE_CURRENT_DATA) return

    busyRef.current = true
    try {
      const detector = detectorRef.current
      if (detector) {
        const found = await detector.detect(video)
        const value = found[0]?.rawValue
        if (value) emit(value)
        return
      }

      const width = video.videoWidth
      const height = video.videoHeight
      if (!width || !height) return

      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) return
      context.drawImage(video, 0, 0, width, height)

      const { default: jsQR } = await import('jsqr')
      const image = context.getImageData(0, 0, width, height)
      const result = jsQR(image.data, width, height, {
        inversionAttempts: 'dontInvert',
      })
      if (result?.data) emit(result.data)
    } catch {
      // A single bad frame is not worth surfacing. The camera is still
      // running and the next frame is 120ms away.
    } finally {
      busyRef.current = false
    }
  }, [emit])

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setState('unsupported')
      setMessage(
        'This browser cannot open the camera. Try Safari on iPhone or Chrome on Android.'
      )
      return
    }

    setState('starting')
    setMessage(null)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        // The back camera, and a resolution high enough to resolve a QR
        // shown on somebody else's phone screen at arm's length.
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      })
      streamRef.current = stream

      const video = videoRef.current
      if (!video) {
        for (const track of stream.getTracks()) track.stop()
        return
      }
      video.srcObject = stream
      // Required by iOS Safari, which otherwise takes the video fullscreen
      // and hides the whole scanning UI behind its own player.
      video.setAttribute('playsinline', 'true')
      await video.play()

      const Detector = (
        window as unknown as {
          BarcodeDetector?: new (options: { formats: string[] }) => BarcodeDetectorLike
        }
      ).BarcodeDetector
      if (Detector) {
        try {
          detectorRef.current = new Detector({ formats: ['qr_code'] })
        } catch {
          detectorRef.current = null
        }
      } else {
        detectorRef.current = null
      }

      setState('scanning')
      timerRef.current = setInterval(() => void readFrame(), FRAME_INTERVAL_MS)
    } catch (err) {
      const name = err instanceof Error ? err.name : ''
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setState('denied')
        setMessage(
          'Camera access was blocked. Allow it for this site in your browser settings, then try again.'
        )
      } else if (name === 'NotFoundError') {
        setState('error')
        setMessage('No camera found on this device.')
      } else {
        setState('error')
        setMessage('Could not start the camera. Close other apps using it and try again.')
      }
    }
  }, [readFrame])

  // Release the camera if the page unmounts mid-scan. A live camera left
  // running is both a battery drain and a privacy surprise.
  useEffect(() => stop, [stop])

  return { videoRef, canvasRef, state, message, start, stop }
}
