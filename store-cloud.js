// Cloud store: every phone reads and writes the same Firestore database.
// The app keeps working on plain arrays in S and calls save(); save() compares S with what
// the server last sent and writes only the documents that changed.
import { initializeApp } from 'firebase/app';
import { initializeAuth, indexedDBLocalPersistence, signInAnonymously, signOut } from 'firebase/auth';
import {
  initializeFirestore, persistentLocalCache, doc, getDoc, setDoc, deleteDoc,
  collection, query, where, onSnapshot, writeBatch, getDocs
} from 'firebase/firestore';
import { uid as newId, normPhone } from './util.js';

const COLS = ['employees', 'shifts', 'inventory', 'drinkUpdates', 'deliveries', 'tasks', 'notifications', 'grades', 'logins', 'itemNotes', 'itemImages', 'suppliers', 'orders', 'unavail', 'empPhotos', 'reels', 'reelComments', 'extras'];
// Collections kept in S as plain objects keyed by document id.
const MAPS = { itemNotes: 'notes', itemImages: 'images', empPhotos: 'empPhotos' };
const ARRAYS = ['employees', 'shifts', 'inventory', 'drinkUpdates', 'deliveries', 'tasks', 'notifications', 'suppliers', 'orders', 'unavail', 'reels', 'reelComments', 'extras'];
// Shown to everyone, never written from this list (each phone writes only its own shifts).
const READONLY = { openShifts: 'openShifts' };
const PUBLIC_CATS = ['drinks', 'salads'];

const stable = v => {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  return JSON.stringify(v);
};
const clean = o => JSON.parse(JSON.stringify(o));
const withTimeout = (p, ms = 15000) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
const errText = e => {
  const c = e && (e.code || e.message) || '';
  if (/timeout|unavailable|network/i.test(c)) return 'אין חיבור לשרת. בדקו את החיבור לאינטרנט ונסו שוב';
  if (/permission/i.test(c)) return 'אין הרשאה לפעולה הזו. אם השעה בטלפון לא נכונה, תקנו אותה ונסו שוב';
  return 'הפעולה נכשלה: ' + c;
};

