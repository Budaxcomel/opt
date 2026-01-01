// =============================
// MeowRun Web App (Premium Upgrade)
// =============================

// Auto API base:
// - dev: localhost:8080
// - prod: same-origin (assume reverse proxy)
const DEFAULT_API = (location.hostname === "localhost" || location.hostname === "127.0.0.1")
  ? "http://localhost:8080"
  : location.origin;

const API = (localStorage.getItem("apiBase") || "").trim() || DEFAULT_API;

const toastEl = document.getElementById("toast");
const toastMsgEl = document.getElementById("toastMsg");
const toastBarFillEl = document.getElementById("toastBarFill");
const busyEl = document.getElementById("busy");
const busyMsgEl = document.getElementById("busyMsg");

const els = {
  auth: document.getElementById("auth"),
  app: document.getElementById("app"),

  email: document.getElementById("email"),
  pass: document.getElementById("pass"),
  btnLogin: document.getElementById("btnLogin"),
  btnReg: document.getElementById("btnReg"),

  btnLogout: document.getElementById("btnLogout"),

  name: document.getElementById("name"),
  coins: document.getElementById("coins"),
  rm: document.getElementById("rm"),
  gems: document.getElementById("gems"),
  lvl: document.getElementById("lvl"),
  act: document.getElementById("act"),

  // profile
  displayName: document.getElementById("displayName"),
  btnSaveName: document.getElementById("btnSaveName"),
  btnRandomName: document.getElementById("btnRandomName"),

  // settings
  setSound: document.getElementById("setSound"),
  setHaptic: document.getElementById("setHaptic"),
  setDark: document.getElementById("setDark"),
  styleSeg: document.getElementById("styleSeg"),
  btnResetUi: document.getElementById("btnResetUi"),

  // config
  cfgBadge: document.getElementById("cfgBadge"),
  minLvl: document.getElementById("minLvl"),
  convertHint: document.getElementById("convertHint"),

  // game
  track: document.getElementById("track"),
  runner: document.getElementById("runner"),
  obsLayer: document.getElementById("obsLayer"),
  tapBurst: document.getElementById("tapBurst"),
  btnStartRun: document.getElementById("btnStartRun"),
  btnTap: document.getElementById("btnTap"),
  btnFinishRun: document.getElementById("btnFinishRun"),
  btnUpgrade: document.getElementById("btnUpgrade"),
  btnSkin: document.getElementById("btnSkin"),
  bestGrade: document.getElementById("bestGrade"),
  timeFill: document.getElementById("timeFill"),
  timeLeft: document.getElementById("timeLeft"),
  combo: document.getElementById("combo"),
  hits: document.getElementById("hits"),
  dist: document.getElementById("dist"),
  perfect: document.getElementById("perfect"),
  runResult: document.getElementById("runResult"),

  // tasks
  btnDaily: document.getElementById("btnDaily"),
  btnAd: document.getElementById("btnAd"),
  btnLedger: document.getElementById("btnLedger"),
  cool: document.getElementById("cool"),

  // activity
  btnRefreshAct: document.getElementById("btnRefreshAct"),
  actList: document.getElementById("actList"),

  // invite
  btnRefreshInvite: document.getElementById("btnRefreshInvite"),
  myCode: document.getElementById("myCode"),
  btnCopyCode: document.getElementById("btnCopyCode"),
  btnShareLink: document.getElementById("btnShareLink"),
  bindCode: document.getElementById("bindCode"),
  btnBind: document.getElementById("btnBind"),
  inviteList: document.getElementById("inviteList"),

  // bank
  convertGems: document.getElementById("convertGems"),
  btnConvert: document.getElementById("btnConvert"),

  // withdraw
  wdAmount: document.getElementById("wdAmount"),
  wdMethod: document.getElementById("wdMethod"),
  wdDest: document.getElementById("wdDest"),
  btnWithdraw: document.getElementById("btnWithdraw"),
  btnRefreshWD: document.getElementById("btnRefreshWD"),
  wdList: document.getElementById("wdList"),

  // ledger modal
  screenLedger: document.getElementById("screenLedger"),
  ledgerList: document.getElementById("ledgerList"),
  btnCloseLedger: document.getElementById("btnCloseLedger"),

  // pwa
  btnInstall: document.getElementById("btnInstall"),

  // ui extras
  bottomNav: document.getElementById("bottomNav"),
  btnTop: document.getElementById("btnTop"),
  btnPw: document.getElementById("btnPw"),
};

const state = {
  token: localStorage.getItem("token") || "",
  cfg: null,
  settings: {
    sound: localStorage.getItem("setSound") !== "0",
    haptic: localStorage.getItem("setHaptic") !== "0",
    theme: localStorage.getItem("theme") || "",
    style: localStorage.getItem("style") || "pastel",
    skin: Math.min(5, Math.max(1, Number(localStorage.getItem("skin") || 1)))
  },
  cooldowns: null,
  cooldownsFetchedAt: 0,

  run: {
    active: false,
    raf: 0,
    startedAt: 0,
    durationMs: 10_000,

    taps: 0,
    perfect: 0,
    combo: 1,
    maxCombo: 1,
    hits: 0,

    lastTapAt: 0,
    speed: 0,
    distance: 0,

    jumpUntil: 0,

    obstacles: [],
    nextObstacleAt: 0,
  }
};

// ============== UI helpers ==============
function inferToastType(msg){
  const m = String(msg || "").toLowerCase();
  // simple heuristics: success vs error vs info
  if (m.includes("✅") || m.includes("berjaya") || m.includes("saved") || m.includes("claimed") || m.includes("converted") || m.includes("copied") || m.includes("shared")) return "success";
  if (m.includes("fail") || m.includes("error") || m.includes("http") || m.includes("invalid") || m.includes("cooldown") || m.includes("limit") || m.includes("not")) return "error";
  return "info";
}

