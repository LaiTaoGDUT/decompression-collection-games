'use strict';
let appState = null;
let appSavedState = null;
const appDrafts = { ads: null, release: null };
const appDirtyFlags = { ads: false, release: false };
const cloneConfig = (value) => JSON.parse(JSON.stringify(value));
function appDirty() { return appDirtyFlags.ads || appDirtyFlags.release; }

function setAppStatus(section, text, kind = '') {
    $(section + '-status').textContent = text;
    $(section + '-status').className = 'status ' + kind;
}

function appFieldId(section, key) { return section + '-field-' + key.replaceAll('.', '-'); }
function appValue(section, key) { return key.split('.').reduce((value, part) => value?.[part], appDrafts[section]); }
function updateAppValue(section, key, value) {
    const parts = key.split('.');
    const object = parts.length === 2 ? appDrafts[section][parts[0]] : appDrafts[section];
    object[parts[parts.length - 1]] = value;
    appDirtyFlags[section] = JSON.stringify(appDrafts[section]) !== JSON.stringify(appState[section].value);
    setAppStatus(section, appDirtyFlags[section] ? '有未保存的修改' : '修改已还原');
    renderAppSummaries();
    renderAppToolbars();
}

function appInput(section, key, title, hint = '', type = 'text') {
    const label = document.createElement('label');
    label.className = 'settings-field';
    label.dataset.field = key;
    const name = document.createElement('span');
    name.textContent = title;
    const input = document.createElement('input');
    input.id = appFieldId(section, key);
    input.type = type;
    if (type === 'number') { input.step = '1'; input.min = '1'; }
    input.value = appValue(section, key);
    input.oninput = () => updateAppValue(section, key, type === 'number' ? (input.value === '' ? null : Number(input.value)) : input.value);
    label.append(name, input);
    if (hint) {
        const note = document.createElement('small');
        note.textContent = hint;
        label.appendChild(note);
    }
    return label;
}

function appToggle(section, key, title, hint = '') {
    const label = document.createElement('label');
    label.className = 'app-toggle';
    label.dataset.field = key;
    const copy = document.createElement('span');
    copy.className = 'app-toggle-copy';
    const name = document.createElement('strong');
    name.textContent = title;
    copy.appendChild(name);
    if (hint) {
        const note = document.createElement('small');
        note.textContent = hint;
        copy.appendChild(note);
    }
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.id = appFieldId(section, key);
    check.checked = appValue(section, key);
    check.onchange = () => updateAppValue(section, key, check.checked);
    label.append(copy, check);
    return label;
}

function appCard(title, note, primary = false) {
    const card = document.createElement('div');
    card.className = 'card' + (primary ? ' priority-card' : '');
    const heading = document.createElement('h2');
    heading.textContent = title;
    const description = document.createElement('p');
    description.className = 'section-note';
    description.textContent = note;
    card.append(heading, description);
    return card;
}

function appGameName(game) { return state?.games.find((item) => item.id === game.id)?.name || game.name; }

