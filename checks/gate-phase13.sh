#!/usr/bin/env bash
# Phase-13 verify gate (PLAN.md): tsc and build clean; vitest green incl.
# recorded search-then-final and text-only (lookup-off) provider fixtures,
# unsupported custom/relay surfaces an error, disclosure asserted; toggle
# and Looking up… wired; checklist carries the lookup items; doctor green.
#
# Run: bash checks/gate-phase13.sh   (requires a clean tree)
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

# NT3: regression suite green, and the new suites actually ran
VITEST_OUT=$(mktemp)
trap 'rm -f "$VITEST_OUT"' EXIT
(cd "$APP" && npx vitest run) >"$VITEST_OUT" 2>&1 || { cat "$VITEST_OUT" >&2; fail "vitest suite not green"; }
grep -q 'providers.test.ts' "$VITEST_OUT" || fail "provider suite did not run"
grep -q 'settings.test.ts' "$VITEST_OUT" || fail "settings suite did not run"
grep -q 'context.test.ts' "$VITEST_OUT" || fail "context suite did not run"
ok "vitest green incl. provider, settings and context suites"

S="$APP/src/ai/settings.ts"
P="$APP/src/ai/providers.ts"
C="$APP/src/ui/ChatSheet.tsx"
R="$APP/src/ui/RambleSheet.tsx"

# NT4: opt-in default off; disclosure line when on
grep -q 'webLookup: boolean' "$S" || fail "webLookup setting missing"
grep -q 'webLookup: false' "$S" || fail "webLookup is not off by default"
grep -q 'a search may leave the device via that provider' "$S" || fail "lookup disclosure line missing"
grep -q 'adds the lookup line when the toggle is on' "$APP/src/ai/settings.test.ts" \
  || fail "disclosure not asserted"
ok "webLookup default off, disclosure asserted"

# NT5: per-preset native search, loop, no silent custom/relay fallback
grep -q '/v1/responses' "$P" || fail "OpenAI Responses path missing"
grep -q 'web_search_20250305' "$P" || fail "Anthropic web_search tool missing"
grep -q 'google_search' "$P" || fail "Gemini google_search tool missing"
grep -q 'LOOKUP_UNSUPPORTED' "$P" || fail "unsupported-lookup error missing"
grep -q 'previous_response_id' "$P" || fail "OpenAI search-then-final loop missing"
grep -q 'pause_turn' "$P" || fail "Anthropic pause_turn loop missing"
grep -q 'unsupported custom lookup surfaces a visible error' "$APP/src/ai/providers.test.ts" \
  || fail "custom/relay unsupported path not tested"
ok "provider-native search loop + unsupported custom/relay error"

# NT6: sheets pass the flag and show Looking up… only when on
grep -q 'systemPrompt(tabRef.current, ai.webLookup)' "$C" || fail "chat does not pass webLookup"
grep -q 'rambleSystemPrompt(ai.webLookup)' "$R" || fail "ramble does not pass webLookup"
grep -q "webLookup ? 'Looking up…' : 'Thinking…'" "$C" || fail "chat Looking up… missing"
grep -q "webLookup ? 'Looking up…' : 'Thinking…'" "$R" || fail "ramble Looking up… missing"
grep -q 'Web lookup' "$APP/src/ui/AiSettingsPanel.tsx" || fail "settings toggle missing"
ok "toggle + Looking up… wired on chat and ramble"

# NT7: checklist carries the lookup criteria (phrases stay on one grep line)
CL="$APP/MANUAL-CHECKLIST.md"
[ -f "$CL" ] || fail "manual checklist missing"
items=$(grep -c '^- \[' "$CL" || true)
[ "$items" -ge 94 ] || fail "checklist too thin ($items items)"
for kw in 'Web lookup' 'Looking up' 'This endpoint cannot look up the web' 'still needs Approve' citations; do
  grep -q "$kw" "$CL" || fail "checklist missing lookup criterion: $kw"
done
ok "manual checklist carries the lookup criteria ($items items)"

# NT8: doctor green
bash checks/doctor.sh >/dev/null || fail "doctor failed"
ok "doctor exits 0"

printf 'gate-phase13: %d/%d ok\n' "$pass" "$pass"
