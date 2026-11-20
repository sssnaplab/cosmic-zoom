// 코스믹 줌 웹 데모: 그리기 엔진. Android 앱(Ctx.kt, *Scenes.kt, Geo.kt)을 Canvas 2D 로 옮긴 것.
// 좌표: 세계 좌표(미터, 화면 가운데가 원점, y 는 아래가 +). k = 미터당 픽셀.
"use strict";

// ── 색 ──────────────────────────────────────────────────────────────
function C(argb) {
  const a = Math.floor(argb / 0x1000000) & 255;
  return mkColor((argb >> 16) & 255, (argb >> 8) & 255, argb & 255, a / 255);
}
function mkColor(r, g, b, a) {
  return { r, g, b, a, s: `rgba(${r | 0},${g | 0},${b | 0},${a.toFixed(3)})` };
}
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function lerpC(a, b, t) {
  const u = clamp(t, 0, 1);
  return mkColor(a.r + (b.r - a.r) * u, a.g + (b.g - a.g) * u, a.b + (b.b - a.b) * u, a.a + (b.a - a.a) * u);
}
function withA(c, a) { return mkColor(c.r, c.g, c.b, a); }
const WHITE = C(0xFFFFFFFF), BLACK = C(0xFF000000);

function ramp(x, a, b) { return clamp((x - a) / (b - a), 0, 1); }

/** 정수 좌표에서 [0,1) 사이의 고정 난수 */
function hash(i, j, s) {
  let x = Math.imul(i | 0, 73856093) ^ Math.imul(j | 0, 19349663) ^ Math.imul(s | 0, 83492791);
  x ^= x >>> 13; x = Math.imul(x, 0x5bd1e995);
  x ^= x >>> 15; x = Math.imul(x, 0x27d4eb2d);
  x ^= x >>> 16;
  return (x & 0xFFFFFF) / 0x1000000;
}

