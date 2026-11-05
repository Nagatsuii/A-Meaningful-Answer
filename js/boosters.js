// boosters.js — clickable boosters that appear now and then while you play.
//
//   Lightning:   a jagged arc of light with a spark zipping along it. Tap it for a burst of bits.
//   Light pulse: a slow, breathing orb drifting through the sky. Tap it to multiply all production for a while.
//
// When they appear: on average every couple of minutes, more often the faster you've been tapping,
// but never sooner than CONFIG.boosters.minGapSeconds after the last one, and only one at a time.
// Each vanishes if it isn't tapped within a few seconds. All numbers are in CONFIG.boosters.
// Timings use game time (view.time), so the dev speed-up speeds them up too; tap rate uses real time.

const Boosters = (function () {
  const C = () => CONFIG.boosters;
  const LIGHTNING = [190, 230, 255]; // electric blue-white
  const PULSE = [255, 205, 235];     // soft rose-white light

  let active = null;        // the booster on screen, or null
  let lastSpawn = -Infinity; // game time the last one appeared
  let boost = null;         // { multiplier, endsAt, seconds } while a light pulse's boost runs
  const tapTimes = [];      // real times of recent taps, for the click rate
  const floaters = [];      // little rising "+123" / "×7" labels after a catch

  // ---------- the player's tapping speed ----------

  function noteTap() {
    tapTimes.push(performance.now() / 1000);
  }

  // Taps per second over the last few seconds (capped, so frantic tapping can't flood the screen).
  function clickRate() {
    const now = performance.now() / 1000;
    while (tapTimes.length && now - tapTimes[0] > C().clickRateWindowSeconds) tapTimes.shift();
    return Math.min(tapTimes.length / C().clickRateWindowSeconds, C().maxClickRate);
  }

  // ---------- the active multiplier ----------

  function multiplier(time) {
    return boost && time < boost.endsAt ? boost.multiplier : 1;
  }

  // Seconds of boost left (0 if none), and how long it lasts in total, for the on-screen timer.
  function boostLeft(time) {
    return boost && time < boost.endsAt ? boost.endsAt - time : 0;
  }

  function boostTotal() {
    return boost ? boost.seconds : 0;
  }

  // ---------- appearing ----------

  // Called every frame. `allowed` is false during births, ceremonies, the choice and the fall.
  // `onSpawn(kind)` is called when one appears (for its sound).
  let lastTime = 0; // the latest game time seen (for where())

  function update(view, dt, allowed, onSpawn) {
    lastTime = view.time;
    if (active && view.time - active.start > active.life) active = null; // missed: it fades away
    for (const f of floaters) f.age += dt;
    while (floaters.length && floaters[0].age > 1.6) floaters.shift();

    if (!allowed || active) return;
    if (view.time < C().firstAfterSeconds) return;
    if (view.time - lastSpawn < C().minGapSeconds) return; // the cap

    // A small chance each frame; faster tapping raises it. On average this gives one about every
    // averageWaitSeconds ÷ (1 + clickRateBoost × taps per second) after the minimum gap.
    const chance = dt * (1 + C().clickRateBoost * clickRate()) / C().averageWaitSeconds;
    if (Math.random() < chance) {
      spawn(view);
      onSpawn(active.kind);
    }
  }

  // A random point in the open sky, away from the counter at the top and the row of bits.
  function skyPoint(view) {
    const w = view.cx * 2, h = view.cy * 2;
    for (let tries = 0; tries < 20; tries++) {
      const x = 50 + Math.random() * (w - 100);
      const y = 150 + Math.random() * Math.max(10, h - 210);
      if (Math.abs(y - view.cy) > 90) return { x, y };
    }
    return { x: w * 0.5, y: Math.min(h - 60, view.cy + 140) };
  }

  function spawn(view) {
    lastSpawn = view.time;
    if (Math.random() < C().pulseChance) {
      const p = skyPoint(view);
      const angle = Math.random() * Math.PI * 2;
      active = { kind: 'pulse', start: view.time, life: C().pulseLifeSeconds,
        x: p.x, y: p.y, vx: Math.cos(angle) * 14, vy: Math.sin(angle) * 8 };
    } else {
      // An arc from one side of the sky to the other, at different heights.
      const a = skyPoint(view), b = skyPoint(view);
      const w = view.cx * 2;
      const from = { x: w * (0.08 + Math.random() * 0.1), y: a.y };
      const to = { x: w * (0.82 + Math.random() * 0.1), y: b.y };
      if (Math.random() < 0.5) [from.x, to.x] = [to.x, from.x];
      active = { kind: 'lightning', start: view.time, life: C().lightningLifeSeconds, from, to, points: jagged(from, to) };
    }
  }

  // A zig-zag path between two points, like a lightning bolt.
  function jagged(from, to) {
    const points = [];
    const n = 14;
    const len = Math.hypot(to.x - from.x, to.y - from.y);
    const nx = -(to.y - from.y) / len, ny = (to.x - from.x) / len; // sideways direction
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const wobble = (i === 0 || i === n) ? 0 : (Math.random() - 0.5) * 36;
      points.push({ x: from.x + (to.x - from.x) * t + nx * wobble, y: from.y + (to.y - from.y) * t + ny * wobble });
    }
    return points;
  }

  // Where a light pulse is right now (it drifts slowly).
  function pulsePosition(b, time) {
    const age = time - b.start;
    return { x: b.x + b.vx * age, y: b.y + b.vy * age + Math.sin(age * 1.3) * 6 };
  }

  // ---------- catching one ----------

  // Did a tap at (x, y) catch the booster? Returns its kind ('lightning' or 'pulse'), or null.
  // The reach is generous so it's easy to hit with a finger.
  function hit(view, x, y) {
    if (!active) return null;
    let caught = false;
    if (active.kind === 'pulse') {
      const p = pulsePosition(active, view.time);
      caught = Math.hypot(x - p.x, y - p.y) < 48;
    } else {
      for (let i = 0; i + 1 < active.points.length && !caught; i++) {
        caught = distanceToSegment(x, y, active.points[i], active.points[i + 1]) < 38;
      }
    }
    if (!caught) return null;
    const kind = active.kind;
    active = null;
    return kind;
  }

  function distanceToSegment(x, y, a, b) {
    const lx = b.x - a.x, ly = b.y - a.y;
    const l2 = lx * lx + ly * ly;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * lx + (y - a.y) * ly) / l2)) : 0;
    return Math.hypot(x - (a.x + lx * t), y - (a.y + ly * t));
  }

  // Start (or restart) a light pulse's boost.
  function startBoost(time) {
    boost = { multiplier: C().pulseMultiplier, endsAt: time + C().pulseSeconds, seconds: C().pulseSeconds };
  }

  // A little label that rises and fades where a booster was caught.
  function floatText(x, y, text, colour) {
    floaters.push({ x, y, text, colour, age: 0 });
  }

  // ---------- drawing ----------

  function draw(ctx, view) {
    const glow = Render.glow, rgba = Render.rgba;
    if (active) {
      const age = view.time - active.start;
      // Fade in quickly, and fade out over the last second.
      const vis = Math.min(1, age / 0.3) * Math.min(1, (active.life - age) / 1);

      if (active.kind === 'lightning') {
        // Every so often the bolt re-forms, so it crackles and flickers.
        if (Math.floor(age / 0.09) !== active.shape) {
          active.shape = Math.floor(age / 0.09);
          active.points = jagged(active.from, active.to);
        }
        const pts = active.points;
        for (const [width, alpha] of [[7, 0.12], [3, 0.35], [1.2, 0.95]]) { // soft halo, then the bright core
          ctx.lineWidth = width;
          ctx.strokeStyle = rgba(LIGHTNING, alpha * vis);
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (const p of pts) ctx.lineTo(p.x, p.y);
          ctx.stroke();
        }
        // A spark zipping along the bolt, back and forth.
        const run = (age / 0.6) % 2;
        const t = run < 1 ? run : 2 - run;
        const f = t * (pts.length - 1), i = Math.min(Math.floor(f), pts.length - 2), k = f - i;
        const sx = pts[i].x + (pts[i + 1].x - pts[i].x) * k, sy = pts[i].y + (pts[i + 1].y - pts[i].y) * k;
        glow(ctx, sx, sy, 16, [255, 255, 255], 0.8 * vis);
      } else {
        const p = pulsePosition(active, view.time);
        const breath = 0.5 + 0.5 * Math.sin(age * 3);
        glow(ctx, p.x, p.y, 40 + 8 * breath, PULSE, 0.25 * vis);
        glow(ctx, p.x, p.y, 14, PULSE, 0.8 * vis);
        // Rings spreading out from it.
        for (let r = 0; r < 2; r++) {
          const ring = ((age * 0.8 + r * 0.5) % 1);
          ctx.lineWidth = 1.2;
          ctx.strokeStyle = rgba(PULSE, 0.35 * (1 - ring) * vis);
          ctx.beginPath();
          ctx.arc(p.x, p.y, 14 + ring * 40, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }

    // Labels from recent catches.
    ctx.globalCompositeOperation = 'source-over';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '14px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
    for (const f of floaters) {
      ctx.fillStyle = rgba(f.colour, 1 - f.age / 1.6);
      ctx.fillText(f.text, f.x, f.y - f.age * 30);
    }
    ctx.globalCompositeOperation = 'lighter';
  }

  // Where to tap the booster on screen right now (or null): the middle of a bolt, or a pulse's centre.
  // Used by tests; the game itself doesn't need it.
  function where() {
    if (!active) return null;
    if (active.kind === 'pulse') return pulsePosition(active, lastTime);
    return active.points[Math.floor(active.points.length / 2)];
  }

  // Dev menu: make one appear right now (replacing any on screen).
  function force(view, kind) {
    const keep = CONFIG.boosters.pulseChance;
    CONFIG.boosters.pulseChance = kind === 'pulse' ? 1 : 0;
    spawn(view);
    CONFIG.boosters.pulseChance = keep;
  }

  return {
    force, where, noteTap, clickRate, multiplier, boostLeft, boostTotal, update, hit, startBoost, floatText, draw,
    activeKind: () => (active ? active.kind : null),
    colours: { lightning: LIGHTNING, pulse: PULSE }
  };
})();
