import './style.css';
import { createStore } from './store.js';
import { H, DAY, uid, pad, sum, dur, sod, sameDay, monthKey, prevMonthKey, dateKey, weekStart, normPhone, fmtPhone, buildSummary, hasSummary } from './util.js';

const ROOT = document.documentElement; ROOT.lang = 'he'; ROOT.dir = 'rtl';
const LS_DISPLAY = 'dalpak-display';
const SUBS = ['שתייה', 'שתייה אמריקאי', 'בירות', 'שתייה גדולה'];
const CATS = { drinks: 'שתייה', snacks: 'חטיפים', salads: 'סלטים' };
let supId = null, orderId = null, repCfg = null;
let store, S, manager = false, view = 'clock', invTab = 'drinks', hoursRange = 'week', pinBuf = '', pinNext = null, pinBusy = false, pinFails = 0, toastT, booting = true, busy = false, monthChecked = false, renderPending = false;

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

let viewer = false;
const P = { clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', box: '<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5 12 12l9-4.5M12 12v9"/>', truck: '<path d="M2 6h11v10H2zM13 9h4.5l3.5 4v3h-8"/><circle cx="6" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>', bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>', menu: '<path d="M4 6h16M4 12h16M4 18h16"/>', lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>', unlock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.6-1.8"/>', check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>', plus: '<path d="M12 5v14M5 12h14"/>', chev: '<path d="m15 6-6 6 6 6"/>', chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>', task: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8 12 3 3 5-6"/>', cog: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>', user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>', alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.5"/>', eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>', out: '<path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10"/>', phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>' };
P.play = '<path d="M8 5v14l11-7z"/>';
P.x = '<path d="M6 6l12 12M18 6 6 18"/>';
P.camera = '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>';
P.users = '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>';
P.cart = '<path d="M3 4h2l2.2 10.5h10.6L20 7H6.2"/><circle cx="9" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/>';
P.cal = '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>';
P.copy = '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>';
P.down = '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>';
P.share = '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.3 10.8 15.7 7.2M8.3 13.2l7.4 3.6"/>';
P.crown = '<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/>';
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
const cur = () => session() === 'viewer' ? { id: 'viewer', name: 'בקרה', num: '', phone: '', wage: 0 } : emp(session());
const first = n => String(n).split(' ')[0];
const openShift = id => S.shifts.find(s => s.empId === id && s.status === 'open');
const ago = t => { const m = Math.round((Date.now() - t) / 6e4); if (m < 60) return `לפני ${Math.max(m, 0)} דק׳`; const h = Math.floor(m / 60); if (h < 24) return `לפני ${h} שע׳`; return fmtD(t); };
const save = () => store.save();
const local = () => store.mode === 'local';
const ePhoto = id => (S.empPhotos && S.empPhotos[id] && S.empPhotos[id].data) || '';
const avatar = (e, cls = '') => ePhoto(e.id) ? `<span class="av ${cls} ph"><img src="${ePhoto(e.id)}" alt=""></span>` : `<span class="av ${cls}">${esc((e.name || '?')[0])}</span>`;
const onShiftNow = () => (local() ? S.shifts : (S.openShifts || [])).filter(s => s.status === 'open');
const hasOwner = () => S.employees.some(e => e.owner);
const canSetFlags = () => !!(store.isOwner?.() || !hasOwner());
const VAT = 0.18;
// Deliveries and bonuses are added on top of the hourly pay.
const EXTRA = { delivery: 'משלוח', bonus: 'בונוס' };
const extrasOf = (id, a, b) => (S.extras || []).filter(x => x.empId === id && x.status === 'approved' && x.ts >= a && x.ts <= b);
const exSum = (l, k) => sum(l.filter(x => !k || x.kind === k).map(x => +x.amount || 0));
const withVat = p => p.vatIncl ? +p.price : +p.price * (1 + VAT);
const sellPrice = p => withVat(p) * 1.5;
const myTasks = () => S.tasks.filter(t => t.empId === session());
const newTasks = () => myTasks().filter(t => !t.seen && !t.done);
// Export helpers: copy, download as a spreadsheet file, share to WhatsApp.
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); toast('הועתק. אפשר להדביק בכל מקום'); return; } catch (e) { }
  const a = document.createElement('textarea'); a.value = t; a.style.position = 'fixed'; a.style.opacity = '0'; document.body.appendChild(a); a.select();
  try { document.execCommand('copy'); toast('הועתק. אפשר להדביק בכל מקום'); } catch (e) { toast('ההעתקה לא נתמכת במכשיר הזה'); } a.remove();
}
function downloadCsv(name, rows) {
  const q = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const csv = '\ufeff' + rows.map(r => r.map(q).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' }), url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name + '.csv'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast('הקובץ ירד. נפתח באקסל או בגוגל שיטס');
}
const waLink = (phone, text) => `https://wa.me/${phone ? '972' + normPhone(phone).replace(/^0/, '') : ''}?text=${encodeURIComponent(text)}`;

function checkMonthly() {
  if (monthChecked || !manager || viewer || !store.loaded('employees', 'shifts', 'notifications')) return;
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
  const pins = S.notifications.filter(n => n.kind === 'pin' && !n.seen);
  const ext = (S.extras || []).filter(x => x.status === 'pending');
  return { long, reqs, drinks, pins, ext, count: manager ? long.length + reqs.length + drinks.length + pins.length + ext.length : 0 };
}

/* ---------- shell ---------- */
const MORE_VIEWS = ['hours', 'tasks', 'admin', 'staff', 'display', 'suppliers', 'supplier', 'orders', 'report', 'avail'];
const MGR_VIEWS = ['hours', 'tasks', 'admin', 'staff', 'suppliers', 'supplier', 'orders', 'report'];
function renderNav() {
  const nav = document.getElementById('navbar'); nav.hidden = !session(); if (!session()) return;
  const n = (viewer ? 0 : alerts().count) + newTasks().length + newMentions().length + newActivity().length;
  // The bell is there for everyone: employees see their own tasks, managers also see approvals.
  const tabs = [['clock', 'שעון', 'clock'], ['inv', 'מלאי', 'box'], ['deliv', 'אספקה', 'truck'], ['reels', 'רילס', 'play'], ['more', 'עוד', 'menu']];
  document.getElementById('nav').innerHTML = tabs.map(([v, l, i]) => `<button class="tab ${view === v || (v === 'more' && MORE_VIEWS.includes(view)) ? 'on' : ''}" data-action="nav" data-view="${v}">${ic(i)}${l}</button>`).join('');
  const hb = document.getElementById('hbadge'); if (hb) { hb.textContent = n; hb.hidden = !n; }
  const bb = document.getElementById('hbell'); if (bb) bb.classList.toggle('on', view === 'alerts');
}
function render() {
  renderPending = false;
  if (!store) return;
  S = store.S; viewer = !!store.isViewer?.(); manager = store.isManager() || viewer;
  document.body.classList.toggle('is-viewer', viewer);
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
  const bell = `<button class="hbell ${view === 'alerts' ? 'on' : ''}" id="hbell" data-action="nav" data-view="alerts" aria-label="התראות">${ic('bell')}<span class="badge" id="hbadge" hidden></span></button>`;
  hdr.innerHTML = brand.replace(/<\/div>$/, bell + '</div>') + `
    <div class="top-actions">
      ${viewer ? `<span class="chip">${ic('eye', 'sm')}<span class="cl">צפייה בלבד</span></span>` : manager ? `<button class="chip mgr" data-action="lock" aria-label="מצב מנהל פעיל. לחיצה נועלת">${ic('unlock', 'sm')}<span class="cl">נעל</span></button>` : `<button class="chip" data-action="pin" aria-label="מנהל">${ic('lock', 'sm')}<span class="cl">מנהל</span></button>`}
      <button class="chip" data-action="account" aria-label="${esc(me.name)}">${avatar(me)}<span class="cl">${esc(first(me.name))}</span></button>
    </div>`;
  if (!manager) { if (MGR_VIEWS.includes(view)) view = 'clock'; if (invTab === 'snacks') invTab = 'drinks'; }
  const V = { clock: vClock, inv: vInv, deliv: vDeliv, alerts: vAlerts, more: vMore, hours: vHours, tasks: vTasks, admin: vAdmin, staff: vStaff, display: vDisplay, suppliers: vSuppliers, supplier: vSupplier, orders: vOrders, report: vReport, avail: vAvail, reels: vReels };
  main.innerHTML = `<div class="view ${view === 'reels' ? 'view-reels' : ''}">${(V[view] || vClock)()}</div>`;
  renderNav(); tick(); watchReels(); cleanReels();
}
// Data from other phones arrives at any moment; wait while someone is typing or a sheet is open.
function softRender() {
  const a = document.activeElement;
  const typing = a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
  if (document.querySelector('form[data-form=comment]')) refreshComments();
  if (typing || document.querySelector('.sheet')) { renderPending = true; renderNav(); return; }
  if (view === 'reels') return patchReels();
  render();
}
document.addEventListener('focusout', () => setTimeout(() => { if (renderPending && !document.querySelector('.sheet')) { const a = document.activeElement; if (!a || !/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) render(); } }, 50));

const locked = (t, s) => `<div class="lock"><div class="lk">${ic('lock')}</div><h4>${t}</h4><p class="muted">${s || 'האזור הזה פתוח למנהל המערכת בלבד.'}</p><button class="btn brass" data-action="pin">הזנת סיסמת מנהל</button></div>`;
const back = (to, label) => `<button class="link-btn" data-action="back" data-view="${to || (session() ? 'more' : 'login')}">${ic('chev', 'sm')}<span>${label || (session() ? 'חזרה לתפריט' : 'חזרה להתחברות')}</span></button>`;

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
  if (viewer) { const crew = onShiftNow().map(s => emp(s.empId)).filter(e => e.id);
    return `<div class="card"><b>${ic('eye', 'sm')} מצב בקרה · צפייה בלבד</b><p class="muted" style="margin:6px 0 0">אפשר לראות את כל הנתונים במערכת: מלאי, אספקה, רילס, התראות, שעות ושכר, ספקים והזמנות. אי אפשר לשנות נתונים או להוציא דוחות.</p></div>
    <h3 class="sec">במשמרת עכשיו · ${crew.length}</h3><div class="crew"><div class="crew-row">${crew.map(e => `<span class="crew-p">${avatar(e, 'md')}<small>${esc(first(e.name))}</small></span>`).join('') || '<span class="muted">אף אחד לא במשמרת כרגע</span>'}</div></div>
    <div class="list">${[['hours', 'chart', 'שעות עובדים ושכר'], ['orders', 'cart', 'הזמנות מספקים'], ['suppliers', 'users', 'ספקים ומחירים'], ['tasks', 'task', 'משימות'], ['avail', 'cal', 'אילוצים של עובדים']].map(([v, i, l]) => `<button class="menu-item" data-action="nav" data-view="${v}">${ic(i)}<span class="grow">${l}</span>${ic('chev', 'sm chev')}</button>`).join('')}</div>`; }
  const me = cur(), now = Date.now(), open = openShift(me.id);
  const counted = s => s.empId === me.id && (s.status === 'approved' || s.status === 'open');
  const tH = sum(S.shifts.filter(s => counted(s) && sameDay(s.start, now)).map(dur));
  const mH = sum(S.shifts.filter(s => counted(s) && monthKey(s.start) === monthKey(now)).map(dur));
  const ws = weekStart(now);
  const mine = S.shifts.filter(s => s.empId === me.id && s.start >= ws).sort((a, b) => b.start - a.start);
  const C = 2 * Math.PI * 46, ms0 = new Date(new Date(now).getFullYear(), new Date(now).getMonth(), 1).getTime();
  const xT = exSum(extrasOf(me.id, sod(now), now + DAY)), xM = exSum(extrasOf(me.id, ms0, now + DAY));
  const myEx = (S.extras || []).filter(x => x.empId === me.id && x.ts >= ms0).sort((a, b) => b.ts - a.ts);
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
  <div class="extra-box"><button class="btn block" data-action="extra-new">${ic('truck', 'sm')}עשיתי משלוח</button>
  ${myEx.length ? `<div class="list">${myEx.map(x => `<div class="row"><div class="row-main"><div class="row-title">${EXTRA[x.kind] || 'משלוח'} · ${fmtD(x.ts)} ${fmtT(x.ts)}</div>${x.note ? `<div class="row-sub">${esc(x.note)}</div>` : ''}</div>
    ${x.status === 'pending' ? '<span class="pill pend">ממתין לאישור</span>' : x.status === 'rejected' ? '<span class="pill bad">נדחה</span>' : DS.showPay ? `<b class="num">${money(+x.amount || 0)}</b>` : '<span class="pill ok">אושר</span>'}</div>`).join('')}</div>` : ''}</div>
  ${(() => { const crew = onShiftNow().map(s => ({ e: emp(s.empId), s, me: s.empId === me.id })).filter(x => x.e.id).sort((x, y) => y.me - x.me);
    return crew.length ? `<div class="crew"><span class="crew-l">${open ? (crew.length > 1 ? 'במשמרת איתך עכשיו' : 'במשמרת עכשיו') : 'במשמרת עכשיו'}</span><div class="crew-row">${crew.map(x => `<span class="crew-p ${x.me ? 'me' : ''}" title="${esc(x.e.name)} · מ-${fmtT(x.s.start)}">${avatar(x.e, 'md')}<small>${x.me ? 'אני' : esc(first(x.e.name))}</small></span>`).join('')}</div></div>` : ''; })()}
  ${open && now - open.start > 12 * H ? `<div class="banner bad">${ic('alert')}<span>המשמרת פתוחה יותר מ-12 שעות. נשלחה התראה למנהל המערכת.</span></div>` : ''}
  <div class="stats">
    <div class="stat"><span>שעות היום</span><b class="num">${fmtH(tH)}</b></div>
    ${DS.showPay ? `<div class="stat"><span>שכר היום</span><b class="num">${money(tH * me.wage + xT)}</b>${xT ? `<small>כולל ${money(xT)} משלוחים ובונוסים</small>` : ''}</div>` : `<div class="stat"><span>משמרות השבוע</span><b class="num">${mine.filter(s => s.status !== 'rejected').length}</b></div>`}
    <div class="stat"><span>שעות החודש</span><b class="num">${fmtH(mH)}</b></div>
    ${DS.showPay ? `<div class="stat"><span>שכר החודש</span><b class="num">${money(mH * me.wage + xM)}</b><small>${xM ? `כולל ${money(xM)} משלוחים ובונוסים` : `לפי ${money(me.wage)} לשעה`}</small></div>` : `<div class="stat"><span>שכר</span><b class="num">•••</b><small>מוסתר בהגדרות התצוגה</small></div>`}
  </div>
  <div class="link-row"><button class="link-btn" data-action="req-hours">${ic('plus', 'sm')}שכחתי להחתים שעון – בקשת אישור שעות</button>
  <button class="link-btn" data-action="nav" data-view="avail">${ic('cal', 'sm')}ימים שאני לא יכול לעבוד</button></div>
  <h3 class="sec">המשמרות שלי השבוע</h3>
  <div class="list">${mine.length ? mine.map(s => `
    <div class="row"><div class="row-main"><div class="row-title">${fmtD(s.start)}</div>
      <div class="row-sub num">${fmtT(s.start)} – ${s.end ? fmtT(s.end) : 'עכשיו'} · ${fmtH(dur(s))} ש׳
      ${s.status === 'pending' ? '<span class="pill pend">ממתין לאישור</span>' : s.status === 'rejected' ? '<span class="pill bad">נדחה</span>' : s.status === 'open' ? '<span class="pill ok">פתוח</span>' : ''}
      ${s.source === 'request' && s.status === 'approved' ? '<span class="pill acc">אושר ידנית</span>' : ''}</div></div>
      ${DS.showPay ? `<div class="num" style="font-weight:700">${s.status === 'rejected' ? '—' : money(dur(s) * me.wage)}</div>` : ''}</div>`).join('') : '<div class="row"><span class="muted">עוד לא נרשמו משמרות השבוע.</span></div>'}</div>`;
}

const img = id => (S.images && S.images[id] && (S.images[id].data || S.images[id].url)) || '';
const isLow = i => i.min > 0 && i.qty <= i.min;
const note = id => (S.notes && S.notes[id]) || null;
function sortItems(a) { const s = [...a]; if (DS.invSort === 'qty') s.sort((x, y) => x.qty - y.qty); else if (DS.invSort === 'low') s.sort((x, y) => (x.qty - x.min) - (y.qty - y.min)); else s.sort((x, y) => x.name.localeCompare(y.name, 'he')); return s; }
function vInv() {
  const segs = Object.entries(CATS).filter(([k]) => manager || k !== 'snacks').map(([k, l]) => `<button class="seg ${invTab === k ? 'on' : ''}" data-action="inv-tab" data-tab="${k}">${l}</button>`).join('');
  const ro = !manager && invTab !== 'drinks';
  let body;
  {
    const items = S.inventory.filter(i => i.cat === invTab);
    const row = i => {
      const p = S.drinkUpdates.find(u => u.itemId === i.id && u.status === 'pending'), low = isLow(i); return `
      <div class="row ${ro && !img(i.id) ? '' : 'tap'}" data-action="${ro ? 'img-view' : 'inv-update'}" data-id="${i.id}">${img(i.id) ? `<button class="thumb" data-action="img-view" data-id="${i.id}" aria-label="תמונה של ${esc(i.name)}"><img src="${img(i.id)}" alt=""></button>` : ''}<div class="row-main"><div class="row-title">${esc(i.name)}</div><div class="row-sub">
        ${low && DS.lowHi ? '<span class="pill warn">מלאי נמוך</span>' : i.min > 0 ? `<span>מינימום ${i.min}</span>` : ''}
        ${manager && note(i.id) ? `<span class="pill acc">${ic('note', 'sm')}הערה</span>` : ''}
        ${p ? `<span class="pill pend">ממתין לאישור: ${p.to}</span>` : ''}</div></div>
        <div class="qty ${low && DS.lowHi ? 'low' : ''}">${i.qty}<small>יח׳</small></div>
        ${ro ? '' : `<button class="btn sm" data-action="inv-update" data-id="${i.id}">עדכון</button>`}</div>`;
    };
    body = `<div class="list">${invTab === 'drinks' ? SUBS.map(s => { const g = sortItems(items.filter(i => i.sub === s)); return `<div class="group-h">${s} · ${g.length} פריטים</div>` + g.map(row).join(''); }).join('') : sortItems(items).map(row).join('') || '<div class="row muted">אין פריטים עדיין.</div>'}</div>`;
  }
  const low = S.inventory.filter(i => (manager || i.cat === 'drinks') && isLow(i)).length;
  return `<h2 class="vt">מלאי</h2>
  <div class="seg-wrap">${segs}</div>
  ${invTab === 'drinks' ? `<p class="lead">${manager ? 'כמנהל, עדכון שלך נכנס לתוקף מיד.' : 'כל עובד יכול לעדכן כמות שתייה. העדכון נכנס לתוקף אחרי אישור מנהל.'}</p>` : ro ? '<p class="lead">לצפייה בלבד. עדכון הכמויות במחלקה הזו נעשה על ידי מנהל.</p>' : ''}
  ${low && DS.lowHi ? `<div class="banner info">${ic('box')}<span>${low} פריטים מתחת לכמות המינימום.</span></div>` : ''}
  ${body}
  ${manager ? `<button class="btn" data-action="item-new" data-cat="${invTab}">${ic('plus', 'sm')}הוספת פריט חדש למלאי</button>` : ''}`;
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
  const mine = myTasks().sort((a, b) => (a.done - b.done) || ((b.ts || 0) - (a.ts || 0)));
  const fresh = new Set(newTasks().map(t => t.id));
  if (fresh.size) setTimeout(() => { myTasks().forEach(t => { if (fresh.has(t.id)) t.seen = true; }); save(); renderNav(); }, 1500);
  const TK = mine.length ? `<h3 class="sec">המשימות שלי · ${mine.filter(t => !t.done).length} פתוחות</h3><div class="list">${mine.map(t => `<div class="row ${t.done ? 'done' : ''}"><button class="check ${t.done ? 'on' : ''}" data-action="my-task" data-id="${t.id}" aria-label="סימון כבוצע">${t.done ? ic('check', 'sm') : ''}</button>
    <div class="row-main"><div class="row-title">${esc(t.title)} ${fresh.has(t.id) ? '<span class="pill acc">חדש</span>' : ''}</div><div class="row-sub num">${fmtH(t.hours)} ש׳ משוערות${t.ts ? ' · ' + ago(t.ts) : ''}</div></div></div>`).join('')}</div>` : '';
  const MS = myMentions().slice(0, 10), seenAt = mentionSeen();
  if (MS.length && MS[0].ts > seenAt) setTimeout(() => { try { localStorage.setItem(MENTION_SEEN, String(Date.now())); } catch (e) { } renderNav(); }, 1500);
  const MN = MS.length ? `<h3 class="sec">תייגו אותך ברילס</h3><div class="list">${MS.map(m => `<div class="row tap" data-action="reel-open" data-id="${m.reel}">${avatar(emp(m.by), 'md')}<div class="row-main"><div class="row-title">${esc(emp(m.by).name)} תייג/ה אותך ${m.kind === 'comment' ? 'בתגובה' : 'בפוסט'} ${m.ts > seenAt ? '<span class="pill acc">חדש</span>' : ''}</div><div class="row-sub">${esc(m.text.slice(0, 80))} · ${ago(m.ts)}</div></div>${ic('chev', 'sm chev')}</div>`).join('')}</div>` : '';
  const AC = myActivity(), fresh2 = new Set(newActivity().map(a => a.key));
  if (fresh2.size) setTimeout(() => { try { localStorage.setItem(ACT_SEEN, JSON.stringify(AC.map(a => a.key).slice(-500))); } catch (e) { } renderNav(); }, 1500);
  const AV = AC.length ? `<h3 class="sec">תגובות לפוסטים שלך</h3><div class="list">${AC.sort((a, b) => (fresh2.has(b.key) - fresh2.has(a.key)) || (b.ts - a.ts)).slice(0, 15).map(a => `<div class="row tap" data-action="reel-open" data-id="${a.reel}">${avatar(emp(a.by), 'md')}<div class="row-main"><div class="row-title">${esc(emp(a.by).name)} ${a.emoji ? `הגיב/ה ${a.emoji} לפוסט שלך` : 'הגיב/ה לפוסט שלך'} ${fresh2.has(a.key) ? '<span class="pill acc">חדש</span>' : ''}</div>${a.text ? `<div class="row-sub">${esc(a.text.slice(0, 80))} · ${ago(a.ts)}</div>` : ''}</div>${ic('chev', 'sm chev')}</div>`).join('')}</div>` : '';
  if (!manager) return `<h2 class="vt">התראות</h2>` + AV + MN + (TK || (MN || AV ? '' : '<div class="list"><div class="row muted">אין כרגע משימות או התראות בשבילך.</div></div>'));
  const { long, reqs, drinks, pins, ext, count } = alerts();
  const EX = ext.sort((a, b) => a.ts - b.ts).map(x => `<div class="card edge-acc"><div class="card-head"><span class="pill acc">${ic('truck', 'sm')}${x.kind === 'bonus' ? 'בקשת בונוס' : 'משלוח לאישור'}</span><time>${ago(x.ts)}</time></div>
      <p><b>${esc(emp(x.empId).name)}</b> סימן/ה ${x.kind === 'bonus' ? 'בונוס' : 'משלוח'} ב-${fmtD(x.ts)} בשעה ${fmtT(x.ts)}.</p>${x.note ? `<p class="muted">״${esc(x.note)}״</p>` : ''}
      <form class="form" data-form="extra-ok" data-id="${x.id}"><div class="seg-wrap">${Object.entries(EXTRA).map(([k, l]) => `<label class="seg ${(x.kind || 'delivery') === k ? 'on' : ''}"><input type="radio" name="kind" value="${k}" ${(x.kind || 'delivery') === k ? 'checked' : ''} hidden data-segpick>${l}</label>`).join('')}</div>
      <div class="field"><label for="xa-${x.id}">סכום (₪)</label><input id="xa-${x.id}" name="amount" type="number" min="0" step="0.5" inputmode="decimal" required></div>
      <div class="actions"><button type="button" class="btn danger" data-action="extra-reject" data-id="${x.id}">דחייה</button><button class="btn primary">אישור והוספה לשכר</button></div></form></div>`).join('');
  const sums = S.notifications.filter(n => n.type === 'summary').sort((a, b) => b.key.localeCompare(a.key));
  const info = S.notifications.filter(n => (n.type === 'info' && n.kind !== 'pin') || n.type === 'note').sort((a, b) => b.ts - a.ts).slice(0, 12);
  const L = long.map(s => `<div class="card edge-bad"><div class="card-head"><span class="pill bad">משמרת לא נסגרה</span><time>${ago(s.start + 12 * H)}</time></div>
      <p><b>${esc(emp(s.empId).name)}</b> פתח/ה משמרת ב-${fmtD(s.start)} בשעה ${fmtT(s.start)} ולא סגר/ה אותה. עברו <b class="num">${fmtH(dur(s))}</b> שעות.</p>
      <div class="actions"><button class="btn" data-action="allow" data-id="${s.id}">אפשר המשך עבודה</button><button class="btn primary" data-action="shorten" data-id="${s.id}">קצר ואשר שעות</button></div></div>`).join('');
  const PF = pins.sort((a, b) => b.ts - a.ts).map(n => `<div class="card edge-bad"><div class="card-head"><span class="pill bad">${ic('lock', 'sm')}ניסיונות כושלים לסיסמת מנהל</span><time>${ago(n.ts)}</time></div>
      <p><b>${esc(emp(n.empId).name)}</b> הקיש/ה סיסמת מנהל שגויה ${n.count || 3} פעמים ברצף, ב-${fmtD(n.ts)} בשעה ${fmtT(n.ts)}.</p>
      <div class="actions"><button class="btn" data-action="pin-seen" data-id="${n.id}">ראיתי</button></div></div>`).join('');
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
      <div class="summary-total"><b>${money(n.total)}</b><span class="muted num">סה״כ לתשלום · ${fmtH(n.hours)} שעות${n.deliv ? ` · משלוחים ${money(n.deliv)}` : ''}${n.bonus ? ` · בונוסים ${money(n.bonus)}` : ''}</span></div></div>
      <details><summary>פירוט לפי עובד</summary><div class="tbl-wrap"><table><thead><tr><th>מס׳</th><th>עובד</th><th>משמרות</th><th>שעות</th><th>שכר שעות</th><th>משלוחים</th><th>בונוסים</th><th class="l">לתשלום</th></tr></thead><tbody>
      ${n.rows.map(r => `<tr><td>${esc(r.num || '')}</td><td>${esc(r.name)}</td><td>${r.count}</td><td>${fmtH(r.hours)}</td><td>${money(r.pay)}</td><td>${money(r.deliv || 0)}</td><td>${money(r.bonus || 0)}</td><td class="l">${money(r.total ?? r.pay)}</td></tr>`).join('')}
      <tr class="tot"><td></td><td>סה״כ</td><td>${sum(n.rows.map(r => r.count))}</td><td>${fmtH(n.hours)}</td><td>${money(sum(n.rows.map(r => r.pay)))}</td><td>${money(n.deliv || 0)}</td><td>${money(n.bonus || 0)}</td><td class="l">${money(n.total)}</td></tr></tbody></table></div></details></div>`).join('');
  return `<h2 class="vt">התראות</h2>
  ${AV}${MN}${TK}
  <h3 class="sec">דורש טיפול · ${count}</h3>
  ${count ? PF + L + EX + R + D : '<div class="list"><div class="row muted">אין כרגע משהו שמחכה לאישור.</div></div>'}
  <h3 class="sec">סיכומי שכר · נוצרים אוטומטית מה-1 לחודש</h3>
  ${SUM || '<div class="list"><div class="row muted">עדיין לא הופק סיכום חודשי.</div></div>'}
  ${info.length ? `<h3 class="sec">עדכונים</h3><div class="list">${info.map(n => `<div class="row"><div class="row-main"><div>${n.type === 'note' ? `<span class="pill acc">${ic('note', 'sm')}הערה על פריט</span> ` : ''}${esc(n.text)}</div><div class="row-sub">${ago(n.ts)}</div></div>${n.type === 'note' && n.itemId && byId(S.inventory, n.itemId) ? `<button class="btn sm" data-action="inv-update" data-id="${n.itemId}">לפריט</button>` : ''}</div>`).join('')}</div>` : ''}`;
}