/** 씨앗이 같으면 같은 수열 (mulberry32) */
class Rnd {
  constructor(seed) { this.s = (seed * 2654435761) >>> 0; }
  next() {
    let t = (this.s = (this.s + 0x6D2B79F5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(n) { return Math.floor(this.next() * n); }
  gauss() {
    const u1 = Math.max(this.next(), 1e-12), u2 = this.next();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
}

// ── 언어 ────────────────────────────────────────────────────────────
const I18N = { lang: "en" };
function L(en, ko, ja, zh) {
  return { en, ko, ja, zh, get s() { return this[I18N.lang]; } };
}
function fmt(str, ...args) {
  let i = 0;
  return str.replace(/%(\.\d+)?([sdf])/g, (_, p, t) => {
    const v = args[i++];
    if (t === "f") return Number(v).toFixed(p ? +p.slice(1) : 6);
    if (t === "d") return String(Math.trunc(v));
    return String(v);
  });
}

// ── 단계·출발 위치 ─────────────────────────────────────────────────
function Level(name, emoji, size, fact, bg, space, draw) {
  return {
    get name() { return (typeof name === "function" ? name() : name).s; },
    get fact() { return (typeof fact === "function" ? fact() : fact).s; },
    emoji, size, bg, space, draw, logS: Math.log10(size),
  };
}
function MapLabel(lon, lat, name, color = WHITE, size = 12, dy = 0, bold = false) {
  return { lon, lat, name, color, size, dy, bold };
}
function Place(id, emoji, lat, lon, country, regionName, regionFact, cityName, cityFact, parkName, parkFact, river, district, mountain, labels) {
  return { id, emoji, lat, lon, country, regionName, regionFact, cityName, cityFact, parkName, parkFact, river, district, mountain, labels };
}
const SESSION = { place: null };
/** 심화 모드 한 단계(앱 Deep.kt) */
function Deep(emoji, key, numbers, theory, think, answer) { return { emoji, key, numbers, theory, think, answer }; }

const SPACE_BG = C(0xFF000005);
const OCEAN = C(0xFF1F5FA8), LAND = C(0xFF5E9E4C), CITY_BASE = C(0xFFCFCAC0), GRASS = C(0xFF6DB34F);
const WATER = C(0xFF3F82C4), SKIN = C(0xFFF2C29C), SKIN_DARK = C(0xFFD99B72);
const AU = 1.496e11, LY = 9.461e15;
const SUN_X = -AU * 0.8, SUN_Y = -AU * 0.6;
const SUN_COLOR = C(0xFFFFE08A), LABEL_SOFT = C(0xFFDDE3FF);
const FONT = 'system-ui, -apple-system, "Apple SD Gothic Neo", "Hiragino Sans", "PingFang SC", "Noto Sans KR", "Noto Sans JP", "Noto Sans SC", sans-serif';

// ── 한 프레임 문맥 ─────────────────────────────────────────────────
class Ctx {
  constructor(g, w, h, k, t, logW, density) {
    this.g = g; this.w = w; this.h = h; this.k = k; this.t = t; this.logW = logW; this.density = density;
    this.cx = w / 2; this.cy = h / 2;
    this.hwX = this.cx / k; this.hwY = this.cy / k;
  }
  sx(m) { return this.cx + m * this.k; }
  sy(m) { return this.cy + m * this.k; }
  px(m) { return m * this.k; }
  dp(v) { return v * this.density; }
  band(lo, hi) { return Math.min(ramp(this.logW, lo - 0.35, lo), 1 - ramp(this.logW, hi, hi + 0.35)); }
  visible(xm, ym, rPx) {
    const x = this.cx + xm * this.k, y = this.cy + ym * this.k;
    return x + rPx > 0 && x - rPx < this.w && y + rPx > 0 && y - rPx < this.h;
  }
  covers(xm, ym, rPx) {
    const x = this.cx + xm * this.k, y = this.cy + ym * this.k;
    const dx = Math.max(Math.abs(x), Math.abs(x - this.w)), dy = Math.max(Math.abs(y), Math.abs(y - this.h));
    return dx * dx + dy * dy < rPx * rPx;
  }
  alpha(a) { this.g.globalAlpha = Math.min(a, 1); }

  // 낮은 수준 그리기(화면 픽셀)
  disc(x, y, r, color, a) {
    const g = this.g; this.alpha(a); g.fillStyle = color.s;
    g.beginPath(); g.arc(x, y, r, 0, 2 * Math.PI); g.fill();
  }
  radial(x, y, r, stops, a, gx = x, gy = y, gr = r) {
    const g = this.g;
    const gr0 = g.createRadialGradient(gx, gy, 0, gx, gy, gr);
    for (const [p, c] of stops) gr0.addColorStop(p, c.s);
    this.alpha(a); g.fillStyle = gr0;
    g.beginPath(); g.arc(x, y, r, 0, 2 * Math.PI); g.fill();
  }

  fill(color, a) {
    if (a > 0.003) { this.alpha(a); this.g.fillStyle = color.s; this.g.fillRect(0, 0, this.w, this.h); }
  }
  circle(xm, ym, rm, color, a, minPx = 0) {
    if (a <= 0.003) return;
    const rD = Math.max(rm * this.k, minPx);
    if (rD > 20000 && this.covers(xm, ym, rD)) { this.fill(color, a); return; }
    if (rD < 0.2 || !this.visible(xm, ym, rD)) return;
    this.disc(this.sx(xm), this.sy(ym), rD, color, a);
  }
  sphere(xm, ym, rm, base, a, minPx = 0) {
    if (a <= 0.003) return;
    const r = Math.max(rm * this.k, minPx);
    if (r < 0.3 || !this.visible(xm, ym, r)) return;
    const x = this.sx(xm), y = this.sy(ym);
    if (r < 3) { this.disc(x, y, r, base, a); return; }
    this.radial(x, y, r, [[0, lerpC(base, WHITE, 0.55)], [0.45, base], [1, lerpC(base, BLACK, 0.55)]], a, x - r * 0.35, y - r * 0.35, r * 1.45);
  }
  glow(xm, ym, rPx, color, a) {
    if (a <= 0.003 || rPx < 0.5 || !this.visible(xm, ym, rPx)) return;
    const x = this.sx(xm), y = this.sy(ym);
    this.radial(x, y, rPx, [[0, color], [1, withA(color, 0)]], a);
  }
  ring(xm, ym, rm, color, a, strokePx = 1.5, dashed = false) {
    if (a <= 0.003) return;
    const r = rm * this.k;
    if (r < 1 || r > 3e6) return;
    if (!this.visible(xm, ym, r + strokePx)) return;
    if (this.covers(xm, ym, r - strokePx)) return;
    const g = this.g; this.alpha(a);
    g.strokeStyle = color.s; g.lineWidth = strokePx;
    if (dashed) g.setLineDash([this.dp(5), this.dp(5)]);
    g.beginPath(); g.arc(this.sx(xm), this.sy(ym), r, 0, 2 * Math.PI); g.stroke();
    if (dashed) g.setLineDash([]);
  }
  rrect(x0, y0, x1, y1, r, color, a) {
    if (a <= 0.003) return;
    const l = this.sx(x0), tp = this.sy(y0), rr = this.sx(x1), b = this.sy(y1);
    if (rr < 0 || l > this.w || b < 0 || tp > this.h) return;
    const g = this.g; this.alpha(a); g.fillStyle = color.s;
    const rad = Math.min(this.px(r), (rr - l) / 2, (b - tp) / 2);
    g.beginPath();
    if (g.roundRect) g.roundRect(l, tp, rr - l, b - tp, Math.max(0, rad)); else g.rect(l, tp, rr - l, b - tp);
    g.fill();
  }
  rect(x0, y0, x1, y1, color, a) {
    if (a <= 0.003) return;
    const l = Math.max(this.sx(x0), -10), tp = Math.max(this.sy(y0), -10);
    const rr = Math.min(this.sx(x1), this.w + 10), b = Math.min(this.sy(y1), this.h + 10);
    if (rr <= l || b <= tp) return;
    this.alpha(a); this.g.fillStyle = color.s; this.g.fillRect(l, tp, rr - l, b - tp);
  }
  line(x0, y0, x1, y1, color, a, widthPx) {
    if (a <= 0.003) return;
    const g = this.g; this.alpha(a);
    g.strokeStyle = color.s; g.lineWidth = widthPx; g.lineCap = "round";
    g.beginPath(); g.moveTo(this.sx(x0), this.sy(y0)); g.lineTo(this.sx(x1), this.sy(y1)); g.stroke();
  }
  pathOf(pts, closed, ox = 0, oy = 0) {
    const g = this.g; g.beginPath();
    for (let i = 0; i < pts.length; i += 2) {
      const x = this.sx(pts[i] + ox), y = this.sy(pts[i + 1] + oy);
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    if (closed) g.closePath();
  }
  polyFill(pts, bbox, color, a) {
    if (a <= 0.003) return;
    if (bbox && (this.sx(bbox[2]) < 0 || this.sx(bbox[0]) > this.w || this.sy(bbox[3]) < 0 || this.sy(bbox[1]) > this.h)) return;
    this.pathOf(pts, true); this.alpha(a); this.g.fillStyle = color.s; this.g.fill();
  }
  polyline(pts, color, a, widthPx) {
    if (a <= 0.003) return;
    const g = this.g;
    this.pathOf(pts, false); this.alpha(a);
    g.strokeStyle = color.s; g.lineWidth = widthPx; g.lineCap = "round"; g.lineJoin = "round"; g.stroke();
  }
  dots(arr, color, sizePx, a, ox = 0, oy = 0) {
    if (a <= 0.01) return;
    const g = this.g, k = this.k, cx = this.cx, cy = this.cy, w = this.w, h = this.h;
    const r = sizePx / 2;
    g.beginPath();
    let n = 0;
    for (let i = 0; i < arr.length; i += 2) {
      const x = cx + (arr[i] + ox) * k, y = cy + (arr[i + 1] + oy) * k;
      if (x > -4 && x < w + 4 && y > -4 && y < h + 4) {
        if (r < 1.2) g.rect(x - r, y - r, sizePx, sizePx);
        else { g.moveTo(x + r, y); g.arc(x, y, r, 0, 2 * Math.PI); }
        n++;
      }
    }
    if (n) { this.alpha(a); g.fillStyle = color.s; g.fill(); }
  }
  label(text, xm, ym, a, color = WHITE, sizeSp = 13, dyPx = 0, bold = false) {
    if (a <= 0.03) return;
    const x = this.sx(xm), y = this.sy(ym) + dyPx;
    if (x < -300 || x > this.w + 300 || y < -60 || y > this.h + 60) return;
    const g = this.g;
    g.save();
    g.globalAlpha = clamp(a, 0, 1);
    g.font = `${bold ? 700 : 500} ${sizeSp * this.density}px ${FONT}`;
    g.textAlign = "center"; g.textBaseline = "middle";
    g.shadowColor = "rgba(0,0,0,0.85)"; g.shadowOffsetY = 1; g.shadowBlur = 6;
    g.fillStyle = color.s;
    g.fillText(text, x, y);
    g.restore();
  }
  /** 화면에 보이는 영역을 cell 크기 격자로 훑는다. 칸이 너무 많으면 아무것도 하지 않는다. */
  grid(cell, maxCount, f) {
    const nx = 2 * this.hwX / cell + 2, ny = 2 * this.hwY / cell + 2;
    if (nx * ny > maxCount) return;
    const i0 = Math.floor(-this.hwX / cell) - 1, i1 = Math.floor(this.hwX / cell) + 1;
    const j0 = Math.floor(-this.hwY / cell) - 1, j1 = Math.floor(this.hwY / cell) + 1;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) f(i, j, i * cell, j * cell);
  }
}

// ── 0. 우주 거대 구조 ─────────────────────────────────────────────
const WebData = (() => {
  const S = 1e26, r = new Rnd(11), n = 64;
  const nodes = new Float64Array(n * 2);
  for (let i = 1; i < n; i++) {
    const rr = S * 0.75 * Math.sqrt(r.next()), an = r.next() * 2 * Math.PI;
    nodes[2 * i] = rr * Math.cos(an); nodes[2 * i + 1] = rr * Math.sin(an);
  }
  const edges = [], seen = new Set();
  for (let i = 0; i < n; i++) {
    const order = [];
    for (let j = 0; j < n; j++) if (j !== i) order.push(j);
    order.sort((p, q) => Math.hypot(nodes[2 * i] - nodes[2 * p], nodes[2 * i + 1] - nodes[2 * p + 1]) - Math.hypot(nodes[2 * i] - nodes[2 * q], nodes[2 * i + 1] - nodes[2 * q + 1]));
    for (const j of order.slice(0, 3)) {
      const key = Math.min(i, j) * 1000 + Math.max(i, j);
      if (!seen.has(key)) { seen.add(key); edges.push([i, j]); }
    }
  }
  const p = [];
  for (const [e0, e1] of edges) {
    const ax = nodes[2 * e0], ay = nodes[2 * e0 + 1], bx = nodes[2 * e1], by = nodes[2 * e1 + 1];
    const len = Math.max(Math.hypot(bx - ax, by - ay), 1);
    const nx = -(by - ay) / len, ny = (bx - ax) / len;
    for (let m = 0; m < 28; m++) {
      const tt = r.next(), off = r.gauss() * S * 0.005;
      p.push(ax + (bx - ax) * tt + nx * off, ay + (by - ay) * tt + ny * off);
    }
  }
  for (let i = 0; i < n; i++) for (let m = 0; m < 22; m++) p.push(nodes[2 * i] + r.gauss() * S * 0.012, nodes[2 * i + 1] + r.gauss() * S * 0.012);
  return { S, nodes, edges, pts: p };
})();

function drawCosmicWeb(c, b) {
  const d = WebData, fil = C(0xFF7D6BFF);
  const wpx = Math.max(1.5, c.px(d.S * 0.004));
  for (const [e0, e1] of d.edges) c.line(d.nodes[2 * e0], d.nodes[2 * e0 + 1], d.nodes[2 * e1], d.nodes[2 * e1 + 1], fil, b * 0.22, wpx);
  for (let i = 0; i < d.nodes.length / 2; i++) c.glow(d.nodes[2 * i], d.nodes[2 * i + 1], c.px(d.S * 0.03), C(0xFFB9A8FF), b * 0.45);
  c.dots(d.pts, C(0xFFD9D2FF), c.dp(1.6), b * 0.85);
  const m = b * c.band(25, 27);
  c.ring(0, 0, c.dp(10) / c.k, C(0xFFFFD34D), m, c.dp(2));
  c.label(S.weAreHere.s, 0, 0, m, C(0xFFFFD34D), 13, c.dp(24), true);
}

// ── 1. 라니아케아 초은하단 ─────────────────────────────────────────
const LaniData = (() => {
  const S = 5e24, gx = 0.22 * S, gy = -0.08 * S, r = new Rnd(22);
  const q = (cv, t) => { const u = 1 - t; return [u * u * cv[0] + 2 * u * t * cv[2] + t * t * cv[4], u * u * cv[1] + 2 * u * t * cv[3] + t * t * cv[5]]; };
  const curves = [];
  const p0x = -0.32 * S, p0y = 0.2 * S;
  curves.push([p0x, p0y, (0 - 0.25 * p0x - 0.25 * gx) / 0.5, (0 - 0.25 * p0y - 0.25 * gy) / 0.5, gx, gy]);
  for (let i = 0; i < 15; i++) {
    const an = i * 2 * Math.PI / 15 + r.next() * 0.3, r0 = S * (0.42 + 0.15 * r.next());
    curves.push([gx + r0 * Math.cos(an), gy + r0 * Math.sin(an), gx + r0 * 0.55 * Math.cos(an + 0.7), gy + r0 * 0.55 * Math.sin(an + 0.7), gx, gy]);
  }
  const p = [];
  for (const cv of curves) for (let m = 0; m < 90; m++) { const pt = q(cv, r.next()); p.push(pt[0] + r.gauss() * S * 0.013, pt[1] + r.gauss() * S * 0.013); }
  for (let m = 0; m < 450; m++) p.push(gx + r.gauss() * S * 0.05, gy + r.gauss() * S * 0.05);
  for (let m = 0; m < 300; m++) { const rr = S * 0.65 * Math.sqrt(r.next()), an = r.next() * 2 * Math.PI; p.push(gx + rr * Math.cos(an), gy + rr * Math.sin(an)); }
  const samples = curves.map(cv => { const o = []; for (let i = 0; i <= 40; i++) o.push(...q(cv, i / 40)); return o; });
  return { S, gx, gy, samples, pts: p };
})();

function drawLaniakea(c, b) {
  const d = LaniData;
  c.ring(d.gx, d.gy, d.S * 0.6, C(0xFF6FD0FF), b * 0.35, c.dp(1.5), true);
  for (const s of d.samples) c.polyline(s, C(0xFF50D0FF), b * 0.28, c.dp(1.4));
  c.glow(d.gx, d.gy, c.px(d.S * 0.09), C(0xFFFFD98A), b * 0.5);
  c.dots(d.pts, C(0xFFEDE6FF), c.dp(1.7), b * 0.9);
  const m = b * c.band(23.6, 25.6);
  c.label(S.galaxiesFlow.s, d.gx, d.gy, m, C(0xFFFFE6A8), 12, c.dp(22));
  c.ring(0, 0, c.dp(9) / c.k, C(0xFFFFD34D), b * c.band(23.6, 25.0), c.dp(2));
  c.label(S.localGroup.s, 0, 0, b * c.band(23.6, 25.0), C(0xFFFFD34D), 12, c.dp(22), true);
}

// ── 2. 국부 은하군 ─────────────────────────────────────────────────
const LocalGroupData = (() => {
  const ax = 1.75e22, ay = -1.65e22, m33x = 2.35e22, m33y = -1.05e22, r = new Rnd(33), p = [];
  for (let i = 0; i < 28; i++) p.push(r.gauss() * 7e21, r.gauss() * 7e21);
  for (let i = 0; i < 22; i++) p.push(ax + r.gauss() * 5e21, ay + r.gauss() * 5e21);
  for (let i = 0; i < 60; i++) p.push((r.next() - 0.5) * 1.6e23, (r.next() - 0.5) * 3.2e23);
  return { ax, ay, m33x, m33y, dwarfs: p };
})();

function spiralOval(c, xm, ym, radius, tilt, angleDeg, a, minPx) {
  if (a <= 0.003) return;
  const rx = Math.max(c.px(radius), minPx);
  if (!c.visible(xm, ym, rx)) return;
  const ry = rx * tilt, x = c.sx(xm), y = c.sy(ym), g = c.g;
  g.save(); g.translate(x, y); g.rotate(angleDeg * Math.PI / 180); g.scale(1, tilt);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx);
  gr.addColorStop(0, C(0xFFFFF2D8).s); gr.addColorStop(0.18, C(0xEED9D2FF).s); gr.addColorStop(0.55, C(0x887F95FF).s); gr.addColorStop(1, C(0x00405AFF).s);
  c.alpha(a); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rx, 0, 2 * Math.PI); g.fill();
  if (rx > 30) {
    c.alpha(a * 0.35); g.strokeStyle = C(0xFF2A1E3A).s; g.lineWidth = Math.max(1, rx * 0.025);
    g.beginPath(); g.arc(0, 0, rx * 0.62, 0, 2 * Math.PI); g.stroke();
  }
  g.restore();
  void ry;
}

function drawLocalGroup(c, b) {
  const d = LocalGroupData;
  c.dots(d.dwarfs, C(0xFFCFD6FF), c.dp(1.8), b * 0.7);
  c.glow(0, 0, Math.max(c.dp(3), c.px(6e20)), C(0xFFE8E4FF), b * 0.75);
  spiralOval(c, d.ax, d.ay, 1.1e21, 0.32, -35, b, c.dp(4));
  spiralOval(c, d.m33x, d.m33y, 3e20, 0.7, 20, b * 0.9, c.dp(2.5));
  c.glow(1.2e21, 1.0e21, Math.max(c.dp(2), c.px(9e19)), C(0xFFDDE6FF), b * 0.9);
  c.glow(1.6e21, 1.55e21, Math.max(c.dp(1.5), c.px(5e19)), C(0xFFDDE6FF), b * 0.8);
  c.label(S.andromeda.s, d.ax, d.ay, b * c.band(22.3, 23.9), LABEL_SOFT, 12, c.dp(22));
  c.label(S.triangulum.s, d.m33x, d.m33y, b * c.band(22.3, 23.3), LABEL_SOFT, 11, c.dp(18));
  c.label(S.lmc.s, 1.2e21, 1.0e21, b * c.band(21.0, 22.0), LABEL_SOFT, 11, c.dp(16));
  c.label(S.smc.s, 1.6e21, 1.55e21, b * c.band(21.0, 21.8), LABEL_SOFT, 11, c.dp(16));
  c.label(S.milkyWay.s, 0, 0, b * c.band(22.3, 23.6), C(0xFFFFD34D), 12, c.dp(22), true);
}

// ── 3. 우리은하 ────────────────────────────────────────────────────
const MilkyWayData = (() => {
  const gx = 2.3e20, gy = -1.1e20, r = new Rnd(44);
  const a = [], bl = [], dk = [], pk = [];
  for (let n = 0; n < 3800; n++) {
    const j = n % 4, th = r.next() * 9;
    const rad = 3e19 * Math.exp(0.3 * th) * (1 + r.gauss() * 0.07);
    const an = th + j * Math.PI / 2 + r.gauss() * 0.11;
    a.push(gx + rad * Math.cos(an), gy + rad * Math.sin(an));
    if (n % 55 === 0) pk.push(gx + rad * Math.cos(an), gy + rad * Math.sin(an));
  }
  for (let n = 0; n < 1000; n++) bl.push(gx + r.gauss() * 2.6e19, gy + r.gauss() * 2.0e19);
  for (let n = 0; n < 900; n++) { const rr = 5e20 * Math.sqrt(r.next()), an = r.next() * 2 * Math.PI; dk.push(gx + rr * Math.cos(an), gy + rr * Math.sin(an)); }
  return { gx, gy, arms: a, bulge: bl, disk: dk, pink: pk };
})();

function drawMilkyWay(c, b) {
  const d = MilkyWayData;
  c.glow(d.gx, d.gy, c.px(5.3e20), C(0x553A55C0), b);
  c.glow(d.gx, d.gy, c.px(1.1e20), C(0xFFFFE2A8), b * 0.9);
  c.dots(d.disk, C(0xFFB8C4FF), c.dp(1.3), b * 0.55);
  c.dots(d.arms, C(0xFFE2E8FF), c.dp(1.6), b * 0.9);
  c.dots(d.bulge, C(0xFFFFE0A0), c.dp(1.6), b * 0.9);
  c.dots(d.pink, C(0xFFFF8FC8), c.dp(3), b * 0.8);
  const m = b * c.band(19.4, 21.6);
  c.glow(0, 0, c.dp(7), SUN_COLOR, m);
  c.ring(0, 0, c.dp(12) / c.k, C(0xFFFFD34D), m, c.dp(2));
  c.label(S.sunHere.s, 0, 0, m, C(0xFFFFD34D), 12, c.dp(26), true);
  c.label(S.galacticCenter.s, d.gx, d.gy, b * c.band(20.4, 21.7), C(0xFFFFE6A8), 11, c.dp(22));
}

// ── 4. 태양 이웃 별들 ───────────────────────────────────────────────
const NeighborData = (() => {
  const Sz = 1e18, r = new Rnd(55), st = [];
  for (let i = 0; i < 900; i++) {
    const rr = Sz * Math.pow(10, -1.6 + r.next() * 3.1), an = r.next() * 2 * Math.PI;
    st.push(rr * Math.cos(an), rr * Math.sin(an), 0.8 + Math.pow(r.next(), 3) * 2.4, r.int(5));
  }
  const n = (name, ly, deg, col, s) => ({ name, x: ly * LY * Math.cos(deg * Math.PI / 180), y: ly * LY * Math.sin(deg * Math.PI / 180), color: C(col), size: s });
  return {
    stars: st,
    palette: [C(0xFFFFFFFF), C(0xFFBFD4FF), C(0xFFFFF0C8), C(0xFFFFC890), C(0xFFFF9C80)],
    named: () => [
      n(S.proxima, 4.24, 205, 0xFFFF8A70, 2.5), n(S.alphaCen, 4.37, 214, 0xFFFFF0C8, 4),
      n(S.barnard, 5.96, 300, 0xFFFF9C80, 2.5), n(S.sirius, 8.6, 120, 0xFFD6E4FF, 5.5),
      n(S.procyon, 11.5, 80, 0xFFFFF6E0, 4), n(S.altair, 16.7, 335, 0xFFF4F7FF, 4),
      n(S.vega, 25, 15, 0xFFCFE0FF, 4.5), n(S.fomalhaut, 25, 160, 0xFFE8F0FF, 3.5),
      n(S.pollux, 33.8, 255, 0xFFFFD8A0, 4), n(S.arcturus, 36.7, 45, 0xFFFFC080, 5),
      n(S.capella, 42.9, 280, 0xFFFFF0B0, 5), n(S.regulus, 79, 140, 0xFFD0E0FF, 4),
    ],
  };
})();
let NAMED_STARS = null;

function drawNeighbors(c, b, a) {
  const d = NeighborData;
  if (a > 0.01) {
    const g = c.g;
    for (let pi = 0; pi < 5; pi++) {
      g.beginPath();
      for (let i = 0; i < d.stars.length; i += 4) {
        if (d.stars[i + 3] !== pi) continue;
        const sx = c.cx + d.stars[i] * c.k, sy = c.cy + d.stars[i + 1] * c.k;
        if (sx > -4 && sx < c.w + 4 && sy > -4 && sy < c.h + 4) {
          const rr = c.dp(d.stars[i + 2]) * 0.5;
          g.moveTo(sx + rr, sy); g.arc(sx, sy, rr, 0, 2 * Math.PI);
        }
      }
      c.alpha(a * 0.9); g.fillStyle = d.palette[pi].s; g.fill();
    }
  }
  if (!NAMED_STARS) NAMED_STARS = d.named();
  for (const s of NAMED_STARS) {
    const dist = Math.hypot(s.x, s.y) * c.k;
    const vis = b * ramp(dist, 18, 45);
    c.glow(s.x, s.y, c.dp(s.size * 2.6), s.color, vis);
    c.circle(s.x, s.y, 0, WHITE, vis, c.dp(s.size * 0.45));
    c.label(s.name.s, s.x, s.y, vis * ramp(dist, 40, 80), LABEL_SOFT, 11, c.dp(16));
  }
  c.glow(0, 0, c.dp(12), SUN_COLOR, b);
  c.circle(0, 0, 0, WHITE, b, c.dp(2.5));
  c.label(S.sun.s, 0, 0, b * c.band(16.4, 19.2), C(0xFFFFD34D), 12, c.dp(20), true);
}

// ── 5. 오르트 구름 ─────────────────────────────────────────────────
const OortComets = (() => {
  const r = new Rnd(66), p = [], rmin = 2e14, rmax = 1.5e16;
  for (let i = 0; i < 1100; i++) {
    const rr = Math.cbrt(r.next() * (rmax ** 3 - rmin ** 3) + rmin ** 3);
    const z = r.next() * 2 - 1, an = r.next() * 2 * Math.PI, s = Math.sqrt(1 - z * z);
    p.push(rr * s * Math.cos(an), rr * s * Math.sin(an));
  }
  return p;
})();

function drawOort(c, b) {
  const rp = c.px(1.55e16);
  if (b > 0.01 && rp > 2 && rp < 1e6) {
    c.radial(c.cx, c.cy, rp, [[0, C(0x002A4A7A)], [0.75, C(0x183A6AB0)], [0.97, C(0x2A6A9AE0)], [1, C(0x00000000)]], b);
  }
  c.dots(OortComets, C(0xFFAFD0FF), c.dp(1.3), b * 0.75);
  c.label(S.oort.s, 0, -1.2e16, b * c.band(15.7, 17.4), C(0xFFBFE0FF), 12);
  c.glow(SUN_X, SUN_Y, c.dp(9), SUN_COLOR, b);
  c.label(S.sun.s, SUN_X, SUN_Y, b * c.band(14.4, 16.2), C(0xFFFFD34D), 12, c.dp(18), true);
}

// ── 6. 태양계 ──────────────────────────────────────────────────────
const SolarData = (() => {
  const r = new Rnd(77), p = [];
  for (let i = 0; i < 700; i++) { const rr = 4.5e12 + r.next() * 3e12, an = r.next() * 2 * Math.PI; p.push(SUN_X + rr * Math.cos(an), SUN_Y + rr * Math.sin(an)); }
  return {
    planets: () => [
      { name: S.jupiter, r: 7.78e11, deg: 200, color: C(0xFFD8B48A), size: 5 },
      { name: S.saturn, r: 1.43e12, deg: 320, color: C(0xFFE8D29A), size: 4.5, rings: true },
      { name: S.uranus, r: 2.87e12, deg: 60, color: C(0xFF9EE6E8), size: 3.5 },
      { name: S.neptune, r: 4.5e12, deg: 140, color: C(0xFF5B7FFF), size: 3.5 },
      { name: S.pluto, r: 5.9e12, deg: 250, color: C(0xFFC9B39A), size: 2.2, dwarf: true },
    ],
    kuiper: p,
  };
})();
let PLANETS = null;

function drawSolarSystem(c, b) {
  const orbit = C(0xFF8899CC);
  if (!PLANETS) PLANETS = SolarData.planets();
  c.dots(SolarData.kuiper, C(0xFF9AA8C8), c.dp(1.3), b * 0.55);
  for (const p of PLANETS) {
    c.ring(SUN_X, SUN_Y, p.r, orbit, b * 0.35, c.dp(1), !!p.dwarf);
    const x = SUN_X + p.r * Math.cos(p.deg * Math.PI / 180), y = SUN_Y + p.r * Math.sin(p.deg * Math.PI / 180);
    if (p.rings) c.ring(x, y, c.dp(p.size * 1.9) / c.k, C(0xFFEADBB0), b * 0.8, c.dp(1.2));
    c.sphere(x, y, 0, p.color, b, c.dp(p.size));
    c.label(p.name.s, x, y, b * c.band(11.9, 13.9), LABEL_SOFT, 11, c.dp(16));
  }
  c.label(S.kuiper.s, SUN_X, SUN_Y - 6.2e12, b * c.band(12.6, 13.9), C(0xFFB0BCD8), 11);
  c.glow(SUN_X, SUN_Y, c.dp(14), SUN_COLOR, b);
  c.label(S.sun.s, SUN_X, SUN_Y, b * c.band(11.9, 13.6), C(0xFFFFD34D), 12, c.dp(20), true);
}

// ── 7. 지구 궤도(안쪽 행성) ─────────────────────────────────────────
const Asteroids = (() => {
  const r = new Rnd(88), p = [];
  for (let i = 0; i < 500; i++) { const rr = 3.2e11 + r.next() * 1.7e11, an = r.next() * 2 * Math.PI; p.push(SUN_X + rr * Math.cos(an), SUN_Y + rr * Math.sin(an)); }
  return p;
})();

function drawInner(c, b) {
  const orbit = C(0xFF8899CC);
  c.dots(Asteroids, C(0xFFA89A88), c.dp(1.3), b * 0.6);
  c.label(S.asteroids.s, SUN_X + 3.9e11, SUN_Y, b * c.band(11.2, 12.5), C(0xFFC8B8A0), 11);
  const list = [[S.mercury, 5.79e10, 30, C(0xFFB8A99A)], [S.venus, 1.082e11, 150, C(0xFFF0D9A0)], [S.mars, 2.279e11, 290, C(0xFFE07050)]];
  c.ring(SUN_X, SUN_Y, AU, C(0xFF6FA8FF), b * 0.55, c.dp(1.3));
  for (const [name, rr, deg, col] of list) {
    c.ring(SUN_X, SUN_Y, rr, orbit, b * 0.35, c.dp(1));
    const x = SUN_X + rr * Math.cos(deg * Math.PI / 180), y = SUN_Y + rr * Math.sin(deg * Math.PI / 180);
    c.sphere(x, y, 2.5e6, col, b, c.dp(3.2));
    c.label(name.s, x, y, b * c.band(10.4, 12.4), LABEL_SOFT, 11, c.dp(15));
  }
  const sr = c.px(6.96e8);
  c.glow(SUN_X, SUN_Y, Math.max(c.dp(26), sr * 3), C(0xFFFFB84D), b);
  c.circle(SUN_X, SUN_Y, 6.96e8, SUN_COLOR, b, c.dp(8));
  c.label(S.sun.s, SUN_X, SUN_Y, b * c.band(10.0, 12.4), C(0xFFFFD34D), 13, Math.max(c.dp(26), sr + c.dp(14)), true);
  c.circle(0, 0, 0, C(0xFF4A90FF), b * ramp(c.logW, 9, 10), c.dp(3.5));
  c.label(S.earth.s, 0, 0, b * c.band(10.5, 12.4), C(0xFF9CC8FF), 12, c.dp(16), true);
}

// ── 8. 지구와 달 ───────────────────────────────────────────────────
const MOON_X = 3.84e8 * Math.cos(-40 * Math.PI / 180), MOON_Y = 3.84e8 * Math.sin(-40 * Math.PI / 180);
function drawEarthMoon(c, b) {
  c.ring(0, 0, 3.84e8, C(0xFF8899CC), b * 0.4, c.dp(1.2), true);
  const mr = 1.737e6;
  c.sphere(MOON_X, MOON_Y, mr, C(0xFFC8C8C8), b, c.dp(3));
  const rp = c.px(mr);
  if (rp > 14) {
    for (const cr of [[-0.3, -0.2, 0.22], [0.25, 0.1, 0.15], [-0.05, 0.4, 0.12], [0.35, -0.35, 0.1], [-0.45, 0.25, 0.09]]) {
      c.circle(MOON_X + cr[0] * mr, MOON_Y + cr[1] * mr, cr[2] * mr, C(0xFF8E8E8E), b * 0.55);
    }
  }
  c.label(S.moon.s, MOON_X, MOON_Y, b * c.band(7.3, 9.9), LABEL_SOFT, 12, Math.max(c.dp(16), rp + c.dp(12)));
  c.label(S.earth.s, 0, 0, b * c.band(8.3, 10.4), C(0xFF9CC8FF), 12, c.dp(18), true);
}

// ── 지도(출발 위치를 정면으로 둔 정사영) ───────────────────────────
const Geo = {
  R: 6.371e6,
  cache: null,
  get map() {
    const p = SESSION.place;
    if (this.cache && this.cache.place === p) return this.cache;
    return (this.cache = makeMap(p));
  },
};
function makeMap(place) {
  const R = Geo.R, phi0 = place.lat * Math.PI / 180, lon0 = place.lon;
  const sinP0 = Math.sin(phi0), cosP0 = Math.cos(phi0);
  function project(lon, lat) {
    const phi = lat * Math.PI / 180, dl = (lon - lon0) * Math.PI / 180;
    const x = R * Math.cos(phi) * Math.sin(dl);
    const yN = R * (cosP0 * Math.sin(phi) - sinP0 * Math.cos(phi) * Math.cos(dl));
    const cosc = sinP0 * Math.sin(phi) + cosP0 * Math.cos(phi) * Math.cos(dl);
    if (cosc < 0) { const d = Math.max(Math.hypot(x, yN), 1); return [x / d * R, -yN / d * R]; }
    return [x, -yN];
  }
  function front(lon, lat) {
    const phi = lat * Math.PI / 180, dl = (lon - lon0) * Math.PI / 180;
    return sinP0 * Math.sin(phi) + cosP0 * Math.cos(phi) * Math.cos(dl) > 0.02;
  }
  function proj(ll) { const o = new Array(ll.length); for (let i = 0; i < ll.length; i += 2) { const p = project(ll[i], ll[i + 1]); o[i] = p[0]; o[i + 1] = p[1]; } return o; }
  function poly(ll) {
    const xy = proj(ll); let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < xy.length; i += 2) { x0 = Math.min(x0, xy[i]); x1 = Math.max(x1, xy[i]); y0 = Math.min(y0, xy[i + 1]); y1 = Math.max(y1, xy[i + 1]); }
    return { xy, bbox: [x0, y0, x1, y1] };
  }
  const r = new Rnd(5), clouds = [];
  for (let n = 0; n < 70; n++) {
    const lon = lon0 + (r.next() * 2 - 1) * 95, lat = (r.next() * 2 - 1) * 75;
    const far = Math.hypot(lon - lon0, (lat - place.lat) * 1.3) > 14;
    if (far && front(lon, lat)) {
      const p = project(lon, lat), cnt = 1 + r.int(3);
      for (let m = 0; m < cnt; m++) clouds.push(p[0] + (r.next() - 0.5) * 9e5, p[1] + (r.next() - 0.5) * 5e5, 1.4e5 + r.next() * 2.6e5);
    }
  }
  return {
    place, project,
    world: GEO_WORLD.map(poly), korea: GEO_KOREA_PARTS.map(poly), water: [poly(GEO_HUDSON_BAY)],
    ridge: place.id === "seoul" ? proj(GEO_RIDGE) : null,
    ulleung: project(130.87, 37.5), dokdo: project(131.87, 37.24), clouds,
  };
}

// ── 9. 지구 ────────────────────────────────────────────────────────
function drawEarth(c, b) {
  const r = Geo.R, rp = c.px(r);
  if (rp < 0.4 || b <= 0.003) return;
  const x = c.sx(0), y = c.sy(0);
  if (rp < 4000) c.radial(x, y, rp * 1.12, [[0.86, C(0x00000000)], [0.91, C(0xAA6CB8FF)], [1, C(0x00000000)]], b);
  c.circle(0, 0, r, OCEAN, b, 1.5);
  if (rp < 2.5) return;
  const map = Geo.map;
  for (const p of map.world) c.polyFill(p.xy, p.bbox, LAND, b);
  for (const p of map.korea) c.polyFill(p.xy, p.bbox, LAND, b);
  for (const p of map.water) c.polyFill(p.xy, p.bbox, OCEAN, b);
  const ca = b * 0.42 * ramp(c.logW, 6.3, 6.9);
  if (ca > 0.01 && rp > 8) for (let i = 0; i < map.clouds.length; i += 3) c.circle(map.clouds[i], map.clouds[i + 1], map.clouds[i + 2], WHITE, ca);
  if (rp < 6000) c.radial(x, y, rp, [[0, C(0x00000000)], [0.62, C(0x00000000)], [1, C(0xB0000010)]], b, x - rp * 0.45, y - rp * 0.4, rp * 1.75);
  c.label(SESSION.place.country.s, 0, 0, b * c.band(6.4, 7.6), WHITE, 13, c.dp(-18), true);
}

// ── 10. 지역 ───────────────────────────────────────────────────────
function drawRegion(c, b, a) {
  c.fill(OCEAN, a);
  const map = Geo.map;
  for (const p of map.world) c.polyFill(p.xy, p.bbox, LAND, a);
  for (const p of map.korea) c.polyFill(p.xy, p.bbox, LAND, a);
  for (const p of map.water) c.polyFill(p.xy, p.bbox, OCEAN, a);
  const vis = Math.max(a, b);
  if (map.ridge) c.polyline(map.ridge, C(0xFF3F7A35), vis * 0.8, Math.max(c.dp(2), c.px(12000)));
  if (SESSION.place.id === "seoul") {
    c.circle(map.ulleung[0], map.ulleung[1], 5000, LAND, vis, c.dp(2.5));
    c.circle(map.dokdo[0], map.dokdo[1], 600, LAND, vis, c.dp(2));
  }
  const lb = vis * c.band(5.4, 6.8);
  for (const l of SESSION.place.labels) {
    const p = map.project(l.lon, l.lat);
    c.label(l.name.s, p[0], p[1], lb, l.color, l.size, c.dp(l.dy), l.bold);
  }
}

// ── 11. 도시 ───────────────────────────────────────────────────────
function riverSouth(x) { return -60 + 500 * Math.sin(x / 7000); }
function riverPoly(c, widthM) {
  const x0 = -c.hwX * 1.1 - 500, x1 = c.hwX * 1.1 + 500, n = 60, out = new Array((n + 1) * 4);
  for (let i = 0; i <= n; i++) {
    const x = x0 + (x1 - x0) * i / n;
    out[2 * i] = x; out[2 * i + 1] = riverSouth(x);
    const j = 2 * n - i;
    out[2 * (j + 1)] = x; out[2 * (j + 1) + 1] = riverSouth(x) - widthM;
  }
  return out;
}
function alongRiver(c, offset, xs = -c.hwX * 1.1 - 50, xe = c.hwX * 1.1 + 50, n = 50) {
  const out = new Array((n + 1) * 2);
  for (let i = 0; i <= n; i++) { const x = xs + (xe - xs) * i / n; out[2 * i] = x; out[2 * i + 1] = riverSouth(x) + offset; }
  return out;
}

function drawCity(c, b, a) {
  if (a <= 0.003) return;
  c.fill(CITY_BASE, a);
  let cell = 220;
  while (cell * c.k < c.dp(10)) cell *= 2;
  const gap = cell * 0.13;
  const grey0 = C(0xFF9EA3AA), grey1 = C(0xFFE6E2DA), tan0 = C(0xFFD9B99A), tan1 = C(0xFFE8D0B0), g0 = C(0xFF5E9A4A), g1 = C(0xFF7DB860);
  c.grid(cell, 4000, (i, j, x, y) => {
    const mx = x + cell / 2, my = y + cell / 2, d = Math.hypot(mx, my);
    const h1 = hash(i, j, cell | 0), h2 = hash(j, i, (cell | 0) + 7);
    const urban = clamp(1 - d / 24000, 0.08, 0.92);
    const col = h1 < urban * 0.75 ? lerpC(grey0, grey1, h2) : h1 < urban ? lerpC(tan0, tan1, h2) : lerpC(g0, g1, h2);
    c.rect(x + gap, y + gap, x + cell - gap, y + cell - gap, col, a);
  });
  let big = 1760;
  while (big * c.k < c.dp(30)) big *= 2;
  const road = C(0xFFEDE6C8);
  c.grid(big, 3000, (_, __, x, y) => {
    c.rect(x - 25, y, x + 25, y + big, road, a * 0.8);
    c.rect(x, y - 25, x + big, y + 25, road, a * 0.8);
  });
  const mt = C(0xFF4F8F42);
  c.circle(4500, -3900, 950, mt, a); c.circle(1500, 8800, 2300, mt, a); c.circle(-9000, -7500, 2600, mt, a);
  const top = alongRiver(c, 0, -3000, 2800, 30), bot = alongRiver(c, 160, -3000, 2800, 30);
  const park = top.slice();
  for (let i = bot.length / 2 - 1; i >= 0; i--) park.push(bot[2 * i], bot[2 * i + 1]);
  c.polyFill(park, null, GRASS, a);
  c.polyFill(riverPoly(c, 1000), null, WATER, a);
  for (const bx of [-7800, -3300, 1500, 4200, 8600]) {
    const s = riverSouth(bx);
    c.rect(bx - 22, s - 1040, bx + 22, s + 40, C(0xFFB5B0A8), a);
  }
  const P = SESSION.place;
  c.label(P.river.s, -4500, riverSouth(-4500) - 500, a * c.band(3.4, 4.9), WHITE, 14, 0, true);
  c.label(P.district.s, 0, 900, a * c.band(3.3, 4.4), C(0xFF333333), 12, 0, true);
  if (P.mountain) c.label(P.mountain.s, 4500, -3900, a * c.band(3.6, 4.7), WHITE, 12);
  const m = a * c.band(3.0, 4.4);
  c.glow(0, 0, c.dp(10), C(0xFFFF4040), m);
  c.label(S.picnicSpot.s, 0, 0, m, WHITE, 12, c.dp(16), true);
}

// ── 12. 강변 공원 ──────────────────────────────────────────────────
function drawPark(c, b, a) {
  if (a <= 0.003) return;
  c.fill(GRASS, a);
  c.rect(-c.hwX - 10, 160, c.hwX + 10, 185, C(0xFF8C8C8C), a);
  c.rect(-c.hwX - 10, 185, c.hwX + 10, c.hwY + 10, CITY_BASE, a);
  const blue = C(0xFF6EC6FF), pink = C(0xFFFF8FB0);
  c.grid(28, 5000, (i, j, x, y) => {
    if (hash(i, j, 21) < 0.06) {
      const px0 = x + 20 * hash(i, j, 22), py0 = y + 20 * hash(i, j, 23);
      if (py0 > riverSouth(px0) + 32 && py0 < 150 && Math.hypot(px0, py0) > 8) c.rect(px0, py0, px0 + 2, py0 + 1.6, lerpC(blue, pink, hash(i, j, 24)), a);
    }
  });
  const sh = C(0x55203010), t0 = C(0xFF3F7F34), t1 = C(0xFF5FA14A);
  c.grid(14, 7000, (i, j, x, y) => {
    if (hash(i, j, 7) < 0.33) {
      const tx = x + 14 * hash(i, j, 8), ty = y + 14 * hash(i, j, 9);
      if (ty > riverSouth(tx) + 34 && ty < 152 && Math.hypot(tx, ty) > 13) {
        const r = 2.5 + 3 * hash(i, j, 10);
        c.circle(tx + 0.6, ty + 0.8, r, sh, a); c.circle(tx, ty, r, t0, a); c.circle(tx - r * 0.25, ty - r * 0.25, r * 0.55, t1, a);
      }
    }
  });
  c.polyFill(riverPoly(c, 1000), null, WATER, a);
  const wave = C(0xFF9CC8F0);
  c.grid(40, 3000, (i, j, x, y) => {
    if (hash(i, j, 31) < 0.25) {
      const wx = x + 40 * hash(i, j, 32), wy = y + 40 * hash(i, j, 33);
      if (wy < riverSouth(wx) - 6) c.line(wx, wy, wx + 6, wy, wave, a * 0.6, Math.max(1, c.px(0.4)));
    }
  });
  c.polyline(alongRiver(c, 2.5), C(0xFFBDB7A8), a, Math.max(1, c.px(5)));
  c.polyline(alongRiver(c, 14), C(0xFF7E8794), a, Math.max(1, c.px(4.5)));
  c.polyline(alongRiver(c, 24), C(0xFFE6D6B0), a, Math.max(1, c.px(3)));
  const bikeA = a * ramp(-c.logW, -2.9, -2.3);
  if (bikeA > 0.01) {
    const red = C(0xFFFF5050), bl = C(0xFF50A0FF);
    for (let n = 0; n < 40; n++) {
      const sp = (3.5 + 3.5 * hash(n, 0, 41)) * (n % 2 === 0 ? 1 : -1);
      const x = ((hash(n, 1, 42) * 1600 + c.t * sp) % 1600 + 1600) % 1600 - 800;
      const y = riverSouth(x) + 14 + (sp > 0 ? -0.9 : 0.9);
      c.circle(x, y, 0.8, lerpC(red, bl, hash(n, 2, 43)), bikeA, c.dp(1.6));
    }
  }
  c.label(SESSION.place.river.s, 0, riverSouth(0) - 180, a * c.band(2.0, 3.3), WHITE, 14, 0, true);
  c.label(S.bikePath.s, 120, riverSouth(120) + 14, a * c.band(1.4, 2.4), WHITE, 11, c.dp(-12));
  c.label(S.ourBlanket.s, 0, 0, a * c.band(1.2, 2.6), WHITE, 12, c.dp(-22), true);
}

// ── 13. 어린이(나) ────────────────────────────────────────────────
function blanketChecker(c, x0, y0, x1, y1, alpha) {
  c.rect(x0, y0, x1, y1, C(0xFFF7F3EA), alpha);
  const s = 0.1, red = C(0xFFE05A5A);
  c.grid(s, 4000, (i, j, x, y) => {
    if (((i + j) & 1) === 0) {
      const l = Math.max(x, x0), tp = Math.max(y, y0), r = Math.min(x + s, x1), bt = Math.min(y + s, y1);
      if (r > l && bt > tp) c.rect(l, tp, r, bt, red, alpha * 0.85);
    }
  });
}

function drawKid(c, b, a) {
  if (a > 0.003) {
    c.fill(GRASS, a);
    const bw = Math.max(1, c.px(0.004)), d0 = C(0xFF4E9A3A), d1 = C(0xFF8CCB62);
    c.grid(0.06, 5000, (i, j, x, y) => {
      for (let n = 0; n <= 1; n++) {
        const bx = x + 0.06 * hash(i, j, 50 + n), by = y + 0.06 * hash(i, j, 52 + n);
        const an = -Math.PI / 2 + (hash(i, j, 54 + n) - 0.5) * 1.2, len = 0.02 + 0.025 * hash(i, j, 56 + n);
        c.line(bx, by, bx + Math.cos(an) * len, by + Math.sin(an) * len, n === 0 ? d0 : d1, a * 0.8, bw);
      }
    });
  }
  if (b <= 0.003) return;
  blanketChecker(c, -0.9, -0.7, 0.5, 0.7, b);
  const shirt = C(0xFFFFC93C), skinW = Math.max(1, c.px(0.06)), shoe = C(0xFFE04848), hair = C(0xFF4A2E1E);
  const limb = (x0, y0, x1, y1, col, w) => c.line(x0, y0, x1, y1, col, b, w);
  limb(-0.37, 0.2, -0.38, 0.58, SKIN, c.px(0.075));
  limb(-0.23, 0.2, -0.2, 0.58, SKIN, c.px(0.075));
  c.rrect(-0.44, 0.56, -0.32, 0.65, 0.03, shoe, b);
  c.rrect(-0.26, 0.56, -0.14, 0.65, 0.03, shoe, b);
  c.rrect(-0.46, 0.04, -0.14, 0.26, 0.04, C(0xFF3F6FD8), b);
  limb(-0.44, -0.28, -0.58, -0.02, SKIN, skinW);
  limb(-0.58, -0.02, -0.56, 0.12, SKIN, skinW);
  c.circle(-0.56, 0.14, 0.045, SKIN, b);
  limb(-0.44, -0.28, -0.5, -0.17, shirt, c.px(0.07));
  limb(-0.16, -0.28, -0.04, -0.2, SKIN, skinW);
  limb(-0.04, -0.2, 0, -0.08, SKIN, skinW);
  limb(-0.16, -0.28, -0.1, -0.24, shirt, c.px(0.07));
  c.rrect(-0.48, -0.34, -0.12, 0.08, 0.07, shirt, b);
  c.circle(-0.30, -0.47, 0.12, hair, b);
  c.circle(-0.30, -0.445, 0.105, SKIN, b);
  c.circle(-0.30, -0.53, 0.07, hair, b);
  c.circle(-0.338, -0.45, 0.012, C(0xFF2A1A10), b);
  c.circle(-0.262, -0.45, 0.012, C(0xFF2A1A10), b);
  c.circle(-0.355, -0.41, 0.016, C(0xFFFF9C9C), b * 0.6);
  c.circle(-0.245, -0.41, 0.016, C(0xFFFF9C9C), b * 0.6);
  if (c.px(0.1) > 6) {
    const g = c.g, rr = c.px(0.035);
    c.alpha(b); g.strokeStyle = C(0xFF8A3A2A).s; g.lineWidth = Math.max(1, c.px(0.008)); g.lineCap = "round";
    g.beginPath(); g.arc(c.sx(-0.30), c.sy(-0.42), rr, 20 * Math.PI / 180, 160 * Math.PI / 180); g.stroke();
  }
}

// ── 14. 손 ─────────────────────────────────────────────────────────
function drawHand(c, b, a) {
  if (a > 0.003) blanketChecker(c, -c.hwX - 0.1, -c.hwY - 0.1, c.hwX + 0.1, c.hwY + 0.1, a);
  if (b <= 0.003) return;
  c.line(-0.04, -0.2, 0, -0.07, SKIN, b, c.px(0.06));
  c.line(-0.035, -0.03, -0.066, 0.025, SKIN, b, c.px(0.022));
  c.rrect(-0.044, -0.08, 0.044, 0.026, 0.026, SKIN, b);
  const xs = [-0.03, -0.01, 0.01, 0.03], lens = [0.05, 0.066, 0.072, 0.064];
  for (let n = 0; n < 4; n++) {
    const x = xs[n], y0 = 0.012, y1 = y0 + lens[n];
    c.rrect(x - 0.0095, y0, x + 0.0095, y1, 0.0095, SKIN, b);
    c.rrect(x - 0.0062, y1 - 0.014, x + 0.0062, y1 - 0.002, 0.004, C(0xFFF8DCCB), b);
    const cw = Math.max(1, c.px(0.0012));
    for (const f of [0.35, 0.68]) { const yy = y0 + (y1 - y0) * f; c.line(x - 0.005, yy, x + 0.005, yy, SKIN_DARK, b * 0.7, cw); }
    c.circle(x, 0.006, 0.0035, SKIN_DARK, b * 0.35);
  }
  for (let n = 0; n < 4; n++) c.line(xs[n] * 0.6, -0.055, xs[n], -0.002, SKIN_DARK, b * 0.25, Math.max(1, c.px(0.002)));
  c.label(S.backOfHand.s, 0, 0, b * c.band(-1.35, -0.55), C(0xFF5A3A2A), 12, c.dp(-18), true);
}

// ── 15. 피부 ───────────────────────────────────────────────────────
function lineFamily(c, angleDeg, spacing, seed, color, alpha, widthPx) {
  if (alpha <= 0.01 || spacing * c.k < 3) return;
  const th = angleDeg * Math.PI / 180, dx = Math.cos(th), dy = Math.sin(th), nx = -dy, ny = dx;
  const ext = Math.hypot(c.hwX, c.hwY) * 1.05;
  const m0 = Math.floor(-ext / spacing) - 1, m1 = Math.floor(ext / spacing) + 1;
  if (m1 - m0 > 500) return;
  const g = c.g;
  g.beginPath();
  for (let m = m0; m <= m1; m++) {
    const off = (m + (hash(m, seed, 1) - 0.5) * 0.35) * spacing, px0 = nx * off, py0 = ny * off;
    for (let s = 0; s < 6; s++) {
      if (hash(m, s, seed) < 0.18) continue;
      const u0 = -ext + 2 * ext * s / 6, u1 = -ext + 2 * ext * (s + 1) / 6;
      g.moveTo(c.sx(px0 + dx * u0), c.sy(py0 + dy * u0)); g.lineTo(c.sx(px0 + dx * u1), c.sy(py0 + dy * u1));
    }
  }
  c.alpha(alpha); g.strokeStyle = color.s; g.lineWidth = widthPx; g.lineCap = "round"; g.stroke();
}

function drawSkin(c, b, a) {
  if (a <= 0.003) return;
  c.fill(SKIN, a);
  const crease = C(0xFFC98D66);
  lineFamily(c, 25, 0.35e-3, 3, crease, a * 0.55, Math.max(1, c.px(1.8e-5)));
  lineFamily(c, -35, 0.42e-3, 4, crease, a * 0.5, Math.max(1, c.px(1.8e-5)));
  lineFamily(c, 70, 0.9e-3, 5, crease, a * 0.35, Math.max(1, c.px(1.4e-5)));
  lineFamily(c, 10, 0.08e-3, 6, C(0xFFE2A985), a * 0.25 * (1 - ramp(c.logW, -3.8, -3.3)), Math.max(1, c.px(6e-6)));
  const pore = C(0xFFB67A55);
  c.grid(0.6e-3, 4000, (i, j, x, y) => {
    if (hash(i, j, 61) < 0.45) {
      const qx = x + 0.6e-3 * hash(i, j, 62), qy = y + 0.6e-3 * hash(i, j, 63);
      if (Math.hypot(qx, qy) > 0.12e-3) c.circle(qx, qy, 0.035e-3, pore, a * 0.55);
    }
  });
  const hairW = Math.max(1, c.px(7e-5)), g = c.g;
  for (const hp of [[-4e-3, -1.4e-3, -1e-3, -0.2e-3, 1.5e-3, -0.6e-3, 4e-3, 0.4e-3], [-3e-3, 2.5e-3, -1e-3, 1.3e-3, 1e-3, 1.9e-3, 3.5e-3, 1.2e-3]]) {
    g.beginPath(); g.moveTo(c.sx(hp[0]), c.sy(hp[1]));
    g.bezierCurveTo(c.sx(hp[2]), c.sy(hp[3]), c.sx(hp[4]), c.sy(hp[5]), c.sx(hp[6]), c.sy(hp[7]));
    c.alpha(a); g.lineCap = "round";
    g.strokeStyle = C(0xFF5A3A22).s; g.lineWidth = hairW; g.stroke();
    g.strokeStyle = C(0x66FFFFFF).s; g.lineWidth = hairW * 0.25; g.stroke();
  }
  c.label(S.hair.s, 1.5e-3, -0.6e-3, a * c.band(-3.3, -2.2), C(0xFF5A3A22), 12, c.dp(-16), true);
  c.label(S.poresWrinkles.s, 0, 0, a * c.band(-3.2, -2.2), C(0xFF7A4A30), 12, c.dp(30));
}

// ── 16. 세포 ───────────────────────────────────────────────────────
function drawCells(c, b, a) {
  if (a <= 0.003) return;
  c.fill(C(0xFFE79E98), a);
  const sp = 3e-5, rowH = sp * 0.866;
  const nx = 2 * c.hwX / sp + 3, ny = 2 * c.hwY / rowH + 3;
  if (nx * ny > 3000) return;
  const j0 = Math.floor(-c.hwY / rowH) - 1, j1 = Math.floor(c.hwY / rowH) + 1;
  const i0 = Math.floor(-c.hwX / sp) - 2, i1 = Math.floor(c.hwX / sp) + 2;
  const cellCol = C(0xFFFAD6CE), memb = C(0xFFC7726E), mito = C(0xFFF08A6A), nucDark = C(0xFF5A2E80);
  const detail = c.px(sp) > 160, g = c.g;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const center = i === 0 && j === 0;
    const jx = center ? 0 : (hash(i, j, 71) - 0.5) * sp * 0.18, jy = center ? 0 : (hash(i, j, 72) - 0.5) * sp * 0.18;
    const x = i * sp + ((j & 1) === 1 ? sp / 2 : 0) + jx, y = j * rowH + jy, r = sp * 0.49;
    if (!c.visible(x, y, c.px(r))) continue;
    c.circle(x, y, r, memb, a);
    c.circle(x, y, r * 0.955, cellCol, a);
    if (detail) {
      for (let m = 0; m <= 4; m++) {
        const an = hash(i * 7 + m, j, 73) * 2 * Math.PI, rr = r * (0.45 + 0.35 * hash(i, j * 5 + m, 74));
        const mx = c.sx(x + Math.cos(an) * rr), my = c.sy(y + Math.sin(an) * rr);
        const lw = c.px(2.2e-6), lh = c.px(0.9e-6);
        c.alpha(a * 0.8); g.fillStyle = mito.s;
        g.beginPath(); g.ellipse(mx, my, lw / 2, lh / 2, 0, 0, 2 * Math.PI); g.fill();
      }
    }
    const nrp = c.px(3.2e-6);
    if (nrp > 1) {
      c.radial(c.sx(x), c.sy(y), nrp, [[0, C(0xFFB07FD8)], [0.8, C(0xFF8A57B8)], [1, C(0xFF6E3E9C)]], a);
      c.circle(x + 1.1e-6, y - 0.9e-6, 0.8e-6, nucDark, a * 0.8);
    }
  }
  c.label(S.nucleusDna.s, 0, 0, a * c.band(-5.3, -4.2), WHITE, 12, c.dp(-4) - c.px(3.2e-6) - c.dp(14), true);
  c.label(S.membrane.s, sp * 0.49, 0, a * c.band(-5.0, -4.2), C(0xFF7A2E2E), 11, c.dp(-10));
}

