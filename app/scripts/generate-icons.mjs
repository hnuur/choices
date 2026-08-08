#!/usr/bin/env node
// Deterministic PWA icon generator — no image dependencies, so a fresh clone
// can regenerate public/*.png with: node scripts/generate-icons.mjs
// Draws the Choices mark: sky-500 field with a white check glyph.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

// --- minimal PNG encoder ------------------------------------------------------

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type: RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1)
    raw[row] = 0 // filter: none
    rgba.copy(raw, row + 1, y * size * 4, (y + 1) * size * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// --- drawing --------------------------------------------------------------------

const BG = [14, 165, 233] // sky-500, matches theme_color
const FG = [255, 255, 255]

function segmentDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/**
 * Renders one icon. glyphScale shrinks the glyph about the centre so the
 * maskable variant stays inside the OS mask's safe zone; the field is always
 * full-bleed (iOS and Android both apply their own corner mask).
 */
function renderIcon(size, glyphScale) {
  const c = 0.5
  const s = (u) => c + (u - c) * glyphScale
  const A = [s(0.27), s(0.53)]
  const B = [s(0.44), s(0.69)]
  const C = [s(0.75), s(0.34)]
  const radius = 0.072 * glyphScale
  const SS = 4 // 4x4 supersampling
  const rgba = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let acc = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = (x + (sx + 0.5) / SS) / size
          const py = (y + (sy + 0.5) / SS) / size
          const d = Math.min(
            segmentDist(px, py, A[0], A[1], B[0], B[1]),
            segmentDist(px, py, B[0], B[1], C[0], C[1]),
          )
          acc += Math.max(0, Math.min(1, ((radius - d) * size) / 1.5 + 0.5))
        }
      }
      const a = acc / (SS * SS)
      const i = (y * size + x) * 4
      rgba[i] = Math.round(BG[0] + (FG[0] - BG[0]) * a)
      rgba[i + 1] = Math.round(BG[1] + (FG[1] - BG[1]) * a)
      rgba[i + 2] = Math.round(BG[2] + (FG[2] - BG[2]) * a)
      rgba[i + 3] = 255
    }
  }
  return rgba
}

mkdirSync(outDir, { recursive: true })
const icons = [
  ['icon-192.png', 192, 1],
  ['icon-512.png', 512, 1],
  // Maskable: glyph pulled into the central 80% safe zone.
  ['icon-maskable-512.png', 512, 0.8],
  // iOS pre-composits this one; keep it opaque and full-bleed.
  ['apple-touch-icon.png', 180, 1],
]
for (const [name, size, scale] of icons) {
  const path = join(outDir, name)
  writeFileSync(path, encodePng(size, renderIcon(size, scale)))
  console.log(`wrote public/${name} (${size}x${size})`)
}