export function createCloudStore(config) {
  const app = initializeApp(config);
  const auth = initializeAuth(app, { persistence: indexedDBLocalPersistence });
  const db = initializeFirestore(app, { localCache: persistentLocalCache() });

  const S = { employees: [], shifts: [], inventory: [], drinkUpdates: [], deliveries: [], tasks: [], notifications: [], grades: {}, notes: {}, images: {}, empPhotos: {}, openShifts: [], suppliers: [], orders: [], unavail: [], extras: [], currentUser: null };
  let synced = {}, loadedCols = new Set(), unsubs = [];
  let empId = null, myPhone = null, myNum = null, mgr = false, permAdmin = false, owner = false, viewer = false, viewerLogins = [], setupDone = true, pinLen = 4;
  // The owner's phone and employee number are kept only in their own login record, never in the shared employee list.
  // In the shared list the owner shows as a regular permanent manager.
  let myLogin = null, ownerSet = false, migrated = false;
  const PRIVATE = ['phone', 'num', 'owner'];
  const changeCbs = [], errorCbs = [];
  const emit = () => changeCbs.forEach(f => f());
  const fail = e => { console.error(e); errorCbs.forEach(f => f(errText(e))); };

  // ---- mapping between S and Firestore documents ----
  function desired(col) {
    const m = new Map();
    if (ARRAYS.includes(col)) S[col].forEach(x => { const { id, ...rest } = x; const d = clean(rest); if (col === 'employees' && d.owner) { PRIVATE.forEach(k => delete d[k]); d.admin = true; } m.set(id, d); });
    else if (col === 'grades') Object.entries(S.grades).forEach(([k, v]) => m.set(k, { v }));
    else if (MAPS[col]) Object.entries(S[MAPS[col]]).forEach(([k, v]) => m.set(k, clean(v)));
    else if (col === 'logins') {
      viewerLogins.forEach(v => m.set(v.id, v.data));
      S.employees.forEach(e => {
        if (!e.phone) return;
        // Only the owner's own phone writes the owner's login record.
        if (e.owner) { if (owner && e.id === empId) m.set(normPhone(e.phone), { empId: e.id, num: String(e.num), admin: true, owner: true }); return; }
        m.set(normPhone(e.phone), { empId: e.id, num: String(e.num), owner: false, ...(e.admin ? { admin: true } : {}) });
      });
    }
    return m;
  }
  function apply(col, snap) {
    if (READONLY[col]) { S[READONLY[col]] = snap.docs.map(d => ({ id: d.id, ...d.data() })); loadedCols.add(col); return; }
    const m = new Map();
    snap.docs.forEach(d => m.set(d.id, stable(d.data())));
    if (col === 'logins' && owner && myLogin) m.set(myPhone, stable(myLogin));
    synced[col] = m;
    if (ARRAYS.includes(col)) S[col] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (col === 'employees') {
      // The owner sees their own details; everyone else sees the owner as a regular employee.
      S.employees = S.employees.map(e => owner && e.id === empId ? { ...e, phone: myPhone, num: myNum, admin: true, owner: true }
        : e.owner ? (({ phone, num, owner: _o, ...r }) => ({ ...r, admin: true }))(e) : e);
      // Old records still holding the owner's details are cleaned by the next manager save.
      if (mgr && snap.docs.some(d => d.data().owner === true || (owner && d.id === empId && d.data().admin !== true))) setTimeout(save, 0);
    }
    else if (col === 'logins') { viewerLogins = snap.docs.filter(d => d.data().viewer === true).map(d => ({ id: d.id, data: d.data() })); S.viewerLogin = viewerLogins[0] ? { phone: viewerLogins[0].id, num: viewerLogins[0].data.num } : null; }
    else if (col === 'grades') { S.grades = {}; snap.docs.forEach(d => S.grades[d.id] = d.data().v); }
    else if (MAPS[col]) { const o = {}; snap.docs.forEach(d => o[d.id] = d.data()); S[MAPS[col]] = o; }
    loadedCols.add(col);
  }

  function resetState() {
    unsubs.forEach(u => u()); unsubs = [];
    ARRAYS.forEach(c => S[c] = []); S.grades = {}; S.notes = {}; S.images = {}; S.empPhotos = {}; S.openShifts = [];
    synced = {}; loadedCols = new Set();
    COLS.forEach(c => synced[c] = new Map());
  }
  function subscribe() {
    resetState();
    if (!empId) { emit(); return; }
    const c = n => collection(db, n);
    const specs = mgr || viewer
      ? [...COLS.filter(n => mgr || n !== 'logins').map(n => [n, n === 'logins' ? query(c(n), where('owner', '==', false)) : c(n)]), ['openShifts', query(c('shifts'), where('status', '==', 'open'))]]
      : [['employees', c('employees')],
        ['shifts', query(c('shifts'), where('empId', '==', empId))],
        ['openShifts', query(c('shifts'), where('status', '==', 'open'))],
        ['inventory', query(c('inventory'), where('cat', 'in', PUBLIC_CATS))],
        ['drinkUpdates', c('drinkUpdates')],
        ['deliveries', c('deliveries')],
        ['tasks', query(c('tasks'), where('empId', '==', empId))],
        ['unavail', query(c('unavail'), where('empId', '==', empId))],
        ['empPhotos', c('empPhotos')],
        ['reels', c('reels')],
        ['reelComments', c('reelComments')],
        ['extras', query(c('extras'), where('empId', '==', empId))],
        ['itemImages', query(c('itemImages'), where('cat', 'in', PUBLIC_CATS))]];
    specs.forEach(([name, q]) => {
      unsubs.push(onSnapshot(q, snap => { apply(name, snap); emit(); }, e => fail(e)));
    });
    emit();
    if (mgr) migrate();
  }
  // One-time upgrade of older data: mark every login record with owner:false so the list query
  // can skip the owner's record, and flag publicly (without naming anyone) that an owner exists.
  async function migrate() {
    if (migrated) return; migrated = true;
    try {
      const all = await getDocs(collection(db, 'logins'));
      for (const d of all.docs) if (!('owner' in d.data())) await setDoc(doc(db, 'logins', d.id), { owner: false }, { merge: true });
    } catch (e) { }
    try {
      if (!ownerSet && (owner || (await getDoc(doc(db, 'config', 'owner'))).exists())) {
        await setDoc(doc(db, 'config', 'public'), { ownerSet: true }, { merge: true }); ownerSet = true; emit();
      }
    } catch (e) { }
  }

  // ---- writes ----
  function save() {
    const sets = [], dels = [];
    if (viewer) return;
    const cols = mgr ? COLS : COLS.filter(c => !['logins', 'itemNotes', 'itemImages', 'suppliers', 'orders', 'grades', 'inventory'].includes(c));
    for (const col of cols) {
      const want = desired(col), have = synced[col] || new Map();
      for (const [id, data] of want) { const s = stable(data); if (have.get(id) !== s) { sets.push([col, id, data]); have.set(id, s); } }
      for (const id of [...have.keys()]) if (!want.has(id)) { dels.push([col, id]); have.delete(id); }
      synced[col] = have;
    }
    if (!sets.length && !dels.length) return;
    // A manager who edits their own phone or employee number re-links their session right after the new login doc.
    const me = S.employees.find(e => e.id === empId);
    const relink = mgr && me && (normPhone(me.phone) !== myPhone || String(me.num) !== myNum);
    const run = async () => {
      for (const [col, id, data] of sets) await setDoc(doc(db, col, id), data);
      if (relink) {
        myPhone = normPhone(me.phone); myNum = String(me.num);
        await setDoc(doc(db, 'sessions', auth.currentUser.uid), { phone: myPhone, num: myNum, at: Date.now() });
      }
      for (const [col, id] of dels) await deleteDoc(doc(db, col, id));
    };
    run().catch(e => { fail(e); subscribe(); });
  }

  // ---- session ----
  async function readPublic() {
    try {
      const p = await withTimeout(getDoc(doc(db, 'config', 'public')), 10000);
      setupDone = p.exists() && p.data().setupDone === true;
      pinLen = (p.exists() && p.data().pinLen) || 4;
      ownerSet = p.exists() && p.data().ownerSet === true;
    } catch (e) { setupDone = true; }
  }
  async function linkSession() {
    const u = auth.currentUser; if (!u) return false;
    try {
      const s = await getDoc(doc(db, 'sessions', u.uid));
      if (!s.exists()) return false;
      const { phone, num } = s.data();
      const l = await getDoc(doc(db, 'logins', phone));
      if (!l.exists() || String(l.data().num) !== String(num)) { await deleteDoc(doc(db, 'sessions', u.uid)).catch(() => { }); return false; }
      empId = l.data().empId; myPhone = phone; myNum = String(num); S.currentUser = empId; myLogin = l.data();
      owner = l.data().owner === true;
      permAdmin = l.data().admin === true || owner;
      viewer = l.data().viewer === true; if (viewer) permAdmin = false;
      return true;
    } catch (e) { return false; }
  }
  async function ensureAuth() { if (!auth.currentUser) await withTimeout(signInAnonymously(auth)); return auth.currentUser.uid; }

  // Make an employee the store owner: a permanent manager nobody else can remove.
  async function setOwner(id) {
    try {
      const e = S.employees.find(x => x.id === id); if (!e || !e.phone) return { error: 'העובד לא נמצא' };
      const b = writeBatch(db);
      b.set(doc(db, 'config', 'owner'), { empId: id });
      const pub = clean((({ id: _, ...r }) => r)(e)); PRIVATE.forEach(k => delete pub[k]); pub.admin = true;
      b.set(doc(db, 'employees', id), pub);
      b.set(doc(db, 'logins', normPhone(e.phone)), { empId: id, num: String(e.num), admin: true, owner: true });
      b.set(doc(db, 'config', 'public'), { ownerSet: true }, { merge: true });
      await withTimeout(b.commit());
      ownerSet = true;
      if (id === empId) { owner = true; permAdmin = true; mgr = true; myLogin = { empId: id, num: String(e.num), admin: true, owner: true }; }
      subscribe();
      return { ok: true };
    } catch (err) { return { error: errText(err) }; }
  }
  const ready = (async () => {
    await auth.authStateReady();
    await readPublic();
    if (await linkSession()) {
      // PIN manager mode never survives an app restart; a permanent manager starts in manager mode.
      await deleteDoc(doc(db, 'managerSessions', auth.currentUser.uid)).catch(() => { });
      mgr = permAdmin;
      subscribe();
    }
  })();

  return {
    mode: 'cloud',
    S, ready,
    needsSetup: () => !setupDone,
    session: () => empId,
    isManager: () => mgr,
    isPermAdmin: () => permAdmin,
    isOwner: () => owner,
    hasOwner: () => ownerSet,
    isViewer: () => viewer,
    // The shared read-only "בקרה" login. Only managers (the owner, once one exists) may create it.
    async setViewer(phone, num) {
      try {
        const b = writeBatch(db);
        viewerLogins.forEach(v => { if (v.id !== phone) b.delete(doc(db, 'logins', v.id)); });
        if (phone) b.set(doc(db, 'logins', phone), { empId: 'viewer', num: String(num), viewer: true, owner: false });
        await withTimeout(b.commit()); return { ok: true };
      } catch (e) { return { error: errText(e) }; }
    },
    // Reel media is split into parts (each under Firestore's 1 MB document limit) and loaded only when watched.
    async uploadReel(meta, parts, onProg) {
      const id = newId();
      try {
        await withTimeout(setDoc(doc(db, 'reels', id), { ...meta, by: empId, ts: Date.now(), ready: false, parts: parts.length }));
        for (let i = 0; i < parts.length; i++) {
          await withTimeout(setDoc(doc(db, 'reelParts', id + '_' + i), { reel: id, i, data: parts[i] }), 60000);
          onProg && onProg((i + 1) / parts.length);
        }
        await setDoc(doc(db, 'reels', id), { ready: true }, { merge: true });
        return { ok: true, id };
      } catch (e) { deleteDoc(doc(db, 'reels', id)).catch(() => { }); return { error: errText(e) }; }
    },
    async loadParts(id) {
      const snap = await getDocs(query(collection(db, 'reelParts'), where('reel', '==', id)));
      return snap.docs.map(d => d.data()).sort((a, b) => a.i - b.i).map(p => p.data);
    },
    async deleteReel(r) {
      for (let i = 0; i < (r.parts || 0); i++) await deleteDoc(doc(db, 'reelParts', r.id + '_' + i)).catch(() => { });
      for (const c of S.reelComments.filter(c => c.reel === r.id)) await deleteDoc(doc(db, 'reelComments', c.id)).catch(() => { });
      await deleteDoc(doc(db, 'reels', r.id)).catch(() => { });
    },
    loaded: (...names) => names.every(n => loadedCols.has(n)),
    pinLength: () => pinLen,
    onChange: cb => changeCbs.push(cb),
    onError: cb => errorCbs.push(cb),
    save,

    async setup({ name, phone, num, wage, pin }) {
      try {
        const u = await ensureAuth(), id = newId(), p = normPhone(phone), n = String(num).trim();
        const b = writeBatch(db);
        b.set(doc(db, 'config', 'admin'), { pin });
        b.set(doc(db, 'config', 'public'), { setupDone: true, pinLen: pin.length });
        b.set(doc(db, 'employees', id), { name, phone: p, num: n, wage: Number(wage) });
        b.set(doc(db, 'logins', p), { empId: id, num: n, owner: false });
        b.set(doc(db, 'sessions', u), { phone: p, num: n, at: Date.now() });
        b.set(doc(db, 'managerSessions', u), { pin });
        await withTimeout(b.commit());
        setupDone = true; pinLen = pin.length; permAdmin = false; empId = id; myPhone = p; myNum = n; S.currentUser = id; mgr = true;
        subscribe(); return { ok: true };
      } catch (e) { return { error: errText(e) }; }
    },

    async login(phone, num) {
      const p = normPhone(phone), n = String(num).trim();
      try {
        const u = await ensureAuth();
        await withTimeout(setDoc(doc(db, 'sessions', u), { phone: p, num: n, at: Date.now() }));
      } catch (e) {
        if (/permission/i.test(e.code || '')) return { error: 'מספר הטלפון או מספר העובד לא נכונים' };
        return { error: errText(e) };
      }
      if (!(await linkSession())) return { error: 'מספר הטלפון או מספר העובד לא נכונים' };
      mgr = permAdmin; subscribe(); return { ok: true };
    },

    async logout() {
      const u = auth.currentUser;
      resetState();
      if (u) {
        await deleteDoc(doc(db, 'managerSessions', u.uid)).catch(() => { });
        await deleteDoc(doc(db, 'sessions', u.uid)).catch(() => { });
      }
      empId = null; mgr = false; permAdmin = false; owner = false; viewer = false; S.currentUser = null; myLogin = null; migrated = false;
      await signOut(auth).catch(() => { });
      emit();
    },

    // The first manager to claim it becomes the store owner: a permanent manager nobody else can remove.
    async claimOwner() { return setOwner(empId); },
    setOwner,
    async enterManager(pin) {
      if (permAdmin) { mgr = true; subscribe(); return true; }
      try {
        await withTimeout(setDoc(doc(db, 'managerSessions', auth.currentUser.uid), { pin }));
        mgr = true; subscribe(); return true;
      } catch (e) {
        if (!/permission/i.test(e.code || '')) fail(e);
        return false;
      }
    },
    async exitManager() {
      mgr = false; subscribe();
      await deleteDoc(doc(db, 'managerSessions', auth.currentUser.uid)).catch(() => { });
    },
    async changePin(old, next) {
      try {
        const u = auth.currentUser.uid, b = writeBatch(db);
        b.set(doc(db, 'config', 'admin'), { pin: next, old });
        b.set(doc(db, 'managerSessions', u), { pin: next });
        b.set(doc(db, 'config', 'public'), { setupDone: true, pinLen: next.length });
        await withTimeout(b.commit());
        pinLen = next.length; return { ok: true };
      } catch (e) {
        if (/permission/i.test(e.code || '')) return { error: 'הסיסמה הנוכחית שגויה' };
        return { error: errText(e) };
      }
    },
  };
}
