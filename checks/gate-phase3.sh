#!/bin/bash
# Phase 3 verify gate: engine test battery + enforcement health.
# Self-asserting: suites must exist and actually run (an exit-0 with zero
# passing tests fails), so a broken battery can never pass vacuously.
# Safe to re-run: requires a clean tree, installs from the committed lockfile.
set -u
cd "$(dirname "$0")/.." || exit 1

if [ -n "$(git status --porcelain)" ]; then
  echo "gate-phase3: working tree not clean; refusing to run." >&2
  exit 2
fi

pass=0; failn=0
ok()  { printf 'ok   %s\n' "$1"; pass=$((pass + 1)); }
bad() { printf 'GATE-FAIL %s\n' "$1"; failn=$((failn + 1)); }

# NT1: engine suites exist and are non-empty (vacuous-pass guard).
suites_found=0
for f in app/src/scoring.test.ts app/src/mutations.test.ts; do
  if [ -f "$f" ] && grep -qE '\bit\(' "$f"; then
    suites_found=$((suites_found + 1))
  else
    bad "suite missing or has no tests: $f"
  fi
done
[ "$suites_found" -eq 2 ] && ok "engine suites present with tests"

# NT2: node available (the engine runs nowhere without it).
if command -v node >/dev/null 2>&1; then
  ok "node available"
else
  bad "node not found; app/ needs it"
fi

# NT3: dependencies installed; fresh clones install from the committed lockfile.
if [ ! -d app/node_modules ]; then
  echo "note: app/node_modules missing; running npm ci..."
  if ! (cd app && npm ci --no-audit --no-fund) >/dev/null 2>&1; then
    bad "npm ci failed"
  fi
fi
[ -d app/node_modules ] && ok "app dependencies installed"

# NT4: typecheck clean.
if (cd app && npx tsc -b) >/dev/null 2>&1; then
  ok "tsc clean"
else
  bad "tsc reports errors"
  (cd app && npx tsc -b) 2>&1 | tail -20 | sed 's/^/    /'
fi

# NT5: vitest suite green AND actually ran tests.
if out=$(cd app && npx vitest run 2>&1); then
  if printf '%s' "$out" | grep -Eq 'Tests +[1-9][0-9]* passed' \
     && ! printf '%s' "$out" | grep -q 'failed'; then
    ok "vitest suite green ($(printf '%s' "$out" | grep -Eo 'Tests +[0-9]+ passed' | head -1))"
  else
    bad "vitest exited 0 but reported no passing tests"
    printf '%s\n' "$out" | tail -20 | sed 's/^/    /'
  fi
else
  bad "vitest suite red"
  printf '%s\n' "$out" | tail -30 | sed 's/^/    /'
fi

# NT6: mutation contract — Dexie is imported only by app/src/db.ts; the UI
# and everything else go through the typed mutation layer. Assert db.ts does
# import Dexie so deleting the dependency cannot pass this test vacuously.
if ! grep -q "from 'dexie'" app/src/db.ts; then
  bad "app/src/db.ts no longer imports Dexie (guard would pass vacuously)"
elif offenders=$(grep -REl "from ['\"]dexie['\"]" app/src --include='*.ts' --include='*.tsx' | grep -v '^app/src/db\.ts$' || true) && [ -z "$offenders" ]; then
  ok "Dexie confined to app/src/db.ts (mutation contract)"
else
  bad "Dexie imported outside app/src/db.ts: $(printf '%s' "$offenders" | tr '\n' ' ')"
fi

# NT7: doctor must be green (part of every phase gate per PLAN.md).
if ./checks/doctor.sh >/dev/null 2>&1; then
  ok "doctor exits 0"
else
  bad "doctor is red"
  ./checks/doctor.sh 2>&1 | sed 's/^/    /'
fi

echo
echo "gate-phase3: $pass ok, $failn failed"
[ "$failn" -eq 0 ] || exit 1
exit 0
