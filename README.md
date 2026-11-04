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

## Files

- `index.html` — the page
- `style.css` — page layout and the counter's look
- `js/config.js` — all tweakable numbers (costs, speeds, sizes)
- `js/save.js` — saving and loading with localStorage
- `js/render.js` — draws the sky, the bit and its effects on the canvas
- `js/main.js` — starts the game, handles taps, runs the animation loop