// ── 17. DNA ────────────────────────────────────────────────────────
const Chromatin = (() => {
  const r = new Rnd(99);
  const walk = (x0, y0, step, n) => {
    const out = []; let x = x0, y = y0, an = r.next() * 2 * Math.PI;
    for (let i = 0; i < n; i++) { out.push(x, y); an += r.gauss() * 0.7; x += Math.cos(an) * step; y += Math.sin(an) * step; }
    return out;
  };
  const coarse = []; for (let i = 0; i < 40; i++) coarse.push(walk((r.next() - 0.5) * 7e-6, (r.next() - 0.5) * 7e-6, 1.6e-7, 26));
  const fine = []; for (let i = 0; i < 30; i++) fine.push(walk((r.next() - 0.5) * 1e-6, (r.next() - 0.5) * 1e-6, 2.2e-8, 30));
  const v = []; for (let i = 0; i < 30; i++) v.push(1.2e-8 * Math.sin(i * 0.5), (i - 15) * 2.2e-8);
  fine.push(v);
  return { coarse, fine };
})();
const HELIX_A = 1.0e-9, HELIX_P = 3.4e-9, BP = 3.4e-10;

function drawDna(c, b, a) {
  if (a > 0.003) {
    c.fill(C(0xFF4E2C72), a);
    const c1 = a * c.band(-6.6, -5.0);
    if (c1 > 0.01) for (const s of Chromatin.coarse) c.polyline(s, C(0xFF9C6CD0), c1 * 0.8, Math.max(1, c.px(1.3e-7)));
    const c2 = a * c.band(-7.8, -6.4);
    if (c2 > 0.01) for (const s of Chromatin.fine) c.polyline(s, C(0xFFB98AE6), c2 * 0.7, Math.max(1, c.px(2.6e-8)));
  }
  if (b <= 0.003) return;
  const y0 = -c.hwY - 4e-10, y1 = c.hwY + 4e-10, n = (y1 - y0) / BP;
  const strandA = C(0xFF9FB4D8), strandB = C(0xFFFFB070);
  if (n > 500) {
    const m = 160, p1 = [], p2 = [];
    for (let i = 0; i <= m; i++) {
      const y = y0 + (y1 - y0) * i / m, ph = 2 * Math.PI * y / HELIX_P;
      p1.push(HELIX_A * Math.sin(ph), y); p2.push(HELIX_A * Math.sin(ph + 2.4), y);
    }
    c.polyline(p1, strandA, b, Math.max(1.2, c.px(3e-10)));
    c.polyline(p2, strandB, b, Math.max(1.2, c.px(3e-10)));
    return;
  }
  const k0 = Math.floor(y0 / BP), k1 = Math.floor(y1 / BP) + 1, rungW = Math.max(1, c.px(1.3e-10));
  const cGC1 = C(0xFF5A8CFF), cAT1 = C(0xFF66D17A), cGC2 = C(0xFFFFD34D), cAT2 = C(0xFFE85D5D);
  for (let pass = 0; pass <= 2; pass++) {
    for (let kk = k0; kk <= k1; kk++) {
      const y = kk * BP, ph = 2 * Math.PI * y / HELIX_P;
      const xA = HELIX_A * Math.sin(ph), zA = Math.cos(ph), xB = HELIX_A * Math.sin(ph + 2.4), zB = Math.cos(ph + 2.4);
      if (pass === 1) {
        const gc = hash(kk, 0, 81) < 0.5, flip = hash(kk, 1, 82) < 0.5;
        let c1 = gc ? cGC1 : cAT1, c2 = gc ? cGC2 : cAT2;
        if (flip) [c1, c2] = [c2, c1];
        const mid = (xA + xB) / 2;
        c.line(xA, y, mid, y, c1, b * 0.9, rungW);
        c.line(mid, y, xB, y, c2, b * 0.9, rungW);
      } else {
        const front = pass === 2;
        if ((zA >= 0) === front) c.sphere(xA, y, 1.7e-10 * (0.88 + 0.12 * zA), lerpC(strandA, BLACK, (1 - zA) * 0.2), b);
        if ((zB >= 0) === front) c.sphere(xB, y, 1.7e-10 * (0.88 + 0.12 * zB), lerpC(strandB, BLACK, (1 - zB) * 0.2), b);
      }
    }
  }
  c.label(S.dnaHelix.s, HELIX_A * 3.2, -HELIX_P * 0.6, b * c.band(-8.5, -7.3), WHITE, 13, 0, true);
  c.label(S.basePairs.s, -HELIX_A * 3.0, HELIX_P * 0.5, b * c.band(-8.6, -7.6), C(0xFFE0D0FF), 11);
  c.label(S.carbonAtom.s, 0, 0, b * c.band(-9.3, -8.6), WHITE, 12, -Math.max(c.dp(18), c.px(1.7e-10) + c.dp(14)), true);
}

