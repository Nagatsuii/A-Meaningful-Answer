// main.js — starts the game, listens for taps, and runs the animation loop.
//
// How the bits work: together they count upward in binary, one step per tap (or per oscillator tick).
// With two bits that goes 00 → 01 → 10 → 11 → 00 ... When the rightmost bit rolls over from 1 to 0,
// it "carries" into its neighbour, and you see that carry travel along the thread as a pulse of light.
// Every bit that flips earns bits, so a step with a carry earns more.

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
  // Saves from the one-bit days stored "bitOn" instead of a number; convert it.
  if ('bitOn' in state) {
    state.value = state.bitOn ? 1 : 0;
    delete state.bitOn;
  }

  // `view` is only about drawing (sizes, timers, sparks) and is never saved.
  const view = {
    width: 0,
    height: 0,
    cx: 0,            // middle of the open sky; it shifts to make room for the menu
    cy: 0,
    time: 0,          // seconds since the page opened
    stars: [],        // one entry per bit; see makeStar below
    birth: null,      // { index, start, ignited } while a bit is being born
    particles: [],
    ripples: [],
    pulses: [],
    nextAmbient: 1,   // when the next quiet resting pulse sets off
    ambientForward: false,
    labelAlpha: 0,    // how visible the 0/1 labels under the bits are
    starScale: 1,     // stars shrink a little when packed tightly (phones with many bits)
    shapeFactor: state.byteFormed ? 0 : 1, // 1 = wandering constellation, 0 = the straight row of a byte
    ceremony: null    // { start, swept, noted } while the byte is forming
  };

  // Timers for the oscillators (automatic flipping).
  let flipProgress = 0;     // builds up to 1, then the oscillators step the counter once
  let lastVisibleFlip = 0;  // when the stars last visibly changed from an automatic step
  let saveTimer = 0;
  let uiTimer = 0;

  // Is the sky ready for play (first bit born, nothing being born right now)?
  function ready() {
    return state.sparked && view.birth === null && view.ceremony === null;
  }

  // ---------- the stars (one per bit) ----------

  // What bit number `index` currently reads in the counter: 0 or 1.
  function bitValue(index) {
    return Math.floor(state.value / Math.pow(2, index)) % 2;
  }

  // A star's drawing info. `shown` is what it displays right now; `pending` is what it will show
  // once any carry pulse heading its way arrives.
  function makeStar(index) {
    const on = state.sparked ? bitValue(index) : 0;
    return { x: 0, y: 0, shown: on, pending: on, brightness: on ? 1 : CONFIG.offBrightness };
  }

  // The gap between neighbouring bits: the full spacing on wide screens, tighter on narrow ones.
  function spacing() {
    const n = view.stars.length;
    if (n < 2) return CONFIG.bitSpacing;
    const skyWidth = view.cx * 2;
    const share = n > 2 ? 0.8 : 0.7; // a bigger constellation may use more of the width
    return Math.min(CONFIG.bitSpacing, (skyWidth * share) / (n - 1));
  }

  // Where star `index` should sit. Bits run right to left like a written binary number
  // (bit 0, the "ones" place, on the right), each nudged up or down by CONFIG.constellationShape.
  function starTarget(index) {
    const n = view.stars.length;
    const gap = spacing();
    // shapeFactor flattens the shape into a straight row when the byte forms.
    const nudge = (CONFIG.constellationShape[index] || 0) * view.shapeFactor;
    // Centre the shape vertically too, so the whole constellation sits in the middle of the sky.
    const shape = CONFIG.constellationShape.slice(0, n);
    const middle = (Math.min(...shape) + Math.max(...shape)) / 2 * view.shapeFactor;
    return {
      x: view.cx + ((n - 1) / 2 - index) * gap,
      y: view.cy + (nudge - middle) * gap
    };
  }

  // Move every star toward its spot. amount = 1 jumps straight there.
  function placeStars(amount) {
    view.starScale = Math.max(0.6, Math.min(1, spacing() / CONFIG.starScaleAt));
    view.stars.forEach((star, i) => {
      const t = starTarget(i);
      star.x += (t.x - star.x) * amount;
      star.y += (t.y - star.y) * amount;
    });
  }

  // Make the stars match the counter. Bit 0 changes straight away. A change in a higher bit
  // is a carry: it travels there as a pulse of light from its neighbour, chaining one after another.
  function syncStars() {
    view.stars.forEach((star, i) => {
      const want = bitValue(i);
      if (star.pending === want) return; // already showing it, or a pulse is on its way
      star.pending = want;
      if (i === 0) star.shown = want;
      else Render.sendPulse(view, i - 1, i, want, (i - 1) * CONFIG.carryPulseSeconds);
    });
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
    placeStars(1);
  }

  // ---------- counting and earning ----------

  function earn(amount) {
    state.bits += amount;
    state.lifetimeBits += amount;
  }

  // Count up by `steps` in binary. Returns how many bit flips that took in total.
  function countUp(steps) {
    const n = Upgrades.bitCount(state);
    const size = Math.pow(2, n); // how many different values n bits can show
    let flips = 0;
    if (steps <= 1000) {
      for (let k = 0; k < steps; k++) {
        // Adding 1 flips every 1 at the right-hand end to 0, then flips the next 0 to 1.
        // So the flips = (number of 1s in a row at the right) + 1, but never more than n.
        let ones = 0;
        while (ones < n && bitValue(ones) === 1) ones++;
        flips += Math.min(ones + 1, n);
        state.value = (state.value + 1) % size;
      }
    } else {
      // For huge numbers of steps (like coming back after hours away) use the average instead.
      flips = Math.round(steps * Upgrades.averageFlipsPerStep(state));
      state.value = (state.value + steps) % size;
    }
    return flips;
  }

  function tap() {
    // The very first tap: the bit is born. This tap doesn't add to the counter.
    if (!state.sparked) {
      state.sparked = true;
      state.value = 1;
      const star = view.stars[0];
      star.shown = star.pending = 1;
      star.brightness = 1;
      view.birth = { index: 0, start: view.time, ignited: false };
      Save.save(state);
      return;
    }

    // Ignore taps while a bit is being born.
    if (!ready()) return;

    // Every tap after that: count up by one, and earn bits for every bit that flipped.
    const flips = countUp(1);
    earn(Upgrades.bitsPerTap(state) * flips);
    syncStars();
    Render.ripple(view, 0, 0.16, 46); // a soft, quiet ring
    UI.refresh(state, true);
    Save.save(state);
  }

  function buy(id) {
    if (!ready() || !Upgrades.buy(state, id)) return;
    if (id === 'secondBit') {
      addBit();
    } else {
      Render.ripple(view, 0, 0.3, 80); // the bit glows a little wider when it gains something new
    }
    UI.refresh(state, true);
    Save.save(state);
  }

  // A new bit is born on the left of the others, and they glide aside to make room.
  function addBit() {
    view.stars.push(makeStar(view.stars.length));
    const index = view.stars.length - 1;
    const spot = starTarget(index);
    view.stars[index].x = spot.x;
    view.stars[index].y = spot.y;
    view.birth = { index: index, start: view.time, ignited: false };
  }

  // Bits 3 to 7 join by themselves once enough bits have been earned (see CONFIG.joinAt).
  // Only one is born at a time; if several are due (say, after a long time away) they arrive one by one.
  function checkForNewBits() {
    if (!ready()) return;
    if (Upgrades.bitCount(state) < Upgrades.bitsEarned(state)) {
      state.joinedBits = (state.joinedBits || 0) + 1;
      addBit();
      Save.save(state);
    } else if (Upgrades.bitCount(state) >= 8 && !state.byteFormed) {
      // All eight bits are here: the byte forms.
      view.ceremony = { start: view.time + CONFIG.byteDelaySeconds, swept: [], noted: false };
    }
  }

  // The byte forming, step by step. Times are seconds since the ceremony began.
  //   gather: the constellation straightens into a row, and a capsule of light draws around it
  //   sweep:  a wave of light runs through the bits, left to right, each one rippling as it passes
  //   rest:   the note appears, then play carries on
  function runCeremony() {
    const c = view.ceremony;
    if (!c) return;
    const t = view.time - c.start;
    if (t < 0) return;

    const gather = CONFIG.byteGatherSeconds;
    const sweep = CONFIG.byteSweepSeconds;
    const k = Math.min(1, t / gather);
    view.shapeFactor = 1 - k * k * (3 - 2 * k); // smooth start and stop

    // Ripple each bit as the wave passes it (the same timing render.js uses for the glow).
    const n = view.stars.length;
    for (let i = 0; i < n; i++) {
      if (!c.swept[i] && t >= byteWaveTime(i, n)) {
        c.swept[i] = true;
        Render.ripple(view, i, 0.18, 34);
      }
    }

    if (!c.noted && t >= gather + sweep * 0.7) {
      c.noted = true;
      UI.showNote('One byte.\nEight bits, working as one.\n256\u00a0possibilities: 0\u00a0to\u00a0255', 12);
    }

    if (t >= gather + sweep + CONFIG.byteRestSeconds) {
      view.ceremony = null;
      view.shapeFactor = 0;
      state.byteFormed = true;
      view.nextAmbient = view.time + 0.5;
      UI.refresh(state, true);
      Save.save(state);
    }
  }

  // When the wave of light reaches bit i: it starts at the leftmost (biggest) bit and runs right.
  function byteWaveTime(i, n) {
    return CONFIG.byteGatherSeconds * 0.85 + ((n - 1 - i) / (n - 1)) * CONFIG.byteSweepSeconds;
  }

  const NUMBER_WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight'];

  // Called when a birth animation ends.
  function birthFinished(index) {
    view.birth = null;
    const n = index + 1; // how many bits there are now
    if (n === 8) {
      // No note here: the byte forming has its own (see runCeremony).
    } else if (n === 2) {
      // "\n" starts a new line; "\u00a0" is a space that never breaks, so the four states stay together.
      UI.showNote('Two bits.\nFour possible states:\n00\u00a0·\u00a001\u00a0·\u00a010\u00a0·\u00a011', 10);
    } else if (n > 2) {
      // e.g. "Three bits. 8 possible states: 000 to 111"
      const states = Math.pow(2, n);
      UI.showNote(`${NUMBER_WORDS[n] || n} bits.\n${states} possible states:\n` +
        `${'0'.repeat(n)}\u00a0to\u00a0${'1'.repeat(n)}`, 10);
    }
    if (n >= 2) view.nextAmbient = view.time + 0.6; // a resting pulse follows straight after
    UI.refresh(state, true);
  }

  // Oscillators step the counter by themselves. Bits are earned for every flip,
  // but the stars only visibly change a few times a second so they stay calm to watch.
  function runOscillators(dt) {
    const rate = Upgrades.flipsPerSecond(state);
    if (rate <= 0 || !ready()) return;

    flipProgress += rate * dt;
    const steps = Math.floor(flipProgress);
    if (steps === 0) return;
    flipProgress -= steps;
    earn(countUp(steps) * CONFIG.upgrades.oscillator.bitsPerFlip);

    if (view.time - lastVisibleFlip >= 1 / CONFIG.maxVisibleFlipsPerSecond) {
      lastVisibleFlip = view.time;
      syncStars();
      Render.ripple(view, 0, 0.07, 34); // even quieter than a tap
    }
  }

  // Offline progress: the oscillators kept counting while the game wasn't running
  // (page closed, tab in the background, phone asleep). Give the player those bits now.
  function catchUp(secondsAway) {
    const rate = Upgrades.flipsPerSecond(state);
    if (rate <= 0 || !ready()) return;

    const maxSeconds = CONFIG.offlineMaxHours * 3600;
    const counted = Math.min(secondsAway, maxSeconds);
    flipProgress += rate * counted * CONFIG.offlineEfficiency;
    const steps = Math.floor(flipProgress);
    flipProgress -= steps;
    if (steps === 0) return;

    const earned = countUp(steps) * CONFIG.upgrades.oscillator.bitsPerFlip;
    earn(earned);
    syncStars(); // the bits show wherever all that counting left them

    if (secondsAway >= CONFIG.offlineMessageMinSeconds) {
      UI.showAway(secondsAway, earned, secondsAway > maxSeconds);
    }
    UI.refresh(state, true);
    Save.save(state);
  }

  // ---------- input ----------

  // How far is point (x, y) from the straight line between stars a and b?
  function distanceToThread(x, y, a, b) {
    // Find the closest point on the line from a to b, then measure the distance to it.
    const lx = b.x - a.x, ly = b.y - a.y;
    const length2 = lx * lx + ly * ly;
    const t = length2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * lx + (y - a.y) * ly) / length2)) : 0;
    return Math.hypot(x - (a.x + lx * t), y - (a.y + ly * t));
  }

  // Is the point (x, y) close enough to the bits to count as tapping them?
  // Anywhere near any star, or the threads between them, counts.
  function isOnBits(x, y) {
    const reach = Math.max(CONFIG.tapRadiusMin, Math.min(view.width, view.height) * CONFIG.tapRadiusScreenShare);
    const stars = view.stars;
    if (stars.length === 1) return Math.hypot(x - stars[0].x, y - stars[0].y) <= reach;
    for (let i = 0; i + 1 < stars.length; i++) {
      if (distanceToThread(x, y, stars[i], stars[i + 1]) <= reach) return true;
    }
    return false;
  }

  // pointerdown covers mouse, touch and pen, and reacts instantly (no click delay on phones).
  canvas.addEventListener('pointerdown', function (event) {
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    if (isOnBits(event.clientX - rect.left, event.clientY - rect.top)) tap();
  });

  // Space or Enter taps too, for keyboard players.
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

  view.byteWaveTime = byteWaveTime; // shared with render.js so the glow and the ripples line up

  // One star per bit (before the first tap there's one, waiting to be born).
  for (let i = 0; i < Upgrades.bitCount(state); i++) view.stars.push(makeStar(i));

  UI.build(buy);
  UI.refresh(state, ready());
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

    // Has a birth animation just finished?
    if (view.birth && view.time - view.birth.start >= CONFIG.birthSeconds) {
      birthFinished(view.birth.index);
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
    checkForNewBits();
    runCeremony();

    // Refresh the counter and menu a few times a second (often enough to look live, cheap on phones).
    uiTimer += dt;
    if (uiTimer >= 0.2 && ready()) {
      uiTimer = 0;
      UI.refresh(state, true);
    }

    // Save every few seconds while oscillators are earning.
    saveTimer += dt;
    if (saveTimer >= CONFIG.autoSaveSeconds) {
      saveTimer = 0;
      if (Upgrades.flipsPerSecond(state) > 0) Save.save(state);
    }

    // Glide the stars toward their spots (they move aside when the menu appears or a new bit joins).
    const centre = UI.skyCentre(view.width, view.height);
    const glide = 1 - Math.exp(-4 * dt);
    view.cx += (centre.x - view.cx) * glide;
    view.cy += (centre.y - view.cy) * glide;
    placeStars(1 - Math.exp(-3 * dt));

    Render.update(view, dt);
    Render.draw(ctx, view, state);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
