import "dotenv/config";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { initDb, run, get, all } from "./db.js";

/* =========================
   BOOT
========================= */
const app = express();
app.use(cors());
app.use(express.json());
initDb();

const PORT = Number(process.env.PORT || 8080);
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";

/* =========================
   ECONOMY CONFIG
========================= */
const COIN_TO_RM_RATE = Number(process.env.COIN_TO_RM_RATE || 1000);
const MIN_WITHDRAW_RM = Number(process.env.MIN_WITHDRAW_RM || 10);

const DAILY_LIMIT_AD_REWARDS = Number(process.env.DAILY_LIMIT_AD_REWARDS || 50);
const COIN_PER_AD = Number(process.env.COIN_PER_AD || 35);
const AD_COOLDOWN_SEC = Number(process.env.AD_COOLDOWN_SEC || 30);

const GEM_PER_RUN = Number(process.env.GEM_PER_RUN || 3);
const ACTIVITY_PER_RUN = Number(process.env.ACTIVITY_PER_RUN || 10);
const GEM_TO_COIN_RATE = Number(process.env.GEM_TO_COIN_RATE || 10);
const MIN_LEVEL_TO_CONVERT = Number(process.env.MIN_LEVEL_TO_CONVERT || 10);

const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || "").toLowerCase();
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || "");

/* =========================
   INVITE & ACTIVITY CONFIG
========================= */
const ACTIVITY_MILESTONES = [
  { need: 60, rewardGems: 30 },
  { need: 120, rewardGems: 40 },
  { need: 240, rewardGems: 60 },
  { need: 420, rewardGems: 90 },
  { need: 600, rewardGems: 120 },
  { need: 780, rewardGems: 150 },
  { need: 960, rewardGems: 180 },
  { need: 1140, rewardGems: 220 },
];

const INVITE_LEVEL_REWARDS = [
  { level: 5, rewardCoins: 200 },
  { level: 20, rewardCoins: 200 },
  { level: 50, rewardCoins: 200 },
  { level: 80, rewardCoins: 200 },
];

/* =========================
   HELPERS
========================= */
function now(){ return Date.now(); }
function dayStamp(ts){ return Math.floor(ts / 86400000); }
function coinsToRM(coins){ return Number(coins||0) / COIN_TO_RM_RATE; }
function rmToCoins(rm){ return Math.ceil(Number(rm||0) * COIN_TO_RM_RATE); }

function signToken(payload){
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

function genReferralCode(id){
  return String(10000000 + (id % 90000000));
}

function sha256(s){
  return crypto.createHash("sha256").update(String(s)).digest("hex");
}

function clientIp(req){
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length) return xff.split(",")[0].trim();
  return req.socket?.remoteAddress || "0.0.0.0";
}

function userAgent(req){
  return String(req.headers["user-agent"] || "").slice(0, 220);
}

function deviceHeader(req){
  return String(req.headers["x-device"] || "").trim();
}

/* =========================
   SIMPLE RATE LIMIT (in-memory)
========================= */
const buckets = new Map();

function rateLimit({ keyFn, limit, windowMs, message }){
  return (req,res,next)=>{
    const k = keyFn(req);
    const t = now();
    const b = buckets.get(k) || { count:0, reset:t + windowMs };
    if (t > b.reset){ b.count = 0; b.reset = t + windowMs; }
    b.count += 1;
    buckets.set(k, b);
    if (b.count > limit){
      return res.status(429).json({ error: message || "Too many requests" });
    }
    next();
  };
}

const rlGlobal = rateLimit({
  keyFn: (req)=> `g:${clientIp(req)}`,
  limit: 300,
  windowMs: 60_000,
  message: "Slow down"
});

const rlAuth = rateLimit({
  keyFn: (req)=> `auth:${clientIp(req)}`,
  limit: 20,
  windowMs: 10 * 60_000,
  message: "Too many auth attempts"
});

const rlAd = rateLimit({
  keyFn: (req)=> `ad:${req.user?.userId || clientIp(req)}`,
  limit: 80,
  windowMs: 60_000,
  message: "Too many ad claims"
});

const rlWithdraw = rateLimit({
  keyFn: (req)=> `wd:${req.user?.userId || clientIp(req)}`,
  limit: 6,
  windowMs: 60 * 60_000,
  message: "Withdraw too frequently"
});