// ── 18. 원자 ───────────────────────────────────────────────────────
function drawAtom(c, b, a) {
  c.fill(C(0xFF0A0F2A), a);
  const s = 3.4e-10, x0 = c.sx(0), y0 = c.sy(0), cloudR = c.px(s * 0.55);
  if (b > 0.003 && cloudR > 1 && cloudR < 1e6) {
    c.radial(x0, y0, cloudR, [[0, C(0x6680A8FF)], [0.25, C(0x445C7CFF)], [0.6, C(0x223A5AD0)], [1, C(0x00000000)]], b);
  }
  const orbitA = b * ramp(c.logW, -11.2, -10.4);
  if (orbitA > 0.01) {
    const rx = c.px(s * 0.42), ry = c.px(s * 0.15), g = c.g, eCol = C(0xFF7FD8FF), oCol = C(0xFF9FC0FF);
    [0, 60, 120].forEach((deg, n) => {
      if (rx < 1e5) {
        c.alpha(orbitA * 0.35); g.strokeStyle = oCol.s; g.lineWidth = c.dp(1.2);
        g.beginPath(); g.ellipse(x0, y0, rx, ry, deg * Math.PI / 180, 0, 2 * Math.PI); g.stroke();
      }
      const count = n === 0 ? 2 : 1;
      for (let e = 0; e < count; e++) {
        const th = c.t * (1.3 + n * 0.25) + e * Math.PI + n * 2.1;
        const lx = s * 0.42 * Math.cos(th), ly = s * 0.15 * Math.sin(th), rad = deg * Math.PI / 180;
        const ex = lx * Math.cos(rad) - ly * Math.sin(rad), ey = lx * Math.sin(rad) + ly * Math.cos(rad);
        c.glow(ex, ey, c.dp(9), eCol, orbitA);
        c.circle(ex, ey, 0, WHITE, orbitA, c.dp(2.6));
      }
    });
    c.ring(0, 0, s * 0.11, oCol, orbitA * 0.35, c.dp(1.2));
    for (let e = 0; e <= 1; e++) {
      const th = -c.t * 2.2 + e * Math.PI, ex = s * 0.11 * Math.cos(th), ey = s * 0.11 * Math.sin(th);
      c.glow(ex, ey, c.dp(9), eCol, orbitA);
      c.circle(ex, ey, 0, WHITE, orbitA, c.dp(2.6));
    }
  }
  const nb = Math.max(b, a) * ramp(c.logW, -14.6, -14.0);
  c.glow(0, 0, Math.max(c.dp(5), c.px(4e-15)), C(0xFFFF6A5A), nb);
  c.circle(0, 0, 2.7e-15, C(0xFFFFB0A0), nb, c.dp(1.6));
  c.label(S.electronCloud.s, 0, -s * 0.3, b * c.band(-10.0, -9.2), C(0xFFBFD8FF), 12);
  c.label(S.nucleusTiny.s, 0, 0, Math.max(b, a) * c.band(-12.4, -9.9), C(0xFFFFC0B0), 12, c.dp(20), true);
}

