/**
 * 2D 几何：原圆环多边形轮廓、销（两条实体爪 + 一个触发口）、拖动物件。
 *
 * 所有形状都在「世界坐标（环局部单位，= 关卡 Transform 单位）」下计算。
 * 正式关卡使用 bodyLocal 的原本体轮廓，保留圆头、多路径孔洞与原碰撞容差。
 * 无轮廓的旧几何样例仍使用内外半径和缺口参数；不把扩大点击区用于碰撞。
 *
 * 几何来源（observed）：
 *   - 环带内外半径：partData.InnerRadius/OuterRadius ÷ 24，实测与 PolygonCollider2D 顶点吻合
 *     （外圈顶点半径恰好 2.0，内圈 1.5）；
 *   - 缺口角：partData.GapAngleDeg（物理/判定用），缺口中心 = gapDirectionDeg（环局部）；
 *   - 销：RingRelative 的 BoxCollider2D（trigger，尺寸 = crossWidth/2 × stemWidth）
 *     为「口」，其两个子物体 Top/Bottom 的 BoxCollider2D（非 trigger，0.05 × stemWidth，
 *     沿销局部 X 偏移 ±stemInsertOffset 附近）为两条实体爪。
 */
const EPS_LEN = 1e-4;

export const DEG = Math.PI / 180;

export function norm360(a) {
  let x = a % 360;
  if (x < 0) x += 360;
  return x;
}

/** 归一化到 (-180, 180] */
export function norm180(a) {
  let x = norm360(a);
  if (x > 180) x -= 360;
  return x;
}

export function angleDiff(a, b) {
  return norm180(a - b);
}

/** 角度是否落在 [start, start+width)（全部按度，自动处理 360 环绕） */
export function angleInArc(angle, start, width) {
  if (width >= 360 - 1e-9) return true;
  const d = norm360(angle - start);
  return d <= width + 1e-9;
}

/** 两个角度区间的最小间隔（度）；>0 表示不相交 */
export function arcGap(aStart, aWidth, bStart, bWidth) {
  const segs = (start, width) => {
    if (width >= 360 - 1e-9) return [[0, 360]];
    const s = norm360(start);
    const e = s + width;
    return e <= 360 ? [[s, e]] : [[s, 360], [0, e - 360]];
  };
  const A = segs(aStart, aWidth);
  const B = segs(bStart, bWidth);
  let best = 0;
  for (const [a1, a2] of A) {
    for (const [b1, b2] of B) {
      best = Math.max(best, Math.min(a2, b2) - Math.max(a1, b1) > 0 ? 0 : 0);
    }
  }
  // 求最小间距：把 B 的每个区间相对 A 的每个区间算距离
  let minGap = 360;
  for (const [a1, a2] of A) {
    for (const [b1, b2] of B) {
      if (b1 >= a2) minGap = Math.min(minGap, b1 - a2);
      else if (a1 >= b2) minGap = Math.min(minGap, a1 - b2);
      else minGap = 0;
    }
  }
  return Math.max(0, minGap);
}

/** 世界坐标 */
export function polar(r, deg) {
  return { x: r * Math.cos(deg * DEG), y: r * Math.sin(deg * DEG) };
}

