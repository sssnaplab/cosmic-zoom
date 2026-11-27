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
  constructor(g, w, h, k, t, logW, density, cx = w / 2, cy = h / 2) {
    this.g = g; this.w = w; this.h = h; this.k = k; this.t = t; this.logW = logW; this.density = density;
    this.cx = cx; this.cy = cy;
    // 원점에서 화면 가장자리까지의 가장 먼 거리(미터)
    this.hwX = Math.max(cx, w - cx) / k; this.hwY = Math.max(cy, h - cy) / k;
  }
  /** 세계를 (dx, dy) 미터 옮겨 그리는 문맥 */
  shifted(dx, dy) { return new Ctx(this.g, this.w, this.h, this.k, this.t, this.logW, this.density, this.cx + dx * this.k, this.cy + dy * this.k); }
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

// ── 맨 위. 다중우주(가설) ──────────────────────────────────────────
const OBS_R = 4.4e26;
const MultiData = (() => {
  const OUR_R = 4.2e27, r = new Rnd(281);
  const bubbles = [[1.10e28, -0.62e28, 3.0e27, 0], [-1.05e28, -0.80e28, 2.4e27, 1], [-1.20e28, 0.70e28, 3.4e27, 2], [0.95e28, 0.85e28, 2.0e27, 3],
    [0.05e28, -1.45e28, 1.6e27, 1], [0.10e28, 1.40e28, 2.2e27, 0], [1.60e28, 0.15e28, 1.4e27, 2], [-1.65e28, -0.05e28, 1.5e27, 3]];
  const w = [];
  for (let f = 0; f < 90; f++) {
    let x, y;
    do { x = (r.next() * 2 - 1) * OBS_R; y = (r.next() * 2 - 1) * OBS_R; } while (Math.hypot(x, y) > OBS_R * 0.95 || Math.hypot(x, y) < 6e25);
    let an = r.next() * 2 * Math.PI;
    for (let k = 0; k < 16; k++) {
      for (let m = 0; m < 2; m++) w.push(x + r.gauss() * 5e24, y + r.gauss() * 5e24);
      an += r.gauss() * 0.6; x += Math.cos(an) * 1.4e25; y += Math.sin(an) * 1.4e25;
    }
  }
  const ours = [];
  for (let i = 0; i < 1400; i++) { const rr = OUR_R * 0.97 * Math.sqrt(r.next()), an = r.next() * 2 * Math.PI; ours.push(rr * Math.cos(an), rr * Math.sin(an)); }
  const others = bubbles.map(bb => { const o = []; for (let i = 0; i < 70; i++) { const rr = bb[2] * 0.9 * Math.sqrt(r.next()), an = r.next() * 2 * Math.PI; o.push(bb[0] + rr * Math.cos(an), bb[1] + rr * Math.sin(an)); } return o; });
  return { OUR_R, bubbles, obsWeb: w, ours, others, tints: [C(0xFFFF9EC8), C(0xFF8FE3FF), C(0xFFB9A8FF), C(0xFF9BFFC0)] };
})();

function drawMultiverse(c, b) {
  if (b <= 0.003) return;
  const d = MultiData, x0 = c.sx(0), y0 = c.sy(0), ro = c.px(d.OUR_R);
  if (ro > 2 && ro < 1e6) c.radial(x0, y0, ro, [[0, C(0x223A3A8A)], [0.85, C(0x2A5A4AB0)], [0.97, C(0x55B9A8FF)], [1, C(0x00000000)]], b);
  c.dots(d.obsWeb, C(0xFFD9D2FF), c.dp(1.5), b * c.band(26.5, 28.3) * 0.8);
  c.dots(d.ours, C(0xFFCFC6FF), c.dp(1.3), b * ramp(c.logW, 27.2, 27.8) * 0.7);
  const far = b * ramp(c.logW, 27.9, 28.4);
  d.bubbles.forEach((bb, k) => {
    const col = d.tints[bb[3]], rp = c.px(bb[2]);
    if (far > 0.01 && rp > 1 && c.visible(bb[0], bb[1], rp)) {
      c.radial(c.sx(bb[0]), c.sy(bb[1]), rp, [[0, withA(col, 0.10)], [0.8, withA(col, 0.18)], [0.97, withA(col, 0.55)], [1, C(0x00000000)]], far);
    }
    c.dots(d.others[k], col, c.dp(1.2), far * 0.6);
  });
  const edge = b * c.band(26.9, 28.6);
  c.ring(0, 0, OBS_R, C(0xFFFFD34D), edge, c.dp(1.8), true);
  c.circle(0, 0, 0, C(0xFFFFD34D), edge * ramp(c.logW, 27.9, 28.3), c.dp(3));
  c.label(S.obsEdge.s, 0, -OBS_R, edge, C(0xFFFFE6A0), 12, -c.dp(14), true);
  c.label(S.beyondMaybe.s, 0, d.OUR_R * 0.62, b * c.band(27.6, 29.0), C(0xFFD8D0FF), 12);
  const top = b * c.band(28.0, 29.4), b1 = d.bubbles[1];
  c.label(S.otherBubbles.s, b1[0], b1[1], top, C(0xFFBFEFFF), 12, c.px(b1[2]) + c.dp(14), true);
  c.label(S.hypothesis.s, 0, -c.hwY * 0.58, top, C(0xFFFFC870), 13, 0, true);
  c.label(S.notToScale.s, 0, -c.hwY * 0.58, top, C(0xFFD8CCFF), 11, c.dp(20));
}

