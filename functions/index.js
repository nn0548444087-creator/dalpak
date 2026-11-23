// Sends phone notifications (Firebase Cloud Messaging) when something happens in the shop's database:
// a private message, a new task, a change in someone's shift, a new reel, or a new alert for the managers.
// Every phone saves its delivery token in pushTokens/{token} = { emp, token, platform }.
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();
const db = getFirestore();
const SITE = 'https://nn0548444087-creator.github.io/dalpak/';
const WATCHED = ['messages', 'tasks', 'shifts', 'reels', 'notifications', 'pushTests', 'shiftGeo', 'signups', 'bgGames', 'coinEvents', 'duels'];

const first = n => String(n || '').trim().split(/\s+/)[0] || '';
const cut = (t, n = 120) => { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
const hm = ms => new Date(ms).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' });
const dm = ms => new Date(ms).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', timeZone: 'Asia/Jerusalem' });

async function empName(id) {
  if (!id) return '';
  const d = await db.collection('employees').doc(String(id)).get();
  return d.exists ? d.data().name || '' : '';
}

// Delivery tokens of these employees (Firestore "in" takes up to 30 values at a time).
async function tokensOf(empIds) {
  const ids = [...new Set(empIds.filter(Boolean).map(String))], out = [];
  for (let i = 0; i < ids.length; i += 30) {
    const snap = await db.collection('pushTokens').where('emp', 'in', ids.slice(i, i + 30)).get();
    snap.forEach(d => out.push(d.id));
  }
  return out;
}

/* ---------- each employee's notification settings (pushPrefs/{employee}) ---------- */
const PP_DEF = { msg: true, preview: true, task: true, shift: true, req: true, reels: true, alerts: true, quiet: false, quietFrom: '22:00', quietTo: '07:00', shabbat: false };
async function prefsOf(empIds) {
  const ids = [...new Set(empIds.filter(Boolean).map(String))];
  if (!ids.length) return {};
  const snaps = await db.getAll(...ids.map(id => db.collection('pushPrefs').doc(id)));
  return Object.fromEntries(snaps.map((d, i) => [ids[i], { ...PP_DEF, ...(d.exists ? d.data() : {}) }]));
}
// Date and time in Israel.
function il(ms) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', weekday: 'short', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return { wd: p.weekday, y: +p.year, m: +p.month, d: +p.day, min: (+p.hour % 24) * 60 + +p.minute };
}
// Sunset in Jerusalem on a calendar day (standard sunrise equation, about a minute of accuracy).
function sunsetJerusalem(y, m, d) {
  const lat = 31.778, lng = 35.235, r = Math.PI / 180;
  const n = Math.round(Date.UTC(y, m - 1, d, 12) / 864e5 + 2440587.5 - 2451545.0 + 0.0008);
  const J = n - lng / 360, M = (357.5291 + 0.98560028 * J) % 360;
  const C = 1.9148 * Math.sin(M * r) + 0.02 * Math.sin(2 * M * r) + 0.0003 * Math.sin(3 * M * r);
  const L = (M + C + 180 + 102.9372) % 360;
  const transit = 2451545.0 + J + 0.0053 * Math.sin(M * r) - 0.0069 * Math.sin(2 * L * r);
  const dec = Math.asin(Math.sin(L * r) * Math.sin(23.44 * r));
  const w = Math.acos((Math.sin(-0.833 * r) - Math.sin(lat * r) * Math.sin(dec)) / (Math.cos(lat * r) * Math.cos(dec))) / r;
  return (transit + w / 360 - 2440587.5) * 864e5;
}
// From candle lighting (Jerusalem custom: 40 minutes before sunset on Friday) until Shabbat ends (about 40 minutes after sunset on Saturday).
function isShabbat(ms) {
  const t = il(ms);
  if (t.wd === 'Fri') return ms >= sunsetJerusalem(t.y, t.m, t.d) - 40 * 60000;
  if (t.wd === 'Sat') return ms < sunsetJerusalem(t.y, t.m, t.d) + 40 * 60000;
  return false;
}
function inQuiet(p, ms) {
  const hm = s => { const [h, m] = String(s || '').split(':').map(Number); return h * 60 + m; };
  const now = il(ms).min, a = hm(p.quietFrom), b = hm(p.quietTo);
  if (isNaN(a) || isNaN(b) || a === b) return false;
  return a < b ? now >= a && now < b : now >= a || now < b;
}
function allowed(p, kind, ms) {
  if (kind && p[kind] === false) return false;
  if (p.quiet && inQuiet(p, ms)) return false;
  if (p.shabbat && isShabbat(ms)) return false;
  return true;
}

