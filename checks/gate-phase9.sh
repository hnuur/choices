#!/usr/bin/env bash
# Phase-9 verify gate (PLAN.md): tsc and build clean; vitest green; the
# landing wiring is present — composer as one rounded unit whose starter
# prompts seed the input, composer Ramble, footer import, mono section
# header with a Recent/A–Z sort, stateful rows (status chip, progress,
# mono counts, mono timestamp), muted delete with the two-step confirm
# kept, dashed local-only footer; checklist carries the landing criteria;
# doctor green.
#
# Run: bash checks/gate-phase9.sh   (requires a clean tree)
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

# NT3: regression suite green, and it actually ran
VITEST_OUT=$(mktemp)
trap 'rm -f "$VITEST_OUT"' EXIT
(cd "$APP" && npx vitest run) >"$VITEST_OUT" 2>&1 || { cat "$VITEST_OUT" >&2; fail "vitest suite not green"; }
grep -q 'scoring.test.ts' "$VITEST_OUT" || fail "scoring suite did not run"
grep -q 'mutations.test.ts' "$VITEST_OUT" || fail "mutation suite did not run"
ok "vitest green incl. scoring and mutation suites"

H="$APP/src/ui/Home.tsx"

# NT4: the composer keeps its label and starter prompts seed the input.
grep -q 'htmlFor="choice-name"' "$H" || fail "decision label missing"
grep -q 'What are you deciding?' "$H" || fail "composer placeholder missing"
grep -q 'const STARTERS' "$H" || fail "starter prompts missing"
grep -q 'setName(starter)' "$H" || fail "starter taps do not seed the input"
ok "labeled composer and tappable starter seeds"

# NT5: the form exposes a primary create action, Ramble, and footer import.
grep -q 'aria-label="Ramble"' "$H" || fail "composer lacks Ramble"
grep -q 'Import backup' "$H" || fail "Import backup missing"
grep -q 'type="submit" className="primary-action' "$H" || fail "Create is not the primary action"
ok "primary create, Ramble and footer import"

# NT6: decisions can be sorted and the footer explains local storage.
grep -q 'Your decisions' "$H" || fail "decision section header missing"
grep -q 'aria-label="Sort decisions"' "$H" || fail "sort control missing"
grep -q "id: 'recent'" "$H" || fail "Recent sort missing"
grep -q "id: 'alpha'" "$H" || fail "A–Z sort missing"
grep -q 'Decisions are stored on this device.' "$H" || fail "local-only footer copy missing"
ok "decision section, sort and local storage note"

# NT7: rows carry a meaningful state and scoring progress.
grep -q "'winner' | 'scoring' | 'draft'" "$H" || fail "row status model missing"
grep -q 'dimensions.length' "$H" || fail "dimension counts missing"
grep -q 'results.scoredCells' "$H" || fail "row progress not derived from scored cells"
grep -q 'yesterday' "$APP/src/ui/format.ts" || fail "timeAgo lacks yesterday form"
grep -q "month: 'short', day: 'numeric'" "$APP/src/ui/format.ts" || fail "timeAgo lacks the Mon-day form"
ok "stateful rows with progress, counts and timestamps"

# NT8: delete stays secondary and requires confirmation.
grep -q 'text-action text-danger' "$APP/src/ui/bits.tsx" || fail "destructive action styling missing"
grep -q 'arming' "$APP/src/ui/bits.tsx" || fail "two-step confirm lost"
ok "two-step delete confirmation"

# NT9: checklist carries the landing criteria
CL="$APP/MANUAL-CHECKLIST.md"
[ -f "$CL" ] || fail "manual checklist missing"
items=$(grep -c '^- \[' "$CL" || true)
[ "$items" -ge 65 ] || fail "checklist too thin ($items items)"
for kw in composer starter winner scoring draft footer sort; do
  grep -qi "$kw" "$CL" || fail "checklist missing landing criterion: $kw"
done
ok "manual checklist carries the landing criteria ($items items)"

# NT10: doctor green
bash checks/doctor.sh >/dev/null || fail "doctor failed"
ok "doctor exits 0"

printf 'gate-phase9: %d/%d ok\n' "$pass" "$pass"
