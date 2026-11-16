// Cloud store: every phone reads and writes the same Firestore database.
// The app keeps working on plain arrays in S and calls save(); save() compares S with what
// the server last sent and writes only the documents that changed.
import { initializeApp } from 'firebase/app';
import {
  initializeAuth, indexedDBLocalPersistence, signInAnonymously, signOut,
  GoogleAuthProvider, linkWithCredential, signInWithCredential
} from 'firebase/auth';
import { Capacitor, registerPlugin } from '@capacitor/core';
import {
  initializeFirestore, persistentLocalCache, doc, getDoc, setDoc, deleteDoc,
  collection, query, where, onSnapshot, writeBatch, getDocs
} from 'firebase/firestore';
import { uid as newId, normPhone, AREAS } from './util.js';

const COLS = ['employees', 'shifts', 'inventory', 'drinkUpdates', 'deliveries', 'tasks', 'notifications', 'grades', 'logins', 'itemNotes', 'itemImages', 'suppliers', 'orders', 'unavail', 'empPhotos', 'reels', 'reelComments', 'extras', 'prices', 'catalog', 'messages', 'sales'];
// Private messages: each phone reads only the conversations it is part of.
const MSG_Q = 'messages';
// The till's product list is stored as a few large documents ("chunks") of up to 700 products each,
// so opening the app reads about 10 documents instead of thousands.
// Collections kept in S as plain objects keyed by document id.
const MAPS = { itemNotes: 'notes', itemImages: 'images', empPhotos: 'empPhotos', prices: 'prices' };
const ARRAYS = ['employees', 'shifts', 'inventory', 'drinkUpdates', 'deliveries', 'tasks', 'notifications', 'suppliers', 'orders', 'unavail', 'reels', 'reelComments', 'extras', 'messages', 'sales'];
// Shown to everyone, never written from this list (each phone writes only its own shifts).
const READONLY = { openShifts: 'openShifts', members: 'members', signups: 'signups' };
const PUBLIC_CATS = ['drinks', 'salads'];
// Google sign-in inside the Android app goes through the phone's own Google account picker
// (Google does not allow signing in from inside an app's web view).
const NativeAuth = registerPlugin('FirebaseAuthentication');
const nativeGoogle = () => Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('FirebaseAuthentication');
// The project's web sign-in client (public id, not a secret). In a browser or on iPhone the app goes to Google's own
// sign-in page and comes back with a Google token in the address: no pop-up window, so it works in an app on the home screen.
const WEB_CLIENT = '531855451338-6cmn5v1tttc1fcasq01fa864801elvl6.apps.googleusercontent.com';
const RETURN_URL = () => location.origin + location.pathname.replace(/index\.html$/, '');
const rnd = () => [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');
// Each employee's level per area of the app (AREAS) is in members/{email}.perms.
const ALL_EDIT = Object.fromEntries(AREAS.map(a => [a, 'edit']));
// What a regular employee gets (must match the rules' claimOk).
const BASIC = { reels: 'edit', chat: 'edit' };
const googleErr = e => {
  const c = String((e && (e.code || e.message)) || '');
  if (/popup-closed|cancelled-popup|cancel|12501|16:/i.test(c)) return { cancel: true };
  if (/popup-blocked/.test(c)) return { error: 'הדפדפן חסם את חלון ההתחברות. אפשרו חלונות קופצים לאתר ונסו שוב' };
  if (/operation-not-supported|web-storage-unsupported/.test(c)) return { error: 'אי אפשר להתחבר עם Google מכאן. באייפון: פתחו את האתר בספארי עצמו ונסו שוב' };
  if (/network/i.test(c)) return { error: 'אין חיבור לאינטרנט. נסו שוב' };
  if (/unauthorized-domain/.test(c)) return { error: 'האתר עוד לא מאושר להתחברות עם Google' };
  if (/developer|10:|DEVELOPER_ERROR|no credential/i.test(c)) return { error: 'ההתחברות עם Google עוד לא מוכנה בגרסה הזו של האפליקציה. התקינו את הגרסה החדשה' };
  return { error: 'ההתחברות עם Google נכשלה: ' + c };
};

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

  const S = { prices: {}, catalog: [], employees: [], shifts: [], inventory: [], drinkUpdates: [], deliveries: [], tasks: [], notifications: [], grades: {}, notes: {}, images: {}, empPhotos: {}, openShifts: [], suppliers: [], orders: [], unavail: [], extras: [], currentUser: null };
  let synced = {}, loadedCols = new Set(), unsubs = [];
  // poster = the "חדשות מרקט" account, which may only post reels.
  let myPush = null;
  let empId = null, myPhone = null, myNum = null, owner = false, viewer = false, poster = false, viewerLogins = [], setupDone = true, pinLen = 4;
  // The signed-in Google account (email), its permissions per area, and a sign-up waiting for approval.
  let me = null, perms = {}, pend = null, unsubPend = null, ownerEmp = null;
  let ownerSet = false, migrated = false;
  // Level in an area: the owner has everything, the viewer sees everything.
  const lv = a => owner ? 'edit' : viewer ? 'view' : (perms[a] || 'none');
  const can = a => lv(a) !== 'none';
  // May manage employees (logins of the shared accounts, names list, sign-ups).
  const staffMgr = () => lv('staff') === 'edit';
  const PRIVATE = ['phone', 'num', 'owner'];
  // Employee names for the poster account, which may not read the employee list itself.
  let namesSynced = null;
  const changeCbs = [], errorCbs = [], syncCbs = [];
  // How fresh the data on this phone is: each live list says whether it came from the server or from the
  // phone's saved copy, and whether it holds changes not yet sent. lastSync = last moment everything was live.
  let fresh = {}, lastSync = 0;
  try { lastSync = +localStorage.getItem('dalpak-last-sync') || 0; } catch (e) { }
  function noteSync(name, snap) {
    fresh[name] = { cache: snap.metadata.fromCache, pending: snap.metadata.hasPendingWrites };
    const all = Object.values(fresh);
    if (all.length && all.every(f => !f.cache)) { lastSync = Date.now(); try { localStorage.setItem('dalpak-last-sync', String(lastSync)); } catch (e) { } }
    syncCbs.forEach(f => f());
  }
  const emit = () => changeCbs.forEach(f => f());
  const fail = e => { console.error(e); if (/permission/i.test((e && e.code) || '')) recheck(); errorCbs.forEach(f => f(errText(e))); };
  let rechecking = false, gErr = '';
  // Back from Google's sign-in page: take the token from the address (and clear it from there).
  function takeGoogleReturn() {
    const h = new URLSearchParams((location.hash || '').replace(/^#/, ''));
    if (!h.has('state')) return null;
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem('dalpak-g') || 'null'); localStorage.removeItem('dalpak-g'); } catch (e) { }
    try { history.replaceState(history.state, '', location.pathname + location.search); } catch (e) { }
    if (!saved || saved.state !== h.get('state') || Date.now() - saved.t > 15 * 60000) return { error: 'ההתחברות עם Google לא הושלמה. נסו שוב' };
    if (h.get('error')) return h.get('error') === 'access_denied' ? { cancel: true } : { error: 'Google החזיר שגיאה: ' + h.get('error') };
    const tok = h.get('id_token');
    return tok ? { cred: GoogleAuthProvider.credential(tok) } : { error: 'ההתחברות עם Google לא הושלמה. נסו שוב' };
  }
  // Signs this phone in with a Google account. A phone signed in the old way keeps its sign-in (Google is linked
  // to it), so an employee whose old login was checked with this account moves over without approval.
  async function finishGoogle(cred) {
    const before = auth.currentUser;
    try {
      if (before && before.isAnonymous) await linkWithCredential(before, cred);
      else await signInWithCredential(auth, cred);
    } catch (e) {
      if (!/credential-already-in-use|email-already-in-use|provider-already-linked/.test(e.code || '')) throw e;
      await signInWithCredential(auth, GoogleAuthProvider.credentialFromError(e) || cred);
    }
    await auth.currentUser.getIdToken(true);
    return afterGoogle();
  }
  async function afterGoogle() {
    if (await linkMember()) { subscribe(); emit(); return { ok: true }; }
    const u = auth.currentUser;
    if (u && u.email) { await requestJoin(u); return { pending: true }; }
    return { error: 'ההתחברות עם Google לא הושלמה' };
  }
  // The signed-in Google account as an employee: members/{email} says which employee and what they may do.
  async function linkMember() {
    const u = auth.currentUser; if (!u || !u.email) return false;
    const em = u.email.toLowerCase();
    try {
      let m = await withTimeout(getDoc(doc(db, 'members', em)), 12000);
      if (!m.exists() && await claimLegacy(u, em)) m = await getDoc(doc(db, 'members', em));
      if (!m.exists()) return false;
      const d = m.data();
      if (!d.empId) return false;
      me = em; empId = d.empId; perms = d.perms || {}; owner = d.owner === true; viewer = false; poster = false;
      S.currentUser = empId; pend = null; if (unsubPend) { unsubPend(); unsubPend = null; }
      return true;
    } catch (e) { console.warn('member', e); return false; }
  }
  // Moving over from the old sign-in (phone + number checked with this Google account): approve yourself as
  // the same employee. Managers keep full rights.
  async function claimLegacy(u, em) {
    try {
      const s = await getDoc(doc(db, 'sessions', u.uid)); if (!s.exists()) return false;
      const { phone, num } = s.data();
      const l = await getDoc(doc(db, 'logins', phone)); if (!l.exists()) return false;
      const L = l.data();
      if (String(L.num) !== String(num) || String(L.google || '').toLowerCase() !== em || !L.empId) return false;
      const full = L.admin === true || L.owner === true;
      await setDoc(doc(db, 'members', em), { empId: L.empId, email: em, perms: full ? ALL_EDIT : BASIC, ...(L.owner === true ? { owner: true } : {}), ts: Date.now() });
      return true;
    } catch (e) { console.warn('claim', e); return false; }
  }
  // A Google account that is not an employee yet: ask to join, and wait for a manager to approve it.
  async function requestJoin(u) {
    const em = u.email.toLowerCase();
    pend = { email: em, name: u.displayName || '', photo: u.photoURL || '' };
    try {
      const had = await getDoc(doc(db, 'signups', em));
      if (!had.exists()) await setDoc(doc(db, 'signups', em), { email: em, name: pend.name.slice(0, 150), photo: pend.photo.slice(0, 1900), ts: Date.now() });
    } catch (e) { console.warn('signup', e); }
    if (unsubPend) unsubPend();
    unsubPend = onSnapshot(doc(db, 'members', em), async d => {
      if (!d.exists()) return;
      if (await linkMember()) { subscribe(); emit(); }
    }, () => { });
    emit();
  }
  // Access was refused mid-session: maybe the manager removed this account or changed its permissions.
  async function recheck() {
    if (rechecking || !empId || !me) return; rechecking = true;
    try {
      const was = stable(perms);
      if (await linkMember()) { if (stable(perms) !== was) { subscribe(); emit(); } }
      else { unsubs.forEach(u => u()); unsubs = []; empId = null; S.currentUser = null; const u = auth.currentUser; if (u && u.email) await requestJoin(u); emit(); }
    } finally { rechecking = false; }
  }

  // ---- mapping between S and Firestore documents ----
  function desired(col) {
    const m = new Map();
    if (ARRAYS.includes(col)) S[col].forEach(x => { const { id, ...rest } = x; const d = clean(rest); if (col === 'employees' && d.owner) { PRIVATE.forEach(k => delete d[k]); d.admin = true; } m.set(id, d); });
    else if (col === 'grades') Object.entries(S.grades).forEach(([k, v]) => m.set(k, { v }));
    else if (MAPS[col]) Object.entries(S[MAPS[col]]).forEach(([k, v]) => m.set(k, clean(v)));
    else if (col === 'catalog') (S.catalog || []).forEach(({ id, chunk, ...rest }) => { const c = chunk || 'c0'; if (!m.has(c)) m.set(c, { items: {} }); m.get(c).items[id] = clean(rest); });
    return m;
  }
  function apply(col, snap) {
    if (READONLY[col]) { S[READONLY[col]] = snap.docs.map(d => ({ id: d.id, ...d.data() })); loadedCols.add(col); return; }
    const m = new Map();
    snap.docs.forEach(d => m.set(d.id, stable(d.data())));
    synced[col] = m;
    if (ARRAYS.includes(col)) S[col] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (col === 'employees') {
      syncNames();
    }
    else if (col === 'logins') {
      viewerLogins = snap.docs.filter(d => d.data().viewer === true || d.data().poster === true).map(d => ({ id: d.id, data: d.data() }));
      const vw = viewerLogins.find(v => v.data.viewer), ps = viewerLogins.find(v => v.data.poster);
      S.viewerLogin = vw ? { phone: vw.id, num: vw.data.num } : null;
      S.posterLogin = ps ? { phone: ps.id, num: ps.data.num } : null;
    }
    else if (col === 'catalog') { S.catalog = []; snap.docs.forEach(d => Object.entries(d.data().items || {}).forEach(([id, v]) => S.catalog.push({ id, chunk: d.id, ...v }))); }
    else if (col === 'grades') { S.grades = {}; snap.docs.forEach(d => S.grades[d.id] = d.data().v); }
    else if (MAPS[col]) { const o = {}; snap.docs.forEach(d => o[d.id] = d.data()); S[MAPS[col]] = o; }
    loadedCols.add(col);
  }

  // Managers keep config/names up to date: just id → name, nothing private.
  function syncNames() {
    if (!staffMgr() || namesSynced === null || !loadedCols.has('employees')) return;
    const want = {}; S.employees.forEach(e => { want[e.id] = e.name; });
    const s = stable(want); if (s === namesSynced) return; namesSynced = s;
    setDoc(doc(db, 'config', 'names'), want).catch(() => { });
  }
  function resetState() {
    unsubs.forEach(u => u()); unsubs = []; fresh = {};
    ARRAYS.forEach(c => S[c] = []); S.members = []; S.signups = []; S.grades = {}; S.notes = {}; S.images = {}; S.empPhotos = {}; S.prices = {}; S.catalog = []; S.openShifts = [];
    synced = {}; loadedCols = new Set(); namesSynced = null; S.names = {};
    COLS.forEach(c => synced[c] = new Map());
  }
  function subscribe() {
    resetState();
    if (!empId) { emit(); return; }
    const c = n => collection(db, n);
    if (staffMgr() || poster) unsubs.push(onSnapshot(doc(db, 'config', 'names'), d => { S.names = d.exists() ? d.data() : {}; namesSynced = stable(S.names); syncNames(); emit(); }, () => { }));
    // Each list loads in full only for those whose permissions cover it; otherwise just the employee's own part.
    const all = n => [n, c(n)], mine = n => [n, query(c(n), where('empId', '==', empId))], pub = n => [n, query(c(n), where('cat', 'in', PUBLIC_CATS))];
    const any = (...a) => a.some(can);
    const specs = poster ? [['reels', c('reels')], ['reelComments', c('reelComments')], ['empPhotos', c('empPhotos')]]
      : viewer
      ? [...COLS.filter(n => n !== 'logins' && n !== MSG_Q).map(all), ['openShifts', query(c('shifts'), where('status', '==', 'open'))]]
      : [all('employees'),
        can('hours') ? all('shifts') : mine('shifts'),
        ['openShifts', query(c('shifts'), where('status', '==', 'open'))],
        any('inv', 'products', 'orders', 'pos') ? all('inventory') : pub('inventory'),
        all('drinkUpdates'), all('deliveries'),
        can('tasks') ? all('tasks') : mine('tasks'),
        can('hours') ? all('unavail') : mine('unavail'),
        all('empPhotos'), all('reels'), all('reelComments'),
        can('hours') ? all('extras') : mine('extras'),
        [MSG_Q, query(c(MSG_Q), where('pair', 'array-contains', empId))],
        any('inv', 'products', 'pos') ? all('itemImages') : pub('itemImages'),
        ...(any('hours', 'inv', 'staff') ? [all('notifications')] : []),
        ...(any('inv', 'products') ? [all('itemNotes')] : []),
        ...(can('tasks') ? [all('grades')] : []),
        ...(any('orders', 'products') ? [all('suppliers')] : []),
        ...(any('products', 'pos', 'orders', 'inv') ? [all('prices')] : []),
        ...(any('products', 'pos') ? [all('catalog')] : []),
        ...(can('orders') ? [all('orders')] : []),
        ...(can('pos') ? [all('sales')] : []),
        ...(staffMgr() ? [['logins', query(c('logins'), where('owner', '==', false))]] : []),
        ...(can('staff') ? [all('members'), all('signups')] : [])];
    specs.forEach(([name, q]) => {
      unsubs.push(onSnapshot(q, { includeMetadataChanges: true }, snap => {
        noteSync(name, snap);
        // A change only in the sync state (sent, back online) needs no new data.
        if (loadedCols.has(name) && !snap.docChanges().length) return;
        apply(name, snap); emit();
      }, e => fail(e)));
    });
    emit();
    if (staffMgr()) migrate();
    if (can('staff')) getDoc(doc(db, 'config', 'owner')).then(d => { ownerEmp = d.exists() ? d.data().empId : null; emit(); }).catch(() => { });
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
    // The poster account only ever writes its own profile photo here; reels go through uploadReel.
    // Only lists this employee may change (the rest are compared but never written).
    const ed = a => lv(a) === 'edit';
    const W = { logins: false, inventory: ed('inv') || ed('products'), itemNotes: ed('inv') || ed('products'), itemImages: ed('inv') || ed('products'),
      suppliers: ed('orders') || ed('products'), orders: ed('orders'), grades: ed('tasks'), prices: ed('products'), catalog: ed('products'), sales: ed('pos') };
    const cols = poster ? ['empPhotos'] : COLS.filter(c => W[c] !== false && (W[c] === undefined || W[c]));
    for (const col of cols) {
      // The product list is large: compare it only after it changed, and never before it has loaded.
      if (col === 'catalog' && (!S.catalogDirty || !loadedCols.has('catalog'))) continue;
      const want = desired(col), have = synced[col] || new Map();
      for (const [id, data] of want) { const s = stable(data); if (have.get(id) !== s) { sets.push([col, id, data]); have.set(id, s); } }
      for (const id of [...have.keys()]) if (!want.has(id)) { dels.push([col, id]); have.delete(id); }
      synced[col] = have;
    }
    if (loadedCols.has('catalog')) S.catalogDirty = false;
    if (!sets.length && !dels.length) return;
    const run = async () => {
      // Queue every write at once: Firestore keeps them in order and in its local cache, so they still reach the
      // server if the app is closed mid-way (waiting for each one before sending the next lost the rest).
      await Promise.all(sets.map(([col, id, data]) => setDoc(doc(db, col, id), data)));
      await Promise.all(dels.map(([col, id]) => deleteDoc(doc(db, col, id))));
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
      // Phone sign-in is left only for the shared accounts; employees sign in with Google.
      if (l.data().viewer !== true && l.data().poster !== true) return 'employee';
      empId = l.data().empId; myPhone = phone; myNum = String(num); S.currentUser = empId;
      owner = false; perms = {}; me = null;
      viewer = l.data().viewer === true; poster = l.data().poster === true;
      return true;
    } catch (e) { return false; }
  }
  async function ensureAuth() { if (!auth.currentUser) await withTimeout(signInAnonymously(auth)); return auth.currentUser.uid; }

  const ready = (async () => {
    await auth.authStateReady();
    await readPublic();
    const r = takeGoogleReturn();
    if (r && r.cred) {
      // Back from Google's sign-in page.
      try { const f = await finishGoogle(r.cred); if (f.error) gErr = f.error; }
      catch (e) { console.warn('google', e); gErr = googleErr(e).error || ''; }
      return;
    }
    if (r && r.error) gErr = r.error;
    const u = auth.currentUser;
    if (u && u.email) { if (await linkMember()) subscribe(); else await requestJoin(u); }
    else if ((await linkSession()) === true) subscribe();
  })();

  return {
    mode: 'cloud',
    firebaseApp: app,
    S, ready,
    // Notification settings of the signed-in employee (what to get, quiet hours, Shabbat).
    async getPushPrefs() {
      if (!empId) return null;
      const d = await withTimeout(getDoc(doc(db, 'pushPrefs', empId)), 10000);
      return d.exists() ? d.data() : null;
    },
    async setPushPrefs(p) {
      if (!empId || viewer || poster) return;
      const keep = ['msg', 'preview', 'task', 'shift', 'req', 'reels', 'alerts', 'quiet', 'quietFrom', 'quietTo', 'shabbat'];
      await setDoc(doc(db, 'pushPrefs', empId), { ...Object.fromEntries(keep.map(k => [k, p[k]])), ts: Date.now() });
    },
    // Closing a shift by location: the shop's location, radius and waiting time (config/geo, set by managers).
    async getGeoCfg() {
      const d = await withTimeout(getDoc(doc(db, 'config', 'geo')), 10000);
      return d.exists() ? d.data() : null;
    },
    async setGeoCfg(c) {
      const n = v => (v === null || v === undefined || v === '' || isNaN(+v)) ? null : +v;
      await setDoc(doc(db, 'config', 'geo'), { on: !!c.on, lat: n(c.lat), lng: n(c.lng), acc: n(c.acc), radius: n(c.radius) || 150, grace: n(c.grace) || 75, ts: Date.now() });
    },
    // Where an open shift stands: the last time inside the area and when the employee left (shiftGeo/{shift}).
    async getGeo(shiftId) {
      const d = await withTimeout(getDoc(doc(db, 'shiftGeo', shiftId)), 10000);
      return d.exists() ? d.data() : null;
    },
    async geoPing(shiftId, g) {
      if (!empId || viewer || poster) return;
      await setDoc(doc(db, 'shiftGeo', shiftId), { emp: empId, home: g.home || null, lastIn: g.lastIn || null, outAt: g.outAt || null, dist: g.dist ?? null, acc: g.acc ?? null, unsure: !!g.unsure, ts: Date.now() });
    },
    async geoClear(shiftId) {
      if (!empId || viewer || poster) return;
      await deleteDoc(doc(db, 'shiftGeo', shiftId));
    },
    // Asks the server to send this employee a test notification.
    async testPush() {
      if (!empId) return;
      await setDoc(doc(db, 'pushTests', newId()), { emp: empId, ts: Date.now() });
    },
    // This phone's notification token, saved under the signed-in employee (the server reads it to send).
    async savePushToken(token, platform) {
      if (!empId || viewer || poster || !token) return;
      myPush = token;
      await setDoc(doc(db, 'pushTokens', token), { emp: empId, token, platform, ts: Date.now() }).catch(e => console.warn('push token', e));
    },
    needsSetup: () => !setupDone,
    session: () => empId,
    // Level of the signed-in employee in an area of the app: 'none' | 'view' | 'edit'.
    perm: lv,
    perms: () => ({ ...perms }),
    myEmail: () => me,
    isManager: () => owner || viewer || AREAS.some(a => !['reels', 'chat', 'deliv', 'inv'].includes(a) && can(a)),
    isOwner: () => owner,
    ownerEmp: () => ownerEmp,
    hasOwner: () => ownerSet,
    isViewer: () => viewer,
    isPoster: () => poster,
    // The "חדשות מרקט" login: posts reels only. Any manager may turn it on or off.
    async setPoster(phone, num) {
      try {
        const b = writeBatch(db);
        viewerLogins.forEach(v => { if (v.data.poster && v.id !== phone) b.delete(doc(db, 'logins', v.id)); });
        if (phone) b.set(doc(db, 'logins', phone), { empId: 'news', num: String(num), poster: true, owner: false });
        await withTimeout(b.commit()); return { ok: true };
      } catch (e) { return { error: errText(e) }; }
    },
    // The shared read-only "בקרה" login. Only managers (the owner, once one exists) may create it.
    async setViewer(phone, num) {
      try {
        const b = writeBatch(db);
        viewerLogins.forEach(v => { if (v.data.viewer && v.id !== phone) b.delete(doc(db, 'logins', v.id)); });
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
    onSync: cb => syncCbs.push(cb),
    // { state: 'live' | 'offline' | 'connecting', last: time everything was last up to date, pending: changes not sent yet }
    syncInfo() {
      const all = Object.values(fresh), pending = all.some(f => f.pending);
      const state = !navigator.onLine ? 'offline' : !all.length ? 'connecting' : all.every(f => !f.cache) ? 'live' : 'offline';
      return { state, last: state === 'live' ? Date.now() : lastSync, pending };
    },
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
        await withTimeout(b.commit());
        setupDone = true; pinLen = pin.length; empId = id; myPhone = p; myNum = n; S.currentUser = id;
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
      const ok = await linkSession();
      if (ok === 'employee') { await deleteDoc(doc(db, 'sessions', auth.currentUser.uid)).catch(() => { }); return { error: 'עובדים נכנסים עכשיו עם חשבון Google. לחצו על "כניסה עם Google"' }; }
      if (!ok) return { error: 'מספר הטלפון או מספר העובד לא נכונים' };
      subscribe(); return { ok: true };
    },

    // ---- sign-in with Google ----
    // A Google account waiting for a manager's approval: { email, name, photo }.
    pending: () => pend,
    googleError: () => gErr,
    async googleLogin() {
      gErr = '';
      try {
        if (nativeGoogle()) {
          const r = await NativeAuth.signInWithGoogle({ skipNativeAuth: true });
          if (!r || !r.credential || !r.credential.idToken) return { error: 'ההתחברות עם Google לא הושלמה' };
          return await finishGoogle(GoogleAuthProvider.credential(r.credential.idToken, r.credential.accessToken || null));
        }
        // In a browser or on iPhone: go to Google's page and come back (see takeGoogleReturn).
        const state = rnd(), nonce = rnd();
        try { localStorage.setItem('dalpak-g', JSON.stringify({ state, t: Date.now() })); } catch (e) { }
        const q = new URLSearchParams({ client_id: WEB_CLIENT, redirect_uri: RETURN_URL(), response_type: 'id_token', scope: 'openid email profile', nonce, state, prompt: 'select_account' });
        location.assign('https://accounts.google.com/o/oauth2/v2/auth?' + q);
        return { redirect: true };
      } catch (e) { console.warn('google', e); return googleErr(e); }
    },
    // ---- employees and permissions (for those who may manage staff) ----
    // Approve a sign-up: link the Google account to an existing employee, or create a new employee for it.
    async approve(email, { empId: id, newEmp, perms: p }) {
      try {
        const em = String(email).toLowerCase(), b = writeBatch(db);
        let eid = id;
        if (!eid && newEmp) { eid = newId(); b.set(doc(db, 'employees', eid), clean(newEmp)); }
        if (!eid) return { error: 'צריך לבחור עובד' };
        // Another Google account linked to the same employee is replaced.
        (S.members || []).filter(m => m.empId === eid && m.id !== em).forEach(m => b.delete(doc(db, 'members', m.id)));
        b.set(doc(db, 'members', em), { empId: eid, email: em, perms: clean(p || BASIC), ...(eid === ownerEmp ? { owner: true } : {}), ts: Date.now() });
        b.delete(doc(db, 'signups', em));
        await withTimeout(b.commit());
        return { ok: true, empId: eid };
      } catch (e) { return { error: errText(e) }; }
    },
    async reject(email) {
      try { await withTimeout(deleteDoc(doc(db, 'signups', String(email).toLowerCase()))); return { ok: true }; }
      catch (e) { return { error: errText(e) }; }
    },
    async setPerms(email, p) {
      try {
        const m = (S.members || []).find(x => x.id === email); if (!m) return { error: 'החשבון לא נמצא' };
        await withTimeout(setDoc(doc(db, 'members', email), { empId: m.empId, email: m.email || email, perms: clean(p), ...(m.empId === ownerEmp ? { owner: true } : {}), ts: Date.now() }));
        return { ok: true };
      } catch (e) { return { error: errText(e) }; }
    },
    // Disconnect a Google account from its employee (the employee record and history stay).
    async unlink(email) {
      try { await withTimeout(deleteDoc(doc(db, 'members', email))); return { ok: true }; }
      catch (e) { return { error: errText(e) }; }
    },
    AREAS,

    async logout() {
      // Stop notifications for this employee on this phone before the session ends.
      if (myPush) { await deleteDoc(doc(db, 'pushTokens', myPush)).catch(() => { }); myPush = null; }
      const u = auth.currentUser;
      resetState();
      if (u) {
        await deleteDoc(doc(db, 'managerSessions', u.uid)).catch(() => { });
        await deleteDoc(doc(db, 'sessions', u.uid)).catch(() => { });
      }
      empId = null; owner = false; viewer = false; poster = false; S.currentUser = null; migrated = false;
      me = null; perms = {}; pend = null; gErr = ''; if (unsubPend) { unsubPend(); unsubPend = null; }
      await signOut(auth).catch(() => { });
      emit();
    },

  };
}