function renderAdsForm() {
    const form = $('ads-form');
    form.textContent = '';
    const games = appCard('游戏广告入口与微信广告位', '入口开关控制该游戏是否允许进入广告流程。广告单元 ID 留空时，该广告位未配置。', true);
    const rows = document.createElement('div');
    appState.games.forEach((game) => {
        const row = document.createElement('div');
        row.className = 'ad-row';
        const head = document.createElement('div');
        head.className = 'ad-row-head';
        const title = document.createElement('div');
        title.className = 'ad-row-name';
        const name = document.createElement('strong');
        name.textContent = appGameName(game);
        const use = document.createElement('small');
        const placement = appState.placements.find((item) => item.gameId === game.id);
        use.textContent = placement ? '激励视频 · ' + placement.label : game.supportsAds ? '游戏广告入口开关' : '当前游戏未接入广告';
        title.append(name, use);
        head.appendChild(title);
        if (placement) {
            const badge = document.createElement('span');
            badge.id = 'ad-state-' + placement.key;
            head.appendChild(badge);
        }
        if (game.supportsAds) head.appendChild(appToggle('ads', 'games.' + game.id, '开启入口'));
        row.appendChild(head);
        if (placement) row.appendChild(appInput('ads', 'wechat.' + placement.key, '微信广告单元 ID', '留空表示未配置；填写微信后台提供的广告单元 ID。'));
        else if (game.supportsAds) {
            const note = document.createElement('p');
            note.className = 'sidebar-note';
            note.textContent = '当前没有独立的微信广告位。';
            row.appendChild(note);
        }
        rows.appendChild(row);
    });
    games.appendChild(rows);
    const tap = appCard('Tap 共用激励视频', 'Tap 平台的所有游戏共用一个激励视频广告单元。');
    tap.appendChild(appInput('ads', 'tapAdUnitId', 'Tap 广告单元 ID', '留空表示未配置。'));
    form.append(games, tap);
    renderAppSummaries();
}

function renderReleaseForm() {
    const form = $('release-form');
    form.textContent = '';
    const version = appCard('合集发布版本', '用于合集版本识别、游戏最低版本判断与新公告的默认版本号。', true);
    version.appendChild(appInput('release', 'appVersion', '合集版本号', '如 0.2.0；支持标准语义版本。公告的版本号仍在版本公告页单独保存。'));
    const development = appCard('开发调试', '按当前测试需要设置；保存后重新启动预览读取。');
    development.append(
        appToggle('release', 'showDevelopmentGames', '显示开发中的游戏', '在浏览器开发预览里显示“仅开发预览”的游戏；微信发布版仍不展示。'),
        appToggle('release', 'mockAds', '使用模拟广告', '浏览器与微信端使用模拟广告流程；Tap 平台始终使用真实广告服务。'),
    );
    const fonts = appCard('字体设置', '控制字体分包加载和构建时的缺字检查。');
    fonts.append(
        appToggle('release', 'fontsEnabled', '启用自定义字体', '启动时加载并绑定字体；关闭后使用系统字体。'),
        appToggle('release', 'validateFontCoverage', '检查字体缺字', '构建与命令行校验开关，不影响运行时加载。'),
        appInput('release', 'fontLoadTimeoutMs', '字体加载超时（毫秒）', '正整数；默认 10000 毫秒。', 'number'),
    );
    form.append(version, development, fonts);
    renderAppSummaries();
}

function summaryChip(container, title, value) {
    const chip = document.createElement('span');
    chip.className = 'summary-chip';
    const number = document.createElement('strong');
    number.textContent = value;
    chip.append(title + ' ', number);
    container.appendChild(chip);
}

function renderAppSummaries() {
    if (!appState) return;
    const ads = $('ads-summary');
    ads.textContent = '';
    summaryChip(ads, '广告入口已开启', Object.values(appDrafts.ads.games).filter(Boolean).length + ' / ' + Object.keys(appDrafts.ads.games).length);
    summaryChip(ads, '微信广告位已填写', Object.values(appDrafts.ads.wechat).filter((id) => id.trim()).length + ' / ' + appState.placements.length);
    summaryChip(ads, 'Tap 广告位', appDrafts.ads.tapAdUnitId.trim() ? '已填写' : '未配置');
    summaryChip(ads, '已保存的广告模式', appSavedState.release.value.mockAds ? '模拟广告（Tap 除外）' : '平台广告');
    appState.placements.forEach((placement) => {
        const badge = $('ad-state-' + placement.key);
        if (!badge) return;
        const enabled = appDrafts.ads.games[placement.gameId];
        const configured = Boolean(appDrafts.ads.wechat[placement.key].trim());
        badge.textContent = !enabled ? '入口关闭' : configured ? '已填写广告位' : '待配置广告位';
        badge.className = 'ad-state' + (enabled && configured ? ' ready' : '');
    });
    const release = $('release-summary');
    release.textContent = '';
    summaryChip(release, '合集版本', appDrafts.release.appVersion || '未填写');
    summaryChip(release, '模拟广告', appDrafts.release.mockAds ? '开启' : '关闭');
    summaryChip(release, '开发游戏预览', appDrafts.release.showDevelopmentGames ? '开启' : '关闭');
}

