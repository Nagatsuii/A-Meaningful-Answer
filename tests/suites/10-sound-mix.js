// The mix: drone quietest, then taps and ticks, zaps and sparks, milestone notes, and achievement chimes loudest.
// Measures what actually reaches the speakers, through an analyser.
module.exports = {
  name: 'Sound mix order',
  async run(env, t) {
    const g = await env.game({ save: { sparked: true, value: 0, bits: 0, lifetimeBits: 3e6, upgrades: { secondBit: 1, nextBit: 6 }, byteFormed: true, track: 'storage' } });
    // Tap everything that reaches the speakers into an analyser (added after load, before sound starts).
    await g.run(() => {
      const connect = AudioNode.prototype.connect;
      AudioNode.prototype.connect = function (dest, ...rest) {
        if (dest instanceof AudioDestinationNode && !(this instanceof AnalyserNode)) {
          if (!window.meter) { window.meter = this.context.createAnalyser(); window.meter.fftSize = 2048; }
          connect.call(this, window.meter);
        }
        return connect.call(this, dest, ...rest);
      };
      window.measure = ms => new Promise(done => {
        const buf = new Float32Array(2048); let loudest = 0;
        const id = setInterval(() => {
          window.meter.getFloatTimeDomainData(buf);
          let sum = 0; for (const v of buf) sum += v * v;
          loudest = Math.max(loudest, Math.sqrt(sum / buf.length));
        }, 20);
        setTimeout(() => { clearInterval(id); done(loudest); }, ms);
      });
    });
    await g.page.mouse.click(5, 790); // a first click, to allow sound
    await g.waitReal(9);              // let the eight-note drone fade in
    const drone = await g.run(() => measure(5000));
    await g.run(() => { const real = Sound.setBits; real(0); Sound.setBits = () => {}; }); // silence the drone
    await g.waitReal(5);
    const one = async (code, ms) => { await g.waitReal(1.2); const m = g.run(x => measure(x), ms); await g.run(code); return m; };
    const level = {
      drone,
      tap: await one(() => Sound.tap(), 400),
      zap: await one(() => Sound.purchase(1000), 800),
      note: await one(() => Sound.bitBorn(3, 0), 2500),
      chime: await one(() => Sound.achievement(), 2500)
    };
    const shown = Object.fromEntries(Object.entries(level).map(([k, v]) => [k, Math.round(v * 10000) / 10000]));
    t.ok(level.drone < level.tap, 'the full drone is quieter than a tap', shown);
    t.ok(level.tap < level.zap, 'a tap is quieter than a purchase zap', shown);
    t.ok(level.zap < level.note, 'a zap is quieter than a milestone note', shown);
    t.ok(level.note < level.chime, 'an achievement chime is the loudest', shown);
    t.noErrors(g);
    await g.close();
  }
};
