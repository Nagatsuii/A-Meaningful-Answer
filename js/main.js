// main.js — starts the game, listens for taps, and runs the animation loop.

(function () {
  const canvas = document.getElementById('sky');
  const ctx = canvas.getContext('2d');
  const counterEl = document.getElementById('counter');
  const countEl = document.getElementById('count');
  const unitEl = document.getElementById('unit');

  // Adding ?reset to the address wipes the save, handy while testing.
  if (new URLSearchParams(location.search).has('reset')) {
    Save.clear();
    history.replaceState(null, '', location.pathname); // tidy the address bar
  }

  // `state` is the game itself, and gets saved.
  const state = Save.load();

  // `view` is only about drawing (sizes, timers, sparks) and is never saved.
  const view = {
    width: 0,
    height: 0,
    cx: 0,            // centre of the screen, where the bit lives
    cy: 0,
    time: 0,          // seconds since the page opened
    birthStart: null, // when the birth animation began, or null if it isn't playing
    ignited: false,   // has the birth flash happened yet?
    brightness: state.bitOn ? 1 : CONFIG.offBrightness,
    particles: [],
    ripples: []
  };

  // ---------- screen size ----------

  // Match the canvas to the screen. On sharp (high-DPI) screens we draw at a
  // higher resolution so the glow doesn't look blurry, capped at 2x to stay fast on phones.
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    view.width = canvas.clientWidth;
    view.height = canvas.clientHeight;
    canvas.width = Math.round(view.width * dpr);
    canvas.height = Math.round(view.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // so we can keep thinking in normal screen pixels
    view.cx = view.width / 2;
    view.cy = view.height / 2;
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------- the counter ----------

  function showCounter() {
    countEl.textContent = state.bits.toLocaleString();
    unitEl.textContent = state.bits === 1 ? 'bit' : 'bits';
    counterEl.classList.add('visible');
  }

  // A returning player already has a bit, so show the counter straight away.
  if (state.sparked) showCounter();

  // ---------- tapping ----------

  function tap() {
    // The very first tap: the bit is born. This tap doesn't add to the counter.
    if (!state.sparked) {
      state.sparked = true;
      state.bitOn = true;
      view.brightness = 1;
      view.birthStart = view.time;
      view.ignited = false;
      Save.save(state);
      return;
    }

    // Ignore taps while the bit is still being born.
    if (view.birthStart !== null) return;

    // Every tap after that: flip the bit between 0 and 1, and earn bits.
    state.bitOn = !state.bitOn;
    state.bits += CONFIG.bitsPerTap;
    Render.ripple(view, 0.16, 46); // a soft, quiet ring
    showCounter();
    Save.save(state);
  }

  // Is the point (x, y) close enough to the bit to count as tapping it?
  function isOnBit(x, y) {
    const reach = Math.max(CONFIG.tapRadiusMin, Math.min(view.width, view.height) * CONFIG.tapRadiusScreenShare);
    return Math.hypot(x - view.cx, y - view.cy) <= reach;
  }

  // pointerdown covers mouse, touch and pen, and reacts instantly (no click delay on phones).
  canvas.addEventListener('pointerdown', function (event) {
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    if (isOnBit(event.clientX - rect.left, event.clientY - rect.top)) tap();
  });

  // Space or Enter works too, for keyboard players.
  window.addEventListener('keydown', function (event) {
    if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {
      event.preventDefault();
      tap();
    }
  });

  // Save when the player switches away or closes the tab.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') Save.save(state);
  });

  // ---------- the loop ----------

  // Runs about 60 times a second: move everything a little, then draw it.
  let last = performance.now();
  function frame(now) {
    // dt = seconds since the last frame. Capped so a long pause (tab hidden) doesn't cause a jump.
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    view.time += dt;

    // When the birth animation finishes, the bit is fully alive and the counter appears.
    if (view.birthStart !== null && view.time - view.birthStart >= CONFIG.birthSeconds) {
      view.birthStart = null;
      showCounter();
    }

    Render.update(view, state, dt);
    Render.draw(ctx, view, state);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
