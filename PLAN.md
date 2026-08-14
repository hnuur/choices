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
  proposal is the same payload rendered as rows in an editable approval
  card.
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
├── app/                         the product (Phase 3+): Vite/React/TS PWA
└── relay/                       optional thin AI proxy (Phase 6): zero-dep
                                 Node (node:http, ESM) server speaking the
                                 OpenAI-compatible API; client-generated opaque
                                 bearer token, in-memory per-token UTC-day free
                                 quota; upstream endpoint + operator key via
                                 env; node:test suite; deploy target is the
                                 operator's choice, not part of the PWA build
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
- [x] **Phase 2 — Domain & build order**: define this project's goal,
      component specs, and phases 3+ via a plan-first amendment (rule 2).
      Designate frozen improvers, if any, wiring `frozen_re` + NT10/NT11 in
      the same commit (rule 6); repoint or drop the secrets/rules knobs as the
      domain dictates. **Verify**: PLAN.md carries a concrete Goal and at
      least one further phase; `checks/gate-phase1.sh` still passes (the
      battery survives plan amendments); doctor exits 0.
- [x] **Phase 3 — Engine**: scaffold `app/` (Vite + React + TypeScript +
      Tailwind v4 via `@tailwindcss/vite` + Dexie + `vite-plugin-pwa` +
      Vitest); versioned schema and mutation layer per Product spec
      (transactional cascades, JSON export/import functions); scoring
      engine. `.gitignore` gains app build output and node_modules.
      **Verify**: `checks/gate-phase3.sh` passes — vitest suite green:
      normalization (incl. lower-better inversion, all-equal), weight
      renormalization, winner margin / near-tie flag, cascade integrity,
      export/import round-trip; doctor exits 0.
- [x] **Phase 4 — UI**: home list of decisions (`updatedAt` desc: name,
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
- [x] **Phase 5 — PWA & backup**: manifest, maskable + apple-touch icons,
      iOS install hint (Share → Add to Home Screen; iOS never fires an
      install prompt), `apple-mobile-web-app-capable` + status-bar styling,
      `navigator.storage.persist()` on startup (iOS evicts non-persisted
      IndexedDB), precache for full offline; JSON export/import UI.
      **Verify**: `checks/gate-phase5.sh` passes — build clean; checklist:
      offline reload, standalone display, export → wipe → import
      round-trip; doctor exits 0.
- [x] **Phase 6 — LLM integration**: chat surface attached to each level —
      type ("what dims should I consider for cameras?"), dimension
      (refine/split, e.g. "portability" → weight + size), option (suggest
      options, prefill objective scores — objective cells only, subjective
      ratings stay human-owned; scale guidance is prose while anchors are
      Deferred), result ("why did X win?", "argue me out of this choice").
      LLM proposes typed mutation payloads; each proposal renders as an
      approval card of editable rows —
      the user may edit, remove, or add rows before approving; approve
      applies exactly what is on the card at that moment, reject applies
      nothing (batched diff is Deferred). Chat transcripts are ephemeral
      (in-memory only; the decision is the durable artifact, no Dexie
      schema). **Mobile-first surface** (2026-08-11): one "Ask AI" entry
      point in the decision view at the tab bar; chat opens as a
      full-screen bottom sheet with a drag handle (half-sheet rejected —
      no room for editable cards + keyboard); context is the active tab,
      shown as a tappable chip in the sheet header; after approve the card
      collapses to a result row and the sheet auto-drops to peek height
      briefly so the updated tab is visible. Rows have ≥44pt touch
      targets, approve/reject are full-width buttons, the input bar is
      pinned to the visual viewport with safe-area padding. Locked by the
      2026-08-10 amendment (rule 2):
      provider is user-selectable — presets Anthropic / OpenAI / Gemini
      plus a custom OpenAI-compatible endpoint (base URL + model + key),
      which also covers proxies and local servers; keys are BYO, stored
      on-device only, requests go device → provider directly; optional
      **relay** in `relay/` for zero-setup use — a thin operator-key proxy
      with an opaque per-device token and a daily free quota, opt-in, and
      disclosed in the AI settings with one line per mode (who pays, where
      data flows) — settings is the disclosure surface; the chat screen
      carries none; dev keys live in `secrets/`, never bundled.
      **Verify**: `checks/gate-phase6.sh` passes — tsc and build clean;
      vitest green incl. the proposal parser (only well-formed typed
      mutation payloads accepted; malformed/unknown rejected), Dexie writes
      still confined to the mutation layer, provider clients tested against
      recorded responses, relay quota enforced; checklist: key-validation
      round-trip per preset, custom endpoint, relay quota-exhausted message,
      approve applies exactly the card's contents (as proposed or
      user-edited), reject changes nothing, malformed proposal errors
      visibly, chat sheet lifecycle (open, context chip follows/switches
      tab, approve → peek, dismiss); doctor exits 0.
