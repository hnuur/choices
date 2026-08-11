#!/usr/bin/env bash
# Phase-11 verify gate (PLAN.md): tsc and build clean; vitest green; the
# ramble sheet shares the chat's persisted voice toggle, speaks its prose
# replies on the same engine ladder, never reads the skeleton card, and
# stops speech on close; checklist carries the parity items; doctor green.
#
# Run: bash checks/gate-phase11.sh   (requires a clean tree)
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

# NT3: regression suite green, and the voice suites actually ran
VITEST_OUT=$(mktemp)
trap 'rm -f "$VITEST_OUT"' EXIT
(cd "$APP" && npx vitest run) >"$VITEST_OUT" 2>&1 || { cat "$VITEST_OUT" >&2; fail "vitest suite not green"; }
grep -q 'scoring.test.ts' "$VITEST_OUT" || fail "scoring suite did not run"
grep -q 'mutations.test.ts' "$VITEST_OUT" || fail "mutation suite did not run"
grep -q 'tts.test.ts' "$VITEST_OUT" || fail "tts suite did not run"
ok "vitest green incl. the tts suite"

R="$APP/src/ui/RambleSheet.tsx"
C="$APP/src/ui/ChatSheet.tsx"

# NT4: ramble sheet voice wiring — shared toggle, speak-on-reply, stop-on-close
grep -q 'loadSettings().voiceReplies' "$R" || fail "ramble sheet does not read the shared voice setting"
grep -q 'loadSettings().voiceReplies' "$C" || fail "chat sheet no longer reads the shared voice setting"
grep -q 'saveSettings' "$R" || fail "ramble voice toggle is not persisted"
grep -q 'speak(spokenText' "$R" || fail "ramble replies are not spoken"
grep -q 'stopSpeaking()' "$R" || fail "ramble sheet does not stop speech on close"
grep -q 'Voice {voice' "$R" || fail "voice toggle missing from the ramble header"
ok "ramble sheet shares the voice toggle and speaks prose replies"

# NT5: the skeleton card is never read aloud (spoken text is prose-only)
grep -q 'parsed.message || reply.trim()' "$R" || fail "prose-only spoken text missing"
grep -q 'speak(spokenText' "$R" || fail "spoken gate missing"
ok "prose-only speaking on the ramble sheet"

# NT6: checklist carries the parity items
CL="$APP/MANUAL-CHECKLIST.md"
[ -f "$CL" ] || fail "manual checklist missing"
items=$(grep -c '^- \[' "$CL" || true)
[ "$items" -ge 80 ] || fail "checklist too thin ($items items)"
for kw in ramble voice skeleton; do
  grep -qi "$kw" "$CL" || fail "checklist missing parity criterion: $kw"
done
ok "manual checklist carries the parity items ($items items)"

# NT7: doctor green
bash checks/doctor.sh >/dev/null || fail "doctor failed"
ok "doctor exits 0"

printf 'gate-phase11: %d/%d ok\n' "$pass" "$pass"
