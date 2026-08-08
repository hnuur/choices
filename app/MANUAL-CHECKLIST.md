# Manual checklist

Serve the app (`npm run dev`, or `npm run build && npm run preview` in `app/`)
and work through the items in a mobile-width viewport. Each phase's gate
asserts this file stays present and covers the lifecycle; ticking items is
for the human verifier.

## Phase 4 — decision lifecycle, end to end

- [ ] Create a decision from the home screen; it opens on the Dimensions tab.
- [ ] Add an objective dimension with unit and lower-is-better direction, and
      a subjective dimension; kind/direction/unit/importance render as badges.
- [ ] Add two options with notes; rows sort alphabetically.
- [ ] Score tab shows the matrix progress (0/N cells) and option-by-option
      cards: objective cells take a raw value with unit suffix, subjective
      cells take 1–5.
- [ ] Results before the matrix is complete shows the progress state and a
      link to scoring — never a stale or partial ranking.
- [ ] Score every cell; unscored ○ markers turn ● and progress reaches N/N.
- [ ] Results shows the ranking with totals, per-dimension breakdown bars
      with raw values (objective) and ratings (subjective), and the winner
      margin over the runner-up.
- [ ] A dimension on which all options score equally is flagged as
      non-discriminating.
- [ ] Sensitivity probes render: break-even importance ("had importance ≥ N,
      X would win") and drop-one-dimension flips, or the robustness note.
- [ ] Edit a dimension's importance; Results re-rank live without a reload.
- [ ] Add a third option mid-flow; Results drops back to the progress state
      (no stale ranking); delete it again via the two-step confirm.
- [ ] Delete a dimension and an option; both require confirm and their
      scores cascade away.
- [ ] Home lists decisions most-recently-updated first with winner preview
      (or scored-progress) and edited time; deleting a decision requires
      confirm.
- [ ] Reload the page; every decision, dimension, option and score persists
      (IndexedDB).

## Phase 5 — install, offline & data portability

- [ ] On iPhone/iPad Safari the install hint is visible; follow Share → Add to
      Home Screen and Choices opens standalone (no browser chrome). Installed
      or on desktop, the hint stays hidden.
- [ ] With the app loaded once, go offline (airplane mode) and reload: the
      shell loads from the service-worker precache and every decision,
      dimension, option and score loads from IndexedDB.
- [ ] Open a fully-scored decision and tap Export backup: a .json file
      downloads.
- [ ] Wipe: delete that decision (two-step confirm), then Import backup from
      the home screen and pick the file; the restored decision has identical
      dimensions, importance weights, options and scores, and Results names
      the same winner.
- [ ] Import a file that is not a Choices backup; an error is shown and
      nothing is created.