// ── 실제 사진(NASA). 출처는 docs/photo-credits.md ──────────────────
const PHOTOS = { base: "img/photos/", m31: null, xdf: null, map: null, earth: null, building: null };
function loadPhotos() {
  const img = (name, cb) => { const im = new Image(); im.onload = () => cb(im); im.src = PHOTOS.base + name; };
  img("m31.jpg", im => { PHOTOS.m31 = im; });
  img("xdf.jpg", im => { PHOTOS.xdf = im; });
  img("earth.jpg", im => {
    const cv = document.createElement("canvas"); cv.width = im.naturalWidth; cv.height = im.naturalHeight;
    const g = cv.getContext("2d"); g.drawImage(im, 0, 0);
    try { PHOTOS.map = { w: cv.width, h: cv.height, px: g.getImageData(0, 0, cv.width, cv.height).data }; } catch (e) { /* 다른 출처면 못 읽음 */ }
  });
}
/** 출발 위치가 정면에 오는 지구 사진(정사영). 없으면 만들기를 예약하고 null */
function earthPhoto(place) {
  if (PHOTOS.earth && PHOTOS.earth.place === place) return PHOTOS.earth.canvas;
  if (!PHOTOS.map || PHOTOS.building === place) return null;
  PHOTOS.building = place;
  setTimeout(() => {
    const n = 768, m = PHOTOS.map, cv = document.createElement("canvas"); cv.width = cv.height = n;
    const g = cv.getContext("2d"), out = g.createImageData(n, n), o = out.data;
    const phi0 = place.lat * Math.PI / 180, lon0 = place.lon * Math.PI / 180, s0 = Math.sin(phi0), c0 = Math.cos(phi0);
    for (let j = 0; j < n; j++) {
      const yN = -((j + 0.5) / n * 2 - 1);
      for (let i = 0; i < n; i++) {
        const x = (i + 0.5) / n * 2 - 1, rho = Math.hypot(x, yN);
        if (rho > 1) continue;
        const cc0 = Math.asin(Math.min(rho, 1)), sc = Math.sin(cc0), cc = Math.cos(cc0);
        const phi = rho < 1e-9 ? phi0 : Math.asin(cc * s0 + yN * sc * c0 / rho);
        const lam = lon0 + Math.atan2(x * sc, rho * cc * c0 - yN * sc * s0);
        let u = (lam / (2 * Math.PI) + 0.5) % 1; if (u < 0) u += 1;
        const v = Math.min(Math.max(0.5 - phi / Math.PI, 0), 0.9999);
        const si = ((v * m.h | 0) * m.w + Math.min(u * m.w | 0, m.w - 1)) * 4, di = (j * n + i) * 4;
        o[di] = m.px[si]; o[di + 1] = m.px[si + 1]; o[di + 2] = m.px[si + 2];
        o[di + 3] = Math.min(255, Math.max(0, (1 - rho) * n * 0.5 * 255));
      }
    }
    g.putImageData(out, 0, 0);
    PHOTOS.earth = { place, canvas: cv }; PHOTOS.building = null;
  }, 0);
  return null;
}
function screenImage(c, img, x, y, w, h, alpha) {
  const g = c.g; g.save(); g.globalCompositeOperation = "screen"; g.globalAlpha = Math.min(alpha, 1); g.drawImage(img, x, y, w, h); g.restore();
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

function drawCosmicWeb(c, b, a) {
  const d = WebData, fil = C(0xFF7D6BFF);
  if (PHOTOS.xdf) {
    const ba = Math.max(a || 0, b) * 0.55;
    if (ba > 0.01) {
      const im = PHOTOS.xdf, sc = Math.max(c.w / im.naturalWidth, c.h / im.naturalHeight), dw = im.naturalWidth * sc, dh = im.naturalHeight * sc;
      screenImage(c, im, (c.w - dw) / 2, (c.h - dh) / 2, dw, dh, ba);
      c.label(S.creditXdf.s, 0, 0, ba * c.band(25.3, 26.8), C(0xFFB8C2FF), 10, c.h * 0.18);
    }
  }
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
  const mr = Math.max(c.px(1.3e21), c.dp(6));
  if (PHOTOS.m31 && mr > c.dp(3) && c.visible(d.ax, d.ay, mr)) {
    screenImage(c, PHOTOS.m31, c.sx(d.ax) - mr, c.sy(d.ay) - mr, mr * 2, mr * 2, b);
    c.label(S.creditM31.s, d.ax, d.ay, b * c.band(22.3, 23.9), C(0xFFB8C2FF), 10, mr + c.dp(10));
  } else spiralOval(c, d.ax, d.ay, 1.1e21, 0.32, -35, b, c.dp(4));
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
  const photo = rp >= 6 && rp <= 24000 ? earthPhoto(SESSION.place) : null;
  if (photo) { c.alpha(b); c.g.drawImage(photo, x - rp, y - rp, rp * 2, rp * 2); }
  else {
    for (const p of map.world) c.polyFill(p.xy, p.bbox, LAND, b);
    for (const p of map.korea) c.polyFill(p.xy, p.bbox, LAND, b);
    for (const p of map.water) c.polyFill(p.xy, p.bbox, OCEAN, b);
  }
  const ca = photo ? 0 : b * 0.42 * ramp(c.logW, 6.3, 6.9);
  if (ca > 0.01 && rp > 8) for (let i = 0; i < map.clouds.length; i += 3) c.circle(map.clouds[i], map.clouds[i + 1], map.clouds[i + 2], WHITE, ca);
  if (rp < 6000) c.radial(x, y, rp, [[0, C(0x00000000)], [0.62, C(0x00000000)], [1, C(0xB0000010)]], b, x - rp * 0.45, y - rp * 0.4, rp * 1.75);
  c.label(SESSION.place.country.s, 0, 0, b * c.band(6.4, 7.6), WHITE, 13, c.dp(-18), true);
  if (photo) c.label(S.creditEarth.s, 0, r, b * c.band(6.6, 7.8), C(0xFFB8C2FF), 10, c.dp(14));
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

/** 고른 갈래의 몸 부위(손·눈)가 화면 가운데에 오도록 아이 그림을 옮겨 그린다 */
const FOCUS = { eye: [-0.338, -0.45], nerve: [-0.33, -0.455], blood: [-0.02, -0.14], heart: [-0.25, -0.17], brain: [-0.30, -0.49], hair: [-0.30, -0.585], tooth: [-0.30, -0.39] };
function branchFocus(id) { return FOCUS[id] || [0, 0]; }
const BODY = { branch: "hand" };
function drawKid(c, b, a) {
  const f = branchFocus(BODY.branch);
  drawKidAt(c.shifted(-f[0], -f[1]), b, a);
}
function drawKidAt(c, b, a) {
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

// ── 신체 갈래(눈·시신경) 그림: 앱 BodyScenes.kt 를 옮긴 것 ─────────────
const EYE_W = 1.5e-2, EYE_H = 6.6e-3, IRIS_R = 6.0e-3, PUPIL_R = 2.0e-3;
const EYE_ALMOND = (() => {
  const n = 64, out = [];
  for (let i = 0; i < n; i++) {
    const th = 2 * Math.PI * i / n, s = Math.sin(th);
    out.push(EYE_W * Math.cos(th), (s < 0 ? EYE_H : EYE_H * 0.8) * s * (1 - 0.12 * Math.cos(th)));
  }
  return out;
})();
const EyeData = (() => {
  const r = new Rnd(310), fibres = [];
  for (let i = 0; i < 140; i++) fibres.push(r.next() * 2 * Math.PI, 0.36 + r.next() * 0.12, 0.75 + r.next() * 0.22, r.next());
  const veins = [];
  for (let v = 0; v < 9; v++) {
    const side = v % 2 === 0 ? 1 : -1;
    let x = side * EYE_W * (0.92 - r.next() * 0.1), y = (r.next() - 0.5) * EYE_H * 0.8;
    let an = side > 0 ? Math.PI + (r.next() - 0.5) * 0.8 : (r.next() - 0.5) * 0.8;
    const pts = [];
    for (let k = 0; k < 10; k++) { pts.push(x, y); an += r.gauss() * 0.35; x += Math.cos(an) * 6e-4; y += Math.sin(an) * 6e-4; }
    veins.push(pts);
  }
  return { fibres, veins };
})();

function drawEye(c, b, a) {
  if (a > 0.003) c.fill(SKIN, a);
  if (b <= 0.003) return;
  const g = c.g, x0 = c.sx(0), y0 = c.sy(0);
  c.glow(0, 0, c.px(EYE_W * 1.25), C(0x55A0603C), b);
  g.save(); c.pathOf(EYE_ALMOND, true); g.clip();
  const rx = c.px(EYE_W);
  c.radial(x0, y0, rx * 1.4, [[0, C(0xFFFBF7F2)], [0.4, C(0xFFF1E6DF)], [0.7, C(0xFFD9B8AC)], [1, C(0xFFC79A8C)]], b);
  for (const v of EyeData.veins) c.polyline(v, C(0xFFC0392B), b * 0.35, Math.max(1, c.px(6e-5)));
  const ri = c.px(IRIS_R);
  c.radial(x0, y0, ri, [[0, C(0xFF2A1C10)], [0.33, C(0xFF4E3518)], [0.45, C(0xFF8A6A30)], [0.62, C(0xFF6E7A3E)], [0.86, C(0xFF4A5A34)], [0.97, C(0xFF1E1A12)], [1, C(0xFF14110C)]], b);
  if (ri > 25) {
    const f = EyeData.fibres, dark = C(0xFF3A2A16), light = C(0xFFD8B870);
    for (let i = 0; i < f.length; i += 4) {
      const an = f[i];
      c.line(Math.cos(an) * IRIS_R * f[i + 1], Math.sin(an) * IRIS_R * f[i + 1], Math.cos(an) * IRIS_R * f[i + 2], Math.sin(an) * IRIS_R * f[i + 2], lerpC(dark, light, f[i + 3]), b * 0.35, Math.max(1, c.px(4e-5)));
    }
    const cr = [];
    for (let j = 0; j <= 72; j++) { const th = 2 * Math.PI * j / 72, rr = IRIS_R * (0.5 + 0.03 * Math.sin(th * 11)); cr.push(rr * Math.cos(th), rr * Math.sin(th)); }
    c.polyline(cr, C(0xFFB89650), b * 0.5, Math.max(1, c.px(1.2e-4)));
  }
  c.radial(x0, y0, c.px(PUPIL_R), [[0, C(0xFF000000)], [0.85, C(0xFF050505)], [1, C(0xFF1A120A)]], b);
  c.glow(-1.7e-3, -1.9e-3, Math.max(c.dp(3), c.px(1.1e-3)), C(0xCCFFFFFF), b);
  c.circle(-1.7e-3, -1.9e-3, 3e-4, WHITE, b * 0.9, c.dp(1.2));
  const gr = g.createLinearGradient(0, c.sy(-EYE_H), 0, c.sy(-EYE_H * 0.35));
  gr.addColorStop(0, C(0x66301A10).s); gr.addColorStop(1, C(0x00301A10).s);
  c.alpha(b); g.fillStyle = gr; g.fillRect(0, c.sy(-EYE_H), c.w, c.sy(-EYE_H * 0.35) - c.sy(-EYE_H));
  g.restore();
  const half = EYE_ALMOND.length / 4;
  const upper = EYE_ALMOND.slice(half * 2).concat(EYE_ALMOND.slice(0, 2));
  c.polyline(upper, C(0xFF5A3524), b, Math.max(1.5, c.px(2.5e-4)));
  c.polyline(EYE_ALMOND.slice(0, half * 2 + 2), C(0xFFB0705A), b * 0.7, Math.max(1, c.px(1.2e-4)));
  for (let j = 2; j < upper.length / 2 - 2; j++) {
    const x = upper[2 * j], y = upper[2 * j + 1], ang = -Math.PI / 2 + (x / EYE_W) * 0.9, len = 2.2e-3 * (1 - Math.abs(x / EYE_W) * 0.6);
    c.line(x, y, x + Math.cos(ang) * len, y + Math.sin(ang) * len - 3e-4, C(0xFF241510), b * 0.85, Math.max(1, c.px(9e-5)));
  }
  const crease = [];
  for (let i = 0; i < 20; i++) { const u = (i - 9.5) / 9.5; crease.push(u * EYE_W * 0.85, -EYE_H * 1.45 * (1 - u * u) - 1e-3); }
  c.polyline(crease, C(0xFFB8806A), b * 0.6, Math.max(1, c.px(1.5e-4)));
  const lb = b * c.band(-1.9, -0.9);
  c.label(S.iris.s, IRIS_R * 0.72, IRIS_R * 0.55, lb, WHITE, 12, 0, true);
  c.label(S.pupil.s, 0, 0, lb, WHITE, 12, 0, true);
  c.label(S.cornea.s, -1.7e-3, -1.9e-3, lb, C(0xFFE0F0FF), 11, -c.dp(14));
  c.label(S.sclera.s, -EYE_W * 0.72, 0, lb, C(0xFF7A4A3A), 11);
}

const DISC_X = 3.9e-3, DISC_Y = -0.3e-3, DISC_R = 0.85e-3;
const RetinaData = (() => {
  const r = new Rnd(420), vessels = [];
  function walk(x0, y0, an0, w, steps, artery, depth) {
    const pts = []; let x = x0, y = y0, an = an0;
    for (let i = 0; i < steps; i++) {
      pts.push(x, y);
      const d = Math.hypot(x, y);
      if (d < 2.6e-3) { const away = Math.atan2(y, x); const diff = ((away - an + 3 * Math.PI) % (2 * Math.PI)) - Math.PI; an += diff * 0.25; }
      an += r.gauss() * 0.12;
      x += Math.cos(an) * 2.2e-4; y += Math.sin(an) * 2.2e-4;
      if (depth < 3 && i > 4 && i % 7 === 3 && r.next() < 0.8) {
        const side = r.next() < 0.5 ? 1 : -1;
        walk(x, y, an + side * (0.6 + r.next() * 0.5), w * 0.62, Math.floor((steps - i) * 2 / 3) + 6, artery, depth + 1);
      }
    }
    vessels.push({ pts, w, artery });
  }
  walk(DISC_X, DISC_Y - 2e-4, -2.4, 1.5e-4, 42, true, 0);
  walk(DISC_X - 1e-4, DISC_Y - 4e-4, -2.2, 1.8e-4, 42, false, 0);
  walk(DISC_X, DISC_Y + 2e-4, 2.4, 1.5e-4, 42, true, 0);
  walk(DISC_X - 1e-4, DISC_Y + 4e-4, 2.2, 1.8e-4, 42, false, 0);
  walk(DISC_X + 2e-4, DISC_Y - 1e-4, -0.6, 1.1e-4, 20, true, 1);
  walk(DISC_X + 2e-4, DISC_Y + 2e-4, 0.5, 1.2e-4, 20, false, 1);
  for (let k = 0; k < 10; k++) { const an = r.next() * 2 * Math.PI; walk(Math.cos(an) * 2.9e-3, Math.sin(an) * 2.9e-3, an + Math.PI + (r.next() - 0.5) * 0.6, 4e-5, 6, k % 2 === 0, 3); }
  vessels.sort((p, q) => q.w - p.w);
  return { vessels };
})();

function drawRetina(c, b, a) {
  const vis = Math.max(a, b);
  if (vis <= 0.003) return;
  const g = c.g, x0 = c.sx(0), y0 = c.sy(0);
  if (a < 0.995) {
    const r = c.px(PUPIL_R) + (Math.max(c.w, c.h) * 1.5 - c.px(PUPIL_R)) * a;
    if (r < 0.5) return;
    g.save(); g.beginPath(); g.arc(x0, y0, r, 0, 2 * Math.PI); g.clip();
    retinaBody(c, b, vis, x0, y0);
    g.restore();
  } else retinaBody(c, b, vis, x0, y0);
}
function retinaBody(c, b, vis, x0, y0) {
  const g = c.g, R = Math.max(c.px(9e-3), 1);
  const gr = g.createRadialGradient(x0, y0, 0, x0, y0, R);
  [[0, 0xFF7A2410], [0.06, 0xFF9A3414], [0.25, 0xFFB8471E], [0.7, 0xFFD06A2E], [1, 0xFFB04A20]].forEach(([p, col]) => gr.addColorStop(p, C(col).s));
  c.alpha(vis); g.fillStyle = gr; g.fillRect(0, 0, c.w, c.h);
  if (b <= 0.003) return;
  c.glow(0, 0, c.px(1.8e-3), C(0x995A1A08), b);
  c.glow(0, 0, Math.max(c.dp(5), c.px(1.5e-4)), C(0xCCFFE6B0), b * 0.8);
  const art = C(0xFFE0502E), vein = C(0xFF8A1C10), refl = C(0x66FFD0B0);
  for (const v of RetinaData.vessels) {
    c.polyline(v.pts, v.artery ? art : vein, b, Math.max(1, c.px(v.w)));
    if (v.artery && c.px(v.w) > 4) c.polyline(v.pts, refl, b, c.px(v.w) * 0.25);
  }
  const dr = c.px(DISC_R);
  if (dr > 0.5) c.radial(c.sx(DISC_X), c.sy(DISC_Y), dr, [[0, C(0xFFFFF4DC)], [0.45, C(0xFFFBD9A8)], [0.85, C(0xFFEBA77A)], [1, C(0x00E08050)]], b);
  const lb = b * c.band(-2.5, -1.5);
  c.label(S.opticDisc.s, DISC_X, DISC_Y, lb, C(0xFF3A1A08), 12, dr + c.dp(14), true);
  c.label(S.macula.s, 0, 0, lb, C(0xFFFFE6C0), 12, -c.px(1.8e-3) * 0.6, true);
  c.label(S.fovea.s, 0, 0, b * c.band(-3.2, -2.4), C(0xFFFFE6C0), 12, c.dp(22));
  c.label(S.vessels.s, -3.2e-3, -2.6e-3, lb, WHITE, 11);
}

const CONE_S = 3.2e-6;
function drawPhotoreceptors(c, b, a) {
  if (a > 0.003) c.fill(C(0xFF120806), a);
  if (b <= 0.003) return;
  const rowH = CONE_S * 0.866, nx = 2 * c.hwX / CONE_S + 3, ny = 2 * c.hwY / rowH + 3;
  const far = 1 - ramp(nx * ny, 3500, 6000);
  const Lc = C(0xFFFF5A48), Mc = C(0xFF52E06A), Sc = C(0xFF5C7CFF), rod = C(0xFFD8D2C8);
  if (far < 0.99) {
    const cell = Math.max(CONE_S * 2, Math.sqrt(4 * c.hwX * c.hwY / 3500));
    const sp = b * (1 - far) * ramp(-c.logW, 2.4, 3.2);
    if (sp > 0.01) c.grid(cell, 4500, (i, j, x, y) => {
      const h = hash(i, j, 504);
      c.circle(x + cell * hash(i, j, 505), y + cell * hash(i, j, 506), 0, h < 0.07 ? Sc : h < 0.37 ? Mc : Lc, sp * 0.8, c.dp(1.3));
    });
  }
  if (far <= 0.01) return;
  const j0 = Math.floor(-c.hwY / rowH) - 1, j1 = Math.floor(c.hwY / rowH) + 1;
  const i0 = Math.floor(-c.hwX / CONE_S) - 2, i1 = Math.floor(c.hwX / CONE_S) + 2;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const x = i * CONE_S + ((j & 1) === 1 ? CONE_S / 2 : 0) + (hash(i, j, 501) - 0.5) * CONE_S * 0.25;
    const y = j * rowH + (hash(i, j, 502) - 0.5) * CONE_S * 0.25;
    const d = Math.hypot(x, y);
    if (hash(i, j, 503) < ramp(d, 1.6e-5, 4.5e-5) * 0.75) { c.circle(x, y, CONE_S * 0.22, rod, b * far * 0.8, 1); continue; }
    const h = hash(i, j, 504), col = h < 0.07 ? Sc : h < 0.37 ? Mc : Lc;
    const rr = CONE_S * (0.36 + 0.06 * ramp(d, 0, 4e-5));
    c.glow(x, y, c.px(rr * 1.5), col, b * far * 0.55);
    c.circle(x, y, rr * 0.55, lerpC(col, WHITE, 0.45), b * far, 1);
  }
  const lb = b * far * c.band(-5.0, -3.8);
  c.label(S.cones.s, 0, 0, lb, WHITE, 12, -c.dp(26), true);
  c.label(S.rods.s, 3.6e-5, 1.2e-5, lb, C(0xFFEDE6DC), 11);
  c.label(S.falseColor.s, 0, -c.hwY * 0.55, lb, C(0xFFFFE6A0), 11);
}

function bilayer(c, halfThick, headR, gapHalf, headCol, tailCol, alpha) {
  if (alpha <= 0.003) return;
  const step = headR * 2.2, n0 = Math.floor(-c.hwX / step) - 1, n1 = Math.floor(c.hwX / step) + 1;
  if (n1 - n0 > 400) { c.rect(-c.hwX - 1e-9, -halfThick, c.hwX + 1e-9, halfThick, lerpC(headCol, tailCol, 0.5), alpha * 0.8); return; }
  for (let n = n0; n <= n1; n++) {
    const x = n * step;
    if (Math.abs(x) < gapHalf) continue;
    for (const side of [-1, 1]) {
      const yh = side * halfThick, wig = (hash(n, side, 611) - 0.5) * headR * 0.6;
      c.line(x - headR * 0.3, yh, x - headR * 0.3 + wig, yh * 0.15, tailCol, alpha * 0.8, Math.max(1, c.px(headR * 0.18)));
      c.line(x + headR * 0.3, yh, x + headR * 0.3 - wig, yh * 0.15, tailCol, alpha * 0.8, Math.max(1, c.px(headR * 0.18)));
      c.sphere(x, yh, headR, headCol, alpha, 1);
    }
  }
}

const MEM_H = 2.2e-9;
function drawRhodopsin(c, b, a) {
  if (a > 0.003) c.fill(C(0xFF2A1638), a);
  if (b <= 0.003) return;
  bilayer(c, MEM_H, 0.26e-9, 2.6e-9, C(0xFFE6B85C), C(0xFFB79A6A), b);
  const xs = [-2.1e-9, -1.4e-9, -0.7e-9, 0, 0.7e-9, 1.4e-9, 2.1e-9];
  const cols = [0xFF9B6CE0, 0xFFB07CF0, 0xFF8A5AD0, 0xFFC08AF8, 0xFF9466DA, 0xFFAD7AEE, 0xFF8C5CD4].map(C);
  for (let k = 0; k < 6; k++) {
    const top = k % 2 === 0, y = top ? -2.9e-9 : 2.9e-9, pts = [];
    for (let q = 0; q < 9; q++) { const u = q / 8; pts.push(xs[k] + (xs[k + 1] - xs[k]) * u, y + (top ? -1 : 1) * Math.sin(u * Math.PI) * 0.6e-9); }
    c.polyline(pts, C(0xFFC9A6F5), b * 0.8, Math.max(1, c.px(0.18e-9)));
  }
  xs.forEach((x, k) => {
    if (k === 3) return;
    c.rrect(x - 0.32e-9, -3.0e-9, x + 0.32e-9, 3.0e-9, 0.32e-9, cols[k], b);
    for (let y = -2.8e-9; y < 2.8e-9; y += 0.36e-9) c.line(x - 0.3e-9, y, x + 0.3e-9, y + 0.18e-9, C(0x55FFFFFF), b, Math.max(1, c.px(0.06e-9)));
  });
  const cyc = c.t % 6, straight = ramp(cyc, 1.0, 1.3) * (1 - ramp(cyc, 4.2, 4.8));
  const chain = [];
  for (let q = 0; q < 8; q++) {
    const zig = (q % 2 === 0 ? -1 : 1) * 0.09e-9, bend = q >= 4 ? (q - 3) * 0.32e-9 * (1 - straight) : 0;
    chain.push(-1.0e-9 + q * 0.28e-9, zig - bend);
  }
  c.polyline(chain, C(0xFFFF9A3C), b, Math.max(1.5, c.px(0.12e-9)));
  for (let q = 0; q < 8; q++) c.sphere(chain[2 * q], chain[2 * q + 1], 0.07e-9, C(0xFFFFB45A), b, 1);
  if (cyc < 1.1) {
    const u = cyc / 1.1, pts = [];
    for (let q = 0; q < 20; q++) {
      const f = (q / 19) * u, x = -7e-9 + 7e-9 * f, y = -6e-9 + 6e-9 * f;
      pts.push(x + Math.sin(f * 40) * 0.25e-9, y - Math.sin(f * 40) * 0.25e-9);
    }
    c.polyline(pts, C(0xFFFFF07A), b, Math.max(1.5, c.px(0.08e-9)));
    c.glow(pts[38], pts[39], c.dp(10), C(0xFFFFF07A), b);
  }
  const lb = b * c.band(-8.6, -7.4);
  c.label(S.opsin.s, 0, -3.0e-9, lb, C(0xFFE6D0FF), 12, -c.dp(24), true);
  c.label(S.retinal.s, 0, 0, lb, C(0xFFFFD0A0), 12, c.dp(26), true);
  c.label(S.discMembrane.s, -c.hwX * 0.6, MEM_H, lb, C(0xFFF0D8A8), 11, c.dp(22));
  c.label(S.flip.s, 0, 3.0e-9, lb, C(0xFFFFF0A0), 11, c.dp(40));
}

const NERVE_R = 1.75e-3;
const NerveData = (() => {
  const r = new Rnd(530), f = [0, 0, 1.4e-4], sp = 2.9e-4;
  for (let j = -8; j <= 8; j++) for (let i = -8; i <= 8; i++) {
    const x = i * sp + (j % 2 !== 0 ? sp / 2 : 0) + r.gauss() * 3e-5, y = j * sp * 0.87 + r.gauss() * 3e-5;
    if (Math.hypot(x, y) < NERVE_R - 1.4e-4 && Math.hypot(x, y) > sp * 0.8 && Math.hypot(x + 3.5e-4, y - 2.5e-4) > 2.4e-4) f.push(x, y, 1.05e-4 + r.next() * 0.45e-4);
  }
  const d = [];
  for (let k = 0; k < f.length; k += 3) for (let m = 0; m < 26; m++) { const rr = f[k + 2] * 0.9 * Math.sqrt(r.next()), an = r.next() * 2 * Math.PI; d.push(f[k] + rr * Math.cos(an), f[k + 1] + rr * Math.sin(an)); }
  return { fascicles: f, axonDots: d };
})();
function drawOpticNerve(c, b, a) {
  if (a > 0.003) c.fill(C(0xFFE6C3CC), a);
  if (b <= 0.003) return;
  c.circle(0, 0, NERVE_R + 3.6e-4, C(0xFFF4E6EA), b);
  c.circle(0, 0, NERVE_R + 2.2e-4, C(0xFFE9C8D3), b);
  c.circle(0, 0, NERVE_R + 0.6e-4, C(0xFFD9879F), b);
  c.circle(0, 0, NERVE_R, C(0xFFCF7E9A), b);
  const f = NerveData.fascicles, fc = C(0xFF9E5A92);
  for (let i = 0; i < f.length; i += 3) c.sphere(f[i], f[i + 1], f[i + 2], fc, b, 1);
  c.dots(NerveData.axonDots, C(0xFFE9C9F0), c.dp(1.2), b * ramp(-c.logW, 2.6, 3.0) * 0.8);
  c.circle(-3.5e-4, 2.5e-4, 1.1e-4, C(0xFF6A0E12), b); c.circle(-3.5e-4, 2.5e-4, 0.7e-4, C(0xFFD23A3A), b);
  c.circle(-2.0e-4, 4.0e-4, 1.2e-4, C(0xFF4A0A10), b); c.circle(-2.0e-4, 4.0e-4, 0.85e-4, C(0xFF8E2228), b);
  const lb = b * c.band(-2.7, -1.7);
  c.label(S.nerveSheath.s, 0, -(NERVE_R + 3.6e-4), lb, C(0xFF7A3A50), 11, -c.dp(12), true);
  c.label(S.fascicle.s, 0, 0, lb, WHITE, 12, -c.dp(22), true);
  c.label(S.centralVessels.s, -2.8e-4, 3.2e-4, lb, C(0xFFFFE0E0), 11, c.dp(22));
}

const AX_S = 1.7e-6;
function drawAxons(c, b, a) {
  if (a > 0.003) c.fill(C(0xFF8E8A86), a);
  if (b <= 0.003) return;
  const rowH = AX_S * 0.87, nx = 2 * c.hwX / AX_S + 3, ny = 2 * c.hwY / rowH + 3;
  const far = 1 - ramp(nx * ny, 2500, 4000);
  if (far <= 0.01) return;
  const j0 = Math.floor(-c.hwY / rowH) - 1, j1 = Math.floor(c.hwY / rowH) + 1, i0 = Math.floor(-c.hwX / AX_S) - 2, i1 = Math.floor(c.hwX / AX_S) + 2;
  const myelin = C(0xFF1E1C1B), inside = C(0xFFCFC9C2), lam = C(0xFF5A5652), fil = C(0xFF7A746E);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const center = i === 0 && j === 0;
    const x = center ? 0 : i * AX_S + ((j & 1) === 1 ? AX_S / 2 : 0) + (hash(i, j, 701) - 0.5) * AX_S * 0.3;
    const y = center ? 0 : j * rowH + (hash(i, j, 702) - 0.5) * AX_S * 0.3;
    const r = center ? 0.5e-6 : (0.2 + 0.3 * hash(i, j, 703)) * 1e-6, my = r * 1.55;
    if (!c.visible(x, y, c.px(my))) continue;
    c.circle(x, y, my, myelin, b * far);
    if (c.px(my - r) > 30) for (let q = 1; q <= 7; q++) c.ring(x, y, r + (my - r) * q / 8, lam, b * far * 0.5, Math.max(1, c.px((my - r) / 40)));
    c.circle(x, y, r, inside, b * far);
    if (c.px(r) > 40) for (let q = 0; q < 14; q++) {
      const an = hash(i * 31 + q, j, 704) * 2 * Math.PI, rr = r * 0.8 * Math.sqrt(hash(i, j * 17 + q, 705));
      c.circle(x + Math.cos(an) * rr, y + Math.sin(an) * rr, r * 0.045, fil, b * far, 1);
    }
  }
  const lb = b * far * c.band(-6.2, -5.0);
  c.label(S.axon.s, 0, 0, lb, C(0xFF2A2624), 12, 0, true);
  c.label(S.myelin.s, 0, 0.5e-6 * 1.55, lb, WHITE, 12, c.dp(16), true);
  c.label(S.emLike.s, 0, -c.hwY * 0.55, lb, C(0xFFF5F0E6), 11);
}

const CH_MEM = 2.5e-9;
function drawIonChannel(c, b, a) {
  if (a > 0.003) c.fill(C(0xFF0E2236), a);
  if (b <= 0.003) return;
  const ionCol = C(0xFFB98CFF), t = c.t;
  for (let n = 0; n < 40; n++) {
    const x = (hash(n, 0, 801) - 0.5) * 2 * c.hwX, y = -CH_MEM - 1e-9 - hash(n, 1, 802) * (c.hwY + 2e-9);
    c.sphere(x + Math.sin(t * (0.6 + hash(n, 2, 803)) + n) * 0.4e-9, y, 0.28e-9, ionCol, b * 0.9, 1);
  }
  for (let n = 0; n < 8; n++) c.sphere((hash(n, 5, 804) - 0.5) * 2 * c.hwX, CH_MEM + 1e-9 + hash(n, 6, 805) * (c.hwY - 2e-9), 0.28e-9, ionCol, b * 0.6, 1);
  bilayer(c, CH_MEM, 0.38e-9, 3.6e-9, C(0xFF7FB8E8), C(0xFF5A86A8), b);
  const parts = [-3.2e-9, -1.9e-9, 0.7e-9, 2.0e-9], pc = [0xFF2FB5A0, 0xFF3FCCB4, 0xFF2FB5A0, 0xFF26A08E].map(C);
  parts.forEach((x, k) => {
    c.rrect(x, -3.8e-9, x + 1.2e-9, 3.8e-9, 0.5e-9, pc[k], b);
    c.line(x + 0.25e-9, -3.4e-9, x + 0.25e-9, 3.4e-9, C(0x44FFFFFF), b, Math.max(1, c.px(0.1e-9)));
  });
  for (let k = 0; k < 4; k++) {
    const u = (t * 0.45 + k / 4) % 1, y = -6e-9 + u * 12e-9, x = -0.6e-9 + Math.sin(u * Math.PI * 3) * 0.12e-9;
    c.sphere(x, y, 0.28e-9, C(0xFFD4B0FF), b, 1);
    if (c.px(0.28e-9) > 9) c.label("+", x, y, b, WHITE, clamp(c.px(0.28e-9) / c.density * 0.9, 9, 20), 0, true);
  }
  const lb = b * c.band(-8.2, -7.1);
  c.label(S.membrane2.s, -c.hwX * 0.62, 0, lb, WHITE, 11, 0, true);
  c.label(S.naChannel.s, 0, -3.8e-9, lb, C(0xFFB8FFF0), 12, -c.dp(16), true);
  c.label(S.naIon.s, c.hwX * 0.55, -CH_MEM - 3e-9, lb, C(0xFFE6D6FF), 11);
  c.label(S.flow.s, 0, 3.8e-9, lb, C(0xFFFFF0A0), 11, c.dp(24));
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
    if (v >= 1e12) return fmtNum(v / 1e12) + " trillion";
    if (v >= 1e9) return fmtNum(v / 1e9) + " billion";
    if (v >= 1e6) return fmtNum(v / 1e6) + " million";
    if (v >= 1e4) return Math.round(v).toLocaleString("en-US");
    return fmtNum(v);
  }
  const [man, eok] = I18N.lang === "ko" ? ["만", "억"] : I18N.lang === "ja" ? ["万", "億"] : ["万", "亿"];
  if (v >= 1e12) return fmtNum(v / 1e12) + ({ ko: "조", ja: "兆" }[I18N.lang] || "万亿");
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

// ── 1.9.0 신체 갈래: 🩸 혈액 · ❤️ 심장 · 🧠 뇌 (앱 BodyScenes2.kt 와 같은 그림) ──
function xray(c, b, logS) { return b * (0.4 + 0.6 * ramp(logS + 1.3 - c.logW, 0, 0.9)); }

const VES_R = 4.2e-4, WALL = 1.1e-4;
function drawVessel(c, b, a) {
  if (a > 0.003) {
    c.fill(C(0xFFE9A48E), a);
    const fib = C(0xFFF6C9B4), w = Math.max(1, c.px(2e-5));
    c.grid(6e-4, 900, (i, j, x, y) => {
      const an = hash(i, j, 901) * Math.PI, cx = x + 6e-4 * hash(i, j, 902), cy = y + 6e-4 * hash(i, j, 903);
      c.line(cx, cy, cx + Math.cos(an) * 5e-4, cy + Math.sin(an) * 5e-4, fib, a * 0.6, w);
    });
  }
  if (b <= 0.003) return;
  const bb = xray(c, b, -2.52), far = c.hwX * 1.2;
  c.glow(0, 0, Math.max(c.px(VES_R * 4), c.dp(10)), C(0x66B02020), bb);
  c.rect(-far, -VES_R - WALL, far, VES_R + WALL, C(0xFFC8505A), bb);
  c.rect(-far, -VES_R - WALL * 0.45, far, VES_R + WALL * 0.45, C(0xFFA8303C), bb);
  const rcPx = c.px(3.8e-6);
  c.rect(-far, -VES_R, far, VES_R, lerpC(C(0xFFB8202C), C(0xFFF0C68A), ramp(rcPx, 1.2, 4)), bb);
  if (c.px(WALL) > 6) c.grid(1.3e-4, 2000, (i, j, x) => {
    if (j !== 0) return;
    for (const side of [-1, 1]) c.line(x, side * (VES_R + WALL * 0.2), x + 0.6e-4, side * (VES_R + WALL * 0.8), C(0xFF8A2430), bb * 0.6, Math.max(1, c.px(1.2e-5)));
  });
  const cell = 1.6e-5, nx = 2 * far / cell, ny = 2 * VES_R / cell;
  if (nx * ny < 60000 && rcPx > 1) {
    const flow = c.t * 1.6e-4;
    const j0 = Math.floor(-VES_R / cell), j1 = Math.floor(VES_R / cell);
    const i0 = Math.floor((-far - flow) / cell) - 1, i1 = Math.floor((far - flow) / cell) + 1;
    const red = C(0xFFC21E2A), pale = C(0xFFE2525A);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      if (hash(i, j, 905) > 0.55) continue;
      const y = j * cell + cell * hash(i, j, 906);
      if (Math.abs(y) > VES_R - 4e-6) continue;
      const speed = 1 - (y / VES_R) * (y / VES_R) * 0.7, x = i * cell + cell * hash(i, j, 907) + flow * speed;
      if (Math.abs(x) < 1.2e-5 && Math.abs(y) < 1.2e-5) continue;
      if (!c.visible(x, y, rcPx)) continue;
      c.disc(c.sx(x), c.sy(y), rcPx, red, bb);
      if (rcPx > 3) c.disc(c.sx(x), c.sy(y), rcPx * 0.45, pale, bb);
    }
  }
  c.circle(0, 0, 3.8e-6, C(0xFFC21E2A), bb, 1);
  const lb = bb * c.band(-3.0, -2.0);
  c.label(S.vesselWall.s, -c.hwX * 0.45, -(VES_R + WALL), lb, WHITE, 12, -c.dp(14), true);
  c.label(S.plasma.s, c.hwX * 0.45, VES_R * 0.6, lb, C(0xFF5A3010), 11, 0, true);
  c.label(S.rbc.s, 0, 0, lb, C(0xFF5A1010), 12, -c.dp(22), true);
}

