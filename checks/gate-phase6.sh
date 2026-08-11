#!/usr/bin/env bash
# Phase-6 verify gate (PLAN.md): tsc and build clean; vitest green incl. the
# proposal parser (well-formed typed payloads only) and provider clients
# against recorded responses; Dexie still confined to the mutation layer;
# relay quota enforced by the relay battery; AI settings carry the
# disclosure lines and the chat sheet its lifecycle; checklist covers
# key-validation per preset, custom endpoint, relay quota-exhausted,
# approve/reject semantics, malformed-proposal errors, sheet lifecycle;
# doctor green.
#
# Run: bash checks/gate-phase6.sh   (requires a clean tree)
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

# NT3: app suite green, and the run actually includes the AI suites —
# a suite that never executes cannot pass this gate.
VITEST_OUT=$(mktemp)
trap 'rm -f "$VITEST_OUT"' EXIT
(cd "$APP" && npx vitest run) >"$VITEST_OUT" 2>&1 || { cat "$VITEST_OUT" >&2; fail "vitest suite not green"; }
grep -q 'proposals.test.ts' "$VITEST_OUT" || fail "proposal parser suite did not run"
grep -q 'providers.test.ts' "$VITEST_OUT" || fail "provider client suite did not run"
grep -q 'apply.test.ts' "$VITEST_OUT" || fail "applyProposals suite did not run"
ok "vitest green incl. parser, providers and apply suites"

# NT4: parser suite really rejects malformed/unknown payloads (negative-test
# assertion on the tests themselves)
PARSER_REJECTIONS=$(grep -c 'toThrowError' "$APP/src/ai/proposals.test.ts" || true)
[ "$PARSER_REJECTIONS" -ge 8 ] || fail "parser suite too weak: only $PARSER_REJECTIONS rejection assertions"
ok "parser suite asserts malformed/unknown rejection ($PARSER_REJECTIONS cases)"

# NT5: provider clients tested against recorded responses — fixtures exist
# and the suite imports them (not live calls, not invented bodies)
FIXTURES=$(ls "$APP/src/ai/fixtures/"*.json 2>/dev/null | wc -l | tr -d ' ')
[ "$FIXTURES" -ge 4 ] || fail "fewer than 4 recorded fixtures ($FIXTURES)"
grep -q "from './fixtures/" "$APP/src/ai/providers.test.ts" || fail "provider suite does not import the recorded fixtures"
ok "provider clients tested against recorded responses ($FIXTURES fixtures)"

# NT6: provider clients stay on native fetch — no SDK dependencies, and
# providers.ts actually calls fetch (guard against a vacuous rewrite)
for sdk in '"openai"' '"@anthropic-ai/sdk"' '"anthropic"' '"@google/generative-ai"'; do
  grep -q "$sdk" "$APP/package.json" && fail "SDK dependency found: $sdk (plan: native fetch only)"
done
grep -q 'fetch(' "$APP/src/ai/providers.ts" || fail "providers.ts does not use fetch (guard would pass vacuously)"
ok "provider clients use native fetch, no SDK deps"

# NT7: Dexie still confined to db.ts (mutation contract)
grep -q "from 'dexie'" "$APP/src/db.ts" || fail "db.ts no longer imports Dexie (guard would pass vacuously)"
offenders=$(grep -REl "from ['\"]dexie['\"]" "$APP/src" --include='*.ts' --include='*.tsx' | grep -v "^$APP/src/db\.ts$" || true)
[ -z "$offenders" ] || fail "Dexie imported outside app/src/db.ts: $offenders"
ok "Dexie confined to db.ts"

# NT8: AI writes flow through the mutation layer
grep -q "from '../mutations'" "$APP/src/ai/apply.ts" || fail "apply.ts bypasses the mutation layer"
ok "applyProposals wired through the mutation layer"

# NT9: relay battery green — quota enforcement lives in these tests
(cd relay && node --test >/dev/null 2>&1) || fail "relay node:test battery not green"
grep -qi 'quota' relay/relay.test.js || fail "relay battery has no quota tests"
ok "relay battery green incl. quota enforcement"

# NT10: disclosure and sheet wiring present
grep -q 'disclosureFor' "$APP/src/ui/AiSettingsPanel.tsx" || fail "AI settings lack the disclosure lines"
grep -q 'peek' "$APP/src/ui/ChatSheet.tsx" || fail "chat sheet lacks the peek state"
grep -q 'onCycleTab' "$APP/src/ui/ChatSheet.tsx" || fail "chat sheet lacks the context chip"
grep -q 'Ask AI' "$APP/src/ui/DecisionView.tsx" || fail "decision view lacks the Ask AI entry point"
ok "disclosure lines + sheet lifecycle (peek, chip, entry point) wired"

# NT11: checklist covers the Phase-6 lifecycle
CL="$APP/MANUAL-CHECKLIST.md"
[ -f "$CL" ] || fail "manual checklist missing"
items=$(grep -c '^- \[' "$CL" || true)
[ "$items" -ge 25 ] || fail "checklist too thin ($items items)"
for kw in 'Validate key' 'OpenAI' 'Anthropic' 'Gemini' 'custom endpoint' quota 'Approve' 'Reject' peek chip 'Ask AI'; do
  grep -qi "$kw" "$CL" || fail "checklist missing Phase-6 step: $kw"
done
ok "manual checklist covers the Phase-6 lifecycle ($items items)"

# NT12: doctor green
bash checks/doctor.sh >/dev/null || fail "doctor failed"
ok "doctor exits 0"

printf 'gate-phase6: %d/%d ok\n' "$pass" "$pass"
