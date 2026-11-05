// Bits count together in binary; every flipped bit earns (times the bits' bonus); carries travel as pulses.
module.exports = {
  name: 'Binary counting and carries',
  async run(env, t) {
    for (const phone of [false, true]) {
      const where = phone ? 'phone' : 'desktop';
      let g = await env.game({ phone, save: { sparked: true, value: 1, bits: 0, lifetimeBits: 100000, upgrades: { secondBit: 1 } } });
      const bonus2 = await g.run(() => Upgrades.bitBonus({ upgrades: { secondBit: 1 } }));
      const steps = [['01 → 10 (a carry: 2 flips)', 2, 2], ['10 → 11 (1 flip)', 1, 3], ['11 → 00 (2 flips)', 2, 0]];
      for (const [what, flips, value] of steps) {
        const b0 = await g.bits();
        await g.tapBits();
        const s = await g.save();
        t.near(s.bits - b0, flips * bonus2, 0.01, `${where}: ${what} earns ${flips} × the 2-bit bonus`);
        t.eq(s.value, value, `${where}: ${what} lands on ${value}`);
      }
      const b0 = await g.bits();
      await g.tapAt(15, 300);
      t.eq(await g.bits(), b0, `${where}: a tap far from the bits doesn't count`);
      t.noErrors(g, where);
      await g.close();

      // Eight bits: a long carry and wrapping past 255
      const eight = { secondBit: 1, nextBit: 6 };
      g = await env.game({ phone, save: { sparked: true, value: 63, bits: 0, lifetimeBits: 100000, upgrades: eight, byteFormed: true } });
      const bonus8 = await g.run(u => Upgrades.bitBonus({ upgrades: u }), eight);
      await g.tapBits();
      let s = await g.save();
      t.near(s.bits, 7 * bonus8, 0.01, `${where}: 00111111 → 01000000 flips 7 bits`);
      t.eq(s.value, 64, `${where}: ...and lands on 64`);
      await g.close();
      g = await env.game({ phone, save: { sparked: true, value: 255, bits: 0, lifetimeBits: 100000, upgrades: eight, byteFormed: true } });
      await g.tapBits();
      s = await g.save();
      t.eq(s.value, 0, `${where}: 255 + 1 wraps round to 0`);
      t.near(s.bits, 8 * bonus8, 0.01, `${where}: ...flipping all 8 bits`);
      t.ok(s.stats.wraps >= 1, `${where}: the wrap is counted (for the Overflow achievement)`);
      await g.close();
    }

    // Saves from older versions still load
    let g = await env.game({ save: { sparked: true, bitOn: true, bits: 40, lifetimeBits: 40, upgrades: {} } });
    let s = await g.save(); await g.tapBits(); s = await g.save();
    t.ok(!('bitOn' in s), 'a one-bit-era save ("bitOn") converts to a value');
    await g.close();
    g = await env.game({ save: { sparked: true, value: 0, bits: 10, lifetimeBits: 60000, upgrades: { secondBit: 1 }, joinedBits: 3 } });
    await g.tapBits();
    s = await g.save();
    t.eq(s.upgrades.nextBit, 3, 'bits that once joined by themselves become owned Next Bits');
    t.ok(!('joinedBits' in s), '...and the old field is gone');
    t.ok((await g.cards()).includes('Sixth Bit'), '...so the next card is the Sixth Bit');
    t.noErrors(g);
    await g.close();
  }
};
