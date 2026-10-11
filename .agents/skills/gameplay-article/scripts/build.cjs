#!/usr/bin/env node
'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { createRequire } = require('node:module');

const skillRoot = path.resolve(__dirname, '..');
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const flag = process.argv[i];
  if (['--help', '--list-games'].includes(flag)) args[flag.slice(2)] = true;
  else if (['--project', '--spec', '--output', '--modules', '--manifest', '--font'].includes(flag)) {
    if (!process.argv[i + 1] || process.argv[i + 1].startsWith('--')) throw new Error(`${flag} 缺少参数`);
    args[flag.slice(2)] = process.argv[++i];
  } else throw new Error(`未知选项：${flag}`);
}

function string(value, label, singleLine = false) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} 必须是非空字符串`);
  const result = value.trim();
  if (singleLine && /[\r\n]/u.test(result)) throw new Error(`${label} 不允许换行`);
  return result;
}
function dependency(name) {
  try {
    return args.modules ? require(path.join(path.resolve(args.modules), name)) : createRequire(__filename)(name);
  } catch (error) {
    throw new Error(`找不到 ${name}。请使用 load_workspace_dependencies 返回的 Node 包目录作为 --modules 参数。`, { cause: error });
  }
}
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const url = value => esc(value.split('/').map(encodeURIComponent).join('/'));

async function exists(file) {
  try { return (await fs.stat(file)).isFile(); } catch { return false; }
}
async function reserveOutput(base) {
  await fs.mkdir(path.dirname(base), { recursive: true });
  for (let i = 1; i < 1000; i++) {
    const candidate = i === 1 ? base : `${base}-${i}`;
    try { await fs.mkdir(candidate); return candidate; }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  throw new Error('输出目录重名过多，请指定新的 --output');
}

function roundRect(ctx, x, y, w, h, r, fill) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
}
function drawImage(ctx, image, area, fit, backing) {
  ctx.save(); roundRect(ctx, area.x, area.y, area.width, area.height, area.radius, backing); ctx.clip();
  const scale = Math[fit === 'contain' ? 'min' : 'max'](area.width / image.width, area.height / image.height);
  ctx.drawImage(image, area.x + (area.width - image.width * scale) / 2,
    area.y + (area.height - image.height * scale) / 2, image.width * scale, image.height * scale);
  ctx.restore();
}

function painter(canvas, palette) {
  const ctx = canvas.getContext('2d'), records = [];
  function line(value, area, color = palette.ink, label = '文字') {
    let size = area.fontSize;
    const minimum = area.minFontSize ?? size;
    let width;
    do {
      ctx.font = `${size}px GameplayArticleChinese`;
      width = ctx.measureText(value).width;
      if (width <= area.width) break;
      size--;
    } while (size >= minimum);
    if (width > area.width || size < minimum) throw new Error(`${label} 放不下，请缩短内容：${value}`);
    const metrics = ctx.measureText(value);
    const ascent = metrics.actualBoundingBoxAscent || size;
    const descent = metrics.actualBoundingBoxDescent || 0;
    if (area.x < 0 || area.x + width > canvas.width + 0.1 || area.baseline - ascent < 0 || area.baseline + descent > canvas.height) {
      throw new Error(`${label} 超出画布：${value}`);
    }
    ctx.fillStyle = color; ctx.fillText(value, area.x, area.baseline);
    records.push({ label, text: value, fontSize: size, width: Number(width.toFixed(2)), limit: area.width });
  }
  function paragraph(value, x, baseline, width, size, lineHeight, maxLines, label, color = palette.muted) {
    ctx.font = `${size}px GameplayArticleChinese`;
    const lines = []; let current = '';
    for (const char of Array.from(value)) {
      if (char === '\n') { lines.push(current); current = ''; continue; }
      if (current && ctx.measureText(current + char).width > width) { lines.push(current.trimEnd()); current = char.trimStart(); }
      else current += char;
    }
    if (current) lines.push(current);
    if (lines.length > maxLines) throw new Error(`${label} 超过 ${maxLines} 行，请精简说明`);
    lines.forEach((value, i) => line(value, { x, baseline: baseline + i * lineHeight, width, fontSize: size }, color, label));
  }
  function background() {
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, palette.background); gradient.addColorStop(1, palette.tint);
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#FFFFFF55';
    for (const [x, y, radius] of [[1150,120,220],[70,canvas.height-20,190],[1040,canvas.height-120,150]]) {
      ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
    }
  }
  function number(value, x, baseline) {
    roundRect(ctx, x, baseline - 30, 44, 44, 15, palette.marker);
    line(String(value), { x: x + 14, baseline, width: 26, fontSize: 25 }, palette.ink, '编号');
  }
  return { ctx, records, line, paragraph, background, number };
}

function header(p, layout, logo, name, subtitle, badgeText) {
  const { ctx, line } = p;
  const height = Math.min(layout.logo.maxHeight, layout.logo.width * logo.height / logo.width);
  const width = height * logo.width / logo.height;
  ctx.drawImage(logo, layout.logo.x, layout.logo.y, width, height);
  ctx.font = `${layout.badge.fontSize}px GameplayArticleChinese`;
  const badgeWidth = ctx.measureText(badgeText).width + layout.badge.padding * 2;
  roundRect(ctx, layout.badge.right - badgeWidth, layout.badge.y, badgeWidth, layout.badge.height, 27, '#FFFFFFBB');
  line(badgeText, { x: layout.badge.right - badgeWidth + layout.badge.padding,
    baseline: layout.badge.y + 35, width: badgeWidth - layout.badge.padding * 2,
    fontSize: layout.badge.fontSize }, undefined, '标签');
  line(name, layout.title, undefined, '游戏名');
  line(subtitle, layout.subtitle, undefined, '副标题');
}

function cover(createCanvas, layout, spec, logo, hero, name, badge) {
  const canvas = createCanvas(...layout.size), p = painter(canvas, spec.palette), a = layout.points;
  p.background(); header(p, layout, logo, name, spec.subtitle, badge);
  roundRect(p.ctx, a.x, a.y, a.width, a.height, a.radius, '#FFFFFFC7');
  p.line(spec.pointsHeading, a.heading, undefined, '要点小标题');
  const row = spec.points.length === 4 ? a.four : a.three;
  spec.points.forEach((point, i) => {
    const baseline = row.firstBaseline + row.step * i;
    p.number(i + 1, a.numberX, baseline);
    p.line(point.label, { x: a.labelX, baseline, width: a.labelWidth,
      fontSize: a.labelSize, minFontSize: a.labelMinSize }, undefined, '封面要点');
    if (spec.coverDetails?.[i]) p.line(spec.coverDetails[i], { x: a.detailX, baseline: baseline + a.detailOffset,
      width: a.detailWidth, fontSize: a.detailSize, minFontSize: a.detailMinSize }, spec.palette.muted, '封面补充');
  });
  if (spec.coverNote) p.line(spec.coverNote, a.note, spec.palette.muted, '封面注记');
  drawImage(p.ctx, hero, layout.hero, spec.heroFit || 'cover', '#FFFFFFC7');
  p.line(spec.footer, layout.footer, undefined, '底部短句');
  return { canvas, records: p.records };
}

function bodyCard(createCanvas, layout, spec, logo, name, badge) {
  const canvas = createCanvas(...layout.bodySize), p = painter(canvas, spec.palette), a = layout.body;
  p.background(); header(p, layout, logo, name, spec.subtitle, badge.replace('玩法介绍', '玩法要点'));
  spec.points.forEach((point, i) => {
    const x = a.cardX[i % 2], y = a.cardY[Math.floor(i / 2)];
    roundRect(p.ctx, x, y, a.cardWidth, a.cardHeight, a.cardRadius, '#FFFFFFCE');
    p.number(i + 1, x + 30, y + 61);
    p.line(point.label, { x: x + 94, baseline: y + 62, width: a.cardWidth - 124,
      fontSize: a.labelSize, minFontSize: 25 }, undefined, '正文要点');
    p.paragraph(point.detail, x + 30, y + 119, a.cardWidth - 60, a.detailSize, 39, 4, '正文说明');
  });
  if (spec.points.length === 3) {
    const x = a.cardX[1], y = a.cardY[1];
    roundRect(p.ctx, x, y, a.cardWidth, a.cardHeight, a.cardRadius, '#FFFFFF8C');
    p.line('试试这一局', { x: x + 30, baseline: y + 66, width: a.cardWidth - 60, fontSize: a.labelSize });
    p.paragraph(spec.footer, x + 30, y + 125, a.cardWidth - 60, a.detailSize, 39, 3, '交流短句');
  }
  const foot = a.footer;
  roundRect(p.ctx, foot.x, foot.y, foot.width, foot.height, foot.radius, '#FFFFFFAA');
  p.line('准备好开始了吗？', { x: foot.x + 32, baseline: foot.y + 55, width: foot.width - 64, fontSize: 31 });
  p.paragraph(spec.footer, foot.x + 32, foot.y + 108, foot.width - 64, 29, 37, 2, '操作提示', spec.palette.ink);
  return { canvas, records: p.records };
}

function preview(spec, name, images) {
  const imagesHtml = images.map(image => `<figure><img src="${url(image.file)}" alt="${esc(image.caption)}"><figcaption>${esc(image.caption)} · <a href="${url(image.file)}" download>下载图片</a></figcaption></figure>`).join('');
  const data = JSON.stringify({ title: spec.title, body: spec.body }).replaceAll('<', '\\u003c');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(name)} · 玩法介绍素材</title><style>
  *{box-sizing:border-box}body{margin:0;background:#fff9f1;color:#573926;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}main{max-width:1060px;margin:auto;padding:32px 24px 60px}header{display:flex;align-items:center;justify-content:space-between;gap:20px}header img{width:270px;max-width:50%}a{color:#377b60}.package{padding:12px 18px;background:#377b60;border-radius:12px;color:white;text-decoration:none}.card{padding:26px;background:white;border:1px solid #ebdfd0;border-radius:22px;margin-top:24px}h1{font-size:25px;line-height:1.5}p{line-height:1.8}.cover{width:100%;max-width:760px;border-radius:16px}.body{white-space:pre-wrap;font-size:17px;line-height:1.9}button{padding:10px 18px;margin-right:12px;border:1px solid #d6c3ae;background:#fff7ec;border-radius:10px;color:#573926;cursor:pointer}button.primary{background:#377b60;border-color:#377b60;color:white}.images{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}figure{margin:0}figure img{width:100%;border-radius:14px}figcaption{font-size:14px;line-height:1.7;margin-top:10px;color:#857260}#status{min-height:26px;margin-top:10px;color:#377b60}@media(max-width:600px){main{padding:20px 14px}.card{padding:18px}.images{grid-template-columns:1fr}}
  </style></head><body><main><header><img src="品牌标题.png" alt="游戏合集品牌"><a class="package" href="发布素材.zip" download>下载完整素材包</a></header><section class="card"><h1>${esc(spec.title)}</h1><button data-field="title">复制标题</button><button class="primary" data-field="body">复制正文</button><div id="status" role="status" aria-live="polite"></div><div class="body">${esc(spec.body)}</div></section><section class="card"><h2>统一封面</h2><img class="cover" src="封面.jpg" alt="${esc(name)}玩法介绍封面"><p><a href="封面.jpg" download>下载封面</a> · 1200 × 900</p></section><section class="card"><h2>正文配图</h2><div class="images">${imagesHtml}</div></section><section class="card"><p>发帖模板：不使用；是否配置投票：否；图片排版：图文混排。粘贴标题与正文，上传封面并按需要插入正文图片，预览确认后发布。</p></section></main><script>const article=${data};document.querySelectorAll('[data-field]').forEach(button=>button.addEventListener('click',async()=>{const value=article[button.dataset.field];let ok=false;try{await navigator.clipboard.writeText(value);ok=true}catch(e){const t=document.createElement('textarea');t.value=value;t.style.position='fixed';t.style.opacity='0';document.body.appendChild(t);t.select();ok=document.execCommand('copy');t.remove()}document.getElementById('status').textContent=ok?'已复制，可以粘贴到微信后台':'请打开对应 TXT 文件复制';}));</script></body></html>`;
}

