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
    "The center of the screen is YOU.\n\n🖱️ Scroll the mouse wheel, pinch on a trackpad or phone, or drag up and down.\n⬆️ Zoom in → hand, cells, atoms, all the way to quarks!\n⬇️ Zoom out → your city, Earth, galaxies, the edge of the universe!\n\nOr just press 🚀 / 🔬 and enjoy the ride.\n📗 🎓 Older? Pick 📗 Learn (high school & adults) or 🎓 Deep (university) on the info card.",
    "지금 화면 가운데는 바로 '나'예요.\n\n🖱️ 마우스 휠을 굴리거나, 트랙패드·휴대폰에서 두 손가락으로 벌리고 오므리거나, 위아래로 끌어 보세요.\n⬆️ 확대 → 손, 세포, 원자, 쿼크까지!\n⬇️ 축소 → 우리 도시, 지구, 은하, 우주 끝까지!\n\n🚀 / 🔬 버튼을 누르면 저절로 여행해요.\n📗 🎓 설명 카드에서 수준을 골라 보세요: 📗 학습(고등학생·일반인), 🎓 심화(대학생).",
    "画面のまん中は「あなた」です。\n\n🖱️ マウスホイール、トラックパッドやスマホの2本指、または上下ドラッグで。\n⬆️ 拡大 → 手、細胞、原子、クォークまで！\n⬇️ 縮小 → 街、地球、銀河、宇宙の果てまで！\n\n🚀 / 🔬 ボタンで自動の旅もできます。\n📗 🎓 説明カードでレベルを選べます：📗 まなぶ(高校生・一般)、🎓 くわしく(大学生)。",
    "屏幕中间就是“你”。\n\n🖱️ 滚动鼠标滚轮，在触控板或手机上双指缩放，或上下拖动。\n⬆️ 放大 → 手、细胞、原子，一直到夸克！\n⬇️ 缩小 → 城市、地球、星系，一直到宇宙尽头！\n\n按 🚀 / 🔬 可以自动旅行。\n📗 🎓 可在说明卡上选择程度：📗 学习(高中生、成人)、🎓 深入(大学生)。"),
  getApp: L("📱 Get the app", "📱 앱 받기", "📱 アプリ", "📱 下载应用"),
  appTitle: L("More in the app", "앱에서 더 많이", "アプリではもっと", "应用里还有更多"),
  appBody: L(
    "🎯 Missions: find a hidden size as fast as you can\n📖 Size Book: collect all 24 sizes\n📵 No ads · no sign-up · no internet permission",
    "🎯 미션: 숨은 크기를 빨리 찾아 별 모으기\n📖 크기 도감: 24단계 모두 모으기\n📵 광고 없음 · 회원가입 없음 · 인터넷 권한 없음",
    "🎯 ミッション：かくれた大きさを早く見つけて星を集めよう\n📖 サイズ図鑑：24段階ぜんぶ集めよう\n📵 広告なし・登録なし・インターネット権限なし",
    "🎯 任务：尽快找到隐藏的尺寸，收集星星\n📖 尺寸图鉴：集齐全部24个层级\n📵 无广告 · 无需注册 · 无网络权限"),
  soon: L("Coming to Google Play in December 2026", "Google Play 2026년 12월 출시 예정", "Google Play で2026年12月公開予定", "将于2026年12月在 Google Play 上线"),
  onPlay: L("Get it on Google Play", "Google Play 에서 받기", "Google Play で入手", "在 Google Play 获取"),
  about: L("About the app", "앱 소개", "アプリについて", "了解应用"),
  tapToPlay: L("Tap to try it yourself", "눌러서 직접 해 보기", "タップして自分で操作", "点击亲自试试"),
  lang: L("Language", "언어", "言語", "语言"),
};