const RBC_R = 3.9e-6, RBC_CELL = 1.05e-5;
const RBC_STOPS = [[0, C(0xFFE88A84)], [0.35, C(0xFFD9525A)], [0.7, C(0xFFC0202C)], [0.92, C(0xFFA0141E)], [1, C(0xFF7A0E16)]];
function rbcDisc(c, x, y, r, tilt, a) {
  const rp = c.px(r);
  if (rp < 0.6 || !c.visible(x, y, rp)) return;
  const X = c.sx(x), Y = c.sy(y);
  if (rp < 4) { c.disc(X, Y, rp, C(0xFFC21E2A), a); return; }
  const g = c.g, sy = 0.55 + 0.45 * Math.abs(Math.cos(tilt));
  g.save(); g.translate(X, Y); g.scale(1, sy);
  c.radial(0, 0, rp, RBC_STOPS, a);
  g.restore();
}
function drawRedCells(c, b, a) {
  if (a > 0.003) c.fill(C(0xFFF0C68A), a);
  if (b <= 0.003) return;
  const drift = c.t * 2e-6, nx = 2 * c.hwX / RBC_CELL + 3, ny = 2 * c.hwY / RBC_CELL + 3;
  const far = 1 - ramp(nx * ny, 2500, 4500);
  if (far > 0.01) {
    const i0 = Math.floor((-c.hwX - drift) / RBC_CELL) - 1, i1 = Math.floor((c.hwX - drift) / RBC_CELL) + 1;
    const j0 = Math.floor(-c.hwY / RBC_CELL) - 1, j1 = Math.floor(c.hwY / RBC_CELL) + 1;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      if (i === 0 && j === 0) continue;
      const h = hash(i, j, 911);
      const x = i * RBC_CELL + RBC_CELL * 0.5 * (hash(i, j, 912) - 0.5) + drift, y = j * RBC_CELL + RBC_CELL * 0.5 * (hash(i, j, 913) - 0.5);
      if (h < 0.025) {
        c.circle(x, y, 6e-6, C(0xFFF6EEF4), b * far);
        for (let q = 0; q < 3; q++) c.circle(x + Math.cos(q * 2.1) * 2.2e-6, y + Math.sin(q * 2.1) * 2.2e-6, 1.9e-6, C(0xFF6A3A9A), b * far);
      } else if (h < 0.08) c.circle(x, y, 1.1e-6, C(0xFFB07AB8), b * far, 1);
      else if (h < 0.82) rbcDisc(c, x, y, RBC_R * (0.92 + 0.16 * hash(i, j, 914)), hash(i, j, 915) * 1.4, b * far);
    }
  }
  rbcDisc(c, 0, 0, RBC_R, 0, b);
  const lb = b * c.band(-5.0, -4.0);
  c.label(S.rbc.s, 0, 0, lb, WHITE, 12, -c.px(RBC_R) - c.dp(14), true);
  c.label(S.wbc.s, -c.hwX * 0.5, -c.hwY * 0.45, lb * far, C(0xFF4A2A6A), 11, 0, true);
  c.label(S.platelet.s, c.hwX * 0.45, c.hwY * 0.45, lb * far, C(0xFF6A2A6A), 11, 0, true);
  c.label(S.smearLike.s, 0, c.hwY * 0.7, lb, C(0xFF5A3010), 11);
}

