'use strict';

const byId = id => document.getElementById(id);
const number = value => Number(value || 0).toLocaleString('zh-CN');
const dateFormatter = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' });
const clockFormatter = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
const date = value => value ? dateFormatter.format(new Date(value)) : '暂无';
const clock = value => value ? clockFormatter.format(new Date(value)) : '暂无';
const time = value => value ? date(value) + ' ' + clock(value) : '暂无';
const shortId = value => value.slice(0, 10) + '…' + value.slice(-4);
function duration(ms) {
    const seconds = Math.max(0, Math.floor(Number(ms || 0) / 1000));
    if (seconds === 0) return '0 分钟';
    if (seconds < 60) return seconds + ' 秒';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return minutes + ' 分 ' + seconds % 60 + ' 秒';
    return Math.floor(minutes / 60) + ' 小时' + (minutes % 60 ? ' ' + minutes % 60 + ' 分' : '');
}
function relative(value, reference) {
    if (!value || !reference) return '';
    const minutes = Math.floor(Math.max(0, new Date(reference) - new Date(value)) / 60000);
    if (!minutes) return '刚刚保存';
    if (minutes < 60) return minutes + ' 分钟前保存';
    if (minutes < 1440) return Math.floor(minutes / 60) + ' 小时前保存';
    return Math.floor(minutes / 1440) + ' 天前保存';
}
function el(tag, value, className) {
    const node = document.createElement(tag);
    if (value !== undefined) node.textContent = value;
    if (className) node.className = className;
    return node;
}
const iconPaths = {
    overview: ['M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z'],
    accounts: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.87', 'M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0'],
    chart: ['M4 3v17h17M9 16v-5M14 16V7M19 16V4'],
    device: ['M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM10 18h4'],
    clock: ['M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0M12 6v6l4 2'],
    save: ['M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12l4 4v12a2 2 0 0 1-2 2M7 3v6h10V3M7 21v-8h10v8'],
    shield: ['M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM8 12l3 3 5-6'],
    lock: ['M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4M12 15v2'],
    refresh: ['M20 7v5h-5M4 17v-5h5M6.09 6a8 8 0 0 1 13.2 2L20 12M4 12l.71 4A8 8 0 0 0 17.91 18'],
    search: ['M21 21l-5-5M18 10.5a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0'],
    right: ['M9 5l7 7-7 7'], left: ['M15 5l-7 7 7 7'], close: ['M6 6l12 12M6 18L18 6'],
    info: ['M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0M12 11v6M12 7h.01'],
    copy: ['M9 9h12v12H9zM15 5V3H3v12h2'],
    trophy: ['M8 3h8v5a4 4 0 0 1-8 0zM8 5H4v2a4 4 0 0 0 4 4M16 5h4v2a4 4 0 0 1-4 4M12 12v6M8 21h8M10 18h4'],
};
function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round'); svg.setAttribute('aria-hidden', 'true');
    (iconPaths[name] || iconPaths.info).forEach(d => { const path = document.createElementNS(svg.namespaceURI, 'path'); path.setAttribute('d', d); svg.append(path); });
    return svg;
}
document.querySelectorAll('[data-icon]').forEach(node => node.append(icon(node.dataset.icon)));
function button(label, className, action, iconName) {
    const node = el('button', undefined, className); node.type = 'button';
    if (iconName) node.append(icon(iconName));
    if (label) node.append(el('span', label));
    node.addEventListener('click', action); return node;
}
function empty(title, description, iconName = 'chart', compact = false) {
    const node = el('div', undefined, 'empty-state' + (compact ? ' compact' : ''));
    const mark = el('span', undefined, 'empty-icon'); mark.append(icon(iconName));
    node.append(mark, el('h3', title), el('p', description)); return node;
}
function table(headers, rows, className = '') {
    const wrap = el('div', undefined, 'table-wrap'), t = el('table', undefined, className), head = el('thead'), header = el('tr'), body = el('tbody');
    headers.forEach(value => { const th = el('th', value); th.scope = 'col'; header.append(th); }); head.append(header);
    rows.forEach(row => { const tr = el('tr'); row.forEach(value => { const td = el('td'); td.append(value instanceof Node ? value : document.createTextNode(value)); tr.append(td); }); body.append(tr); });
    t.append(head, body); wrap.append(t); return wrap;
}
let toastTimer;
function toast(message) {
    const node = byId('toast');
    (byId('detail').open ? byId('detail') : document.body).append(node);
    node.textContent = message; node.hidden = false; clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { node.hidden = true; }, 2400);
}
function copyButton(value) {
    const node = button('', 'copy-button', async () => {
        try { await navigator.clipboard.writeText(value); toast('已复制完整标识'); }
        catch { toast('复制失败，可直接选中完整标识复制'); }
    }, 'copy');
    node.setAttribute('aria-label', '复制完整标识'); node.title = '复制完整标识'; return node;
}
async function get(url) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
    try {
        const response = await fetch(url, { cache: 'no-store', credentials: 'omit', signal: controller.signal });
        if (!response.headers.get('content-type')?.includes('application/json')) throw Error('服务响应异常，请检查隧道连接后重试。');
        const data = await response.json(); if (!response.ok) throw Error(data.error || '读取失败，请稍后重试。'); return data;
    } catch (error) {
        if (error.name === 'AbortError') throw Error('读取超时，请检查 SSH 隧道后重试。');
        if (error instanceof TypeError) throw Error('连接中断，请确认 OrcaTerm 端口转发正在运行。');
        throw error;
    } finally { clearTimeout(timer); }
}
const state = { page: 1, prefix: '', loading: false, overview: null, saves: null, detailId: null, detail: null, detailRequest: 0, detailTab: 'progress', gameFilter: '' };
const viewInfo = {
    overview: ['数据概览', '从一份存档，了解玩家的游戏进度。'],
    accounts: ['账号存档', '查找账号，查看已同步到云端的最佳游戏进度。'],
    playtime: ['游玩统计', '把每一次游玩，汇成游戏的累计表现。'],
};
function navigate() {
    const view = Object.hasOwn(viewInfo, location.hash.slice(1)) ? location.hash.slice(1) : 'overview';
    document.querySelectorAll('[data-view]').forEach(node => { if (node.dataset.view === view) node.setAttribute('aria-current', 'page'); else node.removeAttribute('aria-current'); });
    byId('view-title').textContent = viewInfo[view][0]; byId('view-description').textContent = viewInfo[view][1];
    byId('metrics').hidden = view === 'accounts'; byId('workspace').hidden = view === 'playtime';
    byId('workspace').classList.toggle('accounts-only', view === 'accounts'); byId('ranking-panel').hidden = view !== 'overview';
    byId('playtime-panel').hidden = view !== 'playtime';
    window.scrollTo({ top: 0, behavior: 'instant' });
}
window.addEventListener('hashchange', navigate); navigate();
function status(message, mode = '') {
    byId('status-text').textContent = message; byId('status').className = 'status-line' + (mode ? ' ' + mode : '');
}
function controls() {
    byId('refresh').disabled = state.loading;
    byId('refresh').setAttribute('aria-busy', String(state.loading));
    byId('search').querySelector('button[type=submit]').disabled = state.loading;
    byId('clear-search').disabled = state.loading;
    byId('previous').disabled = state.loading || !state.saves || state.page <= 1;
    byId('next').disabled = state.loading || !state.saves || state.page * state.saves.pageSize >= Number(state.saves.total);
}
const glyphs = { 'multi-color-fill': '填', meowdoku: '数', 'doodle-jump': '跳', cyblockbees: '护', 'sliding-puzzle': '拼', 'bubble-shooter': '泡', catch: '清', watermelon: '果', game2048: '2048', 'chess-endless': '棋', 'rotate-rings': '环', 'flappy-dunk': '篮', 'meme-runner': '跑', 'city-bloxx': '城', 'ping-pong': '乒' };
function gameAvatar(game) {
    const key = game.game_id || game.gameId || '', index = Array.from(key).reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return el('span', glyphs[key] || game.name?.slice(0, 1) || '?', 'game-avatar tone-' + index % 6);
}
function progress(value, max, label) {
    const node = el('progress', undefined, 'rank-bar'); node.max = max || 1; node.value = value; node.setAttribute('aria-label', label); return node;
}
function drawOverview(data) {
    const { counts } = data;
    byId('accounts').textContent = number(counts.accounts); byId('nav-accounts').textContent = number(counts.accounts);
    byId('devices').textContent = number(counts.devices); byId('duration').textContent = duration(counts.total_ms);
    byId('last-saved').textContent = counts.last_saved_at ? clock(counts.last_saved_at) : '暂无';
    byId('last-saved-date').textContent = counts.last_saved_at ? date(counts.last_saved_at) + ' · 北京时间' : '等待第一份云存档';
    byId('updated-at').textContent = '更新于 ' + clock(data.sampledAt);
    const root = byId('games'); root.replaceChildren();
    if (!data.games.length) root.append(empty('等待第一条游玩记录', '玩家实际游玩并触发存档上传后，这里会呈现各游戏的时长排行。'));
    const sorted = data.games.slice().sort((a, b) => Number(b.total_ms) - Number(a.total_ms));
    const max = Number(sorted[0]?.total_ms) || 1;
    sorted.slice(0, 5).forEach((game, index) => {
        const row = el('div', undefined, 'rank-row'), rank = el('span', String(index + 1).padStart(2, '0'), 'rank-number' + (index < 3 ? ' top' : ''));
        const copy = el('div', undefined, 'rank-copy'), top = el('div', undefined, 'rank-top');
        top.append(el('h3', game.name), el('strong', duration(game.total_ms)));
        copy.append(top, progress(Number(game.total_ms), max, game.name + '累计游玩时长'), el('div', number(game.accounts) + ' 个账号 · ' + number(game.devices) + ' 台设备', 'rank-meta'));
        row.append(rank, gameAvatar(game), copy); root.append(row);
    });
    drawPlaytime();
}
function drawPlaytime() {
    if (!state.overview) return;
    const data = state.overview, total = Number(data.counts.total_ms);
    byId('timing-rows').textContent = number(data.counts.timing_rows) + ' 条记录';
    const summary = byId('playtime-summary'); summary.replaceChildren();
    [[number(data.games.length), '款游戏有时长记录'], [duration(total), '已上报游玩时长']].forEach(([value, label]) => { const node = el('span'); node.append(el('strong', value), document.createTextNode(label)); summary.append(node); });
    const root = byId('playtime-table'); root.replaceChildren();
    if (!data.games.length) { root.append(empty('游玩数据还在路上', '时长采用增量上报。已有进度存档，也可能暂时没有时长记录；后续实际游玩并上传后会自动显示。')); return; }
    const games = data.games.slice().sort((a, b) => byId('game-sort').value === 'accounts' ? Number(b.accounts) - Number(a.accounts) || Number(b.total_ms) - Number(a.total_ms) : Number(b.total_ms) - Number(a.total_ms));
    root.append(table(['排名', '游戏', '累计游玩', '时长占比', '账号数', '设备数', '最后上报 · 北京时间'], games.map((game, index) => {
        const name = el('div', undefined, 'game-name-cell'), text = el('div'); text.append(el('strong', game.name), el('small', game.game_id)); name.append(gameAvatar(game), text);
        const share = total ? Number(game.total_ms) / total * 100 : 0, bar = el('div', undefined, 'share-cell');
        bar.append(progress(share, 100, game.name + '时长占比'), document.createTextNode(share.toFixed(1) + '%'));
        return [el('span', String(index + 1).padStart(2, '0'), 'rank-number'), name, el('span', duration(game.total_ms), 'time-emphasis'), bar, number(game.accounts), number(game.devices), el('span', time(game.updated_at), 'table-date')];
    }), 'ranking-table'));
}
function drawSaves(data) {
    const root = byId('saves'); root.replaceChildren(); byId('account-total').textContent = number(data.total);
    if (!data.rows.length) {
        const tr = el('tr'), td = el('td'); td.colSpan = 5;
        td.append(empty(state.prefix ? '没有找到匹配的账号' : '还没有账号存档', state.prefix ? '检查标识前缀，或清除筛选后查看全部账号。' : '玩家达到云存档门槛并成功上传后，账号会显示在这里。', 'save', true)); tr.append(td); root.append(tr);
    }
    data.rows.forEach(save => {
        const tr = el('tr'); tr.dataset.account = save.user_id; tr.classList.toggle('selected', state.detailId === save.user_id);
        const uid = el('td'), cell = el('div', undefined, 'account-cell');
        const account = button(save.user_id.slice(0, 10) + '…', 'account-code', () => openAccount(save.user_id));
        account.title = save.user_id; account.setAttribute('aria-label', '查看账号 ' + shortId(save.user_id));
        cell.append(el('span', save.user_id.slice(0, 2).toUpperCase(), 'account-avatar'), account); uid.append(cell);
        const version = el('td'); version.append(el('span', 'v' + number(save.revision), 'version-tag'));
        const device = el('td'), devices = el('span', undefined, 'device-cell'); devices.append(icon('device'), document.createTextNode(number(save.devices))); device.append(devices);
        const saved = el('td'), savedTime = el('div', date(save.updated_at), 'table-date'); savedTime.append(el('small', clock(save.updated_at))); saved.append(savedTime);
        const action = el('td'), view = button('查看进度', 'row-action', () => openAccount(save.user_id)); view.append(icon('right')); action.append(view);
        tr.append(uid, version, device, saved, action); root.append(tr);
    });
    byId('page-label').textContent = '共 ' + number(data.total) + ' 个账号' + (state.prefix ? ' · 筛选结果' : '') + ' · 每页 ' + data.pageSize + ' 个';
    byId('page-number').textContent = data.page + ' / ' + Math.max(1, Math.ceil(Number(data.total) / data.pageSize));
    byId('clear-search').hidden = !state.prefix; controls();
}
const fieldNames = {
    highScore: '最高分',
    'custom.fill.modes.normal.cleared': '普通模式通关', 'custom.fill.modes.hard.cleared': '困难模式通关',
    'custom.meowdokuCleared': '普通模式通关', 'custom.meowdokuHard.cleared': '困难模式通关',
    'custom.rings.modes.normal.cleared': '普通模式通关', 'custom.rings.modes.hard.cleared': '困难模式通关',
    'custom.bestHeightMeters': '最高高度', 'custom.highestTile': '最大数字', 'custom.cloudCleared': '已通关', 'custom.cleared': '已通关',
    'metrics.completed-7x7': '7 × 7 完成记录', 'metrics.fast-clears': '快速通关记录', 'metrics.watermelons': '西瓜合成记录',
    'metrics.generals': '斩将成就进度', 'metrics.swish-streak': '连续空心入篮',
    'custom.cityBestPeople': '最多居民', 'custom.cityBestCombo': '最高连击', 'custom.pingPongBestRally': '最高连续回合',
    'custom.slingWins0': '简单难度胜场', 'custom.slingWins1': '普通难度胜场', 'custom.slingWins2': '困难难度胜场',
    'custom.wrestleMatches': '比赛场次', 'custom.wrestleWins': '获胜场次',
};
function fieldUnit(path) {
    if (/cleared$/i.test(path)) return '关';
    if (path === 'custom.bestHeightMeters') return '米';
    return '';
}
function gameCard(game) {
    const card = el('article', undefined, 'game-card'), head = el('div', undefined, 'game-card-head'), name = el('div');
    name.append(el('h3', game.name), el('small', game.gameId || '未识别模块')); head.append(gameAvatar(game), name); card.append(head);
    if (game.error) { card.append(el('p', game.error, 'muted')); return card; }
    const fields = el('div', undefined, 'fields');
    game.fields.filter(field => fieldNames[field.path]).forEach(field => {
        const flag = ['metrics.completed-7x7', 'metrics.fast-clears'].includes(field.path);
        const node = el('div', undefined, 'field'), value = el('strong', flag ? (Number(field.value) ? '已达成' : '未达成') : number(field.value)), unit = fieldUnit(field.path);
        if (unit) value.append(el('small', unit)); node.append(el('span', fieldNames[field.path]), value); fields.append(node);
    });
    card.append(fields);
    if (!fields.childElementCount) card.append(el('p', '此模块的字段可在下方展开查看。', 'muted'));
    if (game.stars.length) {
        const details = el('details'), stars = el('div', undefined, 'stars'), perfect = game.stars.filter(level => level.stars === 3).length;
        details.append(el('summary', '逐关星级 · ' + game.stars.length + ' 关记录 · ' + perfect + ' 个三星'));
        game.stars.forEach(level => {
            const cell = el('div', undefined, 'level-star'), value = Math.max(0, Math.min(3, Number(level.stars)));
            cell.title = level.level + '：' + value + ' 星'; cell.setAttribute('aria-label', cell.title);
            cell.append(el('small', /^\d+$/.test(level.level) ? '第 ' + level.level + ' 关' : level.level), el('span', '★'.repeat(value), 'star-filled'), el('span', '★'.repeat(3 - value), 'star-empty')); stars.append(cell);
        }); details.append(stars); card.append(details);
    }
    if (game.fields.length) {
        const raw = el('details'), list = el('div', undefined, 'raw-fields'); raw.append(el('summary', '完整存档字段'));
        game.fields.forEach(field => { const row = el('div', undefined, 'raw-field'); row.append(el('code', field.path), el('span', number(field.value))); list.append(row); }); raw.append(list); card.append(raw);
    }
    return card;
}
function drawGameCards(root) {
    root.replaceChildren();
    const query = state.gameFilter.trim().toLowerCase();
    const games = state.detail.games.filter(game => (game.name + ' ' + (game.gameId || '')).toLowerCase().includes(query));
    if (!games.length) root.append(empty(query ? '没有匹配的游戏' : '暂无游戏进度', query ? '试试游戏的中文名或英文标识。' : '此账号还没有上传游戏进度模块。', 'save', true));
    else games.forEach(game => root.append(gameCard(game)));
    byId('game-filter-count').textContent = '显示 ' + games.length + ' / ' + state.detail.games.length + ' 款游戏';
}
function deviceId(value) { const node = el('span', undefined, 'device-code'), code = el('code', shortId(value)); code.title = value; node.append(code, copyButton(value)); return node; }
function drawDetailTab() {
    const root = byId('detail-panel'), data = state.detail; root.replaceChildren();
    document.querySelectorAll('[data-detail-tab]').forEach(node => { const active = node.dataset.detailTab === state.detailTab; node.setAttribute('aria-selected', String(active)); node.tabIndex = active ? 0 : -1; });
    root.setAttribute('aria-labelledby', 'tab-' + state.detailTab);
    if (state.detailTab === 'progress') {
        const tools = el('div', undefined, 'detail-tools'), search = el('label', undefined, 'search-input'), input = el('input');
        input.type = 'search'; input.placeholder = '搜索游戏名称'; input.setAttribute('aria-label', '搜索账号内的游戏'); input.value = state.gameFilter;
        search.append(icon('search'), input); const count = el('span', '', 'muted'); count.id = 'game-filter-count'; tools.append(search, count);
        const grid = el('div', undefined, 'game-grid'); root.append(tools, grid); drawGameCards(grid);
        input.addEventListener('input', () => { state.gameFilter = input.value; drawGameCards(grid); });
    } else if (state.detailTab === 'achievements') {
        if (!data.achievements.length) root.append(empty('还没有获得成就', '账号新获得并上传的成就会保存在这里。', 'trophy'));
        const grid = el('div', undefined, 'achievement-grid');
        data.achievements.forEach(item => { const card = el('article', undefined, 'achievement-card'), mark = el('span'); mark.dataset.icon = 'trophy'; mark.append(icon('trophy')); const text = el('div'); text.append(el('h3', item.name), el('p', item.date ? '获得于 ' + item.date : '记录日期未知')); card.append(mark, text); grid.append(card); }); root.append(grid);
    } else {
        root.append(el('h3', '同步设备 · ' + number(data.devices.length), 'detail-section-title'));
        const devices = el('div', undefined, 'detail-table');
        if (data.devices.length) devices.append(table(['设备标识', '最近上传序号', '最后同步 · 北京时间'], data.devices.map(item => [deviceId(item.device_id), el('span', '#' + number(item.last_seq), 'version-tag'), el('span', time(item.updated_at), 'table-date')])));
        else devices.append(empty('暂无设备记录', '设备成功上传后会显示在这里。', 'device', true)); root.append(devices);
        root.append(el('h3', '各设备累计游玩时长', 'detail-section-title'));
        const playtime = el('div', undefined, 'detail-table');
        if (data.playtime.length) playtime.append(table(['游戏', '设备', '累计游玩', '最后上报 · 北京时间'], data.playtime.map(item => [item.name, deviceId(item.device_id), duration(item.total_ms), el('span', time(item.updated_at), 'table-date')])));
        else playtime.append(empty('暂无已上报时长', '存档进度与时长分开记录。下一次实际游玩并上传后，这里会出现增量时长。', 'clock', true)); root.append(playtime);
        root.append(el('p', '设备标识由客户端生成。这里展示成功上传的设备记录，无法据此判断设备是否在线。', 'detail-note'));
    }
}
function drawDetail() {
    const data = state.detail, root = byId('detail-content'); root.replaceChildren();
    const identity = el('div', undefined, 'account-identity'), text = el('div'), id = el('div', undefined, 'account-id-line');
    id.append(el('code', data.user_id), copyButton(data.user_id));
    text.append(id, el('p', 'v' + number(data.revision) + ' · 最后保存 ' + time(data.updated_at) + '（北京时间）'));
    identity.append(el('span', data.user_id.slice(0, 2).toUpperCase(), 'account-avatar'), text); root.append(identity);
    const meta = el('div', undefined, 'account-meta');
    [[data.games.length, '游戏进度模块'], [data.achievements.length, '已获得成就'], [data.devices.length, '同步设备']].forEach(([count, label]) => { const item = el('div'); item.append(el('strong', number(count)), el('span', label)); meta.append(item); }); root.append(meta);
    const tabs = el('div', undefined, 'detail-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', '账号详情分类');
    const names = [['progress', '游戏进度'], ['achievements', '成就记录'], ['devices', '设备与时长']];
    names.forEach(([key, label], index) => {
        const tab = button(label, '', () => { state.detailTab = key; drawDetailTab(); });
        tab.dataset.detailTab = key; tab.id = 'tab-' + key; tab.setAttribute('role', 'tab'); tab.setAttribute('aria-controls', 'detail-panel');
        tab.addEventListener('keydown', event => {
            const next = event.key === 'ArrowRight' ? (index + 1) % names.length : event.key === 'ArrowLeft' ? (index + names.length - 1) % names.length : event.key === 'Home' ? 0 : event.key === 'End' ? names.length - 1 : -1;
            if (next < 0) return; event.preventDefault(); state.detailTab = names[next][0]; drawDetailTab(); byId('tab-' + state.detailTab).focus();
        }); tabs.append(tab);
    });
    const panel = el('div'); panel.id = 'detail-panel'; panel.setAttribute('role', 'tabpanel'); root.append(tabs, panel); drawDetailTab();
    const note = el('p', '以上为云端保留的最佳进度；完整账号标识可用于账号列表搜索。', 'detail-note');
    root.append(note, button('刷新此账号', 'text-button', () => openAccount(data.user_id, true), 'refresh'));
}
async function openAccount(id, preserve = false) {
    state.detailId = id; const request = ++state.detailRequest;
    const dialog = byId('detail'), root = byId('detail-content');
    if (!preserve) { state.detail = null; state.detailTab = 'progress'; state.gameFilter = ''; root.replaceChildren(el('div', '正在读取账号进度…', 'loading-state')); dialog.scrollTop = 0; }
    if (!dialog.open) dialog.showModal();
    highlightAccount();
    root.setAttribute('aria-busy', 'true');
    try {
        const data = await get('/api/saves/' + id);
        if (request !== state.detailRequest) return;
        state.detail = data; drawDetail();
    } catch (error) {
        if (request !== state.detailRequest) return;
        if (state.detail && preserve) {
            root.querySelector('.detail-refresh-note')?.remove(); root.prepend(el('p', '刷新失败，以下保留上次读取的数据。' + error.message, 'detail-refresh-note'));
        } else {
            const fail = el('div', undefined, 'detail-error'); fail.append(el('p', error.message), button('重新读取', 'button', () => openAccount(id))); root.replaceChildren(fail);
        }
    } finally { if (request === state.detailRequest) root.removeAttribute('aria-busy'); }
}
byId('close-detail').addEventListener('click', () => byId('detail').close());
function highlightAccount() {
    byId('saves').querySelectorAll('[data-account]').forEach(row => row.classList.toggle('selected', row.dataset.account === state.detailId));
}
byId('detail').addEventListener('close', () => {
    const id = state.detailId;
    state.detailId = null; state.detail = null; ++state.detailRequest; byId('detail-content').removeAttribute('aria-busy');
    byId('toast').hidden = true; document.body.append(byId('toast')); highlightAccount();
    if (id) byId('saves').querySelector('[data-account="' + id + '"] .account-code')?.focus({ preventScroll: true });
});
byId('detail').addEventListener('click', event => {
    const rect = byId('detail').getBoundingClientRect();
    if (event.target === byId('detail') && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) byId('detail').close();
});
async function refresh(query = {}) {
    if (state.loading) return;
    const page = query.page ?? state.page, prefix = query.prefix ?? state.prefix;
    state.loading = true; controls(); status('正在读取最新数据…', 'busy');
    try {
        const [overview, saves] = await Promise.all([get('/api/overview'), get('/api/saves?page=' + page + '&prefix=' + encodeURIComponent(prefix))]);
        state.overview = overview; state.saves = saves; state.page = saves.page; state.prefix = prefix;
        byId('prefix').value = prefix; byId('search-error').hidden = true;
        drawOverview(overview); drawSaves(saves);
        status('数据读取于 ' + time(overview.sampledAt) + '（北京时间）' + (overview.counts.last_saved_at ? ' · ' + relative(overview.counts.last_saved_at, overview.sampledAt) : ' · 等待第一份云存档'));
    } catch (error) {
        status((state.overview ? '刷新失败，当前保留上次读取的数据。' : '数据读取失败。') + error.message, 'error');
    } finally { state.loading = false; controls(); }
}
byId('refresh').addEventListener('click', () => refresh());
byId('game-sort').addEventListener('change', drawPlaytime);
byId('search').addEventListener('submit', event => {
    event.preventDefault(); if (state.loading) return;
    const prefix = byId('prefix').value.trim().toLowerCase();
    if (!/^[a-f0-9]{0,64}$/.test(prefix)) { byId('search-error').textContent = '账号标识由 0–9 和 a–f 组成，请输入完整标识或开头部分。'; byId('search-error').hidden = false; return; }
    void refresh({ page: 1, prefix });
});
byId('clear-search').addEventListener('click', () => refresh({ page: 1, prefix: '' }));
byId('previous').addEventListener('click', () => { if (!byId('previous').disabled) void refresh({ page: state.page - 1 }); });
byId('next').addEventListener('click', () => { if (!byId('next').disabled) void refresh({ page: state.page + 1 }); });
void refresh();