export function addP(a, b) {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function angleTo(from, to) {
  return Math.atan2(to.y - from.y, to.x - from.x) / DEG;
}

/**
 * 环带（带缺口）的「实体」角度集合。
 * @returns {{center:number,width:number,start:number}} 缺口区间（世界角度）
 */
export function gapArc(ring) {
  const center = norm360(ring.angle + (ring.gapDir || 0));
  const width = Math.min(360, Math.max(0, ring.gapWidth || 0));
  return { center, width, start: center - width / 2 };
}

/** 点是否落在环的实体带内（半径在 [inner, outer]，且角度不在缺口内） */
export function pointInRingBandLocal(p, ring, ignoreGap = false, tol = 0) {
  if (ring.bodyLocal?.length && !ignoreGap) return pointInContours(p, ringContours(ring, tol));
  const r = Math.hypot(p.x - ring.x, p.y - ring.y);
  if (r < ring.inner + tol - EPS_LEN || r > ring.outer - tol + EPS_LEN) return false;
  if (ignoreGap) return true;
  const a = angleTo({ x: ring.x, y: ring.y }, p);
  const g = gapArc(ring);
  return !angleInArc(a, g.start, g.width);
}

/** 点是否落在环孔内（半径 < inner） */
export function pointInRingHole(p, ring) {
  return Math.hypot(p.x - ring.x, p.y - ring.y) < ring.inner - EPS_LEN;
}

/** 命中真实圆环轮廓，点击容差只扩大输入范围，不改变物理轮廓。 */
export function pointNearRingBand(point, ring, tolerance) {
  if (!ring.bodyLocal?.length) return pointInRingBandLocal(point,
    { ...ring, inner: Math.max(0, ring.inner - tolerance), outer: ring.outer + tolerance });
  const contours = ringContours(ring, 0);
  const near = contours.some(poly => {
    const box = polygonBounds(poly);
    return point.x >= box.minX - tolerance && point.x <= box.maxX + tolerance
      && point.y >= box.minY - tolerance && point.y <= box.maxY + tolerance;
  });
  return near && (pointInContours(point, contours) || contours.some(poly => contourDistance(point, poly) <= tolerance));
}

/**
 * 销的形状：以 (ring, pinAngle) 决定的「叉」。
 * 返回世界坐标下的：
 *   mouth  : 触发口（矩形，用于判定「环带是否被叉住」）
 *   prongs : 两条实体爪（矩形）
 * 每个矩形为 {cx, cy, hx, hy, axisX, axisY}（axisX 为局部 X 方向单位向量）
 */
export function pinShape(ring, attach, radius) {
  const mountDeg = ring.angle + attach.angleDeg;      // 销的安装角（世界，来自 localPosition）
  const mount = polar(radius, mountDeg);
  const center = addP({ x: ring.x, y: ring.y }, mount);
  /* 爪与口的朝向由销自身的局部旋转决定（关卡数据里 RingRelative 的 transform.rotation），
     它与安装角可以不同（实测 level10002 ring_2：安装角 -150°、朝向 -180°）。 */
  const axisDeg = ring.angle + (attach.rotDeg != null ? attach.rotDeg : attach.angleDeg);
  const axisX = polar(1, axisDeg);                    // 销的局部 X
  const axisY = { x: -axisX.y, y: axisX.x };          // 销的局部 Y
  /* 尺寸优先用关卡数据里真实导出的碰撞体（口 = RingRelative 自己的 BoxCollider2D，
     爪 = 子物体 Top/Bottom 的 BoxCollider2D），没有时退回 attachment 参数推导 */
  const crossHalf = attach.mouthSize ? attach.mouthSize.x / 2 : (attach.crossWidth || 0.6708) / 2;
  const stemHalf = attach.mouthSize ? attach.mouthSize.y / 2 : (attach.stemWidth || 0.8333) / 2;
  const prongSpecs = (attach.prongs && attach.prongs.length)
    ? attach.prongs
    : [1, -1].map((s) => ({ offset: s * ((attach.crossWidth || 0.6708) / 2 + 0.066), halfThick: 0.025, halfLen: stemHalf }));
  const prongs = prongSpecs.map((sp) => {
    // BoxCollider 的 offset 沿销自身的局部 X，不能沿销的安装位置角度旋转。
    const c = addP(center, polar(sp.offset, axisDeg));
    /* 原碰撞爪整条位于画出的卡扣（宽 = 口宽）之外，内缘离可见边约 0.04；slack 记录这段看不见的余量，
       爪与环带碰撞时允许压入这么多，接触点才与画面上卡扣的边缘一致。 */
    const slack = Math.max(0, Math.abs(sp.offset) - sp.halfThick - crossHalf);
    return { cx: c.x, cy: c.y, hx: sp.halfThick, hy: sp.halfLen, axisX, axisY, kind: 'prong', slack };
  });
  return {
    center,
    mountDeg,
    radial: radius,
    mouth: { cx: center.x, cy: center.y, hx: crossHalf, hy: stemHalf, axisX, axisY, kind: 'mouth' },
    prongs,
  };
}

/** 矩形四角（世界坐标） */
export function rectCorners(r) {
  const pts = [];
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      pts.push({
        x: r.cx + r.axisX.x * r.hx * sx + r.axisY.x * r.hy * sy,
        y: r.cy + r.axisX.y * r.hx * sx + r.axisY.y * r.hy * sy,
      });
  }
  return pts;
}