const HB = 1.4e-9;
function drawHemoglobin(c, b, a) {
  if (a > 0.003) {
    c.fill(C(0xFF3A0A12), a);
    const col = C(0xFF7A2030);
    c.grid(7e-9, 2500, (i, j, x, y) => {
      if (Math.abs(i) <= 1 && Math.abs(j) <= 1) return;
      const cx = x + 3.5e-9 + (hash(i, j, 921) - 0.5) * 1.5e-9, cy = y + 3.5e-9 + (hash(i, j, 922) - 0.5) * 1.5e-9;
      for (let q = 0; q < 4; q++) c.sphere(cx + (q % 2 === 0 ? -1 : 1) * HB * 0.7, cy + (q < 2 ? -1 : 1) * HB * 0.7, HB, col, a * 0.55, 1);
    });
  }
  if (b <= 0.003) return;
  const t = c.t, breathe = 0.05 * Math.sin(t * 0.9);
  const cols = [0xFFE0464E, 0xFFF08A3C, 0xFFF08A3C, 0xFFE0464E].map(C), pos = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
  for (let q = 0; q < 4; q++) {
    const px0 = pos[q][0] * HB * (0.78 + breathe), py0 = pos[q][1] * HB * (0.78 + breathe);
    for (let s = 0; s < 7; s++) { const an = s * 0.9 + q; c.sphere(px0 + Math.cos(an) * HB * 0.45, py0 + Math.sin(an) * HB * 0.45, HB * 0.55, cols[q], b, 1); }
    const hx = px0 + pos[q][0] * HB * 0.55, hy = py0 + pos[q][1] * HB * 0.2;
    c.rrect(hx - HB * 0.32, hy - HB * 0.1, hx + HB * 0.32, hy + HB * 0.1, HB * 0.08, C(0xFF8A1A10), b);
    c.sphere(hx, hy, HB * 0.12, C(0xFFFFB040), b, 1);
    const ph = Math.sin(t * 0.8 + q * 1.7), off = ph > -0.2 ? 0 : HB * (0.6 + 0.4 * ph);
    const ox = hx + pos[q][0] * (HB * 0.3 + off), oy = hy + pos[q][1] * (HB * 0.35 + off);
    c.sphere(ox - HB * 0.1, oy, HB * 0.14, C(0xFF6EC6FF), b, 1);
    c.sphere(ox + HB * 0.1, oy, HB * 0.14, C(0xFF6EC6FF), b, 1);
  }
  const lb = b * c.band(-8.5, -7.5);
  c.label(S.alphaChain.s, -HB * 1.6, -HB * 1.8, lb, C(0xFFFFD0D0), 11, 0, true);
  c.label(S.betaChain.s, HB * 1.6, -HB * 1.8, lb, C(0xFFFFE0B0), 11, 0, true);
  c.label(S.heme.s, 0, HB * 2.3, lb, C(0xFFFFE6A0), 11, 0, true);
  c.label(S.oxygen.s, c.hwX * 0.55, -c.hwY * 0.6, lb, C(0xFFB8E4FF), 11, 0, true);
}

