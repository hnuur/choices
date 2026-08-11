#!/usr/bin/env bash
# Phase-7 verify gate (PLAN.md): tsc and build clean; vitest green incl. the
# STT client against recorded responses, the parser rejection suite covering
# createDecision, and the skeleton apply/mutation paths; Dexie still confined
# to the mutation layer; skeleton creation transactional and wired through
# the mutation layer; STT stays on native fetch with no SDK deps; recorder +
# sheet wiring present (mimeType probing for Safari AAC/mp4, greyed mic,
# insecure-context message, home entry point); checklist covers the record →
# approve round-trip, greyed mic, insecure context, real-iPhone round-trip
# and the reject path; doctor green.
#
# Run: bash checks/gate-phase7.sh   (requires a clean tree)
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

# NT3: app suite green, and the run actually includes the Phase-7 suites —
# a suite that never executes cannot pass this gate.
VITEST_OUT=$(mktemp)
trap 'rm -f "$VITEST_OUT"' EXIT
(cd "$APP" && npx vitest run) >"$VITEST_OUT" 2>&1 || { cat "$VITEST_OUT" >&2; fail "vitest suite not green"; }
grep -q 'stt.test.ts' "$VITEST_OUT" || fail "STT client suite did not run"
grep -q 'proposals.test.ts' "$VITEST_OUT" || fail "proposal parser suite did not run"
grep -q 'apply.test.ts' "$VITEST_OUT" || fail "apply suite did not run"
grep -q 'mutations.test.ts' "$VITEST_OUT" || fail "mutation suite did not run"
ok "vitest green incl. stt, parser, apply and mutation suites"

# NT4: parser suite really rejects malformed payloads incl. createDecision
# (negative-test assertion on the tests themselves)
PARSER_REJECTIONS=$(grep -c 'toThrowError' "$APP/src/ai/proposals.test.ts" || true)
[ "$PARSER_REJECTIONS" -ge 14 ] || fail "parser suite too weak: only $PARSER_REJECTIONS rejection assertions"
grep -q 'createDecision' "$APP/src/ai/proposals.test.ts" || fail "parser suite has no createDecision cases"
ok "parser suite asserts malformed rejection incl. createDecision ($PARSER_REJECTIONS cases)"

# NT5: STT client tested against recorded responses — fixtures exist and the
# suite imports them (not live calls, not invented bodies)
FIXTURES=$(ls "$APP/src/ai/fixtures/"*.json 2>/dev/null | wc -l | tr -d ' ')
[ "$FIXTURES" -ge 6 ] || fail "fewer than 6 recorded fixtures ($FIXTURES)"
grep -q "from './fixtures/" "$APP/src/ai/stt.test.ts" || fail "STT suite does not import the recorded fixtures"
ok "STT client tested against recorded responses ($FIXTURES fixtures total)"

# NT6: STT stays on native fetch — no SDK dependencies, and stt.ts actually
# calls fetch (guard against a vacuous rewrite)
for sdk in '"openai"' '"@anthropic-ai/sdk"' '"anthropic"' '"@google/generative-ai"'; do
  grep -q "$sdk" "$APP/package.json" && fail "SDK dependency found: $sdk (plan: native fetch only)"
done
grep -q 'fetch(' "$APP/src/ai/stt.ts" || fail "stt.ts does not use fetch (guard would pass vacuously)"
ok "STT client uses native fetch, no SDK deps"

# NT7: Dexie still confined to db.ts (mutation contract)
grep -q "from 'dexie'" "$APP/src/db.ts" || fail "db.ts no longer imports Dexie (guard would pass vacuously)"
offenders=$(grep -REl "from ['\"]dexie['\"]" "$APP/src" --include='*.ts' --include='*.tsx' | grep -v "^$APP/src/db\.ts$" || true)
[ -z "$offenders" ] || fail "Dexie imported outside app/src/db.ts: $offenders"
ok "Dexie confined to db.ts"

# NT8: skeleton creation is one transactional mutation-layer call, and the
# approved card routes through it (apply.ts never touches Dexie itself)
awk '/^export async function createDecisionSkeleton/,/^}/' "$APP/src/mutations.ts" | grep -q 'db.transaction' \
  || fail "createDecisionSkeleton is not transactional"
grep -q 'createDecisionSkeleton' "$APP/src/ai/apply.ts" || fail "apply.ts does not route through the skeleton mutation"
grep -q "from '../mutations'" "$APP/src/ai/apply.ts" || fail "apply.ts bypasses the mutation layer"
ok "skeleton creation transactional and wired through the mutation layer"

# NT9: recorder + sheet wiring present (each guard would pass vacuously
# otherwise, so the wiring itself is asserted)
grep -q 'MediaRecorder' "$APP/src/ui/RambleSheet.tsx" || fail "ramble sheet lacks MediaRecorder capture"
grep -q 'isTypeSupported' "$APP/src/ui/RambleSheet.tsx" || fail "ramble sheet lacks mimeType probing (Safari AAC/mp4)"
grep -q 'getUserMedia' "$APP/src/ui/RambleSheet.tsx" || fail "ramble sheet lacks getUserMedia"
grep -qi 'https' "$APP/src/ui/RambleSheet.tsx" || fail "ramble sheet lacks the insecure-context message"
grep -q 'supportsStt' "$APP/src/ui/Home.tsx" || fail "home lacks the greyed-mic guard"
grep -q 'RambleSheet' "$APP/src/ui/Home.tsx" || fail "home lacks the ramble entry point"
ok "recorder + sheet wiring (mimeType probe, insecure message, greyed mic) present"

# NT10: checklist covers the Phase-7 lifecycle
CL="$APP/MANUAL-CHECKLIST.md"
[ -f "$CL" ] || fail "manual checklist missing"
items=$(grep -c '^- \[' "$CL" || true)
[ "$items" -ge 35 ] || fail "checklist too thin ($items items)"
for kw in Ramble transcript HTTPS iPhone standalone Reject Anthropic permission greyed; do
  grep -qi "$kw" "$CL" || fail "checklist missing Phase-7 step: $kw"
done
ok "manual checklist covers the Phase-7 lifecycle ($items items)"

# NT11: doctor green
bash checks/doctor.sh >/dev/null || fail "doctor failed"
ok "doctor exits 0"

printf 'gate-phase7: %d/%d ok\n' "$pass" "$pass"
