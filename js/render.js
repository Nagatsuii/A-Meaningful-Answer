// render.js — everything you see is drawn here, in code, on the canvas.
// No image files: the bits, their glow, the threads of light and the pulses are all gradients and circles.
//
// The bits are kept in view.stars. Star 0 is the rightmost bit (the "ones" place in binary),
// star 1 sits to its left, and so on, the same order you'd write a binary number.

const Render = (function () {
  // If the player's device asks for less motion, we keep effects gentler.
  const calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Colours as [red, green, blue]. A bit is cool blue when it reads 0
  // and warm white when it reads 1, so you can see its value at a glance.
  const COLOUR_OFF = [140, 170, 255];
  const COLOUR_ON = [255, 240, 215];
  const COLOUR_HINT = [170, 200, 255];
  // Pulse colours carry meaning. A carry (a 1 being passed along while counting) is warm gold;
  // the quiet resting pulse is pale blue. Later knowledge kinds (logic, storage) get their own hues.
  const COLOUR_CARRY = [255, 214, 150];
  const COLOUR_AMBIENT = [160, 190, 255];
  // The two tracks: Storage (keeping information) is calm teal; Logic (transforming it) is soft violet.
  // Once a track is chosen, the resting pulse takes on its colour.
  const TRACK_COLOURS = { storage: [110, 225, 215], logic: [190, 150, 255] };
  const BACKGROUND = '#04050a';
  const FONT = 'ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';

  // ---------- small helpers ----------

  // Keep a number between 0 and 1.
  function clamp01(n) {
    return Math.max(0, Math.min(1, n));
  }

  // Blend two colours: amount 0 gives a, amount 1 gives b.
  function mix(a, b, amount) {
    return [0, 1, 2].map(i => Math.round(a[i] + (b[i] - a[i]) * amount));
  }

  function rgba(colour, alpha) {
    return `rgba(${colour[0]}, ${colour[1]}, ${colour[2]}, ${clamp01(alpha)})`;
  }

  // Smooth start and smooth stop, for things that travel.
  function easeInOut(t) {
    return t * t * (3 - 2 * t);
  }

  // A soft round glow: bright in the middle, fading to nothing at the edge.
  function glow(ctx, x, y, radius, colour, alpha) {
    if (radius <= 0 || alpha <= 0) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, rgba(colour, alpha));
    g.addColorStop(0.4, rgba(colour, alpha * 0.35));
    g.addColorStop(1, rgba(colour, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---------- effects that live for a moment ----------

  // A burst of tiny sparks flying outward from (x, y), used when a bit is born.
  function burst(view, x, y, count) {
    const n = calm ? Math.round(count / 3) : count;
    for (let i = 0; i < n; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 110; // pixels per second
      const life = 1.2 + Math.random() * 1.6; // seconds
      view.particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: life,
        maxLife: life,
        size: 0.6 + Math.random() * 1.2
      });
    }
  }

  // A faint ring of light spreading out from a star.
  function ripple(view, starIndex, strength, size) {
    view.ripples.push({ star: starIndex, start: view.time, strength: strength, size: size });
  }

  // Send a pulse of light along the thread from one star to its neighbour.
  // `value` is what the receiving bit becomes when the pulse arrives (0 or 1),
  // or null for a resting pulse that changes nothing. `delay` lets carries chain one after another.
  // `duration` is optional; carries use CONFIG.carryPulseSeconds.
  function sendPulse(view, from, to, value, delay, duration) {
    const carry = value !== null;
    view.pulses.push({
      from: from,
      to: to,
      value: value,
      start: view.time + (delay || 0),
      duration: duration || CONFIG.carryPulseSeconds,
      colour: carry ? COLOUR_CARRY : (TRACK_COLOURS[view.track] || COLOUR_AMBIENT),
      strength: carry ? 0.9 : 0.35
    });
  }

  // ---------- each frame: move things ----------

  function update(view, dt) {
    // Ease each bit's brightness toward 1 or 0, so flips fade softly instead of snapping.
    const step = 1 - Math.exp(-CONFIG.toggleEaseSpeed * dt);
    for (const star of view.stars) {
      const target = star.shown ? 1 : CONFIG.offBrightness;
      star.brightness += (target - star.brightness) * step;
    }

    // Move sparks and slow them down, like drifting dust.
    const drag = Math.exp(-1.6 * dt);
    for (const p of view.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= drag;
      p.vy *= drag;
      p.life -= dt;
    }
    view.particles = view.particles.filter(p => p.life > 0);

    // Ripples last 1.2 seconds.
    view.ripples = view.ripples.filter(r => view.time - r.start < 1.2);

    updateSpecks(view, dt);

    // When a carry pulse reaches its bit, that bit flips.
    for (const pulse of view.pulses) {
      if (view.time - pulse.start < pulse.duration) continue;
      pulse.done = true;
      const star = view.stars[pulse.to];
      if (pulse.value !== null && star) {
        star.shown = pulse.value;
        ripple(view, pulse.to, 0.14, 40);
      }
    }
    view.pulses = view.pulses.filter(p => !p.done);

    // Once there are two or more bits, a quiet pulse drifts between them now and then,
    // back and forth: information always moving, even at rest.
    const resting = view.stars.length >= 2 && view.birth === null && view.ceremony === null;
    if (resting && view.time >= view.nextAmbient) {
      view.nextAmbient = view.time + CONFIG.ambientPulseSeconds;
      view.ambientForward = !view.ambientForward;
      // The pulse hops along the threads from star to star, pausing softly at each one.
      const last = view.stars.length - 1;
      const hop = CONFIG.ambientPulseTravel / last;
      for (let k = 0; k < last; k++) {
        const from = view.ambientForward ? k : last - k;
        const to = view.ambientForward ? k + 1 : last - k - 1;
        sendPulse(view, from, to, null, k * hop, hop);
      }
    }

    // The little 0/1 labels under the bits fade in once there's more than one bit.
    const labelTarget = resting ? 1 : 0;
    view.labelAlpha += (labelTarget - view.labelAlpha) * (1 - Math.exp(-1.5 * dt));
  }

  // ---------- each frame: draw things ----------

  // The faint, slowly breathing glow that shows where to tap.
  // `strength` 0..1 lets it fade in or out.
  function drawHint(ctx, view, x, y, strength) {
    const breath = 0.5 + 0.5 * Math.sin((view.time / CONFIG.hintPulseSeconds) * Math.PI * 2);
    const alpha = strength * (0.08 + 0.10 * breath);
    glow(ctx, x, y, CONFIG.hintRadius, COLOUR_HINT, alpha);
    // A tiny point at the centre, so the eye knows exactly where to aim.
    ctx.fillStyle = rgba(COLOUR_HINT, alpha * 2.2);
    ctx.beginPath();
    ctx.arc(x, y, 1.1, 0, Math.PI * 2);
    ctx.fill();
  }

  // One bit, drawn as a small star.
  // brightness: 0..1, sizeBoost: makes it swell during birth, alpha: overall visibility.
  function drawStar(ctx, view, x, y, brightness, sizeBoost, alpha) {
    // How "on" the bit looks, from 0 (off) to 1 (on), used to blend its colour.
    const onness = clamp01((brightness - CONFIG.offBrightness) / (1 - CONFIG.offBrightness));
    const colour = mix(COLOUR_OFF, COLOUR_ON, onness);

    // A slow, gentle twinkle so the star feels alive even when nothing is happening.
    // Each star twinkles slightly out of step with the others (x is used as a seed).
    const seed = x * 0.013;
    const twinkle = calm ? 1 : 1 + 0.05 * Math.sin(view.time * 1.7 + seed) + 0.03 * Math.sin(view.time * 3.1 + seed);
    const b = brightness * twinkle * alpha;

    const halo = CONFIG.bitHaloRadius * sizeBoost * view.starScale;
    const core = CONFIG.bitCoreRadius * Math.sqrt(sizeBoost) * Math.max(0.75, view.starScale);

    // Outer halo, then a tighter inner glow.
    glow(ctx, x, y, halo, colour, 0.32 * b);
    glow(ctx, x, y, core * 3.2, colour, 0.75 * b);

    // Thin light rays, like a star seen through a telescope.
    const ray = halo * 0.95;
    ctx.lineWidth = 1;
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      const g = ctx.createLinearGradient(x - dx * ray, y - dy * ray, x + dx * ray, y + dy * ray);
      g.addColorStop(0, rgba(colour, 0));
      g.addColorStop(0.5, rgba(colour, 0.35 * b));
      g.addColorStop(1, rgba(colour, 0));
      ctx.strokeStyle = g;
      ctx.beginPath();
      ctx.moveTo(x - dx * ray, y - dy * ray);
      ctx.lineTo(x + dx * ray, y + dy * ray);
      ctx.stroke();
    }

    // The bright centre.
    ctx.fillStyle = rgba([255, 255, 255], 0.55 + 0.45 * b);
    ctx.globalAlpha = clamp01(alpha);
    ctx.beginPath();
    ctx.arc(x, y, core * (0.7 + 0.3 * brightness), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // A thread of light between two stars. `grow` 0..1 draws it part of the way, for when it first forms.
  function drawThread(ctx, a, b, grow) {
    if (grow <= 0) return;
    const ex = a.x + (b.x - a.x) * grow;
    const ey = a.y + (b.y - a.y) * grow;
    const g = ctx.createLinearGradient(a.x, a.y, ex, ey);
    g.addColorStop(0, rgba(COLOUR_HINT, 0));
    g.addColorStop(0.2, rgba(COLOUR_HINT, 0.14));
    g.addColorStop(0.8, rgba(COLOUR_HINT, 0.14));
    g.addColorStop(1, rgba(COLOUR_HINT, grow < 1 ? 0.3 : 0)); // the growing tip glows brighter
    ctx.strokeStyle = g;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(ex, ey);
    ctx.stroke();
  }

  // Pulses: little lights travelling along threads, each with a short fading tail.
  function drawPulses(ctx, view) {
    for (const pulse of view.pulses) {
      const t = (view.time - pulse.start) / pulse.duration;
      if (t < 0) continue; // still waiting for its turn in a chain of carries
      const a = view.stars[pulse.from];
      const b = view.stars[pulse.to];
      if (!a || !b) continue;
      for (let k = 0; k < 5; k++) {
        const tk = easeInOut(clamp01(t - k * 0.035));
        const x = a.x + (b.x - a.x) * tk;
        const y = a.y + (b.y - a.y) * tk;
        glow(ctx, x, y, 7 - k, pulse.colour, pulse.strength * (1 - k / 5) * 0.8);
      }
    }
  }

  function drawParticles(ctx, view) {
    for (const p of view.particles) {
      const a = p.life / p.maxLife;
      glow(ctx, p.x, p.y, p.size * 4, COLOUR_ON, 0.5 * a);
    }
  }

  function drawRipples(ctx, view) {
    for (const r of view.ripples) {
      const star = view.stars[r.star];
      if (!star) continue;
      const t = (view.time - r.start) / 1.2;       // 0 → 1 over the ripple's life
      const eased = 1 - Math.pow(1 - t, 3);        // fast at first, then slowing
      const radius = CONFIG.bitCoreRadius + eased * r.size;
      ctx.strokeStyle = rgba(COLOUR_HINT, r.strength * (1 - t));
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(star.x, star.y, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // A rounded outline (a capsule) drawn with straight lines and corner arcs.
  function capsulePath(ctx, left, top, right, bottom, r) {
    ctx.beginPath();
    ctx.moveTo((left + right) / 2, top);         // start at the top middle...
    ctx.arcTo(right, top, right, bottom, r);      // ...and go round clockwise
    ctx.arcTo(right, bottom, left, bottom, r);
    ctx.arcTo(left, bottom, left, top, r);
    ctx.arcTo(left, top, right, top, r);
    ctx.closePath();
  }

  // The byte: a capsule of light around all eight bits, showing they now work as one.
  // While the byte is forming, the capsule draws itself in and a wave of light runs through the bits.
  function drawByte(ctx, view, state) {
    const c = view.ceremony;
    if (!state.byteFormed && !c) return;
    const t = c ? view.time - c.start : Infinity; // seconds into the ceremony (or long finished)
    if (t < 0) return;

    const stars = view.stars;
    const gather = CONFIG.byteGatherSeconds;
    const sweep = CONFIG.byteSweepSeconds;

    // The capsule: from the leftmost star to the rightmost, with room for the 0/1 labels below.
    const xs = stars.map(s => s.x);
    const midY = stars.reduce((sum, s) => sum + s.y, 0) / stars.length;
    const gap = stars.length > 1 ? Math.abs(stars[0].x - stars[1].x) : 40;
    const halo = CONFIG.bitHaloRadius * view.starScale;
    const left = Math.min(...xs) - gap * 0.55;
    const right = Math.max(...xs) + gap * 0.55;
    const top = midY - halo - 6;
    const bottom = midY + halo + 26;
    const r = Math.min((bottom - top) / 2, 26);

    // How much of the outline is drawn (0 to 1), and how bright it is.
    const draw = clamp01((t - gather * 0.45) / (gather * 0.55 + sweep * 0.4));
    const settle = clamp01((t - gather - sweep) / 2); // after the wave, it calms down
    const breath = 0.5 + 0.5 * Math.sin(view.time * 0.6);
    const alpha = 0.36 - 0.2 * settle + 0.03 * breath;

    const perimeter = 2 * (right - left - 2 * r) + 2 * (bottom - top - 2 * r) + 2 * Math.PI * r;
    ctx.setLineDash([perimeter * draw, perimeter]);
    ctx.lineWidth = 1;
    // Once a track is chosen, the byte's outline is tinted with its colour.
    const outline = TRACK_COLOURS[state.track] ? mix(COLOUR_ON, TRACK_COLOURS[state.track], 0.6) : COLOUR_ON;
    ctx.strokeStyle = rgba(outline, alpha);
    capsulePath(ctx, left, top, right, bottom, r);
    ctx.stroke();
    ctx.setLineDash([]);

    // The wave: each star glows brightly for a moment as it passes.
    if (c) {
      stars.forEach((s, i) => {
        const d = (t - view.byteWaveTime(i, stars.length)) / 0.22;
        const wave = Math.exp(-d * d);
        glow(ctx, s.x, s.y, halo * 1.8, COLOUR_ON, 0.55 * wave);
      });
    }
  }

  // A point along a gentle curve from `a` to `b` (t from 0 to 1). The curve leaves `a`
  // sideways and then drops toward `b`, like light spilling out of the byte.
  function curvePoint(a, b, t) {
    const cx = b.x, cy = a.y; // the bend
    const u = 1 - t;
    return {
      x: u * u * a.x + 2 * u * t * cx + t * t * b.x,
      y: u * u * a.y + 2 * u * t * cy + t * t * b.y
    };
  }

  // The Storage or Logic choice: two paths of light open from the byte, each ending in a doorway.
  // After a choice, the chosen light flows up into the byte and the other path fades away.
  function drawChoice(ctx, view) {
    const c = view.choice;
    const p = view.choicePoints;
    if (!c || !p) return;
    const open = easeInOut(clamp01((view.time - c.opened) / CONFIG.choiceOpenSeconds));
    const since = c.chosen ? view.time - c.chosenAt : 0;
    const breath = 0.5 + 0.5 * Math.sin(view.time * 1.3);

    for (const track of ['storage', 'logic']) {
      const colour = TRACK_COLOURS[track];
      const door = p[track];
      // How visible this path is: full while choosing; the chosen one glows then fades, the other fades sooner.
      let visible = 1;
      if (c.chosen === track) visible = since < 1.3 ? 1 : clamp01(1 - (since - 1.3) / 1.6);
      else if (c.chosen) visible = clamp01(1 - since / 1.1);
      if (visible <= 0) continue;

      // The path: drawn as a chain of short glowing segments, growing out of the byte as it opens.
      const segments = 28;
      ctx.lineWidth = 1.2;
      for (let i = 0; i < segments; i++) {
        const t0 = i / segments, t1 = (i + 1) / segments;
        if (t1 > open) break;
        const a = curvePoint(p.from, door, t0), b = curvePoint(p.from, door, t1);
        ctx.strokeStyle = rgba(colour, (0.12 + 0.28 * t1) * visible); // brighter toward the door
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }

      // The doorway: a softly breathing glow at the end of the path.
      if (open >= 1) {
        const lit = c.chosen === track ? 1.4 : 1;
        glow(ctx, door.x, door.y, 30, colour, (0.22 + 0.12 * breath) * visible * lit);
        glow(ctx, door.x, door.y, 7, colour, 0.8 * visible);
      } else {
        // While opening, a bright tip leads the path.
        const tip = curvePoint(p.from, door, open);
        glow(ctx, tip.x, tip.y, 8, colour, 0.6);
      }

      // The chosen light travels back along its path into the byte.
      if (c.chosen === track && since < 1.3) {
        const t = 1 - easeInOut(since / 1.3);
        for (let k = 0; k < 5; k++) {
          const q = curvePoint(p.from, door, Math.min(1, t + k * 0.03));
          glow(ctx, q.x, q.y, 9 - k, colour, 0.9 * (1 - k / 5));
        }
      }
    }
  }

  // ---------- the hook ----------

  // How visible the locked doorway and the black hole are, from 0 to 1.
  function hookVisibility(view) {
    const h = view.hook;
    if (!h) return { door: 0, hole: 0 };
    const t = view.time - h.start;
    if (h.quick) return { door: clamp01(t / 2), hole: clamp01(t / 3) };
    return {
      door: clamp01(t / CONFIG.hookDoorSeconds),
      hole: clamp01((t - CONFIG.hookShimmerDelay) / CONFIG.hookShimmerSeconds)
    };
  }

  // Specks of light slowly spiralling into the black hole, like information falling in.
  // Each speck has an angle and a distance; it circles faster and fades as it nears the centre.
  function updateSpecks(view, dt) {
    if (!view.hookPoints) return;
    if (!view.specks) view.specks = [];
    const r = CONFIG.blackHoleRadius;
    while (view.specks.length < CONFIG.blackHoleSpecks) {
      view.specks.push({ angle: Math.random() * Math.PI * 2, dist: r * (1.8 + Math.random() * 4) });
    }
    for (const s of view.specks) {
      s.angle += dt * 9 / s.dist * (calm ? 0.4 : 1); // closer = faster, like a real orbit
      s.dist -= dt * (1.2 + 14 / s.dist);
      if (s.dist < r * 1.05) {                       // fallen in: start again far out
        s.angle = Math.random() * Math.PI * 2;
        s.dist = r * (4.5 + Math.random() * 1.5);
      }
    }
  }

  // The black hole: a tiny disc darker than the sky, a faint shimmering ring of light around it,
  // and specks spiralling in. Drawn very dim, because it's far away.
  function drawBlackHole(ctx, view, visible) {
    if (visible <= 0) return;
    const { x, y } = view.hookPoints.hole;
    const r = CONFIG.blackHoleRadius;
    const ringColour = [200, 170, 255];

    // A very faint haze around it.
    glow(ctx, x, y, r * 5, [120, 100, 200], 0.06 * visible);

    // The ring: many short arcs, each brightening and dimming in a slow ripple around the circle.
    const pieces = 36;
    ctx.lineWidth = 1.4;
    for (let i = 0; i < pieces; i++) {
      const a0 = (i / pieces) * Math.PI * 2;
      const a1 = ((i + 1) / pieces) * Math.PI * 2;
      const ripple = 0.5 + 0.5 * Math.sin(a0 * 3 + view.time * (calm ? 0.3 : 0.8));
      ctx.strokeStyle = rgba(ringColour, (0.08 + 0.3 * ripple) * visible);
      ctx.beginPath();
      ctx.arc(x, y, r * 1.45, a0, a1);
      ctx.stroke();
    }

    // Specks falling in.
    for (const s of view.specks || []) {
      const fade = clamp01((s.dist - r) / (r * 1.5)) * clamp01((r * 6 - s.dist) / (r * 1.5));
      const sx = x + Math.cos(s.angle) * s.dist;
      const sy = y + Math.sin(s.angle) * s.dist * 0.55; // squashed into a tilted disc
      glow(ctx, sx, sy, 2.5, ringColour, 0.45 * fade * visible);
    }

    // The dark centre, painted normally (not as light) so it is darker than the sky around it.
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(0, 0, 0, ${0.9 * visible})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
  }

  // The path you didn't choose: a faint, slowly breathing doorway with its name.
  function drawLockedDoor(ctx, view, visible) {
    if (visible <= 0) return;
    const p = view.hookPoints;
    const colour = TRACK_COLOURS[p.track];
    const breath = 0.5 + 0.5 * Math.sin(view.time * 0.7);
    glow(ctx, p.door.x, p.door.y, 30, colour, (0.06 + 0.06 * breath) * visible);
    glow(ctx, p.door.x, p.door.y, 5, colour, 0.35 * visible);
    ctx.font = `11px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = rgba(colour, (0.18 + 0.1 * breath) * visible);
    ctx.fillText(p.track === 'storage' ? 'S T O R A G E' : 'L O G I C', p.door.x, p.door.y + 30);
  }

  function drawHook(ctx, view) {
    if (!view.hook || !view.hookPoints) return;
    const v = hookVisibility(view);
    drawBlackHole(ctx, view, v.hole);
    drawLockedDoor(ctx, view, v.door);
  }

  // The 0 or 1 under each bit, so you can read the binary number.
  // With three or more bits, the whole number is also written out below, with its everyday value:
  // e.g. "0101 = 5".
  function drawLabels(ctx, view) {
    if (view.labelAlpha < 0.01) return;
    const below = CONFIG.bitHaloRadius * view.starScale + 8;
    ctx.font = `${view.starScale < 0.8 ? 11 : 13}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const star of view.stars) {
      ctx.fillStyle = rgba(star.shown ? COLOUR_ON : COLOUR_OFF, 0.45 * view.labelAlpha);
      ctx.fillText(star.shown ? '1' : '0', star.x, star.y + below);
    }

    if (view.stars.length < 3) return;
    let binary = '';
    let value = 0;
    for (let i = view.stars.length - 1; i >= 0; i--) {   // leftmost (biggest) bit first
      binary += view.stars[i].shown ? '1' : '0';
      value = value * 2 + view.stars[i].shown;
    }
    const lowest = Math.max(...view.stars.map(s => s.y));
    const middle = view.stars.reduce((sum, s) => sum + s.x, 0) / view.stars.length;
    ctx.font = `13px ${FONT}`;
    ctx.fillStyle = rgba(COLOUR_HINT, 0.4 * view.labelAlpha);
    ctx.fillText(`${binary} = ${value}`, middle, lowest + below + 34);

    if (view.showRule) drawRule(ctx, view, middle, lowest + below + 62);
  }

  // The IF · THEN · ELSE rule, written in retro code text under the byte.
  // Each step takes exactly one branch, and that branch lights up for a moment.
  function drawRule(ctx, view, x, y) {
    const parts = [
      { text: 'IF carry', key: 'if' },
      { text: 'THEN ×3', key: 'then' },
      { text: 'ELSE ×1.5', key: 'else' }
    ];
    const gapPx = 22;
    ctx.font = `12px ${FONT}`;
    ctx.textAlign = 'left';
    const widths = parts.map(p => ctx.measureText(p.text).width);
    let left = x - (widths.reduce((a, b) => a + b, 0) + gapPx * (parts.length - 1)) / 2;

    const b = view.branch;
    const lit = b ? Math.exp(-(view.time - b.at) * 2.5) : 0; // fades over about a second
    const violet = TRACK_COLOURS.logic;
    parts.forEach((p, i) => {
      let alpha = 0.35;
      if (p.key === 'if') alpha = 0.35 + 0.3 * lit;            // the condition is checked every step
      if (b && p.key === b.which) alpha = 0.35 + 0.6 * lit;    // the branch that ran glows brightest
      ctx.fillStyle = rgba(violet, alpha * view.labelAlpha);
      ctx.fillText(p.text, left, y);
      left += widths[i] + gapPx;
    });
    ctx.textAlign = 'center';
  }

  // The birth of a bit, in two parts: first a pinprick slowly gathering light,
  // then it ignites with a flash and a spray of sparks. For the second bit onward,
  // a thread of light also reaches out from its neighbour to meet it.
  function drawBirth(ctx, view) {
    const birth = view.birth;
    const star = view.stars[birth.index];
    const p = clamp01((view.time - birth.start) / CONFIG.birthSeconds);
    const ignite = 0.3; // the point in the animation where it flashes

    if (p < ignite) {
      const k = p / ignite;              // 0 → 1 while gathering
      const hintStrength = birth.index === 0 ? clamp01((view.time - CONFIG.darknessSeconds) / 2.5) : 1;
      drawHint(ctx, view, star.x, star.y, hintStrength * (1 - k)); // the hint glow fades away...
      drawStar(ctx, view, star.x, star.y, k * k, 0.25 + 0.35 * k, k); // ...as a tiny light gathers
    } else {
      if (!birth.ignited) {
        birth.ignited = true;
        burst(view, star.x, star.y, CONFIG.birthParticles);
        ripple(view, birth.index, 0.45, Math.max(view.width, view.height) * 0.35);
      }
      const q = (p - ignite) / (1 - ignite); // 0 → 1 after the flash
      const flash = Math.exp(-q * 5);        // big at first, quickly settling
      drawStar(ctx, view, star.x, star.y, 1, 1 + 2.4 * flash, 1);
    }

    if (birth.index > 0) {
      const grow = easeInOut(clamp01((p - ignite) / (1 - ignite)));
      drawThread(ctx, view.stars[birth.index - 1], star, grow);
    }
  }

  // Draw one whole frame.
  function draw(ctx, view, state) {
    // Clear to the dark sky.
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = BACKGROUND;
    ctx.fillRect(0, 0, view.width, view.height);

    // "lighter" makes overlapping light add up, the way real light does.
    ctx.globalCompositeOperation = 'lighter';

    if (!state.sparked) {
      // Before the first tap: only the faint glow.
      const s = view.stars[0];
      drawHint(ctx, view, s.x, s.y, clamp01((view.time - CONFIG.darknessSeconds) / 2.5));
    } else {
      // Threads between bits that are fully alive (a newborn's thread is drawn by drawBirth).
      const living = view.birth ? view.birth.index : view.stars.length;
      for (let i = 0; i + 1 < living; i++) drawThread(ctx, view.stars[i], view.stars[i + 1], 1);
      drawByte(ctx, view, state);
      drawChoice(ctx, view);
      drawHook(ctx, view);
      drawPulses(ctx, view);

      // Living bits. For returning players they fade in over the first second.
      const appear = clamp01(view.time / 1.2);
      for (let i = 0; i < living; i++) {
        const s = view.stars[i];
        drawStar(ctx, view, s.x, s.y, s.brightness, 1, appear);
      }
      if (view.birth) drawBirth(ctx, view);
    }

    drawRipples(ctx, view);
    drawParticles(ctx, view);
    ctx.globalCompositeOperation = 'source-over';
    drawLabels(ctx, view);
  }

  return { update, draw, ripple, sendPulse };
})();
