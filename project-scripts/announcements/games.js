'use strict';
let gameState = null;
let gameCatalogDraft = null;
let selectedGameId = null;
let gamesDirty = false;
let pending = false;

const GAME_FIELDS = [
    { title: '名称与简介', primary: true, note: '玩家在大厅里首先看到的信息', fields: [
        { key: 'name', label: '游戏名称', wide: true },
        { key: 'description', label: '游戏简介', type: 'textarea', wide: true },
    ] },
    { title: '推广与上线', note: '选择推荐标签，控制游戏是否向玩家开放', fields: [
        { key: 'enabled', label: '启用游戏', type: 'availability', wide: true },
        { key: 'visibility', label: '可见范围', type: 'visibility', wide: true,
            choices: [['public', '公开', '面向玩家，在正式大厅展示'], ['development', '仅开发预览', '仅浏览器开发预览可见，发布版不展示']] },
        { key: 'lobbyTags', label: '推广标签', type: 'promotions', wide: true },
    ] },
    { title: '分类与版本', secondary: true, fields: [
        { key: 'tags', label: '内容分类', type: 'tags', wide: true, hint: '每次添加一个标签；点击 × 删除。' },
        { key: 'version', label: '游戏内容版本', hint: '如 0.1.0；更新版本后，配置的 NEW 会再次显示。' },
        { key: 'minAppVersion', label: '最低合集版本', hint: '低于此版本的合集不会显示该游戏。' },
    ] },
];

function setGameStatus(text, kind = '') {
    $('game-status').textContent = text;
    $('game-status').className = 'status ' + kind;
}

/** 保存过程中锁住编辑操作，避免响应覆盖请求发出后的修改。 */
async function withPending(work) {
    if (pending || !state || !gameState) return;
    pending = true;
    const disabled = new Map();
    document.querySelectorAll('button, input, select, textarea').forEach((node) => {
        disabled.set(node, node.disabled);
        node.disabled = true;
    });
    try { await work(); } finally {
        pending = false;
        disabled.forEach((value, node) => { if (node.isConnected) node.disabled = value; });
        renderToolbar();
        renderGameToolbar();
        renderAppToolbars();
    }
}

function gameDraft() {
    return gameCatalogDraft.games.find((game) => game.id === selectedGameId);
}

function gameValue(game, key) {
    return key.split('.').reduce((value, part) => value?.[part], game);
}

function updateGameValue(key, value) {
    const parts = key.split('.');
    const object = parts.length === 2 ? gameDraft()[parts[0]] : gameDraft();
    const name = parts[parts.length - 1];
    if (value === undefined) delete object[name];
    else object[name] = value;
    gamesDirty = true;
    setGameStatus('有未保存的修改');
    renderGameAvailability();
    renderGameList();
    renderGamePreview();
    renderGameToolbar();
}

function gameFieldId(key) { return 'game-field-' + key.replaceAll('.', '-'); }

function renderGameAvailability() {
    const game = gameDraft();
    const card = document.querySelector('#game-form [data-field="enabled"]');
    if (!game || !card) return;
    card.dataset.enabled = String(game.enabled === true);
    $('game-enabled-state').textContent = game.enabled ? '已启用' : '已停用';
    $('game-enabled-note').textContent = game.enabled ? '按照下方可见范围在大厅展示。' : '游戏不会在大厅展示。';
    document.querySelectorAll('#game-form .visibility-choice').forEach((choice) => {
        choice.dataset.selected = String(choice.dataset.scope === game.visibility);
    });
}

