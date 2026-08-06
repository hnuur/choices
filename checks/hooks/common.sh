#!/bin/bash
# Shared helpers for choices enforcement hooks. See PLAN.md "Deterministic enforcement".

# Staged paths, NUL-delimited at the git layer so quoted/non-ASCII names
# cannot evade prefix anchors. Paths containing newlines split into extra
# lines, which can only over-match (fail closed).
staged_files() {
  git diff --cached --name-only -z | tr '\0' '\n'
}

# Print "N state" pairs for PLAN.md phase checkboxes from stdin.
# [x] and [X] both count as ticked (state "x"); unticked is "o".
plan_boxes() {
  grep -E '^- \[[ xX]\] \*\*Phase [0-9]+' \
    | sed -E 's/^- \[X\]/- [x]/; s/^- \[ \]/- [o]/' \
    | sed -E 's/^- \[(.)\] \*\*Phase ([0-9]+).*/\2 \1/'
}

# Emit phase numbers newly ticked in the staged PLAN.md relative to HEAD.
# Also emits "UNTICK N" for x -> o transitions and "DELETED N" for checkbox
# lines that exist in HEAD but not in the staged copy.
plan_flips() {
  local old new
  if git rev-parse -q --verify HEAD >/dev/null 2>&1; then
    old="$(git show HEAD:PLAN.md 2>/dev/null | plan_boxes)"
  else
    old=""
  fi
  new="$(git show :PLAN.md 2>/dev/null | plan_boxes)"
  awk '
    NR == FNR { if (NF == 2) old[$1] = $2; next }
    NF == 2 {
      seen[$1] = 1
      if ($2 == "x" && old[$1] != "x") print $1
      if ($2 == "o" && old[$1] == "x") print "UNTICK " $1
    }
    END { for (n in old) if (!(n in seen)) print "DELETED " n }
  ' <(printf '%s\n' "$old") <(printf '%s\n' "$new")
}

# True if PLAN.md is staged in this commit.
plan_staged() {
  staged_files | grep -qx 'PLAN.md'
}

# Line count that includes a final unterminated line.
real_lines() {
  awk 'END { print NR }'
}

fail() {
  printf '%s: %s\n' "$HOOK_NAME" "$1" >&2
  printf '%s: bypassing hooks (--no-verify) is a violation (AGENTS.md).\n' "$HOOK_NAME" >&2
  exit 1
}
