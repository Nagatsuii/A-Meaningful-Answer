# A Meaningful Answer

An idle game about the movement of information in computer science.

**Play:** https://nagatsuii.github.io/A-Meaningful-Answer/ (once GitHub Pages is turned on for this repo)

## Run it on your computer

No install or build step. Either open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
```

then visit http://localhost:8000.

Add `?reset` to the address (for example `http://localhost:8000/?reset`) to wipe your save and start from the dark again.

## Dev tools

A hidden menu for testing. Open it with `?dev=1` in the address (a small **DEV** button appears and stays
until you visit with `?dev=0`), by typing `devmode` on a keyboard, or by tapping the top-left corner 5 times on a phone.

- **Game speed** (1×, 2×, 5×, 10×, 100×) speeds up the whole game: oscillators, animations, births, the byte, the clock's ticking.
  A **TIME ×10** badge shows while it's not 1×. The setting is remembered on this device; `?dev=0` puts it back to 1×.
- **Music** plays a chosen piece now ("Prelude in Light" or "Canon of Warm Light").
- **Bits** adds 1,000 / 100,000 / 1,000,000 bits (milestones still arrive in order).
- **Jump to** sets the game up just as a milestone happens, then reloads so it plays out:
  Second bit, Constellation (Third Bit), Bit 5 and Byte (Eighth Bit) are each ready to buy;
  Track fork (paths open), Hook, Black hole ready. Knowledge, achievements and the universe count are kept.
  **Universe 2 (abacus)** starts universe 2 from the dark (with 10 Knowledge), and **Punch card** starts universe 2
  with two bits and a Punch Card ready to buy.
- **Boosters** makes a lightning bolt or a light pulse appear right now.
- **Black hole → Fall in now** starts the fall straight away, from wherever you are.
- **Save** wipes the save.

## Testing faster

Add `?speed=20` to the address to make every bit earned count 20 times over (any number up to 1000).
This multiplies bits, not time (for time, use the dev tools' game speed). A small **BITS ×20** badge shows while it's on. Combine it with a fresh start: `?reset&speed=50`.
Progress made at test speed is saved like normal progress, so use `?reset` afterwards to start clean.

Add `?warm` to hear the warm drone of a later universe (normally it only turns warm after a black-hole
reset, which isn't built yet).

## Universe 2: Memories

After the first fall into the black hole, universe 2 rebuilds the machine through computing history: an abacus
before the first spark, a moment from history with each new bit (Jacquard's loom, Babbage, Ada Lovelace,
Hollerith, ENIAC's programmers, Katherine Johnson, the byte), and a **Punch Card** that records your tapping and
plays it back by itself.

## Checking the balance

`tools/balance-sim.js` plays the game's real rules with a modelled player and prints when each milestone
arrives. It needs [Node.js](https://nodejs.org); the game itself doesn't.

```bash
node tools/balance-sim.js --all
```

That prints a table for both tracks at 1, 2 and 4 taps a second. Add `--universe 2` for the second universe
(10 Knowledge, the abacus and the Punch Card). Other options: `--taps 3`, `--track logic`,
and `--try trial.json` to test numbers without editing `config.js` (a trial file lists only what changes,
e.g. `{ "hookAt": 250000 }`). The comments at the top of the file explain the rest.

## Running the tests

`tests/` holds browser tests that play the real game on desktop- and phone-sized screens and check every
feature: the opening, upgrades, binary counting, the bits and the byte, time away, both tracks, the hook and
black hole, boosters, sound (including the mix order), the dev tools and the address switches.
They read prices and milestones from the game, so rebalancing `config.js` doesn't break them.

They need Node.js and Playwright (the game doesn't). Once, from the repo folder:

```bash
npm install playwright
```

```bash
npx playwright install chromium
```

Then run them all (about 5 minutes), or only suites whose file name contains a word:

```bash
node tests/run.js
```

```bash
node tests/run.js boosters
```

## Files

- `index.html` — the page
- `style.css` — page layout and the counter's look
- `js/config.js` — all tweakable numbers (costs, speeds, sizes)
- `js/dev.js` — the hidden dev tools menu and the central game speed
- `js/save.js` — saving and loading with localStorage
- `js/upgrades.js` — the rules for buying upgrades and what they add up to
- `js/achievements.js` — the achievements and what earns each one
- `js/audio.js` — every sound effect and the drone, made in code with the Web Audio API (no sound files)
- `js/music.js` — the background music, written as notes and played live (one piece per universe)
- `tools/balance-sim.js` — the balance simulator (not loaded by the game)
- `tests/` — the browser tests (`run.js`, shared `helpers.js`, one file per feature in `suites/`)
- `js/render.js` — draws the sky, the bit and its effects on the canvas
- `js/ui.js` — the counter and the upgrade menu
- `js/main.js` — starts the game, handles taps, runs the animation loop
