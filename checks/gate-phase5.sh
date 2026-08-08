#!/usr/bin/env bash
# Phase-5 verify gate (PLAN.md): build clean; PWA actually wired (standalone
# manifest with maskable icon, real PNG icons incl. apple-touch, iOS metas,
# service-worker precache for full offline, storage persist on startup);
# export/import UI wired through the mutation layer; checklist covers
# offline/standalone/export→wipe→import; doctor green.
#
# Run: bash checks/gate-phase5.sh   (requires a clean tree)
set -euo pipefail
cd "$(dirname "$0")/.."

pass=0
ok()   { printf 'ok %d %s\n' $((++pass)) "$1"; }
fail() { printf 'FAIL %s\n' "$1" >&2; exit 1; }

[ -z "$(git status --porcelain)" ] || fail "clean tree required (commit or stash first)"

APP=app
[ -d "$APP/node_modules" ] || (cd "$APP" && npm ci --no-audit --no-fund)

# NT1: typecheck clean
(cd "$APP" && npx tsc -b) || fail "tsc -b reported errors"
ok "tsc -b clean"

# NT2: production build clean and non-vacuous
(cd "$APP" && npm run build >/dev/null) || fail "vite build failed"
[ -f "$APP/dist/index.html" ] || fail "dist/index.html missing"
grep -q 'assets/' "$APP/dist/index.html" || fail "dist/index.html references no bundled assets"
ok "production build clean and non-vacuous"

# NT3: engine + mutation suites still green (regression)
(cd "$APP" && npx vitest run >/dev/null) || fail "vitest suite not green"
ok "vitest green"

# NT4: Dexie still confined to db.ts (mutation contract). Assert db.ts does
# import Dexie so deleting the dependency cannot pass this test vacuously.
grep -q "from 'dexie'" "$APP/src/db.ts" || fail "db.ts no longer imports Dexie (guard would pass vacuously)"
offenders=$(grep -REl "from ['\"]dexie['\"]" "$APP/src" --include='*.ts' --include='*.tsx' | grep -v "^$APP/src/db\.ts$" || true)
[ -z "$offenders" ] || fail "Dexie imported outside app/src/db.ts: $offenders"
ok "Dexie confined to db.ts"

# NT5: built web manifest is real — parses, standalone display, maskable icon
MANIFEST="$APP/dist/manifest.webmanifest"
[ -f "$MANIFEST" ] || fail "dist/manifest.webmanifest missing"
node -e '
  const m = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))
  const assert = (c, msg) => { if (!c) { console.error(msg); process.exit(1) } }
  assert(m.display === "standalone", "manifest display is not standalone")
  assert(m.start_url === "/", "manifest start_url is not /")
  assert(Array.isArray(m.icons) && m.icons.length >= 2, "manifest lacks icons")
  assert(m.icons.some((i) => i.purpose === "maskable"), "no maskable icon in manifest")
  assert(m.icons.every((i) => i.src && i.sizes && i.type), "icon entry missing src/sizes/type")
' "$MANIFEST" || fail "manifest.webmanifest invalid"
ok "web manifest: standalone + maskable icon"

# NT6: icon files are real PNGs with the declared dimensions (maskable +
# apple-touch), so the gate cannot pass on placeholders.
node -e '
  const fs = require("fs")
  const assert = (c, msg) => { if (!c) { console.error(msg); process.exit(1) } }
  const pngSize = (p) => {
    const b = fs.readFileSync(p)
    assert(b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), p + ": not a PNG")
    assert(b.readUInt32BE(16) === b.readUInt32BE(20), p + ": not square")
    return b.readUInt32BE(16)
  }
  assert(pngSize("app/public/icon-192.png") === 192, "icon-192 wrong size")
  assert(pngSize("app/public/icon-512.png") === 512, "icon-512 wrong size")
  assert(pngSize("app/public/icon-maskable-512.png") === 512, "maskable icon wrong size")
  assert(pngSize("app/public/apple-touch-icon.png") === 180, "apple-touch-icon wrong size")
' || fail "icon PNGs missing or wrongly sized"
ok "icons: maskable + apple-touch PNGs real and correctly sized"

# NT7: iOS install wiring in the built shell
H="$APP/dist/index.html"
grep -q 'apple-mobile-web-app-capable' "$H" || fail "apple-mobile-web-app-capable meta missing"
grep -q 'apple-mobile-web-app-status-bar-style' "$H" || fail "status-bar-style meta missing"
grep -q 'apple-touch-icon' "$H" || fail "apple-touch-icon link missing"
grep -q 'theme-color' "$H" || fail "theme-color meta missing"
grep -q 'Add to Home Screen' "$APP/src/ui/InstallHint.tsx" || fail "iOS install hint missing"
ok "iOS metas, apple-touch-icon and install hint wired"

# NT8: precache for full offline — service worker shipped and precaches the
# shell and icons.
[ -f "$APP/dist/sw.js" ] || fail "dist/sw.js missing"
grep -q 'index.html' "$APP/dist/sw.js" || fail "sw.js does not precache index.html"
grep -q 'icon-192.png' "$APP/dist/sw.js" || fail "sw.js does not precache the icons"
grep -q 'manifest.webmanifest' "$APP/dist/sw.js" || fail "sw.js does not precache the manifest"
ok "service worker precaches shell, icons and manifest"

# NT9: storage persist on startup (iOS evicts non-persisted IndexedDB)
grep -q 'navigator.storage' "$APP/src/main.tsx" && grep -q 'persist()' "$APP/src/main.tsx" \
  || fail "navigator.storage.persist() not called at startup"
ok "storage persist requested on startup"

# NT10: export/import UI wired through the mutation layer (not reimplemented)
grep -rq 'exportDecision' "$APP/src/ui" || fail "exportDecision not used in the UI"
grep -rq 'importDecision' "$APP/src/ui" || fail "importDecision not used in the UI"
ok "export/import UI wired through the mutation layer"

# NT11: checklist covers offline reload, standalone display and the
# export → wipe → import round-trip.
CL="$APP/MANUAL-CHECKLIST.md"
[ -f "$CL" ] || fail "manual checklist missing"
items=$(grep -c '^- \[' "$CL" || true)
[ "$items" -ge 15 ] || fail "checklist too thin ($items items)"
for kw in offline standalone export wipe import 'home screen'; do
  grep -qi "$kw" "$CL" || fail "checklist missing Phase-5 step: $kw"
done
ok "manual checklist covers the PWA lifecycle ($items items)"

# NT12: doctor green
bash checks/doctor.sh >/dev/null || fail "doctor failed"
ok "doctor exits 0"

printf 'gate-phase5: %d/%d ok\n' "$pass" "$pass"