// kind: which setting controls this notification (msg · task · shift · req · reels · alerts); null for a test.
async function send(empIds, title, body, data = {}, kind = null, bodyIfHidden = null) {
  const now = Date.now(), prefs = await prefsOf(empIds);
  const to = kind === null ? empIds : empIds.filter(id => allowed(prefs[String(id)] || PP_DEF, kind, now));
  // Employees who hide message text get the short version.
  if (bodyIfHidden !== null) {
    const hide = to.filter(id => (prefs[String(id)] || PP_DEF).preview === false), show = to.filter(id => !hide.includes(id));
    if (hide.length) await deliver(hide, title, bodyIfHidden, data);
    return deliver(show, title, body, data);
  }
  return deliver(to, title, body, data);
}

async function deliver(empIds, title, body, data = {}) {
  const tokens = await tokensOf(empIds);
  if (!tokens.length) return;
  const q = new URLSearchParams({ open: data.view || '', ...(data.chat ? { chat: data.chat } : {}) }).toString();
  const msg = {
    notification: { title, body: body || '' },
    data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
    android: { priority: 'high', notification: { channelId: 'general', sound: 'default', defaultVibrateTimings: true } },
    webpush: { notification: { icon: SITE + 'icon-192.png', badge: SITE + 'icon-192.png', dir: 'rtl', lang: 'he' }, fcmOptions: { link: SITE + '?' + q } }
  };
  for (let i = 0; i < tokens.length; i += 500) {
    const part = tokens.slice(i, i + 500);
    const res = await getMessaging().sendEachForMulticast({ ...msg, tokens: part });
    // Forget phones that uninstalled the app or turned notifications off for good.
    const dead = [];
    res.responses.forEach((r, k) => { if (!r.success && /registration-token-not-registered|invalid-registration-token|invalid-argument/.test((r.error && r.error.code) || '')) dead.push(part[k]); });
    await Promise.all(dead.map(t => db.collection('pushTokens').doc(t).delete().catch(() => { })));
  }
}

// Managers for the managers' alerts: the owner and whoever may edit hours, inventory or staff.
// staffOnly: only those who may approve new employees.
async function managers(staffOnly = false) {
  const snap = await db.collection('members').get();
  const areas = staffOnly ? ['staff'] : ['hours', 'inv', 'staff'];
  return [...new Set(snap.docs.map(d => d.data())
    .filter(m => m.empId && (m.owner === true || areas.some(a => (m.perms || {})[a] === 'edit')))
    .map(m => m.empId))];
}

async function onMessage(before, after) {
  if (before || !after || !after.to) return;
  const from = first(await empName(after.from)) || 'עובד';
  await send([after.to], `הודעה מ${from}`, cut(after.text), { view: 'dm', chat: after.from }, 'msg', 'הודעה חדשה');
}

async function onTask(before, after) {
  if (before || !after || !after.empId) return;
  await send([after.empId], 'משימה חדשה', cut(after.title), { view: 'tasks' }, 'task');
}

async function onShift(before, after) {
  const s = after || before; if (!s || !s.empId) return;
  const when = s.start ? `${dm(s.start)} · ${hm(s.start)}${s.end ? '–' + hm(s.end) : ''}` : '';
  let title = null;
  if (!before) {
    // Clocking in and asking to add hours are the employee's own actions: no notification.
    if (after.source === 'clock' || after.status === 'pending' || after.status === 'open') return;
    title = 'נוספה לך משמרת';
  } else if (!after) {
    if (before.status === 'pending' || before.status === 'open') return;
    title = 'משמרת שלך נמחקה';
  } else if (before.status === 'pending' && after.status === 'approved') title = 'בקשת השעות שלך אושרה';
  else if (before.status === 'pending' && after.status === 'rejected') title = 'בקשת השעות שלך נדחתה';
  else if (before.start !== after.start || (before.status !== 'open' && before.end !== after.end)) title = 'המשמרת שלך עודכנה';
  else if (after.autoGeo && !before.autoGeo) {
    // Closed by location (by the server or by the employee's own phone).
    await send([s.empId], 'המשמרת נסגרה אוטומטית', `יצאת מאזור החנות ולא חזרת. המשמרת נרשמה עד ${hm(after.end)}`, { view: 'clock' }, 'shift');
    const name = await empName(s.empId);
    await db.collection('notifications').add({ type: 'info', kind: 'geo', empId: s.empId, ts: Date.now(),
      text: `המשמרת של ${name || 'עובד'} נסגרה אוטומטית ב-${hm(after.end)} (${dm(after.start)}, נכנס ב-${hm(after.start)}): יצא/ה מאזור החנות ולא חזר/ה` + (after.geoUnsure ? '. לפני היציאה לא היה מידע מיקום יותר מחצי שעה, כדאי לבדוק את השעות' : '') });
    return;
  }
  else if (before.status === 'open' && after.status === 'approved' && after.end && Math.abs(Date.now() - after.end) > 3 * 60000) title = 'המנהל סגר את המשמרת שלך';
  else if ((before.allowUntil || null) !== (after.allowUntil || null) && after.allowUntil) title = 'קיבלת אישור להמשיך במשמרת';
  if (title) await send([s.empId], title, when, { view: 'clock' }, /בקשת השעות/.test(title) ? 'req' : 'shift');
}