async function main() {
  if (args.help) {
    console.log('用法：node build.cjs --project <项目根目录> --spec <文章JSON> [--output <输出目录>] [--modules <Node包目录>] [--font <中文字体>] [--manifest <清单路径>]\n列出游戏：node build.cjs --project <项目根目录> --list-games'); return;
  }
  const layout = JSON.parse(await fs.readFile(path.join(skillRoot, 'assets/cover-layout-v1.json'), 'utf8'));
  const project = path.resolve(args.project || process.cwd());
  const file = value => path.resolve(project, value);
  const manifestFile = file(args.manifest || layout.defaults.manifest);
  const manifest = JSON.parse(await fs.readFile(manifestFile, 'utf8'));
  if (!Array.isArray(manifest.games)) throw new Error('清单缺少 games 数组');
  if (args['list-games']) {
    console.log(JSON.stringify(manifest.games.map(game => ({ id: game.id, name: game.name,
      enabled: game.enabled, visibility: game.visibility, cover: game.cover })), null, 2)); return;
  }
  if (!args.spec) throw new Error('请用 --spec 指定文章 JSON；查看 --help 获取命令选项');
  const spec = JSON.parse(await fs.readFile(path.resolve(args.spec), 'utf8'));
  const matches = manifest.games.filter(game => game.id === spec.gameId);
  if (matches.length !== 1) throw new Error(`gameId 不能唯一对应清单：${spec.gameId}`);
  const game = matches[0], name = string(game.name, '游戏正式名称', true);
  if (!/^[a-z0-9][a-z0-9-]*$/u.test(game.id)) throw new Error('gameId 不能作为安全的输出目录名');
  if (spec.preview !== undefined && typeof spec.preview !== 'boolean') throw new Error('preview 必须是布尔值');
  if ((!game.enabled || game.visibility !== 'public') && !spec.preview) throw new Error('此游戏尚未公开启用；介绍待上线内容时，请明确设置 preview: true');
  for (const key of ['title', 'body', 'subtitle', 'pointsHeading', 'footer']) spec[key] = string(spec[key], key, key !== 'body');
  if (Array.from(spec.title).length > 45) throw new Error('发布标题超过 45 字，请先缩短标题');
  if (!Array.isArray(spec.points) || spec.points.length < 3 || spec.points.length > 4) throw new Error('points 需要 3～4 个真实玩法要点');
  spec.points = spec.points.map((point, i) => ({ label: string(point.label, `points[${i}].label`, true), detail: string(point.detail, `points[${i}].detail`) }));
  if (spec.coverDetails !== undefined && (!Array.isArray(spec.coverDetails) || spec.coverDetails.length !== spec.points.length)) throw new Error('coverDetails 数量必须与 points 相同');
  if (spec.coverDetails) spec.coverDetails = spec.coverDetails.map((value, i) => typeof value === 'string' && !/[\r\n]/u.test(value) ? value.trim() : (() => { throw new Error(`coverDetails[${i}] 必须是单行短句`); })());
  if (spec.coverNote !== undefined) spec.coverNote = string(spec.coverNote, 'coverNote', true);
  if (spec.heroFit !== undefined && !['cover', 'contain'].includes(spec.heroFit)) throw new Error('heroFit 只支持 cover 或 contain');
  for (const key of ['background', 'tint', 'ink', 'muted', 'marker']) {
    if (!/^#[0-9a-f]{6}$/iu.test(spec.palette?.[key] || '')) throw new Error(`palette.${key} 需要六位十六进制颜色`);
  }
  if (!Array.isArray(spec.sources) || spec.sources.length === 0) throw new Error('sources 需要至少一个已读取的规则来源');
  for (const source of spec.sources) {
    source.path = string(source.path, '规则来源路径'); source.supports = string(source.supports, '支持的规则事实');
    if (!await exists(file(source.path))) throw new Error(`规则来源不存在：${source.path}`);
  }
  let heroPath;
  if (spec.hero) heroPath = file(string(spec.hero, 'hero'));
  else {
    const resource = string(game.cover, 'Manifest cover').replace(/\/texture$/u, '');
    for (const extension of ['.png', '.jpg', '.jpeg', '.webp']) {
      const candidate = file(path.join(layout.defaults.coverBundleRoot, resource + extension));
      if (await exists(candidate)) { heroPath = candidate; break; }
    }
  }
  if (!heroPath || !await exists(heroPath)) throw new Error('未找到 Manifest 当前封面，请提供实际存在的 hero 图片');
  const logoPath = file(spec.brandLogo || layout.defaults.brandLogo);
  if (!await exists(logoPath) || path.extname(logoPath).toLowerCase() !== '.png') throw new Error('需要实际存在的品牌 PNG，请检查 brandLogo');
  const additional = spec.bodyImages ?? [];
  if (!Array.isArray(additional)) throw new Error('bodyImages 必须是图片数组');
  for (const item of additional) {
    item.path = string(item.path, '正文配图路径'); item.caption = string(item.caption, '正文配图说明');
    if (!await exists(file(item.path))) throw new Error(`正文配图不存在：${item.path}`);
  }
  const canvasLib = dependency('@napi-rs/canvas'), JSZip = dependency('jszip');
  const fonts = args.font ? [file(args.font)] : [
    '/System/Library/Fonts/STHeiti Medium.ttc', '/System/Library/Fonts/Hiragino Sans GB.ttc',
    'C:/Windows/Fonts/msyh.ttc', '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
    '/usr/share/fonts/truetype/noto/NotoSansSC-Regular.ttf',
  ];
  let fontPath;
  for (const candidate of fonts) {
    if (await exists(candidate) && canvasLib.GlobalFonts.registerFromPath(candidate, 'GameplayArticleChinese')) { fontPath = candidate; break; }
  }
  if (!fontPath) throw new Error('没有可用的中文字体，请使用 --font 指定本机中文字体文件');
  const logo = await canvasLib.loadImage(logoPath), hero = await canvasLib.loadImage(heroPath);
  const badge = spec.preview ? '待上线 · 玩法介绍' : layout.defaults.badge;
  const coverResult = cover(canvasLib.createCanvas, layout, spec, logo, hero, name, badge);
  const cardResult = bodyCard(canvasLib.createCanvas, layout, spec, logo, name, badge);
  const heroExtension = path.extname(heroPath).toLowerCase();
  const images = [{ file: `正文配图/01-玩法原画${heroExtension}`, caption: '玩法宣传原画' },
    { file: '正文配图/02-玩法要点.jpg', caption: '规则与操作要点' }];
  const files = new Map([
    ['标题.txt', Buffer.from(spec.title + '\n')], ['正文.txt', Buffer.from(spec.body + '\n')],
    ['封面.jpg', await coverResult.canvas.encode('jpeg', 93)],
    [images[0].file, await fs.readFile(heroPath)],
    [images[1].file, await cardResult.canvas.encode('jpeg', 93)],
    ['品牌标题.png', await fs.readFile(logoPath)],
    ['article.json', Buffer.from(JSON.stringify(spec, null, 2) + '\n')],
  ]);
  for (let i = 0; i < additional.length; i++) {
    const item = additional[i], imagePath = file(item.path);
    await canvasLib.loadImage(imagePath);
    const image = { file: `正文配图/${String(i + 3).padStart(2, '0')}-补充配图${path.extname(imagePath).toLowerCase()}`, caption: item.caption };
    files.set(image.file, await fs.readFile(imagePath)); images.push(image);
  }
  const report = { gameId: game.id, gameName: name, template: layout.version,
    titleCharacters: Array.from(spec.title).length, bodyCharacters: Array.from(spec.body).length,
    cover: { file: '封面.jpg', width: layout.size[0], height: layout.size[1], textLayout: coverResult.records },
    bodyCard: { file: images[1].file, width: layout.bodySize[0], height: layout.bodySize[1], textLayout: cardResult.records },
    images, source: { manifest: path.relative(project, manifestFile), hero: path.relative(project, heroPath),
      logo: path.relative(project, logoPath), facts: spec.sources }, font: fontPath };
  files.set('核对结果.json', Buffer.from(JSON.stringify(report, null, 2) + '\n'));
  files.set('发帖预览.html', Buffer.from(preview(spec, name, images)));
  files.set('使用说明.txt', Buffer.from(`《${name}》玩法介绍待发布素材\n\n打开发帖预览.html，复制标题和正文，下载封面及正文配图。也可直接使用标题.txt、正文.txt。\n\n微信后台建议设置：发帖模板不使用；是否配置投票否；图片排版图文混排。上传封面.jpg，在正文中按需要插入正文配图，预览确认官方号、文字和图片后发布。\n\n封面：1200×900；玩法要点卡：1200×1200。玩法原画用于宣传；额外实机截图以各图说明为准。\n\n模板版本：${layout.version}\n`));
  const zip = new JSZip(); for (const [name, data] of files) zip.file(name, data);
  files.set('发布素材.zip', await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
  const base = path.resolve(args.output || path.join(project, 'output/gameplay-articles', game.id));
  const output = await reserveOutput(base);
  try {
    for (const [name, data] of files) { const target = path.join(output, name); await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, data); }
  } catch (error) {
    await fs.rm(output, { recursive: true, force: true }); throw error;
  }
  console.log(JSON.stringify({ output, gameId: game.id, gameName: name, template: layout.version,
    titleCharacters: report.titleCharacters, files: Array.from(files.keys()) }, null, 2));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