app.use(rlGlobal);

/* =========================
   MIDDLEWARE
========================= */
function auth(req,res,next){
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  try{
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  }catch{
    res.status(401).json({ error:"Unauthorized" });
  }
}

function adminOnly(req,res,next){
  if (!req.user || req.user.role !== "admin")
    return res.status(403).json({ error:"Forbidden" });
  next();
}

/* =========================
   DB HELPERS
========================= */
async function ensureCooldownRow(userId){
  const row = await get("SELECT * FROM cooldowns WHERE userId=?", [userId]);
  if (!row){
    await run(
      "INSERT INTO cooldowns(userId,lastDaily,adCountToday,adDay,lastAdAt) VALUES(?,?,?,?,?)",
      [userId,0,0,dayStamp(now()),0]
    );
  }
}

async function addLedger(userId, type, dc, dg, da, meta=""){
  await run(
    "INSERT INTO ledger(userId,type,deltaCoins,deltaGems,deltaActivity,meta,createdAt) VALUES(?,?,?,?,?,?,?)",
    [userId, type, dc, dg, da, meta, now()]
  );
  await run(
    "UPDATE users SET coins=coins+?, gems=gems+?, activity=activity+? WHERE id=?",
    [dc, dg, da, userId]
  );
}

async function audit(req, userId, action, meta=""){
  try{
    await run(
      "INSERT INTO audit(userId,ip,ua,action,meta,createdAt) VALUES(?,?,?,?,?,?)",
      [userId || null, clientIp(req), userAgent(req), action, meta, now()]
    );
  }catch{}
}

/* =========================
   LOGIN LOCK (brute-force protection)
========================= */
async function getLoginAttempt(ip, email){
  return await get(
    "SELECT id,failCount,lockedUntil FROM login_attempts WHERE ip=? AND email=?",
    [ip, email]
  );
}

async function bumpFail(ip, email){
  const t = now();
  const row = await getLoginAttempt(ip, email);
  if (!row){
    await run(
      "INSERT INTO login_attempts(ip,email,failCount,lockedUntil,updatedAt) VALUES(?,?,?,?,?)",
      [ip, email, 1, 0, t]
    );
    return;
  }
  const newCount = Number(row.failCount||0) + 1;

  let lockedUntil = Number(row.lockedUntil||0);
  if (newCount >= 12) lockedUntil = t + 60 * 60_000;
  else if (newCount >= 8) lockedUntil = t + 15 * 60_000;

  await run(
    "UPDATE login_attempts SET failCount=?, lockedUntil=?, updatedAt=? WHERE id=?",
    [newCount, lockedUntil, t, row.id]
  );
}

async function clearFail(ip, email){
  const row = await getLoginAttempt(ip, email);
  if (!row) return;
  await run(
    "UPDATE login_attempts SET failCount=0, lockedUntil=0, updatedAt=? WHERE id=?",
    [now(), row.id]
  );
}

/* =========================
   DEVICE BINDING
========================= */
async function enforceDevice(req, userId){
  const raw = deviceHeader(req);
  if (!raw) return { ok:false, error:"Missing device header" };
  const dHash = sha256(raw);

  const u = await get("SELECT deviceHash FROM users WHERE id=?", [userId]);
  if (!u) return { ok:false, error:"User not found" };

  if (!u.deviceHash){
    await run("UPDATE users SET deviceHash=? WHERE id=?", [dHash, userId]);
    return { ok:true, bound:true };
  }
  if (u.deviceHash !== dHash){
    return { ok:false, error:"Device mismatch" };
  }
  return { ok:true, bound:false };
}

/* =========================
   ADMIN BOOTSTRAP
========================= */
async function bootstrapAdmin(){
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
  const exists = await get("SELECT id FROM users WHERE email=?", [ADMIN_EMAIL]);
  if (exists) return;

  const passHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const r = await run(
    "INSERT INTO users(email,passHash,role,createdAt) VALUES(?,?,?,?)",
    [ADMIN_EMAIL, passHash, "admin", now()]
  );
  await run("UPDATE users SET referralCode=? WHERE id=?", [genReferralCode(r.lastID), r.lastID]);
  await ensureCooldownRow(r.lastID);
}
bootstrapAdmin().catch(()=>{});

