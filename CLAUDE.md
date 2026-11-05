# CLAUDE.md — A Meaningful Answer

## What this game is

A browser idle/clicker game that teaches computer science by letting the player watch a single bit come to life and grow into a computer, then a network, then a mind.

**North star:** everything at every scale is the same thing — information moving and flowing (a bit flipping, a neuron firing, a galaxy turning).

**Guiding principle:** "as above, so below."

## Title

The game is called **A Meaningful Answer**, a nod to Asimov's "The Last Question." The bit's whole journey ends by answering it.

## Tech rules

- Plain HTML, CSS and JavaScript only. No frameworks or build step unless the owner approves.
- Must run in a phone browser and deploy to GitHub Pages straight from the repo.
- Keep files small and readable; the owner is learning as they go, so comment code in plain English.
- Save game state to `localStorage`.
- Keep game numbers (costs, rates) in one config file so balance is easy to tweak.
- All sound is synthesised in code with the Web Audio API. No audio files.

### Running locally

- No install or build. The scripts are plain `<script>` tags (not modules), so opening `index.html`
  straight from disk works. A local server also works: `python3 -m http.server 8000`, then visit `http://localhost:8000`.
- To check the phone layout, use the browser's device/responsive mode.
- GitHub Pages serves `index.html` from the repo root, so keep the entry page there (`.nojekyll` is in place).
- Live at https://nagatsuii.github.io/A-Meaningful-Answer/ once Pages is turned on (Settings → Pages → `main`, `/ (root)`).

### Dev tools (hidden from normal players)

- Open with `?dev=1` (remembered; `?dev=0` turns it off and resets the speed), by typing `devmode`, or with 5 quick taps in the top-left corner on a phone.
- **Game speed** 1×–100×: one central time scale, `Dev.timeScale()`. A "TIME ×N" badge shows whenever it isn't 1×.
- Helpers: add bits, reset the save. Add more with `Dev.addTool(group, label, run)` (see the bottom of `main.js`),
  e.g. jumping to milestones or triggering a black-hole reset.

### Testing switches (add to the page address)

- `?reset`: wipe the save and start from the dark.
- `?speed=20`: every bit earned counts 20× (up to 1000) — bits, not time. Shows a "BITS ×20" badge. Progress is saved as normal.
- `?warm`: hear the warm drone of a later universe.
- They combine, e.g. `?reset&speed=50`.

## Tone and feel

- Calm, wondrous, cosmic. No jolts, no threats, no combat.
- Bits look like tiny stars being born; connections are threads of light; pulses travel along them.
- Pulse colours carry meaning (each hue = a kind of knowledge, e.g. logic vs storage).
  In use: gold = a carry, pale blue = resting pulse, teal = Storage, violet = Logic.

## Art and layout

- Everything is drawn in code on an HTML canvas: glowing sparks, threads of light, pulses and particles. No image asset files.
- Terminal and boot screens use their own retro text style.
- One responsive canvas for desktop and phone. On wide screens the upgrade menus sit beside the starfield; on phones they slide up from the bottom.
- Text that must stay crisp or clickable (counter, notes, menu, dialogs) is normal page elements over the canvas.

## Sound

- Mix, quietest to loudest: drone < taps and clock ticks < purchase zaps and streak sparks < milestone notes < achievement chimes. Big moments must stand out.
- Musical notes are reserved for milestones (a new bit, the first pulse between bits, the byte chord). Taps stay a near-silent tick.
- The drone has one note per bit from a D major scale: cold and airy in the first universe, warm after a black-hole reset.
- Sound starts on the player's first touch, click or key press (browser autoplay rules). Mute and volume controls sit top right.
- Loudness of every sound is in the `LEVEL` list at the top of `js/audio.js`.

## Core loop

- The core verb is the **toggle**: flipping a bit generates bits.
- Bits are the currency, spent on hardware upgrades that let you produce more bits.
- Early game leans toward clicking: per-click upgrades plus auto-flippers.
- The bits count together in binary (00 → 01 → 10 → 11…). Every bit that flips earns, so carries pay more,
  and a carry travels to the next bit as a gold pulse of light.

## First-hour demo (built)

