// Demo store: keeps everything in this device's localStorage, starting from sample data.
// Used when firebase-config.js is not filled in.
import { H, DAY, uid, sod, dateKey, prevMonthKey, normPhone, rng, buildSummary } from './util.js';

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
    S.notes = S.notes || {}; S.images = S.images || {}; S.empPhotos = S.empPhotos || {};
    S.suppliers = S.suppliers || []; S.orders = S.orders || []; S.unavail = S.unavail || [];
    S.reels = (S.reels || []).filter(r => r.type === 'photos' || PARTS.has(r.id)); S.reelComments = S.reelComments || []; S.extras = S.extras || [];
    try { session = localStorage.getItem(LS_SESSION); } catch (e) { session = null; }
    if (session && session !== 'viewer' && !S.employees.some(e => e.id === session)) session = null;
    S.currentUser = session; persist();
  };
  load();
  mgr = store_perm();
  function store_perm() { const e = S.employees.find(x => x.id === session) || {}; return !!(e.admin || e.owner); }
  S.openShifts = S.shifts.filter(s => s.status === 'open');
  const store = {
    mode: 'local',
    get S() { return S; },
    ready: Promise.resolve(),
    needsSetup: () => false,
    session: () => session,
    isManager: () => mgr,
    isPermAdmin: () => { const e = S.employees.find(x => x.id === session) || {}; return !!(e.admin || e.owner); },
    isViewer: () => session === 'viewer',
    async setViewer(phone, num) { S.viewerLogin = phone ? { phone, num: String(num) } : null; persist(); return { ok: true }; },
    async uploadReel(meta, parts, onProg) { const id = uid(); PARTS.set(id, parts); S.reels.push({ id, ...meta, by: session, ts: Date.now(), ready: true, parts: parts.length, ...(meta.type === 'photos' ? { inline: parts } : {}) }); onProg && onProg(1); persist(); return { ok: true, id }; },
    async loadParts(id) { const r = S.reels.find(x => x.id === id); return PARTS.get(id) || (r && r.inline) || []; },
    async deleteReel(r) { PARTS.delete(r.id); S.reels = S.reels.filter(x => x.id !== r.id); S.reelComments = S.reelComments.filter(c => c.reel !== r.id); persist(); },
    isOwner: () => !!(S.employees.find(e => e.id === session) || {}).owner,
    async setOwner(id) { const e = S.employees.find(x => x.id === id); if (!e) return { error: 'העובד לא נמצא' }; e.owner = true; e.admin = true; if (id === session) mgr = true; persist(); return { ok: true }; },
    async claimOwner() { const e = S.employees.find(x => x.id === session); if (!e) return { error: 'העובד לא נמצא' }; e.owner = true; e.admin = true; mgr = true; persist(); return { ok: true }; },
    loaded: () => true,
    pinLength: () => S.settings.pin.length,
    onChange: cb => listeners.push(cb),
    onError: () => { },
    save: () => { S.openShifts = S.shifts.filter(s => s.status === 'open'); persist(); },
    async login(phone, num) {
      const p = normPhone(phone), n = String(num).trim();
      const e = S.employees.find(x => normPhone(x.phone) === p && String(x.num) === n);
      if (!e && S.viewerLogin && S.viewerLogin.phone === p && S.viewerLogin.num === n) { setSession('viewer'); mgr = false; persist(); return { ok: true }; }
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