// ── 19. 원자핵 ─────────────────────────────────────────────────────
const NUCLEONS = (() => {
  const u = 1e-15, list = [{ x: 0, y: 0, z: 1, proton: false }];
  const mid = [true, false, true, true, false, true];
  for (let i = 0; i < 6; i++) { const an = (30 + 60 * i) * Math.PI / 180; list.push({ x: 1.45 * u * Math.cos(an), y: 1.45 * u * Math.sin(an), z: 0, proton: mid[i] }); }
  const back = [false, false, true, false, true];
  for (let i = 0; i < 5; i++) { const an = 72 * i * Math.PI / 180; list.push({ x: 0.95 * u * Math.cos(an), y: 0.95 * u * Math.sin(an), z: -1, proton: back[i] }); }
  return list.sort((p, q) => p.z - q.z);
})();

function drawNucleus(c, b, a) {
  c.fill(C(0xFF120614), a);
  const far = a * (1 - ramp(-c.logW, 12.6, 13.4));
  if (far > 0.01) {
    c.glow(0, 0, c.dp(10), C(0xFFFF6A5A), far);
    c.label(S.atomEmpty.s, 0, 0, far * c.band(-13.4, -11.2), C(0xFFFFC0B0), 12, c.dp(34));
  }
  if (b <= 0.003) return;
  c.glow(0, 0, c.px(3.6e-15), C(0xFFFFA040), b * 0.4);
  const rn = 0.85e-15, rp = c.px(rn), red = C(0xFFE04848), blue = C(0xFF4A7FE0);
  for (const n of NUCLEONS) {
    c.sphere(n.x, n.y, rn, lerpC(n.proton ? red : blue, BLACK, (1 - n.z) * 0.18), b, 1.5);
    if (n.proton && rp > 16 && n.z >= 0) c.label("+", n.x, n.y, b, WHITE, clamp(rp / c.density * 0.5, 10, 30), 0, true);
  }
  const lb = b * c.band(-14.9, -13.7), p = NUCLEONS.find(q => q.proton && q.z === 0);
  c.label(S.proton.s, p.x, p.y, lb, C(0xFFFFD0D0), 12, -rp - c.dp(10), true);
  c.label(S.neutron.s, 0, 0, lb, C(0xFFD0E0FF), 12, rp + c.dp(12), true);
}

