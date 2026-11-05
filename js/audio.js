// audio.js — every sound in the game, made in code with the Web Audio API. No sound files.
//
// The mix, quietest to loudest:
//   drone (the bed)  <  taps and clock ticks  <  purchase zaps and streak sparks
//   <  milestone notes (new bit, first pulse, byte chord)  <  achievement chimes
//
// Browsers only allow sound after the player touches, clicks or presses a key, so nothing
// plays until Sound.unlock() is called from one of those (main.js does this on any first input).

const Sound = (function () {
  const SETTINGS_KEY = 'a-meaningful-answer-sound';

  // The drone's notes, one per bit, from a gentle D major scale (D, F#, A, B, D, E, F#, A),
  // so however many are sounding they always blend. Bit 0 (the first bit) is the lowest.
  const SCALE = [146.83, 185.0, 220.0, 246.94, 293.66, 329.63, 369.99, 440.0];

  // Peak loudness of each kind of sound (before the master volume). Change these to rebalance the mix.
  const LEVEL = {
    droneVoice: 0.006,    // each drone note (cold, first universe)
    droneVoiceWarm: 0.0042, // each drone note (warm); its rounder waves carry more, so it's set lower
    wind: 0.014,         // the cold, airy ambience of the first universe
    windWarm: 0.004,     // ...much softer once the universe is warm
    tap: 0.13,           // the near-silent tick of a tap
    clockTick: 0.1,      // the oscillators' muffled ticking
    whir: 0.03,          // what the ticking blurs into at high speed
    affordable: 0.035,   // the tiny cue when an upgrade first becomes affordable
    zap: 0.085,          // buying an upgrade
    spark: 0.17,         // reaching the top of a click streak
    note: 0.16,          // milestone notes
    chime: 0.24          // achievement chimes
  };

  let ctx = null;          // the audio "engine", created on the first touch/click/key
  let master = null;       // master volume
  let noise = null;        // a couple of seconds of white noise, reused by many sounds
  let wind = null;
  let voices = [];         // the drone notes currently playing
  let bitsWanted = 0;      // how many drone notes there should be (one per bit)
  let warm = false;        // first universe = cold; after a black-hole reset = warm
  let builtWarm = false;   // which tone the current drone notes were made with
  let whir = null;
  let nextTick = 0;        // when the next clock tick is due (audio clock time)
  let streak = 0;          // how far up the click-streak climb we are
  let lastTap = -10;       // when the last tap happened (seconds)
  let topped = false;      // has this streak already reached the top (and sparked)?
  let settings = loadSettings();

  // ---------- small helpers ----------

  function clamp01(n) {
    return Math.max(0, Math.min(1, n));
  }

  function loadSettings() {
    try {
      const s = JSON.parse(localStorage.getItem(SETTINGS_KEY));
      if (s && typeof s.volume === 'number') return { volume: clamp01(s.volume), muted: !!s.muted };
    } catch (error) { /* no saved settings */ }
    return { volume: CONFIG.audio.defaultVolume, muted: false };
  }

  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (error) { /* fine */ }
  }

  function running() {
    return ctx !== null && ctx.state === 'running';
  }

  function now() {
    return performance.now() / 1000;
  }

  // Turn game seconds into real seconds, so notes stay in time with animations when the dev tools
  // speed the game up. (Only waits are scaled; sounds keep their own pitch and length.)
  function game(seconds) {
    return seconds / Dev.timeScale();
  }

  // Apply the volume slider and mute button. Squaring the slider value feels more natural to the ear.
  function applyVolume() {
    if (!master) return;
    const target = settings.muted ? 0 : settings.volume * settings.volume;
    master.gain.setTargetAtTime(target, ctx.currentTime, 0.05);
  }

  // A short envelope: rise to `level` almost at once, then fade away over `decay` seconds.
  function envelope(time, level, decay, attack) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(level, time + (attack || 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, time + (attack || 0.004) + decay);
    return g;
  }

  // Play a slice of the shared white noise.
  function noiseSource(time, duration) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    src.start(time, Math.random() * 1.5);
    if (duration) src.stop(time + duration);
    return src;
  }

  function filter(type, frequency, q) {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = frequency;
    f.Q.value = q || 0.7;
    return f;
  }

  // ---------- starting up ----------

  // Called on the player's first touch, click or key press (and harmlessly on later ones).
  function unlock() {
    if (!ctx) {
      const AudioEngine = window.AudioContext || window.webkitAudioContext;
      if (!AudioEngine) return; // a very old browser: the game simply stays silent
      ctx = new AudioEngine();
      build();
    }
    if (ctx.state === 'suspended' && document.visibilityState === 'visible') ctx.resume();
  }

  function build() {
    master = ctx.createGain();
    master.gain.value = 0;
    // A gentle limiter so lots of sounds at once never get harsh.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -16;
    limiter.ratio.value = 4;
    master.connect(limiter);
    limiter.connect(ctx.destination);
    applyVolume();

    // Two seconds of white noise, for wind, ticks and crackles.
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    // Older iPhones only fully wake their audio after a sound plays during the touch, so play silence.
    const wake = ctx.createBufferSource();
    wake.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    wake.connect(ctx.destination);
    wake.start();

    startWind();
    syncDrone();
  }

  // ---------- 1. the drone (the bed) ----------

  // The faintest cold wind: noise through a soft filter that slowly wanders, like air in empty space.
  function startWind() {
    const src = noiseSource(ctx.currentTime);
    const band = filter('bandpass', 650, 0.6);
    const wander = ctx.createOscillator();
    wander.frequency.value = 0.045;
    const wanderDepth = ctx.createGain();
    wanderDepth.gain.value = 260;
    wander.connect(wanderDepth);
    wanderDepth.connect(band.frequency);
    wander.start();
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(band);
    band.connect(gain);
    gain.connect(master);
    wind = { gain: gain, band: band };
    setWindLevel();
  }

  function setWindLevel() {
    if (!wind) return;
    wind.gain.gain.setTargetAtTime(warm ? LEVEL.windWarm : LEVEL.wind, ctx.currentTime, 2);
    wind.band.frequency.setTargetAtTime(warm ? 380 : 650, ctx.currentTime, 2);
  }

  // One drone note. Cold: a thin sine with a faint high overtone and a breath of noise (airy, distant).
  // Warm: two soft triangle waves, slightly apart, through a gentle filter (rounder, closer).
  // Every note "breathes": its loudness swells and fades slowly, each at its own pace.
  function makeVoice(index, isWarm) {
    const f = SCALE[index % SCALE.length];
    const t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.value = 0;
    const breath = ctx.createGain();
    breath.gain.value = 1;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.03 + 0.011 * index + Math.random() * 0.01;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.5; // swells between half and one-and-a-half times as loud
    lfo.connect(lfoDepth);
    lfoDepth.connect(breath.gain);
    const sources = [lfo];   // everything to stop later
    const toStart = [lfo];   // oscillators to start now (noise sources start themselves)

    if (isWarm) {
      const soft = filter('lowpass', 700, 0.5);
      for (const detune of [-5, 5]) {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = f;
        osc.detune.value = detune;
        osc.connect(soft);
        sources.push(osc);
        toStart.push(osc);
      }
      soft.connect(breath);
    } else {
      const tone = ctx.createOscillator();
      tone.frequency.value = f;
      tone.connect(breath);
      const overtone = ctx.createOscillator();
      overtone.frequency.value = f * 2.004; // slightly off, so it shimmers
      const overtoneGain = ctx.createGain();
      overtoneGain.gain.value = 0.12;
      overtone.connect(overtoneGain);
      overtoneGain.connect(breath);
      const air = noiseSource(t);
      const airBand = filter('bandpass', f * 3, 14);
      const airGain = ctx.createGain();
      airGain.gain.value = 0.9;
      air.connect(airBand);
      airBand.connect(airGain);
      airGain.connect(breath);
      sources.push(tone, overtone, air);
      toStart.push(tone, overtone);
    }

    breath.connect(out);
    out.connect(master);
    toStart.forEach(s => s.start(t));
    out.gain.setTargetAtTime(isWarm ? LEVEL.droneVoiceWarm : LEVEL.droneVoice, t, 1.4); // fades in over a few seconds
    return { out: out, sources: sources };
  }

  function stopVoice(voice, seconds) {
    const t = ctx.currentTime;
    voice.out.gain.cancelScheduledValues(t);
    voice.out.gain.setTargetAtTime(0, t, seconds / 3);
    voice.sources.forEach(s => { try { s.stop(t + seconds + 0.5); } catch (e) { /* fine */ } });
  }

  // Make the drone match the number of bits (and the cold or warm tone).
  function syncDrone() {
    if (!ctx) return;
    if (builtWarm !== warm) {
      voices.forEach(v => stopVoice(v, 4)); // the old tone fades out as the new one fades in
      voices = [];
      builtWarm = warm;
    }
    while (voices.length < bitsWanted) voices.push(makeVoice(voices.length, warm));
    while (voices.length > bitsWanted) stopVoice(voices.pop(), 2);
  }

  function setBits(n) {
    if (n === bitsWanted) return;
    bitsWanted = n;
    syncDrone();
  }

  function setWarm(isWarm) {
    if (isWarm === warm) return;
    warm = isWarm;
    if (ctx) {
      setWindLevel();
      syncDrone();
    }
  }

  // ---------- 2. the clock (oscillators) and 4. taps ----------

  // A soft, muffled tick, like a watch heard through a pillow: a tiny thump of filtered noise.
  function tick(time, level, pitch) {
    const src = noiseSource(time, 0.08);
    const muffle = filter('lowpass', 700 * pitch, 1.2);
    const env = envelope(time, level, 0.035, 0.002);
    src.connect(muffle);
    muffle.connect(env);
    env.connect(master);
    const body = ctx.createOscillator();
    body.frequency.setValueAtTime(140 * pitch, time);
    body.frequency.exponentialRampToValueAtTime(70 * pitch, time + 0.05);
    const bodyEnv = envelope(time, level * 0.7, 0.05, 0.002);
    body.connect(bodyEnv);
    bodyEnv.connect(master);
    body.start(time);
    body.stop(time + 0.1);
  }

  // At high speed the ticks blur into a gentle whir.
  function setWhir(level, rate) {
    if (level <= 0.0005 && !whir) return;
    if (!whir) {
      const src = noiseSource(ctx.currentTime);
      const band = filter('bandpass', 240, 2.5);
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(band);
      band.connect(gain);
      gain.connect(master);
      whir = { gain: gain, band: band };
    }
    whir.gain.gain.setTargetAtTime(level, ctx.currentTime, 0.4);
    whir.band.frequency.setTargetAtTime(200 + Math.min(rate, 60) * 3, ctx.currentTime, 0.4);
  }

  // Called every frame. `clockRate` = how many times a second the oscillators step the counter.
  function update(dt, clockRate) {
    // The click streak settles back down once clicking stops.
    if (now() - lastTap > CONFIG.audio.streakGapSeconds) streak = Math.max(0, streak - dt * 12);
    if (streak < CONFIG.audio.streakTaps * 0.5) topped = false;

    if (!running()) return;
    const t = ctx.currentTime;
    // Ticks until about 6 a second, fading into the whir by about 14 a second.
    const blur = clamp01((clockRate - 6) / 8);
    const tickLevel = LEVEL.clockTick * (1 - blur);
    if (clockRate > 0 && tickLevel > 0.0005) {
      const gap = 1 / clockRate;
      if (nextTick < t || nextTick > t + gap + 0.2) nextTick = t + 0.05;
      while (nextTick < t + 0.15) {
        tick(nextTick, tickLevel, 1);
        nextTick += gap;
      }
    }
    setWhir(clockRate > 0 ? LEVEL.whir * blur : 0, clockRate);
  }

  // The core toggle: a near-silent low tick. Fast tapping makes it climb in pitch, up to an octave.
  // Returns true when this tap reaches the top of the climb (main.js adds a spark of light).
  function tap() {
    const time = now();
    if (time - lastTap < CONFIG.audio.streakGapSeconds) streak = Math.min(CONFIG.audio.streakTaps, streak + 1);
    lastTap = time;
    const climb = streak / CONFIG.audio.streakTaps;
    if (running()) tick(ctx.currentTime, LEVEL.tap * (0.8 + 0.3 * climb), 0.7 * Math.pow(2, climb));
    if (streak >= CONFIG.audio.streakTaps && !topped) {
      topped = true;
      spark();
      return true;
    }
    return false;
  }

  // A small burst of crackling sparks (the top of a click streak).
  function spark() {
    if (!running()) return;
    const t = ctx.currentTime;
    for (let i = 0; i < 9; i++) {
      const at = t + Math.random() * 0.22;
      const blip = ctx.createOscillator();
      blip.frequency.value = 2400 + Math.random() * 2600;
      const env = envelope(at, LEVEL.spark * 0.5, 0.04, 0.001);
      blip.connect(env);
      env.connect(master);
      blip.start(at);
      blip.stop(at + 0.08);
    }
    const crackle = noiseSource(t, 0.3);
    const hiss = filter('highpass', 3000, 0.7);
    const env = envelope(t, LEVEL.spark * 0.45, 0.25, 0.002);
    crackle.connect(hiss);
    hiss.connect(env);
    env.connect(master);
  }

  // ---------- 3. purchases ----------

  // A short, crackly zap of current rising in pitch. Pricier upgrades crackle a little longer.
  function purchase(cost) {
    if (!running()) return;
    const t = ctx.currentTime;
    const d = Math.max(0.2, Math.min(0.6, 0.1 + 0.07 * Math.log10(Math.max(10, cost))));

    // The rising current: a buzzy sawtooth sweeping upward through a moving filter.
    const buzz = ctx.createOscillator();
    buzz.type = 'sawtooth';
    buzz.frequency.setValueAtTime(180, t);
    buzz.frequency.exponentialRampToValueAtTime(950, t + d);
    const band = filter('bandpass', 600, 3);
    band.frequency.setValueAtTime(600, t);
    band.frequency.exponentialRampToValueAtTime(2600, t + d);
    const buzzEnv = ctx.createGain();
    buzzEnv.gain.setValueAtTime(0, t);
    buzzEnv.gain.linearRampToValueAtTime(LEVEL.zap * 0.6, t + 0.01);
    buzzEnv.gain.setValueAtTime(LEVEL.zap * 0.6, t + d * 0.8);
    buzzEnv.gain.exponentialRampToValueAtTime(0.0001, t + d);
    buzz.connect(band);
    band.connect(buzzEnv);
    buzzEnv.connect(master);
    buzz.start(t);
    buzz.stop(t + d + 0.05);

    // The crackle: bright noise switched on and off at random, like sparks jumping a gap.
    const crackle = noiseSource(t, d + 0.05);
    const hiss = filter('highpass', 1800, 0.7);
    const gate = ctx.createGain();
    gate.gain.setValueAtTime(0, t);
    for (let at = t; at < t + d; at += 0.008 + Math.random() * 0.014) {
      gate.gain.setValueAtTime(Math.random() < 0.55 ? LEVEL.zap * Math.random() : 0, at);
    }
    gate.gain.setValueAtTime(0, t + d);
    crackle.connect(hiss);
    hiss.connect(gate);
    gate.connect(master);
  }

  // A tiny, quiet double blip when an upgrade first becomes affordable.
  function affordable() {
    if (!running()) return;
    const t = ctx.currentTime;
    [1318.5, 1760].forEach((f, i) => {
      const at = t + i * 0.07;
      const blip = ctx.createOscillator();
      blip.frequency.value = f;
      const env = envelope(at, LEVEL.affordable, 0.08, 0.004);
      blip.connect(env);
      env.connect(master);
      blip.start(at);
      blip.stop(at + 0.15);
    });
  }

  // ---------- boosters ----------

  // A booster appears: a short electric crackle (lightning snaps; a light pulse hums in more softly).
  function boosterAppear(kind) {
    if (!running()) return;
    const t = ctx.currentTime;
    const length = kind === 'lightning' ? 0.3 : 0.45;
    const crackle = noiseSource(t, length + 0.05);
    const hiss = filter(kind === 'lightning' ? 'highpass' : 'bandpass', kind === 'lightning' ? 2200 : 1400, 0.8);
    const gate = ctx.createGain();
    gate.gain.setValueAtTime(0, t);
    const level = LEVEL.zap * (kind === 'lightning' ? 0.9 : 0.6);
    for (let at = t; at < t + length; at += 0.008 + Math.random() * 0.016) {
      const fade = 1 - (at - t) / length;
      gate.gain.setValueAtTime(Math.random() < 0.5 ? level * Math.random() * fade : 0, at);
    }
    gate.gain.setValueAtTime(0, t + length);
    crackle.connect(hiss);
    hiss.connect(gate);
    gate.connect(master);
  }

  // Catching a booster: the same rising, crackly zap as buying an upgrade, a little longer.
  function boosterCatch() {
    purchase(100000);
  }

  // The 5th bit's moment: the constellation's notes ring upward in turn, like the threads lighting up.
  function resonance(bits) {
    if (!running()) return;
    const t = ctx.currentTime;
    for (let i = 0; i < bits; i++) bell(SCALE[i] * 2, t + game(0.12 * i), LEVEL.note * 0.6, 2.6, 0.9);
  }

  // ---------- milestones and 5. achievements ----------

  // A bell: one sine wave wobbled by another (FM synthesis). `brightness` = how metallic it sounds;
  // the brightness fades as the bell rings, the way a real bell mellows.
  function bell(f, time, level, decay, brightness) {
    const carrier = ctx.createOscillator();
    carrier.frequency.value = f;
    const mod = ctx.createOscillator();
    mod.frequency.value = f * 3.5;
    const modDepth = ctx.createGain();
    modDepth.gain.setValueAtTime(f * brightness, time);
    modDepth.gain.exponentialRampToValueAtTime(f * 0.05 + 1, time + decay * 0.6);
    mod.connect(modDepth);
    modDepth.connect(carrier.frequency);
    const env = envelope(time, level, decay, 0.005);
    carrier.connect(env);
    env.connect(master);
    carrier.start(time);
    mod.start(time);
    carrier.stop(time + decay + 0.1);
    mod.stop(time + decay + 0.1);
  }

  // A soft sustained tone that swells in and fades out (for the byte chord).
  function pad(f, time, level, rise, hold, fall) {
    const osc = ctx.createOscillator();
    osc.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(level, time + rise);
    g.gain.setValueAtTime(level, time + rise + hold);
    g.gain.linearRampToValueAtTime(0, time + rise + hold + fall);
    osc.connect(g);
    g.connect(master);
    osc.start(time);
    osc.stop(time + rise + hold + fall + 0.1);
  }

  // A new bit is born: a soft bell at its drone note (an octave up), `delay` seconds from now,
  // timed to the flash of its birth.
  function bitBorn(index, delay) {
    if (!running()) return;
    const t = ctx.currentTime + game(delay || 0);
    const f = SCALE[index % SCALE.length];
    bell(f * 2, t, LEVEL.note, 3.2, 1.2);
    pad(f, t, LEVEL.note * 0.25, 0.3, 0.5, 3);
  }

  // The first pulse between two bits: a note as it leaves, and the other bit's note as it arrives.
  function firstPulse(delay, travel) {
    if (!running()) return;
    const t = ctx.currentTime + game(delay);
    bell(SCALE[0] * 2, t, LEVEL.note * 0.7, 2.5, 0.6);
    bell(SCALE[1] * 2, t + game(travel), LEVEL.note * 0.7, 3, 0.6);
  }

  // The byte forms: each bit rings as the wave of light passes it, then all eight swell into a chord.
  // waveDelays[i] = seconds from now until the wave reaches bit i; chordDelay = when the chord blooms.
  function byteChord(waveDelays, chordDelay) {
    if (!running()) return;
    const t = ctx.currentTime;
    waveDelays.forEach((d, i) => bell(SCALE[i] * 2, t + game(d), LEVEL.note * 0.55, 2.4, 0.8));
    SCALE.forEach((f, i) => {
      pad(f, t + game(chordDelay), LEVEL.note * 0.14, 1.8, 2.5, 5);
      pad(f * 2, t + game(chordDelay) + 0.05 * i, LEVEL.note * 0.08, 2.2, 2, 5);
    });
  }

  // An achievement: the signature electric bell "starburst". A bright chord rung in a quick upward
  // spread, a crackle of current, and a shower of sparks glittering upward. Clearly bigger than a streak spark.
  function achievement() {
    if (!running()) return;
    const t = ctx.currentTime;
    [587.33, 880, 1174.66, 1479.98].forEach((f, i) => bell(f, t + i * 0.06, LEVEL.chime * 0.55, 2.8, 2.4));
    const crackle = noiseSource(t, 0.18);
    const hiss = filter('highpass', 2500, 0.7);
    const gate = ctx.createGain();
    gate.gain.setValueAtTime(0, t);
    for (let at = t; at < t + 0.14; at += 0.01) gate.gain.setValueAtTime(Math.random() * LEVEL.chime * 0.4, at);
    gate.gain.setValueAtTime(0, t + 0.15);
    crackle.connect(hiss);
    hiss.connect(gate);
    gate.connect(master);
    for (let i = 0; i < 16; i++) {
      const at = t + 0.1 + i * 0.045 + Math.random() * 0.02;
      const blip = ctx.createOscillator();
      blip.frequency.value = 2500 + i * 300 + Math.random() * 400;
      const env = envelope(at, LEVEL.chime * 0.18 * (1 - i / 20), 0.06, 0.001);
      blip.connect(env);
      env.connect(master);
      blip.start(at);
      blip.stop(at + 0.1);
    }
  }

  // Falling into the black hole: the drone sinks away while a deep tone slides down into silence,
  // with a soft rush of air drawn in after it.
  function fall(gameSeconds) {
    if (!running()) return;
    const t = ctx.currentTime;
    const seconds = game(gameSeconds); // the slide lasts as long as the fall animation
    voices.forEach(v => {
      v.out.gain.cancelScheduledValues(t);
      v.out.gain.setTargetAtTime(0, t, seconds / 4);
    });
    if (wind) wind.gain.gain.setTargetAtTime(0, t, seconds / 3);

    const deep = ctx.createOscillator();
    deep.frequency.setValueAtTime(220, t);
    deep.frequency.exponentialRampToValueAtTime(30, t + seconds);
    const deepGain = ctx.createGain();
    deepGain.gain.setValueAtTime(0, t);
    deepGain.gain.linearRampToValueAtTime(LEVEL.note * 0.6, t + seconds * 0.3);
    deepGain.gain.linearRampToValueAtTime(0, t + seconds);
    deep.connect(deepGain);
    deepGain.connect(master);
    deep.start(t);
    deep.stop(t + seconds + 0.1);

    const rush = noiseSource(t, seconds + 0.1);
    const low = filter('lowpass', 2400, 0.8);
    low.frequency.setValueAtTime(2400, t);
    low.frequency.exponentialRampToValueAtTime(80, t + seconds);
    const rushGain = ctx.createGain();
    rushGain.gain.setValueAtTime(0, t);
    rushGain.gain.linearRampToValueAtTime(LEVEL.note * 0.35, t + seconds * 0.5);
    rushGain.gain.linearRampToValueAtTime(0, t + seconds);
    rush.connect(low);
    low.connect(rushGain);
    rushGain.connect(master);
  }

  // ---------- volume, mute, pausing ----------

  function setVolume(v) {
    settings.volume = clamp01(v);
    applyVolume();
    saveSettings();
  }

  function setMuted(m) {
    settings.muted = !!m;
    applyVolume();
    saveSettings();
  }

  function getSettings() {
    return { volume: settings.volume, muted: settings.muted };
  }

  // Pause all sound while the game is hidden (saves battery), and carry on when it's back.
  function suspend() {
    if (running()) ctx.suspend();
  }

  function resume() {
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  return {
    unlock, update, setBits, setWarm, tap, purchase, affordable,
    bitBorn, firstPulse, byteChord, achievement, fall, boosterAppear, boosterCatch, resonance,
    setVolume, setMuted, getSettings, suspend, resume
  };
})();
