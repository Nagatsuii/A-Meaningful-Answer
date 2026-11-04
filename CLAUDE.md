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

### Running locally

- No install or build. Serve the repo folder and open it in a browser:
  `python3 -m http.server 8000`, then visit `http://localhost:8000`.
  (A local server is needed if the code uses JavaScript modules; opening `index.html` directly from disk blocks them.)
- To check the phone layout, use the browser's device/responsive mode.
- GitHub Pages serves `index.html` from the repo root, so keep the entry page there.

## Tone and feel

- Calm, wondrous, cosmic. No jolts, no threats, no combat.
- Bits look like tiny stars being born; connections are threads of light; pulses travel along them.
- Pulse colours carry meaning (each hue = a kind of knowledge, e.g. logic vs storage).

## Art and layout

- Everything is drawn in code on an HTML canvas: glowing sparks, threads of light, pulses and particles. No image asset files.
- Terminal and boot screens use their own retro text style.
- One responsive canvas for desktop and phone. On wide screens the upgrade menus sit beside the starfield; on phones they slide up from the bottom.

## Core loop

- The core verb is the **toggle**: flipping a bit generates bits.
- Bits are the currency, spent on hardware upgrades that let you produce more bits.
- Early game leans toward clicking: per-click upgrades plus auto-flippers.

## First-hour demo (current target)

1. **0–2 min:** darkness, then the first bit sparks to life.
2. **2–10 min:** toggle loop, per-click upgrade, first auto-flipper.
3. **10–15 min:** second bit appears; calm pulse between them ("four possible states").
4. **15–35 min:** bits 3–7 link up into a constellation on their own.
5. **35–40 min:** the byte forms ("256 possibilities").
6. **40–55 min:** player picks Storage or Logic track first.
7. **55–60 min:** hook — locked track glows faintly, a distant dark shimmer hints at the black hole.

## Bigger picture (don't build yet)

- Two tracks (storage and logic) later fuse into a processor in a dramatic ignition event.
- One computer becomes a network, which wakes into a mind (sight, then sound, then touch) — the true ending.
- Prestige: knowledge currency, Deus Ex Machina (soft), Code Monkey (hard).
- Mechanics planned: Compression, The Clock, Algorithms as automation, Event Horizon mini games.

## How to work in this repo

- Build in small, playable steps; every change should leave the game runnable.
- After changes, open the game in a browser and check it works before finishing.
- Explain what you changed in simple terms at the end of each session.
- Ask before adding new features outside the current target.