function vMore() {
  const it = (v, i, l, lockd) => `<button class="menu-item" data-action="nav" data-view="${v}">${ic(i)}<span class="grow">${l}</span>${lockd && !manager ? ic('lock', 'sm') : ''}${ic('chev', 'sm chev')}</button>`;
  return `<h2 class="vt">תפריט</h2>
  ${manager ? `<div class="list">${it('orders', 'cart', 'הזמנות מספקים', 1)}${it('hours', 'chart', 'שעות עובדים ושכר', 1)}${it('tasks', 'task', 'משימות וציונים', 1)}${it('admin', 'cog', 'ניהול חנות', 1)}</div>` : ''}
  <div class="list">${it('avail', 'cal', manager ? 'אילוצים של עובדים למשמרות' : 'ימים שאני לא יכול לעבוד', 0)}${it('display', 'eye', 'הגדרות תצוגה', 0)}
  ${viewer ? '' : manager ? `<button class="menu-item" data-action="lock">${ic('lock')}<span class="grow">יציאה ממצב מנהל</span></button>` : `<button class="menu-item" data-action="pin">${ic('unlock')}<span class="grow">כניסה למצב ניהול</span></button>`}
  <button class="menu-item" data-action="logout">${ic('out')}<span class="grow">התנתקות</span><span class="muted">${esc(cur().name)}</span></button></div>
  <p class="lead">${local() ? 'גרסת דמו: הנתונים נשמרים בטלפון הזה בלבד.' : 'הנתונים נשמרים בענן ומשותפים לכל הטלפונים של העובדים.'}</p>`;
}

