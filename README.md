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
- **Bits** adds 1,000 / 100,000 / 1,000,000 bits (milestones still arrive in order).
- **Save** wipes the save.

## Testing faster

Add `?speed=20` to the address to make every bit earned count 20 times over (any number up to 1000).
This multiplies bits, not time (for time, use the dev tools' game speed). A small **BITS ×20** badge shows while it's on. Combine it with a fresh start: `?reset&speed=50`.
Progress made at test speed is saved like normal progress, so use `?reset` afterwards to start clean.

Add `?warm` to hear the warm drone of a later universe (normally it only turns warm after a black-hole
reset, which isn't built yet).

## Files

- `index.html` — the page
- `style.css` — page layout and the counter's look
- `js/config.js` — all tweakable numbers (costs, speeds, sizes)
- `js/dev.js` — the hidden dev tools menu and the central game speed
- `js/save.js` — saving and loading with localStorage
- `js/upgrades.js` — the rules for buying upgrades and what they add up to
- `js/achievements.js` — the achievements and what earns each one
- `js/audio.js` — every sound, made in code with the Web Audio API (no sound files)
- `js/render.js` — draws the sky, the bit and its effects on the canvas
- `js/ui.js` — the counter and the upgrade menu
- `js/main.js` — starts the game, handles taps, runs the animation loop
