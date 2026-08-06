# PLAN.md — "choices"

**Status: v1 — drift-control scaffold ported 2026-08-06 from the `oc` kit
(`/Users/baplin/random/oc`). This file is the source of truth.**

## Rules for working in this repo

1. Read this file before doing any work.
2. **Plan-first amendments**: if implementation reveals this plan is wrong, amend
   this file in its own commit *with the reason*, then implement. Silent
   divergence between plan and code is the only forbidden state.
3. **Scope quarantine**: ideas that surface mid-build go into the Deferred
   section, never into code.
4. One commit (or small series) per build phase, message referencing the phase.
   A phase is closed only when its verify gate passes; tick its checkbox in the
   closing commit, following the Phase-close ritual below.
5. After large phases and at the end, run a review pass diffing the
   implementation against this plan clause by clause — governance rules
   especially.
6. Enforcement artifacts are created in the same commit/phase as the artifacts
   they enforce, never later. (A rule that isn't yet wired into anything is
   drift waiting to happen.)

---

## Goal

The domain of this project is not yet defined; Phase 2 closes exactly that.
Until then the plan governs its own scaffold: a drift-control kit (hooks,
doctor, gates, ritual) enforced by mechanism rather than memory, ready to
carry whatever build order Phase 2 introduces. The kit's own conventions —
checkbox grammar, rules header, Deferred section, decision log — are part of
the artifact.

## Governance rules (non-negotiable)

- **Frozen improver**: artifacts that author or judge other artifacts are
  human-edited only, versioned in git; automation may NEVER propose changes to
  them. *None are designated yet.* When one is created, its paths are wired
  into `checks/hooks/commit-msg` (`frozen_re`) and gate-phase1 NT10/NT11 in
  the same commit (rule 6).
- **Rules need more evidence**: `learned-rules.md` entries are always-on
  context (a permanent tax) and the least-tested, highest-blast-radius
  artifact: each requires ≥2 independent incidents and explicit human approval
  recorded in the commit; the file stays under the hook-enforced 20-line cap.
- **Secrets never in git**: `secrets/` is gitignored from day one, and the
  pre-commit hook rejects staged `secrets/` paths — belt to gitignore's
  suspenders, since gitignore does not stop `git add -f`.

## Deterministic enforcement (`checks/`)

Instructions decay as context grows; these do not. Versioned in `checks/`,
activated via `git config core.hooksPath checks/hooks` (doctor asserts the
config is set — a fresh clone without it fails the gate).

- `checks/hooks/pre-commit` rejects, deterministically:
  - any staged path under `secrets/` (staged paths are read NUL-delimited so
    quoted/non-ASCII names cannot evade the anchor)
  - staged `learned-rules.md` exceeding 20 lines (counting a final
    unterminated line)
  - more than one PLAN.md phase-checkbox flip in a single commit (`[x]` and
    `[X]` both count as ticked)
  - out-of-order flips (ticking Phase N requires Phase N−1 already ticked)
  - unticking a previously ticked checkbox
  - deleting phase-checkbox lines in the same commit as a flip (restructuring
    the plan and closing a phase are separate commits)
  - additionally, when a flip is staged, pre-commit runs `checks/doctor.sh`
    and rejects on failure — ritual step 1 is a mechanism, not a memory
- `checks/hooks/commit-msg` rejects:
  - commits touching a designated frozen improver without an explicit
    `improver-edit:` marker in the message (a hook cannot distinguish human
    from agent hands, but it converts silent drift into a conscious, greppable
    act). The guard is live but no paths are designated yet; it activates the
    commit `frozen_re` is set (rule 6).
  - checkbox-flipping commits lacking a `Phase-N` reference and a `review:`
    verdict line (message checked after comment-stripping, so a marker on a
    stripped `#` line does not count)
- `checks/doctor.sh`: environment assertions run at every phase gate and on
  demand (hooksPath active, hooks executable, secrets ignored and untracked,
  rules cap, phase order; later phases append). Also audits history: the most
  recent phase-closing commit must carry the `Phase-N` + `review:` ritual —
  this retroactively catches `--amend` rewrites, which hooks cannot see at
  amend time. Verify gates are phrased as negative tests wherever possible.
- Each phase's negative-test battery is committed as `checks/gate-phaseN.sh`,
  so a fresh clone can re-run its own gates (rule 6 applies to tests too).
