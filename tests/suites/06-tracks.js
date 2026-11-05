// The Storage or Logic choice, and what each track's upgrades do.
module.exports = {
  name: 'Storage and Logic',
  async run(env, t) {
    const byte = { secondBit: 1, nextBit: 6 };
    const formed = (extra) => ({ sparked: true, value: 0, bits: 0, byteFormed: true, ...extra, upgrades: { ...byte, ...(extra.upgrades || {}) } });

    // The choice opens at its milestone; choosing a track shows only that track's upgrades
    for (const phone of [false, true]) {
      const where = phone ? 'phone' : 'desktop';
      let g = await env.game({ phone, speed: 10 });
      const at = await g.run(() => CONFIG.trackChoiceAt);
      await g.close();
      g = await env.game({ phone, speed: 10, save: formed({ lifetimeBits: at - 3 }) });
      t.ok(await g.run(() => document.getElementById('choice').hidden), `${where}: no choice before ${at.toLocaleString()} bits`);
      await g.tapBits(2);
      await g.wait(3);
      t.ok(await g.run(() => !document.getElementById('choice').hidden && document.getElementById('choice').classList.contains('open')), `${where}: the two paths open`);
      await g.page.locator('.path-storage').click();
      await g.wait(4);
      t.eq((await g.save()).track, 'storage', `${where}: Storage chosen`);
      const cards = await g.cards();
      t.ok(cards.includes('Latch') && cards.includes('Memory Cell'), `${where}: Storage's first upgrades appear`, cards);
      t.ok(!cards.includes('NOT Gate'), `${where}: Logic's don't`);
      await g.page.reload(); await g.waitReal(0.8);
      t.ok(await g.run(() => document.getElementById('choice').hidden), `${where}: the choice doesn't come back after a reload`);
      t.noErrors(g, where);
      await g.close();
    }

    // Storage: memory cells earn steadily, even with no oscillators; Latch and Register stretch time away
    let g = await env.game({ save: formed({ lifetimeBits: 3e6, track: 'storage', upgrades: { memoryCell: 1 } }) });
    const perSecond = await g.run(() => { const s = JSON.parse(localStorage.getItem('a-meaningful-answer-save-v1')); return Upgrades.trickle(s) * Upgrades.productionMultiplier(s); });
    let b0 = await g.bits();
    await g.waitReal(4); await g.page.reload(); await g.waitReal(0.3);
    t.near((await g.bits()) - b0, perSecond * 4, perSecond * 1.5, `a Memory Cell earns about ${Math.round(perSecond)} a second on its own`);
    await g.close();
    const away = formed({ lifetimeBits: 3e6, track: 'storage', upgrades: { latch: 1, register: 1, memoryCell: 1 }, lastSeen: Date.now() - 10 * 3600e3 });
    g = await env.game({ save: away });
    await g.waitReal(0.5);
    const want = await g.run(s => Upgrades.trickle(s) * Math.min(10, Upgrades.offlineHours(s)) * 3600 * Upgrades.offlineMultiplier(s) * Upgrades.productionMultiplier(s), away);
    t.near(await g.bits(), want, want * 0.01, '10 hours away with a Latch, Register and Memory Cell');
    t.noErrors(g);
    await g.close();

    // Logic: gates change what a step earns (checked against flips counted by hand)
    const logic = (value, upgrades) => formed({ lifetimeBits: 3e6, track: 'logic', value, upgrades });
    const tapGain = async (value, upgrades) => {
      const game = await env.game({ save: logic(value, upgrades) });
      await game.tapBits();
      const got = await game.bits();
      const bonus = await game.run(u => Upgrades.bitBonus({ upgrades: u }), { ...byte, ...upgrades });
      const cfg = await game.run(() => CONFIG.upgrades);
      await game.close();
      return { got, bonus, cfg };
    };
    let r = await tapGain(63, { notGate: 1 });
    t.near(r.got, (1 + 6 * (1 + r.cfg.notGate.carryBonusEach)) * r.bonus, 0.01, 'NOT gate: 00111111 → 01000000 (6 carries) pays carries double');
    r = await tapGain(2, { andGate: 1 });
    t.near(r.got, 1 * (1 + r.cfg.andGate.bonusEach) * r.bonus, 0.01, 'AND gate: a tap that leaves …11 earns its bonus');
    r = await tapGain(3, { andGate: 1 });
    t.near(r.got, 3 * r.bonus, 0.01, 'AND gate: a tap that leaves …00 earns no bonus (3 flips)');
    r = await tapGain(63, { ifThenElse: 1 });
    t.near(r.got, 7 * r.cfg.ifThenElse.thenMultiplier * r.bonus, 0.01, 'IF · THEN · ELSE: a carry takes the THEN branch');
    r = await tapGain(2, { ifThenElse: 1 });
    t.near(r.got, 1 * r.cfg.ifThenElse.elseMultiplier * r.bonus, 0.01, 'IF · THEN · ELSE: no carry takes the ELSE branch');

    // The rule under the byte shows the config's numbers, and the averages match counting one step at a time
    g = await env.game({ save: logic(63, { ifThenElse: 1 }) });
    await g.tapBits(); await g.waitReal(0.3);
    const checks = await g.run(() => {
      const u = CONFIG.upgrades.ifThenElse;
      const card = Upgrades.text({ upgrades: {} }, 'ifThenElse', 'effect');
      const st = { upgrades: { secondBit: 1, nextBit: 6, ifThenElse: 1, notGate: 1, orGate: 1 } };
      let total = 0, v = 0;
      for (let k = 0; k < 256 * 20; k++) { const r = Upgrades.step(st, v, 1, 'osc'); total += r.gain; v = r.next; }
      return { card, then: u.thenMultiplier, else: u.elseMultiplier, average: Upgrades.averageStepEarning(st, 1, 'osc'), counted: total / (256 * 20) };
    });
    t.ok(checks.card.includes(`×${checks.then}`) && checks.card.includes(`×${checks.else}`), 'the IF card quotes its numbers from config', checks.card);
    t.near(checks.average, checks.counted, 1e-9, 'the average used for time away matches counting step by step');
    t.noErrors(g);
    await g.close();
  }
};
