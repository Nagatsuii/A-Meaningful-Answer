// The hook (locked path and dark shimmer), then the black hole: closer at its goal, the fall, the next universe.
module.exports = {
  name: 'Hook and black hole',
  async run(env, t) {
    const byte = { secondBit: 1, nextBit: 6 };
    for (const phone of [false, true]) {
      const where = phone ? 'phone' : 'desktop';
      let g = await env.game({ phone, speed: 10 });
      const cfg = await g.run(() => ({ hookAt: CONFIG.hookAt, delay: CONFIG.hookShimmerDelay, goal: CONFIG.knowledge.unlockAchievement }));
      await g.close();

      // The hook
      g = await env.game({ phone, speed: 10, save: { sparked: true, value: 0, bits: 0, lifetimeBits: cfg.hookAt - 3, upgrades: byte, byteFormed: true, track: 'storage' } });
      await g.tapBits(2);
      await g.waitReal(0.3);
      t.ok((await g.save()).hookSeen, `${where}: the hook starts at ${cfg.hookAt.toLocaleString()} bits`);
      await g.wait(cfg.delay + 1);
      t.ok((await g.note()).startsWith('Far off, something dark'), `${where}: the dark shimmer's note`, await g.note());
      const h = await g.hole();
      const b0 = await g.bits();
      await g.tapAt(h.x, h.y);
      t.ok((await g.note()).startsWith('Not yet.'), `${where}: touching the dark: "Not yet"`, await g.note());
      t.eq(await g.bits(), b0, `${where}: ...and it doesn't count as a tap`);
      await g.close();

      // The black hole at its goal
      g = await env.game({ phone, speed: 10 });
      const goalBits = await g.run(id => { for (let b = 1; ; b *= 2) if (Achievements.byId(id).done({ lifetimeBits: b, stats: {}, upgrades: {} })) return b; }, cfg.goal);
      await g.close();
      g = await env.game({ phone, speed: 10, save: { sparked: true, value: 0, bits: 0, lifetimeBits: goalBits, upgrades: byte, byteFormed: true, track: 'logic', hookSeen: true, knowledge: 0, achievements: { carry: true } } });
      await g.wait(4);
      const hole = await g.hole();
      await g.tapAt(hole.x, hole.y);
      t.ok(!(await g.run(() => document.getElementById('confirm').hidden)), `${where}: at the ${cfg.goal} goal, touching the dark asks to fall`);
      const gain = await g.run(b => Math.floor(Math.sqrt(b / CONFIG.knowledge.divisor)), goalBits);
      t.ok((await g.run(() => document.getElementById('confirm-text').textContent)).includes(`carry ${gain} Knowledge`), `${where}: it offers ${gain} Knowledge`);
      await g.page.keyboard.press('Escape');
      t.ok(await g.run(() => document.getElementById('confirm').hidden), `${where}: Escape says "not yet"`);
      await g.tapAt(hole.x, hole.y);
      await g.page.locator('#confirm-yes').click();
      await g.wait(await g.run(() => CONFIG.knowledge.fallSeconds + CONFIG.knowledge.darkSeconds + 1));
      await g.waitReal(1);
      const s = await g.save();
      t.eq(s.universesCompleted, 1, `${where}: falling in starts universe 2`);
      t.eq(s.knowledge, gain, `${where}: carrying the Knowledge`);
      t.ok(!s.sparked && s.bits === 0 && !s.byteFormed && !s.track, `${where}: everything else starts again`);
      t.ok(s.achievements.carry, `${where}: achievements are kept`);
      t.ok(await g.run(() => document.getElementById('opening').classList.contains('warm')), `${where}: the new universe opens in warm neon`);
      t.ok((await g.run(() => document.getElementById('opening').textContent)).includes('universe 2'), `${where}: ...naming the universe`);
      t.noErrors(g, where);
      await g.close();
    }
    // In universe 2, Knowledge multiplies earning
    const g = await env.game({ save: { sparked: true, value: 0, bits: 0, lifetimeBits: 10, upgrades: {}, knowledge: 10, universesCompleted: 1 } });
    await g.tapBits();
    const mult = await g.run(() => Upgrades.knowledgeMultiplier({ knowledge: 10 }));
    t.eq(await g.bits(), mult, `10 Knowledge: a 1-bit tap earns ${mult}`);
    t.ok((await g.run(() => document.getElementById('knowledge').textContent)).includes('10 knowledge'), 'the Knowledge line shows under the counter');
    t.noErrors(g);
    await g.close();
  }
};
