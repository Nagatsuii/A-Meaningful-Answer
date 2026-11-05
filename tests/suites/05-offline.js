// Time away: oscillators (and memory cells) keep earning while the game is closed, up to a cap.
module.exports = {
  name: 'Offline progress',
  async run(env, t) {
    const HOUR = 3600e3;
    // What the game should pay for `seconds` away, worked out from its own rules.
    const expected = (g, save, seconds) => g.run(([s, secs]) => {
      const counted = Math.min(secs, Upgrades.offlineHours(s) * 3600) * Upgrades.offlineMultiplier(s);
      const perStep = Upgrades.averageStepEarning(s, CONFIG.upgrades.oscillator.bitsPerFlip, 'osc');
      return (Upgrades.trickle(s) + Upgrades.flipsPerSecond(s) * perStep) * counted * Upgrades.productionMultiplier(s);
    }, [save, seconds]);
    const cases = [
      ['2 oscillators, 2 hours away', { upgrades: { oscillator: 2 } }, 2 * 3600, true],
      ['1 oscillator, 20 hours away (counts only up to the cap)', { upgrades: { oscillator: 1 } }, 20 * 3600, true],
      ['1 oscillator, 30 seconds away (too short for a note)', { upgrades: { oscillator: 1 } }, 30, false],
      ['2 bits, 2 oscillators, 2 hours away', { upgrades: { oscillator: 2, secondBit: 1 } }, 2 * 3600, true],
      ['no oscillators, 2 hours away', { upgrades: { amplifier: 3 } }, 2 * 3600, false]
    ];
    for (const [what, extra, seconds, note] of cases) {
      const save = { sparked: true, value: 0, bits: 0, lifetimeBits: 50, ...extra, lastSeen: Date.now() - seconds * 1000 };
      const g = await env.game({ save });
      await g.waitReal(0.6);
      const want = await expected(g, save, seconds);
      const rate = await g.run(s => Upgrades.bitsPerSecond(s) * Upgrades.productionMultiplier(s), save);
      t.near(await g.bits(), want, rate * 2.5 + 1, what);
      t.eq(await g.noteShowing(), note, `${what}: "welcome back" note shown`);
      if (/cap/.test(what)) t.ok((await g.note()).includes('Away time counts for up to'), 'the note mentions the cap', await g.note());
      await g.close();
    }
    // A background tab: the clock jumps 10 minutes while the page is open
    const g = await env.game({ save: { sparked: true, value: 0, bits: 0, lifetimeBits: 50, upgrades: { oscillator: 1 } } });
    const b0 = await g.bits();
    await g.run(() => { const real = Date.now; Date.now = () => real() + 600e3; });
    await g.waitReal(0.6);
    t.near((await g.bits()) - b0, 600 * 1, 3, 'a tab left in the background for 10 minutes catches up');
    t.ok((await g.note()).includes('10 min'), 'and says so', await g.note());
    t.noErrors(g);
    await g.close();
  }
};