async function onReel(before, after) {
  // A reel counts once all its parts are uploaded (ready flips to true).
  if (!after || after.ready !== true || (before && before.ready === true)) return;
  const emps = await db.collection('employees').get();
  const to = emps.docs.map(d => d.id).filter(id => id !== after.by);
  const who = after.by === 'news' ? 'חדשות מרקט' : first(await empName(after.by)) || 'מישהו';
  await send(to, `רילס חדש מ${who}`, cut(after.caption, 90) || 'יש סרטון חדש בפיד', { view: 'reels' }, 'reels');
}

async function onAlert(before, after) {
  if (before || !after || !after.text) return;
  await send(await managers(), 'התראה למנהלים', cut(after.text), { view: 'alerts' }, 'alerts');
}

/* ---------- closing a shift by location ---------- */
async function geoCfg() {
  const d = await db.collection('config').doc('geo').get();
  return d.exists ? d.data() : null;
}
const graceOf = c => (+(c && c.grace) || 75) * 60000;
// The employee's phone noticed they left the shop's area: tell them when the shift will close.
async function onShiftGeo(before, after, id) {
  if (!after || !after.outAt || (before && before.outAt) || !after.emp) return;
  const c = await geoCfg(); if (!c || !c.on) return;
  const sh = await db.collection('shifts').doc(String(id)).get();
  if (!sh.exists || sh.data().status !== 'open') return;
  await send([after.emp], 'יצאת מאזור החנות', `אם לא תחזור עד ${hm(after.outAt + graceOf(c))} המשמרת תיסגר ותירשם עד ${hm(after.lastIn || sh.data().start)}`, { view: 'clock' }, 'shift');
}
// Every few minutes: close shifts whose employee left the area and did not come back in time,
// at the last time they were inside. Works also when the employee's app is closed.
exports.geoWatch = onSchedule({ schedule: 'every 5 minutes', region: 'europe-west1', timeZone: 'Asia/Jerusalem', retryCount: 0 }, async () => {
  const c = await geoCfg(); if (!c || !c.on) return;
  const now = Date.now(), grace = graceOf(c);
  const snap = await db.collection('shiftGeo').where('outAt', '>', 0).get();
  for (const g of snap.docs) {
    const d = g.data();
    if (now - d.outAt < grace) continue;
    try {
      const ref = db.collection('shifts').doc(g.id);
      await db.runTransaction(async t => {
        const s = await t.get(ref);
        if (!s.exists) return;
        const sh = s.data();
        if (sh.status !== 'open' || String(sh.empId) !== String(d.emp)) return;
        const end = Math.max(sh.start, Math.min(d.lastIn || sh.start, now));
        t.update(ref, { end, status: 'approved', autoGeo: true, ...(d.unsure ? { geoUnsure: true } : {}) });
      });
      await g.ref.delete();
    } catch (e) { console.error('geoWatch', g.id, e); }
  }
  // Leftovers of shifts that were closed in other ways.
  const old = await db.collection('shiftGeo').where('ts', '<', now - 2 * 86400000).get();
  await Promise.all(old.docs.map(d => d.ref.delete().catch(() => { })));
});

// Someone signed in with Google for the first time: the managers who approve employees hear about it.
async function onSignup(before, after) {
  if (before || !after) return;
  const who = after.name || after.email || 'מישהו';
  await send(await managers(true), 'בקשת הצטרפות חדשה', `${who} נכנס/ה לאפליקציה ומחכה לאישור שלך`, { view: 'staff' }, 'alerts');
}

/* ---------- coins: one shared purse per employee for all the games ----------
   Everyone starts with 200. Only this server changes a purse. The moment one employee holds 55% of all the coins,
   the purse "breaks" and everyone goes back to 200. wallets/{emp} = { coins, bet, earn: { day, n } }. */