const HX = -0.012, HY = 0.006;
const HEART_BODY = (() => {
  const n = 64, out = [];
  for (let i = 0; i < n; i++) {
    const th = 2 * Math.PI * i / n, r = 0.052 * (1 + 0.18 * Math.cos(th - 0.9)) * (1 - 0.1 * Math.sin(2 * th));
    const pull = Math.max(0, Math.cos(th - 0.85)) * 0.022;
    out.push(HX + r * Math.cos(th) * 1.05 + pull * Math.cos(0.85), HY + r * Math.sin(th) * 0.92 + pull * Math.sin(0.85));
  }
  return out;
})();
function drawHeart(c, b, a) {
  if (a > 0.003) c.fill(C(0xFF5A1C24), a);
  if (b <= 0.003) return;
  const bb = xray(c, b, -0.66), beat = (c.t * 1.2) % 1;
  const squeeze = (beat < 0.25 ? Math.sin(beat / 0.25 * Math.PI) : 0) * 0.035;
  c.circle(HX, HY - 0.01, 0.1, C(0xFF5A1C24), bb * 0.85);
  c.glow(HX, HY, c.px(0.11), C(0x55FF4050), bb);
  const g = c.g, X = c.sx(HX), Y = c.sy(HY);
  g.save(); g.translate(X, Y); g.scale(1 - squeeze, 1 - squeeze); g.translate(-X, -Y);
  const aorta = [];
  for (let i = 0; i < 10; i++) { const an = Math.PI * (1 - i / 9); aorta.push(HX - 0.004 + Math.cos(an) * 0.022, HY - 0.05 - Math.sin(an) * 0.03); }
  c.polyline(aorta, C(0xFFD8404A), bb, c.px(0.016));
  c.line(HX + 0.012, HY - 0.035, HX + 0.03, HY - 0.07, C(0xFF4A6AD8), bb, c.px(0.014));
  c.line(HX - 0.03, HY - 0.03, HX - 0.034, HY - 0.085, C(0xFF4A6AD8), bb, c.px(0.013));
  c.polyFill(HEART_BODY, null, C(0xFFB8303E), bb);
  const sul = [];
  for (let i = 0; i < 12; i++) { const u = i / 11; sul.push(HX - 0.006 + u * 0.03 + Math.sin(u * 5) * 0.003, HY - 0.035 + u * 0.075); }
  c.polyline(sul, C(0xFFFFE0A0), bb * 0.55, c.px(0.0045));
  c.polyline(sul, C(0xFFE0404A), bb, c.px(0.0022));
  for (let k = 0; k < 5; k++) {
    const i = 2 * (2 + k * 2), x0 = sul[i], y0 = sul[i + 1], dir = k % 2 === 0 ? 1 : -1;
    c.line(x0, y0, x0 + dir * 0.016, y0 + 0.01, C(0xFFE0404A), bb * 0.8, c.px(0.0012));
  }
  c.circle(HX - 0.036, HY - 0.022, 0.017, C(0xFFA42A38), bb);
  c.circle(HX + 0.034, HY - 0.03, 0.014, C(0xFFA42A38), bb);
  c.glow(HX - 0.02, HY - 0.015, c.px(0.02), C(0x44FFFFFF), bb);
  g.restore();
  c.circle(0, 0, 0.0015, C(0xFF8E1E2C), bb * c.band(-2.4, -1.2));
  const lb = bb * c.band(-1.4, -0.4);
  c.label(S.aorta.s, HX - 0.004, HY - 0.085, lb, WHITE, 12, 0, true);
  c.label(S.leftVentricle.s, 0, 0, lb, WHITE, 12, c.dp(22), true);
  c.label(S.rightVentricle.s, HX - 0.03, HY + 0.02, lb, WHITE, 11, 0, true);
  c.label(S.coronary.s, HX + 0.03, HY + 0.05, lb, C(0xFFFFE0A0), 11);
}

const CM_ROW = 2e-5, CM_LEN = 9e-5;
function drawHeartMuscle(c, b, a) {
  if (a > 0.003) c.fill(C(0xFFF4D6DC), a);
  if (b <= 0.003) return;
  const beat = (c.t * 1.2) % 1, sq = 1 - (beat < 0.25 ? Math.sin(beat / 0.25 * Math.PI) : 0) * 0.05;
  const j0 = Math.floor(-c.hwY / CM_ROW) - 1, j1 = Math.floor(c.hwY / CM_ROW) + 1;
  const far = 1 - ramp((2 * c.hwX / CM_LEN + 2) * (j1 - j0 + 1), 900, 1600);
  if (far <= 0.01) return;
  const stripeOn = c.px(2e-6) > 2.5, cell = C(0xFFD8607A), stripe = C(0xFFA83250), disc = C(0xFF5A1030), nuc = C(0xFF4A2A7A), cap = C(0xFFC21E2A);
  const g = c.g;
  for (let j = j0; j <= j1; j++) {
    const yc = j * CM_ROW, shift = hash(j, 0, 931) * CM_LEN;
    const i0 = Math.floor((-c.hwX - shift) / CM_LEN) - 1, i1 = Math.floor((c.hwX - shift) / CM_LEN) + 1;
    for (let i = i0; i <= i1; i++) {
      const x0 = (i * CM_LEN + shift) * sq, x1 = ((i + 1) * CM_LEN + shift) * sq - 1.5e-6;
      const half = CM_ROW * (0.36 + 0.06 * hash(i, j, 932));
      c.rect(x0, yc - half, x1, yc + half, cell, b * far);
      if (stripeOn) for (let x = x0 + 1e-6; x < x1; x += 2e-6 * sq) if (Math.abs(x) < c.hwX + 2e-6) c.line(x, yc - half, x, yc + half, stripe, b * far * 0.55, Math.max(1, c.px(0.6e-6)));
      const steps = [];
      for (let q = 0; q < 6; q++) steps.push(x1 + (q % 2 === 0 ? 0 : 1.5e-6), yc - half + half * 2 * q / 5);
      c.polyline(steps, disc, b * far, Math.max(1, c.px(1e-6)));
      const nx = (x0 + x1) / 2 + (hash(i, j, 933) - 0.5) * 1e-5;
      if (c.px(4e-6) > 1) { c.alpha(b * far); g.fillStyle = nuc.s; g.beginPath(); g.ellipse(c.sx(nx), c.sy(yc), c.px(6e-6), c.px(2.6e-6), 0, 0, 2 * Math.PI); g.fill(); }
    }
    if (hash(j, 1, 934) < 0.6) c.line(-c.hwX * 1.2, yc + CM_ROW / 2, c.hwX * 1.2, yc + CM_ROW / 2, cap, b * far * 0.8, Math.max(1, c.px(3.5e-6)));
  }
  const lb = b * far * c.band(-4.5, -3.5);
  c.label(S.cardiomyocyte.s, 0, 0, lb, WHITE, 12, -c.dp(22), true);
  c.label(S.intercalated.s, c.hwX * 0.45, -CM_ROW, lb, C(0xFF3A0A20), 11, 0, true);
  c.label(S.striations.s, -c.hwX * 0.45, CM_ROW, lb, C(0xFF3A0A20), 11, 0, true);
  c.label(S.stainLike.s, 0, c.hwY * 0.72, lb, C(0xFF5A1030), 11);
}