function renderGameField(field, game) {
    const complex = ['promotions', 'tags', 'visibility'].includes(field.type);
    const label = document.createElement(complex ? 'div' : 'label');
    label.className = 'field' + (field.wide ? ' wide' : '');
    label.dataset.field = field.key;
    const title = document.createElement('span');
    title.className = 'field-title';
    title.textContent = field.label;
    label.appendChild(title);
    const value = gameValue(game, field.key);
    if (field.type === 'availability') {
        label.classList.add('availability-card');
        const content = document.createElement('div');
        content.className = 'availability-content';
        const copy = document.createElement('div');
        const status = document.createElement('strong');
        status.id = 'game-enabled-state';
        const hint = document.createElement('small');
        hint.id = 'game-enabled-note';
        copy.append(status, hint);
        const check = document.createElement('input');
        check.type = 'checkbox';
        check.id = gameFieldId(field.key);
        check.className = 'availability-switch';
        check.checked = value === true;
        check.setAttribute('role', 'switch');
        check.setAttribute('aria-label', field.label);
        check.setAttribute('aria-describedby', hint.id);
        check.onchange = () => updateGameValue(field.key, check.checked);
        content.append(copy, check);
        label.appendChild(content);
    } else if (field.type === 'visibility') {
        label.classList.add('visibility-field');
        title.id = 'game-visibility-title';
        const choices = document.createElement('div');
        choices.className = 'visibility-choices';
        choices.setAttribute('role', 'radiogroup');
        choices.setAttribute('aria-labelledby', title.id);
        field.choices.forEach(([id, name, description]) => {
            const choice = document.createElement('label');
            choice.className = 'visibility-choice';
            choice.dataset.scope = id;
            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = 'game-visibility';
            radio.id = 'game-visibility-' + id;
            radio.value = id;
            radio.checked = value === id;
            radio.setAttribute('aria-label', name);
            radio.onchange = () => { if (radio.checked) updateGameValue(field.key, id); };
            const copy = document.createElement('span');
            const heading = document.createElement('strong');
            heading.textContent = name;
            const hint = document.createElement('small');
            hint.id = radio.id + '-hint';
            hint.textContent = description;
            radio.setAttribute('aria-describedby', hint.id);
            copy.append(heading, hint);
            choice.append(radio, copy);
            choices.appendChild(choice);
        });
        label.appendChild(choices);
    } else if (field.type === 'promotions') {
        const checks = document.createElement('div');
        checks.className = 'promotion-choices';
        ['new', 'hot'].filter((tag) => gameState.options.lobbyTags.includes(tag)).forEach((tag) => {
            const checkLabel = document.createElement('label');
            checkLabel.className = 'promotion-choice';
            const check = document.createElement('input');
            check.type = 'checkbox';
            check.id = 'game-tag-' + tag;
            check.checked = (value ?? (game.lobbyTag ? [game.lobbyTag] : [])).includes(tag);
            check.onchange = () => {
                delete game.lobbyTag;
                updateGameValue('lobbyTags', gameState.options.lobbyTags.filter((item) => $('game-tag-' + item).checked));
            };
            const text = document.createElement('span');
            const name = document.createElement('strong');
            name.textContent = tag.toUpperCase();
            const hint = document.createElement('small');
            hint.textContent = tag === 'new' ? '推荐新内容 · 本版本首次进入前显示' : '推荐热门游戏 · NEW 隐藏后显示';
            text.append(name, hint);
            checkLabel.append(check, text);
            checks.appendChild(checkLabel);
        });
        label.appendChild(checks);
    } else if (field.type === 'tags') {
        const chips = document.createElement('div');
        chips.className = 'tag-chips';
        const addRow = document.createElement('div');
        addRow.className = 'tag-add';
        const input = document.createElement('input');
        input.id = 'game-tag-input';
        input.setAttribute('aria-label', '添加内容分类');
        input.placeholder = '输入一个分类标签';
        const add = document.createElement('button');
        add.id = 'game-tag-add';
        add.textContent = '＋ 添加标签';
        const message = document.createElement('small');
        message.id = 'game-tag-message';
        message.setAttribute('aria-live', 'polite');
        function drawChips() {
            chips.textContent = '';
            (game.tags ?? []).forEach((tag) => {
                const chip = document.createElement('span');
                chip.className = 'tag-chip';
                const text = document.createElement('span');
                text.textContent = tag;
                const remove = document.createElement('button');
                remove.textContent = '×';
                remove.setAttribute('aria-label', '删除分类 ' + tag);
                remove.onclick = () => {
                    updateGameValue('tags', game.tags.filter((item) => item !== tag));
                    drawChips();
                };
                chip.append(text, remove);
                chips.appendChild(chip);
            });
            if (!game.tags?.length) chips.textContent = '暂未添加分类';
        }
        function addTag() {
            const tag = input.value.trim();
            if (!tag) { message.textContent = '请输入一个标签。'; input.focus(); return; }
            if (/[,，\r\n]/.test(tag)) { message.textContent = '每次添加一个标签，不需要逗号分隔。'; return; }
            if (game.tags?.includes(tag)) { message.textContent = '这个标签已经存在。'; input.focus(); return; }
            updateGameValue('tags', [...(game.tags ?? []), tag]);
            input.value = '';
            message.textContent = '';
            drawChips();
            input.focus();
        }
        add.onclick = addTag;
        input.onkeydown = (event) => { if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); addTag(); } };
        addRow.append(input, add);
        drawChips();
        label.append(chips, addRow, message);
    } else {
        const input = document.createElement(field.choices ? 'select' : field.type === 'textarea' ? 'textarea' : 'input');
        input.id = gameFieldId(field.key);
        input.name = field.key;
        if (field.choices) field.choices.forEach(([id, text]) => input.add(new Option(text, id)));
        if (field.type === 'checkbox') {
            input.type = 'checkbox';
            input.checked = value === true;
            input.onchange = () => updateGameValue(field.key, input.checked);
        } else {
            input.value = value ?? '';
            if (field.type === 'textarea') input.rows = 3;
            const change = () => updateGameValue(field.key, input.value.trim());
            if (field.choices) input.onchange = change;
            else input.oninput = change;
        }
        label.appendChild(input);
    }
    if (field.hint) {
        const hint = document.createElement('small');
        hint.textContent = field.hint;
        label.appendChild(hint);
    }
    return label;
}

