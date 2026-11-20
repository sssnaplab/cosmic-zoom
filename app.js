// 코스믹 줌 웹 데모: 상태(ZoomState.kt)와 화면 UI.
"use strict";

const CONFIG = {
  // 정식 출시 후 true 로 바꾸면 버튼이 Play 스토어로 바로 간다
  launched: false,
  play: "https://play.google.com/store/apps/details?id=com.sssnaplab.cosmiczoom&referrer=utm_source%3Dweb%26utm_medium%3Ddemo%26utm_campaign%3Dlaunch",
  landing: "./",
};

// 웹에만 있는 문구
const W = {
  intro: L(
    "The center of the screen is YOU.\n\n🖱️ Scroll the mouse wheel, pinch on a trackpad or phone, or drag up and down.\n⬆️ Zoom in → hand, cells, atoms, all the way to quarks!\n⬇️ Zoom out → your city, Earth, galaxies, the edge of the universe!\n\nOr just press 🚀 / 🔬 and enjoy the ride.\n🎓 High school or university student? Tap 🎓 Deep on the info card for the real science.",
    "지금 화면 가운데는 바로 '나'예요.\n\n🖱️ 마우스 휠을 굴리거나, 트랙패드·휴대폰에서 두 손가락으로 벌리고 오므리거나, 위아래로 끌어 보세요.\n⬆️ 확대 → 손, 세포, 원자, 쿼크까지!\n⬇️ 축소 → 우리 도시, 지구, 은하, 우주 끝까지!\n\n🚀 / 🔬 버튼을 누르면 저절로 여행해요.\n🎓 고등학생·대학생은 설명 카드의 🎓 심화를 눌러 이론까지 살펴보세요.",
    "画面のまん中は「あなた」です。\n\n🖱️ マウスホイール、トラックパッドやスマホの2本指、または上下ドラッグで。\n⬆️ 拡大 → 手、細胞、原子、クォークまで！\n⬇️ 縮小 → 街、地球、銀河、宇宙の果てまで！\n\n🚀 / 🔬 ボタンで自動の旅もできます。\n🎓 高校生・大学生は説明カードの 🎓 くわしく で理論までどうぞ。",
    "屏幕中间就是“你”。\n\n🖱️ 滚动鼠标滚轮，在触控板或手机上双指缩放，或上下拖动。\n⬆️ 放大 → 手、细胞、原子，一直到夸克！\n⬇️ 缩小 → 城市、地球、星系，一直到宇宙尽头！\n\n按 🚀 / 🔬 可以自动旅行。\n🎓 高中生、大学生可点说明卡上的 🎓 深入，看看背后的理论。"),
  getApp: L("📱 Get the app", "📱 앱 받기", "📱 アプリ", "📱 下载应用"),
  appTitle: L("More in the app", "앱에서 더 많이", "アプリではもっと", "应用里还有更多"),
  appBody: L(
    "🎯 Missions: find a hidden size as fast as you can\n📖 Size Book: collect all 22 sizes\n📵 No ads · no sign-up · no internet permission",
    "🎯 미션: 숨은 크기를 빨리 찾아 별 모으기\n📖 크기 도감: 22단계 모두 모으기\n📵 광고 없음 · 회원가입 없음 · 인터넷 권한 없음",
    "🎯 ミッション：かくれた大きさを早く見つけて星を集めよう\n📖 サイズ図鑑：22段階ぜんぶ集めよう\n📵 広告なし・登録なし・インターネット権限なし",
    "🎯 任务：尽快找到隐藏的尺寸，收集星星\n📖 尺寸图鉴：集齐全部22个层级\n📵 无广告 · 无需注册 · 无网络权限"),
  soon: L("Coming to Google Play in December 2026", "Google Play 2026년 12월 출시 예정", "Google Play で2026年12月公開予定", "将于2026年12月在 Google Play 上线"),
  onPlay: L("Get it on Google Play", "Google Play 에서 받기", "Google Play で入手", "在 Google Play 获取"),
  about: L("About the app", "앱 소개", "アプリについて", "了解应用"),
  tapToPlay: L("Tap to try it yourself", "눌러서 직접 해 보기", "タップして自分で操作", "点击亲自试试"),
  lang: L("Language", "언어", "言語", "语言"),
};

