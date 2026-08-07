# PLAN.md — "Choices"

**Status: v2.0 — domain adopted 2026-08-07 (Phase-2 amendment): Choices is a
local-first PWA for choosing between instances of a thing; the v1.1
drift-control scaffold is unchanged and governs this build. This file is the
source of truth.**

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

Choices is a local-first web PWA for choosing between instances of a thing.
The user defines a **type** of thing (e.g. cameras), the **dimensions** to
score it on (e.g. weight, price, sexiness), the **options** (specific
instances, e.g. Sony A7C II, Fuji X-T5), and a **score per option ×
dimension**, with importance weights 1–5 per dimension. The app ranks the
options, names a winner with its margin, and re-ranks live on any edit.

Locked product decisions (adopted 2026-08-07 with the Phase-2 amendment):

- **Web PWA**, not native: `vite-plugin-pwa`, Add to Home Screen.
- **Importance weighting** 1–5 per dimension; totals renormalize weights.
- **Local-first** persistence (Dexie/IndexedDB); accounts only with Phase 7.
- **Full score matrix required** before results — partial scoring silently
  biases rankings; a progress indicator shows instead. Genuinely unknown
  cells are resolved by deleting the dimension or the option (see Deferred).
- **Mobile scoring is option-by-option cards**, not a spreadsheet grid.
- **Objective vs subjective is load-bearing**: objective dimensions carry a
  raw value + unit + direction (higher/lower better); subjective dimensions
  are 1–5 ratings. This split decides what Phase 7 shares (objective facts)
  vs keeps personal (subjective scores), so it exists from day one.

This repository is the project and, by construction, its own control: the
drift-control kit (hooks, doctor, gates, ritual) landed first as Phase 1, so
adherence to this plan is enforced by mechanism rather than memory, in place,
for the life of the build. The kit's conventions — checkbox grammar, rules
header, Deferred section, decision log — are part of the artifact.

## Product spec

Scoring math: objective normalizes across the option set,
`(x − min) / (max − min)`, inverted for lower-better, all-equal → 1;
subjective maps a 1–5 rating via `(r − 1) / 4`; total is
`Σ(importance × score) / Σ(importance)` (weights explicitly renormalized).
Known weakness, accepted for v1 and mitigated in the Results UI: set-relative
min-max exaggerates tiny differences, and rankings depend on which options
are in the set (independence-of-irrelevant-alternatives violation).
Mitigations: raw values shown alongside normalized scores; winner margin
with near-tie flag (≤ 0.02 = "effectively tied"); non-discriminating
dimensions called out; sensitivity probes surface fragile winners.

Data model — Dexie, versioned from day one (`db.version(1)`) so migrations
stay routine; IDs client-generated (uuid) for eventual publish/sync:

```
Decision  { id, name, createdAt, updatedAt }
Dimension { id, decisionId, name, kind: 'objective' | 'subjective',
            direction: 'higher' | 'lower',   // objective only
            importance: 1..5, unit?: string }
Option    { id, decisionId, name, notes? }
Score     { optionId, dimensionId, value }   // row exists ⇒ cell scored
```

- Scores live in their own table: cell-level rows make Phase 6's "LLM
  proposes one score → user approves" trivial and map 1:1 to Phase 7's
  server DB.
- Cascades — deleting a dimension/option deletes its scores; deleting a
  decision deletes everything under it — are enforced in the mutation layer
  inside transactions, never ad hoc in UI.
- **Mutation contract**: all writes go through typed mutation functions
  (createDecision, addDimension, setScore, exportDecision, …) taking
  explicit edit payloads; UI never touches Dexie directly. A Phase 6 LLM
  proposal is the same payload rendered as a confirm/reject card.