/** 采样点：四角 + 中心 + 边中点 + 内部 3×3（用于可靠的形状相交判定） */
export function rectSamples(r, n = 3) {
  const pts = rectCorners(r);
  pts.push({ x: r.cx, y: r.cy });
  for (let i = 1; i < n; i++) {
    for (let j = 1; j < n; j++) {
      const u = (i / n) * 2 - 1;
      const v = (j / n) * 2 - 1;
      pts.push({
        x: r.cx + r.axisX.x * r.hx * u + r.axisY.x * r.hy * v,
        y: r.cy + r.axisX.y * r.hx * u + r.axisY.y * r.hy * v,
      });
    }
  }
  return pts;
}

/** 稠密采样版矩形 vs 环带（只做正向采样，避免把「跨在带上的矩形」误判成相交的低估） */
export function rectHitsBandDense(r, ring, tol = 0) {
  if (ring.bodyLocal?.length) return polygonHitsContours(rectCorners(r), ringContours(ring, tol));
  const N = 3;
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N; j++) {
      const u = (i / N) * 2 - 1;
      const v = (j / N) * 2 - 1;
      const p = {
        x: r.cx + r.axisX.x * r.hx * u + r.axisY.x * r.hy * v,
        y: r.cy + r.axisX.y * r.hx * u + r.axisY.y * r.hy * v,
      };
      if (pointInRingBandLocal(p, ring, false, tol)) return true;
    }
  }
  return false;
}

/** 矩形与「环带实体」是否相交（采样法：矩形采样点落在带内，或带的采样点落在矩形内） */
export function rectHitsRingBand(r, ring, ignoreGap = false, tol = 0) {
  if (ring.bodyLocal?.length && !ignoreGap) return polygonHitsContours(rectCorners(r), ringContours(ring, tol));
  for (const p of rectSamples(r)) {
    if (pointInRingBandLocal(p, ring, ignoreGap, tol)) return true;
  }
  // 反向：沿矩形的角度覆盖范围，在带的两个半径上采样
  const corners = rectCorners(r);
  const angles = corners.map((p) => angleTo({ x: ring.x, y: ring.y }, p));
  let minA = Math.min(...angles);
  let maxA = Math.max(...angles);
  if (maxA - minA > 180) { // 跨越 ±180 的情况
    const shifted = angles.map((a) => (a < 0 ? a + 360 : a));
    minA = Math.min(...shifted);
    maxA = Math.max(...shifted);
  }
  const steps = 6;
  for (let i = 0; i <= steps; i++) {
    const a = minA + ((maxA - minA) * i) / steps;
    for (const rad of [ring.inner + tol, ring.outer - tol]) {
      const p = addP({ x: ring.x, y: ring.y }, polar(rad, a));
      /* 只有当这个采样点确实落在「实体带」里（不在缺口里）才算相交 */
      if (pointInRingBandLocal(p, ring, ignoreGap, tol) && pointInRect(p, r)) return true;
    }
  }
  return false;
}

export function pointInRect(p, r) {
  const dx = p.x - r.cx;
  const dy = p.y - r.cy;
  const u = dx * r.axisX.x + dy * r.axisX.y;
  const v = dx * r.axisY.x + dy * r.axisY.y;
  return Math.abs(u) <= r.hx + EPS_LEN && Math.abs(v) <= r.hy + EPS_LEN;
}