// ── 20. 중성자 ─────────────────────────────────────────────────────
const Q_U = [0.52e-15, -0.30e-15], Q_D2 = [-0.52e-15, -0.30e-15];
function spring(c, x0, y0, x1, y1, ampPx, waves, phase, color, alpha, wPx) {
  if (alpha <= 0.01) return;
  const ax = c.sx(x0), ay = c.sy(y0), bx = c.sx(x1), by = c.sy(y1);
  const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
  if (len < 2 || len > 2e5) return;
  const nx = -dy / len, ny = dx / len, steps = waves * 8, g = c.g;
  g.beginPath();
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const off = Math.sin(f * waves * 2 * Math.PI + phase) * ampPx * Math.max(Math.sin(f * Math.PI), 0.25);
    const x = ax + dx * f + nx * off, y = ay + dy * f + ny * off;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  c.alpha(alpha); g.strokeStyle = color.s; g.lineWidth = wPx; g.lineCap = "round"; g.stroke();
}
function quark(c, x, y, color, alpha) {
  c.glow(x, y, c.dp(22), color, alpha);
  c.circle(x, y, 0, lerpC(color, WHITE, 0.6), alpha, c.dp(6));
}

function drawNeutron(c, b, a) {
  c.fill(C(0xFF0B0718), a);
  if (b <= 0.003) return;
  const r = c.px(0.9e-15);
  if (r > 2 && r < 2e5) c.radial(c.sx(0), c.sy(0), r, [[0, C(0x886F9FFF)], [0.7, C(0x55406FD0)], [0.95, C(0x332040A0)], [1, C(0x00000000)]], b);
  const inner = b * ramp(-c.logW, 14.3, 14.7);
  if (inner <= 0.01) return;
  const t = c.t, wob = s => Math.sin(t * (1.7 + s * 0.3) + s) * 0.04e-15;
  const ux = Q_U[0] + wob(1), uy = Q_U[1] + wob(2), dx2 = Q_D2[0] + wob(3), dy2 = Q_D2[1] + wob(4);
  const gl = C(0xFFFFE066), wPx = c.dp(2.2), ph = t * 7;
  spring(c, 0, 0, ux, uy, c.dp(5), 7, ph, gl, inner * 0.85, wPx);
  spring(c, ux, uy, dx2, dy2, c.dp(5), 9, ph + 1, gl, inner * 0.85, wPx);
  spring(c, dx2, dy2, 0, 0, c.dp(5), 7, ph + 2, gl, inner * 0.85, wPx);
  const bucket = Math.floor(t * 3), life = t * 3 - bucket;
  for (let n = 0; n < 18; n++) {
    const px0 = (hash(n, bucket, 91) - 0.5) * 1.5e-15, py0 = (hash(n, bucket, 92) - 0.5) * 1.5e-15;
    if (Math.hypot(px0, py0) < 0.85e-15) c.circle(px0, py0, 0, WHITE, inner * 0.6 * Math.sin(life * Math.PI), c.dp(1.6));
  }
  quark(c, 0, 0, C(0xFF4A8CFF), inner);
  quark(c, ux, uy, C(0xFFFF4A4A), inner);
  quark(c, dx2, dy2, C(0xFF4ADF6A), inner);
  const lb = inner * c.band(-15.9, -14.4);
  c.label(S.downQuark.s, 0, 0, lb, C(0xFFBFD6FF), 12, c.dp(26), true);
  c.label(S.upQuark.s, ux, uy, lb, C(0xFFFFC8C8), 12, -c.dp(26), true);
  c.label(S.downQuark.s, dx2, dy2, lb, C(0xFFC8FFD0), 12, -c.dp(26), true);
  c.label(S.gluon.s, (ux + dx2) / 2, uy, lb, C(0xFFFFF0A0), 11, c.dp(16));
}

