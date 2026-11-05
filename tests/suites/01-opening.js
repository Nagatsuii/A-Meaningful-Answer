// The opening: "insufficient data" in the dark, taps ignored until it's done, then the first spark.
module.exports = {
  name: 'Opening and the first spark',
  async run(env, t) {
    for (const phone of [false, true]) {
      const where = phone ? 'phone' : 'desktop';
      const g = await env.game({ phone });
      await g.waitReal(1.6);
      t.ok(await g.visible('#opening .neon'), `${where}: "insufficient data" shows in the dark`);
      t.eq(await g.run(() => document.querySelector('#opening .neon').textContent.trim()), 'insufficient data', `${where}: the opening's words`);
      await g.tapBits();
      t.ok(!(await g.save()), `${where}: a tap during the opening is ignored`);
      const dark = await g.run(() => CONFIG.darknessSeconds);
      await g.waitReal(dark - 1.4);
      await g.tapBits();
      const s = await g.save();
      t.ok(s && s.sparked, `${where}: after the opening, a tap sparks the first bit`);
      t.eq(s.bits, 0, `${where}: the spark itself earns nothing`);
      await g.wait(await g.run(() => CONFIG.birthSeconds));
      t.ok(await g.visible('#counter'), `${where}: the counter appears once the bit is born`);
      t.noErrors(g, where);
      await g.close();
    }
  }
};