const COIN_START = 200, COIN_BREAK = 0.55, STAKES = [10, 20, 30, 40, 50], EARN_CAP = 150;
const SUDOKU_COINS = { easy: 5, medium: 10, hard: 18, expert: 30, daily: 15 };
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
// plan(t, bal, w) reads what it needs and returns { deltas: { empId: change }, set: { empId: extra wallet fields }, after } or null.
async function coinTx(plan) {
  let broke = null;
  await db.runTransaction(async t => {
    broke = null;
    const [emps, ws] = await Promise.all([t.get(db.collection('employees')), t.get(db.collection('wallets'))]);
    const bal = {}, w = {}; emps.docs.forEach(d => { if (d.id !== 'news') { bal[d.id] = COIN_START; w[d.id] = {}; } });
    let info = {}; ws.docs.forEach(d => { if (d.id === '_info') info = d.data(); else if (d.id in bal) { w[d.id] = d.data(); if (typeof d.data().coins === 'number') bal[d.id] = d.data().coins; } });
    const p = await plan(t, bal, w); if (!p) return;
    const changed = new Set(Object.keys(p.set || {}).filter(id => id in bal));
    Object.entries(p.deltas || {}).forEach(([id, d]) => { if (!(id in bal) || !d) return; bal[id] = Math.max(0, Math.round(bal[id] + d)); changed.add(id); });
    const ids = Object.keys(bal), total = ids.reduce((s, id) => s + bal[id], 0), top = ids.slice().sort((a, b) => bal[b] - bal[a])[0];
    if (ids.length > 1 && total > 0 && bal[top] >= total * COIN_BREAK) {
      broke = top;
      ws.docs.forEach(d => { if (d.id !== '_info') t.delete(d.ref); });
      t.set(db.collection('wallets').doc('_info'), { resetAt: Date.now(), by: top, top: bal[top], n: (info.n || 0) + 1 });
    } else changed.forEach(id => t.set(db.collection('wallets').doc(id), { ...w[id], ...((p.set || {})[id] || {}), coins: bal[id], ts: Date.now() }));
    if (p.after) p.after(t);
  });
  if (broke) {
    const emps = await db.collection('employees').get(), who = first(await empName(broke)) || 'מישהו';
    await send(emps.docs.map(d => d.id), 'הקופה נשברה! 🪙', `${who} הגיע/ה ל-55% מכל המטבעות. כולם חוזרים ל-200`, { view: 'fun' }, 'msg');
  }
}
// What the app reports: a Snake score, a solved Sudoku, a bet against the computer and a win against it.
// Coins earned by playing alone are capped per day; a win pays only the bet that is open on the server.
async function onCoin(before, after, id) {
  if (before || !after || !after.emp) return;
  const ref = db.collection('coinEvents').doc(id);
  await coinTx(async (t, bal, w) => {
    const cur = await t.get(ref); if (!cur.exists) return null;
    const e = cur.data(), me = e.emp, my = w[me] || {}; if (!(me in bal)) return { after: tt => tt.delete(ref) };
    let d = 0, set = {};
    if (e.kind === 'bet') { const st = STAKES.includes(e.stake) ? Math.min(e.stake, bal[me]) : 0; d = -st; set = { bet: st }; }
    else if (e.kind === 'win') { d = 2 * (my.bet || 0); set = { bet: 0 }; }
    else if (e.kind === 'lose') set = { bet: 0 };
    else {
      const raw = e.kind === 'snake' ? Math.min(30, Math.floor((+e.score || 0) / 5))
        : e.kind === 'sudoku' ? Math.max(0, (SUDOKU_COINS[e.level] || 0) - 3 * (+e.hints || 0) - 2 * (+e.errors || 0)) : 0;
      const earn = my.earn && my.earn.day === today() ? my.earn.n : 0; d = Math.max(0, Math.min(raw, EARN_CAP - earn));
      set = { earn: { day: today(), n: earn + d } };
    }
    return { deltas: { [me]: d }, set: { [me]: set }, after: tt => tt.delete(ref) };
  });
}
// A finished game between two employees that was played for coins: the loser pays the winner (as much as they have).
async function settleGame(col, id) {
  const ref = db.collection(col).doc(id);
  await coinTx(async (t, bal) => {
    const cur = await t.get(ref); if (!cur.exists) return null;
    const g = cur.data(); if (g.status !== 'done' || g.settled || !STAKES.includes(g.stake) || ![g.a, g.b].includes(g.winner)) return null;
    const loser = g.winner === g.a ? g.b : g.a, amt = Math.min(g.stake, bal[loser] || 0);
    return { deltas: { [g.winner]: amt, [loser]: -amt }, after: tt => tt.update(ref, { settled: true, paid: amt }) };
  });
}

