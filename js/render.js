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
      colour: carry ? COLOUR_CARRY : COLOUR_AMBIENT,
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
    const resting = view.stars.length >= 2 && view.birth === null;
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
