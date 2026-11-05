// The first upgrades: the menu appears, Amplifier and Oscillator do what their cards say, and progress is kept.
module.exports = {
  name: 'Menu, Amplifier and Oscillator',
  async run(env, t) {
    for (const phone of [false, true]) {
      const where = phone ? 'phone' : 'desktop';
      let g = await env.game({ phone, save: { sparked: true, value: 0, bits: 0, lifetimeBits: 0, upgrades: {} } });
      t.ok(!(await g.run(() => document.getElementById('panel').classList.contains('revealed'))), `${where}: no menu at first`);
      const reveal = await g.run(() => CONFIG.upgrades.amplifier.revealAt);
      await g.tapBits(reveal);
      await g.waitReal(0.4);
      t.ok(await g.run(() => document.getElementById('panel').classList.contains('revealed')), `${where}: the menu appears at ${reveal} bits earned`);
      t.ok((await g.cards()).includes('Amplifier'), `${where}: Amplifier is offered`);
      const cost = await g.run(() => CONFIG.upgrades.amplifier.baseCost);
      await g.close();

      // Buying the Amplifier, then tapping
      g = await env.game({ phone, save: { sparked: true, value: 0, bits: cost, lifetimeBits: cost, upgrades: {} } });
      await g.buy('Amplifier');
      let s = await g.save();
      t.eq(s.upgrades.amplifier, 1, `${where}: Amplifier bought`);
      t.eq(s.bits, 0, `${where}: it cost exactly its price`);
      await g.tapBits();
      const perTap = await g.run(() => Upgrades.bitsPerTap({ upgrades: { amplifier: 1 } }));
      t.eq((await g.save()).bits, perTap, `${where}: a tap now earns ${perTap}`);
      await g.close();

      // Two oscillators flip the bit by themselves
      g = await env.game({ phone, save: { sparked: true, value: 0, bits: 0, lifetimeBits: 100, upgrades: { oscillator: 2 } } });
      const rate = await g.run(() => Upgrades.flipsPerSecond({ upgrades: { oscillator: 2 } }));
      const b0 = await g.bits();
      await g.waitReal(4);
      await g.page.reload(); await g.waitReal(0.3);
      t.near((await g.bits()) - b0, rate * 4, rate * 1.5 + 1, `${where}: oscillators earn about ${rate} a second without tapping`);
      t.eq((await g.save()).upgrades.oscillator, 2, `${where}: owned upgrades survive a reload`);
      t.noErrors(g, where);
      await g.close();
    }
  }
};
