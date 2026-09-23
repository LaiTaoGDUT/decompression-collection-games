// Real Cocos regression coverage for chained removal and region-owned feedback.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 750, height: 1334 } });
    const errors = []; page.on('pageerror', error => errors.push(String(error)));
    await page.goto(process.env.COCOS_PREVIEW_URL || 'http://localhost:7456', { waitUntil: 'networkidle' });
    await page.waitForFunction(async () => !!(await System.import('cc')).js.getClassByName('App')?.current);
    await page.evaluate(async () => {
      const cc = await System.import('cc'), app = cc.js.getClassByName('App').current;
      const services = Array.from(app.services.services.values());
      const runtime = services.find(s => typeof s.enterGame === 'function');
      await runtime.enterGame(services.find(s => typeof s.getById === 'function').getById('bubble-shooter'));
      window.check = { cc, runtime, e: runtime.entry };
    });
    await page.waitForFunction(() => !check.e.transitionView.active && !check.e.rowBirths.length);
    console.log(await page.evaluate(() => {
      const { cc, e } = check; e.state = 'paused';
      const require = (value, message) => { if (!value) throw Error(message); };
      require(e.attackFrame.name === 'attack-pearl-v1', 'ocean attack must use the pearl asset');
      require(e.node.getChildByName('CloudTransition').getComponent(cc.Sprite).spriteFrame.name === 'reef-ceiling-v2', 'new reef');
      for (const key of e.itemKeys) require(e.node.getChildByPath(`Playfield/Items/Item-${key}/NamePlate`).active, 'missing item name plate');
      require(e.node.getChildByPath('Playfield/Counter/PendingRow').getComponent(cc.UITransform).width === 32, 'preview icon size');
      require(e.rewardView.cards.every(c => c.badge.fontSize === 23), 'reward gain font');
      // A long same-row chain must keep propagating beyond the former 0.20s cap.
      const removed = Array.from({ length: 13 }, (_, col) => ({ row: 0, col, color: 'blue', frosted: false }));
      removed.forEach((b, i) => e.animateRemoval(b, false, 0, i));
      const effects = e.effects.slice(-13), delays = effects.map(f => f.motion.delay);
      require(delays.every((d, i) => i === 0 || d > delays[i - 1]), 'collapsed chain delays');
      require(delays[12] > .6, 'chain remains visibly sequential');
      e.state='playing'; e.update(.05); e.update(.05); e.state='paused';
      require(effects[0].node.scale.x !== 1 && effects[12].node.scale.x === 1, 'late bubble must wait unchanged');
      effects.forEach(f => f.node.destroy()); e.effects = [];
      e.juice.clear(); e.juice.theme = 'ocean'; e.juice.attach([], { x: 0, y: 0 });
      require(e.juice.marks.filter(m => m.water).length === 7, 'ocean contact spray');
      e.juice.clear(); e.juice.theme = 'cloud'; e.juice.attach([], { x: 0, y: 0 });
      require(!e.juice.marks.some(m => m.water), 'cloud must keep its own feedback');
      e.juice.clear(); e.juice.theme = 'ocean';
      e.particles.burst(removed[0], { x: 0, y: 0 });
      require(e.particles.count === 5, 'ocean particles must not require cloud shard textures');
      e.particles.clear();
      e.startAttack({ removed, dropped: [], phaseBefore: 0 });
      require(e.attack.elapsed < -.6, 'boss energy waits for the chain');
      require(e.attack.node.children.every(n => n.getComponent(cc.UIOpacity).opacity === 0), 'no early projectile');
      e.clearAttack();
      return 'Ocean assets, item plates, HUD sizes, reward font, 13-step chain, distinct contact effects, water particles and delayed boss attack passed.';
    }));
    for (const [width, height] of [[750, 1334], [750, 1000], [750, 1624]]) {
      await page.setViewportSize({ width, height });
      await page.evaluate(({ width, height }) => {
        const { cc, e } = check;
        cc.view.setFrameSize(width, height); cc.view.setDesignResolutionSize(750, 1334, cc.ResolutionPolicy.FIXED_WIDTH);
        e.applyLayout();
        const play = e.node.getChildByName('Playfield'), reef = e.node.getChildByName('CloudTransition');
        const bottom = reef.position.y - reef.getComponent(cc.UITransform).height / 2;
        const topBubble = play.position.y + (410 + 720 / 13 / 2) * play.scale.y;
        if (bottom >= topBubble) throw Error('reef floats above top row');
      }, { width, height });
      if (process.env.BUBBLE_CAPTURE_DIR) await page.screenshot({ path: `${process.env.BUBBLE_CAPTURE_DIR}/ocean-${height}.png` });
    }
    for (const angle of [-70, 70]) {
      await page.evaluate(angle => {
        const { cc, e } = check;
        const launcher=e.node.getChildByPath('Playfield/Launcher'),pivot=launcher.getChildByName('TurretPivot');
        pivot.angle=angle;
        const base=launcher.getChildByName('Pedestal'),ui=base.getComponent(cc.UITransform);
        if(base.position.y+ui.height/2<pivot.position.y)throw Error('socket no longer overlaps rotation axis');
      }, angle);
      if(process.env.BUBBLE_CAPTURE_DIR)await page.screenshot({path:`${process.env.BUBBLE_CAPTURE_DIR}/ocean-aim-${angle}.png`});
    }
    await page.evaluate(async () => { await check.runtime.exitGame(); });
    assert.deepEqual(errors, []);
    console.log('Three screen ratios and disposal passed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
