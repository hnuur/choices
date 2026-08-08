#!/usr/bin/env bash
# Phase-4 verify gate (PLAN.md): tsc + production build clean, manual
# checklist present and covering the decision lifecycle, engine/mutation
# suites still green, Dexie still confined, doctor green.
#
# Run: bash checks/gate-phase4.sh   (requires a clean tree)
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

# NT5: manual checklist present and covering the decision lifecycle
CL="$APP/MANUAL-CHECKLIST.md"
[ -f "$CL" ] || fail "manual checklist missing"
items=$(grep -c '^- \[' "$CL" || true)
[ "$items" -ge 10 ] || fail "checklist too thin ($items items)"
for kw in create dimension option score results delete confirm importance sensitivity; do
  grep -qi "$kw" "$CL" || fail "checklist missing lifecycle step: $kw"
done
ok "manual checklist present and covers the lifecycle ($items items)"

# NT6: doctor green
bash checks/doctor.sh >/dev/null || fail "doctor failed"
ok "doctor exits 0"

printf 'gate-phase4: %d/%d ok\n' "$pass" "$pass"
