'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// Draw-your-signature box.
//
// Strokes are captured as normalized coordinates (0 to 1 on both axes) so
// the same signature redraws at any size, on any screen, years later. That
// geometry is what is stored; see migration 0004 for why it is stored in the
// row rather than as an uploaded image.
//
// Pointer events rather than touch events: one code path covers a finger, a
// stylus, and a mouse, and it does not fight the browser over which of the
// two fired first.

export type Stroke = { x: number; y: number }[]

export function SignaturePad({
  name,
  onChange,
}: {
  name: string
  onChange?: (hasInk: boolean) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const strokesRef = useRef<Stroke[]>([])
  const drawingRef = useRef(false)
  const [hasInk, setHasInk] = useState(false)
  const [serialized, setSerialized] = useState('[]')

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return

    context.clearRect(0, 0, canvas.width, canvas.height)
    context.lineWidth = 2.5
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.strokeStyle = '#2B2D2E'

    for (const stroke of strokesRef.current) {
      if (stroke.length === 0) continue
      context.beginPath()
      stroke.forEach((point, index) => {
        const x = point.x * canvas.width
        const y = point.y * canvas.height
        if (index === 0) context.moveTo(x, y)
        else context.lineTo(x, y)
      })
      // A single tap is a dot, not a zero-length line that draws nothing.
      if (stroke.length === 1 && stroke[0]) {
        context.lineTo(
          stroke[0].x * canvas.width + 0.5,
          stroke[0].y * canvas.height + 0.5
        )
      }
      context.stroke()
    }
  }, [])

  // Match the backing store to the CSS size and the device pixel ratio, or
  // the line is blurry on every phone made in the last decade.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const ratio = window.devicePixelRatio || 1
      canvas.width = Math.round(rect.width * ratio)
      canvas.height = Math.round(rect.height * ratio)
      redraw()
    }
    resize()
    window.addEventListener('resize', resize)
    window.addEventListener('orientationchange', resize)
    return () => {
      window.removeEventListener('resize', resize)
      window.removeEventListener('orientationchange', resize)
    }
  }, [redraw])

  const commit = useCallback(() => {
    const ink = strokesRef.current.some((s) => s.length > 0)
    setHasInk(ink)
    setSerialized(
      JSON.stringify(
        strokesRef.current.map((stroke) =>
          stroke.map((p) => [
            Math.round(p.x * 1000) / 1000,
            Math.round(p.y * 1000) / 1000,
          ])
        )
      )
    )
    onChange?.(ink)
  }, [onChange])

  const pointFrom = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return null
    return {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    }
  }

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        className="h-40 w-full touch-none rounded-md border border-vcdc-cog/40 bg-white"
        onPointerDown={(event) => {
          const point = pointFrom(event)
          if (!point) return
          event.currentTarget.setPointerCapture(event.pointerId)
          drawingRef.current = true
          strokesRef.current = [...strokesRef.current, [point]]
          redraw()
        }}
        onPointerMove={(event) => {
          if (!drawingRef.current) return
          const point = pointFrom(event)
          if (!point) return
          const strokes = strokesRef.current
          const current = strokes[strokes.length - 1]
          if (!current) return
          current.push(point)
          redraw()
        }}
        onPointerUp={() => {
          if (!drawingRef.current) return
          drawingRef.current = false
          commit()
        }}
        onPointerLeave={() => {
          if (!drawingRef.current) return
          drawingRef.current = false
          commit()
        }}
        onPointerCancel={() => {
          drawingRef.current = false
          commit()
        }}
      />
      <input type="hidden" name={name} value={serialized} />
      <div className="flex items-center justify-between text-xs text-vcdc-cog">
        <span>
          {hasInk ? 'Signed above.' : 'Sign with a finger or a stylus.'}
        </span>
        <button
          type="button"
          className="underline"
          onClick={() => {
            strokesRef.current = []
            redraw()
            commit()
          }}
        >
          Clear
        </button>
      </div>
    </div>
  )
}