// '나'에서 들어갈 신체 갈래. 위쪽(우주~나)과 아래쪽(원자~끈)은 모든 갈래가 같다
const BRANCHES = [
  { id: "hand", emoji: "✋", name: L("Hand", "손", "手", "手"), levels: TOP_LEVELS.concat(HAND_LEVELS, BOTTOM_LEVELS), mid: HAND_LEVELS },
  { id: "eye", emoji: "👁️", name: L("Eye", "눈", "目", "眼睛"), levels: TOP_LEVELS.concat(EYE_LEVELS, BOTTOM_LEVELS), mid: EYE_LEVELS },
  { id: "nerve", emoji: "⚡", name: L("Optic nerve", "시신경", "視神経", "视神经"), levels: TOP_LEVELS.concat(NERVE_LEVELS, BOTTOM_LEVELS), mid: NERVE_LEVELS },
];
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
  tier: +(store.get("tier") ?? (store.get("deep") === "1" ? 2 : 0)) || 0,
  solved: new Set((() => { try { return JSON.parse(store.get("quiz") || "[]"); } catch { return []; } })()),
  discovered: new Set(["🧒"]), toast: null, toastTime: 0,
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
  st.logW = clamp(st.logW + delta * desertBoost(st.logW), MIN_LOG, MAX_LOG);
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
function nudge(d) { userAct(); st.flyTarget = null; st.autoDir = 0; st.vel = 0; st.logW = clamp(st.logW + d * desertBoost(st.logW), MIN_LOG, MAX_LOG); st.stillTime = 0; }
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
      st.logW += st.autoDir * 1.35 * desertBoost(st.logW) * dt;
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
  if (st.settled && near && !st.discovered.has(LEVELS[st.current].emoji)) {
    st.discovered.add(LEVELS[st.current].emoji);
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
  btnApp: $("#btn-app"), place: $("#place"), lang: $("#lang"),
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
  $("#credits-title").textContent = U.photoCredits.s;
  $("#credits-body").textContent = U.photoCreditsBody.s;
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
  if ($("#expert").open) openExpert(exUi.idx);
  if ($("#lesson").open) openLesson(lsUi.lv, lsUi.i);
  if (typeof renderBranches === "function") renderBranches();
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
const TIER_LABEL = () => [U.tierKid.s, U.tierLearn.s, U.deepChip.s, U.tierExpert.s];
function setBranch(id, save = true) {
  const br = BRANCHES.find(b => b.id === id) || BRANCHES[0];
  BODY.branch = br.id; LEVELS = br.levels;
  if (save) store.set("branch", br.id);
  st.current = currentLevel(st.logW);
  buildLadder(); renderBranches(); lastFact = -1; lastTitle = "";
}
function renderBranches() {
  const box = $("#branches");
  box.innerHTML = "";
  for (const br of BRANCHES) {
    const b = document.createElement("button");
    b.className = "chip" + (br.id === BODY.branch ? " on" : "");
    b.textContent = `${br.emoji} ${br.name.s}`;
    b.addEventListener("click", e => { e.stopPropagation(); userAct(); setBranch(br.id); });
    box.appendChild(b);
  }
}
function renderChip() {
  document.querySelectorAll(".tiers .chip[data-tier]").forEach(b => {
    const t = +b.dataset.tier;
    b.textContent = TIER_LABEL()[t];
    b.classList.toggle("on", st.tier === t);
  });
  lastFact = -1;
}
function shownTier(lv) {
  if (st.tier === 3 && EXPERT[lv.emoji]) return 3;
  if (st.tier === 2 && deepFor(lv)) return 2;
  if (st.tier === 1 && (LESSONS[lv.emoji] || []).length) return 1;
  return 0;
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
document.querySelectorAll(".tiers .chip[data-tier]").forEach(b => b.addEventListener("click", e => {
  e.stopPropagation(); userAct();
  st.tier = +b.dataset.tier; store.set("tier", String(st.tier)); renderChip();
}));
ui.fact.addEventListener("click", () => {
  const t = shownTier(LEVELS[st.current]);
  if (t === 3) { userAct(); openExpert(st.current); }
  else if (t === 2) { userAct(); openDeep(st.current); }
  else if (t === 1) { userAct(); openLesson(st.current, 0); }
});

// ── 📗 학습 카드 ───────────────────────────────────────────────────
const lsUi = { lv: 0, i: 0 };
const Lx = o => o[I18N.lang];
function lessonCount() { return Object.values(LESSONS).reduce((n, a) => n + a.length, 0); }
function openLesson(li, ti) {
  lsUi.lv = li; lsUi.i = ti;
  const lv = LEVELS[li], topics = LESSONS[lv.emoji] || [], t = topics[ti];
  if (!t) return;
  const key = `${lv.emoji}#${ti}`;
  $("#ls-head").textContent = `📗 ${lv.emoji} ${lv.name}`;
  $("#ls-sub").textContent = fmt(U.lessonOf.s, ti + 1, topics.length) + "   " + fmt(U.solvedOf.s, st.solved.size, lessonCount());
  $("#ls-title").textContent = Lx(t.t);
  $("#ls-body").textContent = Lx(t.b);
  $("#ls-terms-h").textContent = U.secTerms.s;
  const tl = $("#ls-terms-list"); tl.innerHTML = "";
  for (const line of Lx(t.g).split("\n")) {
    const [w, d] = line.split(" — ");
    const p = document.createElement("p"), b = document.createElement("b");
    b.textContent = w; p.appendChild(b);
    if (d) p.appendChild(document.createTextNode(" — " + d));
    tl.appendChild(p);
  }
  $("#ls-quiz-h").textContent = U.secQuiz.s;
  $("#ls-q").textContent = Lx(t.q);
  $("#ls-result").textContent = ""; $("#ls-why").textContent = "";
  const box = $("#ls-opts"); box.innerHTML = "";
  const order = [0, 1, 2].sort(() => Math.random() - 0.5);
  const buttons = [];
  for (const oi of order) {
    const b = document.createElement("button");
    b.className = "opt"; b.textContent = Lx(t.o[oi]);
    b.addEventListener("click", () => {
      buttons.forEach(([x, xi]) => { x.disabled = true; x.classList.add(xi === t.a ? "ok" : xi === oi ? "bad" : "dim"); });
      const ok = oi === t.a;
      const r = $("#ls-result"); r.textContent = ok ? U.correct.s : U.wrong.s; r.style.color = ok ? "#7CE0A0" : "#FF9A9A";
      $("#ls-why").textContent = Lx(t.w);
      if (ok && !st.solved.has(key)) { st.solved.add(key); store.set("quiz", JSON.stringify([...st.solved])); lastFact = -1; }
      $("#ls-sub").textContent = fmt(U.lessonOf.s, ti + 1, topics.length) + "   " + fmt(U.solvedOf.s, st.solved.size, lessonCount());
    });
    buttons.push([b, oi]); box.appendChild(b);
  }
  $("#ls-prev").textContent = U.prev.s; $("#ls-prev").disabled = li === 0 && ti === 0;
  $("#ls-next").textContent = U.next.s; $("#ls-next").disabled = li === LEVELS.length - 1 && ti === topics.length - 1;
  $("#ls-close").textContent = U.close.s;
  $("#ls-scroll").scrollTop = 0;
  if (!$("#lesson").open) $("#lesson").showModal();
}
function lessonStep(d) {
  let l = lsUi.lv, i = lsUi.i + d;
  for (;;) {
    const n = (LESSONS[LEVELS[l].emoji] || []).length;
    if (i >= 0 && i < n) { if (l !== lsUi.lv) flyTo(l); openLesson(l, i); return; }
    l += d;
    if (l < 0 || l >= LEVELS.length) return;
    i = d > 0 ? 0 : (LESSONS[LEVELS[l].emoji] || []).length - 1;
  }
}
$("#ls-prev").addEventListener("click", () => lessonStep(-1));
$("#ls-next").addEventListener("click", () => lessonStep(1));
$("#ls-close").addEventListener("click", () => $("#lesson").close());
$("#lesson").addEventListener("click", e => { if (e.target === $("#lesson")) $("#lesson").close(); });
$("#deep-show").addEventListener("click", () => { $("#deep-answer").style.display = "block"; $("#deep-show").style.display = "none"; });
$("#deep-up").addEventListener("click", () => { const i = deepUi.idx - 1; flyTo(i); openDeep(i); });
$("#deep-down").addEventListener("click", () => { const i = deepUi.idx + 1; flyTo(i); openDeep(i); });
$("#deep-close").addEventListener("click", () => $("#deep").close());
$("#deep").addEventListener("click", e => { if (e.target === $("#deep")) $("#deep").close(); });

// ── 🔬 전문(대학원·연구 입문) ─────────────────────────────────────
const exUi = { idx: 0 };
function openExpert(i) {
  exUi.idx = i;
  const lv = LEVELS[i], e = EXPERT[lv.emoji];
  if (!e) return;
  $("#ex-title").textContent = `🔬 ${lv.emoji} ${lv.name}`;
  $("#ex-sub").textContent = U.expertLevel.s + "  ·  " + powerText(lv.logS);
  $("#ex-key").textContent = Lx(e.t);
  $("#h-eq").textContent = U.secEq.s; $("#ex-eq").textContent = e.eq.join("\n");
  $("#h-derive").textContent = U.secDerive.s; $("#ex-derive").textContent = Lx(e.d);
  $("#h-prob").textContent = U.secProblem.s; $("#ex-prob").textContent = Lx(e.p);
  $("#ex-show").textContent = U.showSolution.s; $("#ex-show").style.display = "";
  const sol = $("#ex-sol"); sol.textContent = "💡 " + Lx(e.s); sol.style.display = "none";
  $("#h-open").textContent = U.secOpen.s; $("#ex-open").textContent = Lx(e.o);
  $("#h-refs").textContent = U.secRefs.s;
  $("#ex-refs").replaceChildren(...e.r.map(r => { const li = document.createElement("li"); li.textContent = r; return li; }));
  $("#ex-up").textContent = U.bigger.s; $("#ex-up").disabled = i <= 0;
  $("#ex-down").textContent = U.smaller.s; $("#ex-down").disabled = i >= LEVELS.length - 1;
  $("#ex-close").textContent = U.close.s;
  $("#ex-scroll").scrollTop = 0;
  if (!$("#expert").open) $("#expert").showModal();
}
$("#ex-show").addEventListener("click", () => { $("#ex-sol").style.display = "block"; $("#ex-show").style.display = "none"; });
$("#ex-up").addEventListener("click", () => { const i = exUi.idx - 1; flyTo(i); openExpert(i); });
$("#ex-down").addEventListener("click", () => { const i = exUi.idx + 1; flyTo(i); openExpert(i); });
$("#ex-close").addEventListener("click", () => $("#expert").close());
$("#expert").addEventListener("click", e => { if (e.target === $("#expert")) $("#expert").close(); });

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
  const tier = shownTier(lv);
  const key = st.current + "t" + tier;
  if (showFact && lastFact !== key) {
    ui.factHead.textContent = tier ? `${lv.emoji} ${lv.name}  ·  ${powerText(lv.logS)}` : fmt(U.about.s, lv.emoji, lv.name, sizeText(lv.size));
    if (tier === 1) {
      const ol = document.createElement("ol");
      (LESSONS[lv.emoji] || []).forEach((t, i) => {
        const li = document.createElement("li");
        const done = st.solved.has(`${lv.emoji}#${i}`);
        li.textContent = (done ? "✅ " : "") + Lx(t.t);
        if (done) li.className = "done";
        ol.appendChild(li);
      });
      ui.factBody.replaceChildren(ol);
    } else ui.factBody.textContent = tier === 3 ? Lx(EXPERT[lv.emoji].t) : tier === 2 ? deepFor(lv).key.s : lv.fact;
    $("#fact-more").textContent = tier === 1 ? U.learnStart.s : tier === 3 ? U.expertMore.s : U.readMore.s;
    const br = BRANCHES.find(b => b.id === BODY.branch);
    $("#branches").style.display = lv.emoji === "🧒" || br.mid.includes(lv) ? "" : "none";
    ui.fact.classList.toggle("deep", tier === 2);
    ui.fact.classList.toggle("learn", tier === 1);
    ui.fact.classList.toggle("expert", tier === 3);
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
{
  const q = params.get("branch") || store.get("branch");
  if (q && q !== "hand") setBranch(q, !!params.get("branch"));
}
loadPhotos();
applyLang();
if (!EMBED && !store.get("intro") && !params.has("logW")) $("#intro").showModal();
requestAnimationFrame(frame);
