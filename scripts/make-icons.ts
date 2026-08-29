// Generates the app icons the PWA manifest points at.
//
// Run once and commit the output: npx tsx scripts/make-icons.ts
//
// These are placeholders drawn in code, not the club's artwork. The badge is
// still owed (brief Section 14) and would turn to mush at 192px anyway, so
// this draws a plain V on the amber brand colour. Swapping them later means
// dropping real files into public/ with the same names and deleting this
// script.

import { writeFileSync } from 'node:fs'
import { rgbPng } from '../src/lib/wallet/png'

const AMBER = [0xe4, 0x81, 0x25] as const
const WHITE = [0xff, 0xff, 0xff] as const

// Distance from a point to a line segment, both in 0..1 space.
function distanceToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const dx = bx - ax
  const dy = by - ay
  const lengthSquared = dx * dx + dy * dy
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared))
  const cx = ax + t * dx
  const cy = ay + t * dy
  return Math.hypot(px - cx, py - cy)
}

function icon(size: number, maskable: boolean): Buffer {
  const pixels = Buffer.alloc(size * size * 3)
  // A maskable icon is cropped to a circle on Android, so the glyph is drawn
  // smaller to survive the crop.
  const scale = maskable ? 0.72 : 1
  const halfWidth = 0.075 * scale

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size
      const v = (y + 0.5) / size
      const cu = 0.5 + (u - 0.5) / scale
      const cv = 0.5 + (v - 0.5) / scale

      const left = distanceToSegment(cu, cv, 0.28, 0.25, 0.5, 0.75)
      const right = distanceToSegment(cu, cv, 0.72, 0.25, 0.5, 0.75)
      const colour = Math.min(left, right) < halfWidth ? WHITE : AMBER

      const offset = (y * size + x) * 3
      pixels[offset] = colour[0]
      pixels[offset + 1] = colour[1]
      pixels[offset + 2] = colour[2]
    }
  }
  return rgbPng(size, size, pixels)
}

const outputs: [string, Buffer][] = [
  ['public/icon-192.png', icon(192, false)],
  ['public/icon-512.png', icon(512, false)],
  ['public/icon-maskable-512.png', icon(512, true)],
  ['public/apple-touch-icon.png', icon(180, false)],
]

for (const [path, data] of outputs) {
  writeFileSync(path, data)
  console.log(`wrote ${path} (${data.length} bytes)`)
}