- [x] **Phase 7 — Voice ramble input** (promoted from Deferred, amendment
      2026-08-11): a home-screen mic button records a voice ramble —
      MediaRecorder with supported-mimeType detection (Safari records
      AAC/mp4) and a recording UI; STT transcribes it — Whisper
      (`/audio/transcriptions`) on the openai/custom presets, Gemini
      inline audio on gemini; anthropic and relay have no STT path, so
      the mic is greyed out there (the relay stays text-only: its body
      cap and free quota are chat-sized). The transcript goes to the LLM
      with a "build a decision from this ramble" ask. Global scope: the
      parser gains a createDecision payload (decision name, dimensions,
      options) and the Phase-6 editable approval card is the review
      surface — approve creates the whole skeleton in one transactional
      mutation-layer call and opens it, reject creates nothing; a ramble
      with no decision in it gets a prose reply and writes nothing.
      Ramble transcripts are ephemeral like chat. `getUserMedia` is
      secure-contexts-only, so over plain HTTP the mic is unavailable and
      the UI says so instead of failing silently (same bug class as the
      `uid()` fallback); real-phone round-trips run over HTTPS per the
      checklist. **Verify**: `checks/gate-phase7.sh` passes — tsc and
      build clean; vitest green incl. the STT client tested hermetically
      against recorded responses and the parser rejection suite covering
      createDecision; Dexie still confined to db.ts; skeleton creation
      transactional inside the mutation layer; checklist: ramble →
      approve round-trip per STT provider, greyed mic on anthropic/relay,
      insecure-context message, real-iPhone ramble round-trip, reject and
      no-decision-in-ramble paths write nothing; doctor exits 0.
- [x] **Phase 8 — UI redesign (dark)**: replace the utilitarian Phase-4
      skin with the dark design language the user directed on
      2026-08-11 ("far sexier"; results-screen spec + mock supplied
      2026-08-11, whole app in the same pass): app background #08090b
      with an optional radial top glow; surfaces #12151a / #101317 /
      menu #171b21; hairline borders rgba(255,255,255,.06) do the
      separating, not shadows; no pure white/black; cyan accent #5ad0f0
      (text on accent #04161d). Inter Tight for UI (title
      34px/700/−1.2px) and JetBrains Mono for all metadata
      (uppercase, letter-spaced), both self-hosted so the PWA stays
      fully offline. Decision view: back link + title row with a •••
      menu (export backup, edit dimensions, mono backup-saved footer)
      replacing the inline export row; underline tab row replaces the
      segmented pill; Ask AI moves from a header pill to a full-width
      gradient button in a fixed bottom bar carrying the AI status line
      (the bar doubles as the post-approve peek surface). Results:
      single-line cyan winner banner; rank 1 expanded with
      per-dimension bars normalized against the dimension's best value,
      weight encoded as bar thickness (1+weight px) and fill opacity
      (0.5+weight×0.1) plus a mono legend; ranks 2+ as compact one-line
      rows. Home, the three edit tabs, chat sheet, approval/skeleton
      cards, ramble sheet and AI settings restyled to the same tokens;
      tap targets stay ≥44px. **Verify**: `checks/gate-phase8.sh`
      passes — tsc and build clean; vitest green; checklist carries the
      dark-theme visual criteria (tokens, ••• menu, underline tabs,
      winner banner, bar normalization + weight encoding, bottom bar,
      self-hosted fonts offline); doctor exits 0.
- [x] **Phase 9 — Home redesign (landing)**: the home screen becomes the
      designed landing the user mocked on 2026-08-11: composer as one
      rounded unit — input and Create inside a single field, Create a
      cyan gradient pill — with tappable starter prompts below that seed
      the input; Ramble it / Import backup as equal-width quiet buttons
      that no longer compete with Create; a mono section header
      ("YOUR DECISIONS · N" plus a Recent / A–Z sort) giving the list
      structure; decision rows carrying real state — progress bar,
      mono "N DIM · M OPT", status chip (WINNER in cyan with the leading
      option and its share, SCORING with scored-cell progress, DRAFT
      with the next step), mono uppercase timestamp, and Delete demoted
      to a muted tertiary that only reddens on hover (two-step confirm
      kept); a dashed footer note explains local-only storage instead of
      leaving the screen empty. Tagline becomes "Weigh what matters,
      then decide with the numbers in front of you." **Verify**:
      `checks/gate-phase9.sh` passes — tsc and build clean; vitest
      green; the landing wiring asserted (composer unit, starter seeds,
      equal-width secondaries, row states, muted delete, sort, footer);
      checklist carries the landing criteria; doctor exits 0.