// ── 21. 쿼크 ───────────────────────────────────────────────────────
const Flicker = (() => {
  const r = new Rnd(123), p = [];
  for (let i = 0; i < 70; i++) { const rr = Math.pow(10, -19.6 + r.next() * 3.6), an = r.next() * 2 * Math.PI; p.push(rr * Math.cos(an), rr * Math.sin(an), r.next() * 6.28, 0.6 + r.next() * 1.8); }
  return p;
})();

function drawQuark(c, b, a) {
  c.fill(C(0xFF05030C), a);
  if (b <= 0.003) return;
  const q = b * ramp(-c.logW, 15.6, 16.6);
  if (q <= 0.01) return;
  const t = c.t, gl = C(0xFFFFE066);
  spring(c, 0, 0, Q_U[0] / 0.6e-15 * c.hwX * 3, Q_U[1] / 0.6e-15 * c.hwX * 3, c.dp(6), 14, t * 7, gl, q * 0.7, c.dp(2.4));
  spring(c, 0, 0, Q_D2[0] / 0.6e-15 * c.hwX * 3, Q_D2[1] / 0.6e-15 * c.hwX * 3, c.dp(6), 14, t * 7 + 2, gl, q * 0.7, c.dp(2.4));
  const f = Flicker;
  for (let i = 0; i < f.length; i += 4) {
    const al = Math.sin(t * f[i + 3] + f[i + 2]);
    if (al > 0) { c.glow(f[i], f[i + 1], c.dp(6), C(0xFFC8B0FF), q * al * 0.7); c.circle(f[i], f[i + 1], 0, WHITE, q * al * 0.8, c.dp(1.4)); }
  }
  const pulse = 1 + 0.08 * Math.sin(t * 3);
  c.glow(0, 0, c.dp(60) * pulse, C(0xFF4A8CFF), q);
  c.glow(0, 0, c.dp(22) * pulse, C(0xFFBFD8FF), q);
  c.circle(0, 0, 0, WHITE, q, c.dp(5));
  const rr = c.px(0.5e-18), ringA = q * ramp(rr, c.dp(40), c.dp(70));
  c.ring(0, 0, 0.5e-18, C(0xFFFFD34D), ringA, c.dp(1.6), true);
  c.label(S.measureLimit.s, 0, -0.5e-18, ringA, C(0xFFFFE6A0), 12, -c.dp(14), true);
  c.label(S.quarkUnknown.s, 0, 0, q * c.band(-18.7, -17.2), WHITE, 12, c.dp(84));
}