/* =========================
   CONFIG
========================= */
app.get("/config", (req,res)=>{
  res.json({
    app: "MeowRun",
    currency: "RM",
    coinToRmRate: COIN_TO_RM_RATE,
    minWithdrawRm: MIN_WITHDRAW_RM,
    minWithdrawCoins: rmToCoins(MIN_WITHDRAW_RM),
    dailyAdLimit: DAILY_LIMIT_AD_REWARDS,
    coinPerAd: COIN_PER_AD,
    adCooldownSec: AD_COOLDOWN_SEC,
    gemPerRun: GEM_PER_RUN,
    activityPerRun: ACTIVITY_PER_RUN,
    gemToCoinRate: GEM_TO_COIN_RATE,
    minLevelToConvert: MIN_LEVEL_TO_CONVERT,
    activityMilestones: ACTIVITY_MILESTONES,
    inviteLevelRewards: INVITE_LEVEL_REWARDS
  });
});

/* =========================
   AUTH
========================= */
app.post("/auth/register", rlAuth, async (req,res)=>{
  try{
    const ip = clientIp(req);
    const ua = userAgent(req);
    const dev = deviceHeader(req);
    if (!dev) return res.status(400).json({ error:"Missing device header" });

    const { email, password } = req.body || {};
    const e = String(email||"").toLowerCase().trim();
    const p = String(password||"");
    if (!e || !p) return res.status(400).json({ error:"Email & password required" });

    const passHash = await bcrypt.hash(p, 10);
    const r = await run(
      "INSERT INTO users(email,passHash,createdAt,deviceHash,lastIp,lastUa) VALUES(?,?,?,?,?,?)",
      [e, passHash, now(), sha256(dev), ip, ua]
    );
    await run("UPDATE users SET referralCode=? WHERE id=?", [genReferralCode(r.lastID), r.lastID]);
    await ensureCooldownRow(r.lastID);

    await audit(req, r.lastID, "register", "");
    res.json({ token: signToken({ userId:r.lastID, role:"user" }) });
  }catch{
    res.status(400).json({ error:"Register gagal" });
  }
});

app.post("/auth/login", rlAuth, async (req,res)=>{
  const ip = clientIp(req);
  const ua = userAgent(req);

  const { email, password } = req.body || {};
  const e = String(email||"").toLowerCase().trim();
  const p = String(password||"");

  const la = await getLoginAttempt(ip, e);
  if (la && Number(la.lockedUntil||0) > now()){
    return res.status(429).json({ error:"Too many fails. Try later." });
  }

  const u = await get("SELECT id,passHash,role FROM users WHERE email=?", [e]);
  if (!u){
    await bumpFail(ip, e);
    return res.status(400).json({ error:"Login gagal" });
  }

  const ok = await bcrypt.compare(p, u.passHash);
  if (!ok){
    await bumpFail(ip, e);
    await audit(req, u.id, "login_fail", "");
    return res.status(400).json({ error:"Login gagal" });
  }

  const d = await enforceDevice(req, u.id);
  if (!d.ok){
    await audit(req, u.id, "device_mismatch", "");
    return res.status(403).json({ error:"Device mismatch" });
  }

  await clearFail(ip, e);
  await ensureCooldownRow(u.id);
  await run("UPDATE users SET lastIp=?, lastUa=? WHERE id=?", [ip, ua, u.id]);

  await audit(req, u.id, "login_ok", d.bound ? "device_bound" : "");
  res.json({ token: signToken({ userId:u.id, role:u.role }) });
});

/* =========================
   DEVICE GATE FOR AUTHED ROUTES
========================= */
async function deviceGate(req,res,next){
  const dev = deviceHeader(req);
  if (!dev) return res.status(400).json({ error:"Missing device header" });
  const dHash = sha256(dev);
  const u = await get("SELECT deviceHash FROM users WHERE id=?", [req.user.userId]);
  if (u?.deviceHash && u.deviceHash !== dHash) return res.status(403).json({ error:"Device mismatch" });
  next();
}

/* =========================
   ME / PROFILE / LEDGER
========================= */
app.get("/me", auth, deviceGate, async (req,res)=>{
  const u = await get(
    "SELECT id,email,displayName,role,coins,gems,level,activity,createdAt FROM users WHERE id=?",
    [req.user.userId]
  );
  res.json({ user:{ ...u, rm: coinsToRM(u.coins) } });
});

