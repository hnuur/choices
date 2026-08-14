#!/usr/bin/env bash
# Phase-12 verify gate (PLAN.md): tsc and build clean; vitest green; the
# three polish passes are wired — rename on the title, empty-Create error,
# no fake sheet handle, designed ramble control, export note outside the
# menu, entry tab from home-row status, first-dimension teaching sentence;
# checklist carries the polish items; doctor green.
#
# Run: bash checks/gate-phase12.sh   (requires a clean tree)
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

D="$APP/src/ui/DecisionView.tsx"
H="$APP/src/ui/Home.tsx"
C="$APP/src/ui/ChatSheet.tsx"
R="$APP/src/ui/RambleSheet.tsx"
T="$APP/src/ui/tabs.ts"
DIM="$APP/src/ui/DimensionsTab.tsx"

# NT4: pass 1 — title calls renameDecision
grep -q 'renameDecision' "$D" || fail "decision title does not call renameDecision"
grep -q 'aria-label={`Rename ${name}`}' "$D" || fail "rename control missing an accessible name"
grep -q 'skipSave' "$D" || fail "Escape-to-cancel can still save on blur"
ok "decision title wires renameDecision"

# NT5: pass 1 — empty Create surfaces an error
grep -q "setCreateError('Name the decision first.')" "$H" \
  || fail "empty Create does not set Name the decision first."
grep -q 'createError && <FieldError' "$H" || fail "empty-Create error is not rendered"
ok "empty Create surfaces an error"

# NT6: pass 1 — fake drag handle gone (it was visual only)
if grep -q 'h-1 w-10 -translate-x-1/2' "$C" "$R"; then
  fail "sheet still renders a fake drag handle"
fi
ok "chat and ramble sheets have no fake drag handle"

# NT7: pass 1 — decision-bar ramble matches Home's cyan-dot control, not an emoji
grep -q 'size-1.5 rounded-full bg-accent' "$D" || fail "decision-bar ramble lacks the cyan-dot mark"
grep -q 'aria-label="Ramble"' "$D" || fail "decision-bar ramble control missing"
grep -qE '^[[:space:]]+Ramble$' "$D" || fail "decision-bar ramble visible label missing"
if grep -q '🎤' "$D"; then fail "decision-bar ramble is still an emoji"; fi
ok "decision-bar ramble matches Home's cyan-dot button"

# NT8: pass 1 — backup-saved note lives under the title row, not in the menu
grep -A6 'dimensions · ' "$D" | grep -q 'exportNote' \
  || fail "export note is not under the title-row meta"
if awk '/menuOpen &&/,/Export backup/' "$D" | grep -q 'exportNote'; then
  fail "export note still lives inside the ••• menu"
fi
ok "export note survives closing the menu"

# NT9: pass 2 — entry tab follows home-row status; create stays Dimensions
grep -q 'export function entryTab' "$T" || fail "entryTab helper missing"
grep -q "if (results.complete) return 'results'" "$T" || fail "complete decisions do not open Results"
grep -q "if (results.totalCells > 0) return 'score'" "$T" || fail "partial scoring does not open Score"
grep -q 'onOpen(decision.id, entryTab(' "$H" || fail "home rows do not pass entryTab"
grep -q "onOpen(decision.id, 'dimensions')" "$H" || fail "create does not stay on Dimensions"
grep -q 'initialTab' "$APP/src/App.tsx" || fail "App does not pass initialTab"
grep -q 'initialTab: Tab' "$D" || fail "DecisionView does not take initialTab"
ok "entry tab follows home-row status"

# NT10: pass 3 — teaching sentence on the first dimension form only
grep -q 'Objective dimensions are facts with a unit' "$DIM" \
  || fail "teaching sentence missing"
grep -q 'hint={bundle.dimensions.length === 0}' "$DIM" \
  || fail "teaching sentence is not gated to the first dimension form"
ok "first-dimension teaching sentence"

# NT11: checklist carries the polish items
CL="$APP/MANUAL-CHECKLIST.md"
[ -f "$CL" ] || fail "manual checklist missing"
items=$(grep -c '^- \[' "$CL" || true)
[ "$items" -ge 88 ] || fail "checklist too thin ($items items)"
for kw in renameDecision 'Name the decision first' 'drag handle' 'cyan-dot' 'Backup saved' 'WINNER row' 'Objective dimensions'; do
  grep -q "$kw" "$CL" || fail "checklist missing polish criterion: $kw"
done
ok "manual checklist carries the polish items ($items items)"

# NT12: doctor green
bash checks/doctor.sh >/dev/null || fail "doctor failed"
ok "doctor exits 0"

printf 'gate-phase12: %d/%d ok\n' "$pass" "$pass"