function toast(msg, type){
  if (!toastEl) return;
  const t = type || inferToastType(msg);

  toastEl.dataset.type = t;
  if (toastMsgEl) toastMsgEl.textContent = msg;
  else toastEl.textContent = msg;

  // retrigger animation
  toastEl.classList.remove("show");
  toastEl.hidden = false;
  void toastEl.offsetWidth;
  toastEl.classList.add("show");

  if (toastBarFillEl){
    toastBarFillEl.style.animation = "none";
    void toastBarFillEl.offsetWidth;
    toastBarFillEl.style.animation = "";
  }

  clearTimeout(toast.__t);
  toast.__t = setTimeout(()=>{
    toastEl.classList.remove("show");
    setTimeout(()=> toastEl.hidden = true, 220);
  }, 2400);
}

function busy(on, msg="Loading…"){
  if (!busyEl) return;
  if (busyMsgEl) busyMsgEl.textContent = msg;
  busyEl.hidden = !on;
  document.body.toggleAttribute("data-busy", !!on);
}

function initPasswordToggle(){
  if (!els.btnPw || !els.pass) return;
  els.btnPw.onclick = ()=>{
    const isPw = els.pass.type === "password";
    els.pass.type = isPw ? "text" : "password";
    els.btnPw.textContent = isPw ? "🙈" : "👁️";
  };
}

function initRipples(){
  // lightweight ripple on buttons/track for premium feel
  document.addEventListener("pointerdown", (e)=>{
    const host = e.target.closest(".pill, .track, .navBtn");
    if (!host) return;
    // avoid ripples on disabled buttons
    if (host.matches(".pill") && host.disabled) return;

    const r = host.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const s = document.createElement("span");
    s.className = "ripple";
    s.style.left = x + "px";
    s.style.top = y + "px";
    host.appendChild(s);
    s.addEventListener("animationend", ()=> s.remove(), { once:true });
  }, { passive:true });
}

let revealObserver = null;
function initReveal(){
  if (!("IntersectionObserver" in window)) return;

  // idempotent
  document.querySelectorAll(".card").forEach(c=>{
    if (!c.classList.contains("reveal")) c.classList.add("reveal");
  });

  if (revealObserver) return;
  revealObserver = new IntersectionObserver((entries)=>{
    entries.forEach(en=>{
      if (en.isIntersecting) en.target.classList.add("in");
    });
  }, { threshold: 0.10 });
  document.querySelectorAll(".card.reveal").forEach(c=> revealObserver.observe(c));
}

function setActiveNav(targetId){
  if (!els.bottomNav) return;
  els.bottomNav.querySelectorAll(".navBtn").forEach(b=>{
    b.classList.toggle("active", b.dataset.target === targetId);
  });
}

function initBottomNav(){
  if (!els.bottomNav) return;

  const btns = Array.from(els.bottomNav.querySelectorAll(".navBtn"));
  btns.forEach(b=>{
    b.onclick = ()=>{
      const id = b.dataset.target;
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveNav(id);
      haptic(8);
    };
  });

  // Highlight based on scroll position
  if ("IntersectionObserver" in window){
    const sections = btns
      .map(b=> document.getElementById(b.dataset.target))
      .filter(Boolean);

    const io = new IntersectionObserver((entries)=>{
      // pick the most visible intersecting entry
      const visible = entries
        .filter(e=> e.isIntersecting)
        .sort((a,b)=> b.intersectionRatio - a.intersectionRatio)[0];
      if (visible && visible.target && visible.target.id){
        setActiveNav(visible.target.id);
      }
    }, { rootMargin: "-35% 0px -55% 0px", threshold: [0, .1, .2, .35, .5, .65] });

    sections.forEach(s=> io.observe(s));
  }
}

function updateTopButton(){
  if (!els.btnTop) return;
  if (els.app.hidden){
    els.btnTop.hidden = true;
    return;
  }
  els.btnTop.hidden = window.scrollY < 520;
}

function initBackToTop(){
  if (!els.btnTop) return;
  window.addEventListener("scroll", updateTopButton, { passive:true });
  els.btnTop.onclick = ()=>{
    window.scrollTo({ top: 0, behavior: "smooth" });
    haptic(8);
  };
  updateTopButton();
}

function openModal(modalEl){
  if (!modalEl) return;
  modalEl.hidden = false;
  requestAnimationFrame(()=> modalEl.classList.add("show"));
}

function closeModal(modalEl){
  if (!modalEl) return;
  modalEl.classList.remove("show");
  setTimeout(()=>{ modalEl.hidden = true; }, 220);
}

function initLedgerModal(){
  if (!els.screenLedger) return;

  // click outside to close
  els.screenLedger.addEventListener("click", (e)=>{
    if (e.target === els.screenLedger) closeModal(els.screenLedger);
  });

  // ESC to close
  window.addEventListener("keydown", (e)=>{
    if (e.key === "Escape" && !els.screenLedger.hidden){
      closeModal(els.screenLedger);
    }
  });
}

function setListSkeleton(listEl, rows=3){
  if (!listEl) return;
  listEl.innerHTML = "";
  for (let i=0;i<rows;i++){
    const el = document.createElement("div");
    el.className = "item skeleton";
    el.innerHTML = `
      <div style="flex:1">
        <div class="skLine" style="width:${55 + (i*9)%25}%"></div>
        <div class="skLine" style="width:${35 + (i*13)%35}%"></div>
      </div>
      <div style="width:84px">
        <div class="skLine" style="width:100%"></div>
      </div>
    `;
    listEl.appendChild(el);
  }
}