app.post("/profile", auth, deviceGate, async (req,res)=>{
  await run(
    "UPDATE users SET displayName=? WHERE id=?",
    [String(req.body.displayName||"").slice(0,24), req.user.userId]
  );
  res.json({ ok:true });
});

app.get("/ledger", auth, deviceGate, async (req,res)=>{
  const items = await all(
    "SELECT type,deltaCoins,deltaGems,deltaActivity,meta,createdAt FROM ledger WHERE userId=? ORDER BY id DESC LIMIT 50",
    [req.user.userId]
  );
  res.json({ items });
});

/* =========================
   GAME
========================= */
app.post("/game/run", auth, deviceGate, async (req,res)=>{
  const safeTaps = Math.max(0, Math.min(300, Number(req.body.taps)||0));
  const dg = GEM_PER_RUN + Math.floor(safeTaps/100);
  const da = ACTIVITY_PER_RUN + Math.floor(safeTaps/50);
  await addLedger(req.user.userId,"run_complete",0,dg,da,JSON.stringify({taps:safeTaps}));
  res.json({ ok:true, added:{ gems:dg, activity:da } });
});

app.post("/game/upgrade", auth, deviceGate, async (req,res)=>{
  const u = await get("SELECT level,gems,inviterId FROM users WHERE id=?", [req.user.userId]);
  const cost = 20 + u.level*5;
  if (u.gems < cost) return res.status(400).json({ error:"Gems tak cukup" });

  await run("UPDATE users SET level=level+1, gems=gems-? WHERE id=?", [cost, req.user.userId]);
  await addLedger(req.user.userId,"level_up",0,-cost,0,"");

  const newLevel = u.level + 1;
  if (u.inviterId){
    for (const r of INVITE_LEVEL_REWARDS){
      if (r.level === newLevel){
        try{
          await run(
            "INSERT INTO referral_events(inviterId,inviteeId,eventKey,createdAt) VALUES(?,?,?,?)",
            [u.inviterId, req.user.userId, `lv_${r.level}`, now()]
          );
          await addLedger(u.inviterId,"invite_level_reward",r.rewardCoins,0,0,"");
        }catch{}
      }
    }
  }
  res.json({ ok:true, newLevel });
});

/* =========================
   KITTY BANK
========================= */
app.post("/bank/convert", auth, deviceGate, async (req,res)=>{
  const want = Math.floor(Number(req.body.gems)||0);
  const u = await get("SELECT level,gems FROM users WHERE id=?", [req.user.userId]);
  if (u.level < MIN_LEVEL_TO_CONVERT) return res.status(400).json({ error:"Level belum unlock" });
  const take = Math.min(want, u.gems);
  const coins = Math.floor(take / GEM_TO_COIN_RATE) * GEM_TO_COIN_RATE;
  if (coins <= 0) return res.status(400).json({ error:"Jumlah terlalu kecil" });
  await addLedger(req.user.userId,"bank_convert",coins,-coins,0,"");
  res.json({ ok:true, coinsAdded:coins });
});

/* =========================
   ACTIVITY REWARDS
========================= */
app.get("/rewards/activity", auth, deviceGate, async (req,res)=>{
  const u = await get("SELECT activity FROM users WHERE id=?", [req.user.userId]);
  const items = [];
  for (const m of ACTIVITY_MILESTONES){
    const key = `activity_${m.need}`;
    const claimed = await get(
      "SELECT id FROM claims WHERE userId=? AND key=? AND day=0",
      [req.user.userId, key]
    );
    items.push({
      need:m.need,
      rewardGems:m.rewardGems,
      progress:u.activity,
      claimable:u.activity>=m.need && !claimed,
      claimed:!!claimed
    });
  }
  res.json({ activity:u.activity, items });
});

app.post("/rewards/activity/claim", auth, deviceGate, async (req,res)=>{
  const need = Number(req.body.need);
  const m = ACTIVITY_MILESTONES.find(x=>x.need===need);
  if (!m) return res.status(400).json({ error:"Invalid" });

  const u = await get("SELECT activity FROM users WHERE id=?", [req.user.userId]);
  if ((u?.activity||0) < need) return res.status(400).json({ error:"Not enough activity" });

  try{
    await run(
      "INSERT INTO claims(userId,key,day,createdAt) VALUES(?,?,0,?)",
      [req.user.userId, `activity_${need}`, now()]
    );
  }catch{
    return res.status(400).json({ error:"Already claimed" });
  }
  await addLedger(req.user.userId,"activity_milestone",0,m.rewardGems,0,"");
  res.json({ ok:true, rewardGems:m.rewardGems });
});