/** 两个矩形是否相交（分离轴 + 采样兜底） */
export function rectsIntersect(a, b) {
  const dx = b.cx - a.cx, dy = b.cy - a.cy;
  for (const axis of [a.axisX, a.axisY, b.axisX, b.axisY]) {
    const projection = Math.abs(dx * axis.x + dy * axis.y);
    const extent = r => r.hx * Math.abs(r.axisX.x * axis.x + r.axisX.y * axis.y)
      + r.hy * Math.abs(r.axisY.x * axis.x + r.axisY.y * axis.y);
    if (projection >= extent(a) + extent(b) - EPS_LEN) return false;
  }
  return true;
}

/** 矩形 vs 圆（用于滑块/炸弹的近似） */
export function rectHitsCircle(r, cx, cy, radius) {
  const dx = cx - r.cx, dy = cy - r.cy;
  const u = dx * r.axisX.x + dy * r.axisX.y, v = dx * r.axisY.x + dy * r.axisY.y;
  return Math.hypot(Math.max(0, Math.abs(u) - r.hx), Math.max(0, Math.abs(v) - r.hy)) < radius - EPS_LEN;
}

/** 松手时叉口内已无目标环带才是脱锁；闭合环同样不能在仍被叉住时消除。 */
export function pinThroughRing(pin, target) {
  return !rectHitsRingBand(pin.shape.mouth, target);
}


/* ---------------- 多边形（滑块/炸弹的真实外形来自关卡数据） ---------------- */

/** 局部多边形 → 世界多边形（含沿局部 X 的滑动偏移） */
export function polygonWorld(localPts, x, y, angleDeg, offset = { x: 0, y: 0 }) {
  const c = Math.cos(angleDeg * DEG);
  const sn = Math.sin(angleDeg * DEG);
  const dx = offset.x * c - offset.y * sn;
  const dy = offset.x * sn + offset.y * c;
  return localPts.map((p) => ({
    x: x + dx + p.x * c - p.y * sn,
    y: y + dy + p.x * sn + p.y * c,
  }));
}

export function pointInPolygon(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y)
      && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y + 1e-12) + a.x) inside = !inside;
  }
  return inside;
}

export function segIntersect(p1, p2, p3, p4) {
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (Math.abs(d) < 1e-12) return false;
  const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
  const u = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

/** 矩形 vs 多边形 */
export function rectHitsPolygon(r, poly) {
  const corners = rectCorners(r);
  if (!boundsOverlap(polygonBounds(corners), polygonBounds(poly))) return false;
  for (const p of corners) if (pointInPolygon(p, poly)) return true;
  for (const p of rectSamples(r, 3)) if (pointInPolygon(p, poly)) return true;
  for (const v of poly) if (pointInRect(v, r)) return true;
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % corners.length];
    for (let j = 0; j < poly.length; j++) {
      if (segIntersect(a, b, poly[j], poly[(j + 1) % poly.length])) return true;
    }
  }
  return false;
}

/** 多边形 vs 圆 */
export function polygonHitsCircle(poly, cx, cy, radius) {
  if (pointInPolygon({ x: cx, y: cy }, poly)) return true;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((cx - a.x) * dx + (cy - a.y) * dy) / Math.max(1e-12, dx * dx + dy * dy)));
    if (Math.hypot(cx - a.x - dx * t, cy - a.y - dy * t) <= radius) return true;
  }
  return false;
}

