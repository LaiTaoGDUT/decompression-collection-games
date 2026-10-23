'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const hooks = require('../../extensions/cloud-save-build/hooks');
const builder = require('../../extensions/cloud-save-build/builder');

async function main() {
    assert.deepEqual(builder.configs, { wechatgame: { hooks: './hooks' } });
    assert.equal(hooks.throwError, true, 'Preparation failure must fail the build');

    // 其他平台或 Tap 转换没有微信工程产物，也不应执行准备。
    await hooks.onAfterBuild({ platform: 'web-mobile' });
    await hooks.onAfterBuild({ platform: 'wechatgame', packages: {
        'taptap-minigame-tools': { enableTapConvert: true },
    } });

    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-save-build-'));
    try {
        for (const customRoot of [undefined, 'backend/']) {
            const dest = path.join(temp, customRoot ? 'custom output' : 'wechatgame-001');
            fs.mkdirSync(dest);
            const original = { appid: 'wx-test', setting: { es6: true },
                ...(customRoot ? { cloudfunctionRoot: customRoot } : {}),
                packOptions: { ignore: [{ type: 'file', value: 'local-only.json' }],
                    include: [{ type: 'file', value: 'game.js' }] } };
            const configPath = path.join(dest, 'project.config.json');
            fs.writeFileSync(configPath, JSON.stringify(original));
            fs.writeFileSync(path.join(dest, 'game.js'), 'game runtime');
            const options = { platform: 'wechatgame' };
            await hooks.onAfterBuild(options, { dest });

            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            const functionRoot = customRoot || 'cloudfunctions/';
            assert.deepEqual(config, { ...original, cloudfunctionRoot: functionRoot,
                packOptions: { ...original.packOptions,
                    ignore: [...original.packOptions.ignore, { type: 'folder', value: functionRoot.slice(0, -1) }] } });
            assert.equal(fs.readFileSync(path.join(dest, 'game.js'), 'utf8'), 'game runtime');
            for (const relative of ['index.js', 'handler.js', 'package.json', 'config.json',
                'generated/CloudSaveCodec.js', 'generated/CloudSaveProjection.js', 'generated/catalog.json']) {
                assert.deepEqual(fs.readFileSync(path.join(dest, functionRoot, 'cloudSave', relative)),
                    fs.readFileSync(path.join(root, 'cloudfunctions/cloudSave', relative)), relative);
            }

            // 重复构建保持原有配置，且不重复添加上传忽略项。
            await hooks.onAfterBuild(options, { dest });
            assert.deepEqual(JSON.parse(fs.readFileSync(configPath, 'utf8')), config);
        }
        await assert.rejects(hooks.onAfterBuild({ platform: 'wechatgame' }, { dest: path.join(temp, 'missing') }),
            { code: 'ENOENT' }, 'A missing generated project must not be silently accepted');
        require('../../project-scripts/cloud-save/prepare.cjs').prepare(true);
        console.log('Cloud save build hooks: PASS');
    } finally {
        fs.rmSync(temp, { recursive: true, force: true });
    }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
