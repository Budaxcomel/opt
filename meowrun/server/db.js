import sqlite3 from "sqlite3";

export const db = new sqlite3.Database("./data.sqlite");

export function initDb(){
  db.serialize(()=>{
    db.run(`CREATE TABLE IF NOT EXISTS users(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE,
      passHash TEXT,
      displayName TEXT DEFAULT '',
      role TEXT DEFAULT 'user',
      coins INTEGER DEFAULT 0,
      gems INTEGER DEFAULT 0,
      level INTEGER DEFAULT 1,
      activity INTEGER DEFAULT 0,
      referralCode TEXT,
      inviterId INTEGER,
      deviceHash TEXT,
      lastIp TEXT,
      lastUa TEXT,
      createdAt INTEGER
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS ledger(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER,
      type TEXT,
      deltaCoins INTEGER,
      deltaGems INTEGER,
      deltaActivity INTEGER,
      meta TEXT,
      createdAt INTEGER
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS cooldowns(
      userId INTEGER PRIMARY KEY,
      lastDaily INTEGER,
      adCountToday INTEGER,
      adDay INTEGER,
      lastAdAt INTEGER
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS withdraws(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER,
      amountRM REAL,
      method TEXT,
      destination TEXT,
      status TEXT,
      adminNote TEXT,
      createdAt INTEGER,
      updatedAt INTEGER
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS referrals(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      inviterId INTEGER,
      inviteeId INTEGER UNIQUE,
      createdAt INTEGER
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS referral_events(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      inviterId INTEGER,
      inviteeId INTEGER,
      eventKey TEXT,
      createdAt INTEGER,
      UNIQUE(inviterId, inviteeId, eventKey)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS claims(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER,
      key TEXT,
      day INTEGER,
      createdAt INTEGER,
      UNIQUE(userId, key, day)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS login_attempts(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip TEXT,
      email TEXT,
      failCount INTEGER DEFAULT 0,
      lockedUntil INTEGER DEFAULT 0,
      updatedAt INTEGER
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS audit(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER,
      ip TEXT,
      ua TEXT,
      action TEXT,
      meta TEXT,
      createdAt INTEGER
    )`);

    db.run(`ALTER TABLE users ADD COLUMN deviceHash TEXT`, ()=>{});
    db.run(`ALTER TABLE users ADD COLUMN lastIp TEXT`, ()=>{});
    db.run(`ALTER TABLE users ADD COLUMN lastUa TEXT`, ()=>{});
  });
}

export function run(sql, params=[]){
  return new Promise((res,rej)=>{
    db.run(sql, params, function(err){
      if(err) rej(err); else res(this);
    });
  });
}

export function get(sql, params=[]){
  return new Promise((res,rej)=>{
    db.get(sql, params, (err,row)=>{
      if(err) rej(err); else res(row);
    });
  });
}

export function all(sql, params=[]){
  return new Promise((res,rej)=>{
    db.all(sql, params, (err,rows)=>{
      if(err) rej(err); else res(rows);
    });
  });
}