function vHours() {
  if (!manager) return back() + `<h2 class="vt">שעות עובדים ושכר</h2>` + locked('שעות ושכר של כל העובדים');
  const now = Date.now(), ws = weekStart(now), mk = monthKey(now);
  const inRange = s => (s.status === 'approved' || s.status === 'open') && (hoursRange === 'week' ? s.start >= ws : monthKey(s.start) === mk);
  const exIn = x => x.status === 'approved' && (hoursRange === 'week' ? x.ts >= ws : monthKey(x.ts) === mk);
  const rows = S.employees.map(e => { const sh = S.shifts.filter(s => s.empId === e.id && inRange(s)).sort((a, b) => a.start - b.start); const h = sum(sh.map(dur)); const ex = (S.extras || []).filter(x => x.empId === e.id && exIn(x)); const dl = exSum(ex, 'delivery'), bn = exSum(ex, 'bonus'); return { e, sh, h, dl, bn, pay: h * e.wage + dl + bn, open: openShift(e.id) }; });
  const days = [...Array(7)].map((_, i) => ws + i * DAY);
  return back() + `<h2 class="vt">שעות עובדים ושכר</h2>
  <div class="seg-wrap"><button class="seg ${hoursRange === 'week' ? 'on' : ''}" data-action="range" data-r="week">השבוע</button><button class="seg ${hoursRange === 'month' ? 'on' : ''}" data-action="range" data-r="month">${monthName(mk)}</button></div>
  <div class="stats"><div class="stat"><span>סה״כ שעות</span><b class="num">${fmtH(sum(rows.map(r => r.h)))}</b></div><div class="stat"><span>סה״כ שכר</span><b class="num">${money(sum(rows.map(r => r.pay)))}</b></div></div>
  <div class="list">${rows.map(r => `<div class="row"><div class="row-main"><div class="row-title">${esc(r.e.name)} <span class="muted num">#${esc(r.e.num)}</span> ${r.open ? '<span class="pill ok">במשמרת</span>' : ''}</div>
    <div class="row-sub num">${r.sh.length} משמרות · ${fmtH(r.h)} ש׳ · ${money(r.e.wage)} לשעה${r.dl ? ` · משלוחים ${money(r.dl)}` : ''}${r.bn ? ` · בונוסים ${money(r.bn)}` : ''}</div>
    ${hoursRange === 'week' ? `<div class="row-sub num">${days.map(d => { const x = sum(r.sh.filter(s => sameDay(s.start, d)).map(dur)); return `<span class="pill ${x ? 'acc' : ''}">${new Date(d).toLocaleDateString('he-IL', { weekday: 'narrow' })} ${x ? fmtH(x) : '–'}</span>`; }).join('')}</div>` : ''}</div>
    <div class="num" style="font-weight:700">${money(r.pay)}</div></div>`).join('')}</div>
  <p class="lead">כולל משמרות פתוחות עד לרגע זה. בקשות שעדיין ממתינות לאישור לא נספרות.</p>
  <div class="actions"><button class="btn primary" data-action="report-new">${ic('chart', 'sm')}דוח שכר מפורט</button><button class="btn" data-action="extra-add">${ic('plus', 'sm')}הוספת משלוח או בונוס</button></div>`;
}

