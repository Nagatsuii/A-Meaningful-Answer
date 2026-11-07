// Universe 2's Memories phase: the abacus before the first spark, a moment of computing history with each
// bit, and the Punch Card that records your tapping and plays it back (also while you're away).
const KEY = 'a-meaningful-answer-save-v1';
const U2 = { universesCompleted: 1, knowledge: 10 };

module.exports = {
  name: 'Memories (universe 2)',
  async run(env, t) {
    // ---- the abacus ----
    for (const phone of [false, true]) {
      const where = phone ? 'phone' : 'desktop';
      const g = await env.game({ phone, save: { ...U2 } });
      const c = await g.run(() => ({ dark: CONFIG.darknessSeconds, beads: CONFIG.abacus.beads, carry: CONFIG.abacus.carrySeconds, fade: CONFIG.abacus.fadeSeconds }));
      await g.waitReal(c.dark + 0.3);
      await g.tapBits(3);
      let s = await g.save();
      t.eq(s.abacus, 3, `${where}: each tap slides a bead`);
      t.ok(!s.sparked, `${where}: the bit hasn't sparked yet`);
      await g.tapBits(c.beads - 3);
      t.ok(!(await g.noteShowing()), `${where}: no note before the carry`);
      await g.tapBits(1); // the tenth: the carry
      s = await g.save();
      t.eq(s.abacus, c.beads + 1, `${where}: the tenth tap carries into the tens`);
      t.ok((await g.note()).startsWith('A carry, made by hand.'), `${where}: the abacus memory`, await g.note());
      t.ok(await g.run(() => document.getElementById('note').classList.contains('memory')), `${where}: shown as a memory (sepia)`);
      t.ok(s.memoriesSeen.includes('abacus'), `${where}: and remembered`);
      await g.tapBits(1);
      t.ok(!(await g.save()).sparked, `${where}: a tap while the abacus fades is ignored`);
      await g.waitReal(c.carry + c.fade + 0.3);
      await g.tapBits(1);
      t.ok((await g.save()).sparked, `${where}: then the bit sparks`);
      t.noErrors(g, where);
      await g.close();
    }

    // Reloading between the carry and the spark goes straight to the glow.
    let g = await env.game({ save: { ...U2, abacus: 10 } });
    await g.waitReal(await g.run(() => CONFIG.darknessSeconds + 0.3));
    await g.tapBits(1);
    t.ok((await g.save()).sparked, 'after a reload past the carry, a tap sparks the bit');
    await g.close();

    // The first universe has no abacus: its first tap sparks the bit.
    g = await env.game({});
    await g.waitReal(await g.run(() => CONFIG.darknessSeconds + 0.3));
    await g.tapBits(1);
    t.ok((await g.save()).sparked, 'universe 1: no abacus, the first tap sparks');
    await g.close();

    // ---- memories with each bit ----
    const bitSave = { ...U2, sparked: true, abacus: 10, value: 0 };
    g = await env.game({ speed: 10, save: { ...bitSave, bits: 30000, lifetimeBits: 30000 } });
    await g.buy('Second Bit');
    await g.wait(await g.run(() => CONFIG.birthSeconds + 0.5));
    t.ok((await g.note()).startsWith('1804'), 'the second bit brings back Jacquard\'s loom', await g.note());
    t.ok(await g.run(() => document.getElementById('note').classList.contains('memory')), '...as a memory');
    t.noErrors(g, 'second bit');
    await g.close();

    const expected = { 'Fifth Bit': ['1890', 2], 'Sixth Bit': ['1945', 3], 'Seventh Bit': ['1962', 4] };
    for (const [card, [year, owned]] of Object.entries(expected)) {
      g = await env.game({ speed: 10, watch: ['resonance'], save: { ...bitSave, bits: 1e7, lifetimeBits: 1e7, upgrades: { secondBit: 1, nextBit: owned } } });
      await g.buy(card);
      await g.wait(await g.run(() => CONFIG.birthSeconds + 0.5));
      t.ok((await g.note()).startsWith(year), `${card}: the ${year} memory`, await g.note());
      if (card === 'Fifth Bit') t.eq((await g.soundCalls('resonance')).length, 1, 'bit 5 still resonates in universe 2');
      await g.close();
    }
    // (lifetime bits kept under the fork's threshold, so the paths don't open over the note)
    g = await env.game({ speed: 10, save: { ...bitSave, bits: 2e5, lifetimeBits: 2e5, upgrades: { secondBit: 1, nextBit: 5 } } });
    await g.buy('Eighth Bit');
    await g.wait(await g.run(() => CONFIG.birthSeconds + CONFIG.byteDelaySeconds + CONFIG.byteGatherSeconds + CONFIG.byteSweepSeconds + 0.5));
    t.ok((await g.note()).includes('Werner Buchholz'), 'the byte remembers who named it', await g.note());
    t.noErrors(g, 'byte');
    await g.close();

    // Universe 1 keeps its own notes.
    g = await env.game({ speed: 10, save: { sparked: true, value: 0, bits: 30000, lifetimeBits: 30000 } });
    await g.buy('Second Bit');
    await g.wait(await g.run(() => CONFIG.birthSeconds + 0.5));
    t.ok((await g.note()).startsWith('Two bits.'), 'universe 1: "Two bits. Four possible states"', await g.note());
    t.ok(!(await g.cards()).includes('Punch Card'), 'universe 1: no Punch Card');
    await g.close();

    // ---- the punch card ----
    for (const phone of [false, true]) {
      const where = phone ? 'phone' : 'desktop';
      g = await env.game({ phone, save: { ...bitSave, bits: 1e5, lifetimeBits: 1e5, upgrades: { secondBit: 1, amplifier: 3 } } });
      t.ok((await g.cards()).includes('Punch Card'), `${where}: universe 2 offers the Punch Card`);
      await g.buy('Punch Card');
      t.ok((await g.note()).startsWith('A blank punch card.'), `${where}: a blank card, waiting for taps`);
      const holes = await g.run(() => CONFIG.upgrades.punchCard.holes);
      for (let i = 0; i < holes; i++) { await g.tapBits(1); await g.waitReal(0.25); }
      let s = await g.save();
      t.eq(s.punch.length, holes, `${where}: ${holes} taps punch ${holes} holes`);
      // Hands off: the card plays the rhythm back by itself.
      const before = (await g.save()).stats.taps;
      const bits0 = await g.run(k => JSON.parse(localStorage.getItem(k)).lifetimeBits, KEY);
      await g.waitReal(4);
      s = await g.save();
      t.ok(s.lifetimeBits > bits0, `${where}: with no taps, the card keeps earning`, { before: bits0, after: s.lifetimeBits });
      t.eq(s.stats.taps, before, `${where}: (and it isn't counted as your own taps)`);
      t.ok(s.punchPlayed, `${where}: it has played back`);
      t.ok(s.memoriesSeen.includes('vaughan'), `${where}: Dorothy Vaughan's memory`);
      t.ok(s.achievements.storedProgram, `${where}: the Stored Program achievement`);
      const rate = await g.run(() => Upgrades.punchTapsPerSecond(JSON.parse(localStorage.getItem('a-meaningful-answer-save-v1'))));
      t.ok(rate > 1 && rate < 6, `${where}: it plays at about the rhythm you tapped`, rate);
      t.noErrors(g, where);
      await g.close();
    }

    // A second card makes every hole count twice.
    const recorded = new Array(12).fill(0.5);
    const one = await (async () => { const x = await env.game({ save: { ...bitSave, upgrades: { secondBit: 1, punchCard: 1 }, punch: recorded } }); const r = await x.run(() => Upgrades.punchTapsPerSecond(JSON.parse(localStorage.getItem('a-meaningful-answer-save-v1')))); await x.close(); return r; })();
    g = await env.game({ save: { ...bitSave, upgrades: { secondBit: 1, punchCard: 2 }, punch: recorded } });
    const two = await g.run(() => Upgrades.punchTapsPerSecond(JSON.parse(localStorage.getItem('a-meaningful-answer-save-v1'))));
    t.near(two, one * 2, 0.001, 'two cards: twice the taps');
    await g.close();

    // Time away: the card kept playing.
    g = await env.game({ save: { ...bitSave, bits: 0, lifetimeBits: 50000, upgrades: { secondBit: 1, punchCard: 1, amplifier: 2 }, punch: recorded, punchPlayed: true, lastSeen: Date.now() - 3600 * 1000 } });
    await g.waitReal(1.5);
    const away = await g.save();
    const expectTaps = 3600 * 2; // 12 holes every 6 seconds = 2 taps a second, for an hour
    t.ok(away.bits > expectTaps, 'while away for an hour, the punch card kept earning', away.bits);
    t.ok((await g.note()).startsWith('Welcome back'), 'and the welcome-back note says so');
    await g.close();

    // Memories carry into the next universe.
    g = await env.game({ dev: true, save: { ...bitSave, upgrades: { secondBit: 1 }, memoriesSeen: ['abacus', 'loom'], hookSeen: true } });
    await g.devTool('Fall in now');
    await g.waitReal(await g.run(() => CONFIG.knowledge.fallSeconds + CONFIG.knowledge.darkSeconds + 1.5));
    const next = await g.save();
    t.eq(next.universesCompleted, 2, 'falling in starts universe 3');
    t.ok(next.memoriesSeen.includes('loom'), 'and the memories seen come along');
    t.eq(next.abacus, 0, 'the abacus waits again');
    await g.close();
  }
};
