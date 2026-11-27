#!/usr/bin/env node
// Regenerate the PWA icons from the approved artwork using Python 3 and Pillow.
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptsDir = dirname(fileURLToPath(import.meta.url))
const outDir = join(scriptsDir, '..', 'public')
const source = join(outDir, 'icon-512.png')
execFileSync('python3', ['-c', `
from pathlib import Path
from PIL import Image
import sys

image = Image.open(sys.argv[1]).convert('RGB')
output = Path(sys.argv[2])
output.mkdir(parents=True, exist_ok=True)
for name, size, scale in [
    ('icon-192.png', 192, 1),
    ('icon-maskable-512.png', 512, 0.8),
    ('apple-touch-icon.png', 180, 1),
]:
    scaled = round(size * scale)
    icon = Image.new('RGB', (size, size), image.getpixel((0, 0)))
    artwork = image.resize((scaled, scaled), Image.Resampling.LANCZOS)
    offset = (size - scaled) // 2
    icon.paste(artwork, (offset, offset))
    icon.save(output / name, optimize=True)
`, source, outDir], { stdio: 'inherit' })