/** 圆与带缺口的环带：按最近径向距离和缺口两端的径向边精确判定。 */
export function circleHitsRingBand(center, radius, ring) {
  if (ring.bodyLocal?.length) {
    const contours = ringContours(ring, 0);
    return pointInContours(center, contours) || contours.some(poly => contourDistance(center, poly) <= radius);
  }
  const x = center.x - ring.x, y = center.y - ring.y, distance = Math.hypot(x, y);
  const halfGap = ring.gapWidth / 2, gap = ring.angle + ring.gapDir;
  if (ring.gapWidth <= 0 || Math.abs(angleDiff(Math.atan2(y, x) / DEG, gap)) >= halfGap) {
    return Math.max(ring.inner - distance, distance - ring.outer, 0) <= radius;
  }
  return [-1, 1].some(sign => {
    const axis = polar(1, gap + sign * halfGap), r = Math.max(ring.inner, Math.min(ring.outer, x * axis.x + y * axis.y));
    return Math.hypot(x - r * axis.x, y - r * axis.y) <= radius;
  });
}


/** 实体多边形相交，贴边不算穿透。 */
export function polygonsIntersect(a, b) {
  if (!boundsOverlap(polygonBounds(a), polygonBounds(b))) return false;
  if (a.some(p => pointInPolygon(p, b)) || b.some(p => pointInPolygon(p, a))) return true;
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) {
    if (segIntersect(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length])) return true;
  }
  return false;
}
export function polygonHitsRingBand(poly, ring, tol = .05) {
  if (ring.bodyLocal?.length) return polygonHitsContours(poly, ringContours(ring, tol));
  const box = polygonBounds(poly);
  if (!boundsOverlap(box, { minX: ring.x - ring.outer, maxX: ring.x + ring.outer,
    minY: ring.y - ring.outer, maxY: ring.y + ring.outer })) return false;
  if (poly.some(p => pointInRingBandLocal(p, ring, false, tol))) return true;
  for (let i = 0; i < 72; i++) for (const r of [ring.inner + tol, (ring.inner + ring.outer) / 2, ring.outer - tol]) {
    const p = addP(ring, polar(r, i * 5));
    if (pointInRingBandLocal(p, ring, false, tol) && pointInPolygon(p, poly)) return true;
  }
  return false;
}

/** 两条完整环带相交：同时检查内外轮廓及缺口边缘，保留孔洞。 */
export function ringBandsIntersect(a, b, tolerance = 0) {
  if (distance(a, b) >= a.outer + b.outer) return false;
  const first = ringContours(a, tolerance), second = ringContours(b, tolerance);
  if (first.some(poly => poly.some(p => pointInContours(p, second)))
    || second.some(poly => poly.some(p => pointInContours(p, first)))) return true;
  for (const ap of first) for (const bp of second) {
    if (!boundsOverlap(polygonBounds(ap), polygonBounds(bp))) continue;
    for (let i = 0; i < ap.length; i++) for (let j = 0; j < bp.length; j++) {
      if (segIntersect(ap[i], ap[(i + 1) % ap.length], bp[j], bp[(j + 1) % bp.length])) return true;
    }
  }
  return false;
}

const boundsCache = new WeakMap<object, { minX: number; maxX: number; minY: number; maxY: number }>();
function polygonBounds(points) {
  const cached = boundsCache.get(points); if (cached) return cached;
  const box = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  for (const p of points) { box.minX = Math.min(box.minX, p.x); box.maxX = Math.max(box.maxX, p.x);
    box.minY = Math.min(box.minY, p.y); box.maxY = Math.max(box.maxY, p.y); }
  boundsCache.set(points, box); return box;
}
function boundsOverlap(a, b) {
  return a.minX < b.maxX - EPS_LEN && a.maxX > b.minX + EPS_LEN
    && a.minY < b.maxY - EPS_LEN && a.maxY > b.minY + EPS_LEN;
}

const insetContours = new WeakMap<object, Map<number, { x: number; y: number }[][]>>();
const worldContours = new WeakMap<object, Map<number, { x: number; y: number }[][]>>();
const fallbackContours = new WeakMap<object, { x: number; y: number }[][]>();

