#!/usr/bin/env bash
# Phase-10 verify gate (PLAN.md): tsc and build clean; vitest green incl.
# the TTS and history tests; spoken replies wired (engine selection with
# the on-device fallback, toggle persisted, speak-on-reply, stop-on-close);
# approval-card outcomes join the forwarded turn history; checklist carries
# the voice-reply criteria; doctor green.
#
# Run: bash checks/gate-phase10.sh   (requires a clean tree)
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
grep -q 'scoring.test.ts' "$VITEST_OUT" || fail "scoring suite did not run"
grep -q 'mutations.test.ts' "$VITEST_OUT" || fail "mutation suite did not run"
grep -q 'tts.test.ts' "$VITEST_OUT" || fail "tts suite did not run"
grep -q 'providers.test.ts' "$VITEST_OUT" || fail "provider suite did not run"
ok "vitest green incl. tts and provider suites"

T="$APP/src/ai/tts.ts"
C="$APP/src/ui/ChatSheet.tsx"

# NT4: TTS engine — OpenAI endpoint, on-device fallback, code stripped
grep -q '/audio/speech' "$T" || fail "OpenAI TTS endpoint missing"
grep -q 'tts-1' "$T" || fail "tts model missing"
grep -q 'speechSynthesis' "$T" || fail "on-device fallback missing"
grep -q 'cleanForSpeech' "$T" || fail "speech-text cleaning missing"
ok "TTS engine with on-device fallback"

# NT5: chat wiring — toggle persisted, speak-on-reply, stop-on-close
grep -q 'voiceReplies' "$APP/src/ai/settings.ts" || fail "voiceReplies setting missing"
grep -q 'voiceReplies: true' "$APP/src/ai/settings.ts" || fail "voice replies not on by default"
grep -q 'saveSettings' "$C" || fail "voice toggle is not persisted"
grep -q 'speak(spokenText' "$C" || fail "replies are not spoken"
grep -q "state !== 'full') stopSpeaking()" "$C" || fail "speech does not stop when the sheet drops"
grep -q 'Voice {voice' "$C" || fail "voice toggle missing from the chat header"
ok "voice toggle + speak-on-reply + stop-on-close wired"

# NT6: conversational context — prior turns forwarded, card outcomes included
grep -q '\.\.\.history' "$C" || fail "prior turns no longer forwarded"
grep -q "resolved: 'applied'" "$C" || fail "applied cards not marked"
grep -q "resolved: 'rejected'" "$C" || fail "rejected cards not marked"
grep -q 'The user \${e.resolved} them' "$C" || fail "card outcomes not narrated into history"
grep -q 'forwards prior turns untouched' "$APP/src/ai/providers.test.ts" \
  || fail "multi-turn forwarding not regression-pinned"
ok "turn history with card outcomes, pinned"

# NT7: checklist carries the voice-reply criteria
CL="$APP/MANUAL-CHECKLIST.md"
[ -f "$CL" ] || fail "manual checklist missing"
items=$(grep -c '^- \[' "$CL" || true)
[ "$items" -ge 72 ] || fail "checklist too thin ($items items)"
for kw in voice speech context applied rejected ephemeral; do
  grep -qi "$kw" "$CL" || fail "checklist missing voice-reply criterion: $kw"
done
ok "manual checklist carries the voice-reply criteria ($items items)"

# NT8: doctor green
bash checks/doctor.sh >/dev/null || fail "doctor failed"
ok "doctor exits 0"

printf 'gate-phase10: %d/%d ok\n' "$pass" "$pass"
