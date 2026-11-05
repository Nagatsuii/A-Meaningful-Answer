// Bits 3 to 8 are bought with the Next Bit card; bit 5 brings a moment and Resonance; the 8th forms the byte.
module.exports = {
  name: 'Next Bits, bit 5 and the byte',
  async run(env, t) {
    for (const phone of [false, true]) {
      const where = phone ? 'phone' : 'desktop';
      const cost = n => env.costs[n];
      // Prices from the game: the Next Bit's cost after owning n of them.
      if (!env.costs) {
        const g0 = await env.game({});
        env.costs = await g0.run(() => [0, 1, 2, 3, 4, 5].map(n => Upgrades.cost({ upgrades: { nextBit: n } }, 'nextBit')));
        env.ratio = await g0.run(() => CONFIG.upgrades.nextBit.costGrowth);
        await g0.close();
      }
      t.ok(env.costs.every((c, i) => i === 0 || Math.abs(c / env.costs[i - 1] - env.ratio) < 0.01), `${where}: each bit costs ${env.ratio}× the last (${env.costs.join(', ')})`);

      // Third bit
      let g = await env.game({ phone, speed: 10, watch: ['bitBorn', 'resonance'], save: { sparked: true, value: 0, bits: cost(0), lifetimeBits: cost(0), upgrades: { secondBit: 1 } } });
      t.ok((await g.cards()).includes('Third Bit'), `${where}: the card is called "Third Bit"`);
      t.eq(await g.run(() => document.querySelector('.upgrade:not([hidden]) .upgrade-owned') && [...document.querySelectorAll('.upgrade:not([hidden])')].find(b => /Bit$/.test(b.querySelector('.upgrade-name').textContent)).querySelector('.upgrade-owned').textContent), '', `${where}: no "× n" count on the bit card`);
      await g.buy('Third Bit');
      await g.wait(await g.run(() => CONFIG.birthSeconds + 0.5));
      t.eq(await g.run(() => Upgrades.bitCount(JSON.parse(localStorage.getItem('a-meaningful-answer-save-v1')))), 3, `${where}: buying it makes 3 bits`);
      t.ok((await g.note()).startsWith('Three bits.'), `${where}: a note: "Three bits. 8 possible states"`, await g.note());
      t.eq((await g.soundCalls('bitBorn')).length, 1, `${where}: the new bit rings its note`);
      t.ok((await g.cards()).includes('Fourth Bit'), `${where}: the card becomes "Fourth Bit"`);
      t.ok(!(await g.cards()).includes('Resonance'), `${where}: no Resonance yet`);
      // the bits' bonus: a tap earns more with 3 bits than the same tap with 2
      const bonus = await g.run(() => [Upgrades.bitBonus({ upgrades: { secondBit: 1 } }), Upgrades.bitBonus({ upgrades: { secondBit: 1, nextBit: 1 } })]);
      t.ok(bonus[1] > bonus[0], `${where}: each bit raises the bonus on all earning (${bonus[0]} → ${bonus[1]})`);
      t.noErrors(g, where);
      await g.close();

      // Fifth bit: the mid-stretch moment
      g = await env.game({ phone, speed: 10, watch: ['resonance'], save: { sparked: true, value: 0, bits: cost(2), lifetimeBits: cost(2) * 2, upgrades: { secondBit: 1, nextBit: 2 } } });
      await g.buy('Fifth Bit');
      await g.wait(await g.run(() => CONFIG.birthSeconds + 0.5));
      t.ok((await g.note()).startsWith('Five bits. 32 possible states.'), `${where}: bit 5's note`, await g.note());
      t.eq((await g.soundCalls('resonance')).length, 1, `${where}: bit 5's rising chord plays`);
      t.ok((await g.cards()).includes('Resonance'), `${where}: Resonance unlocks`);
      const resonanceCost = await g.run(() => CONFIG.upgrades.resonance.baseCost);
      await g.close();

      // Resonance makes oscillators faster
      g = await env.game({ phone, save: { sparked: true, value: 0, bits: resonanceCost, lifetimeBits: 300000, upgrades: { secondBit: 1, nextBit: 3, oscillator: 4 } } });
      const before = await g.run(() => Upgrades.flipsPerSecond({ upgrades: { oscillator: 4 } }));
      await g.buy('Resonance');
      const after = await g.run(() => Upgrades.flipsPerSecond(JSON.parse(localStorage.getItem('a-meaningful-answer-save-v1'))));
      const speedEach = await g.run(() => CONFIG.upgrades.resonance.speedEach);
      t.near(after, before * (1 + speedEach), 0.001, `${where}: Resonance speeds oscillators up by ${speedEach * 100}%`);
      await g.close();

      // Eighth bit: the byte forms
      g = await env.game({ phone, speed: 10, watch: ['byteChord'], save: { sparked: true, value: 0, bits: cost(5), lifetimeBits: cost(5) * 2, upgrades: { secondBit: 1, nextBit: 5 } } });
      t.ok((await g.cards()).includes('Eighth Bit'), `${where}: the last card is "Eighth Bit"`);
      await g.buy('Eighth Bit');
      await g.wait(await g.run(() => CONFIG.birthSeconds + CONFIG.byteDelaySeconds + CONFIG.byteGatherSeconds + CONFIG.byteSweepSeconds + CONFIG.byteRestSeconds + 1));
      const s = await g.save();
      t.ok(s.byteFormed, `${where}: the byte forms`);
      t.eq((await g.soundCalls('byteChord')).length, 1, `${where}: the byte chord plays`);
      t.ok(!(await g.cards()).some(c => /Bit$/.test(c)), `${where}: no more bit cards after the eighth`);
      t.noErrors(g, where);
      await g.close();
    }
  }
};