function renderGameForm() {
    const form = $('game-form');
    form.textContent = '';
    const game = gameDraft();
    if (!game) { form.textContent = '暂无已注册游戏。'; return; }
    GAME_FIELDS.forEach((group) => {
        const card = document.createElement('div');
        card.className = 'card game-section' + (group.primary ? ' priority-card' : '') + (group.secondary ? ' secondary-card' : '');
        const heading = document.createElement('h2');
        heading.textContent = group.title;
        card.appendChild(heading);
        if (group.note) {
            const note = document.createElement('p');
            note.className = 'section-note';
            note.textContent = group.note;
            card.appendChild(note);
        }
        const fields = document.createElement('div');
        fields.className = 'game-fields';
        group.fields.forEach((field) => fields.appendChild(renderGameField(field, game)));
        card.appendChild(fields);
        form.appendChild(card);
    });
    renderGameAvailability();
}

function selectGame(id) {
    selectedGameId = id;
    renderGameList();
    renderGameForm();
    renderGamePreview();
    renderGameToolbar();
}

function renderGameList() {
    const list = $('game-list');
    list.textContent = '';
    const search = $('game-search').value.trim().toLowerCase();
    const picker = $('game-picker');
    picker.textContent = '';
    gameCatalogDraft.games.forEach((game, index) => {
        picker.add(new Option(`${index + 1}. ${game.name || game.id}`, game.id));
        if (search && !(game.name + ' ' + game.id).toLowerCase().includes(search)) return;
        const node = document.createElement('button');
        node.className = 'item' + (game.id === selectedGameId ? ' selected' : '');
        node.innerHTML = '<div class="top"><span></span><span class="game-tag"></span></div><div class="meta"></div>';
        node.querySelector('.top span').textContent = `${index + 1}. ${game.name || game.id}`;
        const tags = game.lobbyTags ?? (game.lobbyTag ? [game.lobbyTag] : []);
        node.querySelector('.game-tag').textContent = tags.map((tag) => tag.toUpperCase()).join(' / ');
        node.querySelector('.meta').textContent = `${game.enabled ? game.visibility === 'public' ? '公开' : '仅开发' : '已停用'} · v${game.version}`;
        node.onclick = () => selectGame(game.id);
        list.appendChild(node);
    });
    picker.value = selectedGameId ?? '';
    $('game-count').textContent = `共 ${gameCatalogDraft.games.length} 个游戏，保存按钮会保存全部修改。`;
}

