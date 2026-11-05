// Every sound plays at its moment: first spark, streak climb and spark, purchases, the affordable cue,
// milestone notes, the byte chord, achievements, and the warm drone after a reset.
module.exports = {
  name: 'Sound hooks',
  async run(env, t) {
    const watch = ['bitBorn', 'firstPulse', 'byteChord', 'tap', 'purchase', 'affordable', 'achievement', 'setWarm', 'resonance'];
    const names = async g => (await g.run(() => window.soundLog.map(c => c.name))).filter(n => n !== 'setWarm' && n !== 'tap');

    // First spark
    let g = await env.game({ watch });
    await g.waitReal(await g.run(() => CONFIG.darknessSeconds));
    await g.tapBits();
    t.ok((await names(g)).includes('bitBorn'), 'the first spark rings a note');
    await g.close();

    // Taps and the streak: fast taps climb to a spark; slow taps don't
    g = await env.game({ watch, save: { sparked: true, value: 0, bits: 0, lifetimeBits: 1000, upgrades: {} } });
    const streak = await g.run(() => CONFIG.audio.streakTaps);
    await g.tapBits(streak + 3);
    const taps = await g.run(() => window.soundLog.filter(c => c.name === 'tap').map(c => c.result));
    t.eq(taps.length, streak + 3, 'every tap makes its tick');
    t.eq(taps.filter(Boolean).length, 1, 'a fast streak sparks once at the top');
    await g.close();
    g = await env.game({ watch, save: { sparked: true, value: 0, bits: 0, lifetimeBits: 1000, upgrades: {} } });
    const c = await g.centre();
    for (let i = 0; i < streak + 3; i++) { await g.tapAt(c.x, c.y); await g.waitReal(0.5); }
    t.ok(!(await g.run(() => window.soundLog.some(x => x.name === 'tap' && x.result))), 'slow taps never reach the top');
    await g.close();

    // The affordable cue and a purchase
    const ampCost = await (async () => { const x = await env.game({}); const v = await x.run(() => CONFIG.upgrades.amplifier.baseCost); await x.close(); return v; })();
    g = await env.game({ watch, save: { sparked: true, value: 0, bits: ampCost - 2, lifetimeBits: 1000, upgrades: {} } });
    await g.tapBits(3);
    await g.waitReal(0.4);
    t.ok((await names(g)).includes('affordable'), 'a quiet cue when an upgrade first becomes affordable');
    await g.buy('Amplifier');
    const buys = await g.soundCalls('purchase');
    t.ok(buys.length === 1 && buys[0].args[0] === ampCost, 'buying zaps, passing the price (pricier = longer)');
    await g.close();

    // The second bit: its note, then the first pulse's notes
    const secondCost = await (async () => { const x = await env.game({}); const v = await x.run(() => CONFIG.upgrades.secondBit.baseCost); await x.close(); return v; })();
    g = await env.game({ watch, speed: 10, save: { sparked: true, value: 1, bits: secondCost, lifetimeBits: secondCost, upgrades: {} } });
    await g.buy('Second Bit');
    await g.wait(4);
    const seq = await names(g);
    t.ok(seq.includes('bitBorn') && seq.includes('firstPulse'), 'the second bit rings, then the first pulse sings', seq);
    // ...and the first carry is an achievement, with its chime
    await g.tapBits();
    await g.waitReal(0.6);
    t.ok((await names(g)).includes('achievement'), 'an achievement plays the chime');
    t.ok(await g.visible('#achievement'), '...and shows its toast');
    await g.close();

    // Warm or cold drone
    for (const [what, save, query, warm] of [
      ['first universe: cold', { sparked: true, value: 0, bits: 0, lifetimeBits: 10, upgrades: {} }, '', false],
      ['after a reset: warm', { sparked: true, value: 0, bits: 0, lifetimeBits: 10, upgrades: {}, universesCompleted: 1 }, '', true],
      ['?warm: warm', { sparked: true, value: 0, bits: 0, lifetimeBits: 10, upgrades: {} }, '?warm', true]
    ]) {
      g = await env.game({ watch, save, query });
      const calls = await g.soundCalls('setWarm');
      t.eq(calls.length ? calls[calls.length - 1].args[0] : null, warm, `the drone in the ${what}`);
      t.noErrors(g, what);
      await g.close();
    }

    // Mute and volume are remembered
    g = await env.game({ save: { sparked: true, value: 0, bits: 0, lifetimeBits: 10, upgrades: {} } });
    const box = await g.page.locator('#volume').boundingBox();
    await g.page.mouse.click(box.x + box.width * 0.4, box.y + box.height / 2);
    await g.page.locator('#mute').click();
    await g.page.reload(); await g.waitReal(0.6);
    const s = await g.run(() => Sound.getSettings());
    t.ok(s.muted && s.volume > 0.3 && s.volume < 0.5, 'mute and volume survive a reload', s);
    await g.close();
  }
};
