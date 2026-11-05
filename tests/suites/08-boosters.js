// Boosters: lightning (a burst of bits) and the light pulse (a timed multiplier); when they appear and vanish.
module.exports = {
  name: 'Boosters',
  async run(env, t) {
    const save = { sparked: true, value: 0, bits: 0, lifetimeBits: 100000, upgrades: { oscillator: 10, secondBit: 1, nextBit: 2 } };
    for (const phone of [false, true]) {
      const where = phone ? 'phone' : 'desktop';
      const g = await env.game({ phone, dev: true, save, watch: ['boosterAppear', 'boosterCatch'] });
      const cfg = await g.run(() => CONFIG.boosters);

      // Lightning
      await g.devTool('Lightning now');
      await g.page.locator('.dev-close').click();
      t.eq(await g.run(() => Boosters.activeKind()), 'lightning', `${where}: a lightning bolt appears`);
      t.eq((await g.soundCalls('boosterAppear')).length, 1, `${where}: ...with a crackle`);
      const perSecond = await g.run(s => Upgrades.bitsPerSecond(s), save);
      const burst = await g.run(([s, c, p]) => Math.max(c.lightningRewardMin, p * c.lightningRewardSeconds) * Upgrades.productionMultiplier(s), [save, cfg, perSecond]);
      let b0 = await g.bits();
      const spot = await g.run(() => Boosters.where());
      await g.tapAt(spot.x, spot.y);
      t.ok(!(await g.run(() => Boosters.activeKind())), `${where}: tapping it catches it`);
      t.eq((await g.soundCalls('boosterCatch')).length, 1, `${where}: ...with a zap`);
      t.near((await g.bits()) - b0, burst, burst * 0.15 + 5, `${where}: lightning pays about ${cfg.lightningRewardSeconds} s of production`);

      // Light pulse
      await g.devTool('Light pulse now');
      await g.page.locator('.dev-close').click();
      await g.waitReal(0.4);
      const p = await g.run(() => Boosters.where());
      await g.tapAt(p.x, p.y);
      await g.waitReal(0.3);
      t.ok(await g.visible('#boost'), `${where}: a light pulse starts the boost timer`);
      t.eq(await g.run(() => document.querySelector('#boost .boost-text').textContent), `×${cfg.pulseMultiplier} production · ${cfg.pulseSeconds}s`, `${where}: the timer`);
      b0 = await g.bits(); await g.waitReal(4); await g.page.evaluate(() => 0);
      const boosted = (await g.run(() => JSON.parse(localStorage.getItem('a-meaningful-answer-save-v1')).bits)) - b0;
      await g.page.reload(); await g.waitReal(0.3);
      b0 = await g.bits(); await g.waitReal(4.3); await g.page.reload(); await g.waitReal(0.3);
      const normal = (await g.bits()) - b0;
      t.ok(boosted > normal * (cfg.pulseMultiplier * 0.6), `${where}: production is about ×${cfg.pulseMultiplier} during the boost`, { boosted, normal });

      // Left alone, a booster vanishes
      await g.devTool('Lightning now');
      await g.page.locator('.dev-close').click();
      await g.waitReal(cfg.lightningLifeSeconds + 0.6);
      t.ok(!(await g.run(() => Boosters.activeKind())), `${where}: a missed lightning bolt vanishes after ${cfg.lightningLifeSeconds} s`);
      t.noErrors(g, where);
      await g.close();
    }

    // How often they appear, at 100x game speed: not tapping vs tapping, and never closer than the cap
    const counts = {}, gaps = {};
    for (const [label, tapsPerSecond] of [['not tapping', 0], ['tapping', 4]]) {
      const g = await env.game({ speed: 100, save, watch: ['boosterAppear'] });
      const c = await g.centre();
      const start = Date.now();
      while (Date.now() - start < 30000) {
        if (tapsPerSecond) { await g.page.mouse.click(c.x, c.y); await g.page.waitForTimeout(1000 / tapsPerSecond - 20); }
        else await g.page.waitForTimeout(500);
      }
      const times = await g.run(() => (window.soundLog || []).filter(x => x.name === 'boosterAppear').map(x => x.at));
      counts[label] = times.length;
      // shortest gap between appearances, in game seconds (real milliseconds × the speed ÷ 1000)
      gaps[label] = Math.min(...times.slice(1).map((at, i) => (at - times[i]) * 100 / 1000));
      t.noErrors(g, label);
      await g.close();
    }
    t.ok(counts['not tapping'] >= 10, `boosters appear on their own (${counts['not tapping']} in ~50 game minutes)`);
    t.ok(counts['tapping'] > counts['not tapping'], `faster tapping brings more (${counts['tapping']} vs ${counts['not tapping']})`);
    const minGap = await (async () => { const g = await env.game({}); const m = await g.run(() => CONFIG.boosters.minGapSeconds); await g.close(); return m; })();
    for (const label of Object.keys(gaps)) {
      t.ok(gaps[label] >= minGap * 0.95, `${label}: never two within the ${minGap} s cap (shortest gap ${Math.round(gaps[label])} s)`);
    }
  }
};
