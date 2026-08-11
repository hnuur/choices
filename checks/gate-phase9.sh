#!/usr/bin/env bash
# Phase-9 verify gate (PLAN.md): tsc and build clean; vitest green; the
# landing wiring is present — composer as one rounded unit whose starter
# prompts seed the input, equal-width quiet secondaries, mono section
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

# NT4: composer is one rounded unit and starter prompts seed the input
# (a detached Create button or create-on-tap starters would fail these)
grep -q 'What are you deciding?' "$H" || fail "composer placeholder missing"
grep -q 'rounded-2xl border border-hairline bg-surface py-1.5 pl-4 pr-1.5' "$H" \
  || fail "composer is not one rounded field"
grep -q 'const STARTERS' "$H" || fail "starter prompts missing"
grep -q 'setName(starter)' "$H" || fail "starter taps do not seed the input"
ok "composer unit + tappable starter seeds"

# NT5: secondaries are equal-width quiet buttons, not competing with Create
grep -q 'grid grid-cols-2 gap-3' "$H" || fail "secondary actions are not equal-width"
grep -q 'Ramble it' "$H" || fail "Ramble it missing"
grep -q 'Import backup' "$H" || fail "Import backup missing"
grep -q 'bg-gradient-to-b from-accent-ink to-accent' "$H" \
  || fail "Create is not the single accent pill"
ok "equal-width quiet secondaries with a single accent CTA"

# NT6: list structure — mono section header, sort menu, dashed footer
grep -q 'Your decisions · ' "$H" || fail "mono section header missing"
grep -q "id: 'recent'" "$H" || fail "Recent sort missing"
grep -q "id: 'alpha'" "$H" || fail "A–Z sort missing"
grep -q 'border-dashed border-divider' "$H" || fail "dashed footer note missing"
grep -q 'Decisions stay on this device. Export a backup to keep them.' "$H" \
  || fail "local-only footer copy missing"
ok "section header + sort menu + dashed local-only footer"

# NT7: rows carry real state — status model, progress, mono counts, timestamp
grep -q "'winner' | 'scoring' | 'draft'" "$H" || fail "row status model missing"
grep -q 'dim · ' "$H" || fail "mono dimension/option counts missing"
grep -q 'results.scoredCells' "$H" || fail "row progress not derived from scored cells"
grep -q 'bg-bar-dim' "$H" || fail "draft bar stub missing"
grep -q 'yesterday' "$APP/src/ui/format.ts" || fail "timeAgo lacks yesterday form"
grep -q "month: 'short', day: 'numeric'" "$APP/src/ui/format.ts" \
  || fail "timeAgo lacks the Mon-day form"
ok "stateful rows (chips, progress, counts, timestamps)"

# NT8: delete is a muted tertiary that only reddens on hover; confirm kept
grep -q 'text-ink-4 hover:bg-hover hover:text-red-400' "$APP/src/ui/bits.tsx" \
  || fail "delete is not muted-until-hover"
grep -q 'arming' "$APP/src/ui/bits.tsx" || fail "two-step confirm lost"
ok "muted delete with two-step confirm"

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
