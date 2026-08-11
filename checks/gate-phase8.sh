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

# NT4: fonts self-hosted — no CDN font source anywhere, bundled woff2 in
# dist, and the service worker precaches them (offline redesign).
grep -Rqi 'fonts\.googleapis\.com\|fonts\.gstatic\.com' "$APP/index.html" "$APP/src" \
  && fail "external font source found (plan: self-hosted)"
ls "$APP"/dist/assets/*latin*.woff2 >/dev/null 2>&1 || fail "no self-hosted latin woff2 in dist"
grep -q 'woff2' "$APP/dist/sw.js" || fail "service worker does not precache the fonts"
grep -q '@fontsource' "$APP/src/main.tsx" || fail "main.tsx does not import the self-hosted fonts (guard would pass vacuously)"
ok "fonts self-hosted and precached"

# NT5: dark tokens live in the built stylesheet
CSS=$(ls "$APP"/dist/assets/index-*.css)
for tok in 08090b 12151a 101317 171b21 5ad0f0 8ddcf2 04161d; do
  grep -qi "$tok" "$CSS" || fail "token #$tok missing from built css"
done
ok "dark tokens present in built css"

# NT6: the light Phase-4 skin is gone from the components (negative test —
# semantic red/amber stays allowed; bg-white/9 hover fills are dark-theme
# tokens, solid bg-white cards are the light skin)
offenders=$(grep -REl 'bg-white($|[^/])|bg-slate|text-slate|border-slate|shadow-sm|bg-sky-|bg-emerald' \
  "$APP/src/App.tsx" "$APP/src/ui" || true)
[ -z "$offenders" ] || fail "light-skin classes remain: $offenders"
ok "light skin removed from components"

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
grep -q 'border-accent' "$APP/src/ui/DecisionView.tsx" || fail "underline tab row missing"
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
for kw in dark menu underline winner banner thickness weight offline fonts; do
  grep -qi "$kw" "$CL" || fail "checklist missing redesign criterion: $kw"
done
ok "manual checklist covers the redesign ($items items)"

# NT10: doctor green
bash checks/doctor.sh >/dev/null || fail "doctor failed"
ok "doctor exits 0"

printf 'gate-phase8: %d/%d ok\n' "$pass" "$pass"