const START_LEVEL = LEVELS.findIndex(l => l.emoji === "🧒");
const MAX_LOG = LEVELS[0].logS + 0.6;
const MIN_LOG = LEVELS[LEVELS.length - 1].logS - 0.5;
function currentLevel(logW) { let cur = 0; LEVELS.forEach((l, i) => { if (logW < l.logS + 0.3) cur = i; }); return cur; }
function fracIndex(logW) {
  const n = LEVELS.length;
  if (logW >= LEVELS[0].logS) return 0;
  if (logW <= LEVELS[n - 1].logS) return n - 1;
  for (let i = 0; i < n - 1; i++) { const a = LEVELS[i].logS, b = LEVELS[i + 1].logS; if (logW <= a && logW >= b) return i + (a - logW) / (a - b); }
  return 0;
}
function logFromFrac(f) {
  const n = LEVELS.length, c = clamp(f, 0, n - 1), i = Math.min(Math.floor(c), n - 2);
  return LEVELS[i].logS + (LEVELS[i + 1].logS - LEVELS[i].logS) * (c - i);
}

// ── 저장(없어도 동작) ──────────────────────────────────────────────
const store = {
  get(k) { try { return localStorage.getItem("cz." + k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem("cz." + k, v); } catch { /* 사생활 보호 모드 등 */ } },
};

// ── 언어·출발 위치 고르기 ──────────────────────────────────────────
const params = new URLSearchParams(location.search);
const EMBED = params.get("embed") === "1";
function pickLang() {
  const q = params.get("lang") || store.get("lang");
  if (["en", "ko", "ja", "zh"].includes(q)) return q;
  for (const l of navigator.languages || [navigator.language || "en"]) {
    const c = l.slice(0, 2).toLowerCase();
    if (["ko", "ja", "zh"].includes(c)) return c;
    if (c === "en") return "en";
  }
  return "en";
}
function pickPlace(lang) {
  const all = Object.values(PLACES), byId = id => all.find(p => p.id === id);
  const q = byId(params.get("place")) || byId(store.get("place"));
  if (q) return q;
  let tz = "";
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { /* 없음 */ }
  if (tz === "Asia/Seoul" || tz === "Asia/Pyongyang") return PLACES.seoul;
  if (tz === "Asia/Tokyo") return PLACES.tokyo;
  if (/^Asia\/(Shanghai|Chongqing|Harbin|Urumqi|Hong_Kong|Macau|Taipei)$/.test(tz)) return PLACES.shanghai;
  if (tz.startsWith("America/")) return PLACES.newYork;
  if (tz.startsWith("Europe/") || tz.startsWith("Africa/")) return PLACES.london;
  return { ko: PLACES.seoul, ja: PLACES.tokyo, zh: PLACES.shanghai }[lang] || PLACES.newYork;
}
I18N.lang = pickLang();
SESSION.place = pickPlace(I18N.lang);

// ── 상태 ───────────────────────────────────────────────────────────
const st = {
  logW: LEVELS[START_LEVEL].logS + 0.05, time: 0, current: START_LEVEL, settled: true,
  autoDir: 0, touching: false, vel: 0, lastDrag: 0, flyTarget: null, stillTime: 0,
  deep: store.get("deep") === "1",
  discovered: new Set([START_LEVEL]), toast: null, toastTime: 0,
  attract: EMBED, attractWait: 0, attractNext: 1,
};
{
  const l = parseFloat(params.get("logW"));
  if (!isNaN(l)) { st.logW = clamp(l, MIN_LOG, MAX_LOG); st.current = currentLevel(st.logW); }
}
function userAct() {
  if (st.attract) { st.attract = false; st.autoDir = 0; document.body.classList.remove("attract"); }
}
function touchStart() { userAct(); st.touching = true; st.flyTarget = null; st.autoDir = 0; st.vel = 0; }
function drag(delta, now) {
  const before = st.logW;
  st.logW = clamp(st.logW + delta, MIN_LOG, MAX_LOG);
  const dt = clamp(now - st.lastDrag, 1, 100) / 1000;
  if (st.lastDrag !== 0) st.vel = st.vel * 0.6 + (st.logW - before) / dt * 0.4;
  st.lastDrag = now;
}
function touchEnd(now) {
  st.touching = false;
  if (now - st.lastDrag > 90) st.vel = 0;
  st.vel = clamp(st.vel, -12, 12);
  st.lastDrag = 0;
}
function nudge(d) { userAct(); st.flyTarget = null; st.autoDir = 0; st.vel = 0; st.logW = clamp(st.logW + d, MIN_LOG, MAX_LOG); st.stillTime = 0; }
function flyTo(i) { userAct(); st.flyTarget = LEVELS[i].logS; st.autoDir = 0; st.vel = 0; }
function setFromLadder(f) { userAct(); st.flyTarget = null; st.autoDir = 0; st.vel = 0; st.logW = logFromFrac(f); }
function toggleAuto(dir) { userAct(); st.autoDir = st.autoDir === dir ? 0 : dir; st.flyTarget = null; st.vel = 0; }

function step(dt) {
  st.time += dt;
  const before = st.logW;
  if (!st.touching) {
    if (st.flyTarget != null) {
      const d = st.flyTarget - st.logW;
      if (Math.abs(d) < 0.004) { st.logW = st.flyTarget; st.flyTarget = null; } else {
        const sv = clamp(d * 3.2, -8, 8) * dt;
        st.logW += Math.abs(sv) > Math.abs(d) ? d : sv;
      }
    } else if (st.autoDir !== 0) {
      st.logW += st.autoDir * 1.35 * dt;
      if (st.logW >= MAX_LOG - 0.3 || st.logW <= MIN_LOG + 0.3) st.autoDir = 0;
    } else if (Math.abs(st.vel) > 0.02) {
      st.logW += st.vel * dt; st.vel *= Math.exp(-3.2 * dt);
    } else st.vel = 0;
    st.logW = clamp(st.logW, MIN_LOG, MAX_LOG);
  }
  // 소개 영상처럼 저절로 왕복(삽입 모드에서 아무도 안 만질 때)
  if (st.attract && st.autoDir === 0 && st.flyTarget == null) {
    st.attractWait += dt;
    if (st.attractWait > 2.2) { st.autoDir = st.attractNext; st.attractNext = -st.attractNext; st.attractWait = 0; }
  }
  const moved = Math.abs(st.logW - before) > 0.0012;
  st.stillTime = moved || st.touching ? 0 : st.stillTime + dt;
  st.settled = st.stillTime > 0.35;
  st.current = currentLevel(st.logW);
  const near = Math.abs(st.logW - LEVELS[st.current].logS) < 0.6;
  if (st.settled && near && !st.discovered.has(st.current)) {
    st.discovered.add(st.current);
    if (!st.attract) { st.toast = st.current; st.toastTime = 0; }
  }
  if (st.toast != null) { st.toastTime += dt; if (st.toastTime > 2.6) st.toast = null; }
}

// ── 화면 ───────────────────────────────────────────────────────────
const $ = s => document.querySelector(s);
const canvas = $("#sky"), g = canvas.getContext("2d");
let W_PX = 0, H_PX = 0, DPR = 1;
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2.5);
  W_PX = Math.round(innerWidth * DPR); H_PX = Math.round(innerHeight * DPR);
  canvas.width = W_PX; canvas.height = H_PX;
}
/** 가로로 넓은 화면에서는 세로에 맞춰 같은 크기가 보이게 한다 */
function refPx() { return Math.min(W_PX, H_PX * 0.8); }
addEventListener("resize", resize);
resize();

