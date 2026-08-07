# AGENTS.md

**Read `PLAN.md` before doing any work in this repo.** It is the source of
truth for what this project is, what gets built, and in what order.

## Binding rules (from PLAN.md — summarized, not replaced)

- **Plan-first amendments**: if the plan is wrong, amend `PLAN.md` in its own
  commit with the reason, *then* implement. Never let code silently diverge
  from the plan.
- **Scope quarantine**: new ideas go into PLAN.md's Deferred section, not into
  code.
- **Frozen improver**: artifacts that author or judge other artifacts are
  human-edited only. None are designated yet; when one lands, the commit-msg
  guard and gate tests are wired in the same commit (rule 6).
- **Secrets**: `secrets/` is gitignored and never committed. Never weaken the
  hook that enforces this.
- **Phase gates**: one commit (or small series) per build phase; a phase closes
  only when its verify gate passes; tick its checkbox in PLAN.md in the
  closing commit. **Ticking a phase checkbox ends the session** — commit,
  instruct the user to restart, stop.
- **Hooks are law**: `checks/hooks` is active via `core.hooksPath`. Bypassing
  hooks (`--no-verify`) is a violation. Run `checks/doctor.sh` at every phase
  gate and whenever in doubt.

## Communication style (user directive)

- Keep responses brief: lead with the answer, no preamble, no recap of
  PLAN.md content the user has just read.
- Point at files and line ranges instead of quoting repo content back.
- Detail is for code, commits, and gate output — not chat prose.

## Operational notes

- **Fresh-clone bootstrap**: `git config core.hooksPath checks/hooks`. The
  setting is local git config and does not travel with a clone; doctor asserts
  it first, so a fresh clone fails loudly until this is run.
- **Dependencies**: hooks need bash/grep/sed/awk/tr; gate-phase1 needs perl
  (in-place checkbox edits); gate-phase3 needs node/npm (engine vitest suite);
  doctor is currently pure bash+git (python3 lands with the first JSON-parsing
  check). Fine on macOS/Linux; audit before a container/CI or Windows target.
- **Known accepted limits**: `--no-verify` and history rewrites cannot be
  locally prevented — they are declared violations, caught after the fact by
  doctor's ritual audit and `git log` review (PLAN.md states this too).
- **Knobs** (grep `PORT KNOB`): secret prefix (pre-commit), rules file/cap
  (pre-commit), frozen paths (commit-msg `frozen_re` + gate NT10/NT11). Edit
  or delete guards as the domain dictates — doctor's Phase-1 check list must
  be re-derived from whichever guards remain.

## Escape hatches

- `git config --unset core.hooksPath` disables enforcement — a declared
  violation; doctor then fails loudly.
