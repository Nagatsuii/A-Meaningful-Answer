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
  const params = new URLSearchParams(location.search);
  if (params.has('reset')) {
    Save.clear();
    // Tidy the address bar, keeping anything else (like ?speed=20) so a reload doesn't reset again.
    params.delete('reset');
    const rest = params.toString();
    history.replaceState(null, '', location.pathname + (rest ? '?' + rest : ''));
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
    ceremony: null,   // { start, swept, noted } while the byte is forming
    choice: null,     // { opened, chosen, chosenAt } while the Storage/Logic paths are showing
    choicePoints: null,
    track: state.track,
    branch: null,     // { which: 'then' or 'else', at } — the IF · THEN · ELSE branch that last ran
    hook: null,       // { start, quick, noted } once the hook has begun
    hookPoints: null, // where the locked doorway and the black hole sit
    holeNear: 0,      // 0 = the black hole is far away; 1 = close enough to fall into
    fall: null,       // { start, origins } while the stars spiral into the black hole
    starFade: 1       // the stars fade as they fall in
  };

  // Timers for the oscillators (automatic flipping).
  let flipProgress = 0;     // builds up to 1, then the oscillators step the counter once
  let lastVisibleFlip = 0;  // when the stars last visibly changed from an automatic step
  let saveTimer = 0;
  let lastStepCarried = false; // did the most recent counting step carry? (for the IF · THEN · ELSE display)
  let uiTimer = 0;

  // Is the sky ready for play (first bit born, nothing being born right now)?
  function ready() {
    return state.sparked && view.birth === null && view.ceremony === null && view.fall === null;
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

  // Add bits to the counter. Every way of earning comes through here, so the testing
  // speed-up (TEST_SPEED, from ?speed= in the address) only needs applying once. Returns what was added.
  function earn(amount) {
    // Knowledge from earlier universes multiplies everything, too.
    const added = amount * TEST_SPEED * Upgrades.knowledgeMultiplier(state);
    state.bits += added;
    state.lifetimeBits += added;
    return added;
  }

  // Count up by `steps` in binary, and work out what that earns.
  // perFlip: bits earned per bit flipped. source: 'tap' or 'osc' (some Logic gates only boost one kind).
  function countUp(steps, perFlip, source) {
    const size = Math.pow(2, Upgrades.bitCount(state)); // how many different values the bits can show
    let earned = 0;
    if (steps <= 1000) {
      // Count one step at a time (Upgrades.step works out what each step is worth).
      for (let k = 0; k < steps; k++) {
        const result = Upgrades.step(state, state.value, perFlip, source);
        state.value = result.next;
        earned += result.gain;
        lastStepCarried = result.carried;
        if (result.carried) state.stats.carries++;
        if (result.next === 0 && size === 256) state.stats.wraps++; // the byte rolled past 255
      }
    } else {
      // For huge numbers of steps (like coming back after hours away) use the average instead.
      earned = steps * Upgrades.averageStepEarning(state, perFlip, source);
      state.stats.carries += Math.floor(steps / 2);
      if (size === 256) state.stats.wraps += Math.floor((state.value + steps) / 256);
      state.value = (state.value + steps) % size;
    }
    return earned;
  }

  function tap() {
    // The very first tap: the bit is born. This tap doesn't add to the counter.
    if (!state.sparked) {
      if (view.time < CONFIG.darknessSeconds) return; // let the opening finish first
      state.sparked = true;
      state.value = 1;
      const star = view.stars[0];
      star.shown = star.pending = 1;
      star.brightness = 1;
      view.birth = { index: 0, start: view.time, ignited: false };
      Sound.bitBorn(0, CONFIG.birthSeconds * 0.3); // a note at the moment it ignites
      Save.save(state);
      return;
    }

    // Ignore taps while a bit is being born.
    if (!ready()) return;

    // Every tap after that: count up by one, and earn bits for every bit that flipped.
    state.stats.taps++;
    earn(countUp(1, Upgrades.bitsPerTap(state), 'tap'));
    syncStars();
    showBranch();
    Render.ripple(view, 0, 0.16, 46); // a soft, quiet ring
    // A soft tick that climbs in pitch during a fast streak; at the top, a burst of sparks.
    if (Sound.tap()) Render.sparkle(view, 0);
    UI.refresh(state, true);
    Save.save(state);
  }

  function buy(id) {
    const cost = Upgrades.cost(state, id);
    if (!ready() || !Upgrades.buy(state, id)) return;
    Sound.purchase(cost); // a zap of current; pricier upgrades crackle longer
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
    Sound.bitBorn(index, CONFIG.birthSeconds * 0.3); // each new bit rings its own note as it ignites
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
      // Each bit rings as the wave passes it, then all eight bloom into a chord as the note appears.
      const n = view.stars.length;
      const waves = view.stars.map((s, i) => CONFIG.byteDelaySeconds + byteWaveTime(i, n));
      Sound.byteChord(waves, CONFIG.byteDelaySeconds + CONFIG.byteGatherSeconds + CONFIG.byteSweepSeconds * 0.7);
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
    if (n === 2) Sound.firstPulse(0.6, CONFIG.ambientPulseTravel); // the very first pulse between bits sings
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
    earn(countUp(steps, CONFIG.upgrades.oscillator.bitsPerFlip, 'osc'));

    if (view.time - lastVisibleFlip >= 1 / CONFIG.maxVisibleFlipsPerSecond) {
      lastVisibleFlip = view.time;
      syncStars();
      showBranch();
      Render.ripple(view, 0, 0.07, 34); // even quieter than a tap
    }
  }

  // Memory cells (Storage track) earn a steady trickle of bits, always.
  function runMemory(dt) {
    if (ready()) earn(Upgrades.trickle(state) * dt);
  }

  // Offline progress: oscillators and memory cells kept working while the game wasn't running
  // (page closed, tab in the background, phone asleep). Give the player those bits now.
  // Storage upgrades make this count for longer (latches) and pay more (registers).
  function catchUp(secondsAway) {
    const rate = Upgrades.flipsPerSecond(state);
    const trickle = Upgrades.trickle(state);
    if ((rate <= 0 && trickle <= 0) || !ready()) return;

    const hours = Upgrades.offlineHours(state);
    const maxSeconds = hours * 3600;
    const counted = Math.min(secondsAway, maxSeconds) * Upgrades.offlineMultiplier(state);
    let earned = trickle * counted;
    flipProgress += rate * counted;
    const steps = Math.floor(flipProgress);
    flipProgress -= steps;
    if (steps > 0) earned += countUp(steps, CONFIG.upgrades.oscillator.bitsPerFlip, 'osc');
    if (earned <= 0) return;

    const added = earn(earned);
    syncStars(); // the bits show wherever all that counting left them

    if (secondsAway >= CONFIG.offlineMessageMinSeconds) {
      UI.showAway(secondsAway, Math.floor(added), secondsAway > maxSeconds, hours, trickle > 0);
    }
    UI.refresh(state, true);
    Save.save(state);
  }

  // Light up whichever branch of the IF · THEN · ELSE rule the last step took.
  function showBranch() {
    if (Upgrades.owned(state, 'ifThenElse') === 0) return;
    view.branch = { which: lastStepCarried ? 'then' : 'else', at: view.time };
  }

  // ---------- choosing Storage or Logic ----------

  // Once the byte has formed and enough bits are earned, two paths of light open below the byte.
  // Tapping one chooses that track first; the other dims and stays locked for now.
  function runChoice() {
    if (!view.choice && ready() && state.byteFormed && !state.track &&
        state.lifetimeBits >= CONFIG.trackChoiceAt) {
      view.choice = { opened: view.time, chosen: null, chosenAt: 0, noted: false };
      UI.showChoice(true);
      UI.showNote('Your byte can grow two ways.\nChoose which path to follow first.', 12);
    }
    const c = view.choice;
    if (!c) return;
    view.choicePoints = choicePoints();
    UI.placeChoice(view.choicePoints);

    if (c.chosen) {
      const t = view.time - c.chosenAt;
      // The chosen light reaches the byte: it ripples, and the note names the path.
      if (!c.noted && t >= 1.3) {
        c.noted = true;
        view.stars.forEach((s, i) => Render.ripple(view, i, 0.2, 40));
        UI.showNote(c.chosen === 'storage'
          ? 'Storage.\nInformation, kept.\nYour byte remembers, even while you are away.'
          : 'Logic.\nInformation, transformed.\nYour byte learns to make every flip count.', 10);
      }
      if (t >= CONFIG.choiceSettleSeconds) view.choice = null;
    }
  }

  function choose(track) {
    const c = view.choice;
    if (!c || c.chosen) return;
    c.chosen = track;
    c.chosenAt = view.time;
    state.track = track;
    UI.showChoice(false);
    UI.refresh(state, true);
    Save.save(state);
  }

  // Where the two paths start (just below the byte) and where their doorways sit.
  function choicePoints() {
    const xs = view.stars.map(s => s.x);
    const midX = (Math.min(...xs) + Math.max(...xs)) / 2;
    const midY = view.stars.reduce((sum, s) => sum + s.y, 0) / view.stars.length;
    // Start just below the byte's binary readout, so the paths don't cross it.
    const from = { x: midX, y: midY + CONFIG.bitHaloRadius * view.starScale + 66 };
    const skyBottom = view.cy * 2;                       // bottom of the open sky (above a phone's menu tab)
    const reach = Math.max(CONFIG.tapRadiusMin, Math.min(view.width, view.height) * CONFIG.tapRadiusScreenShare);
    const down = Math.min(Math.max(190, reach + 110), skyBottom - midY - 110);
    const across = Math.min(170, view.cx * 2 * 0.28);
    return {
      from: from,
      storage: { x: midX - across, y: midY + down },
      logic: { x: midX + across, y: midY + down }
    };
  }

  // ---------- the hook: a locked path and a distant dark shimmer ----------

  // The track the player didn't choose.
  function otherTrack() {
    return state.track === 'storage' ? 'logic' : 'storage';
  }

  function runHook() {
    if (!view.hook && ready() && state.track && (state.hookSeen || state.lifetimeBits >= CONFIG.hookAt)) {
      // First time: a slow reveal with a note. Returning players just see it fade in quickly.
      view.hook = { start: view.time, quick: !!state.hookSeen, noted: !!state.hookSeen };
      if (!state.hookSeen) {
        state.hookSeen = true;
        Save.save(state);
      }
    }
    const h = view.hook;
    if (!h) return;

    const skyWidth = view.cx * 2, skyHeight = view.cy * 2;
    view.hookPoints = {
      track: otherTrack(),
      door: choicePoints()[otherTrack()],
      // Far off in the upper left of the sky, clear of the counter and the notes under it.
      hole: { x: Math.max(40, skyWidth * 0.13), y: Math.max(200, skyHeight * 0.3) }
    };

    if (!h.noted && view.time - h.start >= CONFIG.hookShimmerDelay) {
      h.noted = true;
      UI.showNote('Far off, something dark\nis drawing in the light.', 12);
    }

    // Once the unlocking achievement's goal is met, the black hole slowly draws closer.
    const near = blackHoleOpen();
    view.holeNear += ((near ? 1 : 0) - view.holeNear) * (1 - Math.exp(-0.4 * (1 / 60)));
    if (near && !h.closeNoted) {
      h.closeNoted = true;
      if (!h.quick) UI.showNote('The dark has drawn close.\nTouch it when you are ready.', 12);
    }
  }

  // Can the player fall into the black hole yet? The hook must have appeared, and the unlocking
  // achievement's goal (Megabit: 1,048,576 bits) must be met in this universe. Achievements carry over
  // between universes, so it's the goal itself we check, not whether the achievement was ever earned.
  function blackHoleOpen() {
    return state.hookSeen && Achievements.byId(CONFIG.knowledge.unlockAchievement).done(state);
  }

  // ---------- the black hole reset ----------

  // The player has chosen to fall in: the stars spiral into the dark.
  function beginFall() {
    if (view.fall) return;
    view.fall = { start: view.time, origins: view.stars.map(s => ({ x: s.x, y: s.y })) };
    document.body.classList.add('falling');
    Sound.fall(CONFIG.knowledge.fallSeconds);
  }

  // Each star spirals inward, faster and faster, circling as it goes, and fades at the end.
  function runFall() {
    const f = view.fall;
    if (!f) return;
    const t = (view.time - f.start) / CONFIG.knowledge.fallSeconds;
    const hole = view.hookPoints.hole;
    view.stars.forEach((star, i) => {
      const o = f.origins[i];
      // Each star falls at its own pace (the nearest first) and curls round at its own rate,
      // so together they wind in like the arms of a spiral.
      const own = Math.max(0, Math.min(1, (t - i * 0.03) / (1 - 0.25)));
      // Distance closes steadily; the curl mostly happens near the end, close to the hole,
      // so the stars wind round it instead of sweeping off the edge of the screen.
      const dist = Math.hypot(o.x - hole.x, o.y - hole.y) * Math.pow(1 - own, 1.4);
      const curl = 2.2 + i * 0.55;
      const angle = Math.atan2(o.y - hole.y, o.x - hole.x) + Math.pow(own, 3) * curl;
      star.x = hole.x + Math.cos(angle) * dist;
      star.y = hole.y + Math.sin(angle) * dist;
    });
    view.starFade = 1 - Math.max(0, Math.min(1, (t - 0.7) / 0.3));
    if (view.time - f.start >= CONFIG.knowledge.fallSeconds + CONFIG.knowledge.darkSeconds) startNewUniverse();
  }

  // A new universe: everything starts again, except achievements and Knowledge (and the count of
  // universes, which turns the drone warm). The page reloads into the new universe's opening.
  function startNewUniverse() {
    const next = Save.fresh();
    next.knowledge = (state.knowledge || 0) + Upgrades.knowledgeFromFall(state);
    next.achievements = state.achievements;
    next.universesCompleted = (state.universesCompleted || 0) + 1;
    // Replace the old game completely, so nothing (like saving as the page closes) can bring it back.
    for (const key of Object.keys(state)) delete state[key];
    Object.assign(state, next);
    Save.save(state);
    view.fall = null;
    location.reload();
  }

  // Tapping the hook's two mysteries just gives a hint.
  function hookTapped(x, y) {
    const p = view.hookPoints;
    if (!view.hook || !p) return false;
    if (Math.hypot(x - p.hole.x, y - p.hole.y) < 40 * (1 + view.holeNear)) {
      if (!blackHoleOpen()) {
        UI.showNote('Not yet.\nIt is very far away.', 6);
        return true;
      }
      const gain = Upgrades.knowledgeFromFall(state);
      const total = (state.knowledge || 0) + gain;
      UI.confirmFall({
        gain: gain,
        total: total,
        multiplier: 1 + total * CONFIG.knowledge.bonusEach,
        universe: (state.universesCompleted || 0) + 2
      }, beginFall);
      return true;
    }
    if (Math.hypot(x - p.door.x, y - p.door.y) < 44) {
      const name = p.track === 'storage' ? 'Storage' : 'Logic';
      UI.showNote(`${name} is still locked.\nSomething bigger has to happen first.`, 7);
      return true;
    }
    return false;
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
    const x = event.clientX - rect.left, y = event.clientY - rect.top;
    if (hookTapped(x, y)) return;
    if (isOnBits(x, y)) tap();
  });

  // Space or Enter taps too, for keyboard players.
  // (Not when a menu button has focus, so Space/Enter can press that button instead.)
  window.addEventListener('keydown', function (event) {
    if (event.target.closest && event.target.closest('button, input')) return;
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
    if (document.visibilityState === 'hidden') {
      saveNow();
      Sound.suspend();
    } else {
      Sound.resume();
    }
  });

  // Browsers only allow sound after the player interacts, so wake the audio on the very first
  // touch, click or key press anywhere on the page.
  for (const kind of ['pointerdown', 'touchend', 'keydown']) {
    window.addEventListener(kind, Sound.unlock, { capture: true });
  }
  window.addEventListener('pagehide', saveNow);

  // ---------- start up ----------

  view.byteWaveTime = byteWaveTime; // shared with render.js so the glow and the ripples line up

  // One star per bit (before the first tap there's one, waiting to be born).
  for (let i = 0; i < Upgrades.bitCount(state); i++) view.stars.push(makeStar(i));

  UI.build(buy, choose, () => Sound.affordable());
  UI.refresh(state, ready());
  Achievements.check(state); // anything already earned in an older save counts, without a fanfare

  // A brand-new game opens in pitch black with the last words of the previous universe.
  // After a black-hole reset, the opening changes: warmer neon, "the data remembers", and the universe number.
  if (!state.sparked) {
    const opening = document.getElementById('opening');
    if (state.universesCompleted > 0) {
      opening.classList.add('warm');
      opening.innerHTML = '<span class="neon">the data remembers' +
        `<span class="neon-sub">universe ${state.universesCompleted + 1}</span></span>`;
    }
    opening.classList.add('play');
  }
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
    runMemory(dt);
    checkForNewBits();
    runCeremony();
    runChoice();
    runHook();
    view.track = state.track; // the resting pulse takes on the chosen track's colour
    view.labelsHidden = !!view.fall;

    // Sound: one drone note per bit, the clock ticking with the oscillators, and the drone's tone
    // (cold in the first universe, warm after a black-hole reset).
    Sound.setBits(state.sparked ? view.stars.length : 0);
    Sound.setWarm(state.universesCompleted > 0 || TEST_WARM);
    Sound.update(dt, ready() ? Upgrades.flipsPerSecond(state) : 0);
    view.showRule = Upgrades.owned(state, 'ifThenElse') > 0;

    // Refresh the counter and menu a few times a second (often enough to look live, cheap on phones).
    uiTimer += dt;
    if (uiTimer >= 0.2 && ready()) {
      uiTimer = 0;
      UI.refresh(state, true);
      // Newly earned achievements: announce each one with the signature chime.
      for (const a of Achievements.check(state)) {
        UI.showAchievement(a, () => Sound.achievement());
        Save.save(state);
      }
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
    if (view.fall) runFall();                // the stars are being drawn into the dark
    else placeStars(1 - Math.exp(-3 * dt));

    Render.update(view, dt);
    Render.draw(ctx, view, state);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
