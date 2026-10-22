#!/usr/bin/env node
'use strict';
// 真正通过浏览器操作临时项目；不写回项目中的游戏配置或公告。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/usr/local/lib/node_modules/playwright');
const { tempProject } = require('./verify-games.cjs');
const { AnnouncementStore, GAMES_FILE } = require('./core.cjs');
const { startServer } = require('./server.cjs');
const { APP_FILE } = require('./app.cjs');

async function main() {
    const root = tempProject();
    let service;
    let browser;
    try {
        service = await startServer({ store: new AnnouncementStore({ root }), port: 0,
            refresh: async () => new Promise((resolve) => setTimeout(resolve, 80)) });
        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        page.on('dialog', (dialog) => dialog.accept());
        await page.goto(service.baseUrl);
        await page.waitForFunction(() => document.querySelectorAll('#game-list .item').length > 0);
        assert.equal(await page.locator('#announcement-workspace').isVisible(), false, '默认进入游戏配置');
        assert.equal(await page.locator('#game-save').isDisabled(), true);
        const originalCatalog = JSON.parse(fs.readFileSync(path.join(root, GAMES_FILE), 'utf8'));
        const originalApp = JSON.parse(fs.readFileSync(path.join(root, APP_FILE), 'utf8'));
        assert.equal(await page.locator('#game-form details, #game-field-cover, #game-field-loadingCover, #game-achievement-enabled, #game-field-bundle').count(), 0, '隐藏配置没有编辑控件');
        assert.ok(await page.locator('#game-field-name').evaluate((node) => parseFloat(getComputedStyle(node).fontSize)) > await page.locator('#game-field-version').evaluate((node) => parseFloat(getComputedStyle(node).fontSize)), '名称比版本信息醒目');
        await page.locator('#game-search').fill('猫咪');
        await page.locator('#game-list .item').click();
        await page.locator('#game-field-name').fill('猫咪数独新名字');
        await page.locator('#game-tag-new').uncheck();
        await page.locator('#game-tag-hot').check();
        const originalCat = originalCatalog.games.find((game) => game.id === 'meowdoku');
        await page.locator('#game-tag-input').fill('新分类');
        await page.locator('#game-tag-input').press('Enter');
        const chipCount = await page.locator('.tag-chip').count();
        await page.locator('#game-tag-input').fill('新分类');
        await page.locator('#game-tag-add').click();
        assert.equal(await page.locator('.tag-chip').count(), chipCount, '重复分类不能添加');
        assert.match(await page.locator('#game-tag-message').textContent(), /已经存在/);
        if (originalCat.tags.length) await page.getByRole('button', { name: '删除分类 ' + originalCat.tags[0], exact: true }).click();
        await page.locator('#game-search').fill('缤纷');
        await page.locator('#game-list .item').click();
        await page.locator('#game-field-description').fill('游戏简介也可以在统一页面修改');
        await page.locator('#game-search').fill('猫咪');
        await page.locator('#game-list .item').click();
        await page.locator('#tab-announcements').click();
        assert.equal(await page.locator('#game-workspace').isVisible(), false);
        await page.locator('#version').fill('1.3.0');
        await page.locator('#sections .section').nth(1).getByRole('button', { name: '＋ 添加游戏' }).click();
        const entry = page.locator('#sections .section').nth(1).locator('.entry');
        await entry.locator('select').selectOption('collection');
        await entry.locator('input').fill('大厅新增统一配置');
        await page.locator('#tab-games').click();
        assert.equal(await page.locator('#game-field-name').inputValue(), '猫咪数独新名字', '切换标签页保留游戏草稿');
        await page.locator('#game-save').click();
        await page.waitForFunction(() => document.querySelector('#game-status').textContent.includes('Cocos 资源已刷新'));
        const catalog = JSON.parse(fs.readFileSync(path.join(root, GAMES_FILE), 'utf8'));
        const cat = catalog.games.find((game) => game.id === 'meowdoku');
        assert.equal(cat.name, '猫咪数独新名字');
        assert.deepEqual(cat.lobbyTags, ['hot']);
        assert.deepEqual(cat.tags, [...originalCat.tags.slice(1), '新分类']);
        for (const key of ['cover', 'loadingCover', 'achievement', 'bundle', 'resourceBundle', 'scene', 'entryComponent', 'initializeTimeoutMs', 'preload']) {
            assert.deepEqual(cat[key], originalCat[key], '保存保留隐藏字段：' + key);
        }
        assert.equal(catalog.games.find((game) => game.id === 'multi-color-fill').description, '游戏简介也可以在统一页面修改', '切换游戏保留草稿并统一保存');
        assert.equal(await page.locator('#game-save').isDisabled(), true);
        await page.locator('#tab-announcements').click();
        assert.equal(await entry.locator('input').inputValue(), '大厅新增统一配置', '保存游戏不覆盖未保存的公告草稿');
        await page.locator('#save').click();
        await page.waitForFunction(() => document.querySelector('#status').textContent === '已保存');
        await page.locator('#activate').click();
        await page.waitForFunction(() => document.querySelector('#status').textContent === '已生效，Cocos 资源已刷新');
        assert.match(await page.locator('#plain').textContent(), /大厅新增统一配置/);

        await page.locator('#tab-games').click();
        await page.locator('#game-field-version').fill('bad');
        await page.locator('#game-save').click();
        await page.waitForFunction(() => !document.querySelector('#game-errors').hidden);
        await page.locator('#game-errors button').click();
        assert.equal(await page.locator('#game-field-version').inputValue(), 'bad', '校验失败保留输入');
        assert.match(await page.locator('#game-errors').textContent(), /游戏内容版本/);
        await page.locator('#game-field-version').fill('0.3.0');
        // 模拟另一个编辑器修改配置，保存必须报冲突且保留输入。
        fs.appendFileSync(path.join(root, GAMES_FILE), '\n');
        await page.locator('#game-save').click();
        await page.waitForFunction(() => document.querySelector('#game-status').textContent.includes('其他页面'));
        assert.equal(await page.locator('#game-field-version').inputValue(), '0.3.0');
        await page.locator('#game-reload').click();
        await page.waitForFunction(() => document.querySelector('#game-status').textContent === '已重新读取配置');
        assert.equal(await page.locator('#game-field-version').inputValue(), cat.version);

        await page.locator('#game-up').click();
        await page.locator('#game-save').click();
        await page.waitForFunction(() => document.querySelector('#game-status').textContent.includes('Cocos 资源已刷新'));
        const reordered = JSON.parse(fs.readFileSync(path.join(root, GAMES_FILE), 'utf8'));
        const oldIndex = catalog.games.findIndex((game) => game.id === 'meowdoku');
        assert.equal(reordered.games[oldIndex - 1].id, 'meowdoku');
        assert.deepEqual(reordered.games[oldIndex - 1].achievement, originalCat.achievement);

        // 广告与发布的草稿、保存范围和冲突版本彼此独立。
        await page.locator('#tab-ads').click();
        assert.equal(await page.locator('#ads-field-games-cyblockbees').count(), 0, '未接入广告的游戏不可伪造配置');
        await page.locator('#ads-field-games-meowdoku').uncheck();
        await page.locator('#ads-field-wechat-meowdokuToolRewarded').fill('adunit-browser-test');
        await page.locator('#ads-field-tapAdUnitId').fill('tap-browser-test');
        await page.locator('#tab-release').click();
        await page.locator('#release-field-appVersion').fill('2.0.0');
        await page.locator('#release-field-mockAds').check();
        await page.locator('#release-field-showDevelopmentGames').uncheck();
        await page.locator('#release-field-fontsEnabled').check();
        await page.locator('#release-field-validateFontCoverage').uncheck();
        await page.locator('#release-field-fontLoadTimeoutMs').fill('15000');
        await page.locator('#tab-ads').click();
        assert.equal(await page.locator('#ads-field-wechat-meowdokuToolRewarded').inputValue(), 'adunit-browser-test');
        await page.locator('#ads-save').click();
        await page.waitForFunction(() => document.querySelector('#ads-status').textContent.includes('Cocos 资源已刷新'));
        let savedApp = JSON.parse(fs.readFileSync(path.join(root, APP_FILE), 'utf8'));
        assert.equal(savedApp.ads.wechat.meowdokuToolRewarded.adUnitId, 'adunit-browser-test');
        assert.equal(savedApp.ads.games.meowdoku.enabled, false);
        assert.equal(savedApp.appVersion, originalApp.appVersion, '广告保存不能提交发布草稿');
        assert.deepEqual(savedApp.development, originalApp.development);
        await page.locator('#tab-release').click();
        assert.equal(await page.locator('#release-field-appVersion').inputValue(), '2.0.0', '广告保存保留发布草稿');
        assert.equal(await page.locator('#release-field-mockAds').isChecked(), true);
        await page.locator('#release-save').click();
        await page.waitForFunction(() => document.querySelector('#release-status').textContent.includes('Cocos 资源已刷新'));
        savedApp = JSON.parse(fs.readFileSync(path.join(root, APP_FILE), 'utf8'));
        assert.equal(savedApp.appVersion, '2.0.0');
        assert.equal(savedApp.development.mockAds, true);
        assert.equal(savedApp.fonts.enabled, true);
        assert.equal(savedApp.fonts.loadTimeoutMs, 15000);
        assert.equal(savedApp.ads.tap.rewardedVideo.adUnitId, 'tap-browser-test');
        for (const key of ['sharing', 'cloudSave', 'qualityProfiles', 'designResolution', 'renderLayers', 'timeouts']) {
            assert.deepEqual(savedApp[key], originalApp[key], '保留其他应用配置：' + key);
        }
        await page.locator('#release-field-appVersion').fill('bad');
        await page.locator('#release-save').click();
        await page.waitForFunction(() => !document.querySelector('#release-errors').hidden);
        await page.locator('#release-errors button').click();
        assert.equal(await page.locator('#release-field-appVersion').inputValue(), 'bad', '发布校验失败保留输入');
        await page.locator('#release-field-appVersion').fill('2.1.0');
        savedApp.development.mockAds = false;
        fs.writeFileSync(path.join(root, APP_FILE), JSON.stringify(savedApp, null, 2));
        await page.locator('#tab-ads').click();
        await page.locator('#ads-field-tapAdUnitId').fill('tap-second-save');
        await page.locator('#ads-save').click();
        await page.waitForFunction(() => document.querySelector('#ads-status').textContent.includes('Cocos 资源已刷新'));
        assert.match(await page.locator('#ads-summary').textContent(), /平台广告/, '保存后模式展示最新磁盘值，而不是其他页的旧草稿');
        await page.locator('#tab-release').click();
        assert.equal(await page.locator('#release-field-appVersion').inputValue(), '2.1.0');
        await page.locator('#release-save').click();
        await page.waitForFunction(() => document.querySelector('#release-status').textContent.includes('其他页面'));
        assert.equal(await page.locator('#release-field-appVersion').inputValue(), '2.1.0', '其他分区保存不消除发布页的外部冲突');
        await page.locator('#release-reload').click();
        await page.waitForFunction(() => document.querySelector('#release-status').textContent.includes('已重新读取'));
        assert.equal(await page.locator('#release-field-appVersion').inputValue(), '2.0.0');
        assert.equal(await page.locator('#release-field-mockAds').isChecked(), false);

        await page.locator('#tab-announcements').click();
        await page.locator('#remove').click();
        await page.waitForFunction(() => document.querySelector('#status').textContent.includes('游戏内公告已清空'));
        assert.equal(await page.locator('#list .item').count(), 0, '原公告删除流程可用');
        await page.locator('#tab-games').click();
        await page.setViewportSize({ width: 390, height: 844 });
        for (const tab of ['games', 'announcements', 'ads', 'release']) {
            await page.locator('#tab-' + tab).click();
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, tab + ' 窄屏页面没有横向溢出');
        }
        assert.deepEqual(errors, [], '浏览器没有未捕获异常');
        console.log('统一配置页面浏览器验证通过：四页切换、标签增删、隐藏字段保护、独立草稿与保存、冲突定位、公告操作与窄屏布局');
    } finally {
        if (browser) await browser.close();
        if (service) await new Promise((resolve) => { service.server.close(resolve); service.server.closeAllConnections(); });
        fs.rmSync(root, { recursive: true, force: true });
    }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