const ui = {
  title: $("#title-name"), sub: $("#title-sub"), fact: $("#fact"), factHead: $("#fact-head"), factBody: $("#fact-body"),
  toast: $("#toast"), ladder: $("#ladder"), knob: $("#ladder-knob"), btnSpace: $("#btn-space"), btnQuark: $("#btn-quark"),
  btnApp: $("#btn-app"), place: $("#place"), lang: $("#lang"), deepChip: $("#deep-chip"),
};

function buildLadder() {
  ui.ladder.querySelectorAll(".rung").forEach(e => e.remove());
  LEVELS.forEach((lv, i) => {
    const b = document.createElement("button");
    b.className = "rung"; b.textContent = lv.emoji; b.title = lv.name;
    b.style.top = (i / (LEVELS.length - 1) * 100) + "%";
    b.addEventListener("click", e => { e.stopPropagation(); flyTo(i); });
    ui.ladder.appendChild(b);
  });
}
{
  let dragging = false;
  const fracAt = e => { const r = ui.ladder.getBoundingClientRect(); return (e.clientY - r.top) / r.height * (LEVELS.length - 1); };
  ui.ladder.addEventListener("pointerdown", e => {
    if (e.target.classList.contains("rung")) return;
    dragging = true; ui.ladder.setPointerCapture(e.pointerId); setFromLadder(fracAt(e));
  });
  ui.ladder.addEventListener("pointermove", e => { if (dragging) setFromLadder(fracAt(e)); });
  ui.ladder.addEventListener("pointerup", () => { dragging = false; });
}

