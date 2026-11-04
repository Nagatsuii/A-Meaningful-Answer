// main.js — starts the game, listens for taps, and runs the animation loop.

(function () {
  const canvas = document.getElementById('sky');
  const ctx = canvas.getContext('2d');

  // Adding ?reset to the address wipes the save, handy while testing.
  if (new URLSearchParams(location.search).has('reset')) {
    Save.clear();
    history.replaceState(null, '', location.pathname); // tidy the address bar
  }

  // `state` is the game itself, and gets saved.
  const state = Save.load();
  // Saves from before upgrades existed didn't track lifetime bits, so start them from the current count.
  state.lifetimeBits = Math.max(state.lifetimeBits, state.bits);

  // `view` is only about drawing (sizes, timers, sparks) and is never saved.
  const view = {
    width: 0,
    height: 0,
    cx: 0,            // where the bit is drawn; it glides to make room for the menu
    cy: 0,
    time: 0,          // seconds since the page opened
    birthStart: null, // when the birth animation began, or null if it isn't playing
    ignited: false,   // has the birth flash happened yet?
    brightness: state.bitOn ? 1 : CONFIG.offBrightness,
    particles: [],
    ripples: []
  };

  // Timers for the oscillators (automatic flipping).
  let flipProgress = 0;     // builds up to 1, then one automatic flip happens
  let lastVisibleFlip = 0;  // when the star last visibly blinked from an automatic flip
  let saveTimer = 0;
  let uiTimer = 0;

  // Is the first bit alive and finished being born?
  function bitIsAlive() {
    return state.sparked && view.birthStart === null;
  }

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
    const centre = UI.skyCentre(view.width, view.height);
    view.cx = centre.x;
    view.cy = centre.y;
  }

  // ---------- earning bits ----------

  function earn(amount) {
    state.bits += amount;
    state.lifetimeBits += amount;
  }

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
    if (!bitIsAlive()) return;

    // Every tap after that: flip the bit between 0 and 1, and earn bits.
    state.bitOn = !state.bitOn;
    earn(Upgrades.bitsPerTap(state));
    Render.ripple(view, 0.16, 46); // a soft, quiet ring
    UI.refresh(state, true);
    Save.save(state);
  }

  function buy(id) {
    if (!Upgrades.buy(state, id)) return;
    Render.ripple(view, 0.3, 80); // the bit glows a little wider when it gains something new
    UI.refresh(state, true);
    Save.save(state);
  }

  // Oscillators flip the bit by themselves. Bits are earned for every flip,
  // but the star only visibly blinks a few times a second so it stays calm to watch.
  function runOscillators(dt) {
    const rate = Upgrades.flipsPerSecond(state);
    if (rate <= 0 || !bitIsAlive()) return;

    flipProgress += rate * dt;
    const flips = Math.floor(flipProgress);
    if (flips === 0) return;
    flipProgress -= flips;
    earn(flips * CONFIG.upgrades.oscillator.bitsPerFlip);

    if (view.time - lastVisibleFlip >= 1 / CONFIG.maxVisibleFlipsPerSecond) {
      lastVisibleFlip = view.time;
      state.bitOn = !state.bitOn;
      Render.ripple(view, 0.07, 34); // even quieter than a tap
    }
  }

  // Offline progress: the oscillators kept flipping while the game wasn't running
  // (page closed, tab in the background, phone asleep). Give the player those bits now.
  function catchUp(secondsAway) {
    const rate = Upgrades.flipsPerSecond(state);
    if (rate <= 0 || !bitIsAlive()) return;

    const maxSeconds = CONFIG.offlineMaxHours * 3600;
    const counted = Math.min(secondsAway, maxSeconds);
    flipProgress += rate * counted * CONFIG.offlineEfficiency;
    const flips = Math.floor(flipProgress);
    flipProgress -= flips;
    if (flips === 0) return;

    const earned = flips * CONFIG.upgrades.oscillator.bitsPerFlip;
    earn(earned);
    // An odd number of flips leaves the bit the other way round from how you left it.
    if (flips % 2 === 1) state.bitOn = !state.bitOn;

    if (secondsAway >= CONFIG.offlineMessageMinSeconds) {
      UI.showAway(secondsAway, earned, secondsAway > maxSeconds);
    }
    UI.refresh(state, true);
    Save.save(state);
  }

  // ---------- input ----------

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

  // Space or Enter toggles too, for keyboard players.
  // (Not when a menu button has focus, so Space/Enter can press that button instead.)
  window.addEventListener('keydown', function (event) {
    if (event.target.closest && event.target.closest('button')) return;
    if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {
      event.preventDefault();
      tap();
    }
  });

  // Save when the player switches away or closes the tab.
  function saveNow() {
    state.lastSeen = Date.now();
    Save.save(state);
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') saveNow();
  });
  window.addEventListener('pagehide', saveNow);

  // ---------- start up ----------

  UI.build(buy);
  UI.refresh(state, bitIsAlive());
  window.addEventListener('resize', resize);
  resize();

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
      UI.refresh(state, true);
    }

    // How much real time has passed since the last frame? Usually a tiny fraction of a second.
    // If it's longer (the game was closed, hidden, or the phone slept), catch up on what was missed.
    const clock = Date.now();
    if (state.lastSeen !== null) {
      const away = (clock - state.lastSeen) / 1000;
      if (away > 1) catchUp(away); // a negative number (clock moved back) is simply ignored
    }
    state.lastSeen = clock;

    runOscillators(dt);

    // Refresh the counter and menu a few times a second (often enough to look live, cheap on phones).
    uiTimer += dt;
    if (uiTimer >= 0.2 && bitIsAlive()) {
      uiTimer = 0;
      UI.refresh(state, true);
    }

    // Save every few seconds while oscillators are earning.
    saveTimer += dt;
    if (saveTimer >= CONFIG.autoSaveSeconds) {
      saveTimer = 0;
      if (Upgrades.flipsPerSecond(state) > 0) Save.save(state);
    }

    // Glide the bit toward the middle of the open sky (it moves aside when the menu appears or slides up).
    const centre = UI.skyCentre(view.width, view.height);
    const glide = 1 - Math.exp(-4 * dt);
    view.cx += (centre.x - view.cx) * glide;
    view.cy += (centre.y - view.cy) * glide;

    Render.update(view, state, dt);
    Render.draw(ctx, view, state);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
