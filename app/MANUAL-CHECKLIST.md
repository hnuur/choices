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
- [ ] Ask to score a decision that has a subjective dimension: the approval
      card includes a 1–5 setScore row; Approve writes the rating.
- [ ] Ask a results question ("why did X win?") on a fully scored
      decision: prose answer grounded in the ranking, no proposal card.
- [ ] Relay mode with RELAY_QUOTA=2: two chats succeed, the third shows
      the quota-exhausted message suggesting your own key; Validate key
      still works afterwards.
- [ ] Break the setup (bad key or unreachable endpoint) and send a
      message: the error is shown visibly in the chat; the app stays
      usable and nothing is written.
- [ ] Malformed proposals error visibly and write nothing: point the
      custom endpoint at a stub whose reply contains a broken ```json
      block, send a message; the chat shows "Couldn't read the suggested
      changes" and the decision is untouched.
- [ ] Dismiss the sheet with ✕; the transcript survives reopening within
      the same session; a page reload resets it (ephemeral).
- [ ] Reload the page: chat transcripts are gone (ephemeral); the decision
      itself persists.

## Phase 7 — voice ramble input

Serve the app (`npm run build && npm run preview` in `app/`). The mic needs
a secure context: localhost works, and phone items need an HTTPS tunnel in
front of preview (e.g. `cloudflared tunnel --url http://localhost:4173`).
Configure an STT-capable provider (OpenAI, Gemini or a custom
Whisper-compatible endpoint) in AI settings for the round-trip items.

- [ ] On a secure-context page (localhost or https) tap Ramble it on the
      home screen; tap the mic — the browser asks for microphone permission
      (iOS asks once per site/PWA); recording shows a pulsing dot and an
      elapsed timer, Stop ends it, Cancel discards it.
