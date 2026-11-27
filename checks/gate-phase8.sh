#!/usr/bin/env bash
# Phase-8 verify gate (PLAN.md): tsc and build clean; vitest green; fonts
# self-hosted and precached (no CDN, offline redesign); dark tokens live in
# the built stylesheet and the light Phase-4 skin is gone from the
# components; results bars normalized against the dimension best with weight
# as thickness/opacity (no ×weight labels); decision-view chrome wiring
# (••• menu, underline tabs, bottom bar, peek-as-bar) present; checklist
# covers the redesign; doctor green.
#
# Run: bash checks/gate-phase8.sh   (requires a clean tree)
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

# NT4: platform typography remains available offline without a font download.
grep -Rqi 'fonts\.googleapis\.com\|fonts\.gstatic\.com' "$APP/index.html" "$APP/src" \
  && fail "external font source found"
grep -q -- '--font-ui: -apple-system' "$APP/src/index.css" || fail "platform font stack missing"
ok "platform typography is available offline"

# NT5: both appearances and contrast preferences are present in the build.
CSS=$(ls "$APP"/dist/assets/index-*.css)
for tok in 'prefers-color-scheme:dark' 'prefers-contrast:more' f1f4f2 111915 14664e 80dfb5; do
  grep -qi "$tok" "$CSS" || fail "appearance token $tok missing from built css"
done
ok "light, dark, and increased-contrast styles present"

# NT6: shared colors are resolved by appearance rather than hardcoded in components.
offenders=$(grep -REl 'bg-white($|[^/])|bg-slate|text-slate|border-slate|bg-sky-|bg-emerald|text-red-|text-amber-' \
  "$APP/src/App.tsx" "$APP/src/ui" || true)
[ -z "$offenders" ] || fail "hardcoded appearance classes remain: $offenders"
ok "components use appearance-aware colors"

# NT7: results bars normalized against the dimension best, weight encoded as
# thickness + opacity, ×weight labels gone
grep -q 'barFraction' "$APP/src/ui/ResultsTab.tsx" || fail "dimension-best bar normalization missing"
grep -q '1 + d.importance' "$APP/src/ui/ResultsTab.tsx" || fail "weight-as-thickness missing"
grep -q '0.5 + d.importance' "$APP/src/ui/ResultsTab.tsx" || fail "weight-as-opacity missing"
grep -q '×{d.importance}' "$APP/src/ui/ResultsTab.tsx" && fail "×weight labels still rendered"
ok "results bar normalization + weight encoding in place"

# NT8: decision-view chrome wiring (each guard would pass vacuously
# otherwise, so the wiring itself is asserted)
grep -q 'Edit dimensions' "$APP/src/ui/DecisionView.tsx" || fail "••• menu lacks Edit dimensions"
grep -q 'Export backup (.json)' "$APP/src/ui/DecisionView.tsx" || fail "••• menu lacks Export backup"
grep -q 'className="segmented' "$APP/src/ui/DecisionView.tsx" || fail "grouped decision sections missing"
grep -q 'fixed inset-x-0 bottom-0' "$APP/src/ui/DecisionView.tsx" || fail "fixed bottom Ask-AI bar missing"
grep -q 'onApplied' "$APP/src/ui/DecisionView.tsx" || fail "bottom bar lacks the AI status line wiring"
grep -q "state !== 'full'" "$APP/src/ui/ChatSheet.tsx" || fail "chat sheet no longer drops to the bar (peek)"
grep -q 'onApplied' "$APP/src/ui/ChatSheet.tsx" || fail "chat sheet does not report applies to the bar"
ok "decision-view chrome wiring (menu, tabs, bottom bar, peek-as-bar) present"

# NT9: checklist covers the redesign
CL="$APP/MANUAL-CHECKLIST.md"
[ -f "$CL" ] || fail "manual checklist missing"
items=$(grep -c '^- \[' "$CL" || true)
[ "$items" -ge 50 ] || fail "checklist too thin ($items items)"
for kw in dark menu winner thickness weight offline typography; do
  grep -qi "$kw" "$CL" || fail "checklist missing redesign criterion: $kw"
done
ok "manual checklist covers the redesign ($items items)"

# NT10: doctor green
bash checks/doctor.sh >/dev/null || fail "doctor failed"
ok "doctor exits 0"

printf 'gate-phase8: %d/%d ok\n' "$pass" "$pass"
