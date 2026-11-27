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
      cells take 1–5, and a unit like genre (or a dimension named Genre)
      is one or more labels typed or picked from a dropdown — not a 1–5
      rating.
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

- [ ] Tap Ask AI in the action bar. The context picker shows the active
      section and can switch the section the AI uses.
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

- [ ] On a secure-context page (localhost or https) tap Ramble in the
      home composer; tap the mic — the browser asks for microphone permission
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
- [ ] Ramble and Ask AI sheets always show a text field and a mic (mic
      greyed without STT or on an insecure page). Keep chatting focuses
      the field; a follow-up can replace the card; closing without filling
      in writes nothing.
- [ ] Ramble something with no decision in it ("what's the weather like"):
      prose reply, no card, nothing written.
- [ ] Malformed or non-skeleton proposals error visibly and write nothing:
      point the custom endpoint at a stub whose reply carries an
      addDimension proposal (or a broken ```json block) and ramble; the
      sheet shows the error and no decision is created.
- [ ] Greyed mic: switch AI settings to Anthropic (or relay) — composer
      Ramble still opens (typed works) and the sheet mic is greyed with
      "Change provider"; switch back to OpenAI/Gemini/custom and it
      re-enables.
- [ ] Insecure context: open the app over plain http://<lan-ip>:4173 on the
      phone; composer Ramble opens but the mic explains the HTTPS requirement
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
      and tap Ramble next to Create — the text is sent to AI
      without the mic; the card can include best-effort scores; Fill in
      what you can creates it. Empty composer Ramble opens the same sheet
      for write-or-speak.
- [ ] Home ramble still creates a whole new decision (createDecision card),
      never touching an existing decision's chat.

## Phase 8 — appearance and results

- [ ] Home, the decision sections, conversations, approval cards, and AI
      settings follow the system’s light or dark appearance. Platform
      typography remains readable in both appearances and offline.
- [ ] The decision header has a clearly labeled back action, an editable
      title, and a More actions menu. “Edit dimensions” switches to Dimensions.
      “Export backup (.json)” downloads the backup and shows the result
      below the title. Escape or tapping outside closes the menu.
- [ ] The four decision sections are reachable directly. The active section
      is visually distinct and announced as current. The AI context picker
      follows the active section.
- [ ] Results distinguish a winner, a near tie, and the only-option case.
      A partial score matrix shows progress and an action to resume scoring.
- [ ] The leading option shows raw scores, its total, and bars normalized
      against each dimension’s best value. Bar thickness reflects importance weight.
      Other options show their ranks and totals.
- [ ] Non-discriminating dimensions and “How fragile is this?” probes
      remain readable with long dimension and option names.
- [ ] The fixed decision action bar clears safe areas and leaves document
      content reachable. Approving an AI card returns to the decision and
      shows the update. Ask AI reopens the same conversation.

## Phase 9 — Home

- [ ] The composer has a persistent Decision name label and distinct Create
      and Ramble buttons. Enter and Create both open the new decision.
- [ ] A starter prompt seeds the input without creating a decision.
- [ ] Ramble opens from the composer. Import backup opens from the footer.
      An invalid backup shows an error.
- [ ] Your decisions shows the count and offers Recent and A–Z sorting
      when there is more than one decision.
- [ ] A fully scored row names the winner and total. A partial scoring row
      has a progress bar and completed-cell count. A draft shows the next step.
- [ ] Each row shows dimension and option counts and the last edit time.
      Delete takes a separate confirmation. Tapping the decision name opens it.
- [ ] The footer explains where decisions are stored. Buttons and fields
      retain visible keyboard focus and their touch targets at narrow widths.

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
      another and it knows those proposals were rejected.
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
- [ ] Chat and Ramble have a visible Close control and dismiss with Escape.
- [ ] The decision action bar has a labeled Ramble button. Inside the sheet,
      the recording control is disabled with an explanation when unavailable.
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
      are facts with a unit (price, weight); a unit like genre is picked
      from a list, not typed as a number. Subjective ones are 1–5 ratings.
      Importance 1–5 is how much the ranking should care." The sentence is
      gone once a dimension exists.

## Phase 13 — web lookup

Configure a BYO-key preset in AI settings. Web lookup is off until you
turn it on. Live lookup items need a model that can search.

- [ ] AI settings has a Web lookup on/off toggle, default off; turning it
      on adds the disclosure line "a search may leave the device via that
      provider."
- [ ] With lookup off, Ask AI still shows Thinking… and behaves as today
      (no search tool on the request).
- [ ] With lookup on, Ask AI shows Looking up…; ask for an objective fact
      (a camera body weight); the reply cites sources in the prose and any
      setScore still needs Approve.
- [ ] Same lookup on ramble: Looking up…, sources in the prose, Fill in
      what you can is still the checkpoint.
- [ ] OpenAI, Anthropic, and Gemini each complete one live lookup (prices
      or weights) with citations.
- [ ] Custom or relay with lookup on and an endpoint that cannot search
      shows "This endpoint cannot look up the web."
- [ ] Proposed scores still need approve — Reject writes nothing.

## Phone usability regression checks (Phase-6/7 follow-up)

- [ ] In AI settings, Validate key loads available text models into Model.
      Choose an available model and Save; reopen settings and verify it persists.
- [ ] An unavailable saved model prompts a new choice; Save stays disabled
      until a model from the returned list is selected.
- [ ] Changing key, provider, or custom URL clears the catalog and validation;
      a slow response for the previous key must not repopulate the picker.
- [ ] Anthropic/Gemini catalogs include later pages. Gemini embedding-only
      models and OpenAI speech/image/embedding models are absent.
- [ ] A custom endpoint without /models shows an error and still allows a
      manually entered model ID. Relay model choice stays operator controlled.

- [ ] Simulate a failed database write while approving AI changes: the
      sheet stays open, shows the save error, and offers only failed rows
      for retry. Retrying must not duplicate already-saved options.
- [ ] After a partial save, ask AI what saved: it receives the actual
      success/failure counts and errors, rather than being told all applied.
- [ ] While saving, Approve shows Saving… and cannot be tapped repeatedly.
- [ ] Edit a numeric objective dimension into a subjective one and save:
      the edit succeeds, its old unit/direction disappear, and old scores clear.
- [ ] A legacy objective dimension with unit rating uses the same totals
      and result bars as a subjective 1–5 dimension. Invalid legacy ratings
      remain unscored and are included in the AI snapshot's missing cells.
- [ ] Close the AI sheet while a remote voice reply is loading: no audio
      starts afterward, including the on-device fallback if the request fails.
- [ ] At 320px width, AI settings provider controls stay at least 44px
      tall, and Save can be scrolled fully into view above the home indicator.
- [ ] In an AI proposal with six or more score rows, option/dimension
      labels remain visible and the five rating buttons each have at least
      a 44×44px target; no horizontal scrolling is needed.
- [ ] Clear a numeric score in a normal or compact approval card: the field
      stays empty and Approve valid rows excludes it instead of saving zero.
      Clearing a numeric score in the ramble skeleton also leaves it empty.
- [ ] On iPhone, focusing approval/skeleton selectors and numeric fields
      does not auto-zoom the page. Pinch zoom remains available.
- [ ] On a phone in landscape, chat and ramble content clears the notch;
      long unbroken replies do not force horizontal scrolling. With the
      keyboard open, the header and compose bar remain visible.

## iPad and responsive follow-up

- [ ] In Safari and from the Home Screen, check iPad portrait, landscape,
      and a narrow Split View window. Home, all four decision sections,
      and their action bar fit without horizontal scrolling. Decision
      summaries and scoring cards wrap back to one column as space narrows.
- [ ] Open Ramble and Ask AI. Header, messages, composer, and AI settings
      use the same centered content width. With the software keyboard
      open, send a message, edit a proposal, and scroll to Save in settings.
      Rotate and close the keyboard. The bars clear both safe areas.
- [ ] With a text-only provider or recording unavailable, open Ramble
      from Home and from a decision. The microphone gives a reason and
      typed messages still reach the corresponding AI flow.
- [ ] With a supported provider, deny microphone permission, then retry
      after granting it. Check recording, cancellation, and dismissal.
- [ ] With a hardware keyboard, Tab through the sheet and press Escape
      to return from AI settings or dismiss the sheet. Background controls
      stay out of the tab order while a sheet is open.


## Readable conversations and hands-free voice

- [ ] In iPad portrait and landscape, bold text, line breaks, and lists
      display clearly. A long reply stays in a readable-width column.
- [ ] With a supported speech-to-text provider, open Ask AI, tap Hands-free
      once, then talk through options, dimensions, importance, scores,
      and the computed results. The app sends each spoken turn after a
      pause and listens again after the reply finishes.
- [ ] When the app reads a proposal, say “save changes” or “discard
      changes.” Check that only the explicit save writes. Change a visible
      row after readback and say “save changes.” The app reads the edited
      version before it will save it.
- [ ] Confirm foreground capture ends on “pause listening,” the pause
      button, opening settings, dismissing the sheet, or leaving the app.
      Silence by itself does not send a message.
- [ ] In Home Ramble, start Hands-free and create a draft by speaking.
      Save it by voice, then continue through Ask AI in the new decision.
- [ ] Confirm typed messages, manual recording, and the spoken-replies
      preference still work. Confirm a text-only provider reports why its
      microphone is unavailable.

## Apple mobile appearance follow-up

Review against Apple’s guidance for
[iOS](https://developer.apple.com/design/human-interface-guidelines/designing-for-ios),
[iPadOS](https://developer.apple.com/design/human-interface-guidelines/designing-for-ipados),
[layout](https://developer.apple.com/design/human-interface-guidelines/layout), and
[accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility).

- [ ] In light and dark appearance, review Home (empty and populated),
      Dimensions, Options, Score, Results (partial and complete),
      Ask AI, Ramble, AI settings, and both editable proposal cards.
      Labels and primary actions remain readable, including errors.
- [ ] At iPhone and iPad widths, including a narrow iPad window, rotate
      the device and enlarge text to 200%. Content reflows, long option
      names wrap, and the decision action bar keeps its controls reachable.
- [ ] With the keyboard open, scroll through a proposal and reach Save
      or Approve. On a roomy iPad, the conversation appears as an inset sheet.
      With less space, the composer remains inside the visual viewport.
- [ ] Use Tab and Escape with a physical keyboard. Check visible focus,
      named controls, the AI context picker, selected ratings, and progress.
      Read the results and chart values with VoiceOver.
- [ ] In Settings, switch providers, validate and choose a model, toggle
      Web lookup, and save. Confirm labels stay visible after typing.
      Check the compact and enlarged-text layouts with reduced motion.