function vTasks() {
  if (!manager) return back() + `<h2 class="vt">משימות וציונים</h2>` + locked('משימות וציונים');
  const opts = S.employees.map(e => `<option value="${e.id}">${esc(e.name)}</option>`).join('');
  return back() + `<h2 class="vt">משימות וציונים</h2>
  <h3 class="sec">משימות</h3>
  <div class="list">${S.tasks.map(t => `<div class="row ${t.done ? 'done' : ''}"><button class="check ${t.done ? 'on' : ''}" data-action="task-toggle" data-id="${t.id}" aria-label="סימון כבוצע">${t.done ? ic('check', 'sm') : ''}</button>
    <div class="row-main"><div class="row-title">${esc(t.title)}</div><div class="row-sub num">${esc(emp(t.empId).name)} · ${fmtH(t.hours)} ש׳${t.done ? ' · בוצע' : t.seen ? ' · העובד ראה' : ' · טרם נצפתה'}</div></div>
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

const supForm = s => `<form class="form" data-form="sup" data-id="${s.id || ''}" style="margin-top:12px"><div class="field"><label for="sp-n">שם הספק</label><input id="sp-n" name="name" required value="${esc(s.name || '')}"></div>
  <div class="field"><label for="sp-p">טלפון (לשליחת הזמנות בוואטסאפ)</label><input id="sp-p" class="ltr" style="text-align:right" name="phone" type="tel" inputmode="tel" placeholder="050-000-0000" value="${esc(s.phone ? fmtPhone(s.phone) : '')}"></div>
  <div class="field"><label for="sp-o">הערות</label><input id="sp-o" name="note" placeholder="למשל: מגיע בימי ראשון" value="${esc(s.note || '')}"></div>
  <button class="btn primary block">שמירה</button></form>`;
const prodForm = p => `<form class="form" data-form="prod" data-id="${p.id || ''}" style="margin-top:12px"><div class="field"><label for="pr-n">שם המוצר</label><input id="pr-n" name="name" required list="inv-names" value="${esc(p.name || '')}"><datalist id="inv-names">${S.inventory.map(i => `<option value="${esc(i.name)}">`).join('')}</datalist></div>
  <div class="field"><label for="pr-p">מחיר מהספק (₪)</label><input id="pr-p" name="price" type="number" min="0" step="0.01" inputmode="decimal" required value="${p.price ?? ''}" data-calc></div>
  <div class="seg-wrap" role="radiogroup"><label class="seg ${!p.vatIncl ? 'on' : ''}"><input type="radio" name="vat" value="plus" ${!p.vatIncl ? 'checked' : ''} hidden data-calc>לפני מע״מ · להוסיף 18%</label><label class="seg ${p.vatIncl ? 'on' : ''}"><input type="radio" name="vat" value="incl" ${p.vatIncl ? 'checked' : ''} hidden data-calc>המחיר כבר כולל מע״מ</label></div>
  <div class="calc" id="pr-calc"></div>
  <button class="btn primary block">שמירה</button></form>`;
function drawCalc() {
  const f = document.querySelector('form[data-form=prod]'), out = document.getElementById('pr-calc'); if (!f || !out) return;
  const price = parseFloat(f.price.value) || 0, incl = f.querySelector('input[name=vat]:checked')?.value === 'incl', p = { price, vatIncl: incl };
  f.querySelectorAll('label.seg').forEach(l => l.classList.toggle('on', l.querySelector('input').checked));
  out.innerHTML = `<div><span>כולל מע״מ</span><b class="num">${money(withVat(p))}</b></div><div><span>מחיר מכירה (×1.5)</span><b class="num">${money(sellPrice(p))}</b></div>`;
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
  ${e.owner ? `<p class="hint">${ic('crown', 'sm')} בעל הבית: גישה מלאה לכל הנתונים. אי אפשר להסיר את ההרשאה.</p>`
    : !canSetFlags() ? (e.admin ? '<p class="hint">מנהל קבוע. רק בעל הבית יכול לשנות את ההרשאה.</p>' : '')
    : e.id && e.id === session() && e.admin
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

const catOpts = (cat, sub) => SUBS.map(s => `<option value="drinks|${s}" ${cat === 'drinks' && sub === s ? 'selected' : ''}>שתייה › ${s}</option>`).join('')
  + `<option value="snacks|" ${cat === 'snacks' ? 'selected' : ''}>חטיפים</option><option value="salads|" ${cat === 'salads' ? 'selected' : ''}>סלטים</option>`;
const itemForm = cat => `<form class="form" data-form="item" style="margin-top:12px">
    <div class="field"><label for="it-c">מחלקה</label><select id="it-c" name="cat">${catOpts(cat || 'drinks', cat && cat !== 'drinks' ? null : SUBS[0])}</select></div>
    <div class="field"><label for="it-n">שם הפריט</label><input id="it-n" name="name" required placeholder="למשל: פריגת ענבים"></div>
    <div class="two"><div class="field"><label for="it-q">כמות במלאי</label><input id="it-q" name="qty" type="number" min="0" value="0" required></div>
    <div class="field"><label for="it-m">התראה מתחת ל-</label><input id="it-m" name="min" type="number" min="0" value="5" required></div></div>
    <button class="btn primary block">הוספה למלאי</button></form>`;
const pinForm = () => `<form class="form" data-form="pin-change" style="margin-top:8px">
    <p class="muted" style="font-size:.875rem">הסיסמה החדשה תחול על כל האזורים הנעולים ובכל הטלפונים. 4 עד 6 ספרות.</p>
    <div class="field"><label for="pc-o">סיסמה נוכחית</label><input id="pc-o" name="old" type="password" inputmode="numeric" autocomplete="current-password" required></div>
    <div class="two"><div class="field"><label for="pc-n">סיסמה חדשה</label><input id="pc-n" name="next" type="password" inputmode="numeric" autocomplete="new-password" required></div>
    <div class="field"><label for="pc-c">אימות סיסמה</label><input id="pc-c" name="confirm" type="password" inputmode="numeric" autocomplete="new-password" required></div></div>
    <button class="btn brass block">שמירת סיסמה חדשה</button></form>`;
function vAdmin() {
  if (!manager) return back() + `<h2 class="vt">ניהול חנות</h2>` + locked('ניהול חנות', 'הוספת פריטים, עובדים ואספקה, שינוי שכר וסיסמת מנהל דורשים סיסמת מנהל.');
  const row = (act, i, l, sub, extra = '') => `<button class="menu-item" data-action="${act}" ${extra}>${ic(i)}<span class="grow">${l}${sub ? `<small class="mi-sub">${sub}</small>` : ''}</span>${ic('chev', 'sm chev')}</button>`;
  return back() + `<h2 class="vt">ניהול חנות</h2>
  <div class="list">
    ${row('nav', 'user', 'עובדים', `${S.employees.length} עובדים · הוספה, עריכה ושכר`, 'data-view="staff"')}
    ${row('nav', 'users', 'ספקים ומחירים', `${S.suppliers.length} ספקים · מוצרים, מחירים, מע״מ והזמנות`, 'data-view="suppliers"')}
    ${row('item-new', 'box', 'הוספת פריט למלאי', 'שתייה, חטיפים וסלטים')}
    ${row('item-bulk', 'note', 'הוספת פריטים מרשימה', 'מדביקים רשימה, כל שורה פריט')}
    ${row('new-deliv', 'truck', 'אספקה חדשה', 'פריטים שאמורים להגיע')}
    ${row('pin-sheet', 'lock', 'שינוי סיסמת מנהל', 'חלה על כל הטלפונים')}
  </div>
  ${local() ? `<h3 class="sec">כלים לגרסת הדמו</h3>
  <div class="actions"><button class="btn" data-action="regen">הפקת סיכום ${monthName(prevMonthKey())} מחדש</button><button class="btn danger" data-action="reset">איפוס נתוני הדמו</button></div>` : ''}`;
}
function vStaff() {
  if (!manager) return back('admin', 'חזרה לניהול חנות') + `<h2 class="vt">עובדים</h2>` + locked('עובדים');
  return back('admin', 'חזרה לניהול חנות') + `<h2 class="vt">עובדים · ${S.employees.length}</h2>
  ${!hasOwner() ? `<div class="card"><b>${ic('crown', 'sm')} בעל הבית</b><p class="muted" style="margin:6px 0 10px">בעל הבית הוא מנהל קבוע שאי אפשר להסיר, והוא היחיד שקובע מי מנהל קבוע. עדיין לא נקבע.</p><button class="btn brass" data-action="owner-claim">אני בעל הבית</button></div>` : ''}
  <div class="list">${S.employees.map(e => `<div class="row tap" data-action="emp-edit" data-id="${e.id}">${avatar(e, 'lg')}<div class="row-main"><div class="row-title">${esc(e.name)}</div>
    <div class="row-sub num"><span>מס׳ ${esc(e.num)}</span><span class="ltr">${fmtPhone(e.phone)}</span><span>${money(e.wage)} לשעה</span>${e.owner ? `<span class="pill pend">${ic('crown', 'sm')}בעל הבית</span>` : e.admin ? '<span class="pill acc">מנהל קבוע</span>' : ''}</div></div>
    <span class="btn sm">עריכה</span></div>`).join('')}</div>
  <button class="btn primary" data-action="emp-new">${ic('plus', 'sm')}הוספת עובד</button>
  ${viewer ? '' : `<div class="card" style="margin-top:14px"><b>${ic('eye', 'sm')} משתמש בקרה (צפייה בלבד)</b>
    <p class="muted" style="margin:6px 0 10px">חשבון אחד שאפשר להתחבר אליו מכמה מכשירים. רואה את כל הנתונים, לא משנה כלום ולא מוציא דוחות.${S.viewerLogin ? ` פעיל: טלפון <span class="ltr">${esc(S.viewerLogin.phone)}</span> · מספר עובד ${esc(S.viewerLogin.num)}` : ' כרגע כבוי.'}</p>
    ${canSetFlags() ? `<div class="actions"><button class="btn" data-action="viewer-set">${S.viewerLogin ? 'שינוי פרטים' : 'הפעלה'}</button>${S.viewerLogin ? '<button class="btn danger" data-action="viewer-off">כיבוי</button>' : ''}</div>` : '<p class="hint">רק בעל הבית יכול להפעיל או לשנות.</p>'}</div>`}`;
}

/* ---------- suppliers & orders (managers) ---------- */
const vatLabel = p => p.vatIncl ? 'כולל מע״מ' : 'לפני מע״מ';
const ORDER_ST = { draft: ['טיוטה', ''], sent: ['נשלחה', 'pend'], received: ['התקבלה', 'ok'] };
function vSuppliers() {
  return back('admin', 'חזרה לניהול חנות') + `<h2 class="vt">ספקים · ${S.suppliers.length}</h2>
  <p class="lead">לכל מוצר: המחיר מהספק, מע״מ 18% ומחיר מכירה מומלץ (פי 1.5 כולל מע״מ).</p>
  <div class="list">${S.suppliers.map(s => `<div class="row tap" data-action="sup-open" data-id="${s.id}"><span class="av lg">${esc((s.name || '?')[0])}</span><div class="row-main"><div class="row-title">${esc(s.name)}</div>
    <div class="row-sub"><span>${(s.products || []).length} מוצרים</span>${s.phone ? `<span class="ltr">${fmtPhone(s.phone)}</span>` : ''}<span>${S.orders.filter(o => o.supplierId === s.id).length} הזמנות</span></div></div>${ic('chev', 'sm chev')}</div>`).join('') || '<div class="row muted">עדיין אין ספקים.</div>'}</div>
  <button class="btn primary" data-action="sup-new">${ic('plus', 'sm')}ספק חדש</button>`;
}
function vSupplier() {
  const s = byId(S.suppliers, supId); if (!s) { view = 'suppliers'; return vSuppliers(); }
  const ps = s.products || [], os = S.orders.filter(o => o.supplierId === s.id).sort((a, b) => b.ts - a.ts);
  return back('suppliers', 'חזרה לספקים') + `<h2 class="vt">${esc(s.name)}</h2>
  <div class="row-sub" style="margin:-6px 0 12px">${s.phone ? `<span class="ltr">${fmtPhone(s.phone)}</span>` : ''}${s.note ? `<span>${esc(s.note)}</span>` : ''}<button class="link-btn" data-action="sup-edit" data-id="${s.id}">עריכת פרטי הספק</button></div>
  <h3 class="sec">מוצרים ומחירים · ${ps.length}</h3>
  <div class="list">${ps.map(p => `<div class="row tap" data-action="prod-edit" data-id="${p.id}"><div class="row-main"><div class="row-title">${esc(p.name)}</div>
    <div class="row-sub num"><span>${money(+p.price)} ${vatLabel(p)}</span>${p.vatIncl ? '' : `<span>כולל מע״מ ${money(withVat(p))}</span>`}</div></div>
    <div class="price-sell"><small>מכירה ×1.5</small><b class="num">${money(sellPrice(p))}</b></div></div>`).join('') || '<div class="row muted">עדיין אין מוצרים לספק הזה.</div>'}</div>
  <div class="actions"><button class="btn" data-action="prod-new">${ic('plus', 'sm')}מוצר חדש</button>${ps.length ? `<button class="btn" data-action="sup-export" data-id="${s.id}">${ic('down', 'sm')}ייצוא מחירון</button>` : ''}</div>
  <h3 class="sec">הזמנות · ${os.length}</h3>
  <div class="list">${os.map(orderRow).join('') || '<div class="row muted">עדיין אין הזמנות מהספק הזה.</div>'}</div>
  ${ps.length ? `<button class="btn primary" data-action="order-new" data-id="${s.id}">${ic('cart', 'sm')}הזמנה חדשה מ${esc(s.name)}</button>` : ''}`;
}
const orderTotal = o => sum((o.lines || []).map(l => withVat(l) * l.qty));
const orderRow = o => { const s = byId(S.suppliers, o.supplierId) || { name: 'ספק שנמחק' }, st = ORDER_ST[o.status] || ORDER_ST.draft; return `<div class="row tap" data-action="order-open" data-id="${o.id}"><div class="row-main"><div class="row-title">${esc(s.name)} · ${fmtD(o.ts)}</div>
  <div class="row-sub num"><span class="pill ${st[1]}">${st[0]}</span><span>${(o.lines || []).length} שורות</span><span>${money(orderTotal(o))} כולל מע״מ</span></div></div>${ic('chev', 'sm chev')}</div>`; };
function vOrders() {
  const os = [...S.orders].sort((a, b) => b.ts - a.ts);
  return back() + `<h2 class="vt">הזמנות מספקים</h2>
  ${S.suppliers.length ? `<div class="actions" style="margin-bottom:12px">${S.suppliers.filter(s => (s.products || []).length).map(s => `<button class="btn sm" data-action="order-new" data-id="${s.id}">${ic('plus', 'sm')}${esc(s.name)}</button>`).join('')}</div>` : '<p class="lead">כדי להזמין, מוסיפים קודם ספק ומוצרים בניהול חנות › ספקים ומחירים.</p>'}
  <div class="list">${os.map(orderRow).join('') || '<div class="row muted">עדיין אין הזמנות.</div>'}</div>
  <button class="btn" data-action="nav" data-view="suppliers">${ic('users', 'sm')}ספקים ומחירים</button>`;
}
const orderText = o => { const s = byId(S.suppliers, o.supplierId) || { name: '' };
  return `הזמנה משאבעס מרקט · ${new Date(o.ts).toLocaleDateString('he-IL')}\nלכבוד: ${s.name}\n\n` + (o.lines || []).map(l => `• ${l.name} – ${l.qty}`).join('\n') + (o.note ? `\n\nהערות: ${o.note}` : '') + '\n\nתודה!'; };
const orderCsv = o => { const s = byId(S.suppliers, o.supplierId) || { name: '' };
  return [['ספק', s.name], ['תאריך', new Date(o.ts).toLocaleDateString('he-IL')], [], ['מוצר', 'כמות', 'מחיר ליחידה', 'מע״מ', 'מחיר כולל מע״מ', 'סה״כ כולל מע״מ'],
    ...(o.lines || []).map(l => [l.name, l.qty, (+l.price).toFixed(2), vatLabel(l), withVat(l).toFixed(2), (withVat(l) * l.qty).toFixed(2)]), [], ['סה״כ', '', '', '', '', orderTotal(o).toFixed(2)]]; };

/* ---------- detailed payroll report ---------- */
function reportData() {
  const { from, to, emp: who } = repCfg, a = new Date(from + 'T00:00').getTime(), b = new Date(to + 'T23:59:59').getTime();
  return S.employees.filter(e => !who || e.id === who).map(e => {
    const sh = S.shifts.filter(s => s.empId === e.id && (s.status === 'approved' || s.status === 'open') && s.start >= a && s.start <= b).sort((x, y) => x.start - y.start);
    const h = sum(sh.map(dur)), ex = extrasOf(e.id, a, b).sort((x, y) => x.ts - y.ts), dl = exSum(ex, 'delivery'), bn = exSum(ex, 'bonus');
    return { e, sh, h, ex, dl, bn, hp: h * e.wage, pay: h * e.wage + dl + bn };
  }).filter(r => r.sh.length || r.ex.length);
}
function vReport() {
  if (!repCfg) { view = 'hours'; return vHours(); }
  const rows = reportData(), range = `${new Date(repCfg.from).toLocaleDateString('he-IL')} – ${new Date(repCfg.to).toLocaleDateString('he-IL')}`;
  return back('hours', 'חזרה לשעות ושכר') + `<h2 class="vt">דוח שכר מפורט</h2>
  <p class="lead">${range} · משמרות מאושרות ומשמרות פתוחות (עד עכשיו). בקשות שממתינות לאישור לא נכללות.</p>
  <div class="stats"><div class="stat"><span>סה״כ שעות</span><b class="num">${fmtH(sum(rows.map(r => r.h)))}</b></div><div class="stat"><span>סה״כ לתשלום</span><b class="num">${money(sum(rows.map(r => r.pay)))}</b></div></div>
  <div class="actions" style="margin:12px 0"><button class="btn" data-action="report-copy">${ic('copy', 'sm')}העתקה</button><button class="btn" data-action="report-csv">${ic('down', 'sm')}קובץ לאקסל</button><button class="btn" data-action="report-new">שינוי טווח</button></div>
  ${rows.map(r => `<div class="card rep"><div class="card-head"><b>${esc(r.e.name)} <span class="muted num">#${esc(r.e.num)}</span></b><span class="num">${fmtH(r.h)} ש׳ · <b>${money(r.pay)}</b></span></div>
    <div class="tbl-wrap"><table><thead><tr><th>תאריך</th><th>כניסה</th><th>יציאה</th><th>שעות</th><th class="l">שכר</th></tr></thead><tbody>
    ${r.sh.map(s => `<tr><td>${fmtD(s.start)}</td><td>${fmtT(s.start)}</td><td>${s.end ? fmtT(s.end) + (sameDay(s.start, s.end) ? '' : ' (+1)') : 'פתוחה'}</td><td>${fmtH(dur(s))}</td><td class="l">${money(dur(s) * r.e.wage)}</td></tr>`).join('')}
    <tr class="tot"><td>${r.sh.length} משמרות</td><td></td><td></td><td>${fmtH(r.h)}</td><td class="l">${money(r.hp)}</td></tr></tbody></table></div>
    ${r.ex.length ? `<div class="tbl-wrap"><table><thead><tr><th>תאריך</th><th>קטגוריה</th><th>הערה</th><th class="l">סכום</th></tr></thead><tbody>${r.ex.map(x => `<tr><td>${fmtD(x.ts)}</td><td>${EXTRA[x.kind] || ''}</td><td>${esc(x.note || '')}</td><td class="l">${money(+x.amount || 0)}</td></tr>`).join('')}</tbody></table></div>` : ''}
    <div class="rep-sum num"><span>שעות ${money(r.hp)}</span><span>משלוחים ${money(r.dl)}</span><span>בונוסים ${money(r.bn)}</span><b>סה״כ ${money(r.pay)}</b></div>
    <div class="muted num" style="font-size:.8rem;margin-top:6px">${money(r.e.wage)} לשעה</div></div>`).join('') || '<div class="list"><div class="row muted">אין משמרות בטווח הזה.</div></div>'}`;
}
const reportText = () => { const rows = reportData(); return `דוח שכר · שאבעס מרקט · ${new Date(repCfg.from).toLocaleDateString('he-IL')} – ${new Date(repCfg.to).toLocaleDateString('he-IL')}\n\n` + rows.map(r => `${r.e.name} (#${r.e.num}) · ${fmtH(r.h)} שעות · שעות ${money(r.hp)} · משלוחים ${money(r.dl)} · בונוסים ${money(r.bn)} · סה״כ ${money(r.pay)}\n` + r.sh.map(s => `  ${new Date(s.start).toLocaleDateString('he-IL')} ${fmtT(s.start)}–${s.end ? fmtT(s.end) : 'פתוחה'} · ${fmtH(dur(s))} ש׳ · ${money(dur(s) * r.e.wage)}`).join('\n') + r.ex.map(x => `\n  ${new Date(x.ts).toLocaleDateString('he-IL')} ${EXTRA[x.kind] || ''}${x.note ? ' (' + x.note + ')' : ''} · ${money(+x.amount || 0)}`).join('')).join('\n\n') + `\n\nסה״כ: ${fmtH(sum(rows.map(r => r.h)))} שעות · ${money(sum(rows.map(r => r.pay)))}`; };

/* ---------- days an employee cannot work ---------- */
function vAvail() {
  const today = sod(Date.now()), days = [...Array(28)].map((_, i) => dateKey(today + i * DAY + 3 * H));
  if (!manager) {
    const mine = new Map(S.unavail.filter(u => u.empId === session()).map(u => [u.date, u]));
    return back() + `<h2 class="vt">ימים שאני לא יכול לעבוד</h2>
    <p class="lead">מסמנים יום, והמנהל רואה את זה כשהוא מסדר משמרות. אפשר לבטל בלחיצה נוספת.</p>
    <div class="list">${days.map(k => { const u = mine.get(k); return `<button class="row tap av-day ${u ? 'off' : ''}" data-action="avail-day" data-date="${k}"><div class="row-main"><div class="row-title">${fmtLong(new Date(k + 'T12:00'))}</div>${u && u.note ? `<div class="row-sub">${esc(u.note)}</div>` : ''}</div>${u ? '<span class="pill bad">לא יכול</span>' : '<span class="pill">פנוי</span>'}</button>`; }).join('')}</div>`;
  }
  const by = k => S.unavail.filter(u => u.date === k);
  return back() + `<h2 class="vt">אילוצים של עובדים</h2>
  <p class="lead">העובדים מסמנים בטלפון ימים שהם לא יכולים לעבוד. מוצגים 4 השבועות הקרובים.</p>
  <div class="list">${days.map(k => { const g = by(k); return `<div class="row"><div class="row-main"><div class="row-title">${fmtLong(new Date(k + 'T12:00'))}</div>
    <div class="row-sub">${g.length ? g.map(u => `<span class="pill bad">${esc(emp(u.empId).name)}${u.note ? ' · ' + esc(u.note) : ''}</span>`).join('') : '<span class="muted">כולם פנויים</span>'}</div></div></div>`; }).join('')}</div>`;
}

/* ---------- reels: short videos and photo posts, 72 hours ---------- */
const REEL_TTL = 72 * H, REEL_MAX_SEC = 30, DAY_LIMIT = { video: 5, photos: 5 };
const REACTS = [['laugh', '😂'], ['cry', '😢'], ['wow', '😮'], ['poop', '💩']];
const MEDIA = new Map();
let pendingUpload = null, replyTo = null, mentionTags = new Map(), reelsObs = null;
const liveReels = () => S.reels.filter(r => r.ready && Date.now() - r.ts < REEL_TTL).sort((a, b) => b.ts - a.ts);
const myToday = type => S.reels.filter(r => r.by === session() && r.type === type && sameDay(r.ts, Date.now())).length;
const leftToday = type => manager ? Infinity : Math.max(0, DAY_LIMIT[type] - myToday(type));
const MENTION_SEEN = 'dalpak-mention-seen';
const mentionSeen = () => { try { return +localStorage.getItem(MENTION_SEEN) || 0; } catch (e) { return 0; } };
function myMentions() {
  const me = session(), live = new Set(liveReels().map(r => r.id)), out = [];
  liveReels().forEach(r => { if (r.by !== me && (r.tags || []).includes(me)) out.push({ ts: r.ts, by: r.by, reel: r.id, text: r.caption || '', kind: 'reel' }); });
  S.reelComments.forEach(c => { if (c.by !== me && live.has(c.reel) && (c.tags || []).includes(me)) out.push({ ts: c.ts, by: c.by, reel: c.reel, text: c.text, kind: 'comment' }); });
  return out.sort((a, b) => b.ts - a.ts);
}
const newMentions = () => viewer ? [] : myMentions().filter(m => m.ts > mentionSeen());
// Reactions and comments other people left on my posts. Reactions have no time, so "new" means not seen on this phone.
const ACT_SEEN = 'dalpak-activity-seen';
const actSeen = () => { try { return new Set(JSON.parse(localStorage.getItem(ACT_SEEN) || '[]')); } catch (e) { return new Set(); } };
function myActivity() {
  const me = session(), out = [];
  liveReels().filter(r => r.by === me).forEach(r => {
    Object.entries(r.reactions || {}).forEach(([who, k]) => { if (who !== me) out.push({ key: `${r.id}|${who}|${k}`, reel: r.id, by: who, emoji: (REACTS.find(x => x[0] === k) || [])[1] || '', ts: 0 }); });
    S.reelComments.filter(c => c.reel === r.id && c.by !== me && !(c.tags || []).includes(me)).forEach(c => out.push({ key: 'c|' + c.id, reel: r.id, by: c.by, text: c.text, ts: c.ts }));
  });
  return out;
}
const newActivity = () => { if (viewer) return []; const s = actSeen(); return myActivity().filter(a => !s.has(a.key)); };
// @mentions: text keeps "@שם", tags keep the employee ids that were picked from the list.
const withMentions = (text, tags) => {
  let h = esc(text);
  (tags || []).map(id => emp(id)).filter(e => e.id).sort((a, b) => b.name.length - a.name.length)
    .forEach(e => { h = h.split('@' + esc(e.name)).join(`<b class="mention">@${esc(e.name)}</b>`); });
  return h;
};
const viewCount = r => Object.keys(r.views || {}).filter(id => id !== r.by).length;
// A post counts as watched after it stayed on screen for 1.5 seconds. Your own posts don't count.
const viewTimers = new Map();
function markViewed(id) {
  const r = byId(S.reels, id), me = session();
  if (!r || viewer || r.by === me || (r.views || {})[me]) return;
  r.views = { ...(r.views || {}), [me]: Date.now() }; save(); patchReels();
}
function reelCard(r) {
  const a = emp(r.by), mine = (r.reactions || {})[session()], n = S.reelComments.filter(c => c.reel === r.id).length;
  const left = Math.max(1, Math.ceil((r.ts + REEL_TTL - Date.now()) / H));
  const counts = Object.fromEntries(REACTS.map(([k]) => [k, Object.values(r.reactions || {}).filter(v => v === k).length]));
  return `<article class="reel" data-reel="${r.id}">
    <div class="reel-media ${r.type}" data-action="reel-tap" data-id="${r.id}">
      ${r.type === 'video' ? `<video class="rv" playsinline loop muted preload="none" ${r.poster ? `poster="${r.poster}"` : ''}></video><span class="rv-sound" aria-hidden="true">🔇</span>`
      : `<div class="rp-track">${[...Array(r.parts || 1)].map((_, i) => `<div class="rp-slide">${i === 0 && r.poster ? `<img src="${r.poster}" alt="">` : ''}</div>`).join('')}</div>${(r.parts || 1) > 1 ? `<div class="rp-dots">${[...Array(r.parts)].map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div>` : ''}`}
      <span class="reel-load">טוען…</span>
    </div>
    <div class="reel-side">
      ${REACTS.map(([k, e]) => `<button class="rx ${mine === k ? 'on' : ''}" data-action="react" data-id="${r.id}" data-r="${k}" aria-label="תגובה ${e}"><span>${e}</span><small data-cnt="${k}">${counts[k] || ''}</small></button>`).join('')}
      <button class="rx" data-action="reel-comments" data-id="${r.id}" aria-label="תגובות"><span>💬</span><small data-cnt="c">${n || ''}</small></button>
      ${manager && !viewer ? `<button class="rx" data-action="reel-save" data-id="${r.id}" aria-label="שמירה למכשיר"><span>${ic('down', 'sm')}</span></button>` : ''}
      ${!viewer && r.by === session() ? `<button class="rx" data-action="reel-del" data-id="${r.id}" aria-label="מחיקה"><span>🗑</span></button>` : ''}
    </div>
    <div class="reel-info">
      <div class="reel-who">${avatar(a, 'md')}<b>${esc(a.name || 'עובד')}</b><small>${ago(r.ts)} · נמחק בעוד ${left} שע׳</small>${!viewer && r.by === session() ? `<button class="reel-delbtn" data-action="reel-del" data-id="${r.id}">מחיקה</button>` : ''}</div>
      ${r.by === session() ? `<button class="reel-views" data-action="reel-viewers" data-id="${r.id}" aria-label="מי צפה">${ic('eye', 'sm')}<span data-cnt="v">${viewCount(r)}</span></button>` : `<span class="reel-views" aria-label="צפיות">${ic('eye', 'sm')}<span data-cnt="v">${viewCount(r)}</span></span>`}
      ${r.caption ? `<p class="reel-cap">${withMentions(r.caption, r.tags)}</p>` : ''}
    </div>
  </article>`;
}
function vReels() {
  const list = liveReels();
  return `<div class="reels-head"><h2 class="vt">רילס</h2>${viewer ? '<span class="pill">צפייה בלבד</span>' : ''}</div>
  ${viewer ? '' : `<button class="reel-fab" data-action="reel-new" aria-label="ריל או פוסט חדש">${ic('plus')}</button>`}
  <p class="lead">סרטונים ופוסטים של הצוות. כל פריט נמחק מהאפליקציה אחרי 72 שעות.</p>
  <div class="reels">${list.map(reelCard).join('') || '<div class="list"><div class="row muted">עדיין אין רילס. היו הראשונים להעלות!</div></div>'}</div>`;
}
// Only the reels in view load their media, and only the one on screen plays.
function watchReels() {
  if (reelsObs) reelsObs.disconnect();
  if (view !== 'reels') return;
  reelsObs = new IntersectionObserver(es => es.forEach(en => {
    const el = en.target, v = el.querySelector('video');
    if (en.isIntersecting && en.intersectionRatio > 0.6) { showMedia(el); if (v && v.src) v.play().catch(() => { }); if (!viewTimers.has(el.dataset.reel)) viewTimers.set(el.dataset.reel, setTimeout(() => { viewTimers.delete(el.dataset.reel); if (el.isConnected) markViewed(el.dataset.reel); }, 1500)); }
    else { if (v) v.pause(); clearTimeout(viewTimers.get(el.dataset.reel)); viewTimers.delete(el.dataset.reel); }
  }), { threshold: [0, 0.6, 1] });
  document.querySelectorAll('.reel').forEach(el => reelsObs.observe(el));
}
async function getMedia(r) {
  if (MEDIA.has(r.id)) return MEDIA.get(r.id);
  const parts = await store.loadParts(r.id);
  let m;
  if (r.type === 'video') {
    const bin = atob(parts.join('')), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const blob = new Blob([u8], { type: r.mime || 'video/mp4' }); m = { blob, url: URL.createObjectURL(blob) };
  } else m = { imgs: parts };
  MEDIA.set(r.id, m); return m;
}
async function showMedia(el) {
  if (el.dataset.loaded) return; el.dataset.loaded = '1';
  const r = byId(S.reels, el.dataset.reel); if (!r) return;
  try {
    const m = await getMedia(r);
    if (m.url) { const v = el.querySelector('video'); v.src = m.url; v.play().catch(() => { }); }
    else el.querySelectorAll('.rp-slide').forEach((s, i) => { if (m.imgs[i]) s.innerHTML = `<img src="${m.imgs[i]}" alt="">`; });
    el.classList.add('ready');
  } catch (e) { el.dataset.loaded = ''; el.querySelector('.reel-load').textContent = 'לא הצלחתי לטעון. בדקו את החיבור'; }
}
// Reactions and comment counts change often; update them in place so a playing video keeps playing.
function patchReels() {
  const ids = [...document.querySelectorAll('.reel')].map(e => e.dataset.reel).join(), want = liveReels().map(r => r.id).join();
  if (ids !== want) { const y = window.scrollY; render(); window.scrollTo(0, y); return; }
  liveReels().forEach(r => {
    const el = document.querySelector(`.reel[data-reel="${r.id}"]`); if (!el) return;
    const mine = (r.reactions || {})[session()];
    REACTS.forEach(([k]) => { const b = el.querySelector(`[data-r="${k}"]`); if (!b) return; b.classList.toggle('on', mine === k); b.querySelector('small').textContent = Object.values(r.reactions || {}).filter(v => v === k).length || ''; });
    const c = el.querySelector('[data-cnt="c"]'); if (c) c.textContent = S.reelComments.filter(x => x.reel === r.id).length || '';
    const vv = el.querySelector('[data-cnt="v"]'); if (vv) vv.textContent = viewCount(r);
  });
  renderNav();
}
function commentsHtml(r) {
  const cs = S.reelComments.filter(c => c.reel === r.id).sort((a, b) => a.ts - b.ts), top = cs.filter(c => !c.parent);
  const one = c => `<div class="cm ${c.parent ? 'sub' : ''}">${avatar(emp(c.by), 'md')}<div class="cm-b"><div><b>${esc(emp(c.by).name)}</b> <small class="muted">${ago(c.ts)}</small></div><div>${withMentions(c.text, c.tags)}</div>
    <div class="cm-act">${viewer ? '' : `<button class="link-btn" data-action="reply-to" data-id="${c.parent || c.id}" data-by="${c.by}" data-name="${esc(emp(c.by).name)}">הגב</button>`}${!viewer && (manager || c.by === session()) ? `<button class="link-btn danger-t" data-action="cm-del" data-id="${c.id}">מחיקה</button>` : ''}</div></div></div>`;
  return top.map(c => one(c) + cs.filter(x => x.parent === c.id).map(one).join('')).join('') || '<p class="muted">עדיין אין תגובות. מה דעתכם?</p>';
}
function openComments(id) {
  const r = byId(S.reels, id); if (!r) return; replyTo = null; mentionTags = new Map();
  sheet(`<h3>תגובות</h3><div class="cms" id="cms">${commentsHtml(r)}</div>
    ${viewer ? '' : `<form class="form cm-form" data-form="comment" data-reel="${r.id}"><div id="cm-reply" class="cm-reply" hidden></div><div class="mention-wrap"><textarea id="cm-t" name="text" rows="2" maxlength="500" placeholder="כתבו תגובה… אפשר לתייג עם @" data-mention required></textarea><div class="mention-box" hidden></div></div><button class="btn primary block">שליחה</button></form>`}`);
}
function refreshComments() { const box = document.getElementById('cms'), f = document.querySelector('form[data-form=comment]'); if (box && f) box.innerHTML = commentsHtml(byId(S.reels, f.dataset.reel) || {}); }
// Shrink a video on the phone: redraw it at mobile size and record it again at a low bitrate.
async function compressVideo(file, onProg) {
  const url = URL.createObjectURL(file), v = document.createElement('video');
  v.src = url; v.playsInline = true; v.muted = true; v.preload = 'auto';
  await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error('bad')); });
  const dur = Math.min(v.duration || 0, REEL_MAX_SEC), k = Math.min(1, 480 / Math.max(v.videoWidth || 480, v.videoHeight || 480));
  const w = Math.round((v.videoWidth || 480) * k / 2) * 2, h = Math.round((v.videoHeight || 480) * k / 2) * 2;
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  await new Promise(r => { v.onseeked = r; v.currentTime = Math.min(0.3, dur / 2); });
  g.drawImage(v, 0, 0, w, h);
  const pc = document.createElement('canvas'), pk = Math.min(1, 240 / Math.max(w, h)); pc.width = Math.round(w * pk); pc.height = Math.round(h * pk); pc.getContext('2d').drawImage(c, 0, 0, pc.width, pc.height);
  const poster = pc.toDataURL('image/jpeg', 0.6);
  // A short, already-small MP4 is kept as it is.
  if (file.size < 2.2e6 && /mp4|quicktime/.test(file.type) && (v.duration || 99) <= REEL_MAX_SEC + 0.5) { URL.revokeObjectURL(url); onProg(1); return { blob: file, mime: file.type === 'video/quicktime' ? 'video/mp4' : file.type, poster, dur, orig: v.duration }; }
  await new Promise(r => { v.onseeked = r; v.currentTime = 0; });
  const stream = c.captureStream(24);
  try { const ac = new (window.AudioContext || window.webkitAudioContext)(), src = ac.createMediaElementSource(v), dst = ac.createMediaStreamDestination(); src.connect(dst); dst.stream.getAudioTracks().forEach(t => stream.addTrack(t)); v.muted = false; } catch (e) { }
  const mime = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm'].find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m));
  if (!mime) throw new Error('norec');
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 450000, audioBitsPerSecond: 48000 }), chunks = [];
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  const done = new Promise(r => rec.onstop = r);
  rec.start(500); await v.play();
  await new Promise(r => { const draw = () => { g.drawImage(v, 0, 0, w, h); onProg(Math.min(1, v.currentTime / dur)); if (v.ended || v.currentTime >= dur) { v.pause(); r(); } else requestAnimationFrame(draw); }; draw(); });
  rec.stop(); await done; URL.revokeObjectURL(url);
  return { blob: new Blob(chunks, { type: mime.split(';')[0] }), mime: mime.split(';')[0], poster, dur, orig: v.duration };
}
// A small still for the feed. Gives up after 4 seconds so a phone that can't read the video never gets stuck.
function videoPoster(file) {
  return new Promise(res => {
    const url = URL.createObjectURL(file), v = document.createElement('video'); let done = false;
    const end = p => { if (done) return; done = true; URL.revokeObjectURL(url); res(p || ''); };
    setTimeout(() => end(''), 4000);
    v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
    v.onloadeddata = () => { try { v.currentTime = Math.min(0.3, (v.duration || 1) / 2); } catch (e) { end(''); } };
    v.onseeked = () => { try { const k = Math.min(1, 240 / Math.max(v.videoWidth || 240, v.videoHeight || 240)), c = document.createElement('canvas'); c.width = Math.round((v.videoWidth || 240) * k); c.height = Math.round((v.videoHeight || 240) * k); c.getContext('2d').drawImage(v, 0, 0, c.width, c.height); end(c.toDataURL('image/jpeg', 0.6)); } catch (e) { end(''); } };
    v.onerror = () => end('');
  });
}
const blobB64 = b => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.onerror = rej; fr.readAsDataURL(b); });
const chunk = (s, n) => { const a = []; for (let i = 0; i < s.length; i += n) a.push(s.slice(i, i + n)); return a; };
function uploadSheet(type) {
  pendingUpload = null; mentionTags = new Map();
  const left = leftToday(type);
  sheet(`<h3>העלאה לרילס</h3>
    <div class="seg-wrap" style="margin:10px 0">${[['video', '🎬 סרטון'], ['photos', '🖼 פוסט תמונות']].map(([k, l]) => `<button class="seg ${type === k ? 'on' : ''}" data-action="reel-type" data-t="${k}">${l}</button>`).join('')}</div>
    <p class="muted" style="font-size:.85rem">${type === 'video' ? 'הסרטון עולה באיכות המקורית. סרטון ארוך לוקח יותר זמן להעלות.' : 'עד 5 תמונות. התמונות נדחסות לפני ההעלאה.'} ${left === Infinity ? '' : `נשארו לך היום: ${left}`}</p>
    ${left === 0 ? '<p class="banner info">הגעת למכסה היומית. אפשר להעלות שוב מחר.</p>' : `
    <form class="form" data-form="reel" data-type="${type}">
      <label class="btn block">${ic(type === 'video' ? 'camera' : 'plus', 'sm')}${type === 'video' ? 'בחירת סרטון' : 'בחירת תמונות'}<input id="up-f" type="file" accept="${type === 'video' ? 'video/*' : 'image/*'}" ${type === 'photos' ? 'multiple' : ''} hidden data-up="${type}"></label>
      <div id="up-prev" class="up-prev"></div><div class="up-prog" hidden><i></i><span></span></div>
      <div class="field mention-wrap"><label for="up-cap">כיתוב</label><textarea id="up-cap" name="caption" rows="2" maxlength="300" placeholder="מה רואים כאן? אפשר לתייג עם @" data-mention></textarea><div class="mention-box" hidden></div></div>
      <button class="btn primary block" id="up-go" disabled>פרסום</button></form>`}`);
}
const setProg = (f, label) => { const p = document.querySelector('.up-prog'); if (!p) return; p.hidden = false; p.querySelector('i').style.width = Math.round(f * 100) + '%'; p.querySelector('span').textContent = label; };
async function prepUpload(inp) {
  const type = inp.dataset.up, files = [...inp.files]; if (!files.length) return;
  const go = document.getElementById('up-go'), prev = document.getElementById('up-prev'); go.disabled = true; pendingUpload = null;
  try {
    if (type === 'video') {
      // The video goes up exactly as it is: no compression and no length or size limit.
      const f = files[0]; setProg(0.1, 'מכין את הסרטון…');
      const poster = await videoPoster(f);
      const b64 = await blobB64(f);
      const mime = !f.type || f.type === 'video/quicktime' ? 'video/mp4' : f.type;
      pendingUpload = { type, parts: chunk(b64, 700000), meta: { type, mime, poster, size: f.size } };
      prev.innerHTML = `<video src="${URL.createObjectURL(f)}" playsinline controls muted></video>`;
      setProg(1, `מוכן · ${(f.size / 1e6).toFixed(1)}MB${f.size > 20e6 ? ' · סרטון גדול, ההעלאה תיקח כמה דקות' : ''}`);
    } else {
      const pick = files.slice(0, 5); setProg(0, 'דוחס תמונות…'); const imgs = [];
      for (let i = 0; i < pick.length; i++) { imgs.push(await shrinkImage(pick[i], 1080)); setProg((i + 1) / pick.length, `דוחס תמונות… ${i + 1}/${pick.length}`); }
      const poster = await shrinkImage(pick[0], 240);
      pendingUpload = { type, parts: imgs, meta: { type, poster, size: imgs.join('').length } };
      prev.innerHTML = imgs.map(s => `<img src="${s}" alt="">`).join('');
      setProg(1, `מוכן · ${imgs.length} תמונות${files.length > 5 ? ' (נלקחו 5 הראשונות)' : ''}`);
    }
    go.disabled = false;
  } catch (e) { setProg(1, e.message === 'norec' ? 'המכשיר הזה לא יודע לדחוס סרטונים. נסו מטלפון אחר' : 'לא הצלחתי לקרוא את הקובץ. נסו קובץ אחר'); }
}
// @ autocomplete inside any textarea marked data-mention.
function mentionInput(t) {
  const box = t.parentElement.querySelector('.mention-box'); if (!box) return;
  const m = t.value.slice(0, t.selectionStart).match(/@([^\s@]*)$/);
  if (!m) { box.hidden = true; return; }
  const q = m[1], list = S.employees.filter(e => e.name.includes(q)).slice(0, 6);
  box.innerHTML = list.map(e => `<button type="button" data-action="mention-pick" data-id="${e.id}">${avatar(e)}${esc(e.name)}</button>`).join('');
  box.hidden = !list.length;
}
const pickedTags = text => [...mentionTags].filter(([id, name]) => text.includes('@' + name)).map(([id]) => id);
async function backupReels() {
  const out = [], list = S.reels.filter(r => r.ready && !r.backedUp);
  for (const r of list) {
    try {
      const m = await getMedia(r), a = emp(r.by), d = new Date(r.ts), stamp = dateKey(r.ts) + '_' + pad(d.getHours()) + pad(d.getMinutes());
      const base = `shabbes-reel_${stamp}_${(a.name || 'עובד').replace(/\s+/g, '-')}_${r.id}`;
      const dl = (href, name) => { const x = document.createElement('a'); x.href = href; x.download = name; document.body.appendChild(x); x.click(); x.remove(); };
      if (m.url) dl(m.url, base + (/webm/.test(r.mime) ? '.webm' : '.mp4'));
      else m.imgs.forEach((s, i) => dl(s, `${base}_${i + 1}.jpg`));
      const cs = S.reelComments.filter(c => c.reel === r.id).sort((x, y) => x.ts - y.ts);
      const txt = `${a.name} · ${d.toLocaleString('he-IL')}\n${r.caption || ''}\n\nתגובות אימוג׳י: ${REACTS.map(([k, e]) => e + ' ' + Object.values(r.reactions || {}).filter(v => v === k).length).join('  ')}\n\n` + cs.map(c => `${c.parent ? '   ↳ ' : ''}${emp(c.by).name} (${new Date(c.ts).toLocaleString('he-IL')}): ${c.text}`).join('\n');
      dl(URL.createObjectURL(new Blob(['\ufeff' + txt], { type: 'text/plain;charset=utf-8' })), base + '.txt');
      out.push(r.id); await new Promise(z => setTimeout(z, 700));
    } catch (e) { }
  }
  return out;
}
window.shabbesBackup = async () => (store.isManager() ? { ids: await backupReels() } : { error: 'צריך להיות במצב מנהל' });
window.shabbesBackupDone = ids => { (ids || []).forEach(id => { const r = byId(S.reels, id); if (r) r.backedUp = true; }); save(); return true; };
// Managers' phones clear reels older than 72 hours once they were copied to the computer (or after 7 days).
let reelsCleaned = false;
async function cleanReels() {
  if (reelsCleaned || !store.isManager() || viewer || !store.loaded('reels', 'reelComments')) return; reelsCleaned = true;
  const now = Date.now();
  for (const r of S.reels.filter(r => now - r.ts > REEL_TTL && (r.backedUp || now - r.ts > 7 * DAY))) await store.deleteReel(r);
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
// Screens and pop-up sheets are recorded in the browser history, so the phone's back button
// closes the open sheet first and then steps back through the screens.
let popSkip = 0;
const layerOpen = () => !!document.getElementById('layer').innerHTML;
function go(v, replace) {
  if (v === view && !replace) { render(); window.scrollTo(0, 0); return; }
  view = v;
  const d = ((history.state && history.state.d) || 0) + (replace ? 0 : 1);
  try { replace ? history.replaceState({ view, d: Math.max(0, d) }, '') : history.pushState({ view, d }, ''); } catch (e) { }
  render(); window.scrollTo(0, 0);
}
window.addEventListener('popstate', e => {
  if (popSkip) { popSkip--; if (layerOpen()) try { history.pushState({ ...(history.state || {}), sheet: 1 }, ''); } catch (er) { } return; }
  if (layerOpen()) { document.getElementById('layer').innerHTML = ''; pinNext = null; if (renderPending) render(); return; }
  const st = e.state || {};
  if (st.sheet) { try { history.back(); } catch (er) { } return; }
  view = st.view || 'clock'; render(); window.scrollTo(0, 0);
});
function sheet(html) {
  const wasOpen = layerOpen();
  document.getElementById('layer').innerHTML = `<div class="sheet-wrap"><div class="backdrop" data-action="close"></div><div class="sheet" role="dialog" aria-modal="true"><button class="sheet-x" data-action="close" aria-label="סגירה">${ic('x', 'sm')}</button>${html}</div></div>`;
  if (!wasOpen && !popSkip) try { history.pushState({ ...(history.state || {}), sheet: 1 }, ''); } catch (e) { }
}
function closeSheet() {
  const wasOpen = layerOpen();
  document.getElementById('layer').innerHTML = ''; pinNext = null;
  if (wasOpen && history.state && history.state.sheet) { popSkip++; try { history.back(); } catch (e) { popSkip--; } }
  if (renderPending) render();
}
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
    if (ok) { pinFails = 0; const n = pinNext; pinNext = null; closeSheet(); toast('מצב מנהל פעיל'); render(); if (n) n(); }
    else {
      pinBuf = ''; drawPin(true); pinFails++;
      if (pinFails >= 3 && session()) {
        S.notifications.push({ id: uid(), type: 'info', kind: 'pin', empId: session(), count: pinFails, ts: Date.now(), text: `${cur().name} הקיש/ה סיסמת מנהל שגויה ${pinFails} פעמים ברצף` });
        pinFails = 0; save();
      }
    }
  }
}
const needMgr = fn => store.isManager() || viewer ? fn() : store.isPermAdmin?.() ? store.enterManager().then(ok => { render(); if (ok) fn(); }) : openPin(fn);

