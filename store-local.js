// Demo store: keeps everything in this device's localStorage, starting from sample data.
// Used when firebase-config.js is not filled in.
import { H, DAY, uid, sod, dateKey, prevMonthKey, normPhone, rng, buildSummary, AREAS } from './util.js';

const LS = 'dalpak-demo-v3', LS_SESSION = 'dalpak-session';

function seed() {
  const r = rng(11), now = Date.now(), today = sod(now);
  const S = {
    settings: { pin: '0000' },
    employees: [
      { id: 'e1', num: '101', name: 'נועה כהן', phone: '0501234567', wage: 50 },
      { id: 'e2', num: '102', name: 'דניאל לוי', phone: '0522345678', wage: 50 },
      { id: 'e3', num: '103', name: 'יוסי מזרחי', phone: '0543456789', wage: 50 },
      { id: 'e4', num: '104', name: 'מאיה פרץ', phone: '0584567890', wage: 50 }],
    currentUser: null, shifts: [], inventory: [], drinkUpdates: [], deliveries: [], tasks: [], grades: {}, notifications: []
  };
  const d0 = new Date(today); d0.setMonth(d0.getMonth() - 1); d0.setDate(1);
  for (let d = new Date(d0); d.getTime() < today; d.setDate(d.getDate() + 1)) {
    if (d.getDay() === 6) continue;
    S.employees.forEach((e, i) => {
      if (r() < .55) {
        const s = new Date(d); s.setHours((i + d.getDate()) % 2 ? 15 : 8, r() < .5 ? 0 : 15, 0, 0);
        const len = 6 + Math.floor(r() * 4) + (r() < .5 ? .5 : 0);
        S.shifts.push({ id: uid(), empId: e.id, start: s.getTime(), end: s.getTime() + len * H, status: 'approved', source: 'clock' });
      }
    });
  }
  S.shifts.push({ id: uid(), empId: 'e3', start: now - 13 * H - 22 * 6e4, end: null, status: 'open', source: 'clock' });
  const rq = new Date(today - 3 * DAY); rq.setHours(10, 0, 0, 0);
  S.shifts.push({ id: uid(), empId: 'e2', start: rq.getTime(), end: rq.getTime() + 8 * H, status: 'pending', source: 'request', note: 'שכחתי להחתים כניסה, הייתי בקופה מהבוקר' });
  const it = (cat, sub, name, qty, min) => S.inventory.push({ id: uid(), cat, sub, name, qty, min });
  [['קוקה קולה 330 מ"ל', 24, 12], ['ספרייט 330 מ"ל', 14, 10], ['פאנטה 330 מ"ל', 6, 10], ['מים מינרליים 0.5 ל׳', 40, 20], ['פיוז טי אפרסק', 11, 8]].forEach(x => it('drinks', 'שתייה', ...x));
  [['ד״ר פפר', 9, 6], ['מאונטן דיו', 4, 6], ['רוט ביר', 7, 6], ['תה קר אריזונה', 12, 6]].forEach(x => it('drinks', 'שתייה אמריקאי', ...x));
  [['גולדסטאר', 30, 18], ['מכבי', 16, 12], ['קורונה', 8, 12], ['הייניקן', 20, 12]].forEach(x => it('drinks', 'בירות', ...x));
  [['קוקה קולה 1.5 ל׳', 10, 6], ['ספרייט 1.5 ל׳', 5, 6], ['מים 1.5 ל׳', 18, 12]].forEach(x => it('drinks', 'שתייה גדולה', ...x));
  [['במבה', 22, 15], ['ביסלי גריל', 13, 12], ['דוריטוס', 7, 10], ['תפוצ׳יפס', 15, 10], ['שוקולד פרה', 20, 10]].forEach(x => it('snacks', null, ...x));
  [['חומוס', 9, 6], ['מטבוחה', 4, 5], ['טחינה', 8, 5], ['סלט חצילים', 6, 5], ['סלט כרוב', 3, 5]].forEach(x => it('salads', null, ...x));
  S.drinkUpdates.push({ id: uid(), itemId: S.inventory[0].id, empId: 'e4', from: 24, to: 18, ts: now - 50 * 6e4, status: 'pending' });
  const t = dateKey(now), y = dateKey(now - DAY), tm = dateKey(now + DAY), dt = dateKey(now + 2 * DAY);
  const a1 = new Date(today); a1.setHours(9, 12);
  S.deliveries = [
    { id: uid(), date: t, name: 'בירה גולדסטאר', qty: '3 ארגזים', supplier: 'מחסן הבירות', arrived: true, arrivedBy: 'e2', arrivedAt: a1.getTime() },
    { id: uid(), date: t, name: 'קוקה קולה 330 מ"ל', qty: '4 ארגזים', supplier: 'ספק השתייה' },
    { id: uid(), date: t, name: 'סלטים טריים', qty: '12 קופסאות', supplier: 'מעדניית השוק' },
    { id: uid(), date: tm, name: 'במבה וביסלי', qty: '2 קרטונים', supplier: 'הפצת חטיפים' },
    { id: uid(), date: dt, name: 'שתייה אמריקאית', qty: '2 ארגזים', supplier: 'יבואן' },
    { id: uid(), date: y, name: 'מים 1.5 ל׳', qty: '6 שישיות', supplier: 'ספק השתייה', arrived: true, arrivedBy: 'e4', arrivedAt: now - DAY - 5 * H }];
  S.tasks = [
    { id: uid(), title: 'סידור מקרר השתייה', empId: 'e1', hours: 1.5, done: true },
    { id: uid(), title: 'ספירת מלאי חטיפים', empId: 'e2', hours: 2, done: false },
    { id: uid(), title: 'ניקוי ויטרינת הסלטים', empId: 'e4', hours: 1, done: false },
    { id: uid(), title: 'קבלת אספקת שתייה', empId: 'e3', hours: .5, done: false }];
  S.grades = { e1: 5, e2: 4, e3: 3, e4: 5 };
  buildSummary(S, prevMonthKey(), new Date(new Date().getFullYear(), new Date().getMonth(), 1, 8).getTime());
  S.notifications.push({ id: uid(), type: 'info', ts: a1.getTime(), text: 'דניאל לוי סימן שהגיעה אספקה: בירה גולדסטאר' });
  return S;
}