- **Backup**: JSON export/import of a whole decision — mutation-layer
  functions in Phase 3, UI in Phase 5. Local-first plus iOS's aggressive
  storage eviction makes this v1 scope, not Deferred.

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
├── .gitignore                   secrets/ never committed; app build output
├── learned-rules.md             always-on guardrails, hard cap 20 lines
├── secrets/                     never committed (gitignored; local only)
├── checks/
│   ├── hooks/                   pre-commit, commit-msg (core.hooksPath)
│   ├── doctor.sh                environment assertions, run at every phase gate
│   └── gate-phaseN.sh           per-phase verify batteries (rule 6)
└── app/                         the product (Phase 3+): Vite/React/TS PWA
```

## Build order

- [x] **Phase 1 — Scaffold & enforcement**: git init; `checks/hooks/`
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
- [ ] **Phase 3 — Engine**: scaffold `app/` (Vite + React + TypeScript +
      Tailwind v4 via `@tailwindcss/vite` + Dexie + `vite-plugin-pwa` +
      Vitest); versioned schema and mutation layer per Product spec
      (transactional cascades, JSON export/import functions); scoring
      engine. `.gitignore` gains app build output and node_modules.
      **Verify**: `checks/gate-phase3.sh` passes — vitest suite green:
      normalization (incl. lower-better inversion, all-equal), weight
      renormalization, winner margin / near-tie flag, cascade integrity,
      export/import round-trip; doctor exits 0.
- [ ] **Phase 4 — UI**: home list of decisions (`updatedAt` desc: name,
      option count, winner preview, last edited; delete requires
      confirmation); decision view with 4 freely jumpable tabs
      (Dimensions / Options / Score / Results); Score tab as option-cards
      (objective cells take raw values + unit, subjective 1–5) with matrix
      progress; live re-ranking on any edit; adding a dimension/option
      mid-flow shows the progress state, never stale rankings. Results:
      ranked totals, per-dimension breakdown bars, raw values for objective
      dims, winner margin with near-tie flag (≤ 0.02), non-discriminating
      callouts. Stretch: sensitivity probes (break-even importance per
      option × dimension — "if price mattered at 4+ instead of 2, the
      winner flips to X"; drop-one-dimension winner flips). **Verify**:
      `checks/gate-phase4.sh` passes — tsc and production build clean;
      documented manual checklist covers the full decision lifecycle
      end-to-end; doctor exits 0.
- [ ] **Phase 5 — PWA & backup**: manifest, maskable + apple-touch icons,
      iOS install hint (Share → Add to Home Screen; iOS never fires an
      install prompt), `apple-mobile-web-app-capable` + status-bar styling,
      `navigator.storage.persist()` on startup (iOS evicts non-persisted
      IndexedDB), precache for full offline; JSON export/import UI.
      **Verify**: `checks/gate-phase5.sh` passes — build clean; checklist:
      offline reload, standalone display, export → wipe → import
      round-trip; doctor exits 0.
- [ ] **Phase 6 — LLM integration**: chat surface attached to each level —
      type ("what dims should I consider for cameras?"), dimension
      (refine/split, e.g. "portability" → weight + size), option (suggest
      options, prefill objective scores, propose anchors), result ("why did
      X win?", "argue me out of this choice"). LLM proposes typed mutation
      payloads; user approves per-edit. **Precondition (rule 2)**:
      provider, auth/key placement (a client-side PWA cannot hold a shared
      key: BYO-key in settings vs a thin proxy; any dev key lives in
      `secrets/`), and proposal rendering (per-edit card vs batched diff)
      are decided by plan amendment before work starts. **Verify**: defined
      in that amendment.
- [ ] **Phase 7 — Shared database**: opt-in per-decision anonymous publish,
      never blanket consent; community templates (type + dimension sets +
      objective facts); subjective scores stay personal; `schemaVersion`
      added before first publish. **Precondition (rule 2)**: server stack,
      identity/pseudonymity model, moderation, stale facts (prices change)
      decided by plan amendment first. **Verify**: defined in that
      amendment.

## Escape hatches

- `git config --unset core.hooksPath` disables enforcement entirely — a
  declared violation: doctor fails loudly afterwards and the audit trail in
  `git log` shows when it happened.
- `git commit --no-verify` bypasses one commit — a violation, caught after the
  fact by the doctor ritual audit and log review (see Known accepted limits).

## Deferred (do not implement; add ideas here, not to code)

- User-set **anchors** (reference min/max per dimension) instead of
  set-relative min-max normalization — the escape hatch for the IIA
  weakness in the Product spec; Phase 6's LLM could propose them.
- "Unknown" cells with weight redistribution — rejected at adoption: it
  reintroduces the silent bias the full-matrix rule locks out. Revisit only
  together with anchors.

## Decision log

| Decision | Choice |
| --- | --- |
| Repo role | This repo IS the Choices project and its own control: the kit is Phase 1 and polices this PLAN.md in place for the life of the build — no separate control repo, no porting step (user decision 2026-08-06, after Phase 1 closed) |
| Kit provenance | Ported 2026-08-06 from `/Users/baplin/random/oc` `checks/` + PLAN.md grammar (verified clause-by-clause before porting) |
| Secret dir | `secrets/` (kit default `journal/` repointed; PORT KNOB in pre-commit + doctor) |
| Rules file | `learned-rules.md`, 20-line hook-enforced cap (carried from kit) |
| Frozen improver | none designated yet; commit-msg guard live-but-inert, wired with rule 6 when one lands |
| Hooks activation | `core.hooksPath` set *before* the seed commit — the seed is policed (the source kit set it after; its PLAN.md/AGENTS.md pre-init anomaly is deliberately not inherited) |
| Domain | Choices: local-first web PWA for choosing between instances of a thing — weighted dimensions, full score matrix, live ranking (adopted 2026-08-07 via Phase-2 amendment) |
| External plan merge | user-supplied `choices-app-plan.md` reviewed, fully merged into this file in the Phase-2 amendment, then deleted — one source of truth (rule 2) |
| Scaffold location | `app/` in this repo — the external plan's `/Users/baplin/qwen/chat` path contradicted the Repo-role decision and was dropped |
| Stack | Vite + React + TS + Tailwind v4 + Dexie + vite-plugin-pwa + Vitest; v1 tests cover scoring math + mutation layer only (no UI tests) |
| Backup | JSON export/import of a decision is v1 scope (functions in Phase 3, UI in Phase 5) — local-first plus iOS's aggressive storage eviction |
| Phase numbering | app milestones renumbered as repo Phases 3–7; ≥2 unticked boxes keep gate NT4–NT6 exercised (supersedes the Phase-2-placeholder device) |
| Drift enforcement | deterministic hooks + doctor + per-phase gates; instructions only where mechanism is impossible |