function renderAppToolbars() {
    if (!appState) return;
    ['ads', 'release'].forEach((section) => {
        $(section + '-save').disabled = pending || !appDirtyFlags[section];
        $('tab-' + section).dataset.dirty = String(appDirtyFlags[section]);
    });
}

function renderAppSidebar(section) {
    $('settings-sidebar-title').textContent = section === 'ads' ? '广告配置' : '发布与调试';
    $('settings-sidebar-note').textContent = section === 'ads'
        ? '保存此页只更新广告入口和广告位。模拟广告开关在“发布与调试”中设置。'
        : '保存此页只更新合集版本、开发开关和字体设置。';
    if (section === 'ads') renderAdsForm();
}

/** 有草稿的其他分区保留原版本，后续保存仍能发现外部冲突。 */
function acceptAppState(next, savedSection) {
    const previous = appState;
    appSavedState = next;
    appState = { ...next };
    ['ads', 'release'].forEach((section) => {
        if (previous && section !== savedSection && appDirtyFlags[section]) {
            appState[section] = previous[section];
            return;
        }
        appDrafts[section] = cloneConfig(next[section].value);
        appDirtyFlags[section] = false;
        $(section + '-errors').hidden = true;
        if (section !== savedSection) setAppStatus(section, '');
    });
    renderAdsForm();
    renderReleaseForm();
    renderAppToolbars();
}

function showAppErrors(section, errors = []) {
    const container = $(section + '-errors');
    container.textContent = '';
    container.hidden = !errors.length;
    errors.forEach((error) => {
        const label = Array.from($(section + '-form').querySelectorAll('[data-field]')).find((node) => node.dataset.field === error.field);
        const name = label?.querySelector('strong, span')?.textContent || error.field;
        const button = document.createElement('button');
        button.textContent = name + '：' + error.reason;
        button.onclick = () => {
            if (!label) return;
            label.classList.add('invalid');
            label.querySelector('input')?.focus();
            label.scrollIntoView({ block: 'center', behavior: 'smooth' });
        };
        container.appendChild(button);
    });
}

function setupAppEditor(next) {
    acceptAppState(next);
    ['ads', 'release'].forEach((section) => {
        $('tab-' + section).onclick = () => switchConfigTab(section);
        $(section + '-save').onclick = () => withPending(async () => {
            setAppStatus(section, '校验并保存中…');
            try {
                const result = await api('/api/app/save', { section, value: appDrafts[section], revision: appState[section].revision });
                state = result.state;
                acceptAppState(result.appConfig, section);
                setAppStatus(section, describeSync(result), result.refreshed ? 'ok' : 'error');
            } catch (error) {
                setAppStatus(section, error.message, 'error');
                showAppErrors(section, error.errors);
            }
        });
        $(section + '-reload').onclick = () => withPending(async () => {
            if (appDirtyFlags[section] && !confirm('重新读取会放弃此页未保存的修改，是否继续？')) return;
            try {
                const [app, announcements] = await Promise.all([api('/api/app'), api('/api/state')]);
                state = announcements;
                acceptAppState(app, section);
                setAppStatus(section, '已重新读取此页配置', 'ok');
            } catch (error) { setAppStatus(section, error.message, 'error'); }
        });
        $(section + '-refresh').onclick = () => withPending(async () => {
            setAppStatus(section, '正在刷新 Cocos…');
            try {
                const result = await api('/api/refresh', {});
                setAppStatus(section, result.refreshed ? 'Cocos 资源已刷新' : '刷新失败：' + result.refreshError, result.refreshed ? 'ok' : 'error');
            } catch (error) { setAppStatus(section, error.message, 'error'); }
        });
    });
}