function buildMenus() {
  ui.place.innerHTML = "";
  for (const p of Object.values(PLACES)) {
    const o = document.createElement("option");
    o.value = p.id; o.textContent = `📍 ${p.emoji} ${p.cityName.s}`; o.selected = p === SESSION.place;
    ui.place.appendChild(o);
  }
  ui.lang.value = I18N.lang;
}
ui.place.addEventListener("change", () => {
  SESSION.place = Object.values(PLACES).find(p => p.id === ui.place.value);
  store.set("place", SESSION.place.id);
});
ui.lang.addEventListener("change", () => { I18N.lang = ui.lang.value; store.set("lang", I18N.lang); applyLang(); });

function applyLang() {
  document.documentElement.lang = I18N.lang;
  document.title = U.appName.s + " — " + ({ en: "web demo", ko: "웹 체험판", ja: "Web体験版", zh: "网页体验版" })[I18N.lang];
  $("#intro-title").textContent = U.appName.s;
  $("#intro-body").textContent = W.intro.s;
  $("#intro-go").textContent = U.go.s;
  $("#app-title").textContent = W.appTitle.s;
  $("#app-body").textContent = W.appBody.s;
  $("#app-play").textContent = CONFIG.launched ? W.onPlay.s : W.soon.s;
  $("#app-play").toggleAttribute("aria-disabled", !CONFIG.launched);
  $("#app-about").textContent = W.about.s;
  $("#app-close").textContent = U.close.s;
  $("#embed-hint").textContent = W.tapToPlay.s;
  ui.btnApp.textContent = W.getApp.s;
  ui.lang.title = W.lang.s;
  buildLadder(); buildMenus();
  lastTitle = "";
  if (typeof renderChip === "function") renderChip();
  if ($("#deep").open) openDeep(deepUi.idx);
}

$("#btn-space").addEventListener("click", () => toggleAuto(1));
$("#btn-quark").addEventListener("click", () => toggleAuto(-1));
ui.btnApp.addEventListener("click", () => { userAct(); $("#app-sheet").showModal(); });
$("#app-close").addEventListener("click", () => $("#app-sheet").close());
$("#app-play").addEventListener("click", e => { if (!CONFIG.launched) e.preventDefault(); });
$("#app-play").href = CONFIG.play;
$("#app-about").href = CONFIG.landing;
$("#intro-go").addEventListener("click", () => { $("#intro").close(); store.set("intro", "1"); });