function renderGameToolbar() {
    if (!gameCatalogDraft) return;
    const game = gameDraft();
    const index = gameCatalogDraft.games.indexOf(game);
    $('game-heading').textContent = game?.name || '游戏配置';
    $('game-meta').textContent = game ? 'ID：' + game.id : '';
    $('game-order').textContent = `默认顺序 ${index + 1} / ${gameCatalogDraft.games.length}`;
    $('tab-games').dataset.dirty = String(gamesDirty);
    $('game-save').disabled = pending || !gamesDirty;
    $('game-up').disabled = pending || index <= 0;
    $('game-down').disabled = pending || index < 0 || index >= gameCatalogDraft.games.length - 1;
}

function renderGamePreview() {
    const container = $('game-preview');
    container.textContent = '';
    const game = gameDraft();
    if (!game) return;
    const cover = document.createElement('div');
    cover.className = 'cover-box';
    const image = document.createElement('img');
    image.alt = game.name + '封面';
    image.hidden = true;
    const placeholder = document.createElement('span');
    placeholder.className = 'hint';
    placeholder.textContent = '正在读取封面…';
    coverUrl(game.id).then((url) => {
        placeholder.textContent = url ? '' : '未找到封面图片';
        if (url) { image.src = url; image.hidden = false; placeholder.hidden = true; }
    });
    cover.append(image, placeholder);
    const tags = game.lobbyTags ?? (game.lobbyTag ? [game.lobbyTag] : []);
    const promotion = tags.includes('new') ? 'NEW' : tags.includes('hot') ? 'HOT' : '';
    if (promotion) {
        const badge = document.createElement('span');
        badge.className = 'preview-badge';
        badge.textContent = promotion;
        cover.appendChild(badge);
    }
    const name = document.createElement('div');
    name.className = 'preview-name';
    name.textContent = game.name;
    const description = document.createElement('p');
    description.className = 'preview-description';
    description.textContent = game.description;
    const meta = document.createElement('div');
    meta.className = 'preview-meta';
    meta.textContent = !game.enabled ? '已停用，不会在大厅展示。' : game.visibility === 'development'
        ? '仅开发预览可见，微信发布版不展示。' : '公开 · 内容版本 ' + game.version;
    container.append(cover, name, description, meta);
}

function switchConfigTab(tab) {
    if (!state || !gameState || !appState || pending) return;
    const panels = { games: 'game', announcements: 'announcement', ads: 'ads', release: 'release' };
    Object.entries(panels).forEach(([key, prefix]) => {
        $('tab-' + key).setAttribute('aria-selected', String(key === tab));
        $(prefix + '-workspace').hidden = key !== tab;
    });
    $('game-sidebar').hidden = tab !== 'games';
    $('announcement-sidebar').hidden = tab !== 'announcements';
    $('settings-sidebar').hidden = !['ads', 'release'].includes(tab);
    // 各页面独立保留草稿，切换入口无需放弃修改。
    if (tab === 'announcements') render();
    if (['ads', 'release'].includes(tab)) renderAppSidebar(tab);
    window.scrollTo({ top: 0 });
}

function acceptGameState(next) {
    gameState = next;
    gameCatalogDraft = JSON.parse(JSON.stringify(next.catalog));
    gamesDirty = false;
    if (!gameCatalogDraft.games.some((game) => game.id === selectedGameId)) selectedGameId = gameCatalogDraft.games[0]?.id ?? null;
    $('game-errors').hidden = true;
    selectGame(selectedGameId);
}