// ── 22. 끈(가설) ───────────────────────────────────────────────────
const PLANCK = 1.6e-35;
const StringData = (() => {
  const r = new Rnd(161), foam = [];
  for (let i = 0; i < 220; i++) foam.push((r.next() - 0.5) * 3 * PLANCK, (r.next() - 0.5) * 3 * PLANCK, 0.01 + r.next() * 0.03, r.next() * 6.28);
  return {
    foam,
    loops: [[0, 0, 0.16, 3, 0, 2.2], [-0.30, -0.22, 0.07, 2, 1, 3.1], [0.31, -0.18, 0.09, 5, 2, 2.6], [-0.26, 0.28, 0.08, 4, 3, 2.9], [0.27, 0.30, 0.06, 6, 1, 3.4]],
    palette: [C(0xFFFFD34D), C(0xFF7FD8FF), C(0xFFFF8FC8), C(0xFF9BFF9B)],
  };
})();
/** 쿼크와 끈 사이의 빈 구간에서는 확대·자동 여행을 빠르게 한다 */
function desertBoost(logW) { return 1 + 3 * ramp(-logW, 19.3, 20.3) * (1 - ramp(-logW, 32.0, 33.0)); }

function drawStrings(c, b, a) {
  c.fill(C(0xFF06020F), a);
  const desert = a * ramp(-c.logW, 19.6, 20.4) * (1 - ramp(-c.logW, 31.6, 32.4));
  if (desert > 0.01) {
    const n = Math.max(1, Math.floor(-18.5 - c.logW));
    c.label(S.desert.s, 0, 0, desert, C(0xFFD8CCFF), 14, -c.dp(16), true);
    c.label(fmt(S.desertSub.s, n), 0, 0, desert, C(0xFFB0A4E0), 12, c.dp(12));
    for (let i = 0; i < 40; i++) {
      const ph = (c.t * 0.3 + hash(i, 0, 171)) % 1;
      const x = (hash(i, 1, 172) - 0.5) * 2 * c.hwX * (0.3 + ph), y = (hash(i, 2, 173) - 0.5) * 2 * c.hwY * (0.3 + ph);
      c.circle(x, y, 0, C(0xFF8F80D0), desert * 0.5 * Math.sin(ph * Math.PI), c.dp(1.5));
    }
  }
  if (b <= 0.003) return;
  const S0 = PLANCK, f = StringData.foam, foamC = C(0xFF5A46A8);
  for (let i = 0; i < f.length; i += 4) {
    const al = 0.5 + 0.5 * Math.sin(c.t * 1.7 + f[i + 3]);
    c.glow(f[i], f[i + 1], Math.max(c.dp(3), c.px(f[i + 2] * S0)), foamC, b * al * 0.5);
  }
  StringData.loops.forEach((L0, k) => {
    const cx0 = L0[0] * S0, cy0 = L0[1] * S0, r0 = L0[2] * S0, modes = L0[3], col = StringData.palette[L0[4]], sp = L0[5];
    const pts = [];
    for (let j = 0; j <= 72; j++) {
      const th = 2 * Math.PI * j / 72;
      const rr = r0 * (1 + 0.22 * Math.sin(modes * th + c.t * sp + k) * Math.cos(c.t * sp * 0.7));
      pts.push(cx0 + rr * Math.cos(th), cy0 + rr * Math.sin(th));
    }
    c.polyline(pts, withA(col, 0.35), b, Math.max(c.dp(7), c.px(r0 * 0.12)));
    c.polyline(pts, col, b, Math.max(c.dp(2.2), c.px(r0 * 0.035)));
  });
  const lb = b * c.band(-35.6, -34.2);
  c.label(S.hypothesis.s, 0, -0.44 * S0, lb, C(0xFFFFC870), 13, -c.dp(10), true);
  c.label(S.planckLength.s, 0, -0.44 * S0, lb, C(0xFFD8CCFF), 12, c.dp(12));
  c.label(S.oneString.s, 0, 0, lb, WHITE, 12, Math.max(c.dp(30), c.px(0.16 * S0 * 1.25) + c.dp(14)), true);
}

// ── 우주 한 장면 그리기 ────────────────────────────────────────────
function levelAlphas(logW) {
  const n = LEVELS.length;
  const out = LEVELS.map(l => ramp(logW - l.logS, -1.4, -0.8));
  const body = LEVELS.map((l, i) => ramp(l.logS - logW, -2.6, -2.0) * out[i]);
  const amb = LEVELS.map((_, i) => (i === 0 ? 1 : 1 - out[i - 1]) * out[i]);
  const ambRaw = LEVELS.map((_, i) => (i === 0 ? 1 : 1 - out[i - 1]));
  void n;
  return [body, amb, ambRaw];
}

const SCREEN_STARS = (() => {
  const r = new Rnd(7), a = [];
  for (let i = 0; i < 260; i++) a.push(r.next(), r.next(), 0.5 + Math.pow(r.next(), 3) * 1.6, r.next() * 6.28);
  return a;
})();

/** ref = 화면에서 '가로 10^logW 미터'에 해당하는 픽셀 길이 */
function drawUniverse(g, w, h, ref, logW, t, density) {
  const k = ref / Math.pow(10, logW);
  const [body, amb, ambRaw] = levelAlphas(logW);
  let bg = LEVELS[0].bg, space = 1;
  for (let i = 1; i < LEVELS.length; i++) {
    bg = lerpC(bg, LEVELS[i].bg, ambRaw[i]);
    space += ((LEVELS[i].space ? 1 : 0) - space) * ambRaw[i];
  }
  g.globalAlpha = 1; g.fillStyle = withA(bg, 1).s; g.fillRect(0, 0, w, h);
  if (space > 0.01) {
    g.fillStyle = "#fff";
    for (let i = 0; i < SCREEN_STARS.length; i += 4) {
      const tw = 0.65 + 0.35 * Math.sin(t * 1.5 + SCREEN_STARS[i + 3]);
      g.globalAlpha = space * 0.55 * tw;
      g.beginPath(); g.arc(SCREEN_STARS[i] * w, SCREEN_STARS[i + 1] * h, SCREEN_STARS[i + 2] * density * 0.6, 0, 2 * Math.PI); g.fill();
    }
  }
  const c = new Ctx(g, w, h, k, t, logW, density);
  for (let i = 0; i < LEVELS.length; i++) {
    const b = body[i], a = amb[i];
    if (b < 0.003 && a < 0.003) continue;
    LEVELS[i].draw(c, b, a);
  }
  g.globalAlpha = 1;
}

// ── 크기 글자 ──────────────────────────────────────────────────────
function fmtNum(v) {
  if (v >= 10) return String(Math.round(v));
  const r = Math.round(v * 10) / 10;
  return r === Math.floor(r) ? String(r) : String(r);
}
function bigNum(v) {
  if (I18N.lang === "en") {
    if (v >= 1e9) return fmtNum(v / 1e9) + " billion";
    if (v >= 1e6) return fmtNum(v / 1e6) + " million";
    if (v >= 1e4) return Math.round(v).toLocaleString("en-US");
    return fmtNum(v);
  }
  const [man, eok] = I18N.lang === "ko" ? ["만", "억"] : I18N.lang === "ja" ? ["万", "億"] : ["万", "亿"];
  if (v >= 1e8) return fmtNum(v / 1e8) + eok;
  if (v >= 1e4) return fmtNum(v / 1e4) + man;
  return fmtNum(v);
}
const LIGHT_YEARS = L("light-years", "광년", "光年", "光年");
function sizeText(m) {
  if (m >= 0.1 * LY) return bigNum(m / LY) + " " + LIGHT_YEARS.s;
  if (m >= 1e3) return bigNum(m / 1e3) + " km";
  if (m >= 1) return fmtNum(m) + " m";
  if (m >= 1e-2) return fmtNum(m * 100) + " cm";
  if (m >= 1e-3) return fmtNum(m * 1000) + " mm";
  if (m >= 1e-6) return fmtNum(m * 1e6) + " µm";
  if (m >= 1e-9) return fmtNum(m * 1e9) + " nm";
  if (m >= 1e-12) return fmtNum(m * 1e12) + " pm";
  if (m >= 1e-15) return fmtNum(m * 1e15) + " fm";
  if (m >= 1e-18) return fmtNum(m * 1e18) + " am";
  let e = Math.floor(Math.log10(m)), mant = m / Math.pow(10, e);
  if (mant >= 9.95) { mant /= 10; e += 1; }
  return fmtNum(mant) + " × 10" + (e < 0 ? "⁻" : "") + String(Math.abs(e)).split("").map(d => SUP[+d]).join("") + " m";
}
const SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹";
function powerText(logW) {
  const n = Math.floor(logW + 0.5);
  return "10" + (n < 0 ? "⁻" : "") + String(Math.abs(n)).split("").map(d => SUP[+d]).join("") + " m";
}
