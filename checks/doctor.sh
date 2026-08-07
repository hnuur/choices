#!/bin/bash
# choices doctor: environment assertions, run at every phase gate and on demand.
# Exit 0 = healthy. Phases append assertions as they land (PLAN.md build order).
set -u
cd "$(dirname "$0")/.." || exit 1

fails=0
check() { # check <label> <command...>
  local label="$1"; shift
  if "$@" >/dev/null 2>&1; then
    printf 'ok   %s\n' "$label"
  else
    printf 'FAIL %s\n' "$label"
    fails=$((fails + 1))
  fi
}

# Ticked box ([x] or [X]) appearing after an unticked box is out of order.
phase_order_sane() {
  awk '/^- \[ \] \*\*Phase/ { seen = 1 }
       /^- \[[xX]\] \*\*Phase/ { if (seen) exit 1 }' PLAN.md
}

# The most recent phase-closing commit — one with a real unticked->ticked
# transition, not merely an edit touching a ticked line — must carry the
# Phase-N + review: ritual. Retroactively catches --amend rewrites, which
# hooks cannot see at amend time.
. checks/hooks/common.sh   # for plan_boxes

commit_flips() { # commit_flips <sha>: true if <sha> ticked at least one box
  local h="$1" old new
  old="$(git show "$h^:PLAN.md" 2>/dev/null | plan_boxes)"
  new="$(git show "$h:PLAN.md" 2>/dev/null | plan_boxes)"
  awk 'NR == FNR { if (NF == 2) old[$1] = $2; next }
       NF == 2 && $2 == "x" && old[$1] != "x" { found = 1 }
       END { exit found ? 0 : 1 }' \
    <(printf '%s\n' "$old") <(printf '%s\n' "$new")
}

ritual_audit() {
  local h msg
  # -G prefilters to commits whose diff touches ticked-looking lines; each
  # candidate is then checked for a genuine flip.
  for h in $(git log --format=%H -G'^- \[[xX]\] \*\*Phase' -- PLAN.md 2>/dev/null); do
    commit_flips "$h" || continue
    msg=$(git log -1 --format=%B "$h")
    printf '%s' "$msg" | grep -Eq 'Phase-[0-9]+' || return 1
    printf '%s' "$msg" | grep -q 'review:' || return 1
    return 0
  done
  return 0   # no phase has ever closed
}

rules_cap() {
  [ "$(awk 'END { print NR }' learned-rules.md)" -le 20 ]
}

# --- Phase 1: scaffold & enforcement -----------------------------------------
# core.hooksPath is local git config and does not travel with a clone; assert
# it FIRST so a fresh clone fails loudly before anything else is trusted.
check "core.hooksPath = checks/hooks"      sh -c '[ "$(git config core.hooksPath)" = "checks/hooks" ]'
check "pre-commit hook executable"         test -x checks/hooks/pre-commit
check "commit-msg hook executable"         test -x checks/hooks/commit-msg
# PORT KNOB: secrets probe — repoint the prefix/path (or delete the checks)
# when porting the kit; the decision log's Secret-dir row points here.
check "secrets/ is git-ignored"            git check-ignore -q secrets/probe
check "no secrets paths tracked by git"    sh -c '! git ls-files | grep -q "^secrets/"'
check "learned-rules.md within 20 lines"   rules_cap
check "PLAN.md phase order sane"           phase_order_sane
check "last phase-close followed ritual"   ritual_audit

# --- Phase 2 appends here ----------------------------------------------------

echo
if [ "$fails" -gt 0 ]; then
  echo "doctor: $fails failure(s)"
  exit 1
fi
echo "doctor: all checks passed"
exit 0