- [x] **Phase 10 — Voice replies & conversational context**: chat replies
      are spoken — OpenAI `/audio/speech` (same BYO key, tts-1) on the
      openai preset, feature-detected `/audio/speech` on custom
      endpoints, and the on-device `speechSynthesis` voice everywhere
      else (zero keys, works offline, covers anthropic/gemini/relay);
      a persisted Voice on/off toggle in the chat header (default on);
      speech stops when the sheet closes; fenced code blocks are
      stripped before speaking. Conversational context: user/assistant
      text turns have been forwarded since Phase 6 — this phase adds
      approval-card outcomes to that history (proposed payload types +
      applied/rejected) so the assistant knows what landed, and pins
      multi-turn forwarding with a provider-client regression test.
      Transcripts stay ephemeral. **Verify**: `checks/gate-phase10.sh`
      passes — tsc and build clean; vitest green incl. the TTS
      engine-selection/fallback tests and the history-forwarding test;
      chat wiring asserted (toggle, speak-on-reply, stop-on-close, card
      outcomes in history); checklist carries the voice-reply criteria;
      doctor exits 0.
- [x] **Phase 11 — Ramble sheet voice parity**: the ramble sheet carries
      the same persisted VOICE ON/OFF setting as the chat sheet (one
      toggle, shared — flipping it in either sheet is reflected in the
      other) and speaks its assistant replies with the same engine
      ladder (OpenAI tts-1 → feature-detected custom → on-device
      speechSynthesis); prose only, never the skeleton card; speech
      stops when the sheet closes or unmounts. **Verify**:
      `checks/gate-phase11.sh` passes — tsc and build clean; vitest
      green; ramble wiring asserted (shared toggle, speak-on-reply,
      stop-on-close); checklist carries the parity items; doctor exits 0.
