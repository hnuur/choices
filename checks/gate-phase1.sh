#!/bin/bash
# Phase 1 verify gate: negative tests against the enforcement hooks.
# Self-asserting: every test proves something was staged and that the
# rejection came from the expected guard, so a broken test can never pass
# vacuously. Safe to re-run: requires a clean tree, restores all state.
set -u
cd "$(dirname "$0")/.." || exit 1

if [ -n "$(git status --porcelain)" ]; then
  echo "gate-phase1: working tree not clean; refusing to run." >&2
  exit 2
fi

# Fresh clones lack the gitignored secrets/ dir; recreate it.
mkdir -p secrets

pass=0; failn=0
tmp="$(mktemp -d)"
start_head="$(git rev-parse HEAD)"
cleanup() {
  # If interrupted mid-NT9, a temporary close may be stranded; hard-restore.
  if [ "$(git rev-parse HEAD)" != "$start_head" ]; then
    git reset -q --hard "$start_head"
  fi
  git reset -q 2>/dev/null
  [ -f "$tmp/PLAN.md" ] && cp "$tmp/PLAN.md" PLAN.md
  [ -f "$tmp/learned-rules.md" ] && cp "$tmp/learned-rules.md" learned-rules.md
  rm -rf "$tmp" "secrets/gate-probe.txt" "secrets/gate-sé.txt"
  git reset -q 2>/dev/null
}
trap cleanup EXIT
cp PLAN.md "$tmp/PLAN.md"
cp learned-rules.md "$tmp/learned-rules.md"

expect_reject() { # <label> <commit message> <expected rejection pattern>
  local label="$1" message="$2" pattern="$3" out
  if [ -z "$(git diff --cached --name-only)" ]; then
    echo "GATE-FAIL (nothing staged; test setup broken): $label"
    failn=$((failn + 1)); git reset -q; return
  fi
  if out=$(git commit -m "$message" 2>&1); then
    echo "GATE-FAIL (commit ACCEPTED): $label"
    failn=$((failn + 1)); git reset -q HEAD~1
  elif ! printf '%s' "$out" | grep -q "$pattern"; then
    echo "GATE-FAIL (rejected for the WRONG reason): $label"
    printf '%s\n' "$out" | sed 's/^/    /'
    failn=$((failn + 1))
  else
    echo "ok   rejected by expected guard: $label"
    pass=$((pass + 1))
  fi
  git reset -q
}
restore_plan() { cp "$tmp/PLAN.md" PLAN.md; }
restore_rules() { cp "$tmp/learned-rules.md" learned-rules.md; }
tick()   { perl -0pi -e "s/- \[ \] \*\*Phase $1\b/- [x] **Phase $1/" PLAN.md; }
tick_X() { perl -0pi -e "s/- \[ \] \*\*Phase $1\b/- [X] **Phase $1/" PLAN.md; }
untick() { perl -0pi -e "s/- \[[xX]\] \*\*Phase $1\b/- [ ] **Phase $1/" PLAN.md; }

# First two unticked phases (battery stays valid after earlier phases close).
P1=$(grep -E '^- \[ \] \*\*Phase [0-9]+' PLAN.md | head -1 | grep -Eo '[0-9]+' | head -1)
P2=$(grep -E '^- \[ \] \*\*Phase [0-9]+' PLAN.md | sed -n 2p | grep -Eo '[0-9]+' | head -1)
if [ -z "$P1" ]; then
  echo "gate-phase1: no unticked phases left; flip tests not applicable." >&2
  exit 2
fi

# NT1: secrets file force-added (ASCII path)
echo x > secrets/gate-probe.txt
git add -f secrets/gate-probe.txt
expect_reject "secrets/ staged via add -f (ASCII)" "gate: secrets commit" "never committed"
rm -f secrets/gate-probe.txt

# NT2: secrets file force-added (non-ASCII path; git quotes these in porcelain output)
echo x > "secrets/gate-sé.txt"
git add -f "secrets/gate-sé.txt"
expect_reject "secrets/ staged via add -f (non-ASCII)" "gate: secrets commit unicode" "never committed"
rm -f "secrets/gate-sé.txt"

# NT3: learned-rules.md over cap, WITHOUT trailing newline (off-by-one trap)
for i in $(seq 1 20); do echo "- rule $i" >> learned-rules.md; done
printf -- "- rule 21 no newline" >> learned-rules.md
git add learned-rules.md
expect_reject "learned-rules.md 21 lines (unterminated last line)" "gate: rules cap" "hard cap is 20"
restore_rules