function showGameErrors(errors = []) {
    const container = $('game-errors');
    container.textContent = '';
    container.hidden = !errors.length;
    errors.forEach((error) => {
        const match = /^games\[(\d+)\]\.(.+)$/.exec(error.field);
        const game = match ? gameCatalogDraft.games[Number(match[1])] : null;
        const field = match ? match[2].replace(/\[\d+\]$/, '') : null;
        const definition = GAME_FIELDS.flatMap((group) => group.fields).find((item) => item.key === field);
        const node = document.createElement('button');
        const reason = error.reason.startsWith('must be one of:') ? '请选择有效的选项'
            : error.reason === 'must be a semantic version' ? '请使用有效版本号，如 0.1.0'
            : error.reason === 'must be a non-empty string' ? '不能为空'
            : error.reason === 'must be a positive finite number' ? '必须是大于 0 的数'
            : error.reason === 'must contain unique promotion tags' ? '标签不能重复'
            : error.reason === 'must be an integer between 1000 and 120000' ? '必须是 1000～120000 的整数'
            : error.reason === 'must be a six-digit hex color' ? '请使用六位颜色值，如 #EBAA72'
            : error.reason === 'must be a relative Bundle resource path' ? '请填写有效的 Bundle 内资源路径'
            : error.reason;
        node.textContent = `${game?.name || '清单'} · ${definition?.label || error.field}：${reason}`;
        node.onclick = () => {
            if (!game) return;
            selectGame(game.id);
            const label = Array.from($('game-form').querySelectorAll('[data-field]')).find((item) => item.dataset.field === field);
            if (!label) return;
            const detail = label.closest('details');
            if (detail) detail.open = true;
            label.classList.add('invalid');
            label.querySelector('input, select, textarea')?.focus();
            label.scrollIntoView({ block: 'center', behavior: 'smooth' });
        };
        container.appendChild(node);
    });
}

function clearCoverCache() {
    coverUrls.forEach((promise) => promise.then((url) => { if (url) URL.revokeObjectURL(url); }));
    coverUrls.clear();
}

function setupGameEditor(next) {
    acceptGameState(next);
    $('tab-games').onclick = () => switchConfigTab('games');
    $('tab-announcements').onclick = () => switchConfigTab('announcements');
    $('game-search').oninput = renderGameList;
    $('game-picker').onchange = () => selectGame($('game-picker').value);
    function moveGame(offset) {
        const index = gameCatalogDraft.games.findIndex((game) => game.id === selectedGameId);
        if (index < 0 || index + offset < 0 || index + offset >= gameCatalogDraft.games.length) return;
        const [game] = gameCatalogDraft.games.splice(index, 1);
        gameCatalogDraft.games.splice(index + offset, 0, game);
        gamesDirty = true;
        setGameStatus('顺序已调整，尚未保存');
        renderGameList();
        renderGameToolbar();
    }
    $('game-up').onclick = () => moveGame(-1);
    $('game-down').onclick = () => moveGame(1);
    $('game-save').onclick = () => withPending(async () => {
        setGameStatus('校验并保存中…');
        try {
            const result = await api('/api/games/save', { catalog: gameCatalogDraft, revision: gameState.revision });
            state = result.state;
            clearCoverCache();
            acceptGameState(result.gameConfig);
            render();
            setGameStatus(describeSync(result), result.refreshed ? 'ok' : 'error');
        } catch (error) {
            setGameStatus(error.message, 'error');
            showGameErrors(error.errors);
        }
    });
    $('game-reload').onclick = () => withPending(async () => {
        if (gamesDirty && !confirm('重新读取会放弃所有未保存的游戏配置修改，是否继续？')) return;
        try {
            const [games, announcements] = await Promise.all([api('/api/games'), api('/api/state')]);
            state = announcements;
            clearCoverCache();
            acceptGameState(games);
            render();
            setGameStatus('已重新读取配置', 'ok');
        } catch (error) { setGameStatus(error.message, 'error'); }
    });
    $('game-refresh').onclick = () => withPending(async () => {
        setGameStatus('正在刷新 Cocos…');
        try {
            const result = await api('/api/refresh', {});
            setGameStatus(result.refreshed ? 'Cocos 资源已刷新' : 'Cocos 刷新失败：' + result.refreshError, result.refreshed ? 'ok' : 'error');
        } catch (error) { setGameStatus(error.message, 'error'); }
    });
}
