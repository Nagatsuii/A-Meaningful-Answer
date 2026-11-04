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
    labelAlpha: 0     // how visible the 0/1 labels under the bits are
  };

  // Timers for the oscillators (automatic flipping).
  let flipProgress = 0;     // builds up to 1, then the oscillators step the counter once
  let lastVisibleFlip = 0;  // when the stars last visibly changed from an automatic step
  let saveTimer = 0;
  let uiTimer = 0;

  // Is the sky ready for play (first bit born, nothing being born right now)?
  function ready() {
    return state.sparked && view.birth === null;
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

  // Where star `index` should sit: bits in a row across the middle of the sky,
  // bit 0 (the "ones" place) on the right, the way binary numbers are written.
  function starTarget(index) {
    const n = view.stars.length;
    const skyWidth = view.cx * 2;
    const spacing = n > 1 ? Math.min(CONFIG.bitSpacing, (skyWidth * 0.7) / (n - 1)) : 0;
    return { x: view.cx + ((n - 1) / 2 - index) * spacing, y: view.cy };
  }

  // Move every star toward its spot. amount = 1 jumps straight there.
  function placeStars(amount) {
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
      // A new bit is born on the left. The first bit glides aside to make room.
      view.stars.push(makeStar(view.stars.length));
      const index = view.stars.length - 1;
      const spot = starTarget(index);
      view.stars[index].x = spot.x;
      view.stars[index].y = spot.y;
      view.birth = { index: index, start: view.time, ignited: false };
    } else {
      Render.ripple(view, 0, 0.3, 80); // the bit glows a little wider when it gains something new
    }
    UI.refresh(state, true);
    Save.save(state);
  }

  // Called when a birth animation ends.
  function birthFinished(index) {
    view.birth = null;
    if (index === 1) {
      // "\n" starts a new line; "\u00a0" is a space that never breaks, so the four states stay together.
      UI.showNote('Two bits.\nFour possible states:\n00\u00a0·\u00a001\u00a0·\u00a010\u00a0·\u00a011', 10);
      view.nextAmbient = view.time + 0.6; // the first resting pulse follows straight after
    }
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

  // Is the point (x, y) close enough to the bits to count as tapping them?
  // Anywhere near the row of bits counts, including the thread between them.
  function isOnBits(x, y) {
    const reach = Math.max(CONFIG.tapRadiusMin, Math.min(view.width, view.height) * CONFIG.tapRadiusScreenShare);
    const a = view.stars[0];
    const b = view.stars[view.stars.length - 1];
    // Find the closest point on the line from a to b, then measure the distance to it.
    const lx = b.x - a.x, ly = b.y - a.y;
    const length2 = lx * lx + ly * ly;
    const t = length2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * lx + (y - a.y) * ly) / length2)) : 0;
    return Math.hypot(x - (a.x + lx * t), y - (a.y + ly * t)) <= reach;
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
