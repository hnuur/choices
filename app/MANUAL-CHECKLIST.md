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

## Phase 6 — AI integration

Serve the app, and for relay items start the relay (`cd relay &&
RELAY_UPSTREAM=… RELAY_API_KEY=… RELAY_QUOTA=2 node server.js`). Work in a
mobile-width viewport.

- [ ] Tap Ask AI at the tab bar: the chat sheet opens full-screen with a
      drag handle; the context chip shows the active tab, and tapping the
      chip cycles the tab the AI looks at.
- [ ] With AI unconfigured the sheet offers "Set up AI"; the settings
      screen shows a disclosure line for the selected mode (who pays,
      where data flows).
- [ ] OpenAI preset: paste a key, Validate key reports "Connection OK"; a
      deliberately wrong key shows the provider's error instead.
- [ ] Anthropic and Gemini presets (keys permitting): Validate key
      round-trip succeeds for each.
- [ ] Custom endpoint: point at any OpenAI-compatible server (the relay or
      a local one works); chat round-trip succeeds.
- [ ] Ask "what dims should I consider for cameras?" — the reply arrives
      with an approval card of editable rows.
- [ ] Edit the card before approving: change a name, adjust an importance,
      remove a row, add one via "+ dimension"; Approve applies exactly the
      card's contents and the Dimensions tab shows the result.
- [ ] After approve the sheet auto-drops to peek; the tab update is
      visible behind it; tapping the peek bar returns to the chat.
- [ ] Reject another proposal; nothing changes in the decision.
- [ ] Ask for a subjective rating ("rate sexiness for me"): the AI answers
      in prose and applies no score — subjective ratings stay human-owned.
- [ ] Ask a results question ("why did X win?") on a fully scored
      decision: prose answer grounded in the ranking, no proposal card.
- [ ] Relay mode with RELAY_QUOTA=2: two chats succeed, the third shows
      the quota-exhausted message suggesting your own key; Validate key
      still works afterwards.
- [ ] Break the setup (bad key or unreachable endpoint) and send a
      message: the error is shown visibly in the chat; the app stays
      usable and nothing is written.
- [ ] Reload the page: chat transcripts are gone (ephemeral); the decision
      itself persists.