- [ ] **Phase 12 — UI polish (three passes)**: the 2026-08-14 review of
      the live screens, scheduled as one phase in a three-commit series
      so mechanical wiring, entry, and teaching stay separable. Pass 1
      wires what's already there: the decision title calls
      `renameDecision`; empty Create surfaces an error instead of a
      silent no-op; the chat/ramble sheet drag handle is removed (it
      was visual only — the sheet is full-screen); the decision-bar
      mic matches Home's cyan-dot quiet button, not an emoji; the
      export "Backup saved" note lives under the title row so it
      survives closing the ••• menu. Pass 2: opening a decision
      lands on the tab that matches the home-row status (Results if
      there's a winner, Score if scoring, Dimensions if draft);
      create / ramble-from-home stay on Dimensions. Pass 3: one
      sentence on the first dimension form explaining objective vs
      subjective and importance 1–5. Reorder, expandable runner-ups,
      and search stay out. **Verify**: `checks/gate-phase12.sh`
      passes — tsc and build clean; vitest green; wiring asserted
      (rename, empty-create error, no fake handle, designed ramble
      control, export note outside the menu, entry tab from status,
      teaching sentence); checklist carries the polish items;
      doctor exits 0.
- [ ] **Phase 13 — Shared database**: opt-in per-decision anonymous publish,
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
  weakness in the Product spec; until this lands the Phase 6 LLM has no
  anchor payload type and can only suggest anchor values in prose.
- "Unknown" cells with weight redistribution — rejected at adoption: it
  reintroduces the silent bias the full-matrix rule locks out. Revisit only
  together with anchors.
- **Batched diff** review flow over several proposed edits — Phase 6's
  editable multi-row approval cards already cover approving several edits
  at once; revisit a dedicated diff/review UX once real usage shows the
  cadence.
- **Purchased AI credits** / payment for relay usage — the relay is
  free-quota only in v1; payment infra is out of scope for a local-first v1.
- **Guided "drunk mode"** (user idea 2026-08-11): a voice-first guided
  flow — ramble in, the app walks you through creation → dimensions →
  options → cell-by-cell scoring one question at a time, speaks its
  prompts back (Phase 10 voice replies), and the approval card is the
  sobriety checkpoint with an optional "sleep on it" deferred approval.
  Voice-in where the provider has no STT: Web Speech API as the
  no-setup default, relay transcription passthrough by amendment,
  on-device Whisper (transformers.js) as a stretch. Promote via
  amendment when scheduled.

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
| Phase 6 access model | user-selectable provider: BYO-key presets (Anthropic/OpenAI/Gemini) + custom OpenAI-compatible endpoint; optional operator-run relay (free quota, opt-in, disclosed) for zero-setup use (amendment 2026-08-10) |
| Phase 6 piggyback | rejected: iOS sandboxing exposes no way for a PWA to use an installed AI app's session or subscription, and providers offer no consumer OAuth for it; on-device web LLMs not viable in Safari today (amendment 2026-08-10) |
| Phase 6 interaction | approval cards are editable multi-row: rows may be edited/added/removed before approve; approve applies exactly the card's contents, reject nothing; chat transcripts ephemeral (no Dexie schema); data-flow disclosure in AI settings only, never on the chat surface (user decision 2026-08-11) |
| Phase 6 chat UX | mobile-first: single entry point at the tab bar, full-screen bottom sheet, context implicit from the active tab as a tappable chip, auto-peek after approve so the tab update is visible; half-sheet rejected for card-editing space (user decision 2026-08-11) |
| Phase 6 live testing | OpenAI is the live-test provider: user-supplied key entered through the app's AI settings (the production BYO path, never the repo); automated suite stays hermetic via recorded responses (user decision 2026-08-11) |
| Phase 6 relay stack | zero-dep Node (node:http, ESM) OpenAI-compatible proxy: client-generated opaque bearer token, in-memory per-token UTC-day quota, upstream endpoint + operator key via env, node:test suite (amendment 2026-08-11) |
| Phase 6 anchors | plan inconsistency resolved at implementation start: anchors are Deferred, so "propose anchors" cannot be a payload type — objective prefill only, scale guidance in prose (amendment 2026-08-11) |
| Voice ramble phase | promoted from Deferred to its own Phase 7 rather than folded into the pending UI redesign (user decision 2026-08-11); Shared database renumbered Phase 7 → 8 so voice is not blocked behind the unscheduled shared-db precondition. STT only where a provider has one: Whisper on openai/custom, Gemini inline audio on gemini; mic greyed out on anthropic and relay (relay stays text-only — its body cap and quota are chat-sized). Real-phone mic needs HTTPS (getUserMedia is secure-contexts-only), documented in the checklist (amendment 2026-08-11) |
| UI redesign phase | dark design language scheduled as Phase 8 once Phase 7 closed (c3873aa), with the user's results-screen spec + mock as the kickoff and the whole app restyled in the same pass; Shared database renumbered Phase 8 → 9. The Phase-6 chat peek becomes the decision view's fixed bottom bar (status line + Ask AI), so the sheet drops to the bar after approve (amendment 2026-08-11) |
| Home redesign phase | landing-page mock (2026-08-11) scheduled as Phase 9 once Phase 8 closed, Shared database renumbered Phase 9 → 10; composer-as-one-unit + tappable starter prompts + stateful decision rows (progress, status chip, mono counts/timestamp) + muted delete + dashed local-only footer per the mock (amendment 2026-08-11) |
| Ramble everywhere | decision view's bottom bar gains a mic button beside Ask AI (user decision 2026-08-11): on a decision screen the transcript is injected into that decision's chat as a message (proposals + approval card through the existing Phase-6 machinery), while Home's ramble still creates a whole new decision skeleton; same guards (greyed without provider STT, insecure-context explanation). Lands as a Phase-7 follow-up series (user chose build-now over Deferred) |
| Voice replies phase | voice-out + fuller chat context scheduled as Phase 10 on user directive 2026-08-11 (OpenAI /audio/speech with on-device speechSynthesis fallback; card outcomes join the existing since-Phase-6 turn history), Shared database renumbered Phase 10 → 11; the guided "drunk mode" walk-through (voice-in, one question at a time, sleep-on-it approval) quarantined to Deferred with its STT menu (amendment 2026-08-11) |
| Ramble voice parity | user directive 2026-08-11 after the Phase-10 close: the ramble sheet gets the same persisted voice toggle and speaks its prose replies (skeleton card never read aloud), scheduled as Phase 11, Shared database renumbered Phase 11 → 12 |
| UI polish phase | user directive 2026-08-14 after a UI/UX review: three-pass polish scheduled as Phase 12 (rename + empty-create error + designed ramble control + drop fake sheet handle + export note outside the menu; entry tab follows home-row status; first-dimension teaching sentence); Shared database renumbered Phase 12 → 13 |