/* =========================
   INVITE SYSTEM
========================= */
app.get("/invite/me", auth, deviceGate, async (req,res)=>{
  const u = await get("SELECT referralCode,inviterId FROM users WHERE id=?", [req.user.userId]);
  res.json({ referralCode:u.referralCode, inviterId:u.inviterId||null });
});

app.post("/invite/bind", auth, deviceGate, async (req,res)=>{
  const code = String(req.body.code||"").trim();
  if (!/^\d{6,10}$/.test(code)) return res.status(400).json({ error:"Invalid code" });

  const me = await get("SELECT id,inviterId,referralCode FROM users WHERE id=?", [req.user.userId]);
  if (me.inviterId) return res.status(400).json({ error:"Already bound" });
  if (me.referralCode === code) return res.status(400).json({ error:"Self invite" });

  const inviter = await get("SELECT id FROM users WHERE referralCode=?", [code]);
  if (!inviter) return res.status(404).json({ error:"Code not found" });

  await run("UPDATE users SET inviterId=? WHERE id=?", [inviter.id, me.id]);
  await run("INSERT INTO referrals(inviterId,inviteeId,createdAt) VALUES(?,?,?)", [inviter.id, me.id, now()]);
  await addLedger(inviter.id,"invite_bind_bonus",50,0,0,"");
  res.json({ ok:true });
});

app.get("/invite/status", auth, deviceGate, async (req,res)=>{
  const invited = await all(`
    SELECT u.email,u.level,r.createdAt
    FROM referrals r JOIN users u ON u.id=r.inviteeId
    WHERE r.inviterId=?
    ORDER BY r.id DESC
    LIMIT 50
  `,[req.user.userId]);
  res.json({ invited });
});

/* =========================
   DAILY + ADS
========================= */

// Cooldown/status helper untuk UI (lebih "premium")
app.get("/cooldowns", auth, deviceGate, async (req,res)=>{
  await ensureCooldownRow(req.user.userId);
  const cd = await get("SELECT * FROM cooldowns WHERE userId=?", [req.user.userId]);

  const t = now();
  const today = dayStamp(t);

  // daily
  const lastDaily = Number(cd?.lastDaily || 0);
  const dailyReadyInMs = Math.max(0, 86400000 - (t - lastDaily));

  // ads
  let count = Number(cd?.adCountToday || 0);
  let day = Number(cd?.adDay || today);
  if (day !== today){ day = today; count = 0; }
  const remaining = Math.max(0, DAILY_LIMIT_AD_REWARDS - count);
  const lastAdAt = Number(cd?.lastAdAt || 0);
  const adReadyInMs = Math.max(0, (AD_COOLDOWN_SEC*1000) - (t - lastAdAt));

  res.json({
    now: t,
    daily:{
      ready: dailyReadyInMs === 0,
      readyInMs: dailyReadyInMs,
      nextAt: dailyReadyInMs ? (t + dailyReadyInMs) : t
    },
    ad:{
      remaining,
      cooldownSec: AD_COOLDOWN_SEC,
      ready: (remaining > 0) && (adReadyInMs === 0),
      readyInMs: adReadyInMs,
      nextAt: adReadyInMs ? (t + adReadyInMs) : t
    }
  });
});

app.post("/earn/daily", auth, deviceGate, async (req,res)=>{
  await ensureCooldownRow(req.user.userId);
  const cd = await get("SELECT lastDaily FROM cooldowns WHERE userId=?", [req.user.userId]);
  if (now() - Number(cd.lastDaily||0) < 86400000)
    return res.status(400).json({ error:"Not ready" });
  await run("UPDATE cooldowns SET lastDaily=? WHERE userId=?", [now(), req.user.userId]);
  await addLedger(req.user.userId,"daily_treat",0,10,20,"");
  res.json({ ok:true });
});

