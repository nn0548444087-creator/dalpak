import './style.css';
import { createStore } from './store.js';
import { H, DAY, uid, pad, sum, dur, sod, sameDay, monthKey, prevMonthKey, dateKey, weekStart, normPhone, fmtPhone, buildSummary, hasSummary } from './util.js';

const ROOT = document.documentElement; ROOT.lang = 'he'; ROOT.dir = 'rtl';
const LS_DISPLAY = 'dalpak-display';
const SUBS = ['שתייה', 'שתייה אמריקאי', 'בירות', 'שתייה גדולה'];
const CATS = { drinks: 'שתייה', snacks: 'חטיפים', salads: 'סלטים' };
let store, S, manager = false, view = 'clock', invTab = 'drinks', hoursRange = 'week', pinBuf = '', pinNext = null, pinBusy = false, toastT, booting = true, busy = false, monthChecked = false, renderPending = false;

/* ---------- display settings (per device) ---------- */
const ACC = {
  brand: { n: 'שאבעס מרקט', l: ['#25528D', '#DCE5F2'], d: ['#86A9E0', '#1A2A47'] },
  petrol: { n: 'פטרול', l: ['#0D5C61', '#D6E8E7'], d: ['#55B5B1', '#17363A'] },
  navy: { n: 'כחול לילה', l: ['#1F3F7A', '#DCE4F3'], d: ['#83A6E8', '#1B2840'] },
  wine: { n: 'בורדו', l: ['#7A2335', '#F1DCE0'], d: ['#E28C9C', '#3A1D24'] },
  forest: { n: 'ירוק יער', l: ['#2F5D3A', '#DDEADF'], d: ['#7CC08D', '#1A3121'] },
  plum: { n: 'שזיף', l: ['#5B3A75', '#E7DEF0'], d: ['#BA9DD8', '#2B2238'] },
  graphite: { n: 'גרפיט', l: ['#2C3640', '#DFE3E7'], d: ['#B6C2CD', '#232C34'] }
};
const DS_DEFAULT = { theme: 'system', accent: 'brand', scale: 100, font: 'Assistant', heading: 'serif', density: 'normal', radius: 'normal', dial: 'normal', clock12: false, seconds: true, showPay: true, contrast: false, motion: true, invSort: 'name', lowHi: true, home: 'clock', dateStyle: 'short' };
let DS = { ...DS_DEFAULT };
try { DS = { ...DS_DEFAULT, ...JSON.parse(localStorage.getItem(LS_DISPLAY) || '{}') }; } catch (e) { }
// Phones that kept the old default colour switch to the store colours once.
if (DS.v !== 2) { if (DS.accent === 'petrol') DS.accent = 'brand'; DS.v = 2; try { localStorage.setItem(LS_DISPLAY, JSON.stringify(DS)); } catch (e) { } }
const saveDS = () => { try { localStorage.setItem(LS_DISPLAY, JSON.stringify(DS)); } catch (e) { } };
const mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : { matches: false, addEventListener() { } };
let hostTheme = ROOT.getAttribute('data-theme');
function applyDisplay() {
  const want = DS.theme === 'system' ? hostTheme : DS.theme;
  if (want) { if (ROOT.getAttribute('data-theme') !== want) ROOT.setAttribute('data-theme', want); }
  else if (ROOT.hasAttribute('data-theme')) ROOT.removeAttribute('data-theme');
  const t = ROOT.getAttribute('data-theme'), dark = t === 'dark' || (!t && mq.matches), st = ROOT.style;
  const a = (ACC[DS.accent] || ACC.brand)[dark ? 'd' : 'l'];
  st.setProperty('--accent', a[0]); st.setProperty('--accent-soft', a[1]); st.setProperty('--accent-ink', dark ? '#0B1115' : '#FFFFFF');
  if (DS.contrast) { st.setProperty('--muted', dark ? '#C6D1D8' : '#34414A'); st.setProperty('--line', dark ? '#4C5C68' : '#97A4AE'); }
  else { st.removeProperty('--muted'); st.removeProperty('--line'); }
  st.fontSize = (16 * DS.scale / 100) + 'px';
  st.setProperty('--f-body', `'${DS.font}','Segoe UI',Arial,sans-serif`);
  st.setProperty('--f-display', DS.heading === 'serif' ? "'Frank Ruhl Libre','David','Times New Roman',serif" : `'${DS.font}','Segoe UI',Arial,sans-serif`);
  const D = { comfy: ['17px', '22px'], normal: ['13px', '18px'], compact: ['8px', '12px'] }[DS.density] || ['13px', '18px'];
  st.setProperty('--rowpad', D[0]); st.setProperty('--gap', D[1]);
  const R = { sharp: ['6px', '6px'], normal: ['16px', '11px'], round: ['24px', '18px'] }[DS.radius] || ['16px', '11px'];
  st.setProperty('--r', R[0]); st.setProperty('--rb', R[1]);
  st.setProperty('--dial', { small: '190px', normal: '236px', large: '290px' }[DS.dial] || '236px');
  ROOT.classList.toggle('no-motion', !DS.motion);
  const meta = document.querySelector('meta[name=theme-color]'); if (meta) meta.content = dark ? '#0C1220' : '#EDF0F5';
}
mq.addEventListener && mq.addEventListener('change', () => { applyDisplay(); if (view === 'display') render(); });
new MutationObserver(() => {
  if (DS.theme === 'system') { const v = ROOT.getAttribute('data-theme'); if (v !== hostTheme) { hostTheme = v; applyDisplay(); if (view === 'display') render(); } }
}).observe(ROOT, { attributes: true, attributeFilter: ['data-theme'] });

const P = { clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', box: '<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5 12 12l9-4.5M12 12v9"/>', truck: '<path d="M2 6h11v10H2zM13 9h4.5l3.5 4v3h-8"/><circle cx="6" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>', bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>', menu: '<path d="M4 6h16M4 12h16M4 18h16"/>', lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>', unlock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.6-1.8"/>', check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>', plus: '<path d="M12 5v14M5 12h14"/>', chev: '<path d="m15 6-6 6 6 6"/>', chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>', task: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8 12 3 3 5-6"/>', cog: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>', user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>', alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.5"/>', eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>', out: '<path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10"/>', phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>' };
P.camera = '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>';
P.note = '<path d="M5 4h14v12l-4 4H5z"/><path d="M15 20v-4h4M8 9h8M8 13h5"/>';
const ic = (n, c = '') => `<svg class="ic ${c}" viewBox="0 0 24 24" aria-hidden="true">${P[n]}</svg>`;