All seven steps exist. The milestone totals and costs in `js/config.js` are first guesses and still need balancing in real play.

1. **0–2 min:** darkness, "insufficient data" flickers in neon, then the first bit sparks to life.
2. **2–10 min:** toggle loop, Amplifier (per-tap upgrade), Oscillator (auto-flipper, ticks like a muffled clock).
3. **10–15 min:** Second Bit (an upgrade); calm pulse between them ("four possible states").
4. **15–35 min:** bits 3–7 join on their own at lifetime-bit milestones, in a wandering constellation.
5. **35–40 min:** the 8th bit joins and the byte forms in a short ceremony ("256 possibilities").
6. **40–55 min:** two paths of light open: the player picks Storage or Logic first.
   - Storage (keeping, idle): Latch, Register, Memory Cell.
   - Logic (gates boost flips): NOT, AND, OR, and IF · THEN · ELSE (teaches branching; the branch that ran lights up under the byte).
7. **55–60 min:** hook — the locked track glows faintly, a distant dark shimmer hints at the black hole.

## Built beyond the first hour

- **Offline progress:** oscillators and memory cells keep earning while the game is closed (capped, 8 hours by default; Storage extends it).
- **Achievements:** seven, each with a one-line lesson, a toast and the chime (in `js/achievements.js`).
- **Black hole reset (the soft prestige, "Deus Ex Machina"):** once the hook has appeared and the Megabit goal
  (1,048,576 bits) is met in the current universe, the black hole draws close and can be touched. Falling in turns
  this universe's bits into **Knowledge** (square root of lifetime bits ÷ 10,000), each point +10% to all earning, forever.
  Only achievements, Knowledge and `universesCompleted` survive. The new universe opens with warm neon: "the data remembers" and the universe number.

## Bigger picture (don't build yet)

- Two tracks (storage and logic) later fuse into a processor in a dramatic ignition event. (The locked track's "something bigger has to happen first" points here.)
- One computer becomes a network, which wakes into a mind (sight, then sound, then touch) — the true ending.
- Prestige still to come: Code Monkey (hard).
- Mechanics planned: Compression, The Clock (the oscillator tick sets it up), Algorithms as automation, Event Horizon mini games.
- "LET THERE BE LIGHT" is saved for the true ending.

## Code map

| File | What it does |
|---|---|
| `index.html` | the page; loads the scripts in order |
| `style.css` | layout, menu, notes, neon opening, dialogs |
| `js/config.js` | every tweakable number, plus the `?speed` and `?warm` switches |
| `js/dev.js` | the hidden dev tools menu and the central game speed |
| `js/save.js` | the save format (`Save.fresh()` lists every field) and loading/saving |
| `js/upgrades.js` | upgrade rules, and `Upgrades.step`: the single place that decides what one counting step earns |
| `js/achievements.js` | achievements and their tests |
| `js/audio.js` | every sound |
| `js/render.js` | all canvas drawing |
| `js/ui.js` | counter, menu, notes, choice buttons, dialogs, sound controls |
| `js/main.js` | game flow: taps, counting, births, the byte ceremony, the choice, the hook, the reset, the main loop |

## How to work in this repo

- Build in small, playable steps; every change should leave the game runnable.
- After changes, open the game in a browser and check it works before finishing — on both desktop and phone sizes.
- Explain what you changed in simple terms at the end of each session.
- Ask before adding new features outside the current target.
- Keep the conventions the code relies on:
  - All earning goes through `earn()` in `main.js` (that's where test speed and Knowledge apply).
  - Anything timed in the game uses game time (`dt` / `view.time` in the main loop) so the dev speed-up scales it.
    Only real-life things use real time: the player's tapping, how long notes stay readable, time away, autosaves.
    Sound waits that line up with animations go through `game()` in `audio.js`.
  - What a step is worth is decided only in `Upgrades.step`; averages (offline, per second) are built from it.
  - A new save field needs a default in `Save.fresh()`, so older saves still load.
  - Anything meant to survive a black-hole reset must be copied over in `startNewUniverse()` in `main.js`.
- Run `node --check` on each changed JS file before testing; a missing comma in `config.js` breaks the whole game.