function analyticContours(ring) {
  const existing = fallbackContours.get(ring); if (existing) return existing;
  const width = 360 - ring.gapWidth, start = ring.gapDir + ring.gapWidth / 2;
  const steps = Math.max(1, Math.ceil(width / 3));
  const arc = radius => Array.from({ length: steps + 1 }, (_, i) => polar(radius, start + width * i / steps));
  const outer = arc(ring.outer), inner = arc(ring.inner).reverse();
  const contours = ring.gapWidth > 0 ? [outer.concat(inner)] : [outer, inner];
  fallbackContours.set(ring, contours); return contours;
}

/** 原 PolygonCollider2D 的奇偶填充：外轮廓减去孔，不能把闭合环当实心圆。 */
function pointInContours(point, contours) {
  let inside = false;
  for (const poly of contours) if (pointInPolygon(point, poly)) inside = !inside;
  return inside;
}

function contourDistance(point, poly) {
  let distance = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], x = b.x - a.x, y = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * x + (point.y - a.y) * y) / Math.max(1e-15, x * x + y * y)));
    distance = Math.min(distance, Math.hypot(point.x - a.x - x * t, point.y - a.y - y * t));
  }
  return distance;
}

/** 保留原容差：实体轮廓向内偏移，孔向外偏移；圆头同样参与，不把缺口截成直边。 */
function ringContours(ring, tolerance) {
  let world = worldContours.get(ring);
  if (!world) { world = new Map(); worldContours.set(ring, world); }
  const existing = world.get(tolerance); if (existing) return existing;
  const local = ring.bodyLocal?.length ? ring.bodyLocal : analyticContours(ring);
  let insets = insetContours.get(local);
  if (!insets) { insets = new Map(); insetContours.set(local, insets); }
  let contours = insets.get(tolerance);
  if (!contours) {
    const clean = local.map(poly => poly.filter((point, index) => {
      const previous = poly[(index + poly.length - 1) % poly.length];
      return Math.hypot(point.x - previous.x, point.y - previous.y) > 1e-10;
    }));
    contours = !tolerance ? clean : clean.map(poly => {
      const hole = clean.filter(other => other !== poly && pointInPolygon(poly[0], other)).length % 2;
      const area = poly.reduce((sum, a, index) => {
        const b = poly[(index + 1) % poly.length]; return sum + a.x * b.y - a.y * b.x;
      }, 0);
      const inset = tolerance * (area >= 0 ? 1 : -1) * (hole ? -1 : 1);
      return poly.map((p, index) => {
        const a = poly[(index + poly.length - 1) % poly.length], b = poly[(index + 1) % poly.length];
        const before = Math.hypot(p.x - a.x, p.y - a.y), after = Math.hypot(b.x - p.x, b.y - p.y);
        const nx = -(p.y - a.y) / before, ny = (p.x - a.x) / before;
        const mx = -(b.y - p.y) / after, my = (b.x - p.x) / after;
        const weight = inset / Math.max(.05, 1 + nx * mx + ny * my);
        return { x: p.x + (nx + mx) * weight, y: p.y + (ny + my) * weight };
      });
    });
    insets.set(tolerance, contours);
  }
  const transformed = contours.map(poly => polygonWorld(poly, ring.x, ring.y, ring.angle));
  world.set(tolerance, transformed); return transformed;
}

/** 完整边交叉检查取代稀疏采样，既保留孔，也能发现细爪擦过圆头或长边的穿透。 */
function polygonHitsContours(poly, contours) {
  const bounds = polygonBounds(poly);
  if (!contours.some(contour => boundsOverlap(bounds, polygonBounds(contour)))) return false;
  if (poly.some(point => pointInContours(point, contours))) return true;
  for (const contour of contours) {
    if (contour.some(point => pointInPolygon(point, poly))) return true;
    for (let i = 0; i < poly.length; i++) for (let j = 0; j < contour.length; j++) {
      if (segIntersect(poly[i], poly[(i + 1) % poly.length], contour[j], contour[(j + 1) % contour.length])) return true;
    }
  }
  return false;
}