export function createLocalStore() {
  let S, session = null, mgr = false;
  // Demo videos stay in memory only: phone storage is too small for them.
  const PARTS = new Map();
  const listeners = [];
  const persist = () => { try { localStorage.setItem(LS, JSON.stringify(S)); } catch (e) { } };
  const setSession = id => { session = id; S.currentUser = id; try { id ? localStorage.setItem(LS_SESSION, id) : localStorage.removeItem(LS_SESSION); } catch (e) { } };
  const load = () => {
    try { const raw = localStorage.getItem(LS); S = raw ? JSON.parse(raw) : seed(); } catch (e) { S = seed(); }
    S.settings = S.settings || { pin: '0000' };
    S.notes = S.notes || {}; S.images = S.images || {}; S.empPhotos = S.empPhotos || {}; S.prices = S.prices || {}; S.catalog = S.catalog || []; S.messages = S.messages || []; S.sales = S.sales || [];
    S.suppliers = S.suppliers || []; S.orders = S.orders || []; S.unavail = S.unavail || [];
    S.reels = (S.reels || []).filter(r => r.type === 'photos' || PARTS.has(r.id)); S.reelComments = S.reelComments || []; S.extras = S.extras || [];
    S.gallery = (S.gallery || []).filter(p => PARTS.has('g:' + p.id)); S.scores = S.scores || []; S.bgGames = S.bgGames || []; S.wallets = S.wallets || []; S.duels = S.duels || [];
    try { session = localStorage.getItem(LS_SESSION); } catch (e) { session = null; }
    if (session && session !== 'viewer' && !S.employees.some(e => e.id === session)) session = null;
    S.currentUser = session; persist();
  };
  load();
  // Demo permissions: נועה (e1) is the owner with everything; the others are regular employees.
  const ALL = Object.fromEntries(AREAS.map(a => [a, 'edit'])), BASIC = { reels: 'edit', chat: 'edit' };
  if (!S.members) S.members = S.employees.map(e => ({ id: e.id + '@demo.local', email: e.id + '@demo.local', empId: e.id, perms: e.id === 'e1' ? ALL : BASIC, ...(e.id === 'e1' ? { owner: true } : {}) }));
  if (!S.signups) S.signups = [{ id: 'roi@demo.local', email: 'roi@demo.local', name: 'רועי (הדגמה)', ts: Date.now() }];
  const myMem = () => S.members.find(m => m.empId === session);
  const lv = a => session === 'viewer' ? 'view' : (m => !m ? 'none' : m.owner ? 'edit' : (m.perms[a] || 'none'))(myMem());
  mgr = false;
  S.openShifts = S.shifts.filter(s => s.status === 'open');
  // Demo purse: one wallet per employee; when one holds 55% of all the coins everyone goes back to 200.
  const bal = id => { const w = S.wallets.find(x => x.id === id); return w ? w.coins : 200; };
  function demoCoins(deltas) {
    Object.entries(deltas).forEach(([id, d]) => { if (!d) return; const w = S.wallets.find(x => x.id === id), c = Math.max(0, bal(id) + d); if (w) w.coins = c; else S.wallets.push({ id, coins: c }); });
    const ids = S.employees.filter(e => e.id !== 'news').map(e => e.id), total = ids.reduce((t, id) => t + bal(id), 0), top = ids.slice().sort((a, b) => bal(b) - bal(a))[0];
    if (ids.length > 1 && total > 0 && bal(top) >= total * 0.55) { const info = S.wallets.find(x => x.id === '_info'); S.wallets = [{ id: '_info', resetAt: Date.now(), by: top, top: bal(top), n: ((info && info.n) || 0) + 1 }]; }
  }
  function demoSettle(g, was) {
    if (was === 'done' || g.status !== 'done' || !g.stake || g.settled || ![g.a, g.b].includes(g.winner)) return;
    const loser = g.winner === g.a ? g.b : g.a, amt = Math.min(g.stake, bal(loser)); g.settled = true; g.paid = amt; demoCoins({ [g.winner]: amt, [loser]: -amt });
  }
  const store = {
    mode: 'local',
    get S() { return S; },
    ready: Promise.resolve(),
    needsSetup: () => false,
    // Demo: notification settings live on this phone only, and there are no real notifications.
    async getPushPrefs() { try { return JSON.parse(localStorage.getItem('push-prefs-' + session) || 'null'); } catch (e) { return null; } },
    async setPushPrefs(p) { try { localStorage.setItem('push-prefs-' + session, JSON.stringify(p)); } catch (e) { } },
    async testPush() { },
    session: () => session,
    isManager: () => session === 'viewer' || AREAS.some(a => !['reels', 'chat', 'deliv', 'inv'].includes(a) && lv(a) !== 'none'),
    perm: lv,
    perms: () => ({ ...((myMem() || {}).perms || {}) }),
    myEmail: () => (myMem() || {}).email || null,
    ownerEmp: () => 'e1',
    AREAS,
    pending: () => null,
    async googleLogin() { return { error: 'בגרסת הדמו נכנסים עם טלפון ומספר עובד' }; },
    async approve(email, { empId: id, newEmp, perms: p }) {
      let eid = id; if (!eid && newEmp) { eid = uid(); S.employees.push({ id: eid, num: String(Math.max(100, ...S.employees.map(e => parseInt(e.num) || 0)) + 1), ...newEmp }); }
      if (!eid) return { error: 'צריך לבחור עובד' };
      S.members = S.members.filter(m => m.empId !== eid && m.id !== email);
      S.members.push({ id: email, email, empId: eid, perms: p || BASIC, ...(eid === 'e1' ? { owner: true } : {}) });
      S.signups = S.signups.filter(x => x.id !== email); persist(); listeners.forEach(f => f()); return { ok: true, empId: eid };
    },
    async reject(email) { S.signups = S.signups.filter(x => x.id !== email); persist(); return { ok: true }; },
    async setPerms(email, p) { const m = S.members.find(x => x.id === email); if (!m) return { error: 'החשבון לא נמצא' }; m.perms = p; persist(); return { ok: true }; },
    async unlink(email) { S.members = S.members.filter(x => x.id !== email); persist(); return { ok: true }; },
    isViewer: () => session === 'viewer',
    isGuest: () => { const e = S.employees.find(x => x.id === session); return !!(e && e.guest); },
    isPoster: () => session === 'news',
    async setPoster(phone, num) { S.posterLogin = phone ? { phone, num: String(num) } : null; persist(); return { ok: true }; },
    async setViewer(phone, num) { S.viewerLogin = phone ? { phone, num: String(num) } : null; persist(); return { ok: true }; },
    async uploadReel(meta, parts, onProg) { const id = uid(); PARTS.set(id, parts); S.reels.push({ id, ...meta, by: session, ts: Date.now(), ready: true, parts: parts.length, ...(meta.type === 'photos' ? { inline: parts } : {}) }); onProg && onProg(1); persist(); return { ok: true, id }; },
    async loadParts(id) { const r = S.reels.find(x => x.id === id); return PARTS.get(id) || (r && r.inline) || []; },
    async deleteReel(r) { PARTS.delete(r.id); S.reels = S.reels.filter(x => x.id !== r.id); S.reelComments = S.reelComments.filter(c => c.reel !== r.id); persist(); },
    isOwner: () => !!(myMem() || {}).owner,
    // Leisure (demo): full photos stay in memory only, like the demo videos.
    async uploadPhoto({ full, thumb, caption }) { const id = uid(); PARTS.set('g:' + id, full); S.gallery.push({ id, by: session, ts: Date.now(), thumb, caption: caption || '' }); persist(); listeners.forEach(f => f()); return { ok: true, id }; },
    async loadPhoto(id) { return PARTS.get('g:' + id) || null; },
    async deletePhoto(p) { PARTS.delete('g:' + p.id); S.gallery = S.gallery.filter(x => x.id !== p.id); persist(); return { ok: true }; },
    async saveScore(game, data) {
      const id = game + '_' + session, cur = S.scores.find(x => x.id === id);
      const merge = (a, b) => { Object.entries(b).forEach(([k, v]) => { if (v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object') merge(a[k], v); else a[k] = v; }); return a; };
      if (cur) merge(cur, { ...data, ts: Date.now() }); else S.scores.push({ id, game, emp: session, ...data, ts: Date.now() }); persist(); return { ok: true };
    },
    // Demo purse: the same rules the server keeps in the real app.
    async coinEvent(kind, data = {}) {
      const W = id => { let w = S.wallets.find(x => x.id === id); if (!w) { w = { id, coins: 200 }; S.wallets.push(w); } return w; }, w = W(session);
      const SD = { easy: 5, medium: 10, hard: 18, expert: 30, daily: 15 }, day = new Date().toLocaleDateString('en-CA');
      let d = 0;
      if (kind === 'bet') { d = -Math.min(data.stake || 0, w.coins); w.bet = -d; }
      else if (kind === 'win') { d = 2 * (w.bet || 0); w.bet = 0; }
      else if (kind === 'lose') w.bet = 0;
      else if (kind === 'draw') { d = w.bet || 0; w.bet = 0; }
      else { const raw = kind === 'snake' ? Math.min(30, Math.floor((data.score || 0) / 5)) : kind === 'sudoku' ? Math.max(0, (SD[data.level] || 0) - 3 * (data.hints || 0) - 2 * (data.errors || 0)) : 0, e = w.earn && w.earn.day === day ? w.earn.n : 0; d = Math.max(0, Math.min(raw, 150 - e)); w.earn = { day, n: e + d }; }
      demoCoins({ [session]: d }); persist(); return { ok: true };
    },
    async bgCreate(opp, stake = 0) { const id = uid(), pts = Array(24).fill(0); pts[23] = 2; pts[12] = 5; pts[7] = 3; pts[5] = 5; pts[0] = -2; pts[11] = -5; pts[16] = -3; pts[18] = -5; S.bgGames.push({ id, a: session, b: opp, players: [session, opp], status: 'invite', stake, pts, barW: 0, barB: 0, offW: 0, offB: 0, turn: 'w', dice: null, last: null, ts: Date.now() }); persist(); return { ok: true, id }; },
    async bgUpdate(id, patch) { const g = S.bgGames.find(x => x.id === id); if (!g) return { error: 'המשחק לא נמצא' }; const was = g.status; Object.assign(g, patch); demoSettle(g, was); persist(); return { ok: true }; },
    async bgDelete(id) { S.bgGames = S.bgGames.filter(x => x.id !== id); persist(); return { ok: true }; },
    async duelCreate(game, opp, state, stake = 0) { const id = uid(); S.duels.push({ id, game, a: session, b: opp, players: [session, opp], status: 'invite', stake, turn: 'a', state, last: null, ts: Date.now() }); persist(); return { ok: true, id }; },
    async duelUpdate(id, patch) { const g = S.duels.find(x => x.id === id); if (!g) return { error: 'המשחק לא נמצא' }; const was = g.status; Object.assign(g, patch); demoSettle(g, was); persist(); return { ok: true }; },
    async duelDelete(id) { S.duels = S.duels.filter(x => x.id !== id); persist(); return { ok: true }; },
    // The demo keeps everything on this phone, so it is always up to date.
    onSync() { },
    syncInfo: () => ({ state: 'live', last: Date.now(), pending: false }),
    googleError: () => '',
    // Closing a shift by location (demo: kept on this phone).
    async getGeoCfg() { return S.geoCfg || null; },
    async setGeoCfg(c) { S.geoCfg = { on: !!c.on, lat: c.lat ?? null, lng: c.lng ?? null, acc: c.acc ?? null, radius: +c.radius || 150, grace: +c.grace || 75 }; persist(); },
    async getGeo(id) { return (S.shiftGeo || {})[id] || null; },
    async geoPing(id, g) { S.shiftGeo = S.shiftGeo || {}; S.shiftGeo[id] = { emp: session, ...g, ts: Date.now() }; persist(); },
    async geoClear(id) { if (S.shiftGeo) { delete S.shiftGeo[id]; persist(); } },
    loaded: () => true,
    pinLength: () => S.settings.pin.length,
    onChange: cb => listeners.push(cb),
    onError: () => { },
    save: () => { S.openShifts = S.shifts.filter(s => s.status === 'open'); persist(); },
    async login(phone, num) {
      const p = normPhone(phone), n = String(num).trim();
      const e = S.employees.find(x => normPhone(x.phone) === p && String(x.num) === n);
      if (!e && S.viewerLogin && S.viewerLogin.phone === p && S.viewerLogin.num === n) { setSession('viewer'); mgr = false; persist(); return { ok: true }; }
      if (!e && S.posterLogin && S.posterLogin.phone === p && S.posterLogin.num === n) { setSession('news'); mgr = false; persist(); return { ok: true }; }
      if (!e) return { error: 'מספר הטלפון או מספר העובד לא נכונים' };
      setSession(e.id); mgr = !!(e.admin || e.owner); persist(); return { ok: true };
    },
    async logout() { setSession(null); mgr = false; persist(); },
    async enterManager(pin) { if (store.isPermAdmin() || pin === S.settings.pin) { mgr = true; return true; } return false; },
    async exitManager() { mgr = false; },
    async changePin(old, next) {
      if (old !== S.settings.pin) return { error: 'הסיסמה הנוכחית שגויה' };
      S.settings.pin = next; persist(); return { ok: true };
    },
    async resetDemo() { S = seed(); setSession(null); mgr = false; persist(); },
  };
  return store;
}
