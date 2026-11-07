// music.js — the background music, written as notes and played live with the Web Audio API (no sound files).
//
// The style: light baroque lines (a harpsichord's broken chords, a slow singing melody, a second voice
// moving against it) over a soft techno pulse (a muffled kick, ticking hats, a pumping bass) and
// ambient pads. Everything is in D major, the same key as the drone, so the drone always blends in.
//
// "As above, so below": the music grows with the machine. One bit: only the pads. Two bits: the
// harpsichord starts, gently. Three: its full running pattern. Five: the pulse arrives. The byte: the
// bass and the melody. A chosen track: a second voice answers the melody.
//
// Each universe gets its own piece, a little more classical and intense than the last (PIECES below).
//
// The music sits under everything else in the mix: quieter than a tap, and it dips out of the way
// whenever a milestone note or an achievement chime plays (duck). It's silent in the dark before the
// first spark and fades away during the fall into the black hole.

const Music = (function () {
  const SETTINGS_KEY = 'a-meaningful-answer-music';

  // How loud each part is (before the master volume and the music's own level).
  const LEVEL = {
    bus: 0.65,       // the whole music (the mix test checks it stays quieter than a tap)
    pad: 0.0045,     // each pad note
    pluck: 0.016,    // a harpsichord note
    kick: 0.034,     // the muffled kick
    hat: 0.011,      // the ticking hats
    bass: 0.013,     // the pumping bass
    melody: 0.011,   // the singing melody
    counter: 0.008,  // the second voice
    strings: 0.0045  // the driving strings (second piece onwards)
  };
  const DUCK = 0.3;  // how far the music dips while a milestone or chime plays (0.3 = to 30%)

  // ---------- the pieces ----------
  // Chords are written as a root note (MIDI number, 50 = the D below middle C) and a quality.
  // A section is eight bars, one chord per bar; `form` is the order the sections play in.
  const D = [50, 'maj'], G = [55, 'maj'], A = [45, 'maj'], Bm = [47, 'min'], Em = [52, 'min'],
    Fsm = [54, 'min'], Csd = [49, 'dim'];
  const PIECES = [
    { // First universe: "Prelude in Light". Sparse and airy; the chords fall round the circle of fifths,
      // a favourite move of baroque composers.
      name: 'Prelude in Light', bpm: 92,
      sections: { A: [D, G, Csd, Fsm, Bm, Em, A, D], B: [Bm, G, D, A, Bm, Em, A, A] },
      form: ['A', 'A', 'B', 'A'], strings: false
    },
    { // Later universes: "Canon of Warm Light". A little faster, darker chords, driving strings,
      // and the second voice joins as soon as the byte forms.
      name: 'Canon of Warm Light', bpm: 100,
      sections: { A: [Bm, G, D, A, Bm, Em, A, D], B: [G, A, Fsm, Bm, Em, A, D, D] },
      form: ['A', 'B', 'A', 'B'], strings: true
    }
  ];

  const QUALITY = { maj: [0, 4, 7], min: [0, 3, 7], dim: [0, 3, 6] };
  const D_MAJOR = [2, 4, 6, 7, 9, 11, 1]; // the notes of the scale (as steps above C, 0–11)
  // The harpsichord's running figure, one number per sixteenth note: which note of the chord to play
  // (0 = the bass note, then the chord rising through two octaves). The classic baroque prelude shape.
  const FIGURE = [0, 2, 3, 4, 5, 3, 4, 5, 0, 2, 3, 4, 5, 3, 4, 5];

  // ---------- state ----------
  let ctx = null, bus = null, noise = null;
  let on = loadSetting();
  let piece = PIECES[0];
  let nextStep = 0;      // when (audio clock) the next sixteenth note is due
  let step = 0;          // which sixteenth we're on, counting from the start of the piece
  let lastNote = 74;     // the melody's last note (it moves smoothly from note to note)
  let lastCounter = 62;  // the second voice's last note
  let duckUntil = 0;
  let wanted = 0;        // how loud the music should be right now (0 = silent)
  let layers = {};       // which parts are playing, worked out from the game each frame
  let forced = null;     // the dev tools can pick a piece to hear

  function loadSetting() {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) !== false; } catch (e) { return true; }
  }

  function freq(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

  // The notes of a chord spread upward from the bass: bass, root, third, fifth, then an octave higher.
  function voicing(chord) {
    const [root, q] = chord;
    const t = QUALITY[q];
    return [root - 12, root, root + t[1], root + t[2], root + 12, root + 12 + t[1], root + 12 + t[2]];
  }

  // ---------- starting up ----------

  function build(engine) {
    ctx = engine.ctx;
    noise = engine.noise;
    bus = ctx.createGain();
    bus.gain.value = 0;
    // A gentle low cut keeps the bass from muddying the drone, and a soft high cut keeps it all warm.
    const lowCut = ctx.createBiquadFilter();
    lowCut.type = 'highpass';
    lowCut.frequency.value = 38;
    const highCut = ctx.createBiquadFilter();
    highCut.type = 'lowpass';
    highCut.frequency.value = 7000;
    bus.connect(lowCut);
    lowCut.connect(highCut);
    highCut.connect(engine.master);
    nextStep = ctx.currentTime + 0.1;
  }

  // A short rise-and-fade envelope.
  function env(time, level, decay, attack) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(level, time + (attack || 0.003));
    g.gain.exponentialRampToValueAtTime(0.0001, time + (attack || 0.003) + decay);
    return g;
  }

  function osc(type, f, time, stop) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.start(time);
    o.stop(stop);
    return o;
  }

  function lowpass(f, q) {
    const flt = ctx.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = f;
    flt.Q.value = q || 0.7;
    return flt;
  }

  // ---------- the instruments ----------

  // Harpsichord: a bright buzzy string plucked and fading fast, doubled an octave up very quietly
  // (like a harpsichord's second set of strings). The brightness closes as the note dies.
  function pluck(midi, time, level) {
    const f = freq(midi);
    const tone = lowpass(4200, 1.5);
    tone.frequency.setValueAtTime(4200, time);
    tone.frequency.exponentialRampToValueAtTime(900, time + 0.3);
    const e = env(time, level, 0.34, 0.002);
    const a = osc('sawtooth', f, time, time + 0.45);
    const b = osc('square', f * 2.003, time, time + 0.45);
    const bGain = ctx.createGain();
    bGain.gain.value = 0.25;
    a.connect(tone);
    b.connect(bGain);
    bGain.connect(tone);
    tone.connect(e);
    e.connect(bus);
  }

  // Pad: two soft triangle waves, slightly apart, swelling in and out across a whole bar.
  function pad(midi, time, length, level) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(level, time + length * 0.35);
    g.gain.setValueAtTime(level, time + length * 0.75);
    g.gain.linearRampToValueAtTime(0, time + length + 1.2);
    const soft = lowpass(900);
    [-6, 6].forEach(cents => {
      const o = osc('triangle', freq(midi), time, time + length + 1.4);
      o.detune.value = cents;
      o.connect(soft);
    });
    soft.connect(g);
    g.connect(bus);
  }

  // Kick: a muffled thump, like a heartbeat heard through a wall. Soft on purpose.
  function kick(time, level) {
    const o = osc('sine', 95, time, time + 0.3);
    o.frequency.setValueAtTime(95, time);
    o.frequency.exponentialRampToValueAtTime(42, time + 0.12);
    const e = env(time, level, 0.24, 0.003);
    o.connect(e);
    e.connect(bus);
  }

  // Hat: a tiny tick of bright noise.
  function hat(time, level) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.start(time, Math.random() * 1.5);
    src.stop(time + 0.06);
    const hi = ctx.createBiquadFilter();
    hi.type = 'highpass';
    hi.frequency.value = 7500;
    const e = env(time, level, 0.035, 0.001);
    src.connect(hi);
    hi.connect(e);
    e.connect(bus);
  }

  // Bass: a round low note that swells in after each beat, the "pumping" sound of ambient techno.
  // A quiet triangle an octave up lets it be heard on phone speakers too.
  function bass(midi, time, length, level) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(level, time + length * 0.45);
    g.gain.linearRampToValueAtTime(0, time + length * 0.98);
    const low = osc('sine', freq(midi), time, time + length);
    const up = osc('triangle', freq(midi + 12), time, time + length);
    const upGain = ctx.createGain();
    upGain.gain.value = 0.35;
    low.connect(g);
    up.connect(upGain);
    upGain.connect(g);
    g.connect(bus);
  }

  // A singing voice (melody and second voice): a soft, flute-like tone that eases in,
  // with a gentle vibrato that arrives after a moment.
  function sing(midi, time, length, level) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(level, time + 0.07);
    g.gain.setValueAtTime(level, time + Math.max(0.08, length - 0.12));
    g.gain.linearRampToValueAtTime(0, time + length + 0.25);
    const o = osc('triangle', freq(midi), time, time + length + 0.3);
    const air = osc('sine', freq(midi) * 2, time, time + length + 0.3);
    const airGain = ctx.createGain();
    airGain.gain.value = 0.18;
    const vib = osc('sine', 5.2, time, time + length + 0.3);
    const vibDepth = ctx.createGain();
    vibDepth.gain.setValueAtTime(0, time);
    vibDepth.gain.linearRampToValueAtTime(freq(midi) * 0.004, time + 0.35);
    vib.connect(vibDepth);
    vibDepth.connect(o.frequency);
    o.connect(g);
    air.connect(airGain);
    airGain.connect(g);
    g.connect(bus);
  }

  // Strings: short, bowed repeated notes driving the music along (the second piece onwards).
  function bowed(midi, time, length, level) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(level, time + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, time + length);
    const tone = lowpass(1500, 0.9);
    [-8, 8].forEach(cents => {
      const o = osc('sawtooth', freq(midi), time, time + length + 0.05);
      o.detune.value = cents;
      o.connect(tone);
    });
    tone.connect(g);
    g.connect(bus);
  }

  // ---------- writing the melody ----------

  // The nearest note to `from` that belongs to `allowed` (a list of note names, 0–11), within a range.
  function nearest(from, allowed, low, high, avoidSame) {
    let best = from, bestDist = 99;
    for (let m = low; m <= high; m++) {
      if (!allowed.includes(((m % 12) + 12) % 12)) continue;
      const d = Math.abs(m - from) + (avoidSame && m === from ? 3 : 0) + Math.random() * 1.6;
      if (d < bestDist) { bestDist = d; best = m; }
    }
    return best;
  }

  // The melody's rhythm for one bar: which sixteenths start a note, and how long each lasts.
  const RHYTHMS = [
    [[0, 8], [8, 8]],                          // two half notes
    [[0, 6], [6, 2], [8, 8]],                  // dotted, then a half
    [[0, 4], [4, 4], [8, 8]],                  // two quarters, a half
    [[0, 12], [12, 4]],                        // long, then a pickup into the next bar
    [[0, 4], [4, 2], [6, 2], [8, 4], [12, 4]]  // a busier, dancing bar
  ];

  // ---------- each bar and each sixteenth ----------

  function chordAt(n) {
    const bar = Math.floor(n / 16);
    const secLen = 8;
    const formIndex = Math.floor(bar / secLen) % piece.form.length;
    return piece.sections[piece.form[formIndex]][bar % secLen];
  }

  function playStep(n, time) {
    const s16 = 60 / piece.bpm / 4; // the length of one sixteenth note
    const pos = n % 16;
    const chord = chordAt(n);
    const v = voicing(chord);
    const tones = QUALITY[chord[1]].map(x => (chord[0] + x) % 12);

    // Pads: once per bar, the chord's three notes.
    if (pos === 0 && layers.pad) {
      [v[1] + 12, v[2] + 12, v[3] + 12].forEach(m => pad(m, time, s16 * 16, LEVEL.pad));
    }
    // Harpsichord: every eighth while it's sparse, every sixteenth once it's running.
    if (layers.pluck && (layers.pluckFull || pos % 2 === 0)) {
      const accent = pos % 4 === 0 ? 1 : 0.7;
      pluck(v[FIGURE[pos]] + 12, time, LEVEL.pluck * accent);
    }
    // The pulse: kick on the beat, a hat between beats (and quiet ghost hats in the later piece).
    if (layers.pulse) {
      if (pos % 4 === 0) kick(time, LEVEL.kick * (pos === 0 ? 1 : 0.8));
      if (pos % 4 === 2) hat(time, LEVEL.hat);
      else if (piece.strings && pos % 2 === 1) hat(time, LEVEL.hat * 0.4);
    }
    // Bass: on every eighth, the chord's root, pumping.
    if (layers.bass && pos % 2 === 0) bass(chord[0] - 12, time, s16 * 2, LEVEL.bass);
    // Strings: repeated eighths on the chord's third and fifth (second piece onwards).
    if (layers.strings && pos % 2 === 0) {
      [v[2] + 12, v[3] + 12].forEach(m => bowed(m, time, s16 * 1.7, LEVEL.strings));
    }
    // Melody: at the start of each bar, write the bar's notes and schedule them.
    if (pos === 0 && layers.melody) {
      const rhythm = pick(RHYTHMS);
      rhythm.forEach(([at, len], i) => {
        // Strong beats land on a note of the chord; the others step through the scale.
        const strong = at === 0 || at === 8;
        lastNote = nearest(lastNote, strong ? tones : D_MAJOR, 69, 86, !strong);
        if (i === 0 && Math.random() < 0.15) return; // now and then the melody breathes
        sing(lastNote, time + at * s16, len * s16, LEVEL.melody);
      });
    }
    // Second voice: slower, lower, always on a note of the chord, moving against the melody.
    if (layers.counter && (pos === 0 || pos === 8)) {
      lastCounter = nearest(lastCounter + (lastNote > 78 ? -1 : 1), tones, 57, 69, true);
      sing(lastCounter, time, s16 * 7.5, LEVEL.counter);
    }
  }

  // ---------- every frame ----------

  // Called by main.js each frame with what the game looks like right now:
  // bits (how many stars), byte (has it formed?), track (storage/logic/null), universe (0 = the first),
  // quiet (true in the dark before the first spark, and during the fall).
  function update(info) {
    const engine = Sound.engine();
    if (!engine) return;
    if (!ctx) build(engine);

    // A new universe gets the next piece (the page reloads between universes, so this happens at the start).
    const wantPiece = PIECES[forced !== null ? forced : Math.min(info.universe || 0, PIECES.length - 1)];
    if (wantPiece !== piece) { piece = wantPiece; step = 0; }

    const bits = info.bits || 0;
    layers = {
      pad: bits >= 1,
      pluck: bits >= 2,
      pluckFull: bits >= 3,
      pulse: bits >= 5,
      bass: !!info.byte,
      melody: !!info.byte,
      counter: !!info.track || (piece.strings && !!info.byte),
      strings: piece.strings && bits >= 5
    };

    // How loud: off, silent in the dark and the fall, dipped under milestones, otherwise full.
    const t = ctx.currentTime;
    let target = on && !info.quiet && bits >= 1 ? LEVEL.bus : 0;
    if (t < duckUntil) target *= DUCK;
    if (target !== wanted) {
      bus.gain.setTargetAtTime(target, t, target < wanted || t < duckUntil ? 0.25 : 2.5);
      wanted = target;
    }

    // Write notes a little ahead of time so they land exactly on the beat.
    // (If the game was hidden and the clock jumped, start again from now instead of rushing to catch up.)
    if (nextStep < t - 0.5) nextStep = t + 0.05;
    if (wanted === 0 && bus.gain.value < 0.001) { nextStep = t + 0.05; return; } // silent: write nothing
    const s16 = 60 / piece.bpm / 4;
    while (nextStep < t + 0.2) {
      playStep(step, nextStep);
      nextStep += s16;
      step++;
    }
  }

  // Step out of the way for a moment (a milestone note or an achievement chime is playing).
  function duck(seconds) {
    if (!ctx) return;
    duckUntil = Math.max(duckUntil, ctx.currentTime + seconds);
    bus.gain.setTargetAtTime(LEVEL.bus * DUCK * (wanted ? 1 : 0), ctx.currentTime, 0.12);
  }

  function setOn(value) {
    on = !!value;
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(on)); } catch (e) { /* fine */ }
  }

  function isOn() { return on; }
  function force(index) { forced = index; }
  // For the tests: how loud the music is right now, and which parts are playing.
  function level() { return bus ? bus.gain.value : 0; }
  function layersNow() { return Object.assign({}, layers); }
  function pieceName() { return piece.name; }

  return { update, duck, setOn, isOn, force, pieceName, level, layersNow, PIECES };
})();
