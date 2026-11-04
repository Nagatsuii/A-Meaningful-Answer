// render.js — everything you see is drawn here, in code, on the canvas.
// No image files: the bit, its glow and the sparks are all gradients and circles.

const Render = (function () {
  // If the player's device asks for less motion, we keep effects gentler.
  const calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Colours as [red, green, blue]. The bit is cool blue when it reads 0
  // and warm white when it reads 1, so you can see its value at a glance.
  const COLOUR_OFF = [140, 170, 255];
  const COLOUR_ON = [255, 240, 215];
  const COLOUR_HINT = [170, 200, 255];
  const BACKGROUND = '#04050a';

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

  // A burst of tiny sparks flying outward, used when the bit is born.
  function burst(view, count) {
    const n = calm ? Math.round(count / 3) : count;
    for (let i = 0; i < n; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 110; // pixels per second
      const life = 1.2 + Math.random() * 1.6; // seconds
      view.particles.push({
        x: view.cx,
        y: view.cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: life,
        maxLife: life,
        size: 0.6 + Math.random() * 1.2
      });
    }
  }

  // A faint ring of light spreading out from the bit.
  function ripple(view, strength, size) {
    view.ripples.push({ start: view.time, strength: strength, size: size });
  }

  // ---------- each frame: move things ----------

  function update(view, state, dt) {
    // Ease the bit's brightness toward its target, so toggles fade softly instead of snapping.
    const target = state.bitOn ? 1 : CONFIG.offBrightness;
    const step = 1 - Math.exp(-CONFIG.toggleEaseSpeed * dt);
    view.brightness += (target - view.brightness) * step;

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
  }

  // ---------- each frame: draw things ----------

  // The faint, slowly breathing glow that shows where to tap.
  function drawHint(ctx, view, fadeOut) {
    const fadeIn = clamp01((view.time - CONFIG.darknessSeconds) / 2.5);
    const breath = 0.5 + 0.5 * Math.sin((view.time / CONFIG.hintPulseSeconds) * Math.PI * 2);
    const alpha = fadeIn * (0.08 + 0.10 * breath) * (1 - fadeOut);
    glow(ctx, view.cx, view.cy, CONFIG.hintRadius, COLOUR_HINT, alpha);
    // A tiny point at the centre, so the eye knows exactly where to aim.
    ctx.fillStyle = rgba(COLOUR_HINT, alpha * 2.2);
    ctx.beginPath();
    ctx.arc(view.cx, view.cy, 1.1, 0, Math.PI * 2);
    ctx.fill();
  }

  // The bit, drawn as a small star.
  // brightness: 0..1, sizeBoost: makes it swell during birth, alpha: overall visibility.
  function drawStar(ctx, view, brightness, sizeBoost, alpha) {
    const { cx, cy } = view;
    // How "on" the bit looks, from 0 (off) to 1 (on), used to blend its colour.
    const onness = clamp01((brightness - CONFIG.offBrightness) / (1 - CONFIG.offBrightness));
    const colour = mix(COLOUR_OFF, COLOUR_ON, onness);

    // A slow, gentle twinkle so the star feels alive even when nothing is happening.
    const twinkle = calm ? 1 : 1 + 0.05 * Math.sin(view.time * 1.7) + 0.03 * Math.sin(view.time * 3.1);
    const b = brightness * twinkle * alpha;

    const halo = CONFIG.bitHaloRadius * sizeBoost;
    const core = CONFIG.bitCoreRadius * Math.sqrt(sizeBoost);

    // Outer halo, then a tighter inner glow.
    glow(ctx, cx, cy, halo, colour, 0.32 * b);
    glow(ctx, cx, cy, core * 3.2, colour, 0.75 * b);

    // Thin light rays, like a star seen through a telescope.
    const ray = halo * 0.95;
    ctx.lineWidth = 1;
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      const g = ctx.createLinearGradient(cx - dx * ray, cy - dy * ray, cx + dx * ray, cy + dy * ray);
      g.addColorStop(0, rgba(colour, 0));
      g.addColorStop(0.5, rgba(colour, 0.35 * b));
      g.addColorStop(1, rgba(colour, 0));
      ctx.strokeStyle = g;
      ctx.beginPath();
      ctx.moveTo(cx - dx * ray, cy - dy * ray);
      ctx.lineTo(cx + dx * ray, cy + dy * ray);
      ctx.stroke();
    }

    // The bright centre.
    ctx.fillStyle = rgba([255, 255, 255], 0.55 + 0.45 * b);
    ctx.globalAlpha = clamp01(alpha);
    ctx.beginPath();
    ctx.arc(cx, cy, core * (0.7 + 0.3 * brightness), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawParticles(ctx, view) {
    for (const p of view.particles) {
      const a = p.life / p.maxLife;
      glow(ctx, p.x, p.y, p.size * 4, COLOUR_ON, 0.5 * a);
    }
  }

  function drawRipples(ctx, view) {
    for (const r of view.ripples) {
      const t = (view.time - r.start) / 1.2;       // 0 → 1 over the ripple's life
      const eased = 1 - Math.pow(1 - t, 3);        // fast at first, then slowing
      const radius = CONFIG.bitCoreRadius + eased * r.size;
      ctx.strokeStyle = rgba(COLOUR_HINT, r.strength * (1 - t));
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(view.cx, view.cy, radius, 0, Math.PI * 2);
      ctx.stroke();
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
      drawHint(ctx, view, 0);
    } else if (view.birthStart !== null) {
      drawBirth(ctx, view);
    } else {
      // A normal living bit. For returning players it fades in over the first second.
      const appear = clamp01(view.time / 1.2);
      drawStar(ctx, view, view.brightness, 1, appear);
    }

    drawRipples(ctx, view);
    drawParticles(ctx, view);
    ctx.globalCompositeOperation = 'source-over';
  }

  // The birth of the first bit, in two parts:
  // first a pinprick slowly gathering light, then it ignites with a flash and a spray of sparks.
  function drawBirth(ctx, view) {
    const p = clamp01((view.time - view.birthStart) / CONFIG.birthSeconds);
    const ignite = 0.3; // the point in the animation where it flashes

    if (p < ignite) {
      const k = p / ignite;              // 0 → 1 while gathering
      drawHint(ctx, view, k);            // the hint glow fades away...
      drawStar(ctx, view, k * k, 0.25 + 0.35 * k, k);  // ...as a tiny light gathers
    } else {
      if (!view.ignited) {
        view.ignited = true;
        burst(view, CONFIG.birthParticles);
        ripple(view, 0.45, Math.max(view.width, view.height) * 0.35);
      }
      const q = (p - ignite) / (1 - ignite); // 0 → 1 after the flash
      const flash = Math.exp(-q * 5);        // big at first, quickly settling
      drawStar(ctx, view, 1, 1 + 2.4 * flash, 1);
    }
  }

  return { update, draw, ripple };
})();