/* ---------- actions ---------- */
const byId = (arr, id) => arr.find(x => x.id === id);
const ACT = {
  'reel-new': () => uploadSheet('video'),
  'extra-new': () => sheet(`<h3>${ic('truck', 'sm')} עשיתי משלוח</h3><p class="muted" style="margin-bottom:12px">המנהל יאשר ויקבע את הסכום, והוא יתווסף לשכר שלך.</p><form class="form" data-form="extra"><div class="field"><label for="ex-n">לאן / פרטים (לא חובה)</label><input id="ex-n" name="note" placeholder="למשל: הזמנה לרחוב הרצל 12"></div><button class="btn primary block">שליחה לאישור</button></form>`),
  'extra-add': () => needMgr(() => sheet(`<h3>הוספת משלוח או בונוס</h3><form class="form" data-form="extra-direct" style="margin-top:12px">
    <div class="field"><label for="xd-e">עובד</label><select id="xd-e" name="emp">${S.employees.map(e => `<option value="${e.id}">${esc(e.name)}</option>`).join('')}</select></div>
    <div class="seg-wrap">${Object.entries(EXTRA).map(([k, l], i) => `<label class="seg ${i ? '' : 'on'}"><input type="radio" name="kind" value="${k}" ${i ? '' : 'checked'} hidden data-segpick>${l}</label>`).join('')}</div>
    <div class="two"><div class="field"><label for="xd-a">סכום (₪)</label><input id="xd-a" name="amount" type="number" min="0" step="0.5" inputmode="decimal" required></div><div class="field"><label for="xd-d">תאריך</label><input id="xd-d" name="date" type="date" value="${dateKey(Date.now())}" required></div></div>
    <div class="field"><label for="xd-n">הערה</label><input id="xd-n" name="note" placeholder="לא חובה"></div><button class="btn primary block">הוספה לשכר</button></form>`)),
  'extra-reject': d => needMgr(() => { const x = byId(S.extras, d.id); if (!x) return; x.status = 'rejected'; x.by = session(); save(); render(); toast('נדחה'); }),
  'reel-type': d => uploadSheet(d.t),
  react: d => { const r = byId(S.reels, d.id); if (!r) return; r.reactions = { ...(r.reactions || {}) }; if (r.reactions[session()] === d.r) delete r.reactions[session()]; else r.reactions[session()] = d.r; save(); patchReels(); },
  'reel-comments': d => openComments(d.id),
  'reel-viewers': d => { const r = byId(S.reels, d.id); if (!r || r.by !== session()) return; const list = Object.entries(r.views || {}).filter(([id]) => id !== r.by).sort((a, b) => b[1] - a[1]);
    sheet(`<h3>${ic('eye', 'sm')} צפו בפוסט · ${list.length}</h3><div class="list" style="margin-top:10px">${list.map(([id, ts]) => `<div class="row">${avatar(emp(id), 'md')}<div class="row-main"><div class="row-title">${esc(emp(id).name)}</div><div class="row-sub">${ago(ts)}${(r.reactions || {})[id] ? ' · ' + ((REACTS.find(x => x[0] === r.reactions[id]) || [])[1] || '') : ''}</div></div></div>`).join('') || '<div class="row muted">עדיין אף אחד לא צפה.</div>'}</div>`); },
  'reel-open': d => { go('reels'); setTimeout(() => { document.querySelector(`.reel[data-reel="${d.id}"]`)?.scrollIntoView({ block: 'center' }); openComments(d.id); }, 150); },
  'reel-tap': (d, el) => { const v = el.querySelector('video'); if (!v || !v.src) return; if (v.muted) { v.muted = false; v.play().catch(() => { }); el.querySelector('.rv-sound').textContent = '🔊'; } else if (v.paused) v.play().catch(() => { }); else v.pause(); },
  'reply-to': d => { replyTo = d.id; const b = document.getElementById('cm-reply'); b.hidden = false; b.innerHTML = `משיב/ה ל${esc(d.name)} <button type="button" class="link-btn" data-action="reply-clear">ביטול</button>`; const t = document.getElementById('cm-t'); if (d.by && d.by !== session()) { mentionTags.set(d.by, d.name); if (!t.value.includes('@' + d.name)) t.value = `@${d.name} ` + t.value; } t.focus(); },
  'reply-clear': () => { replyTo = null; const b = document.getElementById('cm-reply'); if (b) b.hidden = true; },
  'mention-pick': (d, el) => {
    const box = el.closest('.mention-box'), t = box.parentElement.querySelector('textarea'), e = emp(d.id), pos = t.selectionStart;
    const before = t.value.slice(0, pos).replace(/@([^\s@]*)$/, '@' + e.name + ' '); t.value = before + t.value.slice(pos);
    mentionTags.set(e.id, e.name); box.hidden = true; t.focus(); t.selectionStart = t.selectionEnd = before.length;
  },
  'cm-del': d => { S.reelComments = S.reelComments.filter(c => c.id !== d.id && !(manager && c.parent === d.id)); save(); refreshComments(); patchReels(); },
  'reel-del': d => sheet(`<h3>למחוק את הפוסט?</h3><p class="muted" style="margin-bottom:16px">הפוסט והתגובות שלו יימחקו מהאפליקציה לכולם.</p><div class="actions"><button class="btn" data-action="close">ביטול</button><button class="btn primary" data-action="reel-del-yes" data-id="${d.id}">מחיקה</button></div>`),
  'reel-del-yes': async d => { const r = byId(S.reels, d.id); closeSheet(); if (r) { await store.deleteReel(r); MEDIA.delete(r.id); } render(); toast('הפוסט נמחק'); },
  'reel-save': async d => { const r = byId(S.reels, d.id); if (!r) return; toast('מכין את הקובץ…'); const ids = await (async () => { const was = r.backedUp; r.backedUp = false; const all = S.reels; S.reels = [r]; try { return await backupReels(); } finally { S.reels = all; r.backedUp = was; } })(); toast(ids.length ? 'הקבצים ירדו למכשיר' : 'ההורדה נכשלה'); },
  'viewer-set': () => needMgr(() => sheet(`<h3>משתמש בקרה</h3><form class="form" data-form="viewer" style="margin-top:12px"><div class="two"><div class="field"><label for="vw-p">טלפון</label><input id="vw-p" name="phone" class="ltr" inputmode="numeric" value="${esc(S.viewerLogin ? S.viewerLogin.phone : '0000000000')}" required></div><div class="field"><label for="vw-n">מספר עובד</label><input id="vw-n" name="num" inputmode="numeric" value="${esc(S.viewerLogin ? S.viewerLogin.num : '1234')}" required></div></div><button class="btn primary block">שמירה</button></form>`)),
  'viewer-off': () => needMgr(async () => { const r = await store.setViewer(null); render(); toast(r.error || 'משתמש הבקרה כובה'); }),
  nav: d => go(d.view === 'login' ? 'clock' : d.view),
  back: d => { if (history.state && history.state.d > 0) history.back(); else go(d.view === 'login' ? 'clock' : d.view, true); },
  'item-bulk': () => needMgr(() => sheet(`<h3>הוספת פריטים מרשימה</h3><form class="form" data-form="bulk" style="margin-top:12px">
    <div class="field"><label for="bk-c">מחלקה</label><select id="bk-c" name="cat">${catOpts('drinks', SUBS[0])}</select></div>
    <div class="field"><label for="bk-t">רשימת פריטים · כל שורה פריט</label><textarea id="bk-t" name="list" rows="10" required placeholder="קולה פחית&#10;ספרייט פחית"></textarea><small>שורות ריקות ופריטים שכבר קיימים במחלקה מדולגים. הכמות מתחילה ב-0.</small></div>
    <button class="btn primary block">הוספה למלאי</button></form>`)),
  'owner-claim': () => needMgr(() => sheet(`<h3>${ic('crown', 'sm')} לקבוע אותך כבעל הבית?</h3><p class="muted" style="margin:8px 0 16px">${esc(cur().name)} יהיה מנהל קבוע שאי אפשר להסיר, והיחיד שיכול לתת או להסיר הרשאת ניהול קבועה לעובדים אחרים.</p><div class="actions"><button class="btn" data-action="close">ביטול</button><button class="btn brass" data-action="owner-yes">כן, אני בעל הבית</button></div>`)),
  'owner-yes': async () => { const r = await store.claimOwner(); closeSheet(); render(); toast(r.error || 'נקבעת כבעל הבית'); },
  'my-task': d => { const t = byId(S.tasks, d.id); if (!t || t.empId !== session()) return; t.done = !t.done; t.seen = true; if (t.done) t.doneAt = Date.now(); else delete t.doneAt; save(); render(); toast(t.done ? 'כל הכבוד! המשימה סומנה כבוצעה' : 'המשימה חזרה לפתוחות'); },
  'report-new': () => needMgr(() => { const d = new Date(), f = repCfg ? repCfg.from : dateKey(new Date(d.getFullYear(), d.getMonth(), 1)), t = repCfg ? repCfg.to : dateKey(d);
    sheet(`<h3>דוח שכר מפורט</h3><form class="form" data-form="report" style="margin-top:12px"><div class="two"><div class="field"><label for="rp-f">מתאריך</label><input id="rp-f" name="from" type="date" value="${f}" required></div><div class="field"><label for="rp-t">עד תאריך</label><input id="rp-t" name="to" type="date" value="${t}" required></div></div>
    <div class="field"><label for="rp-e">עובד</label><select id="rp-e" name="emp"><option value="">כל העובדים</option>${S.employees.map(e => `<option value="${e.id}" ${repCfg && repCfg.emp === e.id ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select></div>
    <button class="btn primary block">הפקת הדוח</button></form>`); }),
  'report-copy': () => copyText(reportText()),
  'report-csv': () => { const rows = [['עובד', 'מס׳ עובד', 'תאריך', 'כניסה', 'יציאה', 'שעות', 'שכר לשעה', 'שכר']];
    reportData().forEach(r => { r.sh.forEach(s => rows.push([r.e.name, r.e.num, new Date(s.start).toLocaleDateString('he-IL'), fmtT(s.start), s.end ? fmtT(s.end) : 'פתוחה', (dur(s)).toFixed(2), r.e.wage, (dur(s) * r.e.wage).toFixed(2)]));
      r.ex.forEach(x => rows.push([r.e.name, r.e.num, new Date(x.ts).toLocaleDateString('he-IL'), EXTRA[x.kind] || '', x.note || '', '', '', (+x.amount || 0).toFixed(2)]));
      rows.push([r.e.name, r.e.num, 'סה״כ שעות', '', '', r.h.toFixed(2), '', r.hp.toFixed(2)]); rows.push([r.e.name, r.e.num, 'סה״כ משלוחים', '', '', '', '', r.dl.toFixed(2)]); rows.push([r.e.name, r.e.num, 'סה״כ בונוסים', '', '', '', '', r.bn.toFixed(2)]); rows.push([r.e.name, r.e.num, 'סה״כ לתשלום', '', '', '', '', r.pay.toFixed(2)]); rows.push([]); });
    downloadCsv(`דוח-שכר-${repCfg.from}-עד-${repCfg.to}`, rows); },
  'sup-open': d => { supId = d.id; go('supplier'); },
  'sup-new': () => needMgr(() => sheet(`<h3>ספק חדש</h3>${supForm({})}`)),
  'sup-edit': d => needMgr(() => { const s = byId(S.suppliers, d.id); sheet(`<h3>עריכת ספק</h3>${supForm(s)}<button class="btn danger block" style="margin-top:10px" data-action="sup-del" data-id="${s.id}">מחיקת הספק</button>`); }),
  'sup-del': d => { const s = byId(S.suppliers, d.id); sheet(`<h3>למחוק את ${esc(s.name)}?</h3><p class="muted" style="margin-bottom:16px">הספק והמחירון שלו יימחקו. הזמנות קודמות יישארו.</p><div class="actions"><button class="btn" data-action="close">ביטול</button><button class="btn primary" data-action="sup-del-yes" data-id="${s.id}">מחיקה</button></div>`); },
  'sup-del-yes': d => needMgr(() => { S.suppliers = S.suppliers.filter(x => x.id !== d.id); save(); closeSheet(); go('suppliers', true); toast('הספק נמחק'); }),
  'sup-export': d => { const s = byId(S.suppliers, d.id); downloadCsv(`מחירון-${s.name}`, [['מוצר', 'מחיר מהספק', 'מע״מ', 'מחיר כולל מע״מ', 'מחיר מכירה (×1.5)'], ...(s.products || []).map(p => [p.name, (+p.price).toFixed(2), vatLabel(p), withVat(p).toFixed(2), sellPrice(p).toFixed(2)])]); },
  'prod-new': () => needMgr(() => sheet(`<h3>מוצר חדש</h3>${prodForm({})}`)),
  'prod-edit': d => needMgr(() => { const p = (byId(S.suppliers, supId).products || []).find(x => x.id === d.id); sheet(`<h3>עריכת מוצר</h3>${prodForm(p)}<button class="btn danger block" style="margin-top:10px" data-action="prod-del" data-id="${p.id}">מחיקת המוצר</button>`); }),
  'prod-del': d => needMgr(() => { const s = byId(S.suppliers, supId); s.products = (s.products || []).filter(p => p.id !== d.id); save(); closeSheet(); render(); toast('המוצר נמחק'); }),
  'order-new': d => needMgr(() => { const s = byId(S.suppliers, d.id);
    sheet(`<h3>הזמנה מ${esc(s.name)}</h3><p class="muted" style="margin-bottom:10px">ממלאים כמות רק במה שמזמינים.</p><form class="form" data-form="order" data-sup="${s.id}">
    <div class="list ord">${(s.products || []).map(p => `<div class="row"><div class="row-main"><div class="row-title">${esc(p.name)}</div><div class="row-sub num">${money(withVat(p))} כולל מע״מ</div></div><input class="ord-q" name="q_${p.id}" type="number" min="0" step="1" inputmode="numeric" placeholder="0" aria-label="כמות ${esc(p.name)}"></div>`).join('')}</div>
    <div class="field"><label for="or-n">הערות לספק</label><textarea id="or-n" name="note" placeholder="למשל: להביא עד יום שלישי"></textarea></div>
    <button class="btn primary block">שמירת ההזמנה</button></form>`); }),
  'order-open': d => needMgr(() => { const o = byId(S.orders, d.id); if (!o) return; const s = byId(S.suppliers, o.supplierId) || { name: 'ספק שנמחק' };
    sheet(`<h3>הזמנה מ${esc(s.name)}</h3><p class="muted">${fmtLong(o.ts)} · ${fmtT(o.ts)}</p>
    <div class="tbl-wrap" style="margin:10px 0"><table><thead><tr><th>מוצר</th><th>כמות</th><th class="l">כולל מע״מ</th></tr></thead><tbody>${(o.lines || []).map(l => `<tr><td>${esc(l.name)}</td><td>${l.qty}</td><td class="l">${money(withVat(l) * l.qty)}</td></tr>`).join('')}<tr class="tot"><td>סה״כ</td><td></td><td class="l">${money(orderTotal(o))}</td></tr></tbody></table></div>
    ${o.note ? `<p class="muted">הערות: ${esc(o.note)}</p>` : ''}
    <div class="seg-wrap" style="margin:10px 0">${Object.entries(ORDER_ST).map(([k, v]) => `<button class="seg ${o.status === k ? 'on' : ''}" data-action="order-st" data-id="${o.id}" data-st="${k}">${v[0]}</button>`).join('')}</div>
    <div class="actions"><button class="btn" data-action="order-copy" data-id="${o.id}">${ic('copy', 'sm')}העתקה</button><a class="btn" href="${waLink(s.phone, orderText(o))}" target="_blank" rel="noopener">${ic('share', 'sm')}וואטסאפ${s.phone ? ' לספק' : ''}</a><button class="btn" data-action="order-csv" data-id="${o.id}">${ic('down', 'sm')}קובץ לאקסל</button></div>
    <button class="btn danger block" style="margin-top:12px" data-action="order-del" data-id="${o.id}">מחיקת ההזמנה</button>`); }),
  'order-st': d => { const o = byId(S.orders, d.id); o.status = d.st; save(); render(); ACT['order-open']({ id: o.id }); },
  'order-copy': d => copyText(orderText(byId(S.orders, d.id))),
  'order-csv': d => { const o = byId(S.orders, d.id), s = byId(S.suppliers, o.supplierId) || { name: 'ספק' }; downloadCsv(`הזמנה-${s.name}-${dateKey(o.ts)}`, orderCsv(o)); },
  'order-del': d => needMgr(() => { S.orders = S.orders.filter(o => o.id !== d.id); save(); closeSheet(); render(); toast('ההזמנה נמחקה'); }),
  'avail-day': d => { const u = S.unavail.find(x => x.empId === session() && x.date === d.date);
    if (u) { S.unavail = S.unavail.filter(x => x !== u); save(); render(); toast('היום סומן כפנוי'); return; }
    sheet(`<h3>${fmtLong(new Date(d.date + 'T12:00'))}</h3><p class="muted" style="margin-bottom:12px">לסמן שאתה לא יכול לעבוד ביום הזה?</p><form class="form" data-form="avail" data-date="${d.date}"><div class="field"><label for="av-n">סיבה (לא חובה)</label><input id="av-n" name="note" placeholder="למשל: מבחן, אירוע משפחתי"></div><button class="btn primary block">סימון שאני לא יכול</button></form>`); },
  'item-new': d => needMgr(() => sheet(`<h3>פריט חדש</h3>${itemForm(d.cat)}`)),
  'emp-new': () => needMgr(() => sheet(`<h3>עובד חדש</h3><form class="form" data-form="emp" style="margin-top:12px">${empFields({}, 'em')}<button class="btn primary block">הוספת עובד</button></form>`)),
  'pin-sheet': () => needMgr(() => sheet(`<h3>שינוי סיסמת מנהל</h3>${pinForm()}`)),
  'pin-seen': d => { const n = byId(S.notifications, d.id); if (n) { n.seen = true; save(); } render(); },
  pin: async () => { if (store.isPermAdmin?.() && await store.enterManager()) { toast('מצב מנהל פעיל'); render(); } else openPin(); },
  key: d => pinKey(d.k),
  lock: async () => { await store.exitManager(); toast('יצאת ממצב מנהל'); render(); },
  close: closeSheet,
  'fill-login': d => { const p = document.getElementById('lg-p'), n = document.getElementById('lg-n'); if (p) p.value = fmtPhone(d.p); if (n) n.value = d.n; },
  account: () => {
    const e = cur(); sheet(`<div class="emp-head" style="margin-bottom:14px">${avatar(e, 'xl')}<div><h3>${esc(e.name)}</h3><div class="muted num">עובד מס׳ ${esc(e.num)} · <span class="ltr">${fmtPhone(e.phone)}</span></div><label class="link-btn">${ic('camera', 'sm')}${ePhoto(e.id) ? 'החלפת התמונה שלי' : 'הוספת תמונה שלי'}<input type="file" accept="image/*" data-emp-photo="${e.id}" hidden></label></div></div>
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
    <form class="form" data-form="req"><div class="field"><label for="rq-d">תאריך כניסה</label><input id="rq-d" name="date" type="date" max="${dateKey(Date.now())}" value="${dateKey(Date.now())}" required></div>
    <div class="two"><div class="field"><label for="rq-f">שעת כניסה</label><input id="rq-f" name="from" type="time" value="08:00" required></div><div class="field"><label for="rq-t">שעת יציאה</label><input id="rq-t" name="to" type="time" value="16:00" required></div></div>
    <div class="field"><label for="rq-e">תאריך יציאה</label><input id="rq-e" name="endDate" type="date" max="${dateKey(Date.now())}" value="${dateKey(Date.now())}" required><small>אם המשמרת נגמרה אחרי חצות, בוחרים כאן את היום שאחרי.</small></div>
    <div class="field"><label for="rq-n">הסבר קצר</label><textarea id="rq-n" name="note" placeholder="למשל: הטלפון נגמר לי בסוללה"></textarea></div>
    <button class="btn primary block">שליחה לאישור</button></form>`),
  'inv-tab': d => { if (d.tab === 'snacks' && !store.isManager() && !viewer) { openPin(() => { invTab = d.tab; render(); }); return; } invTab = d.tab; render(); },
  'inv-update': d => {
    const i = byId(S.inventory, d.id); const p = S.drinkUpdates.find(u => u.itemId === i.id && u.status === 'pending');
    const n = note(i.id);
    sheet(`${img(i.id) ? `<img class="item-photo" src="${img(i.id)}" alt="">` : ''}<h3>${esc(i.name)}</h3><p class="muted" style="margin-bottom:14px">כמות נוכחית במלאי: ${i.qty}${p ? ` · ממתין לאישור: ${p.to}` : ''}</p>
    <form class="form" data-form="inv" data-id="${i.id}"><div class="stepper"><button type="button" data-action="step" data-d="-1" aria-label="פחות">−</button><input id="iq" name="qty" type="number" min="0" value="${p ? p.to : i.qty}" aria-label="כמות חדשה"><button type="button" data-action="step" data-d="1" aria-label="יותר">+</button></div>
    <button class="btn primary block">${manager ? 'שמירה' : 'שליחה לאישור מנהל'}</button></form>
    ${manager ? `<div class="mgr-box"><div class="mgr-h">${ic('lock', 'sm')}למנהל בלבד</div>
      <form class="form" data-form="item-edit" data-id="${i.id}"><div class="field"><label for="ie-n">שם הפריט</label><input id="ie-n" name="name" required value="${esc(i.name)}"></div>
      <div class="two"><div class="field"><label for="ie-c">מחלקה</label><select id="ie-c" name="cat">${catOpts(i.cat, i.sub)}</select></div>
      <div class="field"><label for="ie-m">התראה מתחת ל-</label><input id="ie-m" name="min" type="number" min="0" value="${i.min}" required></div></div>
      <button class="btn block">שמירת פרטי הפריט</button></form>
      <div class="actions"><label class="btn sm">${ic('camera', 'sm')}${img(i.id) ? 'החלפת תמונה' : 'הוספת תמונה'}<input type="file" accept="image/*" data-img-for="${i.id}" hidden></label>
      ${img(i.id) ? `<button class="btn sm" data-action="img-del" data-id="${i.id}">הסרת התמונה</button>` : ''}</div>
      <form class="form" data-form="note" data-id="${i.id}"><div class="field"><label for="nt">הערות על הפריט</label><textarea id="nt" name="text" placeholder="למשל: ספק, מחיר קנייה, מתי להזמין">${esc(n ? n.text : '')}</textarea>
      ${n ? `<small>עודכן ע״י ${esc(emp(n.by).name)} · ${ago(n.ts)}</small>` : '<small>העובדים לא רואים את ההערות.</small>'}</div>
      <button class="btn block">שמירת הערה</button></form>
      <button class="btn danger block" data-action="item-del" data-id="${i.id}">מחיקת הפריט</button></div>` : ''}`);
  },
  'img-view': d => { const i = byId(S.inventory, d.id); if (!i || !img(d.id)) return; const ro = !manager && i.cat !== 'drinks'; sheet(`<img class="item-photo lg" src="${img(d.id)}" alt=""><h3>${esc(i.name)}</h3>${ro ? '' : `<div class="actions" style="margin-top:12px"><button class="btn block" data-action="inv-update" data-id="${d.id}">עדכון כמות</button></div>`}`); },
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
    const e = byId(S.employees, d.id); sheet(`<div class="emp-head">${avatar(e, 'xl')}<div><h3>עריכת עובד</h3><label class="link-btn">${ic('camera', 'sm')}${ePhoto(e.id) ? 'החלפת תמונה' : 'הוספת תמונה'}<input type="file" accept="image/*" data-emp-photo="${e.id}" hidden></label></div></div><form class="form" data-form="emp-edit" data-id="${e.id}" style="margin-top:12px">${empFields(e, 'ee')}<button class="btn primary block">שמירה</button></form>
    ${e.owner ? '' : e.id !== session() ? `<button class="btn danger block" style="margin-top:10px" data-action="emp-del" data-id="${e.id}">הסרת העובד</button>` : '<p class="hint" style="margin-top:10px">אי אפשר להסיר את המשתמש שמחובר כרגע.</p>'}`);
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
  extra: f => { S.extras.push({ id: uid(), empId: session(), ts: Date.now(), kind: 'delivery', note: (f.note || '').trim(), status: 'pending' }); save(); closeSheet(); render(); toast('נשלח למנהל לאישור'); },
  'extra-ok': (f, el) => { if (!manager) return openPin(); const x = byId(S.extras, el.dataset.id), a = parseFloat(f.amount); if (!x || !(a >= 0)) return toast('צריך סכום תקין');
    Object.assign(x, { status: 'approved', amount: Math.round(a * 100) / 100, kind: f.kind === 'bonus' ? 'bonus' : 'delivery', by: session(), at: Date.now() }); save(); render(); toast(`אושר ${EXTRA[x.kind]} של ${money(x.amount)}`); },
  'extra-direct': f => { if (!manager) return openPin(); const a = parseFloat(f.amount); if (!(a >= 0)) return toast('צריך סכום תקין');
    const ts = sameDay(new Date(f.date + 'T12:00').getTime(), Date.now()) ? Date.now() : new Date(f.date + 'T12:00').getTime();
    S.extras.push({ id: uid(), empId: f.emp, ts, kind: f.kind === 'bonus' ? 'bonus' : 'delivery', note: (f.note || '').trim(), status: 'approved', amount: Math.round(a * 100) / 100, by: session(), at: Date.now() });
    save(); closeSheet(); render(); toast('נוסף לשכר'); },
  reel: async (f, el) => {
    if (!pendingUpload) return toast('בחרו קובץ קודם'); if (leftToday(pendingUpload.type) <= 0) return toast('הגעת למכסה היומית');
    const caption = (f.caption || '').trim(), up = pendingUpload; busy = true; document.getElementById('up-go').disabled = true;
    const r = await store.uploadReel({ ...up.meta, caption, tags: pickedTags(caption), reactions: {} }, up.parts, p => setProg(p, `מעלה… ${Math.round(p * 100)}%`));
    busy = false; if (r.error) { document.getElementById('up-go').disabled = false; return toast(r.error); }
    pendingUpload = null; closeSheet(); go('reels'); window.scrollTo(0, 0); toast('פורסם! יימחק מהאפליקציה בעוד 72 שעות');
  },
  comment: (f, el) => {
    const text = (f.text || '').trim(); if (!text) return;
    S.reelComments.push({ id: uid(), reel: el.dataset.reel, by: session(), text, ts: Date.now(), parent: replyTo || null, tags: pickedTags(text) });
    save(); replyTo = null; mentionTags = new Map(); el.reset(); const b = document.getElementById('cm-reply'); if (b) b.hidden = true; refreshComments(); patchReels();
    const box = document.getElementById('cms'); if (box) box.scrollTop = box.scrollHeight;
  },
  viewer: async f => {
    const p = normPhone(f.phone), n = String(f.num).trim();
    if (!/^\d{10}$/.test(p) || !/^\d{1,6}$/.test(n)) return toast('טלפון בן 10 ספרות ומספר עובד עד 6 ספרות');
    if (S.employees.some(e => normPhone(e.phone) === p)) return toast('מספר הטלפון כבר שייך לעובד');
    const r = await store.setViewer(p, n); if (r.error) return toast(r.error); closeSheet(); render(); toast('משתמש הבקרה פעיל');
  },
  login: async f => {
    const p = normPhone(f.phone), n = String(f.num).trim();
    if (!/^05\d{8}$/.test(p) && p !== '0000000000' && !(S.viewerLogin && S.viewerLogin.phone === p)) return toast('הזינו מספר נייד בן 10 ספרות');
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
    const s = new Date(f.date + 'T' + f.from).getTime(), e = new Date((f.endDate || f.date) + 'T' + f.to).getTime();
    if (!(e > s)) return toast('היציאה חייבת להיות אחרי הכניסה. אם המשמרת נגמרה אחרי חצות, בחרו תאריך יציאה של היום שאחרי');
    if (e - s > 20 * H) return toast('משמרת של יותר מ-20 שעות. בדקו את התאריכים');
    if (e > Date.now()) return toast('אי אפשר לבקש שעות עתידיות');
    S.shifts.push({ id: uid(), empId: session(), start: s, end: e, status: 'pending', source: 'request', note: f.note.trim() });
    save(); closeSheet(); render(); toast('הבקשה נשלחה למנהל');
  },
  bulk: f => {
    if (!manager) return openPin(); const [cat, sub] = f.cat.split('|');
    const have = new Set(S.inventory.filter(i => i.cat === cat).map(i => i.name.trim()));
    const names = [...new Set(String(f.list || '').split(/\r?\n/).map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean))].filter(n => !have.has(n));
    names.forEach(name => S.inventory.push({ id: uid(), cat, sub: cat === 'drinks' ? sub : null, name, qty: 0, min: 0 }));
    save(); closeSheet(); invTab = cat; go('inv'); toast(`נוספו ${names.length} פריטים`);
  },
  report: f => { if (!f.from || !f.to || f.to < f.from) return toast('טווח התאריכים לא תקין'); repCfg = { from: f.from, to: f.to, emp: f.emp || '' }; closeSheet(); go('report'); },
  sup: (f, el) => {
    if (!manager) return openPin(); if (!f.name.trim()) return toast('צריך למלא שם ספק');
    const data = { name: f.name.trim(), phone: normPhone(f.phone), note: f.note.trim() };
    if (el.dataset.id) Object.assign(byId(S.suppliers, el.dataset.id), data); else { const s = { id: uid(), products: [], ...data }; S.suppliers.push(s); supId = s.id; }
    save(); closeSheet(); if (!el.dataset.id) go('supplier'); else render(); toast('הספק נשמר');
  },
  prod: (f, el) => {
    if (!manager) return openPin(); const s = byId(S.suppliers, supId); if (!s) return; const price = parseFloat(f.price);
    if (!f.name.trim() || !(price >= 0)) return toast('צריך שם ומחיר תקין');
    const data = { name: f.name.trim(), price: Math.round(price * 100) / 100, vatIncl: f.vat === 'incl' };
    s.products = s.products || [];
    if (el.dataset.id) Object.assign(s.products.find(p => p.id === el.dataset.id), data); else s.products.push({ id: uid(), ...data });
    save(); closeSheet(); render(); toast('המוצר נשמר');
  },
  order: (f, el) => {
    if (!manager) return openPin(); const s = byId(S.suppliers, el.dataset.sup);
    const lines = (s.products || []).map(p => ({ p, q: parseFloat(f['q_' + p.id]) || 0 })).filter(x => x.q > 0).map(({ p, q }) => ({ name: p.name, qty: q, price: p.price, vatIncl: !!p.vatIncl }));
    if (!lines.length) return toast('לא נבחרה כמות לאף מוצר');
    const o = { id: uid(), supplierId: s.id, ts: Date.now(), lines, note: (f.note || '').trim(), status: 'draft', by: session() };
    S.orders.push(o); save(); render(); ACT['order-open']({ id: o.id }); toast('ההזמנה נשמרה. אפשר לשלוח אותה לספק');
  },
  avail: (f, el) => {
    S.unavail.push({ id: uid(), empId: session(), date: el.dataset.date, note: (f.note || '').trim(), ts: Date.now() });
    S.notifications.push({ id: uid(), type: 'info', ts: Date.now(), text: `${cur().name} סימן/ה שלא יוכל/תוכל לעבוד ב${fmtLong(new Date(el.dataset.date + 'T12:00'))}${f.note.trim() ? ': ' + f.note.trim() : ''}` });
    save(); closeSheet(); render(); toast('סומן. המנהל יראה את זה בסידור');
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
  item: f => { const [cat, sub] = f.cat.split('|'); S.inventory.push({ id: uid(), cat, sub: sub || null, name: f.name.trim(), qty: +f.qty || 0, min: +f.min || 0 }); save(); closeSheet(); render(); toast('הפריט נוסף למלאי'); },
  'item-edit': (f, el) => {
    if (!manager) return openPin(); const i = byId(S.inventory, el.dataset.id); if (!i) return; const [cat, sub] = f.cat.split('|');
    if (!f.name.trim()) return toast('צריך למלא שם');
    Object.assign(i, { name: f.name.trim(), cat, sub: sub || null, min: Math.max(0, parseInt(f.min) || 0) });
    if (S.images[i.id]) S.images[i.id].cat = cat;
    save(); closeSheet(); render(); toast('פרטי הפריט נשמרו');
  },
  emp: f => {
    if (!manager) return openPin(); const err = validateEmp(f, null); if (err) return toast(err);
    S.employees.push({ id: uid(), num: String(f.num).trim(), name: f.name.trim(), phone: normPhone(f.phone), wage: parseFloat(f.wage), ...(f.admin && canSetFlags() ? { admin: true } : {}) });
    save(); closeSheet(); render(); toast(`${f.name.trim()} נוסף/ה. התחברות: ${fmtPhone(f.phone)} + מספר עובד ${String(f.num).trim()}`);
  },
  'emp-edit': (f, el) => {
    if (!manager) return openPin(); const e = byId(S.employees, el.dataset.id), err = validateEmp(f, e.id); if (err) return toast(err);
    const keepAdmin = (e.id === session() && e.admin) || e.owner || (!canSetFlags() && e.admin);
    Object.assign(e, { name: f.name.trim(), num: String(f.num).trim(), phone: normPhone(f.phone), wage: parseFloat(f.wage) });
    if (keepAdmin || (f.admin && canSetFlags())) e.admin = true; else delete e.admin;
    save(); closeSheet(); render(); toast('פרטי העובד נשמרו');
  },
  'pin-change': async f => {
    if (!manager) return openPin();
    if (!/^\d{4,6}$/.test(f.next)) return toast('הסיסמה החדשה צריכה להיות 4 עד 6 ספרות');
    if (f.next !== f.confirm) return toast('הסיסמה החדשה ואימות הסיסמה לא תואמים');
    const r = await store.changePin(f.old, f.next);
    if (r.error) return toast(r.error);
    closeSheet(); render(); toast('סיסמת המנהל עודכנה');
  },
  task: f => { S.tasks.push({ id: uid(), title: f.title.trim(), empId: f.emp, hours: parseFloat(f.hours) || 1, done: false, seen: false, ts: Date.now() }); save(); render(); toast(`המשימה נוספה. ${first(emp(f.emp).name)} יקבל/תקבל התראה`); }
};
const VIEW_OK = ['nav', 'back', 'close', 'inv-tab', 'range', 'sup-open', 'img-view', 'account', 'nav-close', 'logout', 'ds', 'ds-tog', 'ds-reset', 'reel-comments', 'reel-viewers', 'reel-tap', 'reel-open', 'order-open', 'inv-update', 'emp-edit', 'fill-login', 'step'];
document.addEventListener('click', e => { const b = e.target.closest('[data-action]'); if (!b) return; const a = ACT[b.dataset.action]; if (!a) return; e.preventDefault(); if (viewer && !VIEW_OK.includes(b.dataset.action)) return toast('משתמש בקרה · צפייה בלבד'); a(b.dataset, b); });
document.addEventListener('click', e => { if (viewer && e.target.closest('a.btn, input[type=file], label.btn')) { e.preventDefault(); toast('משתמש בקרה · צפייה בלבד'); } }, true);
document.addEventListener('submit', e => { const f = e.target.closest('form[data-form]'); if (!f) return; e.preventDefault(); if (busy) return; if (viewer && f.dataset.form !== 'login') return toast('משתמש בקרה · צפייה בלבד'); FORMS[f.dataset.form]?.(Object.fromEntries(new FormData(f)), f); });
document.addEventListener('input', e => { const r = e.target.closest('[data-ds-range]'); if (!r) return; DS[r.dataset.dsRange] = +r.value; applyDisplay(); const l = document.getElementById('scale-val'); if (l) l.textContent = r.value + '%'; });
document.addEventListener('change', e => { if (e.target.closest('[data-ds-range]')) saveDS(); if (e.target.closest('[data-calc]')) drawCalc(); });
document.addEventListener('change', e => { if (e.target.matches('[data-segpick]')) e.target.closest('.seg-wrap').querySelectorAll('label.seg').forEach(l => l.classList.toggle('on', l.querySelector('input').checked)); });
document.addEventListener('input', e => { if (e.target.closest('[data-calc]')) drawCalc(); if (e.target.matches('[data-mention]')) mentionInput(e.target); });
document.addEventListener('change', e => { if (e.target.matches('input[data-up]')) prepUpload(e.target); });
document.addEventListener('scroll', e => { const t = e.target; if (!t.classList || !t.classList.contains('rp-track')) return; const i = Math.round(Math.abs(t.scrollLeft) / t.clientWidth); t.parentElement.querySelectorAll('.rp-dots i').forEach((d, k) => d.classList.toggle('on', k === i)); }, true);
new MutationObserver(() => { if (document.getElementById('pr-calc') && !document.getElementById('pr-calc').innerHTML) drawCalc(); }).observe(document.getElementById('layer') || document.body, { childList: true, subtree: true });
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
document.addEventListener('change', async e => {
  const inp = e.target.closest('input[data-emp-photo]'); if (!inp || !inp.files || !inp.files[0]) return;
  const id = inp.dataset.empPhoto; if (id !== session() && !store.isManager()) return openPin();
  try { const data = await shrinkImage(inp.files[0], 240); S.empPhotos[id] = { data }; save(); closeSheet(); render(); toast('התמונה נשמרה'); }
  catch (err) { toast('לא הצלחתי לקרוא את התמונה. נסו תמונה אחרת'); }
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
  try { history.replaceState({ view, d: 0 }, ''); } catch (e) { }
  render();
  let lastCount = alerts().count;
  setInterval(() => { tick(); if (!session()) return; const c = alerts().count; if (c !== lastCount) { lastCount = c; renderNav(); } }, 1000);
})();