app.post("/earn/ad", auth, deviceGate, rlAd, async (req,res)=>{
  await ensureCooldownRow(req.user.userId);
  const cd = await get("SELECT * FROM cooldowns WHERE userId=?", [req.user.userId]);

  const today = dayStamp(now());
  let count = Number(cd.adCountToday||0);
  let day = Number(cd.adDay||today);

  if (day !== today){ day = today; count = 0; }
  if (count >= DAILY_LIMIT_AD_REWARDS)
    return res.status(400).json({ error:"Had iklan harian penuh" });

  if (now() - Number(cd.lastAdAt||0) < AD_COOLDOWN_SEC*1000)
    return res.status(400).json({ error:`Cooldown ${AD_COOLDOWN_SEC}s` });

  count++;
  await run(
    "UPDATE cooldowns SET adCountToday=?, adDay=?, lastAdAt=? WHERE userId=?",
    [count, day, now(), req.user.userId]
  );
  await addLedger(req.user.userId,"rewarded_ad",COIN_PER_AD,0,0,"");
  res.json({ ok:true, coinAdded:COIN_PER_AD, remaining:DAILY_LIMIT_AD_REWARDS-count });
});

/* =========================
   WITHDRAW + ADMIN
========================= */
app.get("/withdraws", auth, deviceGate, async (req,res)=>{
  const items = await all(
    "SELECT id,amountRM,method,destination,status,adminNote,createdAt,updatedAt FROM withdraws WHERE userId=? ORDER BY id DESC LIMIT 30",
    [req.user.userId]
  );
  res.json({ items });
});

app.post("/withdraws", auth, deviceGate, rlWithdraw, async (req,res)=>{
  const { amountRM, method, destination } = req.body || {};
  const amt = Number(amountRM||0);
  const m = String(method||"");
  const dest = String(destination||"").trim();

  if (!amt || amt < MIN_WITHDRAW_RM) return res.status(400).json({ error:`Minimum withdraw RM${MIN_WITHDRAW_RM}` });
  if (!["paypal","tng"].includes(m)) return res.status(400).json({ error:"Method invalid" });
  if (!dest) return res.status(400).json({ error:"Destination required" });

  const u = await get("SELECT coins FROM users WHERE id=?", [req.user.userId]);
  if (coinsToRM(u.coins) + 1e-9 < amt) return res.status(400).json({ error:"Coin tak cukup" });

  const deduct = rmToCoins(amt);
  await addLedger(req.user.userId, "withdraw_hold", -deduct, 0, 0, JSON.stringify({ amountRM: amt, method: m }));
  await run(
    "INSERT INTO withdraws(userId,amountRM,method,destination,status,adminNote,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?)",
    [req.user.userId, amt, m, dest.slice(0,64), "pending", "", now(), now()]
  );
  await audit(req, req.user.userId, "withdraw_submit", JSON.stringify({ amountRM: amt, method: m }));
  res.json({ ok:true });
});

app.post("/admin/login", rlAuth, async (req,res)=>{
  const { email, password } = req.body || {};
  const e = String(email||"").toLowerCase().trim();
  const u = await get("SELECT id,passHash,role FROM users WHERE email=?", [e]);
  if (!u || u.role !== "admin") return res.status(400).json({ error:"Login gagal" });
  const ok = await bcrypt.compare(String(password||""), u.passHash);
  if (!ok) return res.status(400).json({ error:"Login gagal" });
  await audit(req, u.id, "admin_login", "");
  res.json({ token: signToken({ userId:u.id, role:"admin" }) });
});

app.get("/admin/withdraws", auth, adminOnly, async (req,res)=>{
  const items = await all(`
    SELECT w.id,w.userId,w.amountRM,w.method,w.destination,w.status,w.adminNote,w.createdAt,w.updatedAt,
           u.email AS email
    FROM withdraws w JOIN users u ON u.id=w.userId
    ORDER BY w.id DESC
    LIMIT 200
  `);
  res.json({ items });
});

app.post("/admin/withdraws/:id/paid", auth, adminOnly, async (req,res)=>{
  const id = Number(req.params.id||0);
  const note = String((req.body||{}).adminNote||"").slice(0,120);
  const w = await get("SELECT * FROM withdraws WHERE id=?", [id]);
  if (!w) return res.status(404).json({ error:"Not found" });
  if (w.status !== "pending") return res.status(400).json({ error:"Not pending" });

  await run("UPDATE withdraws SET status='paid', adminNote=?, updatedAt=? WHERE id=?", [note, now(), id]);
  await audit(req, w.userId, "withdraw_paid", JSON.stringify({ withdrawId:id, amountRM:w.amountRM }));
  res.json({ ok:true });
});