const THIN_DY = 1.3e-8, HEAD_SP = 1.43e-8;
function drawMyosin(c, b, a) {
  if (a > 0.003) c.fill(C(0xFF16101C), a);
  if (b <= 0.003) return;
  const t = c.t, slide = (t * 1.2e-9) % 5.5e-9;
  for (const side of [-1, 1]) {
    const y = side * THIN_DY, n0 = Math.floor((-c.hwX - 6e-9) / 5.5e-9) - 1, n1 = Math.floor((c.hwX + 6e-9) / 5.5e-9) + 1;
    if (n1 - n0 > 600) { c.line(-c.hwX, y, c.hwX, y, C(0xFF6CC4E0), b, Math.max(1, c.px(7e-9))); continue; }
    for (let n = n0; n <= n1; n++) {
      const x = n * 5.5e-9 - slide * side, tw = Math.sin(n * 0.42);
      c.sphere(x, y - tw * 1.4e-9, 2.6e-9, C(0xFF5AB4D8), b, 1);
      c.sphere(x + 2.75e-9, y + tw * 1.4e-9, 2.6e-9, C(0xFF7FD0EA), b, 1);
    }
  }
  c.rrect(-c.hwX * 1.2, -3.5e-9, c.hwX * 1.2, 3.5e-9, 3.5e-9, C(0xFFE0A040), b);
  c.line(-c.hwX * 1.2, -1.2e-9, c.hwX * 1.2, -1.2e-9, C(0x55FFFFFF), b, Math.max(1, c.px(0.8e-9)));
  const m0 = Math.floor(-c.hwX / HEAD_SP) - 1, m1 = Math.floor(c.hwX / HEAD_SP) + 1;
  if (m1 - m0 < 400) for (let m = m0; m <= m1; m++) for (const side of [-1, 1]) {
    const x0 = m * HEAD_SP + (side > 0 ? HEAD_SP / 2 : 0), ph = (t * 0.7 + hash(m, side, 941)) % 1, dir = x0 > 0 ? -1 : 1;
    const ang = ph < 0.45 ? 0.75 - ph / 0.45 * 0.9 : ph < 0.6 ? -0.15 : -0.15 + (ph - 0.6) / 0.4 * 0.9;
    const attached = ph < 0.45, len = 1e-8, y0 = side * 3.5e-9;
    const hx = x0 + dir * Math.sin(ang) * len * 0.6, hy = y0 + side * Math.cos(ang) * len * (attached ? 0.95 : 0.75);
    c.line(x0, y0, hx, hy, C(0xFFD08A30), b, Math.max(1, c.px(1.6e-9)));
    c.sphere(hx, hy, 2e-9, attached ? C(0xFFFF7A50) : C(0xFFF0B860), b, 1);
    if (!attached && ph < 0.75) c.sphere(hx + 2.4e-9, hy, 0.9e-9, C(0xFFFFF07A), b, 1);
  }
  const lb = b * c.band(-7.9, -6.9);
  c.label(S.myosin.s, -c.hwX * 0.5, 0, lb, C(0xFF3A2000), 12, 0, true);
  c.label(S.actin.s, -c.hwX * 0.5, -THIN_DY, lb, WHITE, 12, -c.dp(22), true);
  c.label(S.atp.s, c.hwX * 0.5, THIN_DY, lb, C(0xFFFFF0A0), 11, c.dp(24), true);
  c.label(S.powerStroke.s, 0, c.hwY * 0.72, lb, C(0xFFFFE6C0), 11);
}

const BX = 0.004, BY = 0.014;
const BrainData = (() => {
  const n = 72, outline = [];
  for (let i = 0; i < n; i++) {
    const th = 2 * Math.PI * i / n, ry = 0.058 * (Math.sin(th) > 0 ? 0.82 : 1);
    outline.push(BX + 0.078 * Math.cos(th) * (1 + 0.06 * Math.cos(2 * th)), BY + ry * Math.sin(th) - 0.004 * Math.cos(th));
  }
  const r = new Rnd(950), gyri = [];
  for (let k = 0; k < 7; k++) {
    const sc = 0.22 + 0.12 * k, waves = 7 + 3 * k, ph = r.next() * 2 * Math.PI, m = 160, pts = [];
    for (let q = 0; q <= m; q++) {
      const th = 2 * Math.PI * q / m, wob = 1 + 0.09 * Math.sin(waves * th + ph) + 0.04 * Math.sin((waves * 2 + 1) * th);
      pts.push(BX + 0.078 * sc * wob * Math.cos(th), BY + 0.058 * sc * wob * (Math.sin(th) > 0 ? 0.82 : 1) * Math.sin(th));
    }
    gyri.push(pts);
  }
  return { outline, gyri };
})();
function drawBrain(c, b, a) {
  if (a > 0.003) c.fill(C(0xFF2E1A2A), a);
  if (b <= 0.003) return;
  const bb = xray(c, b, -0.6);
  c.circle(BX, BY, 0.105, C(0xFF2E1A2A), bb * 0.9);
  c.glow(BX, BY, c.px(0.11), C(0x55FFB0C8), bb);
  c.line(BX + 0.02, BY + 0.04, BX + 0.03, BY + 0.085, C(0xFFE09AA8), bb, c.px(0.014));
  c.circle(BX + 0.05, BY + 0.05, 0.025, C(0xFFE48FA0), bb);
  if (c.px(0.002) > 1.5) for (let k = 0; k < 7; k++) c.ring(BX + 0.05, BY + 0.05, 0.008 + k * 0.0025, C(0xFFB85A72), bb * 0.6, Math.max(1, c.px(0.0008)));
  c.polyFill(BrainData.outline, null, C(0xFFF2A9B8), bb);
  const gw = Math.max(1, c.px(0.0016));
  for (const gy of BrainData.gyri) c.polyline(gy, C(0xFFC0687E), bb * 0.85, gw);
  c.polyline([BX + 0.004, BY - 0.056, BX, BY - 0.03, BX + 0.008, BY - 0.005, BX + 0.002, BY + 0.02], C(0xFF9A3E58), bb, Math.max(1, c.px(0.0024)));
  c.polyline([BX - 0.05, BY + 0.018, BX - 0.02, BY + 0.01, BX + 0.02, BY, BX + 0.045, BY - 0.012], C(0xFF9A3E58), bb, Math.max(1, c.px(0.0026)));
  c.glow(BX - 0.03, BY - 0.03, c.px(0.03), C(0x33FFFFFF), bb);
  c.circle(0, 0, 0.0012, C(0xFF9A3E58), bb * c.band(-2.4, -1.2));
  const lb = bb * c.band(-1.3, -0.3);
  c.label(S.cerebrum.s, BX - 0.045, BY + 0.015, lb, C(0xFF5A1A30), 12, 0, true);
  c.label(S.cerebellum.s, BX + 0.05, BY + 0.05, lb, C(0xFF5A1A30), 11, 0, true);
  c.label(S.brainstem.s, BX + 0.03, BY + 0.085, lb, WHITE, 11, c.dp(10));
  c.label(S.cortex.s, 0, 0, lb, C(0xFF5A1A30), 11, -c.dp(18));
}

const NEU_CELL = 6e-5;
const NeuronData = (() => {
  const r = new Rnd(960), shapes = [];
  function branch(out, x0, y0, an0, len, depth) {
    const pts = []; let x = x0, y = y0, an = an0;
    for (let s = 0; s <= 6; s++) { pts.push(x, y); if (s === 6) break; an += r.gauss() * 0.25; x += Math.cos(an) * len / 6; y += Math.sin(an) * len / 6; }
    out.push(pts);
    if (depth < 3) { const k = r.next() < 0.7 ? 2 : 1; for (let q = 0; q < k; q++) branch(out, x, y, an + (q === 0 ? 0.45 : -0.45) + r.gauss() * 0.2, len * 0.68, depth + 1); }
  }
  for (let s = 0; s < 6; s++) {
    const out = [];
    branch(out, 0, -6e-6, -Math.PI / 2 + r.gauss() * 0.15, 3.2e-5, 0);
    for (let k = 0; k < 4; k++) branch(out, 0, 3e-6, Math.PI / 2 + (k - 1.5) * 0.7 + r.gauss() * 0.2, 1.6e-5, 1);
    const ax = []; let x = 0, y = 6e-6, an = Math.PI / 2 + r.gauss() * 0.1;
    for (let q = 0; q < 12; q++) { ax.push(x, y); an += r.gauss() * 0.08; x += Math.cos(an) * 7e-6; y += Math.sin(an) * 7e-6; }
    out.push(ax); shapes.push(out);
  }
  return shapes;
})();
function drawNeurons(c, b, a) {
  if (a > 0.003) {
    c.fill(C(0xFFE6C27E), a);
    const dot = C(0xFFD2A860);
    c.grid(3e-5, 2500, (i, j, x, y) => c.circle(x + 3e-5 * hash(i, j, 961), y + 3e-5 * hash(i, j, 962), 2.5e-6, dot, a * 0.5, 1));
  }
  if (b <= 0.003) return;
  const far = 1 - ramp((2 * c.hwX / NEU_CELL + 2) * (2 * c.hwY / NEU_CELL + 2), 1600, 2600), ink = C(0xFF241408), g = c.g;
  if (far > 0.01) c.grid(NEU_CELL, 2600, (i, j, x, y) => {
    if (hash(i, j, 963) > 0.6) return;
    const cx = x + NEU_CELL * (0.2 + 0.6 * hash(i, j, 964)), cy = y + NEU_CELL * (0.2 + 0.6 * hash(i, j, 965));
    const sh = NeuronData[Math.min(5, Math.floor(hash(i, j, 966) * 6))], sc = 0.8 + 0.5 * hash(i, j, 967);
    sh.forEach((br, n) => c.polyline(br.map((v, q) => q % 2 === 0 ? cx + v * sc : cy + v * sc), ink, b * far, Math.max(1.2, c.px(n === 0 ? 2.2e-6 : 1.2e-6))));
    const s = c.px(5e-6 * sc);
    if (s > 0.8) { const X = c.sx(cx), Y = c.sy(cy); c.alpha(b * far); g.fillStyle = ink.s; g.beginPath(); g.moveTo(X, Y - s * 1.4); g.lineTo(X + s, Y + s * 0.8); g.lineTo(X - s, Y + s * 0.8); g.closePath(); g.fill(); }
  });
  c.polyline([-c.hwX * 1.2, 2e-6, -3e-5, 1e-6, 0, 0, 3e-5, -2e-6, c.hwX * 1.2, -3e-6], ink, b, Math.max(1.2, c.px(1.6e-6)));
  for (let q = -6; q <= 6; q++) { const x = q * 7e-6 + 2e-6; c.line(x, 0, x + 1e-6, -2.4e-6, ink, b, Math.max(1, c.px(0.5e-6))); c.circle(x + 1e-6, -2.6e-6, 0.7e-6, ink, b, 1); }
  const lb = b * c.band(-4.2, -3.2);
  c.label(S.soma.s, -c.hwX * 0.5, -c.hwY * 0.4, lb * far, C(0xFF3A2008), 11, 0, true);
  c.label(S.dendrite.s, 0, 0, lb, C(0xFF3A2008), 12, c.dp(20), true);
  c.label(S.golgiLike.s, 0, c.hwY * 0.72, lb, C(0xFF5A3A10), 11);
}