/* ---------- display helpers ---------- */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtT = ts => { const d = new Date(ts), h = d.getHours(), m = pad(d.getMinutes()); return DS.clock12 ? `${h % 12 || 12}:${m} ${h < 12 ? 'בבוקר' : 'אחה״צ'}` : pad(h) + ':' + m; };
const fmtD = ts => new Date(ts).toLocaleDateString('he-IL', DS.dateStyle === 'long' ? { weekday: 'long', day: 'numeric', month: 'long' } : { weekday: 'short', day: 'numeric', month: 'numeric' });
const fmtLong = ts => new Date(ts).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtH = h => { const m = Math.max(0, Math.round(h * 60)); return Math.floor(m / 60) + ':' + pad(m % 60); };
const money = n => '₪' + (Math.round(n * 100) / 100).toLocaleString('he-IL', { maximumFractionDigits: 2 });
const monthName = k => { const [y, m] = k.split('-'); return new Date(+y, +m - 1, 1).toLocaleDateString('he-IL', { month: 'long', year: 'numeric' }); };
const toLocalInput = t => { const d = new Date(t); return dateKey(t) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
const emp = id => S.employees.find(e => e.id === id) || { name: 'עובד', wage: 50, num: '', phone: '' };
const session = () => store && store.session();
const cur = () => emp(session());
const first = n => String(n).split(' ')[0];
const openShift = id => S.shifts.find(s => s.empId === id && s.status === 'open');
const ago = t => { const m = Math.round((Date.now() - t) / 6e4); if (m < 60) return `לפני ${Math.max(m, 0)} דק׳`; const h = Math.floor(m / 60); if (h < 24) return `לפני ${h} שע׳`; return fmtD(t); };
const save = () => store.save();
const local = () => store.mode === 'local';

function checkMonthly() {
  if (monthChecked || !manager || !store.loaded('employees', 'shifts', 'notifications')) return;
  monthChecked = true;
  const k = prevMonthKey();
  if (!hasSummary(S, k) && S.shifts.some(s => s.status === 'approved' && s.end && monthKey(s.start) === k)) {
    buildSummary(S, k); save(); toast(`סיכום השכר של ${monthName(k)} מוכן בהתראות`);
  }
}
function alerts() {
  const now = Date.now();
  const long = S.shifts.filter(s => s.status === 'open' && now - s.start > 12 * H && !(s.allowUntil && now < s.allowUntil));
  const reqs = S.shifts.filter(s => s.status === 'pending');
  const drinks = S.drinkUpdates.filter(u => u.status === 'pending');
  return { long, reqs, drinks, count: manager ? long.length + reqs.length + drinks.length : 0 };
}

/* ---------- shell ---------- */
function renderNav() {
  const nav = document.getElementById('navbar'); nav.hidden = !session(); if (!session()) return;
  const n = alerts().count;
  // Manager-only screens stay out of sight until manager mode is on.
  const tabs = [['clock', 'שעון', 'clock'], ['inv', 'מלאי', 'box'], ['deliv', 'אספקה', 'truck'], ...(store.isManager() ? [['alerts', 'התראות', 'bell']] : []), ['more', 'עוד', 'menu']];
  document.getElementById('nav').innerHTML = tabs.map(([v, l, i]) => `<button class="tab ${view === v || (v === 'more' && ['hours', 'tasks', 'admin', 'display'].includes(view)) ? 'on' : ''}" data-action="nav" data-view="${v}">${ic(i)}${l}${v === 'alerts' && n ? `<span class="badge">${n}</span>` : ''}</button>`).join('');
}
function render() {
  renderPending = false;
  if (!store) return;
  S = store.S; manager = store.isManager();
  const brand = `<div class="brand"><img class="mark" src="./logo.png" alt=""><div><b>שאבעס מרקט</b><small>ניהול חנות${local() ? ' · גרסת דמו' : ''}</small></div></div>`;
  const hdr = document.getElementById('hdr'), main = document.getElementById('main');
  if (booting) { hdr.innerHTML = brand; main.innerHTML = `<div class="view"><div class="lock"><p class="muted">טוען נתונים…</p></div></div>`; renderNav(); return; }
  if (!session()) {
    hdr.innerHTML = brand + `<div class="top-actions"><button class="chip" data-action="nav" data-view="display">${ic('eye', 'sm')}תצוגה</button></div>`;
    main.innerHTML = `<div class="view">${view === 'display' ? vDisplay() : store.needsSetup() ? vSetup() : vLogin()}</div>`;
    renderNav(); return;
  }
  checkMonthly();
  const me = cur();
  hdr.innerHTML = brand + `
    <div class="top-actions">
      ${manager ? `<button class="chip mgr" data-action="lock">${ic('unlock', 'sm')}מנהל · נעל</button>` : `<button class="chip" data-action="pin">${ic('lock', 'sm')}מנהל</button>`}
      <button class="chip" data-action="account"><span class="av">${esc((me.name || '?')[0])}</span>${esc(first(me.name))}</button>
    </div>`;
  if (!manager) { if (['alerts', 'hours', 'tasks', 'admin'].includes(view)) view = 'clock'; invTab = 'drinks'; }
  const V = { clock: vClock, inv: vInv, deliv: vDeliv, alerts: vAlerts, more: vMore, hours: vHours, tasks: vTasks, admin: vAdmin, display: vDisplay };
  main.innerHTML = `<div class="view">${(V[view] || vClock)()}</div>`;
  renderNav(); tick();
}
// Data from other phones arrives at any moment; wait while someone is typing or a sheet is open.
function softRender() {
  const a = document.activeElement;
  const typing = a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
  if (typing || document.querySelector('.sheet')) { renderPending = true; renderNav(); return; }
  render();
}
document.addEventListener('focusout', () => setTimeout(() => { if (renderPending && !document.querySelector('.sheet')) { const a = document.activeElement; if (!a || !/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) render(); } }, 50));

const locked = (t, s) => `<div class="lock"><div class="lk">${ic('lock')}</div><h4>${t}</h4><p class="muted">${s || 'האזור הזה פתוח למנהל המערכת בלבד.'}</p><button class="btn brass" data-action="pin">הזנת סיסמת מנהל</button></div>`;
const back = () => `<button class="link-btn" data-action="nav" data-view="${session() ? 'more' : 'login'}">${ic('chev', 'sm')}<span>${session() ? 'חזרה לתפריט' : 'חזרה להתחברות'}</span></button>`;

/* ---------- login & first-time setup ---------- */
function vLogin() {
  return `<div class="login">
    <img class="mark" src="./logo.png" alt="שאבעס מרקט">
    <h2>ברוכים הבאים לשאבעס מרקט</h2>
    <p class="lead">מתחברים עם מספר הטלפון ומספר העובד שמנהל החנות רשם עבורכם.</p>
    <form class="form" data-form="login">
      <div class="field"><label for="lg-p">מספר טלפון</label><input id="lg-p" class="phone-in" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="050-000-0000" required></div>
      <div class="field"><label for="lg-n">מספר עובד</label><input id="lg-n" class="phone-in" name="num" inputmode="numeric" autocomplete="off" placeholder="101" required></div>
      <button class="btn primary block" ${busy ? 'disabled' : ''}>${busy ? 'מתחבר…' : 'כניסה'}</button></form>
    ${local() ? `<div class="demo-box"><b>עובדי הדמו · לחיצה ממלאת את הפרטים</b><div class="demo-phones">${S.employees.map(e => `<button data-action="fill-login" data-p="${esc(e.phone)}" data-n="${esc(e.num)}">${esc(first(e.name))} · <span class="ltr">${fmtPhone(e.phone)}</span> · ${esc(e.num)}</button>`).join('')}</div></div>` : ''}
  </div>`;
}
function vSetup() {
  return `<div class="login">
    <img class="mark" src="./logo.png" alt="שאבעס מרקט">
    <h2>הגדרה ראשונית של החנות</h2>
    <p class="lead">המסך הזה מופיע פעם אחת בלבד. הפרטים שלך יירשמו כעובד הראשון, והסיסמה תהיה סיסמת המנהל לכל האזורים הנעולים.</p>
    <form class="form" data-form="setup">
      <div class="field"><label for="su-n">השם שלך</label><input id="su-n" name="name" required></div>
      <div class="two"><div class="field"><label for="su-u">מספר עובד</label><input id="su-u" name="num" inputmode="numeric" value="100" required></div>
      <div class="field"><label for="su-w">שכר לשעה (₪)</label><input id="su-w" name="wage" type="number" min="0" step="0.5" value="50" required></div></div>
      <div class="field"><label for="su-p">טלפון נייד</label><input id="su-p" class="ltr" style="text-align:right" name="phone" type="tel" inputmode="tel" placeholder="050-000-0000" required></div>
      <div class="two"><div class="field"><label for="su-k">סיסמת מנהל</label><input id="su-k" name="pin" type="password" inputmode="numeric" autocomplete="new-password" required></div>
      <div class="field"><label for="su-c">אימות סיסמה</label><input id="su-c" name="confirm" type="password" inputmode="numeric" autocomplete="new-password" required></div></div>
      <button class="btn primary block" ${busy ? 'disabled' : ''}>${busy ? 'שומר…' : 'יצירת החנות'}</button></form></div>`;
}

/* ---------- views ---------- */
function vClock() {
  const me = cur(), now = Date.now(), open = openShift(me.id);
  const counted = s => s.empId === me.id && (s.status === 'approved' || s.status === 'open');
  const tH = sum(S.shifts.filter(s => counted(s) && sameDay(s.start, now)).map(dur));
  const mH = sum(S.shifts.filter(s => counted(s) && monthKey(s.start) === monthKey(now)).map(dur));
  const ws = weekStart(now);
  const mine = S.shifts.filter(s => s.empId === me.id && s.start >= ws).sort((a, b) => b.start - a.start);
  const C = 2 * Math.PI * 46;
  return `
  <section class="hero">
    <div class="today">${fmtLong(now)}</div>
    <button class="dial ${open ? 'on' : ''}" data-action="clock" aria-label="${open ? 'יציאה מהמשמרת' : 'כניסה למשמרת'}">
      <svg class="ring" viewBox="0 0 100 100"><circle class="track" cx="50" cy="50" r="46"/><circle class="prog" cx="50" cy="50" r="46" stroke-dasharray="${C}" stroke-dashoffset="${C}" ${open ? `data-ring="${open.start}"` : ''}/></svg>
      <span class="dial-in">
        <span class="dial-label">${open ? 'במשמרת' : 'מחוץ למשמרת'}</span>
        <span class="dial-time" ${open ? `data-since="${open.start}"` : 'data-now'}>--:--</span>
        <span class="dial-cta">${open ? 'יציאה' : 'כניסה'}</span>
      </span>
    </button>
    <div class="since">${open ? `נכנסת ב-${fmtT(open.start)}${sameDay(open.start, now) ? '' : ' · ' + fmtD(open.start)}` : `עובד מס׳ ${esc(me.num)}`}</div>
  </section>
  ${open && now - open.start > 12 * H ? `<div class="banner bad">${ic('alert')}<span>המשמרת פתוחה יותר מ-12 שעות. נשלחה התראה למנהל המערכת.</span></div>` : ''}
  <div class="stats">
    <div class="stat"><span>שעות היום</span><b class="num">${fmtH(tH)}</b></div>
    ${DS.showPay ? `<div class="stat"><span>שכר היום</span><b class="num">${money(tH * me.wage)}</b></div>` : `<div class="stat"><span>משמרות השבוע</span><b class="num">${mine.filter(s => s.status !== 'rejected').length}</b></div>`}
    <div class="stat"><span>שעות החודש</span><b class="num">${fmtH(mH)}</b></div>
    ${DS.showPay ? `<div class="stat"><span>שכר החודש</span><b class="num">${money(mH * me.wage)}</b><small>לפי ${money(me.wage)} לשעה</small></div>` : `<div class="stat"><span>שכר</span><b class="num">•••</b><small>מוסתר בהגדרות התצוגה</small></div>`}
  </div>
  <button class="link-btn" data-action="req-hours">${ic('plus', 'sm')}שכחתי להחתים שעון – בקשת אישור שעות</button>
  <h3 class="sec">המשמרות שלי השבוע</h3>
  <div class="list">${mine.length ? mine.map(s => `
    <div class="row"><div class="row-main"><div class="row-title">${fmtD(s.start)}</div>
      <div class="row-sub num">${fmtT(s.start)} – ${s.end ? fmtT(s.end) : 'עכשיו'} · ${fmtH(dur(s))} ש׳
      ${s.status === 'pending' ? '<span class="pill pend">ממתין לאישור</span>' : s.status === 'rejected' ? '<span class="pill bad">נדחה</span>' : s.status === 'open' ? '<span class="pill ok">פתוח</span>' : ''}
      ${s.source === 'request' && s.status === 'approved' ? '<span class="pill acc">אושר ידנית</span>' : ''}</div></div>
      ${DS.showPay ? `<div class="num" style="font-weight:700">${s.status === 'rejected' ? '—' : money(dur(s) * me.wage)}</div>` : ''}</div>`).join('') : '<div class="row"><span class="muted">עוד לא נרשמו משמרות השבוע.</span></div>'}</div>`;
}

const img = id => (S.images && S.images[id] && S.images[id].data) || '';
const note = id => (S.notes && S.notes[id]) || null;
function sortItems(a) { const s = [...a]; if (DS.invSort === 'qty') s.sort((x, y) => x.qty - y.qty); else if (DS.invSort === 'low') s.sort((x, y) => (x.qty - x.min) - (y.qty - y.min)); else s.sort((x, y) => x.name.localeCompare(y.name, 'he')); return s; }
function vInv() {
  const segs = Object.entries(CATS).filter(([k]) => manager || k === 'drinks').map(([k, l]) => `<button class="seg ${invTab === k ? 'on' : ''}" data-action="inv-tab" data-tab="${k}">${l}${k !== 'drinks' && !manager ? ic('lock', 'sm') : ''}</button>`).join('');
  let body;
  if (invTab !== 'drinks' && !manager) body = locked(`מלאי ${CATS[invTab]} נעול`, 'צפייה ועדכון של המחלקה הזו דורשים סיסמת מנהל.');
  else {
    const items = S.inventory.filter(i => i.cat === invTab);
    const row = i => {
      const p = S.drinkUpdates.find(u => u.itemId === i.id && u.status === 'pending'), low = i.qty <= i.min; return `
      <div class="row">${img(i.id) ? `<button class="thumb" data-action="img-view" data-id="${i.id}" aria-label="תמונה של ${esc(i.name)}"><img src="${img(i.id)}" alt=""></button>` : ''}<div class="row-main"><div class="row-title">${esc(i.name)}</div><div class="row-sub">
        ${low && DS.lowHi ? '<span class="pill warn">מלאי נמוך</span>' : `<span>מינימום ${i.min}</span>`}
        ${manager && note(i.id) ? `<span class="pill acc">${ic('note', 'sm')}הערה</span>` : ''}
        ${p ? `<span class="pill pend">ממתין לאישור: ${p.to}</span>` : ''}</div></div>
        <div class="qty ${low && DS.lowHi ? 'low' : ''}">${i.qty}<small>יח׳</small></div>
        <button class="btn sm" data-action="inv-update" data-id="${i.id}">עדכון</button></div>`;
    };
    body = `<div class="list">${invTab === 'drinks' ? SUBS.map(s => { const g = sortItems(items.filter(i => i.sub === s)); return `<div class="group-h">${s} · ${g.length} פריטים</div>` + g.map(row).join(''); }).join('') : sortItems(items).map(row).join('') || '<div class="row muted">אין פריטים עדיין.</div>'}</div>`;
  }
  const low = S.inventory.filter(i => (manager || i.cat === 'drinks') && i.qty <= i.min).length;
  return `<h2 class="vt">מלאי</h2>
  ${manager ? `<div class="seg-wrap">${segs}</div>` : ''}
  ${invTab === 'drinks' ? `<p class="lead">${manager ? 'כמנהל, עדכון שלך נכנס לתוקף מיד.' : 'כל עובד יכול לעדכן כמות שתייה. העדכון נכנס לתוקף אחרי אישור מנהל.'}</p>` : ''}
  ${low && DS.lowHi ? `<div class="banner info">${ic('box')}<span>${low} פריטים מתחת לכמות המינימום.</span></div>` : ''}
  ${body}
  ${manager ? `<button class="btn" data-action="nav" data-view="admin">${ic('plus', 'sm')}הוספת פריט חדש למלאי</button>` : ''}`;
}

function vDeliv() {
  const t = dateKey(Date.now()), tm = dateKey(Date.now() + DAY), y = dateKey(Date.now() - DAY);
  const label = k => k === t ? 'היום' : k === tm ? 'מחר' : k === y ? 'אתמול' : fmtLong(new Date(k + 'T12:00'));
  const ds = S.deliveries;
  const order = [...new Set([t, ...ds.filter(d => d.date > t).map(d => d.date).sort(), ...ds.filter(d => d.date < t).map(d => d.date).sort().reverse()])];
  const row = d => `<div class="row ${d.arrived ? 'done' : ''}"><div class="row-main"><div class="row-title">${esc(d.name)}</div>
      <div class="row-sub">${esc(d.qty)}${d.supplier ? ' · ' + esc(d.supplier) : ''}</div>
      ${d.arrived ? `<div class="arrived">${ic('check', 'sm')}הגיע${manager ? ` · סומן ע״י <b>${esc(emp(d.arrivedBy).name)}</b> ב-${fmtT(d.arrivedAt)}` : ''}</div>` : ''}</div>
      ${!d.arrived && d.date <= t ? `<button class="btn sm primary" data-action="deliv-arrive" data-id="${d.id}">סמן שהגיע</button>` : !d.arrived ? '<span class="pill">צפוי</span>' : ''}</div>`;
  return `<h2 class="vt">אספקת סחורה</h2>
  <p class="lead">כשסחורה מגיעה לחנות, סמנו אותה כאן. המנהל רואה מי סימן ומתי.</p>
  ${manager ? `<button class="btn primary" data-action="new-deliv">${ic('plus', 'sm')}אספקה חדשה</button>` : ''}
  ${order.map(k => {
    const g = ds.filter(d => d.date === k); if (!g.length && k !== t) return ''; const open = g.filter(d => !d.arrived).length; return `
    <h3 class="sec">${label(k)}${k === t && g.length ? ` · ${open ? open + ' ממתינים' : 'הכול הגיע'}` : ''}</h3>
    <div class="list">${g.length ? g.map(row).join('') : '<div class="row muted">אין אספקה מתוכננת להיום.</div>'}</div>`;
  }).join('')}`;
}

function vAlerts() {
  if (!manager) return `<h2 class="vt">התראות</h2>` + locked('התראות מנהל', 'אישורי שעות, עדכוני מלאי וסיכומי שכר מוצגים כאן למנהל המערכת.');
  const { long, reqs, drinks, count } = alerts();
  const sums = S.notifications.filter(n => n.type === 'summary').sort((a, b) => b.key.localeCompare(a.key));
  const info = S.notifications.filter(n => n.type === 'info' || n.type === 'note').sort((a, b) => b.ts - a.ts).slice(0, 12);
  const L = long.map(s => `<div class="card edge-bad"><div class="card-head"><span class="pill bad">משמרת לא נסגרה</span><time>${ago(s.start + 12 * H)}</time></div>
      <p><b>${esc(emp(s.empId).name)}</b> פתח/ה משמרת ב-${fmtD(s.start)} בשעה ${fmtT(s.start)} ולא סגר/ה אותה. עברו <b class="num">${fmtH(dur(s))}</b> שעות.</p>
      <div class="actions"><button class="btn" data-action="allow" data-id="${s.id}">אפשר המשך עבודה</button><button class="btn primary" data-action="shorten" data-id="${s.id}">קצר ואשר שעות</button></div></div>`).join('');
  const R = reqs.map(s => `<div class="card edge-pend"><div class="card-head"><span class="pill pend">בקשת אישור שעות</span><time>${fmtD(s.start)}</time></div>
      <p><b>${esc(emp(s.empId).name)}</b> מבקש/ת לאשר <span class="num">${fmtT(s.start)}–${fmtT(s.end)}</span> (${fmtH(dur(s))} ש׳, ${money(dur(s) * emp(s.empId).wage)}).</p>
      ${s.note ? `<p class="muted">״${esc(s.note)}״</p>` : ''}
      <div class="actions"><button class="btn danger" data-action="reject-req" data-id="${s.id}">דחייה</button><button class="btn primary" data-action="approve-req" data-id="${s.id}">אישור</button></div></div>`).join('');
  const D = drinks.map(u => {
    const i = S.inventory.find(x => x.id === u.itemId) || { name: 'פריט שנמחק' }; return `<div class="card edge-acc"><div class="card-head"><span class="pill acc">עדכון מלאי שתייה</span><time>${ago(u.ts)}</time></div>
      <p><b>${esc(emp(u.empId).name)}</b> עדכן/ה את <b>${esc(i.name)}</b> מ-<span class="num">${u.from}</span> ל-<b class="num">${u.to}</b> יחידות.</p>
      <div class="actions"><button class="btn danger" data-action="reject-drink" data-id="${u.id}">דחייה</button><button class="btn primary" data-action="approve-drink" data-id="${u.id}">אישור</button></div></div>`;
  }).join('');
  const SUM = sums.map(n => `<div class="card"><div class="card-head"><span class="pill pend">סיכום שעות חודשי</span><time>${fmtD(n.ts)}</time></div>
      <div><div class="muted">${monthName(n.key)} · שעות מאושרות בלבד</div>
      <div class="summary-total"><b>${money(n.total)}</b><span class="muted num">סה״כ לתשלום · ${fmtH(n.hours)} שעות</span></div></div>
      <details><summary>פירוט לפי עובד</summary><div class="tbl-wrap"><table><thead><tr><th>מס׳</th><th>עובד</th><th>משמרות</th><th>שעות</th><th>לשעה</th><th class="l">לתשלום</th></tr></thead><tbody>
      ${n.rows.map(r => `<tr><td>${esc(r.num || '')}</td><td>${esc(r.name)}</td><td>${r.count}</td><td>${fmtH(r.hours)}</td><td>${money(r.wage)}</td><td class="l">${money(r.pay)}</td></tr>`).join('')}
      <tr class="tot"><td></td><td>סה״כ</td><td>${sum(n.rows.map(r => r.count))}</td><td>${fmtH(n.hours)}</td><td></td><td class="l">${money(n.total)}</td></tr></tbody></table></div></details></div>`).join('');
  return `<h2 class="vt">התראות</h2>
  <h3 class="sec">דורש טיפול · ${count}</h3>
  ${count ? L + R + D : '<div class="list"><div class="row muted">אין כרגע משהו שמחכה לאישור.</div></div>'}
  <h3 class="sec">סיכומי שכר · נוצרים אוטומטית מה-1 לחודש</h3>
  ${SUM || '<div class="list"><div class="row muted">עדיין לא הופק סיכום חודשי.</div></div>'}
  ${info.length ? `<h3 class="sec">עדכונים</h3><div class="list">${info.map(n => `<div class="row"><div class="row-main"><div>${n.type === 'note' ? `<span class="pill acc">${ic('note', 'sm')}הערה על פריט</span> ` : ''}${esc(n.text)}</div><div class="row-sub">${ago(n.ts)}</div></div>${n.type === 'note' && n.itemId && byId(S.inventory, n.itemId) ? `<button class="btn sm" data-action="inv-update" data-id="${n.itemId}">לפריט</button>` : ''}</div>`).join('')}</div>` : ''}`;
}

function vMore() {
  const it = (v, i, l, lockd) => `<button class="menu-item" data-action="nav" data-view="${v}">${ic(i)}<span class="grow">${l}</span>${lockd && !manager ? ic('lock', 'sm') : ''}${ic('chev', 'sm chev')}</button>`;
  return `<h2 class="vt">תפריט</h2>
  ${manager ? `<div class="list">${it('hours', 'chart', 'שעות עובדים ושכר', 1)}${it('tasks', 'task', 'משימות וציונים', 1)}${it('admin', 'cog', 'ניהול חנות', 1)}</div>` : ''}
  <div class="list">${it('display', 'eye', 'הגדרות תצוגה', 0)}
  ${manager ? `<button class="menu-item" data-action="lock">${ic('lock')}<span class="grow">יציאה ממצב מנהל</span></button>` : `<button class="menu-item" data-action="pin">${ic('unlock')}<span class="grow">כניסה למצב ניהול</span></button>`}
  <button class="menu-item" data-action="logout">${ic('out')}<span class="grow">התנתקות</span><span class="muted">${esc(cur().name)}</span></button></div>
  <p class="lead">${local() ? 'גרסת דמו: הנתונים נשמרים בטלפון הזה בלבד.' : 'הנתונים נשמרים בענן ומשותפים לכל הטלפונים של העובדים.'}</p>`;
}

function vHours() {
  if (!manager) return back() + `<h2 class="vt">שעות עובדים ושכר</h2>` + locked('שעות ושכר של כל העובדים');
  const now = Date.now(), ws = weekStart(now), mk = monthKey(now);
  const inRange = s => (s.status === 'approved' || s.status === 'open') && (hoursRange === 'week' ? s.start >= ws : monthKey(s.start) === mk);
  const rows = S.employees.map(e => { const sh = S.shifts.filter(s => s.empId === e.id && inRange(s)).sort((a, b) => a.start - b.start); const h = sum(sh.map(dur)); return { e, sh, h, pay: h * e.wage, open: openShift(e.id) }; });
  const days = [...Array(7)].map((_, i) => ws + i * DAY);
  return back() + `<h2 class="vt">שעות עובדים ושכר</h2>
  <div class="seg-wrap"><button class="seg ${hoursRange === 'week' ? 'on' : ''}" data-action="range" data-r="week">השבוע</button><button class="seg ${hoursRange === 'month' ? 'on' : ''}" data-action="range" data-r="month">${monthName(mk)}</button></div>
  <div class="stats"><div class="stat"><span>סה״כ שעות</span><b class="num">${fmtH(sum(rows.map(r => r.h)))}</b></div><div class="stat"><span>סה״כ שכר</span><b class="num">${money(sum(rows.map(r => r.pay)))}</b></div></div>
  <div class="list">${rows.map(r => `<div class="row"><div class="row-main"><div class="row-title">${esc(r.e.name)} <span class="muted num">#${esc(r.e.num)}</span> ${r.open ? '<span class="pill ok">במשמרת</span>' : ''}</div>
    <div class="row-sub num">${r.sh.length} משמרות · ${fmtH(r.h)} ש׳ · ${money(r.e.wage)} לשעה</div>
    ${hoursRange === 'week' ? `<div class="row-sub num">${days.map(d => { const x = sum(r.sh.filter(s => sameDay(s.start, d)).map(dur)); return `<span class="pill ${x ? 'acc' : ''}">${new Date(d).toLocaleDateString('he-IL', { weekday: 'narrow' })} ${x ? fmtH(x) : '–'}</span>`; }).join('')}</div>` : ''}</div>
    <div class="num" style="font-weight:700">${money(r.pay)}</div></div>`).join('')}</div>
  <p class="lead">כולל משמרות פתוחות עד לרגע זה. בקשות שעדיין ממתינות לאישור לא נספרות.</p>`;
}

function vTasks() {
  if (!manager) return back() + `<h2 class="vt">משימות וציונים</h2>` + locked('משימות וציונים');
  const opts = S.employees.map(e => `<option value="${e.id}">${esc(e.name)}</option>`).join('');
  return back() + `<h2 class="vt">משימות וציונים</h2>
  <h3 class="sec">משימות</h3>
  <div class="list">${S.tasks.map(t => `<div class="row ${t.done ? 'done' : ''}"><button class="check ${t.done ? 'on' : ''}" data-action="task-toggle" data-id="${t.id}" aria-label="סימון כבוצע">${t.done ? ic('check', 'sm') : ''}</button>
    <div class="row-main"><div class="row-title">${esc(t.title)}</div><div class="row-sub num">${esc(emp(t.empId).name)} · ${fmtH(t.hours)} ש׳</div></div>
    <button class="btn sm danger" data-action="task-del" data-id="${t.id}">מחיקה</button></div>`).join('') || '<div class="row muted">אין משימות.</div>'}</div>
  <form class="card form" data-form="task"><b>משימה חדשה</b>
    <div class="field"><label for="tk-t">מה צריך לעשות</label><input id="tk-t" name="title" required placeholder="למשל: סידור מדף החטיפים"></div>
    <div class="two"><div class="field"><label for="tk-e">עובד</label><select id="tk-e" name="emp">${opts}</select></div>
    <div class="field"><label for="tk-h">שעות משוערות</label><input id="tk-h" name="hours" type="number" step="0.25" min="0.25" value="1" required></div></div>
    <button class="btn primary">הוספת משימה</button></form>
  <h3 class="sec">ציוני עובדים</h3>
  <div class="list">${S.employees.map(e => {
    const g = S.grades[e.id] || 0, done = sum(S.tasks.filter(t => t.empId === e.id && t.done).map(t => t.hours)); return `<div class="row"><div class="row-main"><div class="row-title">${esc(e.name)}</div><div class="row-sub num">שעות משימות שהושלמו: ${fmtH(done)}</div></div>
    <div class="stars">${[1, 2, 3, 4, 5].map(v => `<button class="${v <= g ? 'on' : ''}" data-action="grade" data-emp="${e.id}" data-v="${v}" aria-label="ציון ${v}">★</button>`).join('')}</div></div>`;
  }).join('')}</div>`;
}

const delivForm = () => `<form class="form" data-form="deliv">
  <div class="field"><label for="dv-n">מה אמור להגיע</label><input id="dv-n" name="name" required placeholder="למשל: ארגזי קוקה קולה"></div>
  <div class="two"><div class="field"><label for="dv-q">כמות</label><input id="dv-q" name="qty" required placeholder="4 ארגזים"></div>
  <div class="field"><label for="dv-d">תאריך הגעה</label><input id="dv-d" name="date" type="date" value="${dateKey(Date.now())}" required></div></div>
  <div class="field"><label for="dv-s">ספק</label><input id="dv-s" name="supplier" placeholder="לא חובה"></div>
  <button class="btn primary">הוספה לאספקה</button></form>`;
const nextNum = () => String(Math.max(100, ...S.employees.map(e => parseInt(e.num) || 0)) + 1);
const empFields = (e, p) => `
  <div class="field"><label for="${p}-n">שם מלא</label><input id="${p}-n" name="name" required value="${esc(e.name || '')}"></div>
  <div class="two"><div class="field"><label for="${p}-u">מספר עובד</label><input id="${p}-u" name="num" inputmode="numeric" required value="${esc(e.num || nextNum())}"></div>
  <div class="field"><label for="${p}-w">שכר לשעה (₪)</label><input id="${p}-w" name="wage" type="number" min="0" step="0.5" value="${e.wage ?? 50}" required></div></div>
  <div class="field"><label for="${p}-p">טלפון נייד</label><input id="${p}-p" class="ltr" style="text-align:right" name="phone" type="tel" inputmode="tel" placeholder="050-000-0000" required value="${esc(e.phone ? fmtPhone(e.phone) : '')}"><small>העובד מתחבר עם מספר הטלפון ומספר העובד.</small></div>
  ${e.id && e.id === session() && e.admin
    ? `<p class="hint">יש לך הרשאת ניהול קבועה. מנהל אחר יכול להסיר אותה.</p>`
    : `<label class="check-row"><input type="checkbox" name="admin" ${e.admin ? 'checked' : ''}><span class="grow"><b>הרשאת ניהול קבועה</b><small>העובד נכנס תמיד במצב מנהל, בלי להקיש סיסמה. נכנס לתוקף בפתיחה הבאה של האפליקציה.</small></span></label>`}`;
function validateEmp(f, id) {
  const ph = normPhone(f.phone), num = String(f.num).trim();
  if (!f.name.trim()) return 'צריך למלא שם';
  if (!/^\d{1,6}$/.test(num)) return 'מספר עובד צריך להיות עד 6 ספרות';
  if (!/^05\d{8}$/.test(ph)) return 'מספר הטלפון צריך להיות נייד ישראלי בן 10 ספרות';
  if (S.employees.some(e => e.id !== id && normPhone(e.phone) === ph)) return 'מספר הטלפון כבר רשום לעובד אחר';
  if (S.employees.some(e => e.id !== id && String(e.num) === num)) return 'מספר העובד כבר תפוס';
  if (!(parseFloat(f.wage) >= 0)) return 'הזן שכר תקין';
  return null;
}

function vAdmin() {
  if (!manager) return back() + `<h2 class="vt">ניהול חנות</h2>` + locked('ניהול חנות', 'הוספת פריטים, עובדים ואספקה, שינוי שכר וסיסמת מנהל דורשים סיסמת מנהל.');
  return back() + `<h2 class="vt">ניהול חנות</h2>
  <h3 class="sec">עובדים · ${S.employees.length}</h3>
  <div class="list">${S.employees.map(e => `<div class="row"><span class="av lg">${esc((e.name || '?')[0])}</span><div class="row-main"><div class="row-title">${esc(e.name)}</div>
    <div class="row-sub num"><span>מס׳ ${esc(e.num)}</span><span class="ltr">${fmtPhone(e.phone)}</span><span>${money(e.wage)} לשעה</span>${e.admin ? '<span class="pill acc">מנהל קבוע</span>' : ''}</div></div>
    <button class="btn sm" data-action="emp-edit" data-id="${e.id}">עריכה</button></div>`).join('')}</div>
  <form class="card form" data-form="emp"><b>הוספת עובד</b>${empFields({}, 'em')}<button class="btn primary">הוספת עובד</button></form>
  <form class="card form" data-form="item"><b>הוספת פריט למלאי</b>
    <div class="field"><label for="it-c">מחלקה</label><select id="it-c" name="cat">${SUBS.map(s => `<option value="drinks|${s}">שתייה › ${s}</option>`).join('')}<option value="snacks|">חטיפים</option><option value="salads|">סלטים</option></select></div>
    <div class="field"><label for="it-n">שם הפריט</label><input id="it-n" name="name" required placeholder="למשל: פריגת ענבים"></div>
    <div class="two"><div class="field"><label for="it-q">כמות במלאי</label><input id="it-q" name="qty" type="number" min="0" value="0" required></div>
    <div class="field"><label for="it-m">התראה מתחת ל-</label><input id="it-m" name="min" type="number" min="0" value="5" required></div></div>
    <button class="btn primary">הוספה למלאי</button></form>
  <div class="card"><b>אספקה חדשה</b>${delivForm()}</div>
  <form class="card form" data-form="pin-change"><b>שינוי סיסמת מנהל</b>
    <p class="muted" style="font-size:.875rem">הסיסמה החדשה תחול על כל האזורים הנעולים ובכל הטלפונים. 4 עד 6 ספרות.</p>
    <div class="field"><label for="pc-o">סיסמה נוכחית</label><input id="pc-o" name="old" type="password" inputmode="numeric" autocomplete="current-password" required></div>
    <div class="two"><div class="field"><label for="pc-n">סיסמה חדשה</label><input id="pc-n" name="next" type="password" inputmode="numeric" autocomplete="new-password" required></div>
    <div class="field"><label for="pc-c">אימות סיסמה</label><input id="pc-c" name="confirm" type="password" inputmode="numeric" autocomplete="new-password" required></div></div>
    <button class="btn brass">שמירת סיסמה חדשה</button></form>
  ${local() ? `<h3 class="sec">כלים לגרסת הדמו</h3>
  <div class="actions"><button class="btn" data-action="regen">הפקת סיכום ${monthName(prevMonthKey())} מחדש</button><button class="btn danger" data-action="reset">איפוס נתוני הדמו</button></div>` : ''}`;
}

/* ---------- display settings view ---------- */
const segCtl = (k, opts) => `<div class="seg-wrap" role="radiogroup">${opts.map(([v, l, style]) => `<button class="seg ${String(DS[k]) === String(v) ? 'on' : ''}" role="radio" aria-checked="${String(DS[k]) === String(v)}" data-action="ds" data-k="${k}" data-v="${v}" ${style ? `style="${style}"` : ''}>${l}</button>`).join('')}</div>`;
const tog = (k, l, sub) => `<button class="set-row" role="switch" aria-checked="${!!DS[k]}" data-action="ds-tog" data-k="${k}"><span class="grow"><b>${l}</b>${sub ? `<small>${sub}</small>` : ''}</span><span class="sw ${DS[k] ? 'on' : ''}"></span></button>`;
const grp = (label, val, body) => `<div class="set-group"><div class="set-label"><b>${label}</b>${val ? `<span>${val}</span>` : ''}</div>${body}</div>`;
function vDisplay() {
  const t = ROOT.getAttribute('data-theme'), dark = t === 'dark' || (!t && mq.matches);
  return back() + `<h2 class="vt">הגדרות תצוגה</h2>
  <p class="lead">ההגדרות נשמרות בטלפון הזה בלבד, כך שכל עובד מסדר את התצוגה לפי הנוחות שלו.</p>
  <h3 class="sec">צבעים</h3>
  ${grp('מצב תצוגה', '', segCtl('theme', [['light', 'בהיר'], ['dark', 'כהה'], ['system', 'לפי המכשיר']]))}
  ${grp('צבע מבטא', ACC[DS.accent].n, `<div class="swatches">${Object.entries(ACC).map(([k, a]) => `<button class="sw-c ${DS.accent === k ? 'on' : ''}" style="--c:${a[dark ? 'd' : 'l'][0]}" data-action="ds" data-k="accent" data-v="${k}"><i></i>${a.n}</button>`).join('')}</div>`)}
  <div class="list">${tog('contrast', 'ניגודיות גבוהה', 'טקסט משני וקווי הפרדה כהים יותר, לקריאה בתאורה חזקה')}</div>
  <h3 class="sec">טקסט</h3>
  ${grp('גודל טקסט', `<span id="scale-val">${DS.scale}%</span>`, `<input type="range" id="ds-scale" min="80" max="140" step="5" value="${DS.scale}" data-ds-range="scale" aria-label="גודל טקסט"><div class="range-ends"><span>קטן</span><span>גדול</span></div>`)}
  ${grp('גופן', '', segCtl('font', [['Assistant', 'אסיסטנט', "font-family:'Assistant',sans-serif"], ['Heebo', 'היבו', "font-family:'Heebo',sans-serif"], ['Rubik', 'רוביק', "font-family:'Rubik',sans-serif"]]))}
  ${grp('גופן כותרות ומספרים', '', segCtl('heading', [['serif', 'קלאסי', "font-family:'Frank Ruhl Libre',serif"], ['same', 'כמו הטקסט']]))}
  <h3 class="sec">פריסה</h3>
  ${grp('מרווחים', '', segCtl('density', [['comfy', 'מרווח'], ['normal', 'רגיל'], ['compact', 'צפוף']]))}
  ${grp('פינות', '', segCtl('radius', [['sharp', 'חדות'], ['normal', 'רגילות'], ['round', 'מעוגלות']]))}
  ${grp('גודל השעון במסך הבית', '', segCtl('dial', [['small', 'קטן'], ['normal', 'רגיל'], ['large', 'גדול']]))}
  ${grp('מסך פתיחה אחרי התחברות', '', segCtl('home', [['clock', 'שעון'], ['inv', 'מלאי'], ['deliv', 'אספקה']]))}
  <h3 class="sec">שעה ותאריך</h3>
  ${grp('תבנית שעה', '', segCtl('clock12', [['false', '24 שעות'], ['true', '12 שעות']]))}
  ${grp('תבנית תאריך ברשימות', '', segCtl('dateStyle', [['short', 'קצרה · א׳, 18.10'], ['long', 'מלאה · יום ראשון']]))}
  <div class="list">${tog('seconds', 'הצגת שניות בשעון המשמרת')}</div>
  <h3 class="sec">תוכן</h3>
  <div class="list">${tog('showPay', 'הצגת שכר במסך הבית', 'כבו כדי שהסכומים לא ייראו על המסך ליד לקוחות')}${tog('lowHi', 'הדגשת מלאי נמוך', 'סימון בצבע לפריטים מתחת לכמות המינימום')}${tog('motion', 'אנימציות', 'מעברים ותנועה בממשק')}</div>
  ${grp('מיון פריטים במלאי', '', segCtl('invSort', [['name', 'לפי שם'], ['qty', 'לפי כמות'], ['low', 'הנמוכים קודם']]))}
  <button class="btn" data-action="ds-reset">החזרת הגדרות ברירת המחדל</button>`;
}

/* ---------- sheets, pin, toast ---------- */
function sheet(html) { document.getElementById('layer').innerHTML = `<div class="sheet-wrap"><div class="backdrop" data-action="close"></div><div class="sheet" role="dialog" aria-modal="true">${html}</div></div>`; }
function closeSheet() { document.getElementById('layer').innerHTML = ''; pinNext = null; if (renderPending) render(); }
function toast(t) { let el = document.querySelector('.toast'); if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); } el.textContent = t; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => el.hidden = true, 3000); }
function openPin(next) { pinBuf = ''; sheet('<div class="pin" id="pin"></div>'); pinNext = next || null; drawPin(); }
function drawPin(err) {
  const p = document.getElementById('pin'); if (!p) return; const L = store.pinLength();
  p.innerHTML = `<h3>סיסמת מנהל</h3><p class="muted">הזן קוד בן ${L} ספרות</p>
  <div class="dots ${err ? 'shake' : ''}">${[...Array(L)].map((_, i) => `<i class="${i < pinBuf.length ? 'f' : ''}"></i>`).join('')}</div>
  <div class="pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(k => `<button data-action="key" data-k="${k}">${k}</button>`).join('')}<span></span><button data-action="key" data-k="0">0</button><button data-action="key" data-k="del" aria-label="מחיקה">⌫</button></div>
  <p class="hint">${pinBusy ? 'בודק…' : err ? 'הקוד שגוי, נסה שוב' : local() && store.S.settings.pin === '0000' ? 'בגרסת הדמו הקוד הוא 0000' : '&nbsp;'}</p>`;
}
async function pinKey(k) {
  if (pinBusy) return;
  const L = store.pinLength();
  if (k === 'del') pinBuf = pinBuf.slice(0, -1); else if (pinBuf.length < L) pinBuf += k;
  drawPin();
  if (pinBuf.length === L) {
    pinBusy = true; drawPin();
    const ok = await store.enterManager(pinBuf);
    pinBusy = false;
    if (ok) { const n = pinNext; pinNext = null; closeSheet(); toast('מצב מנהל פעיל'); render(); if (n) n(); }
    else { pinBuf = ''; drawPin(true); }
  }
}
const needMgr = fn => store.isManager() ? fn() : store.isPermAdmin?.() ? store.enterManager().then(ok => { render(); if (ok) fn(); }) : openPin(fn);