if [ -n "$P2" ]; then
  # NT4: double checkbox flip
  tick "$P1"; tick "$P2"
  git add PLAN.md
  expect_reject "two checkbox flips in one commit" "gate Phase-$P1 review: x" "exactly one phase closes"
  restore_plan

  # NT5: out-of-order flip (later phase before earlier)
  tick "$P2"
  git add PLAN.md
  expect_reject "out-of-order flip (Phase $P2 before $P1)" "gate Phase-$P2 review: x" "phases close in order"
  restore_plan

  # NT6: flip paired with deletion of another checkbox line
  tick "$P1"
  perl -ni -e "print unless /^- \[ \] \*\*Phase $P2\b/" PLAN.md
  git add PLAN.md
  expect_reject "flip + checkbox-line deletion in one commit" "gate Phase-$P1 review: x" "separate commits"
  restore_plan
else
  echo "note: only one unticked phase left; NT4-NT6 multi-phase tests skipped."
fi

# NT7: uppercase [X] tick without ritual message (uppercase must count as a flip)
tick_X "$P1"
git add PLAN.md
expect_reject "uppercase [X] flip without Phase-N/review:" "gate: sneaky uppercase close" "Phase-N"
restore_plan

# NT8: valid single flip but message lacks Phase-N/review:
tick "$P1"
git add PLAN.md
expect_reject "phase close without ritual message" "gate: no ritual" "Phase-N"
restore_plan

# NT9: untick of a ticked checkbox. If no phase has closed yet, create a
# temporary legitimate close, test the untick against it, then drop it.
ticked=$(grep -E '^- \[[xX]\] \*\*Phase [0-9]+' PLAN.md | head -1 | grep -Eo '[0-9]+' | head -1 || true)
tempclose=0
if [ -z "$ticked" ]; then
  tick "$P1"
  git add PLAN.md
  if git commit -q -m "gate: temporary Phase-$P1 close for untick test review: gate-temp" >/dev/null 2>&1; then
    tempclose=1; ticked="$P1"
  else
    echo "GATE-FAIL (setup: temporary close rejected): untick test"; failn=$((failn + 1))
    git reset -q; restore_plan
  fi
fi
if [ -n "$ticked" ]; then
  untick "$ticked"
  git add PLAN.md
  expect_reject "untick of ticked Phase $ticked" "gate: untick" "not rewritten"
  if [ "$tempclose" -eq 1 ]; then
    git reset -q --hard HEAD~1
  else
    restore_plan
  fi
fi

# NT10/NT11: frozen-improver marker tests. PORT KNOB: no improver layer is
# designated in choices yet; when one lands, point FROZEN_TEST_FILE at a real
# frozen file and wire checks/hooks/commit-msg frozen_re in the SAME commit
# (rule 6). Until then the tests are skipped, loudly.
FROZEN_TEST_FILE=""
if [ -n "$FROZEN_TEST_FILE" ]; then
  # NT10: improver edit without marker
  printf '\n' >> "$FROZEN_TEST_FILE"
  git add "$FROZEN_TEST_FILE"
  expect_reject "improver edit without improver-edit: marker" "gate: sneaky improver edit" "improver-edit"
  git checkout -q -- "$FROZEN_TEST_FILE"

  # NT11: improver marker only on a comment line (stripped from the real message)
  printf '\n' >> "$FROZEN_TEST_FILE"
  git add "$FROZEN_TEST_FILE"
  expect_reject "improver-edit: marker on stripped # comment line" "gate: sneaky improver edit
# improver-edit: hidden in comment" "improver-edit"
  git checkout -q -- "$FROZEN_TEST_FILE"
else
  echo "note: no frozen improver designated; NT10-NT11 skipped (wire with rule 6 when one lands)."
fi

# NT12: git status stays clean with a populated secrets/ (file existence
# asserted so a failed setup cannot pass vacuously)
echo data > secrets/gate-probe.txt
if [ -f secrets/gate-probe.txt ] && [ -z "$(git status --porcelain)" ]; then
  echo "ok   clean status with populated secrets/"; pass=$((pass + 1))
else
  echo "GATE-FAIL: status dirty with secrets content"; failn=$((failn + 1))
fi
rm -f secrets/gate-probe.txt

# NT13: doctor must be green (part of this gate per PLAN.md verify text)
if ./checks/doctor.sh >/dev/null 2>&1; then
  echo "ok   doctor exits 0"; pass=$((pass + 1))
else
  echo "GATE-FAIL: doctor is red"; ./checks/doctor.sh 2>&1 | sed 's/^/    /'; failn=$((failn + 1))
fi

echo
echo "gate-phase1: $pass ok, $failn failed"
[ "$failn" -eq 0 ] || exit 1
exit 0