const CLEFT = 1e-8;
const SynVesicles = (() => { const r = new Rnd(970), v = []; for (let n = 0; n < 34; n++) v.push((r.next() - 0.5) * 5e-7, -CLEFT - 2.4e-8 - r.next() * 2.4e-7); return v; })();
function drawSynapse(c, b, a) {
  if (a > 0.003) c.fill(C(0xFF1C2232), a);
  if (b <= 0.003) return;
  const W = c.hwX * 1.2, H = c.hwY * 1.2, t = c.t;
  c.rect(-W, -H, W, -CLEFT, C(0xFF3A4A66), b);
  c.rect(-W, CLEFT, W, H, C(0xFF4A3A5A), b);
  c.line(-W, -CLEFT, W, -CLEFT, C(0xFF9AB4E0), b, Math.max(1.5, c.px(4e-9)));
  c.line(-W, CLEFT, W, CLEFT, C(0xFFC8A0E0), b, Math.max(1.5, c.px(4e-9)));
  c.rect(-1.6e-7, CLEFT, 1.6e-7, CLEFT + 3e-8, C(0xFF2A1A3A), b * 0.8);
  const mx = -2.4e-7, my = -2.8e-7, g = c.g;
  if (c.visible(mx, my, c.px(1.4e-7))) {
    c.alpha(b); g.fillStyle = C(0xFF6A5A3A).s; g.beginPath(); g.ellipse(c.sx(mx), c.sy(my), c.px(1.4e-7), c.px(6e-8), 0, 0, 2 * Math.PI); g.fill();
    for (let q = -3; q <= 3; q++) c.line(mx + q * 3.5e-8, my - 4.5e-8, mx + q * 3.5e-8 + 1e-8, my + 4.5e-8, C(0xFFB8A070), b * 0.8, Math.max(1, c.px(6e-9)));
  }
  const vr = 2e-8;
  for (let n = 0; n < SynVesicles.length; n += 2) {
    const x = SynVesicles[n], y = SynVesicles[n + 1];
    if (Math.abs(x - mx) < 1.6e-7 && Math.abs(y - my) < 8e-8) continue;
    c.ring(x, y, vr, C(0xFFCFE0FF), b, Math.max(1, c.px(4e-9)));
    c.circle(x, y, vr * 0.75, C(0xFF5A6A8A), b);
  }
  const cyc = (t * 0.5) % 1, fx = -6e-8, dock = ramp(cyc, 0, 0.25);
  if (cyc < 0.3) c.ring(fx, -CLEFT - vr - 4e-8 * (1 - dock), vr, C(0xFFFFF0A0), b, Math.max(1, c.px(4e-9)));
  if (cyc > 0.25) {
    const u = (cyc - 0.25) / 0.75;
    for (let q = 0; q < 14; q++) {
      const an = q * 0.45 + 0.3;
      c.circle(fx + Math.cos(an) * 1.4e-7 * u * hash(q, 1, 971), -CLEFT + 2 * CLEFT * Math.min(1, u * 1.4) * (0.6 + 0.4 * hash(q, 2, 972)), 3e-9, C(0xFFFFE04A), b * (1 - u * 0.6), 1.5);
    }
  }
  for (let q = -4; q <= 4; q++) { const x = q * 3.4e-8; c.rrect(x - 7e-9, CLEFT - 1e-8, x + 7e-9, CLEFT + 1.4e-8, 4e-9, C(0xFF3FCCA0), b); }
  const lb = b * c.band(-6.6, -5.6);
  c.label(S.vesicles.s, 1.2e-7, -1.6e-7, lb, WHITE, 12, 0, true);
  c.label(S.cleft.s, c.hwX * 0.55, 0, lb, C(0xFFFFE6A0), 11, 0, true);
  c.label(S.receptors.s, 0, CLEFT + 1.4e-8, lb, C(0xFFB8FFE6), 11, c.dp(16), true);
  c.label(S.mitochondrion.s, mx, my, lb, C(0xFFFFF0C8), 11, -c.px(6e-8) - c.dp(12));
  c.label(S.emLike.s, 0, c.hwY * 0.75, lb, C(0xFFE0E8F8), 11);
}

// ── 1.10.0 신체 갈래: 💇 머리카락 · 🦷 치아 (앱 BodyScenes3.kt 와 같은 그림) ──
const FOL = 7e-4, HAIR_W = 7e-5;
function hairPath(i, j, x0, y0) {
  const n = 10, len = 6e-3 + 4e-3 * hash(i, j, 1003), an0 = -0.25 + (hash(i, j, 1004) - 0.5) * 0.5, curl = (hash(i, j, 1005) - 0.5) * 0.25, pts = [];
  for (let q = 0; q < n; q++) { const u = q / (n - 1), an = an0 + curl * u * 4; pts.push(x0 + Math.cos(an) * len * u, y0 + Math.sin(an) * len * u + Math.sin(u * 6 + i) * 2e-4); }
  return pts;
}
function drawHair(c, b, a) {
  if (a > 0.003) {
    c.fill(C(0xFFE6B596), a);
    const col = C(0xFFD69A7A), w = Math.max(1, c.px(2e-5));
    c.grid(1.2e-3, 1500, (i, j, x, y) => { const an = hash(i, j, 1001) * Math.PI; c.line(x, y, x + Math.cos(an) * 9e-4, y + Math.sin(an) * 9e-4, col, a * 0.5, w); });
  }
  if (b <= 0.003) return;
  const bb = xray(c, b, -1.82), far = 1 - ramp((2 * c.hwX / FOL + 2) * (2 * c.hwY / FOL + 2), 3000, 5000);
  const hw = Math.max(1, c.px(HAIR_W)), dark = C(0xFF2E1C10), shine = C(0xFF8A6040), root = C(0xFF8A5040);
  if (far > 0.01) c.grid(FOL, 5000, (i, j, x, y) => {
    if (i === 0 && j === 0) return;
    const fx = x + FOL * hash(i, j, 1006), fy = y + FOL * hash(i, j, 1007);
    if (hash(i, j, 1008) > 0.55 || (Math.abs(fy) < 2.2e-4 && fx > -1e-3)) return;
    const pts = hairPath(i, j, fx, fy);
    c.polyline(pts, dark, bb * far, hw);
    if (hw > 3) c.polyline(pts, shine, bb * far * 0.5, hw * 0.3);
    c.circle(fx, fy, HAIR_W * 1.6, root, bb * far * 0.7, 1);
  });
  c.line(-1.5e-3, 0, c.hwX * 1.2, 0, dark, bb, hw);
  if (hw > 3) c.line(-1.5e-3, -HAIR_W * 0.2, c.hwX * 1.2, -HAIR_W * 0.2, shine, bb * 0.6, hw * 0.3);
  c.circle(-1.5e-3, 0, HAIR_W * 1.8, root, bb, 1);
  const lb = bb * c.band(-2.3, -1.3);
  c.label(S.follicle.s, -1.5e-3, 0, lb, C(0xFF4A2010), 11, c.dp(20), true);
  c.label(S.hairShaft.s, c.hwX * 0.4, 0, lb, C(0xFF2A1408), 12, -c.dp(16), true);
  c.label(S.scalp.s, -c.hwX * 0.5, c.hwY * 0.55, lb, C(0xFF6A3A28), 11, 0, true);
}

const SHAFT_R = 3.5e-5, SCALE_P = 7e-6;
function drawCuticle(c, b, a) {
  if (a > 0.003) c.fill(C(0xFF16161A), a);
  if (b <= 0.003) return;
  const far = c.hwX * 1.2, g = c.g, top = c.sy(-SHAFT_R), bot = c.sy(SHAFT_R);
  const gr = g.createLinearGradient(0, top, 0, bot);
  [[0, 0xFF5A5A5E], [0.25, 0xFFC8C8CC], [0.55, 0xFF9A9AA0], [1, 0xFF3A3A40]].forEach(([p, col]) => gr.addColorStop(p, C(col).s));
  c.alpha(b); g.fillStyle = gr; g.fillRect(0, top, c.w, bot - top);
  const m0 = Math.floor(-far / SCALE_P) - 1, m1 = Math.floor(far / SCALE_P) + 1;
  if (m1 - m0 < 900) for (let m = m0; m <= m1; m++) {
    const x0 = m * SCALE_P + (hash(m, 0, 1011) - 0.5) * SCALE_P * 0.4, n = 12, pts = [], pts2 = [];
    for (let q = 0; q < n; q++) {
      const u = q / (n - 1) * 2 - 1, bulge = (1 - u * u) * SCALE_P * (0.5 + 0.4 * hash(m, q, 1012));
      pts.push(x0 + bulge, u * SHAFT_R * 0.98); pts2.push(x0 + bulge - 8e-7, u * SHAFT_R * 0.98);
    }
    c.polyline(pts, C(0xFFEDEDF2), b * 0.85, Math.max(1, c.px(6e-7)));
    c.polyline(pts2, C(0xFF2A2A30), b * 0.6, Math.max(1, c.px(8e-7)));
  }
  const lb = b * c.band(-4.4, -3.4);
  c.label(S.cuticle.s, 0, -SHAFT_R, lb, WHITE, 12, -c.dp(18), true);
  c.label(S.hairWidth.s, 0, SHAFT_R, lb, C(0xFFE0E0E8), 11, c.dp(18));
  c.label(S.semLike.s, 0, c.hwY * 0.75, lb, C(0xFFD0D0D8), 11);
}

const COIL_R = 5e-10, COIL_P = 1.4e-8;
function coil(c, y0, alpha, phase, main) {
  const step = 1.5e-10, n0 = Math.floor(-c.hwX * 1.2 / step), n1 = Math.floor(c.hwX * 1.2 / step);
  if (n1 - n0 > 1200) { c.line(-c.hwX, y0, c.hwX, y0, C(0xFFB07AD8), alpha, Math.max(1, c.px(2e-9))); return; }
  const cols = [C(0xFFC084F0), C(0xFF6CC8E8)], rings = [C(0xFFE6C8FF), C(0xFFC8F0FF)];
  for (let strand = 0; strand <= 1; strand++) {
    const pts = [];
    for (let n = n0; n <= n1; n++) { const x = n * step; pts.push(x, y0 + Math.sin(2 * Math.PI * x / COIL_P + phase + strand * Math.PI) * COIL_R * 1.6); }
    c.polyline(pts, cols[strand], alpha, Math.max(1.5, c.px(4.5e-10)));
    if (main && c.px(1e-10) > 1.5) for (let x = n0 * step; x < n1 * step; x += 5.4e-10) c.ring(x, y0 + Math.sin(2 * Math.PI * x / COIL_P + phase + strand * Math.PI) * COIL_R * 1.6, 2.3e-10, rings[strand], alpha * 0.6, Math.max(1, c.px(5e-11)));
  }
}
function drawKeratin(c, b, a) {
  if (a > 0.003) { c.fill(C(0xFF16101C), a); for (const k of [-3, -2, -1, 1, 2, 3]) coil(c, k * 4.5e-9, a * 0.35, k * 1.3, false); }
  if (b <= 0.003) return;
  coil(c, 0, b, c.t * 0.15, true);
  for (let q = -6; q <= 6; q++) {
    const x = q * 3.1e-9 + 0.8e-9, side = q % 2 === 0 ? 1 : -1;
    c.line(x, side * 1e-9, x, side * 3.4e-9, C(0xFFFFD84A), b * 0.9, Math.max(1, c.px(1.5e-10)));
    c.sphere(x, side * 1e-9, 1.8e-10, C(0xFFFFE070), b, 1); c.sphere(x, side * 3.4e-9, 1.8e-10, C(0xFFFFE070), b, 1);
  }
  const lb = b * c.band(-8.2, -7.2);
  c.label(S.coiledCoil.s, 0, -COIL_R * 2, lb, C(0xFFE6D0FF), 12, -c.dp(20), true);
  c.label(S.disulfide.s, 0.8e-9, 3.4e-9, lb, C(0xFFFFF0A0), 11, c.dp(18), true);
  c.label(S.permNote.s, 0, c.hwY * 0.72, lb, C(0xFFE0D8F0), 11);
}