// ── 심화 모드 ──────────────────────────────────────────────────────
function deepFor(lv) { return DEEP.find(d => d.emoji === lv.emoji); }
const deepUi = { idx: 0 };
function renderChip() {
  ui.deepChip.textContent = U.deepChip.s;
  ui.deepChip.classList.toggle("on", st.deep);
  $("#fact-more").textContent = U.readMore.s;
  lastFact = -1;
}
function openDeep(i) {
  deepUi.idx = i;
  const lv = LEVELS[i], d = deepFor(lv);
  if (!d) return;
  $("#deep-title").textContent = `🎓 ${lv.emoji} ${lv.name}`;
  $("#deep-sub").textContent = sizeText(lv.size) + "  ·  " + powerText(lv.logS);
  $("#deep-key").textContent = d.key.s;
  $("#h-num").textContent = U.secNumbers.s; $("#deep-num").textContent = d.numbers.s;
  $("#h-theory").textContent = U.secTheory.s; $("#deep-theory").textContent = d.theory.s;
  $("#h-think").textContent = U.secThink.s; $("#deep-think").textContent = d.think.s;
  $("#deep-show").textContent = U.showAnswer.s; $("#deep-show").style.display = "";
  const ans = $("#deep-answer"); ans.textContent = "💡 " + d.answer.s; ans.style.display = "none";
  $("#deep-up").textContent = U.bigger.s; $("#deep-up").disabled = i <= 0;
  $("#deep-down").textContent = U.smaller.s; $("#deep-down").disabled = i >= LEVELS.length - 1;
  $("#deep-close").textContent = U.close.s;
  $("#deep-scroll").scrollTop = 0;
  if (!$("#deep").open) $("#deep").showModal();
}
ui.deepChip.addEventListener("click", e => {
  e.stopPropagation(); userAct();
  st.deep = !st.deep; store.set("deep", st.deep ? "1" : "0"); renderChip();
});
ui.fact.addEventListener("click", () => { if (st.deep && deepFor(LEVELS[st.current])) { userAct(); openDeep(st.current); } });
$("#deep-show").addEventListener("click", () => { $("#deep-answer").style.display = "block"; $("#deep-show").style.display = "none"; });
$("#deep-up").addEventListener("click", () => { const i = deepUi.idx - 1; flyTo(i); openDeep(i); });
$("#deep-down").addEventListener("click", () => { const i = deepUi.idx + 1; flyTo(i); openDeep(i); });
$("#deep-close").addEventListener("click", () => $("#deep").close());
$("#deep").addEventListener("click", e => { if (e.target === $("#deep")) $("#deep").close(); });

