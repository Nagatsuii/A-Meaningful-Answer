// The testing switches in the page address: ?speed= (bits earned), ?reset, and combinations.
module.exports = {
  name: 'Address switches',
  async run(env, t) {
    const save = { sparked: true, value: 0, bits: 0, lifetimeBits: 50, upgrades: {} };
    let g = await env.game({ save });
    await g.tapBits();
    t.eq(await g.bits(), 1, 'normally a 1-bit tap earns 1');
    await g.close();

    g = await env.game({ save, query: '?speed=20' });
    await g.tapBits();
    t.eq(await g.bits(), 20, '?speed=20: a tap earns 20');
    t.eq(await g.run(() => document.getElementById('test-badge').textContent), 'BITS ×20', '?speed=20 shows a "BITS ×20" badge');
    await g.close();

    g = await env.game({ save: { ...save, upgrades: { oscillator: 1 }, lastSeen: Date.now() - 3600e3 }, query: '?speed=20' });
    await g.waitReal(0.5);
    const want = await g.run(() => Upgrades.flipsPerSecond({ upgrades: { oscillator: 1 } }) * 3600 * 20);
    t.near(await g.bits(), want, want * 0.01, '?speed=20 also multiplies time away');
    await g.close();

    g = await env.game({ save: { ...save, bits: 999 }, query: '?reset&speed=50' });
    t.eq(new URL(g.page.url()).search, '?speed=50', '?reset&speed=50 wipes the save but keeps ?speed=50 in the address');
    t.ok(!((await g.save()) || {}).sparked, '...and the game starts from the dark');
    await g.close();

    for (const [q, badge] of [['?speed=banana', ''], ['?speed=99999', 'BITS ×1000']]) {
      g = await env.game({ save, query: q });
      t.eq(await g.run(() => { const b = document.getElementById('test-badge'); return b.hidden ? '' : b.textContent; }), badge, `${q} ${badge ? 'is capped' : 'is ignored'}`);
      t.noErrors(g, q);
      await g.close();
    }
  }
};