// Backgammon between employees: the invitation, and whose turn it is.
async function onBg(before, after, id) {
  if (!after) return;
  if (before && after.status === 'done' && before.status !== 'done' && after.stake && !after.settled) await settleGame('bgGames', id).catch(e => console.error('settle', id, e));
  const name = async id => first(await empName(id)) || 'עובד';
  if (!before && after.status === 'invite') return send([after.b], 'הזמנה לשש בש 🎲', `${await name(after.a)} מזמין/ה אותך למשחק${after.stake ? ` על ${after.stake} מטבעות` : ''}`, { view: 'bg' }, 'msg');
  if (!before) return;
  if (before.status === 'invite' && after.status === 'play') return send([after.a], 'שש בש 🎲', `${await name(after.b)} אישר/ה את המשחק`, { view: 'bg' }, 'msg');
  if (after.status === 'done' && before.status !== 'done') {
    const loser = after.winner === after.a ? after.b : after.a;
    if (after.resign) return send([after.winner], 'שש בש 🏆', `${await name(after.resign)} פרש/ה. ניצחת!`, { view: 'bg' }, 'msg');
    return send([loser], 'שש בש', `${await name(after.winner)} ניצח/ה במשחק`, { view: 'bg' }, 'msg');
  }
  if (after.status === 'play' && before.turn !== after.turn) {
    const to = after.turn === 'w' ? after.a : after.b, from = after.turn === 'w' ? after.b : after.a;
    return send([to], 'שש בש 🎲', `התור שלך מול ${await name(from)}`, { view: 'bg' }, 'msg');
  }
}

// Chess and checkers between employees: the same messages as backgammon.
const DUEL_NAME = { chess: 'שחמט ♟️', dama: 'דמקה ⛀' };
async function onDuel(before, after, id) {
  if (!after) return;
  if (before && after.status === 'done' && before.status !== 'done' && after.stake && !after.settled) await settleGame('duels', id).catch(e => console.error('settle', id, e));
  const name = async id => first(await empName(id)) || 'עובד', g = DUEL_NAME[after.game] || 'משחק';
  if (!before && after.status === 'invite') return send([after.b], `הזמנה ל${g}`, `${await name(after.a)} מזמין/ה אותך למשחק${after.stake ? ` על ${after.stake} מטבעות` : ''}`, { view: 'duel' }, 'msg');
  if (!before) return;
  if (before.status === 'invite' && after.status === 'play') return send([after.a], g, `${await name(after.b)} אישר/ה את המשחק`, { view: 'duel' }, 'msg');
  if (after.status === 'done' && before.status !== 'done') {
    if (!after.winner) return send(after.players, g, 'המשחק נגמר בתיקו', { view: 'duel' }, 'msg');
    const loser = after.winner === after.a ? after.b : after.a;
    if (after.resign) return send([after.winner], `${g} 🏆`, `${await name(after.resign)} פרש/ה. ניצחת!`, { view: 'duel' }, 'msg');
    return send([loser], g, `${await name(after.winner)} ניצח/ה במשחק`, { view: 'duel' }, 'msg');
  }
  if (after.status === 'play' && before.turn !== after.turn) {
    const to = after.turn === 'a' ? after.a : after.b, from = after.turn === 'a' ? after.b : after.a;
    return send([to], g, `התור שלך מול ${await name(from)}`, { view: 'duel' }, 'msg');
  }
}

// A test notification the employee asked for from the settings screen (always sent, then the request is removed).
async function onTest(before, after, id) {
  if (before || !after || !after.emp) return;
  await send([after.emp], 'התראת ניסיון', 'ההתראות עובדות בטלפון הזה 👍', { view: 'clock' });
  await db.collection('pushTests').doc(id).delete().catch(() => { });
}

exports.notify = onDocumentWritten({ document: '{col}/{id}', region: 'me-west1', retry: false }, async event => {
  const col = event.params.col;
  if (!WATCHED.includes(col)) return;
  const before = event.data.before.exists ? event.data.before.data() : null;
  const after = event.data.after.exists ? event.data.after.data() : null;
  const run = { messages: onMessage, tasks: onTask, shifts: onShift, reels: onReel, notifications: onAlert, pushTests: onTest, shiftGeo: onShiftGeo, signups: onSignup, bgGames: onBg, coinEvents: onCoin, duels: onDuel }[col];
  try { await run(before, after, event.params.id); } catch (e) { console.error(col, event.params.id, e); }
});
