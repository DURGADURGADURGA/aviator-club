const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';
const FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');

// ---------- storage ----------
let db = { users: {} };
try { db = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) {}
const save = () => fs.writeFileSync(FILE, JSON.stringify(db));
const hash = (p, s) => crypto.scryptSync(p, s, 32).toString('hex');
function mkUser(name, pass, isAdmin) {
  const salt = crypto.randomBytes(8).toString('hex');
  db.users[name] = { salt, hash: hash(pass, salt), diamonds: isAdmin ? 100000 : 0, admin: !!isAdmin };
  save();
}
if (!db.users.admin) mkUser('admin', ADMIN_PASS, true);

// ---------- game state ----------
const game = {
  phase: 'waiting', mult: 1, startAt: 0, crashAt: 0, countdownEnd: 0,
  bets: {}, history: [], nextCrash: null,
};
let tickTimer = null;

function randomCrash() {
  const r = Math.random();
  const v = Math.floor((100 * 0.97) / (1 - r)) / 100;
  return Math.min(Math.max(v, 1.0), 200);
}

function startBetting() {
  game.phase = 'betting';
  game.bets = {};
  game.mult = 1;
  game.countdownEnd = Date.now() + 8000;
  broadcast();
  setTimeout(startFlight, 8000);
}

function startFlight() {
  game.crashAt = game.nextCrash != null ? game.nextCrash : randomCrash();
  game.nextCrash = null;
  game.phase = 'flying';
  game.startAt = Date.now();
  tickTimer = setInterval(tick, 100);
}

function tick() {
  const m = Math.floor(Math.exp(0.1 * ((Date.now() - game.startAt) / 1000)) * 100) / 100;
  if (m >= game.crashAt) {
    clearInterval(tickTimer);
    game.mult = game.crashAt;
    game.phase = 'crashed';
    game.history.unshift(game.crashAt);
    game.history = game.history.slice(0, 15);
    broadcast();
    setTimeout(startBetting, 4000);
    return;
  }
  game.mult = m;
  for (const [name, b] of Object.entries(game.bets)) {
    if (!b.cashed && b.auto && m >= b.auto) cashOut(name);
  }
  broadcast();
}

function cashOut(name) {
  const b = game.bets[name];
  if (!b || b.cashed || game.phase !== 'flying') return;
  b.cashed = game.mult;
  const win = Math.floor(b.amount * game.mult);
  db.users[name].diamonds += win;
  b.win = win;
  save();
}

// ---------- websocket ----------
const app = express();
app.use(express.static(path.join(__dirname, 'public')));
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

function publicState() {
  return {
    type: 'state',
    phase: game.phase,
    mult: game.mult,
    countdown: Math.max(0, game.countdownEnd - Date.now()),
    history: game.history,
    bets: Object.entries(game.bets).map(([u, b]) => ({ user: u, amount: b.amount, cashed: b.cashed || 0, win: b.win || 0 })),
  };
}

function broadcast() {
  const s = JSON.stringify(publicState());
  for (const c of wss.clients) {
    if (c.readyState !== 1) continue;
    c.send(s);
    if (c.user) sendMe(c);
  }
}

function sendMe(c) {
  const u = db.users[c.user];
  if (!u) return;
  const b = game.bets[c.user];
  c.send(JSON.stringify({ type: 'me', user: c.user, diamonds: u.diamonds, admin: u.admin, bet: b ? { amount: b.amount, cashed: b.cashed || 0 } : null }));
}

function onlineSet() {
  const s = new Set();
  for (const c of wss.clients) if (c.user && c.readyState === 1) s.add(c.user);
  return s;
}

function sendAdmin(c) {
  const on = onlineSet();
  const bets = Object.entries(game.bets);
  c.send(JSON.stringify({
    type: 'admin',
    nextCrash: game.nextCrash,
    online: on.size,
    playing: bets.length,
    pool: bets.reduce((a, [, b]) => a + b.amount, 0),
    requests: (db.requests || []).filter(r => r.status === 'pending'),
    users: Object.entries(db.users).filter(([, u]) => !u.admin).map(([n, u]) => ({
      name: n, diamonds: u.diamonds, online: on.has(n), inRound: !!game.bets[n],
    })),
  }));
}