/* ---------- actions ---------- */
const byId = (arr, id) => arr.find(x => x.id === id);
const ACT = {
  nav: d => { view = d.view === 'login' ? 'clock' : d.view; render(); window.scrollTo(0, 0); },
  pin: async () => { if (store.isPermAdmin?.() && await store.enterManager()) { toast('מצב מנהל פעיל'); render(); } else openPin(); },
  key: d => pinKey(d.k),
  lock: async () => { await store.exitManager(); toast('יצאת ממצב מנהל'); render(); },
  close: closeSheet,
  'fill-login': d => { const p = document.getElementById('lg-p'), n = document.getElementById('lg-n'); if (p) p.value = fmtPhone(d.p); if (n) n.value = d.n; },
  account: () => {
    const e = cur(); sheet(`<div style="display:flex;gap:12px;align-items:center;margin-bottom:14px"><span class="av lg">${esc((e.name || '?')[0])}</span><div><h3>${esc(e.name)}</h3><div class="muted num">עובד מס׳ ${esc(e.num)} · <span class="ltr">${fmtPhone(e.phone)}</span></div></div></div>
    <div class="list"><button class="menu-item" data-action="nav-close" data-view="display">${ic('eye')}<span class="grow">הגדרות תצוגה</span>${ic('chev', 'sm chev')}</button><button class="menu-item" data-action="logout">${ic('out')}<span class="grow">התנתקות</span></button></div>`);
  },
  'nav-close': d => { closeSheet(); view = d.view; render(); window.scrollTo(0, 0); },
  logout: async () => { closeSheet(); await store.logout(); view = 'clock'; render(); toast('התנתקת'); },
  clock: () => {
    const me = cur(), o = openShift(me.id);
    if (o) { o.end = Date.now(); o.status = 'approved'; delete o.allowUntil; toast(`יצאת מהמשמרת · ${fmtH(dur(o))} ש׳${DS.showPay ? ' · ' + money(dur(o) * me.wage) : ''}`); }
    else { S.shifts.push({ id: uid(), empId: me.id, start: Date.now(), end: null, status: 'open', source: 'clock' }); toast('נכנסת למשמרת. עבודה נעימה'); }
    save(); render();
  },
  'req-hours': () => sheet(`<h3>בקשת אישור שעות</h3><p class="muted" style="margin-bottom:14px">לשעות שלא הוחתמו בשעון. הבקשה תישלח למנהל המערכת.</p>
    <form class="form" data-form="req"><div class="field"><label for="rq-d">תאריך</label><input id="rq-d" name="date" type="date" max="${dateKey(Date.now())}" value="${dateKey(Date.now())}" required></div>
    <div class="two"><div class="field"><label for="rq-f">משעה</label><input id="rq-f" name="from" type="time" value="08:00" required></div><div class="field"><label for="rq-t">עד שעה</label><input id="rq-t" name="to" type="time" value="16:00" required></div></div>
    <div class="field"><label for="rq-n">הסבר קצר</label><textarea id="rq-n" name="note" placeholder="למשל: הטלפון נגמר לי בסוללה"></textarea></div>
    <button class="btn primary block">שליחה לאישור</button></form>`),
  'inv-tab': d => { if (d.tab !== 'drinks' && !store.isManager()) { openPin(() => { invTab = d.tab; render(); }); return; } invTab = d.tab; render(); },
  'inv-update': d => {
    const i = byId(S.inventory, d.id); const p = S.drinkUpdates.find(u => u.itemId === i.id && u.status === 'pending');
    const n = note(i.id);
    sheet(`${img(i.id) ? `<img class="item-photo" src="${img(i.id)}" alt="">` : ''}<h3>${esc(i.name)}</h3><p class="muted" style="margin-bottom:14px">כמות נוכחית במלאי: ${i.qty}${p ? ` · ממתין לאישור: ${p.to}` : ''}</p>
    <form class="form" data-form="inv" data-id="${i.id}"><div class="stepper"><button type="button" data-action="step" data-d="-1" aria-label="פחות">−</button><input id="iq" name="qty" type="number" min="0" value="${p ? p.to : i.qty}" aria-label="כמות חדשה"><button type="button" data-action="step" data-d="1" aria-label="יותר">+</button></div>
    <button class="btn primary block">${manager ? 'שמירה' : 'שליחה לאישור מנהל'}</button></form>
    ${manager ? `<div class="mgr-box"><div class="mgr-h">${ic('lock', 'sm')}למנהל בלבד</div>
      <div class="actions"><label class="btn sm">${ic('camera', 'sm')}${img(i.id) ? 'החלפת תמונה' : 'הוספת תמונה'}<input type="file" accept="image/*" data-img-for="${i.id}" hidden></label>
      ${img(i.id) ? `<button class="btn sm" data-action="img-del" data-id="${i.id}">הסרת התמונה</button>` : ''}</div>
      <form class="form" data-form="note" data-id="${i.id}"><div class="field"><label for="nt">הערות על הפריט</label><textarea id="nt" name="text" placeholder="למשל: ספק, מחיר קנייה, מתי להזמין">${esc(n ? n.text : '')}</textarea>
      ${n ? `<small>עודכן ע״י ${esc(emp(n.by).name)} · ${ago(n.ts)}</small>` : '<small>העובדים לא רואים את ההערות.</small>'}</div>
      <button class="btn block">שמירת הערה</button></form>
      <button class="btn danger block" data-action="item-del" data-id="${i.id}">מחיקת הפריט</button></div>` : ''}`);
  },
  'img-view': d => { const i = byId(S.inventory, d.id); sheet(`<img class="item-photo lg" src="${img(d.id)}" alt=""><h3>${esc(i.name)}</h3><div class="actions" style="margin-top:12px"><button class="btn block" data-action="inv-update" data-id="${d.id}">עדכון כמות</button></div>`); },
  'img-del': d => needMgr(() => { delete S.images[d.id]; save(); render(); ACT['inv-update'](d); toast('התמונה הוסרה'); }),
  'item-del': d => { const i = byId(S.inventory, d.id); sheet(`<h3>למחוק את ${esc(i.name)}?</h3><p class="muted" style="margin-bottom:16px">הפריט יימחק מהמלאי יחד עם התמונה וההערות שלו.</p><div class="actions"><button class="btn" data-action="close">ביטול</button><button class="btn primary" data-action="item-del-yes" data-id="${i.id}">מחיקה</button></div>`); },
  'item-del-yes': d => needMgr(() => { const i = byId(S.inventory, d.id); S.inventory = S.inventory.filter(x => x.id !== d.id); delete S.images[d.id]; delete S.notes[d.id]; save(); closeSheet(); render(); toast(`${i.name} נמחק/ה מהמלאי`); }),
  step: d => { const el = document.getElementById('iq'); el.value = Math.max(0, (+el.value || 0) + +d.d); },
  'deliv-arrive': d => {
    const x = byId(S.deliveries, d.id); x.arrived = true; x.arrivedBy = session(); x.arrivedAt = Date.now();
    S.notifications.push({ id: uid(), type: 'info', ts: Date.now(), text: `${cur().name} סימן/ה שהגיעה אספקה: ${x.name}` });
    save(); render(); toast('סומן שהאספקה הגיעה');
  },
  'new-deliv': () => needMgr(() => sheet('<h3>אספקה חדשה</h3>' + delivForm())),
  allow: d => needMgr(() => { const s = byId(S.shifts, d.id); s.allowUntil = Date.now() + 12 * H; save(); render(); toast('המשמרת ממשיכה. תתקבל התראה נוספת בעוד 12 שעות'); }),
  shorten: d => needMgr(() => {
    const s = byId(S.shifts, d.id); const def = Math.min(Date.now(), s.start + 9 * H);
    sheet(`<h3>קיצור ואישור משמרת</h3><p class="muted" style="margin-bottom:14px">${esc(emp(s.empId).name)} · נכנס/ה ב-${fmtD(s.start)} ${fmtT(s.start)}</p>
    <form class="form" data-form="short" data-id="${s.id}"><div class="field"><label for="sh-e">שעת סיום מאושרת</label><input id="sh-e" name="end" type="datetime-local" value="${toLocalInput(def)}" required></div>
    <button class="btn primary block">סגירה ואישור השעות</button></form>`);
  }),
  'approve-req': d => needMgr(() => { byId(S.shifts, d.id).status = 'approved'; save(); render(); toast('השעות אושרו'); }),
  'reject-req': d => needMgr(() => { byId(S.shifts, d.id).status = 'rejected'; save(); render(); toast('הבקשה נדחתה'); }),
  'approve-drink': d => needMgr(() => { const u = byId(S.drinkUpdates, d.id), i = byId(S.inventory, u.itemId); if (i) i.qty = u.to; u.status = 'approved'; save(); render(); toast('המלאי עודכן'); }),
  'reject-drink': d => needMgr(() => { byId(S.drinkUpdates, d.id).status = 'rejected'; save(); render(); toast('העדכון נדחה'); }),
  range: d => { hoursRange = d.r; render(); },
  'task-toggle': d => { const t = byId(S.tasks, d.id); t.done = !t.done; save(); render(); },
  'task-del': d => { S.tasks = S.tasks.filter(t => t.id !== d.id); save(); render(); },
  grade: d => { S.grades[d.emp] = +d.v; save(); render(); },
  'emp-edit': d => needMgr(() => {
    const e = byId(S.employees, d.id); sheet(`<h3>עריכת עובד</h3><form class="form" data-form="emp-edit" data-id="${e.id}" style="margin-top:12px">${empFields(e, 'ee')}<button class="btn primary block">שמירה</button></form>
    ${e.id !== session() ? `<button class="btn danger block" style="margin-top:10px" data-action="emp-del" data-id="${e.id}">הסרת העובד</button>` : '<p class="hint" style="margin-top:10px">אי אפשר להסיר את המשתמש שמחובר כרגע.</p>'}`);
  }),
  'emp-del': d => { const e = byId(S.employees, d.id); sheet(`<h3>להסיר את ${esc(e.name)}?</h3><p class="muted" style="margin-bottom:16px">העובד לא יוכל להתחבר יותר. המשמרות שכבר נרשמו יישארו בסיכומי השכר.</p><div class="actions"><button class="btn" data-action="close">ביטול</button><button class="btn primary" data-action="emp-del-yes" data-id="${e.id}">הסרה</button></div>`); },
  'emp-del-yes': d => needMgr(() => { const e = byId(S.employees, d.id); S.employees = S.employees.filter(x => x.id !== d.id); save(); closeSheet(); render(); toast(`${e.name} הוסר/ה מרשימת העובדים`); }),
  regen: () => { buildSummary(S, prevMonthKey()); save(); view = 'alerts'; render(); toast('הסיכום החודשי הופק'); },
  reset: () => sheet(`<h3>לאפס את נתוני הדמו?</h3><p class="muted" style="margin-bottom:16px">כל השינויים יימחקו, כולל עובדים וסיסמת המנהל, והנתונים יחזרו לדוגמה ההתחלתית.</p><div class="actions"><button class="btn" data-action="close">ביטול</button><button class="btn primary" data-action="reset-yes">איפוס</button></div>`),
  'reset-yes': async () => { await store.resetDemo(); closeSheet(); view = 'clock'; invTab = 'drinks'; render(); toast('נתוני הדמו אופסו'); },
  ds: d => { let v = d.v; if (v === 'true') v = true; else if (v === 'false') v = false; DS[d.k] = v; saveDS(); applyDisplay(); render(); },
  'ds-tog': d => { DS[d.k] = !DS[d.k]; saveDS(); applyDisplay(); render(); },
  'ds-reset': () => { DS = { ...DS_DEFAULT }; saveDS(); applyDisplay(); render(); toast('ההגדרות הוחזרו לברירת המחדל'); }
};
const FORMS = {
  login: async f => {
    const p = normPhone(f.phone), n = String(f.num).trim();
    if (!/^05\d{8}$/.test(p)) return toast('הזינו מספר נייד בן 10 ספרות');
    if (!n) return toast('הזינו מספר עובד');
    busy = true; render();
    const r = await store.login(p, n);
    busy = false;
    if (r.error) { render(); document.getElementById('lg-p').value = fmtPhone(p); document.getElementById('lg-n').value = n; return toast(r.error); }
    view = DS.home || 'clock'; monthChecked = false; render(); toast('שלום ' + first(cur().name));
  },
  setup: async f => {
    const p = normPhone(f.phone), n = String(f.num).trim();
    if (!f.name.trim()) return toast('צריך למלא שם');
    if (!/^\d{1,6}$/.test(n)) return toast('מספר עובד צריך להיות עד 6 ספרות');
    if (!/^05\d{8}$/.test(p)) return toast('מספר הטלפון צריך להיות נייד ישראלי בן 10 ספרות');
    if (!/^\d{4,6}$/.test(f.pin)) return toast('סיסמת המנהל צריכה להיות 4 עד 6 ספרות');
    if (f.pin !== f.confirm) return toast('הסיסמה ואימות הסיסמה לא תואמים');
    busy = true; render();
    const r = await store.setup({ name: f.name.trim(), phone: p, num: n, wage: parseFloat(f.wage) || 50, pin: f.pin });
    busy = false;
    if (r.error) { render(); return toast(r.error); }
    view = 'admin'; render(); toast('החנות נוצרה. עכשיו אפשר להוסיף עובדים');
  },
  req: f => {
    const s = new Date(f.date + 'T' + f.from).getTime(), e = new Date(f.date + 'T' + f.to).getTime();
    if (!(e > s)) return toast('שעת הסיום חייבת להיות אחרי שעת ההתחלה');
    if (e > Date.now()) return toast('אי אפשר לבקש שעות עתידיות');
    S.shifts.push({ id: uid(), empId: session(), start: s, end: e, status: 'pending', source: 'request', note: f.note.trim() });
    save(); closeSheet(); render(); toast('הבקשה נשלחה למנהל');
  },
  note: (f, el) => {
    if (!manager) return openPin(); const i = byId(S.inventory, el.dataset.id), t = (f.text || '').trim(), old = note(i.id);
    if ((old ? old.text : '') === t) return closeSheet();
    if (t) {
      S.notes[i.id] = { text: t, by: session(), ts: Date.now() };
      S.notifications.push({ id: uid(), type: 'note', itemId: i.id, ts: Date.now(), text: `${cur().name} ${old ? 'עדכן/ה' : 'הוסיף/ה'} הערה על ${i.name}: ${t.length > 80 ? t.slice(0, 80) + '…' : t}` });
    } else delete S.notes[i.id];
    save(); closeSheet(); render(); toast(t ? 'ההערה נשמרה' : 'ההערה נמחקה');
  },
  inv: (f, el) => {
    const i = byId(S.inventory, el.dataset.id), q = Math.max(0, parseInt(f.qty) || 0);
    S.drinkUpdates.filter(u => u.itemId === i.id && u.status === 'pending').forEach(u => u.status = manager ? 'approved' : 'replaced');
    if (manager) { i.qty = q; toast('המלאי עודכן'); }
    else { S.drinkUpdates.push({ id: uid(), itemId: i.id, empId: session(), from: i.qty, to: q, ts: Date.now(), status: 'pending' }); toast('העדכון נשלח לאישור מנהל'); }
    save(); closeSheet(); render();
  },
  short: (f, el) => {
    const s = byId(S.shifts, el.dataset.id), e = new Date(f.end).getTime();
    if (!(e > s.start)) return toast('שעת הסיום חייבת להיות אחרי הכניסה');
    if (e > Date.now()) return toast('שעת הסיום לא יכולה להיות בעתיד');
    s.end = e; s.status = 'approved'; delete s.allowUntil; save(); closeSheet(); render(); toast(`אושרו ${fmtH(dur(s))} שעות`);
  },
  deliv: f => { S.deliveries.push({ id: uid(), date: f.date, name: f.name.trim(), qty: f.qty.trim(), supplier: f.supplier.trim(), arrived: false }); save(); closeSheet(); render(); toast('האספקה נוספה'); },
  item: f => { const [cat, sub] = f.cat.split('|'); S.inventory.push({ id: uid(), cat, sub: sub || null, name: f.name.trim(), qty: +f.qty || 0, min: +f.min || 0 }); save(); render(); toast('הפריט נוסף למלאי'); },
  emp: f => {
    if (!manager) return openPin(); const err = validateEmp(f, null); if (err) return toast(err);
    S.employees.push({ id: uid(), num: String(f.num).trim(), name: f.name.trim(), phone: normPhone(f.phone), wage: parseFloat(f.wage), ...(f.admin ? { admin: true } : {}) });
    save(); render(); toast(`${f.name.trim()} נוסף/ה. התחברות: ${fmtPhone(f.phone)} + מספר עובד ${String(f.num).trim()}`);
  },
  'emp-edit': (f, el) => {
    if (!manager) return openPin(); const e = byId(S.employees, el.dataset.id), err = validateEmp(f, e.id); if (err) return toast(err);
    const keepAdmin = e.id === session() && e.admin;
    Object.assign(e, { name: f.name.trim(), num: String(f.num).trim(), phone: normPhone(f.phone), wage: parseFloat(f.wage) });
    if (f.admin || keepAdmin) e.admin = true; else delete e.admin;
    save(); closeSheet(); render(); toast('פרטי העובד נשמרו');
  },
  'pin-change': async f => {
    if (!manager) return openPin();
    if (!/^\d{4,6}$/.test(f.next)) return toast('הסיסמה החדשה צריכה להיות 4 עד 6 ספרות');
    if (f.next !== f.confirm) return toast('הסיסמה החדשה ואימות הסיסמה לא תואמים');
    const r = await store.changePin(f.old, f.next);
    if (r.error) return toast(r.error);
    render(); toast('סיסמת המנהל עודכנה');
  },
  task: f => { S.tasks.push({ id: uid(), title: f.title.trim(), empId: f.emp, hours: parseFloat(f.hours) || 1, done: false }); save(); render(); toast('המשימה נוספה'); }
};
document.addEventListener('click', e => { const b = e.target.closest('[data-action]'); if (!b) return; const a = ACT[b.dataset.action]; if (a) { e.preventDefault(); a(b.dataset, b); } });
document.addEventListener('submit', e => { const f = e.target.closest('form[data-form]'); if (!f) return; e.preventDefault(); if (busy) return; FORMS[f.dataset.form]?.(Object.fromEntries(new FormData(f)), f); });
document.addEventListener('input', e => { const r = e.target.closest('[data-ds-range]'); if (!r) return; DS[r.dataset.dsRange] = +r.value; applyDisplay(); const l = document.getElementById('scale-val'); if (l) l.textContent = r.value + '%'; });
document.addEventListener('change', e => { if (e.target.closest('[data-ds-range]')) saveDS(); });
// Item photos are shrunk on the phone before saving, so the shared database stays small and fast.
function shrinkImage(file, max = 360) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => {
      const k = Math.min(1, max / Math.max(im.width, im.height)), c = document.createElement('canvas');
      c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); let q = .78, d = c.toDataURL('image/jpeg', q);
      while (d.length > 120000 && q > .4) { q -= .1; d = c.toDataURL('image/jpeg', q); }
      res(d);
    };
    im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('bad image')); };
    im.src = url;
  });
}
document.addEventListener('change', async e => {
  const inp = e.target.closest('input[data-img-for]'); if (!inp || !inp.files || !inp.files[0]) return;
  if (!store.isManager()) return openPin();
  const id = inp.dataset.imgFor, i = byId(S.inventory, id); if (!i) return;
  try {
    const data = await shrinkImage(inp.files[0]);
    S.images[id] = { cat: i.cat, data }; save(); render(); ACT['inv-update']({ id }); toast('התמונה נשמרה');
  } catch (err) { toast('לא הצלחתי לקרוא את התמונה. נסו תמונה אחרת'); }
});
document.addEventListener('keydown', e => { if (!document.getElementById('pin')) return; if (/^\d$/.test(e.key)) pinKey(e.key); else if (e.key === 'Backspace') pinKey('del'); else if (e.key === 'Escape') closeSheet(); });

/* ---------- live clock ---------- */
function tick() {
  const now = Date.now();
  document.querySelectorAll('[data-since]').forEach(el => { const s = Math.floor((now - +el.dataset.since) / 1000), hm = pad(Math.floor(s / 3600)) + ':' + pad(Math.floor(s / 60) % 60); el.textContent = DS.seconds ? hm + ':' + pad(s % 60) : hm; });
  document.querySelectorAll('[data-now]').forEach(el => el.textContent = fmtT(now));
  document.querySelectorAll('[data-ring]').forEach(el => { const C = 2 * Math.PI * 46, f = Math.min((now - +el.dataset.ring) / (9 * H), 1); el.style.strokeDashoffset = C * (1 - f); });
}

/* ---------- boot ---------- */
(async () => {
  applyDisplay();
  store = await createStore();
  S = store.S;
  render();
  store.onChange(softRender);
  store.onError(msg => toast(msg));
  await store.ready;
  booting = false;
  if (session()) view = DS.home || 'clock';
  render();
  let lastCount = alerts().count;
  setInterval(() => { tick(); if (!session()) return; const c = alerts().count; if (c !== lastCount) { lastCount = c; renderNav(); } }, 1000);
})();