- [ ] Ramble a decision ("I want to pick a new camera, I care about weight
      and price and sexiness, looking at the Sony A7C II and the Fuji
      X-T5"), then Stop: the transcript appears as a "You said" bubble,
      Transcribing… → Thinking…, and the reply arrives with an editable
      proposed-decision card.
- [ ] Edit the card before filling in: rename the decision, change an
      importance, remove a dimension, add an option via "+ option";
      Fill in what you can creates exactly the card's contents and opens
      the new decision (Score or Results if scores were filled).
- [ ] Keep chatting instead: the sheet shows a text field; a follow-up can
      replace the card; closing without filling in writes nothing.
- [ ] Ramble something with no decision in it ("what's the weather like"):
      prose reply, no card, nothing written.
- [ ] Malformed or non-skeleton proposals error visibly and write nothing:
      point the custom endpoint at a stub whose reply carries an
      addDimension proposal (or a broken ```json block) and ramble; the
      sheet shows the error and no decision is created.
- [ ] Greyed mic: switch AI settings to Anthropic (or relay) — the home
      Ramble it button is disabled with a note and the sheet offers
      "Change provider"; switch back to OpenAI/Gemini/custom and it
      re-enables.
- [ ] Insecure context: open the app over plain http://<lan-ip>:4173 on the
      phone; Ramble it opens but the mic explains the HTTPS requirement
      instead of failing silently.
- [ ] Real-iPhone ramble round-trip (https): with preview behind the HTTPS
      tunnel, record a ramble on the phone (permission prompt appears),
      approve the skeleton card; the new decision opens and survives a
      reload.
- [ ] iOS standalone PWA over https (Share → Add to Home Screen): the
      ramble flow works inside the standalone app too.
- [ ] Reload the page: ramble transcripts and cards are gone (ephemeral);
      created decisions persist.
- [ ] Ramble from a decision: the bottom bar shows a mic button beside
      Ask AI (greyed when the provider has no STT or the page is not
      secure); tap it, record, stop — the transcript lands in that
      decision's chat as a user bubble and the AI answers there with
      proposals/approval card; approve applies to the current decision
      and the bar shows "Changes applied · HH:MM".
- [ ] Home composer Ramble: type a decision into "What are you deciding?"
      and tap Ramble (cyan-dot, next to Create) — the text is sent to AI
      without the mic; the card can include best-effort scores; Fill in
      what you can creates it. Voice Ramble it is unchanged.
- [ ] Home ramble still creates a whole new decision (createDecision card),
      never touching an existing decision's chat.

## Phase 8 — dark redesign

Visual pass in a mobile-width viewport (simulator or phone too, if handy).

- [ ] App renders dark everywhere: near-black background with a subtle top
      glow, cards as dark surfaces separated by hairline borders instead of
      shadows, no pure-white text and no pure-black surfaces; UI face is
      Inter Tight; metadata (counts, ranks, badges, legends, matrix labels)
      is JetBrains Mono, uppercase, letter-spaced.
- [ ] Decision header: "← All decisions" back link; 34px bold title with a
      38×38 ••• button at the right; mono "N DIMENSIONS · M OPTIONS" line
      under it.
- [ ] ••• menu opens as a 206px dark dropdown: "Edit dimensions" jumps to
      the Dimensions tab; "Export backup (.json)" downloads the backup and a
      mono BACKUP SAVED · HH:MM footer line appears (EXPORT FAILED on
      error); tapping outside closes it. The old inline export row is gone.
- [ ] Tabs are a plain underline row on a hairline divider: inactive grey,
      active white with a 2px cyan underline; all four tabs still freely
      jumpable, and the chat context chip follows the active tab.
- [ ] Results: single-line winner banner — mono cyan WINNER plus
      "X by 0.0N over Y" (near-tie wording when the margin ≤ 0.02;
      only-option wording when alone) on a cyan-tinted banner, the only
      colored card in the app.
- [ ] Rank-1 card: mono rank, name, cyan WIN chip, cyan total at the right;
      per-dimension bars normalized against the dimension's best value (the
      best fills the width; objective lower-is-better inverts; subjective
      reads /5) with raw values at the right; bar thickness and fill
      intensity scale with importance and no ×weight labels remain; mono
      legend "BAR = SCORE IN DIMENSION · THICKNESS = WEIGHT".
- [ ] Ranks 2–N render as compact one-line rows: mono rank, name,
      desaturated 3px mini bar, total at the right; only rank 1 expands.
- [ ] Non-discriminating callout and the "How fragile is this?" probes
      render as neutral dark cards.
- [ ] Ask AI is a full-width cyan gradient button in a fixed bottom bar with
      a top-fading blur; content scrolls clear of the bar; the safe-area /
      home-indicator space is kept.
- [ ] Approving a chat card drops the sheet to the bottom bar and shows
      "Changes applied · HH:MM" above the button; tapping Ask AI reopens the
      chat with its transcript intact.
- [ ] Home, Dimensions/Options/Score tabs, chat sheet, approval cards,
      ramble sheet and AI settings all carry the dark tokens; inputs stay
      16px (no iOS focus zoom); tap targets ≥44px.
- [ ] Offline reload (airplane mode): the shell and the self-hosted fonts
      load from the precache — Inter Tight / JetBrains Mono render, not
      system fallbacks.

## Phase 9 — home redesign (landing)

Landing pass in a mobile-width viewport, against the 2026-08-11 mock.

- [ ] Composer is one rounded field: "What are you deciding?" input with
      the Create pill inside at the right (cyan gradient with a soft
      glow); Enter and Create both create and open the decision.
- [ ] Tapping a starter prompt (Next camera / Where to live / Which
      offer) seeds the input without creating; chips are dashed pills.
- [ ] Ramble it and Import backup are equal-width quiet buttons; Ramble
      it carries the cyan dot, still greys out with its note on
      anthropic/relay, and import errors still surface below.
- [ ] Mono section header reads "YOUR DECISIONS · N"; the RECENT ▾ menu
      offers Recent and A–Z and re-sorts the list live; tapping outside
      closes it.
- [ ] A fully-scored decision's row: full cyan progress bar, cyan WINNER
      chip, leading "Name · NN%" line, mono "N DIM · M OPT" at the bar's
      end, mono uppercase timestamp at the right.
- [ ] A partially-scored row: partial cyan bar, grey SCORING chip, "X of
      Y scored"; a draft row: grey stub bar, grey DRAFT chip, "Add
      options to start" (or "Add dimensions to start").
- [ ] Timestamps read JUST NOW / NM AGO / NH AGO / YESTERDAY / ND AGO,
      and MON D (e.g. MAR 4) once a week old.
- [ ] Row Delete is muted grey, reddens on hover, and still requires the
      two-step confirm; the same muted style shows in the edit tabs.
- [ ] Dashed footer note reads "Decisions stay on this device. Export a
      backup to keep them." and closes the screen — no dead space below
      the list.
- [ ] Rows open from a full-card tap (Delete sits above the tap layer);
      controls ≥44px across composer, starter chips, secondaries, sort
      and Delete; the composer input stays 16px and its field shows an
      accent border on focus.

## Phase 10 — voice replies & conversational context

Chat with a configured provider, in a mobile-width viewport.

- [ ] OpenAI preset with a key: chat replies play aloud in a neural
      voice; anthropic/gemini/relay (or a custom endpoint without
      /audio/speech): the same replies play in the on-device voice,
      including offline.
- [ ] The VOICE ON/OFF toggle in the chat header persists across sheet
      close/reopen and reload; switching off stops any current speech.
- [ ] A reply that carries proposals speaks only the prose part — no
      JSON read aloud.
- [ ] Apply a card, then ask a follow-up ("did that land?"): the
      assistant answers knowing the proposals were applied; reject
      another and it knows that too.
- [ ] Multi-turn context: a follow-up can reference an earlier answer
      ("what did you just say?") without re-explaining the decision.
- [ ] Closing the sheet (✕, or approve dropping it to peek) stops the
      speech; reopening starts silent until the next reply.
- [ ] Reload: the transcript is gone (ephemeral) but the voice setting
      persists.

## Phase 11 — ramble sheet voice parity

- [ ] The ramble sheet header carries the same VOICE ON/OFF toggle as
      the chat sheet; flipping it in one sheet is reflected when the
      other is reopened (one shared persisted setting).
- [ ] With voice on, a ramble's prose reply is read aloud (neural on
      openai, on-device elsewhere); a skeleton-card reply reads only
      the prose intro, never the card.
- [ ] Closing the ramble sheet stops any speech in flight.

## Phase 12 — UI polish (three passes)

Mobile-width viewport, against the 2026-08-14 review.

- [ ] Tapping a decision title enters an inline rename field; Enter or
      blur saves via renameDecision; empty name shows
      "Name the decision first." and stays in edit; Escape cancels.
- [ ] Tapping Create with an empty composer shows
      "Name the decision first." instead of doing nothing; typing clears
      the error.
- [ ] Chat and ramble sheets have no drag handle (full-screen, not a
      half-sheet).
- [ ] The decision-view bottom bar ramble control is a cyan-dot quiet
      button labeled Ramble (same mark as Home), not an emoji; it still
      greys out without STT / on an insecure page.
- [ ] Export backup still lives in the ••• menu; after export,
      "Backup saved · HH:MM" shows under the title row and remains after
      the menu closes.
- [ ] Opening a WINNER row lands on Results; a SCORING row on Score; a
      DRAFT row (and Create) on Dimensions. Home ramble opens via that
      same rule once filled in. Switching tabs after that stays where you put it.
- [ ] Importing a backup opens the same tab the home row would: Results
      if the matrix is complete, Score if any cells are scored,
      Dimensions otherwise.
- [ ] The first dimension form (empty decision) shows: "Objective dimensions
      are facts with a unit (price, weight); subjective ones are 1–5
      ratings. Importance 1–5 is how much the ranking should care." The
      sentence is gone once a dimension exists.