function pushAdmins() {
  for (const c of wss.clients) if (c.user && db.users[c.user] && db.users[c.user].admin && c.readyState === 1) sendAdmin(c);
}
setInterval(pushAdmins, 1500);

function notice(user, text) {
  for (const c of wss.clients) if (c.user === user && c.readyState === 1) c.send(JSON.stringify({ type: 'notice', message: text }));
}

const err = (c, m) => c.send(JSON.stringify({ type: 'error', message: m }));

wss.on('connection', (ws) => {
  ws.send(JSON.stringify(publicState()));
  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }

    if (m.type === 'signup' || m.type === 'login') {
      const name = String(m.name || '').trim().toLowerCase().slice(0, 16);
      const pass = String(m.pass || '');
      if (!/^[a-z0-9_]{3,16}$/.test(name) || pass.length < 3) return err(ws, 'Naam 3-16 letters/numbers, password kam se kam 3 characters');
      if (m.type === 'signup') {
        if (db.users[name]) return err(ws, 'Ye naam pehle se hai');
        mkUser(name, pass, false);
      } else {
        const u = db.users[name];
        if (!u || hash(pass, u.salt) !== u.hash) return err(ws, 'Naam ya password galat hai');
      }
      ws.user = name;
      sendMe(ws);
      if (db.users[name].admin) sendAdmin(ws);
      return;
    }

    if (!ws.user) return err(ws, 'Pehle login karein');
    const u = db.users[ws.user];

    if (m.type === 'bet') {
      const amount = Math.floor(Number(m.amount));
      const auto = Number(m.auto) > 1 ? Number(m.auto) : 0;
      if (game.phase !== 'betting') return err(ws, 'Abhi bet ka time nahi hai');
      if (game.bets[ws.user]) return err(ws, 'Bet pehle se lagi hai');
      if (!(amount >= 1) || amount > u.diamonds) return err(ws, 'Diamonds kam hain');
      u.diamonds -= amount;
      game.bets[ws.user] = { amount, auto };
      save();
      broadcast();
    } else if (m.type === 'cashout') {
      cashOut(ws.user);
      broadcast();
    } else if (m.type === 'req_diamonds') {
      const amt = Math.floor(Number(m.amount));
      db.requests = db.requests || [];
      if (!(amt >= 1) || amt > 1000000) return err(ws, 'Sahi amount daalein');
      if (db.requests.some(r => r.user === ws.user && r.status === 'pending')) return err(ws, 'Aapki pichli request abhi pending hai');
      db.requests.push({ id: Date.now().toString(36) + Math.floor(Math.random() * 99), user: ws.user, amount: amt, status: 'pending' });
      save();
      ws.send(JSON.stringify({ type: 'notice', message: 'Request bhej di gayi. Admin ke approve karne ka intezaar karein.' }));
      pushAdmins();
    } else if (u.admin) {
      if (m.type === 'admin_resolve') {
        const r = (db.requests || []).find(x => x.id === m.id && x.status === 'pending');
        if (r) {
          r.status = m.approve ? 'approved' : 'rejected';
          if (m.approve && db.users[r.user]) db.users[r.user].diamonds += r.amount;
          save();
          notice(r.user, m.approve ? r.amount + ' diamonds add ho gaye!' : 'Diamond request reject ho gayi.');
          broadcast();
        }
        return pushAdmins();
      }
      if (m.type === 'admin_add') {
        const t = db.users[String(m.user || '').toLowerCase()];
        const amt = Math.floor(Number(m.amount));
        if (!t || !Number.isFinite(amt)) return err(ws, 'User nahi mila');
        t.diamonds = Math.max(0, t.diamonds + amt);
        save();
      } else if (m.type === 'admin_next') {
        const v = Number(m.value);
        game.nextCrash = v >= 1 ? Math.min(v, 1000) : null;
      }
      broadcast();
      for (const c of wss.clients) if (c.user && db.users[c.user].admin && c.readyState === 1) sendAdmin(c);
    } else if (m.type === 'admin_list' && u.admin) {
      sendAdmin(ws);
    }
  });
});

server.listen(PORT, () => {
  console.log('Game chal raha hai: http://localhost:' + PORT);
  startBetting();
});