function fmtRM(n){ return Number(n || 0).toFixed(2); }

function showApp(on){
  els.auth.hidden = on;
  els.app.hidden = !on;
  if (els.bottomNav) els.bottomNav.hidden = !on;
  if (els.btnTop) els.btnTop.hidden = true;
}

function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

function msToClock(ms){
  const t = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(t / 60);
  const s = t % 60;
  return m ? `${m}:${String(s).padStart(2,"0")}` : `${s}s`;
}

function getDeviceId(){
  let id = localStorage.getItem("deviceId") || "";
  if (!id){
    id = (crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()) + "_" + Math.random().toString(16).slice(2));
    localStorage.setItem("deviceId", id);
  }
  return id;
}

async function api(path, opts={}){
  const headers = opts.headers || {};
  headers["X-Device"] = getDeviceId();
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  if (opts.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";

  const res = await fetch(API + path, { ...opts, headers });
  const data = await res.json().catch(()=> ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ============== Referral helper (install friendly) ==============
function getRefFromUrl(){
  const u = new URL(window.location.href);
  const ref = (u.searchParams.get("ref") || "").trim();
  return /^\d{6,10}$/.test(ref) ? ref : "";
}
function storePendingRef(ref){
  if (!ref) return;
  localStorage.setItem("pendingRef", ref);
}
function consumePendingRef(){
  const ref = (localStorage.getItem("pendingRef") || "").trim();
  return /^\d{6,10}$/.test(ref) ? ref : "";
}
function clearPendingRef(){
  localStorage.removeItem("pendingRef");
}
function cleanRefParamFromUrl(){
  const u = new URL(window.location.href);
  if (!u.searchParams.has("ref")) return;
  u.searchParams.delete("ref");
  window.history.replaceState({}, document.title, u.toString());
}

async function tryAutoBindReferral(){
  if (sessionStorage.getItem("autoBindTried") === "1") return;
  sessionStorage.setItem("autoBindTried", "1");
  if (!state.token) return;

  const pending = consumePendingRef();
  if (!pending) return;

  try{
    const me = await api("/invite/me");
    if (me.inviterId){
      clearPendingRef();
      return;
    }
    await api("/invite/bind", { method:"POST", body: JSON.stringify({ code: pending }) });
    toast(`Invitation linked ✅ (${pending})`);
    clearPendingRef();
    await refreshInvite();
    await refreshMe();
  }catch(e){
    toast(`Auto-invite failed: ${e.message}`);
    clearPendingRef();
  }
}

// ============== Settings (sound/haptic/theme/skin) ==============
let audioCtx = null;

function ensureAudio(){
  if (!state.settings.sound) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  if (!audioCtx) audioCtx = new AC();
  if (audioCtx.state === "suspended") audioCtx.resume().catch(()=>{});
}

function beep({ freq=520, duration=0.055, gain=0.05, type="sine" }={}){
  if (!state.settings.sound) return;
  if (!audioCtx) return;
  const t0 = audioCtx.currentTime;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  o.connect(g);
  g.connect(audioCtx.destination);
  o.start(t0);
  o.stop(t0 + duration);
}

function haptic(ms=10){
  if (!state.settings.haptic) return;
  if (navigator.vibrate) navigator.vibrate(ms);
}

function applyTheme(){
  const isDark = state.settings.theme === "dark";
  document.body.dataset.theme = isDark ? "dark" : "";
  if (els.setDark) els.setDark.checked = isDark;
}

function applyStyle(){
  const style = state.settings.style || "pastel";
  document.body.dataset.style = style;

  if (els.styleSeg){
    els.styleSeg.querySelectorAll(".segBtn").forEach(btn=>{
      btn.classList.toggle("active", btn.dataset.style === style);
    });
  }

  // theme-color polish (mobile browser UI)
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta){
    const c = style === "arcade" ? "#071022"
      : style === "minimal" ? "#f8fafc"
      : "#ffd6e7";
    meta.setAttribute("content", c);
  }
}


function applySkin(){
  if (!els.runner) return;
  for (let i=1;i<=5;i++) els.runner.classList.remove(`skin-${i}`);
  els.runner.classList.add(`skin-${state.settings.skin}`);
  localStorage.setItem("skin", String(state.settings.skin));
}

function loadSettingsToUI(){
  if (els.setSound) els.setSound.checked = !!state.settings.sound;
  if (els.setHaptic) els.setHaptic.checked = !!state.settings.haptic;
  applyStyle();
  applyTheme();
  applySkin();

  if (els.bestGrade){
    els.bestGrade.textContent = localStorage.getItem("bestGrade") || "-";
  }
}

function bindSettingsUI(){
  if (els.setSound){
    els.setSound.onchange = ()=>{
      state.settings.sound = !!els.setSound.checked;
      localStorage.setItem("setSound", state.settings.sound ? "1" : "0");
      if (state.settings.sound) ensureAudio();
      toast(state.settings.sound ? "Sound ON 🔊" : "Sound OFF 🔇");
    };
  }

  if (els.setHaptic){
    els.setHaptic.onchange = ()=>{
      state.settings.haptic = !!els.setHaptic.checked;
      localStorage.setItem("setHaptic", state.settings.haptic ? "1" : "0");
      if (state.settings.haptic) haptic(12);
      toast(state.settings.haptic ? "Haptic ON 📳" : "Haptic OFF");
    };
  }

  if (els.setDark){
    els.setDark.onchange = ()=>{
      state.settings.theme = els.setDark.checked ? "dark" : "";
      localStorage.setItem("theme", state.settings.theme);
      applyTheme();
      toast(els.setDark.checked ? "Dark mode 🌙" : "Light mode ☀️");
    };
  }

  if (els.btnResetUi){
    els.btnResetUi.onclick = ()=>{
      localStorage.removeItem("setSound");
      localStorage.removeItem("setHaptic");
      localStorage.removeItem("theme");
      localStorage.removeItem("style");
      localStorage.removeItem("skin");
      localStorage.removeItem("bestGrade");

      state.settings.sound = true;
      state.settings.haptic = true;
      state.settings.theme = "";
      state.settings.skin = 1;

      loadSettingsToUI();
      toast("UI reset ✅");
    };
  }

  if (els.btnSkin){
    els.btnSkin.onclick = ()=>{
      state.settings.skin = (state.settings.skin % 5) + 1;
      applySkin();
      toast(`Skin: ${state.settings.skin} 🐾`);
    };
  }
}

// ============== Config + Me ==============
async function loadConfig(){
  state.cfg = await api("/config");
  if (els.cfgBadge){
    els.cfgBadge.textContent = `Ads ${state.cfg.dailyAdLimit}/day • +${state.cfg.coinPerAd} coin`;
  }
  if (els.minLvl) els.minLvl.textContent = String(state.cfg.minLevelToConvert);
  if (els.convertHint){
    els.convertHint.textContent =
      `${state.cfg.gemToCoinRate} gems → ${state.cfg.gemToCoinRate} coin (unlock level ${state.cfg.minLevelToConvert})`;
  }
}

async function refreshMe(){
  const me = await api("/me");
  const u = me.user;
  els.name.textContent = u.displayName || "Player";
  els.coins.textContent = String(u.coins);
  els.rm.textContent = fmtRM(u.rm);
  els.gems.textContent = String(u.gems);
  els.lvl.textContent = String(u.level);
  els.act.textContent = String(u.activity);

  // keep profile input in sync
  if (els.displayName && typeof u.displayName === "string"){
    els.displayName.value = u.displayName;
  }
}

// ============== Profile ==============
function randomDisplayName(){
  const adjectives = ["Comel","Laju","Gebu","Ceria","Hensem","Srikandi","Nakal","Santai","Power","Legend"];
  const nouns = ["Kitty","Meowster","Paw","Tiger","Mochi","Oyen","Neko","Boba","Ciku","Panda"];
  const a = adjectives[Math.floor(Math.random()*adjectives.length)];
  const n = nouns[Math.floor(Math.random()*nouns.length)];
  const num = String(Math.floor(100 + Math.random()*900));
  return `${a}${n}${num}`;
}

function bindProfileUI(){
  if (els.btnRandomName && els.displayName){
    els.btnRandomName.onclick = ()=>{
      els.displayName.value = randomDisplayName();
      toast("Nama random 🎲");
    };
  }

  if (els.btnSaveName && els.displayName){
    els.btnSaveName.onclick = async ()=>{
      try{
        const displayName = String(els.displayName.value || "").trim().slice(0,24);
        await api("/profile", { method:"POST", body: JSON.stringify({ displayName }) });
        toast("Profile saved ✅");
        await refreshMe();
      }catch(e){
        toast(e.message);
      }
    };
  }
}

// ============== Cooldowns UI ==============
async function refreshCooldowns(){
  try{
    const d = await api("/cooldowns");
    state.cooldowns = d;
    state.cooldownsFetchedAt = Date.now();
    renderCooldowns();
  }catch{
    // endpoint mungkin belum ada kalau server lama
  }
}

function renderCooldowns(){
  if (!els.cool) return;
  if (!state.cooldowns){
    els.cool.textContent = "";
    return;
  }

  const fetchedAt = state.cooldownsFetchedAt || Date.now();
  const drift = Date.now() - fetchedAt;
  const nowMs = Number(state.cooldowns.now || Date.now()) + drift;

  const daily = state.cooldowns.daily || {};
  const ad = state.cooldowns.ad || {};

  const dailyLeft = Math.max(0, Number(daily.nextAt || nowMs) - nowMs);
  const adLeft = Math.max(0, Number(ad.nextAt || nowMs) - nowMs);

  const parts = [];
  if (daily.ready) parts.push("Daily Treat: READY ✅");
  else parts.push(`Daily Treat: ${msToClock(dailyLeft)} lagi`);

  if ((ad.remaining ?? 0) <= 0) parts.push("Ads: limit hari ini habis");
  else if (ad.ready) parts.push(`Ads: READY ✅ (remaining ${ad.remaining})`);
  else parts.push(`Ads: cooldown ${msToClock(adLeft)} (remaining ${ad.remaining})`);

  els.cool.textContent = parts.join(" • ");
}

// refresh the countdown text every second (cheap)
setInterval(renderCooldowns, 1000);

// ============== Meow Sprint (mini-game) ==============

const RUN_TARGET_INTERVAL_MS = 260;
const RUN_PERFECT_WINDOW_MS = 60;
const RUN_COMBO_WINDOW_MS = 430;

function resetRunUI(){
  if (els.timeFill) els.timeFill.style.width = "0%";
  if (els.timeLeft) els.timeLeft.textContent = "10.0";
  if (els.combo) els.combo.textContent = "1";
  if (els.hits) els.hits.textContent = "0";
  if (els.dist) els.dist.textContent = "0";
  if (els.perfect) els.perfect.textContent = "0";
  if (els.runResult){
    els.runResult.hidden = true;
    els.runResult.innerHTML = "";
  }

  // clear obstacles
  state.run.obstacles = [];
  if (els.obsLayer) els.obsLayer.innerHTML = "";

  // runner state
  if (els.runner){
    els.runner.classList.remove("jump","hit");
    els.runner.style.left = "16px";
  }
}

function setGameButtons({ start, tap, finish }){
  if (els.btnStartRun) els.btnStartRun.disabled = !start;
  if (els.btnTap) els.btnTap.disabled = !tap;
  if (els.btnFinishRun) els.btnFinishRun.disabled = !finish;
}

function nearestObstacleAhead(runnerX){
  let best = null;
  let bestDx = Infinity;
  for (const o of state.run.obstacles){
    if (!o || o.dead) continue;
    const dx = o.x - runnerX;
    if (dx >= 0 && dx < bestDx){
      bestDx = dx;
      best = o;
    }
  }
  return { o: best, dx: bestDx };
}

function spawnObstacle(trackW){
  if (!els.obsLayer) return;
  const el = document.createElement("div");
  el.className = "obs";

  const o = {
    el,
    x: trackW + 30,
    w: 18,
    hit: false,
    dead: false
  };

  els.obsLayer.appendChild(el);
  state.run.obstacles.push(o);
}

function updateObstacleDom(o){
  if (!o.el) return;
  o.el.style.left = `${o.x}px`;
}

function cleanupObstacles(){
  const alive = [];
  for (const o of state.run.obstacles){
    if (!o || o.dead) continue;
    alive.push(o);
  }
  state.run.obstacles = alive;
}

function addTapFX(){
  if (!els.tapBurst) return;
  els.tapBurst.classList.add("on");
  setTimeout(()=> els.tapBurst.classList.remove("on"), 120);
}

function bumpRunner(){
  // tiny bob based on speed
  if (!els.runner || !els.track) return;
  const trackW = els.track.clientWidth || 360;
  const p = clamp(state.run.distance / 220, 0, 1);
  const left = 16 + p * (trackW - 88);
  els.runner.style.left = `${left}px`;
}

function computeGrade(){
  const r = state.run;
  const score = Math.floor(r.distance) + r.perfect * 2 - r.hits * 15 + Math.max(0, r.maxCombo - 1);
  if (score >= 280) return "S";
  if (score >= 200) return "A";
  if (score >= 140) return "B";
  return "C";
}

function updateBestGrade(grade){
  const order = { "-":0, "C":1, "B":2, "A":3, "S":4 };
  const cur = localStorage.getItem("bestGrade") || "-";
  if ((order[grade] || 0) > (order[cur] || 0)){
    localStorage.setItem("bestGrade", grade);
  }
  if (els.bestGrade) els.bestGrade.textContent = localStorage.getItem("bestGrade") || "-";
}

function handleTap(now){
  if (!state.run.active) return;

  const r = state.run;
  r.taps += 1;

  // rhythm scoring
  if (r.lastTapAt){
    const dt = now - r.lastTapAt;
    const tooFast = dt < 90;
    const inCombo = dt <= RUN_COMBO_WINDOW_MS && !tooFast;

    if (inCombo){
      const isPerfect = Math.abs(dt - RUN_TARGET_INTERVAL_MS) <= RUN_PERFECT_WINDOW_MS;
      if (isPerfect){
        r.perfect += 1;
        r.combo = Math.min(25, r.combo + 2);
        beep({ freq: 740, duration: 0.055, gain: 0.05 });
        haptic(12);
      }else{
        r.combo = Math.min(25, r.combo + 1);
        beep({ freq: 520, duration: 0.045, gain: 0.035 });
      }
    }else{
      r.combo = 1;
      beep({ freq: 360, duration: 0.05, gain: 0.03 });
    }
  }else{
    // first tap
    beep({ freq: 500, duration: 0.045, gain: 0.03 });
  }

  r.maxCombo = Math.max(r.maxCombo, r.combo);
  r.lastTapAt = now;

  // speed impulse
  r.speed = Math.min(1800, r.speed + 280 + r.combo * 22);

  // jump only if an obstacle is near (timing skill)
  const trackW = els.track?.clientWidth || 360;
  const runnerX = parseFloat(els.runner?.style.left || "16") || 16;
  const runnerW = 46;
  const { o, dx } = nearestObstacleAhead(runnerX + runnerW);
  const jumpWindowPx = 120;
  if (o && dx < jumpWindowPx){
    r.jumpUntil = now + 380;
    if (els.runner){
      els.runner.classList.add("jump");
      setTimeout(()=> els.runner.classList.remove("jump"), 390);
    }
  }

  // UI
  if (els.combo) els.combo.textContent = String(r.combo);
  if (els.perfect) els.perfect.textContent = String(r.perfect);

  addTapFX();
  bumpRunner();

  // little bonus: if they are super consistent, occasionally spawn obstacle a bit faster
  r.nextObstacleAt = Math.min(r.nextObstacleAt, now + 850 + Math.random()*400);
}

function runLoop(ts){
  const r = state.run;
  if (!r.active) return;

  const now = ts;
  if (!r._lastTs) r._lastTs = ts;
  const dt = Math.min(64, ts - r._lastTs);
  r._lastTs = ts;

  const elapsed = now - r.startedAt;
  const left = Math.max(0, r.durationMs - elapsed);

  // friction + distance
  const decay = Math.pow(0.985, dt / 16.67);
  r.speed *= decay;
  r.distance += (r.speed * dt / 1000) * 0.06; // px-ish -> "meters" feel

  // UI
  if (els.dist) els.dist.textContent = String(Math.floor(r.distance));
  if (els.timeLeft) els.timeLeft.textContent = (left / 1000).toFixed(1);
  if (els.timeFill) els.timeFill.style.width = `${(elapsed / r.durationMs) * 100}%`;

  // spawn obstacles
  const trackW = els.track?.clientWidth || 360;
  if (!r.nextObstacleAt) r.nextObstacleAt = now + 900;
  if (now >= r.nextObstacleAt){
    spawnObstacle(trackW);
    const base = 850 + Math.random() * 750;
    const skill = clamp(1 - (r.combo / 30), 0.25, 1);
    r.nextObstacleAt = now + base * skill;
  }

  // move obstacles + collision
  const runnerX = parseFloat(els.runner?.style.left || "16") || 16;
  const runnerW = 46;
  const runnerBottomY = 0; // not needed
  const jumping = now < r.jumpUntil;

  for (const o of r.obstacles){
    if (!o || o.dead) continue;
    const obsSpeed = 520 + r.speed * 0.18;
    o.x -= obsSpeed * dt / 1000;

    // collision window
    const obsLeft = o.x;
    const obsRight = o.x + o.w;
    const runnerLeft = runnerX;
    const runnerRight = runnerX + runnerW;

    const overlap = obsRight > runnerLeft + 8 && obsLeft < runnerRight - 8;
    if (overlap && !o.hit){
      if (!jumping){
        o.hit = true;
        r.hits += 1;
        r.combo = 1;
        r.speed *= 0.55;

        if (els.hits) els.hits.textContent = String(r.hits);
        if (els.combo) els.combo.textContent = "1";

        if (els.runner){
          els.runner.classList.add("hit");
          setTimeout(()=> els.runner.classList.remove("hit"), 260);
        }
        beep({ freq: 220, duration: 0.09, gain: 0.06, type:"square" });
        haptic(20);
      }
    }

    // clean
    if (o.x < -40){
      o.dead = true;
      o.el?.remove();
    }else{
      updateObstacleDom(o);
    }
  }
  cleanupObstacles();

  bumpRunner();

  if (left <= 0){
    finishRun({ auto:true }).catch(()=>{});
    return;
  }

  r.raf = requestAnimationFrame(runLoop);
}

function startRun(){
  if (state.run.active) return;

  ensureAudio();
  state.run.active = true;
  state.run.startedAt = performance.now();
  state.run._lastTs = 0;
  state.run.taps = 0;
  state.run.perfect = 0;
  state.run.combo = 1;
  state.run.maxCombo = 1;
  state.run.hits = 0;
  state.run.lastTapAt = 0;
  state.run.speed = 0;
  state.run.distance = 0;
  state.run.jumpUntil = 0;
  state.run.obstacles = [];
  state.run.nextObstacleAt = 0;

  resetRunUI();
  setGameButtons({ start:false, tap:true, finish:true });

  toast("Run start! Tap ikut rhythm 🎵");

  state.run.raf = requestAnimationFrame(runLoop);
}

async function finishRun({ auto=false }={}){
  if (!state.run.active) return;

  state.run.active = false;
  cancelAnimationFrame(state.run.raf);
  state.run.raf = 0;

  setGameButtons({ start:true, tap:false, finish:false });

  const r = state.run;
  const grade = computeGrade();
  updateBestGrade(grade);

  // Bonus taps for skill (still capped by server anyway)
  const skillBonus = Math.max(0, Math.floor(r.perfect / 4) + Math.floor((r.maxCombo - 1) / 6) - r.hits);
  const tapsToSend = Math.min(300, Math.max(0, r.taps + skillBonus));

  // show local summary immediately (feels snappy)
  if (els.runResult){
    els.runResult.hidden = false;
    els.runResult.innerHTML = `
      <div class="row space" style="margin-top:0">
        <div>
          <div class="muted small">Result</div>
          <div class="grade">Grade ${grade}</div>
        </div>
        <div class="badge">${auto ? "Auto" : "Manual"}</div>
      </div>
      <div class="grid">
        <div class="item"><div><div style="font-weight:950">Distance</div><div class="muted small">meter</div></div><div style="font-weight:950">${Math.floor(r.distance)}m</div></div>
        <div class="item"><div><div style="font-weight:950">Perfect</div><div class="muted small">tap tepat</div></div><div style="font-weight:950">${r.perfect}</div></div>
        <div class="item"><div><div style="font-weight:950">Max Combo</div><div class="muted small">streak</div></div><div style="font-weight:950">x${r.maxCombo}</div></div>
        <div class="item"><div><div style="font-weight:950">Hits</div><div class="muted small">terlanggar</div></div><div style="font-weight:950">${r.hits}</div></div>
      </div>
      <div class="muted small" style="margin-top:10px">
        Server payload taps: <b>${tapsToSend}</b> (actual ${r.taps} + bonus ${skillBonus}).
      </div>
    `;
  }

  try{
    const rr = await api("/game/run", { method:"POST", body: JSON.stringify({ taps: tapsToSend }) });
    toast(`+${rr.added.gems} gems • +${rr.added.activity} activity`);
    await refreshMe();
    await refreshActivityRewards();
    await refreshCooldowns();

    if (els.runResult){
      // append server rewards
      const extra = document.createElement("div");
      extra.className = "muted small";
      extra.style.marginTop = "8px";
      extra.innerHTML = `Server reward: <b>+${rr.added.gems}g</b> • <b>+${rr.added.activity}a</b>`;
      els.runResult.appendChild(extra);
    }
  }catch(e){
    toast(e.message);
  }
}

function bindGameUI(){
  if (els.btnStartRun) els.btnStartRun.onclick = startRun;

  if (els.btnTap){
    els.btnTap.onclick = ()=>{
      ensureAudio();
      handleTap(performance.now());
    };
  }

  if (els.track){
    els.track.addEventListener("pointerdown", (e)=>{
      if (state.run.active){
        ensureAudio();
        handleTap(performance.now());
        e.preventDefault();
      }
    }, { passive:false });
  }

  if (els.btnFinishRun){
    els.btnFinishRun.onclick = ()=> finishRun({ auto:false });
  }

  if (els.btnUpgrade){
    els.btnUpgrade.onclick = async ()=>{
      try{
        const rr = await api("/game/upgrade", { method:"POST" });
        toast(`Level up! → ${rr.newLevel}`);
        await refreshMe();
        await refreshInvite();
      }catch(e){ toast(e.message); }
    };
  }

  // quick keyboard support
  window.addEventListener("keydown", (e)=>{
    if (!state.run.active) return;
    if (e.code === "Space" || e.code === "Enter"){
      ensureAudio();
      handleTap(performance.now());
      e.preventDefault();
    }
  });
}

// ============== Tasks ==============
async function onDaily(){
  busy(true, "Claiming daily treat…");
  try{
    await api("/earn/daily", { method:"POST" });
    toast("Daily treat claimed 🍬", "success");
    await refreshMe();
    await refreshActivityRewards();
    await refreshCooldowns();
  }catch(e){ toast(e.message, "error"); }
  finally{ busy(false); }
}

async function onAd(){
  busy(true, "Processing ad reward…");
  try{
    const r = await api("/earn/ad", { method:"POST" });
    toast(`+${r.coinAdded} coin • remaining ${r.remaining}`, "success");
    await refreshMe();
    await refreshCooldowns();
  }catch(e){
    toast(e.message, "error");
    // even on error, refresh status (cooldown/limit changes)
    await refreshCooldowns();
  }finally{
    busy(false);
  }
}

if (els.btnDaily) els.btnDaily.onclick = onDaily;
if (els.btnAd) els.btnAd.onclick = onAd;

// ============== Activity rewards ==============
async function refreshActivityRewards(){
  if (els.actList) setListSkeleton(els.actList, 4);
  const r = await api("/rewards/activity");
  if (!els.actList) return;
  els.actList.innerHTML = "";

  (r.items || []).forEach(it=>{
    const el = document.createElement("div");
    el.className = "item";
    const left = Math.max(0, it.need - it.progress);
    el.innerHTML = `
      <div>
        <div style="font-weight:950">Activity ${it.need}</div>
        <div class="muted small">Reward: +${it.rewardGems} gems</div>
      </div>
      <div style="text-align:right">
        <div class="muted small">${it.claimed ? "Claimed" : (it.claimable ? "Ready" : `Need ${left} more`)}</div>
        <button class="pill ${it.claimable ? "primary" : ""}" data-claim="${it.need}" ${it.claimable ? "" : "disabled"}>
          ${it.claimed ? "Done" : "Get"}
        </button>
      </div>
    `;
    els.actList.appendChild(el);
  });

  els.actList.querySelectorAll("button[data-claim]").forEach(b=>{
    b.onclick = async ()=>{
      try{
        const need = Number(b.getAttribute("data-claim"));
        const rr = await api("/rewards/activity/claim", { method:"POST", body: JSON.stringify({ need }) });
        toast(`+${rr.rewardGems} gems ✅`);
        await refreshMe();
        await refreshActivityRewards();
      }catch(e){ toast(e.message); }
    };
  });
}

if (els.btnRefreshAct) els.btnRefreshAct.onclick = refreshActivityRewards;

// ============== Invite ==============
async function refreshInvite(){
  if (els.inviteList) setListSkeleton(els.inviteList, 3);
  const me = await api("/invite/me");
  if (els.myCode) els.myCode.textContent = me.referralCode || "-";

  const st = await api("/invite/status");
  if (!els.inviteList) return;
  els.inviteList.innerHTML = "";

  if (!st.invited || !st.invited.length){
    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `<div><div style="font-weight:950">No invited friends yet</div><div class="muted small">Share ID to friends.</div></div>`;
    els.inviteList.appendChild(el);
  }else{
    st.invited.forEach(x=>{
      const el = document.createElement("div");
      el.className = "item";
      el.innerHTML = `
        <div>
          <div style="font-weight:950">${String(x.email || "Friend")}</div>
          <div class="muted small">Level ${x.level} • Joined ${new Date(x.createdAt).toLocaleDateString()}</div>
        </div>
        <div class="badge">invited</div>
      `;
      els.inviteList.appendChild(el);
    });
  }
}

if (els.btnRefreshInvite) els.btnRefreshInvite.onclick = refreshInvite;

if (els.btnCopyCode){
  els.btnCopyCode.onclick = async ()=>{
    try{
      const code = (els.myCode?.textContent || "").trim();
      await navigator.clipboard.writeText(code);
      toast("Copied ✅");
    }catch{ toast("Copy failed"); }
  };
}

if (els.btnShareLink){
  els.btnShareLink.onclick = async ()=>{
    try{
      const code = (els.myCode?.textContent || "").trim();
      const base = window.location.origin + window.location.pathname;
      const link = `${base}?ref=${encodeURIComponent(code)}`;

      if (navigator.share){
        await navigator.share({ title:"MeowRun", text:"Join MeowRun 🐾 guna link invite ni:", url: link });
        toast("Shared ✅");
      }else{
        await navigator.clipboard.writeText(link);
        toast("Link copied ✅");
      }
    }catch{ toast("Share failed"); }
  };
}

if (els.btnBind){
  els.btnBind.onclick = async ()=>{
    try{
      const code = (els.bindCode?.value || "").trim();
      await api("/invite/bind", { method:"POST", body: JSON.stringify({ code }) });
      toast("Invitation filled in ✅");
      await refreshInvite();
      await refreshMe();
    }catch(e){ toast(e.message); }
  };
}

// ============== KittyBank ==============
if (els.btnConvert){
  els.btnConvert.onclick = async ()=>{
    busy(true, "Converting…");
    try{
      const gems = Number(els.convertGems?.value || 0);
      const r = await api("/bank/convert", { method:"POST", body: JSON.stringify({ gems }) });
      toast(`Converted: +${r.coinsAdded} coin`, "success");
      await refreshMe();
    }catch(e){
      toast(e.message, "error");
    }finally{
      busy(false);
    }
  };
}

// ============== Withdraw ==============
async function refreshWithdraws(){
  if (els.wdList) setListSkeleton(els.wdList, 3);
  const r = await api("/withdraws");
  if (!els.wdList) return;
  els.wdList.innerHTML = "";
  (r.items || []).forEach(w=>{
    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML = `
      <div>
        <div style="font-weight:950">RM${Number(w.amountRM).toFixed(2)} • ${String(w.method||"").toUpperCase()}</div>
        <div class="muted small">${w.status} • ${new Date(w.createdAt).toLocaleString()}</div>
      </div>
      <div class="muted small">${w.destination || ""}</div>
    `;
    els.wdList.appendChild(el);
  });
}

if (els.btnWithdraw){
  els.btnWithdraw.onclick = async ()=>{
    busy(true, "Submitting withdraw…");
    try{
      const amountRM = Number(els.wdAmount?.value || 0);
      const method = els.wdMethod?.value;
      const destination = (els.wdDest?.value || "").trim();
      await api("/withdraws", { method:"POST", body: JSON.stringify({ amountRM, method, destination }) });
      toast("Withdraw request dihantar ✅", "success");
      await refreshMe();
      await refreshWithdraws();
    }catch(e){
      toast(e.message, "error");
    }finally{
      busy(false);
    }
  };
}

if (els.btnRefreshWD) els.btnRefreshWD.onclick = refreshWithdraws;

// ============== Ledger modal ==============
if (els.btnLedger){
  els.btnLedger.onclick = async ()=>{
    try{
      openModal(els.screenLedger);
      if (els.ledgerList) setListSkeleton(els.ledgerList, 6);

      const r = await api("/ledger");
      if (!els.ledgerList) return;
      els.ledgerList.innerHTML = "";
      (r.items || []).forEach(x=>{
        const el = document.createElement("div");
        el.className = "item";
        el.innerHTML = `
          <div>
            <div style="font-weight:950">${x.type}</div>
            <div class="muted small">${new Date(x.createdAt).toLocaleString()}</div>
          </div>
          <div style="text-align:right">
            <div style="font-weight:950">${x.deltaCoins>0?"+":""}${x.deltaCoins}c</div>
            <div class="muted small">${x.deltaGems>0?"+":""}${x.deltaGems}g • ${x.deltaActivity>0?"+":""}${x.deltaActivity}a</div>
          </div>
        `;
        els.ledgerList.appendChild(el);
      });
    }catch(e){
      toast(e.message, "error");
      closeModal(els.screenLedger);
    }
  };
}

if (els.btnCloseLedger){
  els.btnCloseLedger.onclick = ()=>{
    closeModal(els.screenLedger);
  };
}

// ============== Auth ==============
async function onLogin(isRegister){
  busy(true, isRegister ? "Registering…" : "Logging in…");
  try{
    const email = (els.email?.value || "").trim();
    const password = els.pass?.value || "";
    const r = await api(isRegister ? "/auth/register" : "/auth/login", {
      method:"POST",
      body: JSON.stringify({ email, password })
    });

    state.token = r.token;
    localStorage.setItem("token", state.token);

    showApp(true);
    window.scrollTo(0, 0);
    setActiveNav("screenGame");
    initReveal();
    updateTopButton();

    await loadConfig();
    await refreshMe();
    await refreshWithdraws();
    await refreshActivityRewards();
    await refreshInvite();
    await refreshCooldowns();
    await tryAutoBindReferral();

    toast(isRegister ? "Register berjaya 🎀" : "Login berjaya 🐾", "success");
  }catch(e){
    toast(e.message, "error");
  }finally{
    busy(false);
  }
}


if (els.btnLogin) els.btnLogin.onclick = ()=> onLogin(false);
if (els.btnReg) els.btnReg.onclick = ()=> onLogin(true);

if (els.btnLogout){
  els.btnLogout.onclick = ()=>{
    state.token = "";
    localStorage.removeItem("token");
    closeModal(els.screenLedger);
    showApp(false);
    toast("Logout", "info");
  };
}

// ============== PWA ==============
if ("serviceWorker" in navigator){
  navigator.serviceWorker.register("./sw.js").catch(()=>{});
}

let deferredPrompt = null;
if (els.btnInstall){
  window.addEventListener("beforeinstallprompt", (e)=>{
    e.preventDefault();
    deferredPrompt = e;
    els.btnInstall.hidden = false;
  });

  els.btnInstall.onclick = async ()=>{
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    els.btnInstall.hidden = true;
  };
}

// ============== Boot ==============
(async ()=>{
  // preserve referral even after install
  const ref = getRefFromUrl();
  if (ref){
    storePendingRef(ref);
    cleanRefParamFromUrl();
  }

  initPasswordToggle();
  initRipples();
  initBottomNav();
  initBackToTop();
  initReveal();
  initLedgerModal();

  loadSettingsToUI();
  bindSettingsUI();
  bindProfileUI();
  bindGameUI();

  resetRunUI();
  setGameButtons({ start:true, tap:false, finish:false });

  if (!state.token){
    showApp(false);
    return;
  }

  showApp(true);
  setActiveNav("screenGame");
  initReveal();
  updateTopButton();
  try{
    await loadConfig();
    await refreshMe();
    await refreshWithdraws();
    await refreshActivityRewards();
    await refreshInvite();
    await refreshCooldowns();
    await tryAutoBindReferral();
  }catch{
    state.token = "";
    localStorage.removeItem("token");
    showApp(false);
  }
})();