const TOY = 0.0072;
const ENAMEL = [-0.0056, -0.0010, -0.0060, -0.0050, -0.0045, -0.0080, -0.0030, -0.0074, -0.0012, -0.0086, 0.0005, -0.0076, 0.0022, -0.0087, 0.0040, -0.0079, 0.0058, -0.0052, 0.0055, -0.0010, 0.0045, 0.0008, -0.0046, 0.0008];
const DENTIN = [-0.0040, -0.0030, -0.0032, -0.0060, -0.0015, -0.0066, 0.0005, -0.0060, 0.0022, -0.0068, 0.0038, -0.0058, 0.0042, -0.0030, 0.0050, -0.0005, 0.0047, 0.0030, 0.0040, 0.0080, 0.0030, 0.0125, 0.0022, 0.0128, 0.0016, 0.0080, 0.0010, 0.0035, -0.0010, 0.0035, -0.0016, 0.0080, -0.0024, 0.0128, -0.0032, 0.0125, -0.0042, 0.0080, -0.0048, 0.0030, -0.0051, -0.0005];
const PULP = [-0.0022, -0.0018, -0.0016, -0.0040, -0.0006, -0.0030, 0.0006, -0.0030, 0.0016, -0.0042, 0.0023, -0.0018, 0.0024, 0.0012, -0.0024, 0.0012];
const shiftY = (arr, dy) => arr.map((v, i) => i % 2 === 0 ? v : v + dy);
function drawTooth(c, b, a) {
  if (a > 0.003) c.fill(C(0xFF4A1C24), a);
  if (b <= 0.003) return;
  const bb = xray(c, b, -1.6), g = c.g, X = c.sx(0), Y = c.sy(0);
  g.save(); g.translate(X, Y); g.scale(1, -1); g.translate(-X, -Y);
  c.glow(0, TOY, c.px(0.016), C(0x55FFF0E0), bb);
  c.rrect(-0.014, TOY - 0.0003, 0.014, TOY + 0.02, 0.003, C(0xFFE88A96), bb);
  c.rect(-0.014, TOY + 0.0035, 0.014, TOY + 0.02, C(0xFFE8DCC6), bb);
  if (c.px(2e-4) > 1) c.grid(1.2e-3, 1200, (i, j, x, y) => {
    if (y < TOY + 0.0035 || y > TOY + 0.019 || Math.abs(x) > 0.0135) return;
    c.circle(x + 1.2e-3 * hash(i, j, 1021), y + 1.2e-3 * hash(i, j, 1022), 3e-4 * (0.5 + hash(i, j, 1023)), C(0xFFC8B89A), bb * 0.8);
  });
  c.polyFill(shiftY(ENAMEL, TOY), null, C(0xFFF6F2E8), bb);
  c.polyFill(shiftY(DENTIN, TOY), null, C(0xFFE8D2A0), bb);
  if (c.px(1e-3) > 6) for (let k = 0; k < 40; k++) {
    const an = -Math.PI + Math.PI * k / 39, x0 = Math.cos(an) * 0.0016, y0 = TOY - 0.0012 + Math.sin(an) * 0.0016;
    c.line(x0, y0, x0 + Math.cos(an) * 0.0022, y0 + Math.sin(an) * 0.0022, C(0xFFD0B47A), bb * 0.6, Math.max(1, c.px(4e-5)));
  }
  c.polyFill(shiftY(PULP, TOY), null, C(0xFFE05A6A), bb);
  c.line(-0.0019, TOY + 0.001, -0.0028, TOY + 0.0122, C(0xFFE05A6A), bb, c.px(6e-4));
  c.line(0.0019, TOY + 0.001, 0.0026, TOY + 0.0122, C(0xFFE05A6A), bb, c.px(6e-4));
  c.line(-0.0021, TOY, -0.0027, TOY + 0.011, C(0xFFFFE070), bb * 0.8, Math.max(1, c.px(1.5e-4)));
  c.line(0.0021, TOY, 0.0025, TOY + 0.011, C(0xFFB0202C), bb * 0.8, Math.max(1, c.px(1.5e-4)));
  g.restore();
  c.circle(0, 0, 2.5e-4, C(0xFFDCD6C8), bb * c.band(-3.2, -2.0));
  const lb = bb * c.band(-2.1, -1.1);
  c.label(S.enamel.s, 0, 0, lb, C(0xFF5A4A30), 12, c.dp(16), true);
  c.label(S.dentin.s, -0.0035, -(TOY - 0.0035), lb, C(0xFF6A4A10), 11, 0, true);
  c.label(S.pulp.s, 0, -(TOY - 0.0005), lb, WHITE, 11, 0, true);
  c.label(S.gum.s, -0.0095, -(TOY + 0.0015), lb, C(0xFF7A1A30), 11, 0, true);
  c.label(S.jawBone.s, 0.009, -(TOY + 0.012), lb, C(0xFF6A5A3A), 11, 0, true);
}

const ROD = 5.5e-6;
function drawEnamelRods(c, b, a) {
  if (a > 0.003) c.fill(C(0xFFE8E0CC), a);
  if (b <= 0.003) return;
  const rowH = ROD * 0.9, far = 1 - ramp((2 * c.hwX / ROD + 3) * (2 * c.hwY / rowH + 3), 3000, 5000);
  if (far <= 0.01) return;
  const j0 = Math.floor(-c.hwY / rowH) - 1, j1 = Math.floor(c.hwY / rowH) + 1, i0 = Math.floor(-c.hwX / ROD) - 2, i1 = Math.floor(c.hwX / ROD) + 2;
  const edge = C(0xFF9A8E74), head = C(0xFFF4EEDC), tex = C(0xFFC8BC9E), tailCol = C(0xFFE2D8BE), rr = ROD * 0.42;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const x = i * ROD + ((j & 1) === 1 ? ROD / 2 : 0) + (hash(i, j, 1031) - 0.5) * ROD * 0.08, y = j * rowH;
    if (!c.visible(x, y, c.px(ROD))) continue;
    c.polyFill([x - rr * 0.7, y + rr * 0.5, x, y + rr * 2, x + rr * 0.7, y + rr * 0.5], null, tailCol, b * far);
    c.circle(x, y, rr, head, b * far);
    const arc = [];
    for (let q = 0; q <= 16; q++) { const th = Math.PI * 0.15 + Math.PI * 1.7 * q / 16 + Math.PI / 2; arc.push(x + Math.cos(th) * rr, y + Math.sin(th) * rr); }
    c.polyline(arc, edge, b * far, Math.max(1, c.px(ROD * 0.06)));
    if (c.px(rr) > 12) for (let q = 0; q < 6; q++) { const yy = y - rr * 0.6 + q * rr * 0.24; c.line(x - rr * 0.5, yy, x + rr * 0.5, yy - rr * 0.15, tex, b * far * 0.6, Math.max(1, c.px(ROD * 0.02))); }
  }
  const lb = b * far * c.band(-5.0, -4.0);
  c.label(S.enamelRod.s, 0, 0, lb, C(0xFF4A3A20), 12, -c.dp(20), true);
  c.label(S.semLike.s, 0, c.hwY * 0.72, lb, C(0xFF4A3A20), 11);
}

const HA_A = 9.4e-10, XTAL_W = 6e-9;
function drawApatite(c, b, a) {
  if (a > 0.003) {
    c.fill(C(0xFF14181E), a);
    for (let k = -6; k <= 6; k++) {
      if (k === 0) continue;
      const x0 = k * XTAL_W * 2.2 + (hash(k, 0, 1041) - 0.5) * 2e-9;
      c.rrect(x0 - XTAL_W, -c.hwY * 1.3, x0 + XTAL_W, c.hwY * 1.3, XTAL_W * 0.5, C(0xFF3A4652), a * 0.9);
      c.line(x0 - XTAL_W * 0.3, -c.hwY * 1.3, x0 - XTAL_W * 0.3, c.hwY * 1.3, C(0x334FD0FF), a, Math.max(1, c.px(4e-10)));
    }
  }
  if (b <= 0.003) return;
  c.rrect(-XTAL_W, -c.hwY * 1.3, XTAL_W, c.hwY * 1.3, XTAL_W * 0.4, C(0xFF243440), b);
  const i0 = Math.floor(-XTAL_W / HA_A), i1 = Math.floor(XTAL_W / HA_A), rowH = HA_A * 0.866;
  const j0 = Math.floor(-c.hwY / rowH) - 1, j1 = Math.floor(c.hwY / rowH) + 1;
  const detail = 1 - ramp((i1 - i0 + 1) * (j1 - j0 + 1), 900, 1600);
  const oh = C(0xFFFF6A5A), fl = C(0xFF7FE6FF), ca = C(0xFF7ED67A), po = C(0xFFFFA840);
  if (detail > 0.01) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const x = i * HA_A + ((j & 1) === 1 ? HA_A / 2 : 0), y = j * rowH;
    if (Math.abs(x) > XTAL_W - 2e-10) continue;
    c.sphere(x, y, 1.4e-10, i === 0 && j === 0 ? fl : oh, b * detail, 1);
    c.sphere(x + HA_A * 0.33, y - rowH * 0.3, 1.6e-10, ca, b * detail, 1);
    c.sphere(x - HA_A * 0.33, y + rowH * 0.3, 1.6e-10, ca, b * detail, 1);
    c.sphere(x + HA_A * 0.2, y + rowH * 0.35, 1.5e-10, po, b * detail, 1);
  }
  for (let n = 0; n < 10; n++) {
    const u = (c.t * 0.12 + n * 0.1) % 1, y = -c.hwY + u * 2 * c.hwY, x = XTAL_W + 2e-9 + hash(n, 1, 1042) * 6e-9 * (1 - u * 0.6);
    c.sphere(x, y, 1.2e-10, C(0xFFFFF07A), b * 0.8, 1.5);
  }
  const lb = b * c.band(-8.0, -7.0);
  c.label(S.calcium.s, -XTAL_W * 1.6, -c.hwY * 0.45, lb, C(0xFFB8F0B0), 11, 0, true);
  c.label(S.phosphate.s, -XTAL_W * 1.6, -c.hwY * 0.3, lb, C(0xFFFFD0A0), 11, 0, true);
  c.label(S.hydroxide.s, -XTAL_W * 1.6, -c.hwY * 0.15, lb, C(0xFFFFB8B0), 11, 0, true);
  c.label(S.fluoride.s, 0, 0, lb, C(0xFFB8F4FF), 12, c.dp(22), true);
  c.label(S.acid.s, XTAL_W + 5e-9, c.hwY * 0.45, lb, C(0xFFFFF0A0), 11, 0, true);
}