- Bypassing hooks (`--no-verify`) is a violation.
- Known accepted limits: `--no-verify` and history rewrites cannot be locally
  prevented, only declared violations and detected after the fact (doctor
  ritual audit, `git log` review). Checkbox-line deletion in a non-flip commit
  is legal (plan restructuring under the amendment rule); ordering is
  therefore guaranteed among the boxes present, not against deleted history —
  a deletion followed later by a close can skip a phase number, and only
  `git log` review catches it.

### Phase-close ritual

1. Run the phase's verify gate: `checks/doctor.sh` exits 0 + the phase's
   negative tests.
2. Run a fresh-context review pass against this plan.
3. Tick exactly that phase's checkbox in PLAN.md (editing forces a re-read of
   the plan at the moment of highest drift risk).
4. Closing commit: message carries `Phase-N` and a `review:` verdict line.
5. The session ends — instruct the user to restart before the next phase, so
   AGENTS.md/PLAN.md re-enter context at full salience.

## Layout

```
choices/                         git repo
├── PLAN.md                      this file
├── AGENTS.md                    points here first; summarized binding rules
├── .gitignore                   secrets/ never committed
├── learned-rules.md             always-on guardrails, hard cap 20 lines
├── secrets/                     never committed (gitignored; local only)
└── checks/
    ├── hooks/                   pre-commit, commit-msg (core.hooksPath)
    ├── doctor.sh                environment assertions, run at every phase gate
    └── gate-phaseN.sh           per-phase verify batteries (rule 6)
```

## Build order

- [ ] **Phase 1 — Scaffold & enforcement**: git init; `checks/hooks/`
      (pre-commit, commit-msg) + `checks/doctor.sh`, activated via
      `core.hooksPath` *before* the seed commit (so the seed itself is
      policed); `.gitignore` (secrets/); empty `learned-rules.md`; AGENTS.md.
      **Verify (negative tests)**: `checks/gate-phase1.sh` passes — secrets
      `add -f` (ASCII and non-ASCII paths) rejected; rules cap (incl.
      unterminated final line) rejected; double, out-of-order, uppercase-`[X]`,
      deletion-paired flips and unticks rejected; ritual-less phase close
      rejected; frozen-improver marker tests run once paths are designated
      (skipped loudly until then); `git status` clean with populated
      `secrets/`; doctor invoked by the gate and exits 0. The gate must assert
      its own setup (something actually staged, rejection message matches the
      expected guard) so a broken test can never pass vacuously, and must run
      correctly in a fresh clone (secrets/ dir recreated).
- [ ] **Phase 2 — Domain & build order**: define this project's goal,
      component specs, and phases 3+ via a plan-first amendment (rule 2).
      Designate frozen improvers, if any, wiring `frozen_re` + NT10/NT11 in
      the same commit (rule 6); repoint or drop the secrets/rules knobs as the
      domain dictates. **Verify**: PLAN.md carries a concrete Goal and at
      least one further phase; `checks/gate-phase1.sh` still passes (the
      battery survives plan amendments); doctor exits 0.

## Escape hatches

- `git config --unset core.hooksPath` disables enforcement entirely — a
  declared violation: doctor fails loudly afterwards and the audit trail in
  `git log` shows when it happened.
- `git commit --no-verify` bypasses one commit — a violation, caught after the
  fact by the doctor ritual audit and log review (see Known accepted limits).

## Deferred (do not implement; add ideas here, not to code)

- (empty — ideas that surface mid-build land here, never in code)

## Decision log

| Decision | Choice |
| --- | --- |
| Kit provenance | Ported 2026-08-06 from `/Users/baplin/random/oc` `checks/` + PLAN.md grammar (verified clause-by-clause before porting) |
| Secret dir | `secrets/` (kit default `journal/` repointed; PORT KNOB in pre-commit + doctor) |
| Rules file | `learned-rules.md`, 20-line hook-enforced cap (carried from kit) |
| Frozen improver | none designated yet; commit-msg guard live-but-inert, wired with rule 6 when one lands |
| Hooks activation | `core.hooksPath` set *before* the seed commit — the seed is policed (the source kit set it after; its PLAN.md/AGENTS.md pre-init anomaly is deliberately not inherited) |
| Phase 2 placeholder | real next step (scope is undefined) AND keeps two unticked phases so gate NT4–NT6 stay exercised |
| Drift enforcement | deterministic hooks + doctor + per-phase gates; instructions only where mechanism is impossible |