app.post("/admin/withdraws/:id/reject", auth, adminOnly, async (req,res)=>{
  const id = Number(req.params.id||0);
  const note = String((req.body||{}).adminNote||"").slice(0,120);
  const w = await get("SELECT * FROM withdraws WHERE id=?", [id]);
  if (!w) return res.status(404).json({ error:"Not found" });
  if (w.status !== "pending") return res.status(400).json({ error:"Not pending" });

  const refund = rmToCoins(w.amountRM);
  await addLedger(w.userId, "withdraw_refund", refund, 0, 0, JSON.stringify({ withdrawId:id }));
  await run("UPDATE withdraws SET status='rejected', adminNote=?, updatedAt=? WHERE id=?", [note, now(), id]);
  await audit(req, w.userId, "withdraw_reject", JSON.stringify({ withdrawId:id, amountRM:w.amountRM }));
  res.json({ ok:true });
});

app.post("/admin/users/:id/reset-device", auth, adminOnly, async (req,res)=>{
  const id = Number(req.params.id||0);
  await run("UPDATE users SET deviceHash=NULL WHERE id=?", [id]);
  await audit(req, id, "device_reset", "");
  res.json({ ok:true });
});

/* =========================
   ANALYTICS (ADMIN ONLY)
========================= */
app.get("/admin/analytics", auth, adminOnly, async (req,res)=>{
  const since24h = now() - 86400000;
  const since7d  = now() - 7*86400000;

  const [
    totalUsers,
    newUsers24h,
    dau,
    totalRuns,
    runs24h,
    ads24h,
    ads7d,
    coinsMinted,
    coinsWithdrawn,
    pendingWithdraw
  ] = await Promise.all([
    get("SELECT COUNT(*) c FROM users"),
    get("SELECT COUNT(*) c FROM users WHERE createdAt>=?", [since24h]),
    get("SELECT COUNT(DISTINCT userId) c FROM ledger WHERE createdAt>=?", [since24h]),
    get("SELECT COUNT(*) c FROM ledger WHERE type='run_complete'"),
    get("SELECT COUNT(*) c FROM ledger WHERE type='run_complete' AND createdAt>=?", [since24h]),
    get("SELECT COUNT(*) c FROM ledger WHERE type='rewarded_ad' AND createdAt>=?", [since24h]),
    get("SELECT COUNT(*) c FROM ledger WHERE type='rewarded_ad' AND createdAt>=?", [since7d]),
    get("SELECT SUM(deltaCoins) s FROM ledger WHERE deltaCoins>0"),
    get("SELECT SUM(amountRM) s FROM withdraws WHERE status='paid'"),
    get("SELECT SUM(amountRM) s FROM withdraws WHERE status='pending'")
  ]);

  const estPerAdRM = 0.02;
  const estRevenue = (Number(ads7d?.c||0) * estPerAdRM);
  const payoutRM = Number(coinsWithdrawn?.s || 0);
  const pendingRM = Number(pendingWithdraw?.s || 0);

  res.json({
    users:{
      total: Number(totalUsers?.c || 0),
      new24h: Number(newUsers24h?.c || 0),
      dau24h: Number(dau?.c || 0)
    },
    gameplay:{
      totalRuns: Number(totalRuns?.c || 0),
      runs24h: Number(runs24h?.c || 0)
    },
    ads:{
      ads24h: Number(ads24h?.c || 0),
      ads7d: Number(ads7d?.c || 0),
      estRevenueRM: Number(estRevenue.toFixed(2))
    },
    economy:{
      coinsMinted: Number(coinsMinted?.s || 0),
      withdrawnRM: Number(payoutRM.toFixed(2)),
      pendingRM: Number(pendingRM.toFixed(2)),
      estProfitRM: Number((estRevenue - payoutRM).toFixed(2))
    }
  });
});

/* =========================
   START
========================= */
app.listen(PORT, ()=>{
  console.log(`🐱 MeowRun API running at http://localhost:${PORT}`);
});