// ── 손·마우스·키보드 ───────────────────────────────────────────────
{
  const pts = new Map();
  canvas.addEventListener("pointerdown", e => {
    canvas.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) touchStart();
  });
  canvas.addEventListener("pointermove", e => {
    const p = pts.get(e.pointerId);
    if (!p) return;
    const now = performance.now();
    let d = 0;
    if (pts.size >= 2) {
      const [a, b] = [...pts.values()];
      const before = Math.hypot(a.x - b.x, a.y - b.y);
      const nx = e.clientX, ny = e.clientY;
      const other = a === p ? b : a;
      const after = Math.hypot(nx - other.x, ny - other.y);
      if (before > 4 && after > 4) d -= Math.log10(after / before);
    } else {
      d += (e.clientY - p.y) / innerHeight * 3;
    }
    p.x = e.clientX; p.y = e.clientY;
    if (d !== 0) drag(d, now);
  });
  const up = e => {
    if (!pts.delete(e.pointerId)) return;
    if (pts.size === 0) touchEnd(performance.now());
  };
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);
  canvas.addEventListener("wheel", e => {
    e.preventDefault();
    let dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1);
    nudge(e.ctrlKey ? dy * 0.01 : dy * 0.0022);
  }, { passive: false });
  addEventListener("keydown", e => {
    if (e.target.closest && e.target.closest("select, dialog")) return;
    if (e.key === "ArrowUp" || e.key === "+" || e.key === "=") nudge(-0.25);
    else if (e.key === "ArrowDown" || e.key === "-") nudge(0.25);
    else if (e.key === "PageUp") flyTo(Math.max(0, st.current - 1));
    else if (e.key === "PageDown") flyTo(Math.min(LEVELS.length - 1, st.current + 1));
    else return;
    e.preventDefault();
  });
  // Safari 트랙패드 핀치
  let gs = 1;
  addEventListener("gesturestart", e => { e.preventDefault(); gs = e.scale; userAct(); });
  addEventListener("gesturechange", e => { e.preventDefault(); nudge(-Math.log10(e.scale / gs)); gs = e.scale; });
}

// ── 그리기 반복 ────────────────────────────────────────────────────
let lastTitle = "", lastFact = -1, lastToast = null;
function updateUi() {
  const lv = LEVELS[st.current];
  const shownW = Math.pow(10, st.logW) * W_PX / refPx();
  const title = `${lv.emoji}  ${lv.name}`;
  const sub = fmt(U.screenWidth.s, sizeText(shownW)) + "  ·  " + powerText(Math.log10(shownW));
  if (title !== lastTitle) { ui.title.textContent = title; lastTitle = title; }
  if (ui.sub.textContent !== sub) ui.sub.textContent = sub;
  const showFact = st.settled && !st.attract;
  const key = st.current + (st.deep ? "d" : "");
  if (showFact && lastFact !== key) {
    const d = deepFor(lv), deepOn = st.deep && !!d;
    ui.factHead.textContent = deepOn ? `${lv.emoji} ${lv.name}  ·  ${powerText(lv.logS)}` : fmt(U.about.s, lv.emoji, lv.name, sizeText(lv.size));
    ui.factBody.textContent = deepOn ? d.key.s : lv.fact;
    ui.fact.classList.toggle("deep", deepOn);
    lastFact = key;
  }
  ui.fact.classList.toggle("on", showFact);
  if (!showFact) lastFact = -1;
  if (st.toast !== lastToast) {
    lastToast = st.toast;
    if (st.toast != null) ui.toast.textContent = fmt(U.newFind.s, `${LEVELS[st.toast].emoji} ${LEVELS[st.toast].name}`);
    ui.toast.classList.toggle("on", st.toast != null);
  }
  ui.btnSpace.textContent = st.autoDir === 1 && !st.attract ? U.pause.s : U.toSpace.s;
  ui.btnQuark.textContent = st.autoDir === -1 && !st.attract ? U.pause.s : U.toQuark.s;
  ui.btnSpace.classList.toggle("active", st.autoDir === 1 && !st.attract);
  ui.btnQuark.classList.toggle("active", st.autoDir === -1 && !st.attract);
  ui.knob.style.top = (fracIndex(st.logW) / (LEVELS.length - 1) * 100) + "%";
  ui.ladder.querySelectorAll(".rung").forEach((b, i) => b.classList.toggle("cur", i === st.current));
}

let last = 0;
function frame(now) {
  const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
  last = now;
  step(dt);
  drawUniverse(g, W_PX, H_PX, refPx(), st.logW, st.time, DPR);
  updateUi();
  requestAnimationFrame(frame);
}

if (EMBED) {
  document.body.classList.add("embed", "attract");
  canvas.addEventListener("pointerdown", () => document.body.classList.remove("attract"), { once: true });
}
applyLang();
if (!EMBED && !store.get("intro") && !params.has("logW")) $("#intro").showModal();
requestAnimationFrame(frame);
