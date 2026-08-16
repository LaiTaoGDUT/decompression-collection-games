const screenButtons = document.querySelectorAll('[data-screen]');
const screenPanels = document.querySelectorAll('[data-screen-panel]');
const navButtons = document.querySelectorAll('.nav-button[data-screen]');
const overlay = document.querySelector('#overlay');
const modals = document.querySelectorAll('[data-modal]');
const contextHint = document.querySelector('#context-hint');
const board = document.querySelector('#board');

const pieces = [
  { at: 4, label: '卒', type: 'enemy' },
  { at: 8, label: '士', type: 'enemy' },
  { at: 13, label: '马', type: 'enemy' },
  { at: 23, label: '炮', type: 'enemy' },
  { at: 31, label: '象', type: 'enemy' },
  { at: 37, label: '卒', type: 'enemy' },
  { at: 50, label: '车', type: 'enemy' },
  { at: 59, label: '将', type: 'general' },
  { at: 61, label: '士', type: 'enemy' },
  { at: 74, label: '车', type: 'player' },
  { at: 81, label: '卒', type: 'enemy' }
];

const ruleText = {
  卒: '卒：过河前向前一步；过河后还可左右一步。',
  士: '士：只能在九宫内斜走一格。',
  象: '象：走田字；象眼被挡时不能移动。',
  马: '马：走日字；马腿被挡时不能移动。',
  炮: '炮：移动同车，吃子时必须隔一枚炮架。',
  车: '敌车：沿横线或竖线移动，路径不可有棋。',
  将: '将：特殊目标。斩将可获得 300 分与三选一道具。'
};

const boardField = document.createElement('div');
boardField.className = 'board-field';
const boardGrid = document.createElement('div');
boardGrid.className = 'board-grid';

for (let index = 0; index < 72; index += 1) {
  const square = document.createElement('span');
  square.className = 'grid-square';
  boardGrid.appendChild(square);
}

boardField.appendChild(boardGrid);

// 9 × 8 个方格对应 10 × 9 个可落子顶点。
for (let index = 0; index < 90; index += 1) {
  const vertex = document.createElement('button');
  const column = index % 10;
  const row = Math.floor(index / 10);
  vertex.className = 'board-vertex';
  vertex.dataset.index = index;
  vertex.style.left = `${column / 9 * 100}%`;
  vertex.style.top = `${row / 8 * 100}%`;
  vertex.setAttribute('aria-label', `棋盘顶点 ${column + 1} 列 ${row + 1} 行`);
  const pieceData = pieces.find(piece => piece.at === index);
  if (pieceData) {
    const piece = document.createElement('span');
    piece.className = `piece board-piece ${pieceData.type}-piece`;
    piece.textContent = pieceData.label;
    piece.dataset.type = pieceData.type;
    vertex.appendChild(piece);
  }
  boardField.appendChild(vertex);
}

board.appendChild(boardField);

function showScreen(name) {
  screenPanels.forEach(panel => panel.classList.toggle('active', panel.dataset.screenPanel === name));
  navButtons.forEach(button => button.classList.toggle('active', button.dataset.screen === name));
  closeOverlay();
}

function openOverlay(name) {
  if (name !== 'rules' && !document.querySelector('[data-screen-panel="game"]').classList.contains('active')) {
    showScreen('game');
  }
  modals.forEach(modal => modal.classList.toggle('active', modal.dataset.modal === name));
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
}

function closeOverlay() {
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
  modals.forEach(modal => modal.classList.remove('active'));
}

screenButtons.forEach(button => button.addEventListener('click', () => showScreen(button.dataset.screen)));
document.querySelectorAll('[data-overlay]').forEach(button => button.addEventListener('click', () => openOverlay(button.dataset.overlay)));
document.querySelectorAll('[data-close-overlay]').forEach(button => button.addEventListener('click', closeOverlay));
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeOverlay(); });

document.querySelectorAll('[data-return-lobby]').forEach(button => button.addEventListener('click', () => {
  closeOverlay();
  contextHint.textContent = '返回小游戏大全（原型交互占位）';
}));

board.addEventListener('click', event => {
  const cell = event.target.closest('.board-vertex');
  if (!cell) return;
  const piece = cell.querySelector('.board-piece');
  document.querySelectorAll('.board-vertex').forEach(item => item.classList.remove('move-dot', 'target-cell'));
  document.querySelectorAll('.board-piece').forEach(item => item.classList.remove('selected-piece'));

  if (piece?.dataset.type === 'player') {
    piece.classList.add('selected-piece');
    [2, 6, 20, 29, 47, 56, 65, 72, 73, 75, 76, 77].forEach(index => {
      const target = board.querySelector(`[data-index="${index}"]`);
      if (target) target.classList.add('move-dot', ...(target.querySelector('.board-piece') ? ['target-cell'] : []));
    });
    contextHint.textContent = '绿色：可移动空位 · 红色：可吃敌棋';
  } else if (piece) {
    piece.classList.add('selected-piece');
    contextHint.textContent = ruleText[piece.textContent] || '点击棋子查看规则';
  } else {
    contextHint.textContent = '这是一个空格。先选择「车」或使用移形符。';
  }
});

document.querySelectorAll('.item-button').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.item-button').forEach(item => item.classList.remove('active'));
    button.classList.add('active');
    const mode = button.dataset.mode;
    if (mode === 'instant') contextHint.textContent = `${button.dataset.item}：再次点击确认使用（原型不消耗数量）`;
    else if (mode === 'empty') contextHint.textContent = `${button.dataset.item}：请选择棋盘上的任意空格`;
    else contextHint.textContent = `${button.dataset.item}：请选择一枚普通敌棋`;
  });
});

document.querySelectorAll('.reward-cards button').forEach(card => card.addEventListener('click', () => {
  closeOverlay();
  contextHint.textContent = `已获得「${card.querySelector('strong').textContent}」，继续走棋`;
}));

setInterval(() => {
  const card = document.querySelector('#reinforcement-card');
  if (document.querySelector('[data-screen-panel="game"]').classList.contains('active')) {
    card.classList.toggle('urgent');
  }
}, 1800);
