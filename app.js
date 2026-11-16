import './style.css';
import { createStore } from './store.js';
import { BG_START, other, bgKey, turnInfo, applyMove, bgBest, bgWinner, pips, roll, createSnake } from './games.js';
import { shareFiles, download } from './share.js';
import { distM, geoOnce, geoStart, geoStop, geoWatching, geoBackground, geoSettings } from './geo.js';
import { AREAS, H, DAY, uid, pad, sum, dur, sod, sameDay, monthKey, prevMonthKey, dateKey, weekStart, normPhone, fmtPhone, buildSummary, hasSummary, barcodeBits, barcodeSvg } from './util.js';

const ROOT = document.documentElement; ROOT.lang = 'he'; ROOT.dir = 'rtl';
const LS_DISPLAY = 'dalpak-display';
const SUBS = ['שתייה', 'שתייה אמריקאי', 'בירות', 'שתייה גדולה'];
const CATS = { drinks: 'שתייה', snacks: 'חטיפים', salads: 'סלטים' };
let supId = null, orderId = null, repCfg = null;
let store, S, manager = false, view = 'clock', invTab = 'drinks', hoursRange = 'week', pinBuf = '', pinNext = null, pinBusy = false, pinFails = 0, toastT, booting = true, busy = false, monthChecked = false, renderPending = false;

/* ---------- display settings (per device) ---------- */
const ACC = {
  apple: { n: 'כחול אפל', l: ['#007AFF', '#E3EFFF'], d: ['#0A84FF', '#0B2547'] },
  brand: { n: 'שאבעס מרקט', l: ['#25528D', '#DCE5F2'], d: ['#86A9E0', '#1A2A47'] },
  petrol: { n: 'פטרול', l: ['#0D5C61', '#D6E8E7'], d: ['#55B5B1', '#17363A'] },
  navy: { n: 'כחול לילה', l: ['#1F3F7A', '#DCE4F3'], d: ['#83A6E8', '#1B2840'] },
  wine: { n: 'בורדו', l: ['#7A2335', '#F1DCE0'], d: ['#E28C9C', '#3A1D24'] },
  forest: { n: 'ירוק יער', l: ['#2F5D3A', '#DDEADF'], d: ['#7CC08D', '#1A3121'] },
  plum: { n: 'שזיף', l: ['#5B3A75', '#E7DEF0'], d: ['#BA9DD8', '#2B2238'] },
  graphite: { n: 'גרפיט', l: ['#2C3640', '#DFE3E7'], d: ['#B6C2CD', '#232C34'] }
};
const DS_DEFAULT = { theme: 'system', accent: 'apple', scale: 100, font: 'system', heading: 'same', density: 'normal', radius: 'normal', dial: 'normal', clock12: false, seconds: true, showPay: true, contrast: false, motion: true, invSort: 'name', lowHi: true, home: 'clock', dateStyle: 'short' };
let DS = { ...DS_DEFAULT };
try { DS = { ...DS_DEFAULT, ...JSON.parse(localStorage.getItem(LS_DISPLAY) || '{}') }; } catch (e) { }
// Phones that kept the old default colour switch to the store colours once.
if ((DS.v || 0) < 3) { if (DS.accent === 'petrol' || DS.accent === 'brand') DS.accent = 'apple'; if (DS.font === 'Assistant') DS.font = 'system'; if (DS.heading === 'serif') DS.heading = 'same'; DS.v = 3; try { localStorage.setItem(LS_DISPLAY, JSON.stringify(DS)); } catch (e) { } }
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
  // "system" = Apple's San Francisco on iPhone and Mac, the phone's own font elsewhere (Hebrew falls back to Assistant).
  const body = DS.font === 'system' ? "-apple-system,BlinkMacSystemFont,'SF Pro Text',system-ui,'Segoe UI',Roboto,'Assistant',sans-serif" : `'${DS.font}','Segoe UI',Arial,sans-serif`;
  st.setProperty('--f-body', body);
  st.setProperty('--f-display', DS.heading === 'serif' ? "'Frank Ruhl Libre','David','Times New Roman',serif" : DS.font === 'system' ? "-apple-system,BlinkMacSystemFont,'SF Pro Display',system-ui,'Segoe UI',Roboto,'Assistant',sans-serif" : body);
  const D = { comfy: ['17px', '22px'], normal: ['13px', '18px'], compact: ['8px', '12px'] }[DS.density] || ['13px', '18px'];
  st.setProperty('--rowpad', D[0]); st.setProperty('--gap', D[1]);
  const R = { sharp: ['6px', '6px'], normal: ['16px', '11px'], round: ['24px', '18px'] }[DS.radius] || ['16px', '11px'];
  st.setProperty('--r', R[0]); st.setProperty('--rb', R[1]);
  st.setProperty('--dial', { small: '190px', normal: '236px', large: '290px' }[DS.dial] || '236px');
  ROOT.classList.toggle('no-motion', !DS.motion);
  const meta = document.querySelector('meta[name=theme-color]'); if (meta) meta.content = dark ? '#000000' : '#F2F2F7';
}
mq.addEventListener && mq.addEventListener('change', () => { applyDisplay(); if (view === 'display') render(); });
new MutationObserver(() => {
  if (DS.theme === 'system') { const v = ROOT.getAttribute('data-theme'); if (v !== hostTheme) { hostTheme = v; applyDisplay(); if (view === 'display') render(); } }
}).observe(ROOT, { attributes: true, attributeFilter: ['data-theme'] });

let viewer = false;
// The "חדשות מרקט" account: it can only post reels and sees nothing else in the app.
let poster = false;
const NEWS = { id: 'news', name: 'חדשות מרקט', num: '', phone: '', wage: 0 };
const POSTER_OK = ['reel-share', 'sync-info', 'cap-more', 'nav', 'close', 'account', 'nav-close', 'logout', 'ds', 'ds-tog', 'ds-reset', 'reel-new', 'reel-type', 'reel-tap', 'reel-sound', 'reel-del', 'reel-del-yes', 'reel-viewers', 'reel-comments', 'reel-open', 'mention-pick', 'fill-login', 'step'];
const P = { clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', box: '<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5 12 12l9-4.5M12 12v9"/>', truck: '<path d="M2 6h11v10H2zM13 9h4.5l3.5 4v3h-8"/><circle cx="6" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>', bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>', menu: '<path d="M4 6h16M4 12h16M4 18h16"/>', lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>', unlock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.6-1.8"/>', check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>', plus: '<path d="M12 5v14M5 12h14"/>', chev: '<path d="m15 6-6 6 6 6"/>', chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>', task: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8 12 3 3 5-6"/>', cog: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>', user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>', alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.5"/>', eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>', out: '<path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10"/>', phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>' };
P.play = '<path d="M8 5v14l11-7z"/>';
P.tag = '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/>';
P.x = '<path d="M6 6l12 12M18 6 6 18"/>';
P.camera = '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>';
P.scale = '<path d="M12 3v18M7 21h10M5 7h14M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z"/>';
P.coin = '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5c0-1 1-1.8 2.5-1.8s2.5.8 2.5 1.9c0 2.6-5 1.4-5 4.2 0 1.1 1.1 1.9 2.5 1.9s2.5-.8 2.5-1.8M12 6.2v1.5M12 16.2v1.6"/>';
P.pin = '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>';
P.send = '<path d="M21 3 10 14"/><path d="M21 3l-7 18-4-7-7-4z"/>';
P.scan = '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/><path d="M8 8v8M11 8v8M14 8v8M17 8v8"/>';
P.users = '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>';
P.cart = '<path d="M3 4h2l2.2 10.5h10.6L20 7H6.2"/><circle cx="9" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/>';
P.cal = '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>';
P.trash = '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>';
P.copy = '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>';
P.down = '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>';
P.fun = '<path d="M7 8h10a4.5 4.5 0 0 1 4.4 5.5l-.9 3.8a2.4 2.4 0 0 1-4.2.9L14.5 16h-5l-1.8 2.2a2.4 2.4 0 0 1-4.2-.9l-.9-3.8A4.5 4.5 0 0 1 7 8z"/><path d="M8 10.8v3.4M6.3 12.5h3.4"/><circle cx="15.6" cy="11.6" r=".9"/><circle cx="17.6" cy="13.6" r=".9"/>';
P.image = '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="m21 15.5-5-5-9 8.5"/>';
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
const emp = id => id === 'news' ? NEWS : S.employees.find(e => e.id === id) || (S.names && S.names[id] ? { id, name: S.names[id], wage: 0, num: '', phone: '' } : { name: 'עובד', wage: 50, num: '', phone: '' });
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
/* ---------- permissions: each employee has a level in each area: none, view or edit ---------- */
const lvl = a => viewer ? 'view' : store && store.perm ? store.perm(a) : 'none';
const canV = a => lvl(a) !== 'none', canE = a => !viewer && lvl(a) === 'edit';
// The area each screen belongs to. Clock, inventory, deliveries and reels are open to everyone; there the area
// decides only the extra, manager parts.
const AREA_OF = { pos: 'pos', products: 'products', orders: 'orders', suppliers: 'orders', supplier: 'orders', hours: 'hours', tasks: 'tasks', staff: 'staff', admin: 'admin', report: 'admin', geo: 'admin', avail: 'hours', clock: 'hours', inv: 'inv', deliv: 'deliv', reels: 'admin' };
// Screens that need a permission to open; with "view" they open read-only.
const RO_VIEWS = ['pos', 'products', 'orders', 'suppliers', 'supplier', 'hours', 'tasks', 'staff', 'admin', 'report', 'geo'];
let ro = false, invAll = false;
const PERM_INFO = {
  pos: ['קופה', 'צפייה: רואה חשבונות · עריכה: מוכר בקופה'],
  products: ['מוצרים, ברקודים ומחירים', ''],
  inv: ['מלאי', 'אין: רק שתייה וסלטים · צפייה: כל המלאי · עריכה: משנה כמויות ומאשר עדכונים'],
  deliv: ['אספקה', 'כולם רואים ומסמנים שהגיע · עריכה: מוסיף ומוחק אספקות'],
  orders: ['ספקים והזמנות', ''],
  hours: ['שעות, משמרות ושכר של כולם', 'עריכה: מאשר שעות, סוגר משמרות ומאשר משלוחים'],
  tasks: ['משימות וציונים לעובדים', ''],
  staff: ['עובדים והרשאות', 'עריכה: מאשר עובדים חדשים וקובע הרשאות'],
  admin: ['ניהול חנות והגדרות', 'מיקום החנות, דוחות, ניהול רילסים'],
  reels: ['רילסים', 'צפייה: רק צופה · עריכה: גם מעלה'],
  chat: ['הודעות', '']
};
// Levels each area offers (some areas are open to everyone at the basic level).
const PERM_LEVELS = a => a === 'chat' || a === 'deliv' ? ['none', 'edit'] : a === 'reels' ? ['view', 'edit'] : ['none', 'view', 'edit'];
const LEVEL_TXT = { none: 'אין', view: 'צפייה', edit: 'עריכה' };
const PRESETS = {
  basic: ['עובד', { reels: 'edit', chat: 'edit' }],
  shift: ['אחראי משמרת', { reels: 'edit', chat: 'edit', pos: 'edit', inv: 'edit', deliv: 'edit', products: 'view', hours: 'view', tasks: 'edit' }],
  full: ['מנהל מלא', Object.fromEntries(AREAS.map(a => [a, 'edit']))]
};
const memOf = id => (S.members || []).find(m => m.empId === id);
const canSetFlags = () => !!store.isOwner?.() || canE('staff');
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
  if (monthChecked || !canE('hours') || !store.loaded('employees', 'shifts', 'notifications')) return;
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
  const hv = canV('hours'), iv = canV('inv'), joins = canV('staff') ? (S.signups || []) : [];
  return { long, reqs, drinks, pins, ext, joins, count: (hv ? long.length + reqs.length + pins.length + ext.length : 0) + (iv ? drinks.length : 0) + joins.length };
}

/* ---------- shell ---------- */
const MORE_VIEWS = ['pos', 'products', 'hours', 'tasks', 'admin', 'staff', 'display', 'suppliers', 'supplier', 'orders', 'report', 'avail'];
const MGR_VIEWS = ['pos', 'products', 'hours', 'tasks', 'admin', 'staff', 'suppliers', 'supplier', 'orders', 'report', 'geo'];
function tabPill() {
  const nav = document.getElementById('nav'); if (!nav || document.getElementById('navbar').hidden) return;
  let p = nav.querySelector('.tab-pill'); if (!p) { p = document.createElement('span'); p.className = 'tab-pill'; p.setAttribute('aria-hidden', 'true'); nav.prepend(p); }
  slidePill(nav, p, nav.querySelector('.tab.on'), 'tabs');
}
function renderNav() {
  const nav = document.getElementById('navbar'); nav.hidden = !session(); if (!session()) return;
  if (poster) { document.getElementById('nav').innerHTML = `<button class="tab on" data-action="nav" data-view="reels">${ic('play')}רילס</button><button class="tab" data-action="logout">${ic('out')}יציאה</button>`; tabPill(); return; }
  const n = (viewer ? 0 : alerts().count) + newTasks().length + newMentions().length + newActivity().length;
  // The bell is there for everyone: employees see their own tasks, managers also see approvals.
  const tabs = [['clock', 'שעון', 'clock'], ['inv', 'מלאי', 'box'], ['deliv', 'אספקה', 'truck'], ['reels', 'רילס', 'play'], ...(funOk() ? [['fun', 'פנאי', 'fun']] : []), ['more', 'עוד', 'menu']];
  const fb = funOk() ? bgWaiting() : 0;
  document.getElementById('nav').innerHTML = tabs.map(([v, l, i]) => `<button class="tab ${view === v || (v === 'more' && MORE_VIEWS.includes(view)) || (v === 'fun' && FUN_VIEWS.includes(view)) ? 'on' : ''}" data-action="nav" data-view="${v}">${ic(i)}${l}${v === 'fun' && fb ? `<span class="badge">${fb}</span>` : ''}</button>`).join('');
  tabPill();
  const hb = document.getElementById('hbadge'); if (hb) { hb.textContent = n; hb.hidden = !n; }
  const hc = document.getElementById('hcbadge'); if (hc) { const u = unreadCount(); hc.textContent = u; hc.hidden = !u; }
  const bb = document.getElementById('hbell'); if (bb) bb.classList.toggle('on', view === 'alerts');
}
/* ---------- how fresh the data is ---------- */
const whenTxt = ts => !ts ? 'עוד לא התעדכנו' : (dateKey(ts) === dateKey(Date.now()) ? 'היום ב-' : new Date(ts).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' }) + ' ב-') + fmtT(ts);
function syncNow() {
  const s = store && store.syncInfo ? store.syncInfo() : null; if (!s) return null;
  if (local()) return { cls: 'ok', chip: '', line: 'גרסת דמו: הנתונים שמורים בטלפון הזה ותמיד מעודכנים' };
  if (s.state === 'connecting') return { cls: 'wait', chip: '', line: 'מתחבר לשרת…' };
  if (s.state === 'live') return s.pending ? { cls: 'wait', chip: 'שולח…', line: 'שולח שינויים לשרת…' } : { cls: 'ok', chip: '', line: `הנתונים מעודכנים · מחובר לשרת (${fmtT(Date.now())})` };
  return { cls: 'bad', chip: 'לא מחובר', line: `אין חיבור לשרת · עודכן לאחרונה ${whenTxt(s.last)}${s.pending ? ' · יש שינויים שיישלחו כשהחיבור יחזור' : ''}` };
}
let syncShown = '';
function updateSync() {
  const t = syncNow(); if (!t) return;
  const key = t.cls + t.chip + t.line; if (key === syncShown && document.getElementById('sync-line')?.dataset.k === key) return; syncShown = key;
  const c = document.getElementById('sync-chip');
  if (c) { c.hidden = !t.chip; c.className = 'chip sync-chip ' + t.cls; c.querySelector('.st').textContent = t.chip; }
  const l = document.getElementById('sync-line');
  if (l) { l.dataset.k = key; l.className = 'sync-line ' + t.cls; l.querySelector('span').textContent = t.line; }
}
window.addEventListener('online', () => setTimeout(updateSync, 300));
window.addEventListener('offline', () => setTimeout(updateSync, 300));

function render() {
  renderPending = false;
  if (!store) return;
  S = store.S; viewer = !!store.isViewer?.(); poster = !!store.isPoster?.();
  // "manager" = may see the manager parts of the current screen; "ro" = only to look at them.
  const A = AREA_OF[view];
  manager = !poster && (viewer || (view === 'alerts' ? canV('hours') || canV('inv') || canV('staff')
    : view === 'inv' || view === 'deliv' || view === 'reels' ? canE(A) : A ? canV(A) : !!store.isManager()));
  ro = !viewer && !poster && RO_VIEWS.includes(view) && lvl(A) === 'view';
  invAll = !poster && canV('inv');
  if ((view === 'chat' || view === 'dm') && !viewer && !poster && lvl('chat') === 'none') view = 'clock';
  document.body.classList.toggle('is-viewer', viewer); document.body.classList.toggle('is-poster', poster);
  if (poster && session() && view !== 'display') view = 'reels';
  const brand = `<div class="brand"><img class="mark" src="./logo.png" alt=""><div><b>שאבעס מרקט</b><small>ניהול חנות${local() ? ' · גרסת דמו' : ''}</small></div></div>`;
  const hdr = document.getElementById('hdr'), main = document.getElementById('main');
  if (booting) { hdr.innerHTML = brand; main.innerHTML = `<div class="view"><div class="lock"><p class="muted">טוען נתונים…</p></div></div>`; renderNav(); return; }
  if (!session()) {
    hdr.innerHTML = brand + `<div class="top-actions"><button class="chip" data-action="nav" data-view="display">${ic('eye', 'sm')}תצוגה</button></div>`;
    main.innerHTML = `<div class="view">${view === 'display' ? vDisplay() : store.pending && store.pending() ? vPending() : vLogin()}</div>`;
    renderNav(); return;
  }
  checkMonthly();
  const me = cur();
  const chatBtn = viewer || lvl('chat') === 'none' ? '' : `<button class="hbell ${view === 'chat' || view === 'dm' ? 'on' : ''}" id="hchat" data-action="nav" data-view="chat" aria-label="הודעות">${ic('send')}<span class="badge" id="hcbadge" hidden></span></button>`;
  const bell = chatBtn + `<button class="hbell ${view === 'alerts' ? 'on' : ''}" id="hbell" data-action="nav" data-view="alerts" aria-label="התראות">${ic('bell')}<span class="badge" id="hbadge" hidden></span></button>`;
  if ((viewer || poster) && (view === 'chat' || view === 'dm' || view === 'notif')) view = poster ? 'reels' : 'clock';
  if (view === 'dm' && !chatWith) view = 'chat';
  hdr.innerHTML = (poster ? brand : brand.replace(/<\/div>$/, bell + '</div>')) + `
    <div class="top-actions">
      <button class="chip sync-chip" id="sync-chip" data-action="sync-info" hidden>${ic('alert', 'sm')}<span class="st"></span></button>
      ${viewer ? `<span class="chip">${ic('eye', 'sm')}<span class="cl">צפייה בלבד</span></span>` : ro ? `<span class="chip">${ic('eye', 'sm')}<span class="cl">צפייה</span></span>` : ''}
      <button class="chip" data-action="account" aria-label="${esc(me.name)}">${avatar(me)}<span class="cl">${esc(first(me.name))}</span></button>
    </div>`;
  if (!manager && MGR_VIEWS.includes(view)) view = 'clock';
  if (FUN_VIEWS.includes(view) && !funOk()) view = 'clock';
  if (view !== 'snake' && snakeG) { snakeG.destroy(); snakeG = null; }
  if (!invAll && (invTab === 'snacks' || invTab === 'all')) invTab = 'drinks';
  const V = { clock: vClock, inv: vInv, deliv: vDeliv, alerts: vAlerts, more: vMore, hours: vHours, tasks: vTasks, admin: vAdmin, staff: vStaff, display: vDisplay, suppliers: vSuppliers, supplier: vSupplier, orders: vOrders, products: vProducts, pos: vPos, notif: vNotif, geo: vGeo, chat: vChat, dm: vDm, report: vReport, avail: vAvail, reels: vReels, fun: vFun, gallery: vGallery, snake: vSnake, bg: vBg };
  main.innerHTML = `<div class="view ${view === 'reels' ? 'view-reels' : ''}">${(V[view] || vClock)()}</div>`;
  renderNav(); tick(); watchReels(); cleanReels(); watchMore(); if (view === 'snake') mountSnake(); syncShown = ''; updateSync();
  slideSegs(main); const dir = navDir; navDir = null; animateView(dir);
  if (view === 'dm') { fitCompose(); markRead(); scrollDmEnd(); }
  if (view !== 'pos' && scanStop && !layerOpen()) { scanStop(); scanStop = null; }
  if (view !== 'pos' && !layerOpen()) camOff();
  geoSync();
}
// Data from other phones arrives at any moment; wait while someone is typing or a sheet is open.
function softRender() {
  const a = document.activeElement;
  const typing = a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && !a.classList.contains('rv-seek');
  if (document.querySelector('form[data-form=comment]')) refreshComments();
  // In a conversation, new messages appear in place so the half-typed message stays.
  if (view === 'dm' && !document.querySelector('.sheet')) { patchDm(); renderNav(); return; }
  // Games keep running: only the score table or the board is updated.
  if (view === 'snake') { updSnakeBoard(); renderNav(); return; }
  if (view === 'bg' && !document.querySelector('.sheet')) return patchBg();
  if (typing || document.querySelector('.sheet')) { renderPending = true; renderNav(); return; }
  if (view === 'reels') return patchReels();
  render();
}
document.addEventListener('focusout', () => setTimeout(() => { if (renderPending && !document.querySelector('.sheet')) { const a = document.activeElement; if (!a || !/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) render(); } }, 50));

const locked = (t, s) => `<div class="lock"><div class="lk">${ic('lock')}</div><h4>${t}</h4><p class="muted">${s || 'אין לך הרשאה לאזור הזה. אפשר לבקש מהמנהל.'}</p></div>`;
const back = (to, label) => `<button class="link-btn" data-action="back" data-view="${to || (session() ? 'more' : 'login')}">${ic('chev', 'sm')}<span>${label || (session() ? 'חזרה לתפריט' : 'חזרה להתחברות')}</span></button>`;

/* ---------- login & first-time setup ---------- */
// Employees sign in with Google; the viewer and poster accounts still use a phone number + number.
let sharedLogin = false;
function vLogin() {
  const err = store.googleError && store.googleError();
  const phoneForm = `<form class="form" data-form="login">
      <div class="field"><label for="lg-p">מספר טלפון</label><input id="lg-p" class="phone-in" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="050-000-0000" required></div>
      <div class="field"><label for="lg-n">מספר עובד</label><input id="lg-n" class="phone-in" name="num" inputmode="numeric" autocomplete="off" placeholder="101" required></div>
      <button class="btn primary block" ${busy ? 'disabled' : ''}>${busy ? 'מתחבר…' : 'כניסה'}</button></form>`;
  return `<div class="login">
    <img class="mark" src="./logo.png" alt="שאבעס מרקט">
    <h2>ברוכים הבאים לשאבעס מרקט</h2>
    ${local() ? `<p class="lead">בגרסת ההדגמה מתחברים עם מספר הטלפון ומספר העובד.</p>${phoneForm}` : `
    <p class="lead">נכנסים עם חשבון ה-Google שלכם. בפעם הראשונה המנהל צריך לאשר אתכם.</p>
    ${err ? `<p class="g-err">${esc(err)}</p>` : ''}
    <button class="btn primary block g-login" data-action="g-login" ${busy ? 'disabled' : ''}>${ic('user', 'sm')}${busy ? 'מתחבר…' : 'כניסה עם Google'}</button>
    ${sharedLogin ? `<h3 class="sec">משתמש בקרה או חדשות מרקט</h3>${phoneForm}` : `<button class="link-btn shared-link" data-action="shared-login">כניסה למשתמש בקרה או לחדשות מרקט</button>`}`}
    ${local() ? `<div class="demo-box"><b>עובדי הדמו · לחיצה ממלאת את הפרטים</b><div class="demo-phones">${S.employees.map(e => `<button data-action="fill-login" data-p="${esc(e.phone)}" data-n="${esc(e.num)}">${esc(first(e.name))} · <span class="ltr">${fmtPhone(e.phone)}</span> · ${esc(e.num)}</button>`).join('')}</div></div>` : ''}
  </div>`;
}
// Signed in with Google, waiting for a manager to approve the account.
function vPending() {
  const p = store.pending();
  return `<div class="login">
    <img class="mark" src="./logo.png" alt="שאבעס מרקט">
    <h2>ממתין לאישור מנהל</h2>
    <p class="lead">נכנסת עם <b class="ltr">${esc(p.email)}</b>. שלחנו למנהל בקשה לאשר אותך. ברגע שיאשר, האפליקציה תיפתח כאן לבד.</p>
    <div class="wait-dots" aria-hidden="true"><i></i><i></i><i></i></div>
    <button class="btn block" data-action="logout">כניסה עם חשבון אחר</button>
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
  return pushCard() + `
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
  ${open ? geoBanner(open) : ''}
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
let invQ = '', invShown = 80;
// Search by name, barcode or the till's item code. An exact item code comes first, then codes that start with it.
const prodHit = (p, q) => !q || normName(p.name).includes(q) || p.barcode.includes(q) || (p.code && p.code.toLowerCase().startsWith(q));
const codeRank = (p, q) => !q || !p.code ? 2 : p.code.toLowerCase() === q ? 0 : p.code.toLowerCase().startsWith(q) ? 1 : 2;
function invAllList() { const q = normName(invQ); return allProducts().filter(p => prodHit(p, q)).sort((a, b) => (codeRank(a, q) - codeRank(b, q)) || a.name.localeCompare(b.name, 'he')); }
// Long lists grow by themselves while scrolling: a marker at the end loads the next part when it comes near.
const moreMark = (kind, left) => `<div class="more-sent" data-more="${kind}"><span class="spin-sm" aria-hidden="true"></span>טוען עוד ${left.toLocaleString('he-IL')} מוצרים…</div>`;
let moreObs = null;
function watchMore() {
  if (!('IntersectionObserver' in window)) return;
  if (!moreObs) moreObs = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return; moreObs.unobserve(e.target);
    if (e.target.dataset.more === 'prod') { prodShown += 60; refreshProds(); }
    else { invShown += 120; const b = document.getElementById('inv-all'); if (b) b.innerHTML = invAllHtml(); watchMore(); }
  }), { rootMargin: '900px 0px' });
  document.querySelectorAll('.more-sent').forEach(el => moreObs.observe(el));
}
function invAllHtml() {
  const list = invAllList();
  return list.slice(0, invShown).map(p => { const s = sellOf(p); return `<div class="row tap" data-action="prod-open" data-k="${p.key}">${p.barcode ? '' : '<span class="nobc-dot" aria-label="אין ברקוד"></span>'}<div class="row-main"><div class="row-title">${esc(p.name)}</div><div class="row-sub">${p.code ? `<span class="num">קוד ${esc(p.code)}</span>` : ''}<span>${esc(p.dept)}</span>${s ? `<span>${money(s.v)}</span>` : ''}${p.barcode ? '' : '<span class="nobc-t">אין ברקוד</span>'}</div></div><div class="qty">${p.qty != null ? p.qty : '—'}<small>${esc(p.unit)}</small></div></div>`; }).join('')
    + (list.length > invShown ? moreMark('inv', list.length - invShown) : '') || '<div class="row muted">לא נמצאו מוצרים.</div>';
}
function vInv() {
  const segs = [...Object.entries(CATS), ...(invAll ? [['all', 'כל המוצרים']] : [])].filter(([k]) => invAll || k !== 'snacks').map(([k, l]) => `<button class="seg ${invTab === k ? 'on' : ''}" data-action="inv-tab" data-tab="${k}">${l}</button>`).join('');
  if (invTab === 'all' && invAll) return `<h2 class="vt">מלאי</h2><div class="seg-wrap">${segs}</div>
  <div class="field"><input type="search" placeholder="חיפוש לפי שם, ברקוד או קוד פריט" value="${esc(invQ)}" data-inv-q aria-label="חיפוש מוצר"></div>
  <p class="muted" style="margin:0 0 8px">כל המוצרים בחנות, כולל אלה שיובאו מהקופה. <span class="nobc-t">●</span> = אין ברקוד. לחיצה על מוצר פותחת ברקוד, מחירים וכמות.</p>
  <div class="list" id="inv-all">${invAllHtml()}</div>`;
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
  const low = S.inventory.filter(i => (invAll || i.cat === 'drinks') && isLow(i)).length;
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
  const it = (v, i, l) => `<button class="menu-item" data-action="nav" data-view="${v}">${ic(i)}<span class="grow">${l}</span>${ro && false ? '' : ''}${ic('chev', 'sm chev')}</button>`;
  const mgmt = [['pos', 'scan', 'קופה'], ['products', 'tag', 'מוצרים, ברקודים ומחירים'], ['orders', 'cart', 'הזמנות מספקים'], ['hours', 'chart', 'שעות עובדים ושכר'], ['tasks', 'task', 'משימות וציונים'], ['staff', 'users', 'עובדים והרשאות'], ['geo', 'pin', 'מיקום החנות וסגירת משמרת'], ['admin', 'cog', 'ניהול חנות']].filter(([v]) => canV(AREA_OF[v]));
  return `<h2 class="vt">תפריט</h2>
  <button class="sync-line" id="sync-line" data-action="sync-info"><i class="pp-dot"></i><span></span></button>
  ${mgmt.length ? `<div class="list">${mgmt.map(([v, i, l]) => it(v, i, l)).join('')}</div>` : ''}
  <div class="list">${it('avail', 'cal', canV('hours') ? 'אילוצים של עובדים למשמרות' : 'ימים שאני לא יכול לעבוד')}${it('display', 'eye', 'הגדרות תצוגה')}
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
  <div class="list">${rows.map(r => `<div class="row tap" data-action="emp-shifts" data-id="${r.e.id}"><div class="row-main"><div class="row-title">${esc(r.e.name)} ${r.e.num ? `<span class="muted num">#${esc(r.e.num)}</span>` : ''} ${r.open ? '<span class="pill ok">במשמרת</span>' : ''}</div>
    <div class="row-sub num">${r.sh.length} משמרות · ${fmtH(r.h)} ש׳ · ${money(r.e.wage)} לשעה${r.dl ? ` · משלוחים ${money(r.dl)}` : ''}${r.bn ? ` · בונוסים ${money(r.bn)}` : ''}</div>
    ${hoursRange === 'week' ? `<div class="row-sub num">${days.map(d => { const x = sum(r.sh.filter(s => sameDay(s.start, d)).map(dur)); return `<span class="pill ${x ? 'acc' : ''}">${new Date(d).toLocaleDateString('he-IL', { weekday: 'narrow' })} ${x ? fmtH(x) : '–'}</span>`; }).join('')}</div>` : ''}</div>
    <div class="num" style="font-weight:700">${money(r.pay)}</div></div>`).join('')}</div>
  <p class="lead">כולל משמרות פתוחות עד לרגע זה. בקשות שעדיין ממתינות לאישור לא נספרות.</p>
  <div class="actions"><button class="btn primary" data-action="report-new">${ic('chart', 'sm')}דוח שכר מפורט</button><button class="btn" data-action="extra-add">${ic('plus', 'sm')}הוספת משלוח או בונוס</button></div>`;
}

// Star rating in half steps. Each star has two tap zones: the left half gives n−½, the right half n.
const STAR = '<path d="M12 2.6l2.85 6.03 6.6.78-4.88 4.53 1.3 6.53L12 17.2l-5.87 3.27 1.3-6.53L2.55 9.41l6.6-.78z"/>';
function starsHtml(val, act, id, label = '') {
  return `<div class="stars2" ${act ? `role="group" aria-label="${esc(label || 'דירוג')}"` : `aria-label="${val} מתוך 5 כוכבים"`}>${[1, 2, 3, 4, 5].map(n => {
    const f = val >= n ? 100 : val >= n - 0.5 ? 50 : 0;
    return `<span class="st" style="--f:${f}%"><svg viewBox="0 0 24 24" aria-hidden="true">${STAR}</svg><span class="st-fill"><svg viewBox="0 0 24 24" aria-hidden="true">${STAR}</svg></span>${act ? `<button class="st-h st-l" data-action="${act}" data-id="${id}" data-v="${n - 0.5}" aria-label="${n - 0.5} כוכבים"></button><button class="st-h st-r" data-action="${act}" data-id="${id}" data-v="${n}" aria-label="${n} כוכבים"></button>` : ''}</span>`;
  }).join('')}</div>`;
}
const fmtStar = v => (Math.round(v * 10) / 10).toLocaleString('he-IL', { maximumFractionDigits: 1 });
// An employee's average over the tasks that were rated.
function empRating(id) { const r = S.tasks.filter(t => t.empId === id && t.rating > 0); return { n: r.length, avg: r.length ? sum(r.map(t => t.rating)) / r.length : 0 }; }
function vTasks() {
  if (!manager) return back() + `<h2 class="vt">משימות וציונים</h2>` + locked('משימות וציונים');
  const opts = S.employees.map(e => `<option value="${e.id}">${esc(e.name)}</option>`).join('');
  return back() + `<h2 class="vt">משימות וציונים</h2>
  <h3 class="sec">משימות</h3>
  <div class="list">${S.tasks.map(t => `<div class="row ${t.done ? 'done' : ''}"><button class="check ${t.done ? 'on' : ''}" data-action="task-toggle" data-id="${t.id}" aria-label="סימון כבוצע">${t.done ? ic('check', 'sm') : ''}</button>
    <div class="row-main"><div class="row-title">${esc(t.title)}</div><div class="row-sub num">${esc(emp(t.empId).name)} · ${fmtH(t.hours)} ש׳${t.done ? ' · בוצע' : t.seen ? ' · העובד ראה' : ' · טרם נצפתה'}</div>
      <div class="task-rate">${starsHtml(t.rating || 0, 'task-rate', t.id, 'דירוג המשימה')}${t.rating ? `<b class="num">${fmtStar(t.rating)}</b><button class="link-btn" data-action="task-unrate" data-id="${t.id}">ניקוי</button>` : '<span class="muted">דירוג</span>'}</div></div>
    <button class="btn sm danger" data-action="task-del" data-id="${t.id}">מחיקה</button></div>`).join('') || '<div class="row muted">אין משימות.</div>'}</div>
  <form class="card form" data-form="task"><b>משימה חדשה</b>
    <div class="field"><label for="tk-t">מה צריך לעשות</label><input id="tk-t" name="title" required placeholder="למשל: סידור מדף החטיפים"></div>
    <div class="two"><div class="field"><label for="tk-e">עובד</label><select id="tk-e" name="emp">${opts}</select></div>
    <div class="field"><label for="tk-h">שעות משוערות</label><input id="tk-h" name="hours" type="number" step="0.25" min="0.25" value="1" required></div></div>
    <button class="btn primary">הוספת משימה</button></form>
  <div class="sec-h"><h3 class="sec">ממוצע דירוג לכל עובד</h3>${S.tasks.some(t => t.rating > 0) || Object.keys(S.grades || {}).length ? '<button class="btn sm danger" data-action="all-unrate">מחיקת כל הכוכבים</button>' : ''}</div>
  <p class="muted" style="margin:-4px 0 8px">הממוצע מחושב מהדירוג של כל משימה בנפרד, בחצאי כוכבים.</p>
  <div class="list">${S.employees.map(e => {
    const r = empRating(e.id), done = sum(S.tasks.filter(t => t.empId === e.id && t.done).map(t => t.hours));
    return `<div class="row"><div class="row-main"><div class="row-title">${esc(e.name)}</div><div class="row-sub num">${r.n ? `ממוצע ${fmtStar(r.avg)} מתוך 5 · ${r.n} משימות מדורגות` : 'עדיין אין משימות מדורגות'} · שעות משימות שהושלמו: ${fmtH(done)}</div></div>
    <div class="emp-rate">${starsHtml(Math.round(r.avg * 2) / 2)}${r.n ? `<button class="link-btn" data-action="emp-unrate" data-id="${e.id}">ניקוי</button>` : ''}</div></div>`;
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
// An employee whose login details are private (no phone in the shared list) shows only name and wage.
const isPriv = e => !!(e && e.id && !e.phone);
const empFields = (e, p) => isPriv(e) ? `
  <div class="field"><label for="${p}-n">שם מלא</label><input id="${p}-n" name="name" required value="${esc(e.name || '')}"></div>
  <div class="field"><label for="${p}-w">שכר לשעה (₪)</label><input id="${p}-w" name="wage" type="number" min="0" step="0.5" value="${e.wage ?? 50}" required></div>` : `
  <div class="field"><label for="${p}-n">שם מלא</label><input id="${p}-n" name="name" required value="${esc(e.name || '')}"></div>
  <div class="two"><div class="field"><label for="${p}-u">מספר עובד</label><input id="${p}-u" name="num" inputmode="numeric" required value="${esc(e.num || nextNum())}"></div>
  <div class="field"><label for="${p}-w">שכר לשעה (₪)</label><input id="${p}-w" name="wage" type="number" min="0" step="0.5" value="${e.wage ?? 50}" required></div></div>
  <div class="field"><label for="${p}-p">טלפון נייד (לא חובה)</label><input id="${p}-p" class="ltr" style="text-align:right" name="phone" type="tel" inputmode="tel" placeholder="050-000-0000" value="${esc(e.phone ? fmtPhone(e.phone) : '')}"><small>ליצירת קשר בלבד. הכניסה לאפליקציה היא עם חשבון Google.</small></div>
  ${e.owner ? `<p class="hint">${ic('crown', 'sm')} בעל הבית: גישה מלאה לכל הנתונים.</p>` : ''}`;
function validateEmp(f, id) {
  if (f.phone === undefined) return !f.name.trim() ? 'צריך למלא שם' : !(parseFloat(f.wage) >= 0) ? 'הזן שכר תקין' : null;
  const ph = normPhone(f.phone), num = String(f.num).trim();
  if (!f.name.trim()) return 'צריך למלא שם';
  if (!/^\d{1,6}$/.test(num)) return 'מספר עובד צריך להיות עד 6 ספרות';
  if (ph && !/^05\d{8}$/.test(ph)) return 'מספר הטלפון צריך להיות נייד ישראלי בן 10 ספרות';
  if (ph && S.employees.some(e => e.id !== id && normPhone(e.phone) === ph)) return 'מספר הטלפון כבר רשום לעובד אחר';
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
  if (!manager) return back() + `<h2 class="vt">ניהול חנות</h2>` + locked('ניהול חנות');
  const row = (act, i, l, sub, extra = '') => `<button class="menu-item" data-action="${act}" ${extra}>${ic(i)}<span class="grow">${l}${sub ? `<small class="mi-sub">${sub}</small>` : ''}</span>${ic('chev', 'sm chev')}</button>`;
  return back() + `<h2 class="vt">ניהול חנות</h2>
  <div class="list">
    ${canV('staff') ? row('nav', 'user', 'עובדים והרשאות', `${S.employees.length} עובדים · הצטרפות, הרשאות ושכר`, 'data-view="staff"') : ''}
    ${row('nav', 'users', 'ספקים ומחירים', `${S.suppliers.length} ספקים · מוצרים, מחירים, מע״מ והזמנות`, 'data-view="suppliers"')}
    ${row('item-new', 'box', 'הוספת פריט למלאי', 'שתייה, חטיפים וסלטים')}
    ${row('item-bulk', 'note', 'הוספת פריטים מרשימה', 'מדביקים רשימה, כל שורה פריט')}
    ${row('new-deliv', 'truck', 'אספקה חדשה', 'פריטים שאמורים להגיע')}
  </div>
  ${local() ? `<h3 class="sec">כלים לגרסת הדמו</h3>
  <div class="actions"><button class="btn" data-action="regen">הפקת סיכום ${monthName(prevMonthKey())} מחדש</button><button class="btn danger" data-action="reset">איפוס נתוני הדמו</button></div>` : ''}`;
}
// Permissions editor: a level for each area, plus quick presets.
function permEditor(p) {
  const txt = (a, l) => a === 'chat' && l === 'edit' ? 'פעיל' : a === 'deliv' && l === 'none' ? 'רגיל' : a === 'deliv' && l === 'edit' ? 'ניהול' : a === 'reels' && l === 'edit' ? 'העלאה' : LEVEL_TXT[l];
  return `<div class="perm-presets"><span class="muted">מוכן מראש:</span>${Object.entries(PRESETS).map(([k, [l]]) => `<button type="button" class="btn sm" data-action="perm-preset" data-p="${k}">${l}</button>`).join('')}</div>
  <div class="perm-list">${AREAS.map(a => {
    const [name, sub] = PERM_INFO[a], L = PERM_LEVELS(a), cur = p[a] && L.includes(p[a]) ? p[a] : L[0];
    return `<div class="perm-row"><div class="perm-name"><b>${name}</b>${sub ? `<small>${sub}</small>` : ''}</div><div class="perm-seg" role="radiogroup" aria-label="${esc(name)}">${L.map(l => `<label class="${l}"><input type="radio" name="pm-${a}" value="${l}" ${cur === l ? 'checked' : ''}><span>${txt(a, l)}</span></label>`).join('')}</div></div>`;
  }).join('')}</div>`;
}
const readPerms = f => { const p = {}; AREAS.forEach(a => { const v = f['pm-' + a]; if (v && v !== 'none') p[a] = v; }); return p; };
const permSummary = p => {
  const on = AREAS.filter(a => !['reels', 'chat'].includes(a) && p && p[a] && p[a] !== 'none');
  return on.length ? `${on.length} הרשאות ניהול` : 'עובד';
};
const isOwnerEmp = e => !!(e && (e.owner || (memOf(e.id) || {}).owner || e.id === (store.ownerEmp && store.ownerEmp())));
// The Google account and permissions part of the employee sheet.
function empAcct(e) {
  const m = memOf(e.id), own = isOwnerEmp(e);
  if (!m) return `<h3 class="sec">חשבון והרשאות</h3><p class="muted">${esc(first(e.name))} עדיין לא מחובר/ת לחשבון Google. כשייכנס/תיכנס לאפליקציה עם Google, תופיע אצלך בקשת הצטרפות ותוכל/י לשייך אותה לעובד הזה.</p>`;
  return `<h3 class="sec">חשבון והרשאות</h3>
  <div class="list"><div class="row"><div class="row-main"><div class="row-title ltr">${esc(m.email || m.id)}</div><div class="row-sub">מחובר/ת עם חשבון Google</div></div>${own || !canE('staff') ? '' : `<button class="btn sm danger" data-action="mem-unlink" data-id="${esc(m.id)}">ניתוק</button>`}</div></div>
  ${own ? `<p class="hint">${ic('crown', 'sm')} בעל הבית: כל ההרשאות, תמיד.</p>` : `<form class="form perm-form" data-form="perms" data-email="${esc(m.id)}">${permEditor(m.perms || {})}<button class="btn primary block">שמירת הרשאות</button></form>`}`;
}
function vStaff() {
  if (!manager) return back('admin', 'חזרה לניהול חנות') + `<h2 class="vt">עובדים</h2>` + locked('עובדים והרשאות');
  const joins = (S.signups || []).slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
  return back() + `<h2 class="vt">עובדים והרשאות · ${S.employees.length}</h2>
  ${joins.length ? `<h3 class="sec">בקשות הצטרפות · ${joins.length}</h3>
  <div class="list">${joins.map(j => `<div class="row"><span class="av lg">${j.photo ? `<img src="${esc(j.photo)}" alt="" referrerpolicy="no-referrer">` : esc((j.name || j.email || '?')[0])}</span><div class="row-main"><div class="row-title">${esc(j.name || 'בלי שם')}</div>
    <div class="row-sub"><span class="ltr">${esc(j.email)}</span>${j.ts ? `<span>${fmtD(j.ts)} ${fmtT(j.ts)}</span>` : ''}</div></div>
    ${canE('staff') ? `<button class="btn sm primary" data-action="su-open" data-id="${esc(j.id)}">אישור</button><button class="btn sm" data-action="su-reject" data-id="${esc(j.id)}">דחייה</button>` : ''}</div>`).join('')}</div>` : ''}
  <h3 class="sec">עובדים</h3>
  <div class="list">${S.employees.map(e => { const m = memOf(e.id), own = isOwnerEmp(e); return `<div class="row tap" data-action="emp-edit" data-id="${e.id}">${avatar(e, 'lg')}<div class="row-main"><div class="row-title">${esc(e.name)}</div>
    <div class="row-sub num">${m ? `<span class="ltr">${esc(m.email || m.id)}</span>` : '<span class="pill">לא מחובר ל-Google</span>'}<span>${money(e.wage)} לשעה</span>${own ? `<span class="pill pend">${ic('crown', 'sm')}בעל הבית</span>` : m ? `<span class="pill acc">${permSummary(m.perms)}</span>` : ''}</div></div>
    <span class="btn sm">${canE('staff') ? 'עריכה' : 'פרטים'}</span></div>`; }).join('')}</div>
  ${canE('staff') ? `<button class="btn primary" data-action="emp-new">${ic('plus', 'sm')}הוספת עובד</button>` : ''}
  ${viewer ? '' : `<div class="card" style="margin-top:14px"><b>${ic('play', 'sm')} חדשות מרקט (העלאת רילסים בלבד)</b>
    <p class="muted" style="margin:6px 0 10px">חשבון שיכול רק להעלות רילסים ופוסטים ולמחוק את שלו. לא רואה שום דבר אחר באפליקציה.${S.posterLogin ? ` פעיל: טלפון <span class="ltr">${esc(S.posterLogin.phone)}</span> · מספר עובד ${esc(S.posterLogin.num)}` : ' כרגע כבוי.'}</p>
    <div class="actions"><button class="btn" data-action="poster-set">${S.posterLogin ? 'שינוי פרטים' : 'הפעלה'}</button>${S.posterLogin ? '<button class="btn danger" data-action="poster-off">כיבוי</button>' : ''}</div></div>`}
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
/* ---------- phone notifications ---------- */
// The code that talks to Firebase Cloud Messaging lives in push.js and loads only in the real (cloud) app.
let pushStatus = 'off', pushMod = null, ppTimer = null;
const PUSH_TXT = { on: 'פעילות', ask: 'הפעלה', denied: 'חסומות', update: 'צריך גרסה חדשה', unsupported: 'לא נתמך כאן', error: 'נסו שוב' };
const isNativeApp = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const pushLater = () => { try { return Date.now() - (+localStorage.getItem('push-later') || 0) < 7 * DAY; } catch (e) { return false; } };
async function initPush(ask) {
  if (local() || !session() || viewer || poster) return;
  try {
    pushMod = pushMod || await import('./push.js');
    pushStatus = await pushMod.startPush(store, { ask, onForeground: (t, b) => { haptic(10); toast(`${t || 'התראה'}${b ? ' · ' + b : ''}`); }, onOpen: openFromPush });
    if (pushStatus === 'error' && !ask) pushStatus = await pushMod.pushState();
  } catch (e) { pushStatus = 'unsupported'; }
  if (view === 'clock' && !layerOpen()) render();
}
function openFromPush(d) {
  if (!session() || !d) return;
  if (d.view === 'dm' && d.chat && emp(d.chat).id) { chatWith = d.chat; chatDraft = ''; go('dm'); }
  else if (d.view && ['chat', 'tasks', 'clock', 'reels', 'alerts', 'hours', 'fun', 'bg', 'gallery'].includes(d.view)) go(d.view);
}
const pushCard = () => {
  if (viewer || poster || pushLater()) return '';
  if (pushStatus === 'ask') return `<div class="card push-card"><span class="push-ic">${ic('bell')}</span><div class="grow"><b>התראות בטלפון</b><p class="muted">הודעה חדשה, משימה, שינוי במשמרת או רילס חדש יקפצו לכם בטלפון.</p><div class="actions"><button class="btn primary sm" data-action="push-on">הפעלת התראות</button><button class="btn sm" data-action="push-later">לא עכשיו</button></div></div></div>`;
  if (pushStatus === 'update') return `<div class="card push-card"><span class="push-ic">${ic('bell')}</span><div class="grow"><b>יש גרסה חדשה לאפליקציה</b><p class="muted">התקינו את הגרסה החדשה כדי לקבל התראות לטלפון.</p><div class="actions"><button class="btn sm" data-action="push-later">הבנתי</button></div></div></div>`;
  return '';
};

/* ---------- location: closing a shift when the employee leaves the shop ---------- */
// The manager sets the shop's location and radius (config/geo); without one, the place where the employee
// clocked in counts. While on shift the phone keeps the last time it was inside the area and when it left.
// If it does not come back within the waiting time (1:15 by default), the shift is closed at the last time
// it was inside. The server checks the same every few minutes, so it happens also while the app is closed.
const GEO_DEF = { on: false, lat: null, lng: null, acc: null, radius: 150, grace: 75 };
let geoCfg = null, geoCfgAt = 0, geoCfgBusy = false, geoSt = null, geoErr = '', geoMode = '', geoStarting = false, geoBusy = false;
const geoOn = () => !!(geoCfg && geoCfg.on);
const graceMs = () => (+(geoCfg && geoCfg.grace) || 75) * 60000;
const fmtMin = m => ({ 30: 'חצי שעה', 45: '45 דקות', 60: 'שעה', 75: 'שעה ורבע', 90: 'שעה וחצי', 120: 'שעתיים' })[+m] || `${m} דקות`;
async function geoLoad(force) {
  if (geoCfgBusy || (!force && geoCfgAt && Date.now() - geoCfgAt < 10 * 60000)) return;
  geoCfgBusy = true; geoCfgAt = Date.now();
  const was = JSON.stringify(geoCfg);
  try { geoCfg = { ...GEO_DEF, ...((await store.getGeoCfg()) || {}) }; } catch (e) { geoCfg = geoCfg || { ...GEO_DEF }; }
  geoCfgBusy = false;
  if (JSON.stringify(geoCfg) !== was) { geoSync(); if (view === 'geo' || view === 'clock') softRender(); }
}
const geoSave = () => store.setGeoCfg(geoCfg).catch(() => toast('השמירה נכשלה, בדקו את החיבור'));
// Starts or stops reading the location to match: feature on + my shift open.
function geoSync() {
  if (!session() || viewer || poster || !store.getGeoCfg) return;
  geoLoad();
  const me = cur(), o = me && me.id ? openShift(me.id) : null, want = geoOn() && !!o;
  if (want && !geoWatching() && !geoStarting) geoWatchStart(o);
  else if (!want && geoWatching()) { geoStop(); geoMode = ''; }
}
async function geoWatchStart(o) {
  geoStarting = true;
  try {
    if (!geoSt || geoSt.id !== o.id) {
      geoSt = { id: o.id, lastIn: o.start, outAt: null, home: null, unsure: false, saved: 0 };
      try { const g = await store.getGeo(o.id); if (g && geoSt.id === o.id) Object.assign(geoSt, { lastIn: g.lastIn || o.start, outAt: g.outAt || null, home: g.home || null, unsure: !!g.unsure }); } catch (e) { }
    }
    geoErr = '';
    geoMode = (await geoStart(geoPos, e => { geoErr = e; if (view === 'clock') softRender(); })) || '';
  } finally { geoStarting = false; }
}
// Each location reading while on shift.
function geoPos(p) {
  const me = cur(), o = me && me.id ? openShift(me.id) : null;
  if (!o || !geoOn() || !geoSt || geoSt.id !== o.id || !(p.acc < 300)) return;
  const g = geoSt, now = Date.now(), t = p.t && p.t <= now && now - p.t < 10 * 60000 ? p.t : now, hadErr = !!geoErr;
  geoErr = '';
  if (geoCfg.lat == null && !g.home) g.home = { lat: p.lat, lng: p.lng };
  const z = geoCfg.lat != null ? { lat: +geoCfg.lat, lng: +geoCfg.lng } : g.home;
  const d = distM(p, z), inside = d <= (+geoCfg.radius || 150) + Math.min(p.acc, 100), wasOut = !!g.outAt;
  let write = !g.saved;
  if (inside) {
    if (g.outAt) { g.outAt = null; g.unsure = false; write = true; }
    if (t - (g.saved || 0) > 3 * 60000) write = true;
    g.lastIn = Math.max(g.lastIn || 0, t);
  } else if (!g.outAt) {
    // More than half an hour without a reading before leaving (iPhone with the app closed): the manager is told to check.
    g.outAt = t; g.unsure = !!g.lastIn && t - g.lastIn > 30 * 60000; write = true;
  }
  if (write) { g.saved = t; store.geoPing(o.id, { home: g.home || null, lastIn: g.lastIn || null, outAt: g.outAt || null, dist: Math.round(d), acc: Math.round(p.acc), unsure: !!g.unsure }).catch(() => { }); }
  if ((wasOut !== !!g.outAt || hadErr) && view === 'clock') softRender();
  geoCheck();
}
// Closes my shift once I have been outside for the whole waiting time.
function geoCheck() {
  const g = geoSt, me = cur();
  if (!g || !g.outAt || !geoOn() || !me || !me.id || Date.now() - g.outAt < graceMs()) return;
  const o = openShift(me.id); if (!o || o.id !== g.id) return;
  o.end = Math.max(o.start, Math.min(g.lastIn || o.start, Date.now())); o.status = 'approved'; o.autoGeo = true;
  if (g.unsure) o.geoUnsure = true;
  delete o.allowUntil;
  save(); geoEnd(o.id); haptic([10, 60, 10]); render();
  toast(`המשמרת נסגרה: יצאת מאזור החנות ולא חזרת. נרשמה עד ${fmtT(o.end)}`);
}
function geoBegin(id, t) { if (geoOn()) geoSt = { id, lastIn: t, outAt: null, home: null, unsure: false, saved: 0 }; }
function geoEnd(id) {
  geoStop(); geoMode = ''; geoErr = '';
  if (geoSt && geoSt.id === id) geoSt = null;
  if (store.geoClear) store.geoClear(id).catch(() => { });
}
function geoBanner(o) {
  if (!geoOn() || geoErr === 'unsupported') return '';
  if (geoErr === 'denied') return `<div class="banner bad">${ic('pin')}<span>כדי שהמשמרת תיבדק לפי מיקום צריך לאשר לאפליקציה גישה למיקום.</span><button class="btn sm" data-action="geo-retry">אישור מיקום</button></div>`;
  const g = geoSt && geoSt.id === o.id ? geoSt : null;
  if (g && g.outAt) return `<div class="banner bad">${ic('pin')}<span>יצאת מאזור החנות ב-${fmtT(g.outAt)}. אם לא תחזור עד ${fmtT(g.outAt + graceMs())} המשמרת תיסגר ותירשם עד ${fmtT(g.lastIn || o.start)}.</span></div>`;
  return `<p class="geo-note">${ic('pin', 'sm')}${geoMode === 'bg' ? 'המיקום נבדק במשמרת, גם כשהאפליקציה סגורה' : 'המיקום נבדק במשמרת כשהאפליקציה פתוחה'}</p>`;
}
function vGeo() {
  const title = `<h2 class="vt">מיקום החנות וסגירת משמרת</h2>`;
  if (!manager) return back() + title + locked('מיקום החנות וסגירת משמרת אוטומטית');
  if (!geoCfg) { geoLoad(true); return back() + title + `<div class="card empty">טוען…</div>`; }
  const c = geoCfg, has = c.lat != null;
  const segs = (k, list, fmt) => `<div class="seg-wrap" role="radiogroup">${list.map(v => `<button class="seg ${+c[k] === v ? 'on' : ''}" role="radio" aria-checked="${+c[k] === v}" data-action="geo-set" data-k="${k}" data-v="${v}">${fmt(v)}</button>`).join('')}</div>`;
  return back() + title + `
  <p class="lead">כשעובד במשמרת יוצא מאזור החנות מתחילה ספירה של ${fmtMin(c.grace)}. אם הוא לא חוזר בזמן הזה, המשמרת נסגרת לבד ונרשמת עד הרגע האחרון שהוא היה בחנות. חזר בזמן? הספירה מתבטלת.</p>
  <div class="list"><button class="set-row" role="switch" aria-checked="${!!c.on}" data-action="geo-tog"><span class="grow"><b>סגירת משמרת לפי מיקום</b><small>${c.on ? 'פועל לכל העובדים' : 'כבוי'}</small></span><span class="sw ${c.on ? 'on' : ''}"></span></button></div>
  <h3 class="sec">איפה החנות</h3>
  <div class="card geo-card">${has
    ? `<b>${ic('pin', 'sm')} מיקום החנות נקבע</b><span class="muted num ltr">${(+c.lat).toFixed(5)}, ${(+c.lng).toFixed(5)}${c.acc ? ` · דיוק כ-${c.acc} מ׳` : ''}</span>
      <a class="link-btn" href="https://www.google.com/maps?q=${+c.lat},${+c.lng}" target="_blank" rel="noopener">הצגה במפה</a>
      <div class="actions"><button class="btn sm" data-action="geo-here" ${geoBusy ? 'disabled' : ''}>${geoBusy ? 'מאתר…' : 'עדכון למיקום שלי עכשיו'}</button><button class="btn sm" data-action="geo-clear">לפי מקום הכניסה</button></div>`
    : `<b>כרגע: לפי המקום שבו כל עובד נכנס למשמרת</b><span class="muted">מדויק יותר לקבוע את מיקום החנות. עמדו בתוך החנות ולחצו:</span>
      <button class="btn primary" data-action="geo-here" ${geoBusy ? 'disabled' : ''}>${ic('pin', 'sm')}${geoBusy ? 'מאתר…' : 'קביעת מיקום החנות כאן'}</button>`}
  </div>
  <form class="form geo-ll" data-form="geo-ll"><div class="field"><label for="geo-ll">או הדביקו מיקום מגוגל מפות</label><input id="geo-ll" name="ll" dir="ltr" inputmode="decimal" autocomplete="off" placeholder="31.76830, 35.21370"><small>בגוגל מפות: לחיצה ארוכה על החנות › העתקת המספרים שמופיעים למעלה.</small></div><button class="btn">שמירת המיקום</button></form>
  <h3 class="sec">רדיוס האזור</h3>
  ${segs('radius', [50, 100, 150, 250, 400], v => v + ' מ׳')}
  <p class="muted geo-hint">בתוך מבנים ה-GPS פחות מדויק. 150 מ׳ מתאים לרוב החנויות.</p>
  <h3 class="sec">כמה זמן לחכות לפני שסוגרים</h3>
  ${segs('grace', [30, 45, 60, 75, 90, 120], fmtMin)}
  <div class="card geo-info"><b>מה צריך לדעת</b>
    <span>• <b>אנדרואיד (האפליקציה):</b> המיקום נבדק גם כשהאפליקציה סגורה. בזמן משמרת מופיעה הודעה קבועה. צריך להתקין את הגרסה החדשה ולאשר מיקום.</span>
    <span>• <b>אייפון ודפדפן:</b> המיקום נבדק רק כשהאפליקציה פתוחה. אם לפני היציאה לא היה מידע מיקום יותר מחצי שעה, המשמרת נסגרת ותקבלו התראה לבדוק אותה.</span>
    <span>• העובד מקבל התראה כשהוא יוצא מהאזור, וגם כשהמשמרת נסגרת.</span></div>`;
}

/* ---------- notification settings: what to get, quiet hours, Shabbat ---------- */
// Saved under the employee in the database (pushPrefs/{employee}), so they follow them to every phone;
// the server function reads them before sending.
const PP_DEF = { msg: true, preview: true, task: true, shift: true, req: true, reels: true, alerts: true, quiet: false, quietFrom: '22:00', quietTo: '07:00', shabbat: false };
let pp = null, ppLoading = false;
async function loadPP() {
  if (ppLoading) return; ppLoading = true;
  try { pp = { ...PP_DEF, ...((await store.getPushPrefs()) || {}) }; } catch (e) { pp = { ...PP_DEF }; }
  ppLoading = false; if (view === 'notif' && !layerOpen()) render();
}
const savePP = () => { store.setPushPrefs(pp).catch(() => toast('השמירה נכשלה, בדקו את החיבור')); };
const ppTog = (k, l, sub, off) => `<button class="set-row ${off ? 'dim' : ''}" role="switch" aria-checked="${!!pp[k]}" data-action="pp-tog" data-k="${k}" ${off ? 'disabled' : ''}><span class="grow"><b>${l}</b>${sub ? `<small>${sub}</small>` : ''}</span><span class="sw ${pp[k] ? 'on' : ''}"></span></button>`;
function vNotif() {
  if (!pp) { loadPP(); return back('display', 'הגדרות') + `<h2 class="vt">הגדרות התראות</h2><div class="card empty">טוען…</div>`; }
  if (pushStatus === 'off' && !local()) initPush(false);
  const st = {
    on: ['ההתראות פעילות בטלפון הזה', 'ok', ''],
    ask: ['ההתראות עוד לא הופעלו בטלפון הזה', 'warn', `<button class="btn primary sm" data-action="push-on">הפעלה</button>`],
    denied: ['ההתראות חסומות בהגדרות הטלפון', 'bad', '<small class="muted">הגדרות הטלפון › אפליקציות › שאבעס מרקט › התראות</small>'],
    update: ['צריך להתקין את הגרסה החדשה של האפליקציה', 'warn', ''],
    unsupported: [/iPhone|iPad/.test(navigator.userAgent) ? 'באייפון: פתחו בספארי › שיתוף › הוספה למסך הבית, ופתחו משם' : 'הדפדפן הזה לא תומך בהתראות', 'warn', ''],
    error: ['לא הצלחתי להפעיל התראות', 'bad', `<button class="btn sm" data-action="push-on">נסו שוב</button>`],
    off: [local() ? 'בגרסת ההדגמה אין התראות אמיתיות' : 'בודק…', 'warn', '']
  }[pushStatus] || ['', 'warn', ''];
  const q = pp.quiet, mgr = isMgrUser();
  return back('display', 'הגדרות') + `<h2 class="vt">הגדרות התראות</h2>
  <p class="lead">בחרו על מה תקפוץ לכם התראה בטלפון. ההגדרות נשמרות בחשבון שלכם ועוברות איתכם לכל טלפון.</p>
  <div class="card pp-status ${st[1]}"><span class="pp-dot"></span><div class="grow"><b>${st[0]}</b>${st[2] && !/button/.test(st[2]) ? '<br>' + st[2] : ''}</div>${/button/.test(st[2]) ? st[2] : ''}${pushStatus === 'on' ? `<button class="btn sm" data-action="push-test">התראת ניסיון</button>` : ''}</div>
  <h3 class="sec">על מה לקבל התראה</h3>
  <div class="list">
    ${ppTog('msg', 'הודעות פרטיות', 'כשמישהו שולח לך הודעה')}
    ${ppTog('preview', 'להציג את תוכן ההודעה', pp.msg ? 'כבוי: יופיע רק "הודעה חדשה מ…" בלי הטקסט' : 'זמין כשהתראות על הודעות פועלות', !pp.msg)}
    ${ppTog('task', 'משימות חדשות', 'כשמנהל נותן לך משימה')}
    ${ppTog('shift', 'שינויים במשמרות שלי', 'משמרת שנוספה, עודכנה, נמחקה או נסגרה בידי מנהל')}
    ${ppTog('req', 'תשובה לבקשת שעות', 'כשבקשה לאישור שעות אושרה או נדחתה')}
    ${ppTog('reels', 'רילסים חדשים', 'כשעולה סרטון או פוסט חדש לפיד')}
    ${mgr ? ppTog('alerts', 'התראות למנהלים', 'מלאי שנגמר, בקשות של עובדים ועדכונים לניהול') : ''}
  </div>
  <h3 class="sec">זמני שקט</h3>
  <div class="list">
    ${ppTog('quiet', 'שעות שקט', q ? `אין התראות בין ${pp.quietFrom} ל-${pp.quietTo}` : 'בלי התראות בשעות שתבחרו, למשל בלילה')}
    ${q ? `<div class="set-row pp-times"><label>מ־<input type="time" value="${esc(pp.quietFrom)}" data-pp-time="quietFrom"></label><label>עד<input type="time" value="${esc(pp.quietTo)}" data-pp-time="quietTo"></label></div>` : ''}
    ${ppTog('shabbat', 'בלי התראות בשבת', 'מכניסת שבת ועד צאת שבת, לפי זמני ירושלים')}
  </div>
  <p class="muted" style="font-size:.85rem;margin-top:12px">התראות שלא נשלחו בזמני שקט לא נשלחות אחר כך. מה שחשוב תמיד מחכה באפליקציה.</p>`;
}
const isMgrUser = () => !!(store.isOwner?.() || canV('hours') || canV('inv') || canV('staff'));

/* ---------- private messages between employees ---------- */
let chatWith = null, chatDraft = '';
// A message deleted "for me" keeps the person's id in hide, so it disappears only from their phone.
const myMsgs = () => (S.messages || []).filter(m => (m.pair || []).includes(session()) && !(m.hide || []).includes(session()));
const unreadCount = () => myMsgs().filter(m => m.to === session() && !m.read).length;
function convos() {
  const me = session(), map = new Map();
  myMsgs().forEach(m => { const o = m.from === me ? m.to : m.from, c = map.get(o) || { last: null, unread: 0 }; if (!c.last || m.ts > c.last.ts) c.last = m; if (m.to === me && !m.read) c.unread++; map.set(o, c); });
  return map;
}
function vChat() {
  const me = session(), map = convos();
  const rows = S.employees.filter(e => e.id !== me).map(e => ({ e, c: map.get(e.id) }))
    .sort((a, b) => ((b.c && b.c.last.ts) || 0) - ((a.c && a.c.last.ts) || 0) || a.e.name.localeCompare(b.e.name, 'he'));
  return `<h2 class="vt">הודעות</h2><p class="muted" style="margin:-8px 0 0">שיחות פרטיות. רק שני המשתתפים רואים אותן.</p>
  <div class="list">${rows.map(({ e, c }) => `<button class="row tap row-btn" data-action="dm-open" data-id="${e.id}">${avatar(e, 'lg')}<div class="row-main"><div class="row-title">${esc(e.name)}</div><div class="row-sub ${c && c.unread ? 'chat-new' : ''}">${c ? `${c.last.from === me ? 'את/ה: ' : ''}${esc(c.last.text.slice(0, 60))}` : 'התחלת שיחה'}</div></div><div class="chat-meta">${c ? `<small class="muted">${ago(c.last.ts)}</small>` : ''}${c && c.unread ? `<span class="chat-unread">${c.unread}</span>` : ''}</div></button>`).join('') || '<div class="row muted">אין עובדים נוספים.</div>'}</div>`;
}
function dmList() {
  const me = session(), list = myMsgs().filter(m => m.pair.includes(chatWith)).sort((a, b) => a.ts - b.ts);
  let lastDay = '';
  return list.map((m, i) => {
    const mine = m.from === me, day = dateKey(m.ts), sep = day !== lastDay ? `<div class="dm-day">${sameDay(m.ts, Date.now()) ? 'היום' : fmtD(m.ts)}</div>` : '';
    lastDay = day; const nx = list[i + 1], tail = !nx || nx.from !== m.from || nx.ts - m.ts > 5 * 6e4;
    return sep + `<div class="dm ${mine ? 'me' : 'them'} ${tail ? 'tail' : ''}"><div class="dm-b" data-action="dm-msg" data-id="${m.id}" role="button" tabindex="0">${esc(m.text).replace(/\n/g, '<br>')}</div>${tail ? `<small>${fmtT(m.ts)}${mine ? (m.read ? ' · נקרא' : ' · נשלח') : ''}</small>` : ''}</div>`;
  }).join('') || '<p class="muted dm-empty">עדיין אין הודעות. כתבו משהו ראשון 👋</p>';
}
function vDm() {
  const e = emp(chatWith);
  return `${back('chat', 'חזרה להודעות')}<div class="dm-head">${avatar(e, 'lg')}<div><b>${esc(e.name)}</b><small class="muted">שיחה פרטית · לחיצה על הודעה למחיקה</small></div>${dmList().includes('data-id') ? `<button class="dm-clear" data-action="dm-clear" aria-label="מחיקת השיחה">${ic('trash')}</button>` : ''}</div>
  <div class="dm-list" id="dm-list">${dmList()}</div>
  <form class="dm-compose" data-form="dm"><textarea id="dm-t" name="text" rows="1" maxlength="2000" placeholder="הודעה…" data-dm>${esc(chatDraft)}</textarea><button class="dm-send" aria-label="שליחה">${ic('send')}</button></form>`;
}
function markRead() { let ch = false; myMsgs().forEach(m => { if (m.to === session() && m.from === chatWith && !m.read) { m.read = true; ch = true; } }); if (ch) save(); }
const scrollDmEnd = () => requestAnimationFrame(() => window.scrollTo(0, document.body.scrollHeight));
function patchDm() {
  const box = document.getElementById('dm-list'); if (!box) return;
  const near = innerHeight + scrollY >= document.body.scrollHeight - 160;
  box.innerHTML = dmList(); markRead(); if (near) scrollDmEnd();
}
function fitCompose() {
  const f = document.querySelector('.dm-compose'), n = document.getElementById('navbar'); if (!f) return;
  // With the keyboard open (iPhone), sit right above it; otherwise above the tab bar.
  const vv = window.visualViewport, kb = vv ? Math.max(0, innerHeight - vv.height - vv.offsetTop) : 0;
  f.style.bottom = (kb > 60 ? kb : n && !n.hidden ? Math.max(0, innerHeight - n.getBoundingClientRect().top) : 0) + 'px';
  document.body.classList.toggle('kb-open', kb > 60);
}
if (window.visualViewport) ['resize', 'scroll'].forEach(ev => visualViewport.addEventListener(ev, () => { if (view === 'dm') { fitCompose(); if (document.activeElement && document.activeElement.id === 'dm-t') scrollDmEnd(); } }));

/* ---------- till: scan products into a bill, record how it was paid, keep a PDF ---------- */
const PAY = [['cash', 'מזומן'], ['card', 'אשראי'], ['bit', 'ביט'], ['paybox', 'פייבוקס'], ['tab', 'הקפה'], ['other', 'אחר']];
const money2 = n => '₪' + (Math.round(n * 100) / 100).toFixed(2);
const payName = k => (PAY.find(p => p[0] === k) || [, k || ''])[1];
// The bill in progress stays on this phone until it is saved.
let pos = (() => { try { return JSON.parse(localStorage.getItem('pos-cart') || 'null') || null; } catch (e) { return null; } })() || { lines: [], method: 'cash', till: '' };
const posKeep = () => { try { localStorage.setItem('pos-cart', JSON.stringify(pos)); } catch (e) { } };
let posQ = '', scanStop = null;
const posTotal = () => Math.round(sum(pos.lines.map(l => l.qty * l.price)) * 100) / 100;
const nextSaleNo = () => Math.max(1000, ...(S.sales || []).map(s => +s.no || 0)) + 1;
function posAdd(p) {
  const ex = pos.lines.find(l => l.key === p.key);
  if (ex) ex.qty++; else { const s = sellOf(p); pos.lines.unshift({ key: p.key, name: p.name, bc: p.barcode || '', price: s ? s.v : 0, qty: 1 }); }
  posKeep();
}
const posFind = code => { code = String(code || '').trim(); return code ? allProducts().find(p => p.barcode === code) || allProducts().find(p => p.code === code) || null : null; };
const posSearch = q => { const n = normName(q); return n ? allProducts().filter(p => normName(p.name).includes(n) || p.barcode.startsWith(n)).slice(0, 8) : []; };
function pwCalc() {
  const f = document.querySelector('[data-form=pos-weigh]'), out = document.getElementById('pw-total'); if (!f || !out) return;
  const perKg = parseFloat(f.perKg.value), w = parseFloat(f.weight.value), kg = f.unit.value === 'g' ? w / 1000 : w;
  out.textContent = perKg > 0 && kg > 0 ? money2(Math.round(perKg * kg * 100) / 100) : '₪0.00';
}
const posSugHtml = () => posSearch(posQ).map(p => { const s = sellOf(p); return `<button class="pos-s" data-action="pos-add" data-k="${p.key}"><span>${esc(p.name)}</span><b class="num">${s ? money(s.v) : '—'}</b></button>`; }).join('');
function vPos() {
  if (!manager) return back() + `<h2 class="vt">קופה</h2>` + locked('קופה');
  const sales = (S.sales || []).slice().sort((a, b) => b.ts - a.ts).slice(0, 30);
  return back() + `<h2 class="vt">קופה</h2>
  ${viewer ? '' : `<button class="btn primary block" data-action="pos-scan">${ic('scan')}סריקת ברקוד במצלמה</button>
  <form class="pos-find" data-form="pos-find"><input id="pos-q" name="q" autocomplete="off" placeholder="ברקוד או שם מוצר · גם סורק ברקוד עובד" value="${esc(posQ)}" data-pos-q><button class="btn">הוספה</button></form>
  <div class="pos-quick"><button class="btn" data-action="pos-free">${ic('coin', 'sm')}סכום חופשי</button><button class="btn" data-action="pos-weigh">${ic('scale', 'sm')}פריט שקיל</button></div>
  <div class="pos-sug" id="pos-sug">${posSugHtml()}</div>
  <div class="card pos-bill"><div class="card-head"><b>חשבון חדש · מס׳ ${nextSaleNo()}</b>${pos.lines.length ? '<button class="link-btn danger-t" data-action="pos-clear">ניקוי</button>' : ''}</div>
  <div class="pos-lines">${pos.lines.map((l, i) => `<div class="pos-line"><div class="row-main"><div class="row-title">${esc(l.name)}</div><button class="link-btn num" data-action="pos-price" data-i="${i}">${l.price ? money(l.price) + ' ליחידה' : 'אין מחיר · הוספה'}</button></div>
    <div class="pos-qty"><button data-action="pos-dec" data-i="${i}" aria-label="פחות">−</button><b class="num">${l.qty}</b><button data-action="pos-inc" data-i="${i}" aria-label="יותר">+</button></div><b class="num pos-lt">${money(l.qty * l.price)}</b></div>`).join('') || '<p class="muted" style="margin:4px 0">סרקו ברקוד או חפשו מוצר כדי להתחיל.</p>'}</div>
  <div class="pos-total"><span>סה״כ לתשלום</span><b class="num">${money(posTotal())}</b></div>
  <div class="field"><label>איך שולם</label><div class="pay-opts">${PAY.map(([k, l]) => `<button class="pay ${pos.method === k ? 'on' : ''}" data-action="pos-pay" data-m="${k}">${l}</button>`).join('')}</div></div>
  <div class="field"><label for="pos-till">מספר החשבון בקופה</label><input id="pos-till" class="ltr" inputmode="numeric" value="${esc(pos.till)}" placeholder="המספר שעל הקבלה מהקופה" data-pos-till></div>
  <button class="btn primary block" data-action="pos-save" ${pos.lines.length ? '' : 'disabled'}>שמירת החשבון</button></div>`}
  <h3 class="sec">חשבונות אחרונים</h3>
  <div class="list">${sales.map(s => `<button class="row tap row-btn" data-action="sale-open" data-id="${s.id}"><div class="row-main"><div class="row-title">חשבון ${s.no}${s.till ? ` · בקופה ${esc(s.till)}` : ''}</div><div class="row-sub num">${fmtD(s.ts)} ${fmtT(s.ts)} · ${payName(s.method)} · ${sum(s.lines.map(l => l.qty))} פריטים</div></div><b class="num">${money(s.total)}</b></button>`).join('') || '<div class="row muted">עדיין אין חשבונות.</div>'}</div>`;
}
function receiptHtml(s) {
  return `<div class="rcpt"><div class="rcpt-h"><img src="./logo.png" alt=""><div><b>שאבעס מרקט</b><small>חשבון מס׳ ${s.no}</small></div></div>
  <div class="rcpt-i num"><span>${new Date(s.ts).toLocaleDateString('he-IL')} ${fmtT(s.ts)}</span>${s.till ? `<span>מספר בקופה: ${esc(s.till)}</span>` : ''}<span>תשלום: ${payName(s.method)}</span></div>
  ${s.lines.map(l => `<div class="rcpt-l"><span>${esc(l.name)}</span><span class="num">${l.qty} × ${money2(l.price)}</span><b class="num">${money2(l.qty * l.price)}</b></div>`).join('')}
  <div class="rcpt-t"><span>סה״כ</span><b class="num">${money2(s.total)}</b></div></div>`;
}
function receiptSheet(s) {
  sheet(`<h3>חשבון ${s.no}</h3>${receiptHtml(s)}
  <div class="actions" style="margin-top:14px"><button class="btn primary" data-action="sale-pdf" data-id="${s.id}">${ic('down', 'sm')}שמירה כקובץ PDF</button>${navigator.canShare ? `<button class="btn" data-action="sale-share" data-id="${s.id}">${ic('share', 'sm')}שיתוף</button>` : ''}</div>
  ${viewer ? '' : `<button class="link-btn danger-t" style="margin-top:12px" data-action="sale-del" data-id="${s.id}">ביטול החשבון</button>`}`);
}
// The receipt is drawn on a canvas (Hebrew text included) and wrapped in a one-page PDF.
async function receiptCanvas(s) {
  const W = 1240, P = 80, R = W - P, rowH = 62, H = 820 + s.lines.length * rowH + 320;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'), F = (w, z) => `${w} ${z}px -apple-system, system-ui, 'Segoe UI', Roboto, Assistant, Arial, sans-serif`;
  x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); x.direction = 'rtl'; x.textBaseline = 'alphabetic';
  const rule = y => { x.fillStyle = '#E2E2E8'; x.fillRect(P, y, W - 2 * P, 2); };
  let y = P;
  try { const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = './logo.png'; }); x.drawImage(img, R - 130, y, 130, 130); } catch (e) { }
  x.textAlign = 'right'; x.fillStyle = '#111'; x.font = F(800, 56); x.fillText('שאבעס מרקט', R - 160, y + 70);
  x.font = F(500, 30); x.fillStyle = '#6B6B73'; x.fillText('חשבון / קבלה', R - 160, y + 116);
  y += 210; x.fillStyle = '#111'; x.font = F(700, 42); x.fillText(`חשבון מס׳ ${s.no}`, R, y);
  y += 58; x.font = F(400, 30); x.fillStyle = '#333';
  [`תאריך: ${new Date(s.ts).toLocaleDateString('he-IL')} ${fmtT(s.ts)}`, s.till ? `מספר החשבון בקופה: ${s.till}` : '', `אמצעי תשלום: ${payName(s.method)}`, `קופאי/ת: ${emp(s.by).name || ''}`].filter(Boolean).forEach(t => { x.fillText(t, R, y); y += 46; });
  y += 14; rule(y); y += 56;
  x.font = F(700, 27); x.fillStyle = '#6B6B73'; x.textAlign = 'right'; x.fillText('פריט', R, y);
  x.textAlign = 'center'; x.fillText('כמות', 560, y); x.fillText('מחיר', 380, y); x.textAlign = 'left'; x.fillText('סה״כ', P, y);
  y += 24; rule(y); y += 52;
  x.font = F(500, 30); x.fillStyle = '#111';
  s.lines.forEach(l => {
    let n = l.name; x.textAlign = 'right'; while (x.measureText(n).width > R - 660 && n.length > 3) n = n.slice(0, -2);
    if (n !== l.name) n = n.trim() + '…';
    x.fillText(n, R, y); x.textAlign = 'center'; x.fillText(String(l.qty), 560, y); x.fillText(money2(l.price), 380, y);
    x.textAlign = 'left'; x.fillText(money2(l.qty * l.price), P, y); y += rowH;
  });
  y += 4; rule(y); y += 76;
  x.fillStyle = '#111'; x.font = F(800, 44); x.textAlign = 'right'; x.fillText('סה״כ לתשלום', R, y); x.textAlign = 'left'; x.fillText(money2(s.total), P, y);
  y += 110; x.textAlign = 'center'; x.font = F(600, 32); x.fillStyle = '#333'; x.fillText('תודה ולהתראות!', W / 2, y);
  x.font = F(400, 24); x.fillStyle = '#8E8E93'; x.fillText('הופק באפליקציית שאבעס מרקט', W / 2, y + 44);
  return c;
}
async function receiptPdf(s) {
  const c = await receiptCanvas(s);
  const jpg = new Uint8Array(await (await new Promise(r => c.toBlob(r, 'image/jpeg', 0.92))).arrayBuffer());
  const pw = 420, ph = Math.round(pw * c.height / c.width), enc = new TextEncoder(), parts = [], offs = [];
  let len = 0;
  const push = b => { const u = typeof b === 'string' ? enc.encode(b) : b; parts.push(u); len += u.length; };
  const obj = (n, body) => { offs[n] = len; push(`${n} 0 obj\n${body}\nendobj\n`); };
  push('%PDF-1.4\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  offs[4] = len; push(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${c.width} /Height ${c.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`); push(jpg); push('\nendstream\nendobj\n');
  const cs = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`;
  obj(5, `<< /Length ${cs.length} >>\nstream\n${cs}\nendstream`);
  const xref = len;
  push(`xref\n0 6\n0000000000 65535 f \n${[1, 2, 3, 4, 5].map(n => String(offs[n]).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts, { type: 'application/pdf' });
}
async function salePdf(s, share) {
  toast('מכין את הקובץ…');
  const blob = await receiptPdf(s), name = `חשבון-${s.no}.pdf`;
  if (share) { try { const file = new File([blob], name, { type: 'application/pdf' }); if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; } } catch (e) { if (e && e.name === 'AbortError') return; } }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000); toast('הקובץ נשמר');
}
// A short beep when a barcode is read, on the same moment as the vibration.
let audioCtx = null;
function beep() { try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); const o = audioCtx.createOscillator(), g = audioCtx.createGain(); o.frequency.value = 1320; g.gain.setValueAtTime(0.08, audioCtx.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.09); o.connect(g); g.connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime + 0.1); } catch (e) { } }
// The camera stays on between scans while in the till, so the phone does not ask for permission every time.
// Each scan gets a copy of the same stream; the camera itself turns off when leaving the till or after 10 idle minutes.
let camStream = null, camT = null;
async function camGet() {
  clearTimeout(camT);
  if (camStream && camStream.getVideoTracks().some(t => t.readyState === 'live')) return camStream.clone();
  camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
  return camStream.clone();
}
function camIdle() { clearTimeout(camT); camT = setTimeout(camOff, 10 * 60000); }
function camOff() { clearTimeout(camT); if (camStream) { camStream.getTracks().forEach(t => t.stop()); camStream = null; } }
document.addEventListener('visibilitychange', () => { if (document.hidden && !scanStop) camOff(); });
async function startScan() {
  sheet(`<h3>סריקת ברקוד</h3><p class="muted" style="margin-bottom:10px">כוונו את המצלמה לברקוד. כל מוצר שנסרק נכנס לחשבון.</p><div class="scan-box"><video id="scan-v" playsinline muted autoplay></video><div class="scan-frame"></div></div><div id="scan-log" class="scan-log"></div><button class="btn primary block" style="margin-top:12px" data-action="close">סיום</button>`);
  const v = document.getElementById('scan-v'), log = document.getElementById('scan-log');
  let last = '', lastT = 0;
  const hit = code => {
    const now = Date.now(); if (code === last && now - lastT < 1500) return; last = code; lastT = now;
    const p = posFind(code);
    if (p) { posAdd(p); haptic(12); beep(); const s = sellOf(p); log.insertAdjacentHTML('afterbegin', `<div class="scan-ok">✓ ${esc(p.name)}${s ? ' · ' + money(s.v) : ''}</div>`); }
    else { haptic([20, 40, 20]); log.insertAdjacentHTML('afterbegin', `<div class="scan-bad">לא נמצא מוצר עם הברקוד ${esc(code)}</div>`); }
    renderPending = true;
  };
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('nocam');
    if ('BarcodeDetector' in window) {
      const stream = await camGet();
      v.srcObject = stream; await v.play().catch(() => { });
      const det = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code'] });
      let on = true; scanStop = () => { on = false; stream.getTracks().forEach(t => t.stop()); camIdle(); };
      const loop = async () => { if (!on) return; if (!v.isConnected) return scanStop(); try { const r = await det.detect(v); if (r && r[0]) hit(r[0].rawValue); } catch (e) { } setTimeout(loop, 120); };
      loop();
    } else {
      let Z = null;
      for (const ver of ['0.21.3', '0.21.0', '0.20.0']) { try { Z = await import(/* @vite-ignore */ `https://cdn.jsdelivr.net/npm/@zxing/library@${ver}/+esm`); break; } catch (e) { } }
      if (!Z) throw new Error('noreader');
      const reader = new Z.BrowserMultiFormatReader();
      scanStop = () => { try { reader.reset(); } catch (e) { } camIdle(); };
      if (typeof reader.decodeFromStream === 'function') { const stream = await camGet(); await reader.decodeFromStream(stream, v, res => { if (res) hit(res.getText()); }); }
      else await reader.decodeFromConstraints({ video: { facingMode: 'environment' } }, v, res => { if (res) hit(res.getText()); });
    }
  } catch (e) { log.innerHTML = '<div class="scan-bad">לא הצלחתי לפתוח את המצלמה. אפשר להקליד את הברקוד, או לחבר סורק ברקוד.</div>'; }
}

/* ---------- products: every product in the shop, with barcode, supplier price and selling price (managers) ---------- */
// Two sources: the shop's inventory items (prices kept in S.prices) and the till's product list (S.catalog, imported from a file).
let prodQ = '', prodDept = '', prodNoBc = false, prodShown = 60;
const normName = s => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();
// The supplier product with the same name as the shop item, if there is one.
function supMatch(name) {
  const n = normName(name);
  for (const s of S.suppliers) { const p = (s.products || []).find(p => normName(p.name) === n); if (p) return { s, p }; }
  return null;
}
const priceOf = id => (S.prices && S.prices[id]) || {};
const catLabel = i => i.cat === 'drinks' ? (i.sub && i.sub !== 'שתייה' ? `שתייה › ${i.sub}` : 'שתייה') : (CATS[i.cat] || i.cat);
const hasNum = v => v != null && v !== '' && !isNaN(+v);
// One flat list of products, whichever list they come from.
function allProducts() {
  const out = S.inventory.map(i => { const pr = priceOf(i.id); return { key: 'i:' + i.id, kind: 'inv', id: i.id, name: i.name, dept: catLabel(i), barcode: pr.barcode || '', cost: hasNum(pr.cost) ? +pr.cost : null, price: hasNum(pr.price) ? +pr.price : null, img: img(i.id), qty: i.qty, unit: 'יח׳', code: String(pr.code || '') }; });
  (S.catalog || []).forEach(c => out.push({ key: 'c:' + c.id, kind: 'cat', id: c.id, name: c.name, dept: c.dept || 'כללי', barcode: c.bc || '', cost: hasNum(c.cost) ? +c.cost : null, price: hasNum(c.price) ? +c.price : null, img: '', qty: hasNum(c.qty) ? +c.qty : null, unit: c.unit || 'יח׳', code: String(c.code || '') }));
  return out;
}
// Supplier price incl. VAT: what was typed for the product, otherwise the matching supplier's price list.
function costOf(p) { if (p.cost != null) return { v: p.cost, from: '' }; const m = supMatch(p.name); return m ? { v: withVat(m.p), from: m.s.name } : null; }
function sellOf(p) { if (p.price != null) return { v: p.price, suggested: false }; const c = costOf(p); return c ? { v: Math.round(c.v * 1.5 * 10) / 10, suggested: true } : null; }
const noBcTag = '<span class="pill nobc">אין ברקוד</span>';
function prodCard(p) {
  const c = costOf(p), s = sellOf(p);
  return `<div class="prod tap ${p.barcode ? '' : 'nobc-card'}" data-action="prod-open" data-k="${p.key}">
    <div class="prod-top">${p.img ? `<img class="prod-img" src="${p.img}" alt="">` : `<span class="prod-img ph">${ic('box')}</span>`}
      <div class="prod-main"><div class="prod-name">${esc(p.name)}</div><div class="prod-tags">${p.code ? `<span class="pill num">קוד ${esc(p.code)}</span>` : ''}<span class="pill">${esc(p.dept)}</span>${p.barcode ? '' : noBcTag}</div></div></div>
    <div class="prod-bc">${p.barcode ? barcodeSvg(p.barcode, { h: 52 }) : '<span class="nobc-t">● אין ברקוד · לחצו להוספה</span>'}</div>
    <div class="prod-prices"><span class="prod-cost">${c ? `ספק: ${money(c.v)}${c.from ? ` · ${esc(c.from)}` : ''}` : 'אין מחיר ספק'}</span><b class="prod-sell">${s ? money(s.v) : '—'}</b></div>
    ${s && s.suggested ? '<small class="prod-sug">מחיר מוצע (×1.5 ממחיר הספק)</small>' : ''}
  </div>`;
}
function prodList() {
  const q = normName(prodQ);
  return allProducts().filter(p => (!prodDept || p.dept === prodDept) && (!prodNoBc || !p.barcode) && prodHit(p, q))
    .sort((a, b) => (codeRank(a, q) - codeRank(b, q)) || (!!a.barcode - !!b.barcode) || a.name.localeCompare(b.name, 'he'));
}
function prodsHtml() {
  const list = prodList();
  return list.slice(0, prodShown).map(prodCard).join('') + (list.length > prodShown ? moreMark('prod', list.length - prodShown) : '') || '<div class="list"><div class="row muted">לא נמצאו מוצרים.</div></div>';
}
function refreshProds() {
  const box = document.getElementById('prods'); if (box) box.innerHTML = prodsHtml();
  const n = document.getElementById('prods-n'); if (n) n.textContent = prodList().length.toLocaleString('he-IL');
  watchMore();
}
function vProducts() {
  if (!manager) return back() + `<h2 class="vt">מוצרים</h2>` + locked('מוצרים, ברקודים ומחירים');
  const all = allProducts(), depts = [...new Set(all.map(p => p.dept))].sort((a, b) => a.localeCompare(b, 'he')), noBc = all.filter(p => !p.barcode).length;
  return back() + `<h2 class="vt">מוצרים · ${all.length.toLocaleString('he-IL')}</h2>
  ${viewer ? '' : `<div class="actions" style="margin-bottom:10px"><button class="btn primary sm" data-action="prod-new">${ic('plus', 'sm')}מוצר חדש</button><label class="btn sm">${ic('down', 'sm')}ייבוא מקובץ מהקופה (CSV)<input type="file" accept=".csv,text/csv" data-import-csv hidden></label></div>`}
  <div class="field"><input id="prod-q" type="search" placeholder="חיפוש לפי שם, ברקוד או קוד פריט" value="${esc(prodQ)}" data-prod-q aria-label="חיפוש מוצר"></div>
  <div class="two"><div class="field"><select id="prod-d" data-prod-d aria-label="מחלקה"><option value="">כל המחלקות</option>${depts.map(d => `<option ${d === prodDept ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select></div>
  <button class="btn ${prodNoBc ? 'nobc-on' : ''}" data-action="prod-nobc">● ללא ברקוד (${noBc.toLocaleString('he-IL')})</button></div>
  <p class="muted" style="margin:0 0 8px"><span id="prods-n">${prodList().length.toLocaleString('he-IL')}</span> מוצרים מוצגים. מוצרים בלי ברקוד מסומנים באדום ומופיעים ראשונים.</p>
  <div class="prods" id="prods">${prodsHtml()}</div>`;
}
function bcPreview(v) {
  const box = document.getElementById('bc-prev'); if (!box) return;
  const r = barcodeBits(v);
  box.innerHTML = r && r.bits ? barcodeSvg(v, { h: 70 }) + `<small class="muted">${r.type}${r.note ? ' · ' + esc(r.note) : ''}</small>` : r && r.note ? `<small class="danger-t">${esc(r.note)}</small>` : '<small class="nobc-t">● אין ברקוד. הקלידו מספר והברקוד ייווצר כאן</small>';
}
const findProd = key => allProducts().find(p => p.key === key);
// Which product already uses this barcode (other than the one being edited).
const bcOwner = (bc, key) => bc && allProducts().find(p => p.key !== key && p.barcode === bc);
function prodSheet(p) {
  const m = supMatch(p ? p.name : ''), isCat = !p || p.kind === 'cat', depts = [...new Set(allProducts().map(x => x.dept))];
  sheet(`<h3>${p ? esc(p.name) : 'מוצר חדש'}</h3>${p && !isCat ? `<span class="pill">${esc(p.dept)}</span>` : ''}
    <form class="form" data-form="prod-price" data-k="${p ? p.key : ''}" style="margin-top:10px">
      ${isCat ? `<div class="field"><label for="pp-n">שם המוצר</label><input id="pp-n" name="name" required value="${esc(p ? p.name : '')}"></div>
      <div class="two"><div class="field"><label for="pp-d">מחלקה בחנות</label><input id="pp-d" name="dept" list="pp-dl" value="${esc(p ? p.dept : '')}"><datalist id="pp-dl">${depts.map(d => `<option value="${esc(d)}">`).join('')}</datalist></div>
      <div class="field"><label for="pp-q">כמות במלאי</label><input id="pp-q" name="qty" type="number" step="any" inputmode="decimal" value="${p && p.qty != null ? p.qty : ''}" placeholder="לא נספר"></div></div>` : ''}
      <div class="field"><label for="pp-b">ברקוד</label><input id="pp-b" name="barcode" class="ltr" inputmode="numeric" autocomplete="off" value="${esc(p ? p.barcode : '')}" placeholder="למשל 7290000066318" data-bc></div>
      <div class="bc-prev" id="bc-prev"></div>
      <div class="two"><div class="field"><label for="pp-c">מחיר מהספק (כולל מע״מ)</label><input id="pp-c" name="cost" type="number" min="0" step="0.01" inputmode="decimal" value="${p && p.cost != null ? p.cost : ''}" placeholder="${m ? withVat(m.p).toFixed(2) : ''}"><small>${m ? `מהמחירון של ${esc(m.s.name)}: ${money(withVat(m.p))}. השאירו ריק כדי להשתמש בו.` : 'אין מוצר בשם הזה אצל הספקים.'}</small></div>
      <div class="field"><label for="pp-s">מחיר מכירה</label><input id="pp-s" name="price" type="number" min="0" step="0.1" inputmode="decimal" value="${p && p.price != null ? p.price : ''}"><button type="button" class="link-btn" data-action="prod-x15">חישוב ×1.5 ממחיר הספק</button></div></div>
      <button class="btn primary block">שמירה</button></form>
    ${p && isCat ? `<button class="btn danger block" style="margin-top:10px" data-action="prod-del" data-k="${p.key}">מחיקת המוצר</button>` : ''}`);
  bcPreview(p ? p.barcode : '');
}
// Reads the till's CSV export (קוד פריט, ברקוד, תאור פריט, מחיר קניה, מחיר מכירה, שם מחלקה, יחידת מידה).
function parseCsv(text) {
  const rows = []; let row = [], f = '', q = false;
  text = text.replace(/^\ufeff/, '');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; }
    else if (ch === '"' && f === '') q = true;
    else if (ch === ',') { row.push(f); f = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += ch;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows;
}
const CAT_CHUNK = 700;
function importCsv(text) {
  const rows = parseCsv(text); if (rows.length < 2) return { error: 'הקובץ ריק' };
  const h = rows[0].map(x => x.trim()), col = n => h.indexOf(n);
  const ci = { code: col('קוד פריט'), bc: col('ברקוד'), name: col('תאור פריט'), type: col('סוג פריט'), cost: col('מחיר קניה'), price: col('מחיר מכירה'), dept: col('שם מחלקה'), unit: col('יחידת מידה') };
  if (ci.name < 0 || ci.code < 0) return { error: 'לא מצאתי בקובץ את העמודות "קוד פריט" ו"תאור פריט"' };
  const num = v => { const n = parseFloat(String(v || '').replace(/[^\d.-]/g, '')); return n > 0 ? Math.round(n * 100) / 100 : null; };
  S.catalog = S.catalog || []; S.prices = S.prices || {};
  const byCode = new Map(S.catalog.map(c => [c.code, c])), invByName = new Map(S.inventory.map(i => [normName(i.name), i]));
  const used = new Map(allProducts().filter(p => p.barcode).map(p => [p.barcode, p.key]));
  const res = { added: 0, updated: 0, linked: 0, skipped: 0, bcConflicts: 0, noBc: 0 };
  let nextChunk = () => { const counts = {}; S.catalog.forEach(c => { counts[c.chunk] = (counts[c.chunk] || 0) + 1; }); let k = 0; while ((counts['c' + k] || 0) >= CAT_CHUNK) k++; return 'c' + k; };
  let chunk = nextChunk(), inChunk = S.catalog.filter(c => c.chunk === chunk).length;
  for (const r of rows.slice(1)) {
    const g = i => i >= 0 && r[i] != null ? String(r[i]).trim() : '';
    const code = g(ci.code), name = g(ci.name).replace(/\s+/g, ' ');
    if (!code || !name || g(ci.type) === 'כללי') { if (code || name) res.skipped++; continue; }
    let bc = g(ci.bc); const cost = num(g(ci.cost)), price = num(g(ci.price)), dept = g(ci.dept) || 'כללי', unit = g(ci.unit) || 'יח׳';
    const inv = invByName.get(normName(name));
    const key = inv ? 'i:' + inv.id : byCode.has(code) ? 'c:' + byCode.get(code).id : null;
    if (bc && used.has(bc) && used.get(bc) !== key) { res.bcConflicts++; bc = ''; }
    if (!bc) res.noBc++;
    if (inv) {
      // Same name as an item already in the shop's inventory: attach the barcode and prices to it.
      const pr = { ...priceOf(inv.id) };
      if (bc && !pr.barcode) pr.barcode = bc;
      if (cost != null && !hasNum(pr.cost)) pr.cost = cost;
      if (price != null && !hasNum(pr.price)) pr.price = price;
      S.prices[inv.id] = { barcode: pr.barcode || '', cost: hasNum(pr.cost) ? +pr.cost : null, price: hasNum(pr.price) ? +pr.price : null };
      if (pr.barcode) used.set(pr.barcode, 'i:' + inv.id); res.linked++; continue;
    }
    const ex = byCode.get(code);
    if (ex) { Object.assign(ex, { name, dept, unit, ...(bc ? { bc } : {}), ...(cost != null ? { cost } : {}), ...(price != null ? { price } : {}) }); if (bc) used.set(bc, 'c:' + ex.id); res.updated++; continue; }
    if (inChunk >= CAT_CHUNK) { chunk = nextChunk(); inChunk = S.catalog.filter(c => c.chunk === chunk).length; }
    const it = { id: 'p' + code.replace(/[^\w-]/g, '_'), code, name, dept, unit, chunk, ...(bc ? { bc } : {}), ...(cost != null ? { cost } : {}), ...(price != null ? { price } : {}) };
    S.catalog.push(it); byCode.set(code, it); inChunk++; if (bc) used.set(bc, 'c:' + it.id); res.added++;
  }
  S.catalogDirty = true; return res;
}
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
  ${rows.map(r => `<div class="card rep"><div class="card-head"><b>${esc(r.e.name)} ${r.e.num ? `<span class="muted num">#${esc(r.e.num)}</span>` : ''}</b><span class="num">${fmtH(r.h)} ש׳ · <b>${money(r.pay)}</b></span></div>
    <div class="tbl-wrap"><table><thead><tr><th>תאריך</th><th>כניסה</th><th>יציאה</th><th>שעות</th><th class="l">שכר</th></tr></thead><tbody>
    ${r.sh.map(s => `<tr><td>${fmtD(s.start)}</td><td>${fmtT(s.start)}</td><td>${s.end ? fmtT(s.end) + (sameDay(s.start, s.end) ? '' : ' (+1)') : 'פתוחה'}</td><td>${fmtH(dur(s))}</td><td class="l">${money(dur(s) * r.e.wage)}</td></tr>`).join('')}
    <tr class="tot"><td>${r.sh.length} משמרות</td><td></td><td></td><td>${fmtH(r.h)}</td><td class="l">${money(r.hp)}</td></tr></tbody></table></div>
    ${r.ex.length ? `<div class="tbl-wrap"><table><thead><tr><th>תאריך</th><th>קטגוריה</th><th>הערה</th><th class="l">סכום</th></tr></thead><tbody>${r.ex.map(x => `<tr><td>${fmtD(x.ts)}</td><td>${EXTRA[x.kind] || ''}</td><td>${esc(x.note || '')}</td><td class="l">${money(+x.amount || 0)}</td></tr>`).join('')}</tbody></table></div>` : ''}
    <div class="rep-sum num"><span>שעות ${money(r.hp)}</span><span>משלוחים ${money(r.dl)}</span><span>בונוסים ${money(r.bn)}</span><b>סה״כ ${money(r.pay)}</b></div>
    <div class="muted num" style="font-size:.8rem;margin-top:6px">${money(r.e.wage)} לשעה</div></div>`).join('') || '<div class="list"><div class="row muted">אין משמרות בטווח הזה.</div></div>'}`;
}
const reportText = () => { const rows = reportData(); return `דוח שכר · שאבעס מרקט · ${new Date(repCfg.from).toLocaleDateString('he-IL')} – ${new Date(repCfg.to).toLocaleDateString('he-IL')}\n\n` + rows.map(r => `${r.e.name}${r.e.num ? ` (#${r.e.num})` : ''} · ${fmtH(r.h)} שעות · שעות ${money(r.hp)} · משלוחים ${money(r.dl)} · בונוסים ${money(r.bn)} · סה״כ ${money(r.pay)}\n` + r.sh.map(s => `  ${new Date(s.start).toLocaleDateString('he-IL')} ${fmtT(s.start)}–${s.end ? fmtT(s.end) : 'פתוחה'} · ${fmtH(dur(s))} ש׳ · ${money(dur(s) * r.e.wage)}`).join('\n') + r.ex.map(x => `\n  ${new Date(x.ts).toLocaleDateString('he-IL')} ${EXTRA[x.kind] || ''}${x.note ? ' (' + x.note + ')' : ''} · ${money(+x.amount || 0)}`).join('')).join('\n\n') + `\n\nסה״כ: ${fmtH(sum(rows.map(r => r.h)))} שעות · ${money(sum(rows.map(r => r.pay)))}`; };

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

/* ---------- reels: short videos and photo posts. They stay in the feed (no automatic deletion). ---------- */
const REEL_MAX_SEC = 30, DAY_LIMIT = { video: 5, photos: 5 };
const REACTS = [['love', '\u2764\ufe0f'], ['laugh', '😂'], ['cry', '😢'], ['wow', '😮'], ['poop', '💩']];
const MEDIA = new Map();
let pendingUpload = null, replyTo = null, mentionTags = new Map(), reelsObs = null;
const liveReels = () => S.reels.filter(r => r.ready).sort((a, b) => b.ts - a.ts);
const myToday = type => S.reels.filter(r => r.by === session() && r.type === type && sameDay(r.ts, Date.now())).length;
const leftToday = type => manager || poster ? Infinity : Math.max(0, DAY_LIMIT[type] - myToday(type));
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
  if (!r || viewer || poster || r.by === me || (r.views || {})[me]) return;
  r.views = { ...(r.views || {}), [me]: Date.now() }; save(); patchReels();
}
function reelCard(r) {
  const a = emp(r.by), mine = (r.reactions || {})[session()], n = S.reelComments.filter(c => c.reel === r.id).length;
  const counts = Object.fromEntries(REACTS.map(([k]) => [k, Object.values(r.reactions || {}).filter(v => v === k).length]));
  return `<article class="reel" data-reel="${r.id}">
    <div class="reel-media ${r.type}" data-action="reel-tap" data-id="${r.id}">
      ${r.type === 'video' ? `<video class="rv" playsinline loop muted preload="none" ${r.poster ? `poster="${r.poster}"` : ''}></video><span class="rv-paused" aria-hidden="true">▶</span>`
      : `<div class="rp-track">${[...Array(r.parts || 1)].map((_, i) => `<div class="rp-slide">${i === 0 && r.poster ? `<img src="${r.poster}" alt="">` : ''}</div>`).join('')}</div>${(r.parts || 1) > 1 ? `<div class="rp-dots">${[...Array(r.parts)].map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div>` : ''}`}
      <span class="reel-load">טוען…</span>
    </div>
    <div class="reel-top" aria-hidden="true"><b>רילס</b></div>
    ${r.type === 'video' ? `<button class="rv-sound" data-action="reel-sound" aria-label="${reelMuted ? 'הפעלת קול' : 'השתקה'}">${reelMuted ? '🔇' : '🔊'}</button>
    <div class="rv-bar"><span class="rv-time" hidden></span><input class="rv-seek" type="range" min="0" max="1000" step="1" value="0" dir="ltr" aria-label="מיקום בסרטון"></div>` : ''}
    <div class="reel-side">
      ${REACTS.map(([k, e]) => `<button class="rx ${mine === k ? 'on' : ''}" data-action="react" data-id="${r.id}" data-r="${k}" aria-label="תגובה ${e}"><span>${e}</span><small data-cnt="${k}">${counts[k] || ''}</small></button>`).join('')}
      <button class="rx" data-action="reel-comments" data-id="${r.id}" aria-label="תגובות"><span>💬</span><small data-cnt="c">${n || ''}</small></button>
      <button class="rx" data-action="reel-share" data-id="${r.id}" aria-label="שיתוף"><span>${ic('share', 'sm')}</span></button>
      ${manager && !viewer ? `<button class="rx" data-action="reel-save" data-id="${r.id}" aria-label="שמירה למכשיר"><span>${ic('down', 'sm')}</span></button>` : ''}
      ${!viewer && r.by === session() ? `<button class="rx" data-action="reel-del" data-id="${r.id}" aria-label="מחיקה"><span>🗑</span></button>` : ''}
    </div>
    <div class="reel-info">
      <div class="reel-who"><span class="reel-av">${avatar(a, 'md')}</span><b>${esc(a.name || 'עובד')}</b><small>${ago(r.ts)}</small>${!viewer && r.by === session() ? `<button class="reel-delbtn" data-action="reel-del" data-id="${r.id}">מחיקה</button>` : ''}</div>
      ${r.by === session() ? `<button class="reel-views" data-action="reel-viewers" data-id="${r.id}" aria-label="מי צפה">${ic('eye', 'sm')}<span data-cnt="v">${viewCount(r)}</span></button>` : `<span class="reel-views" aria-label="צפיות">${ic('eye', 'sm')}<span data-cnt="v">${viewCount(r)}</span></span>`}
      ${r.caption ? `<p class="reel-cap" data-action="cap-more">${withMentions(r.caption, r.tags)}</p>` : ''}
    </div>
  </article>`;
}
function vReels() {
  const list = liveReels();
  // Full-screen feed like Instagram: the feed itself scrolls, one post per screen.
  return `${viewer || (!poster && !canE('reels')) ? '' : `<button class="reel-fab" data-action="reel-new" aria-label="ריל או פוסט חדש">${ic('plus')}</button>`}
  <div class="reels-feed" id="reels-feed">${list.map(reelCard).join('') || '<div class="reels-empty"><b>עדיין אין רילס</b><span>היו הראשונים להעלות!</span></div>'}</div>`;
}
// Only the reels in view load their media, and only the one on screen plays.
function watchReels() {
  if (reelsObs) reelsObs.disconnect();
  if (view !== 'reels') return;
  fitFeed();
  const feed = document.getElementById('reels-feed');
  reelsObs = new IntersectionObserver(es => es.forEach(en => {
    const el = en.target, v = el.querySelector('video');
    if (en.isIntersecting && en.intersectionRatio > 0.6) { showMedia(el); if (v && v.src) playReel(el); if (!viewTimers.has(el.dataset.reel)) viewTimers.set(el.dataset.reel, setTimeout(() => { viewTimers.delete(el.dataset.reel); if (el.isConnected) markViewed(el.dataset.reel); }, 1500)); }
    else { if (v) v.pause(); clearTimeout(viewTimers.get(el.dataset.reel)); viewTimers.delete(el.dataset.reel); }
  }), { root: feed, threshold: [0, 0.6, 1] });
  document.querySelectorAll('.reel').forEach(el => { reelsObs.observe(el); wireSeek(el); });
}
// The feed sits between the header and the bottom tabs.
function fitFeed() {
  const f = document.getElementById('reels-feed'); if (!f) return;
  const h = document.querySelector('header.top'), n = document.getElementById('navbar');
  f.style.top = Math.max(0, h ? h.getBoundingClientRect().bottom : 0) + 'px';
  const nb = n && !n.hidden ? Math.max(0, innerHeight - n.getBoundingClientRect().top) : 0;
  f.style.bottom = nb + 'px';
  // The new-post button sits just above the video's position bar.
  const fab = document.querySelector('.reel-fab'); if (fab) fab.style.bottom = (nb + 30) + 'px';
}
addEventListener('resize', () => { if (view === 'reels') fitFeed(); if (view === 'dm') fitCompose(); });
// In a conversation, Enter sends and Shift+Enter starts a new line (on a keyboard).
document.addEventListener('keydown', e => { if (e.target.matches && e.target.matches('[data-dm]') && e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); e.target.form.requestSubmit(); } });
// Sound is off until someone turns it on; after that every video plays with sound.
let reelMuted = true;
function playReel(el) {
  const v = el.querySelector('video'); if (!v || !v.src) return;
  v.muted = reelMuted; el.classList.remove('paused');
  v.play().catch(() => { v.muted = true; v.play().catch(() => { }); });
}
const fmtSec = t => { t = Math.max(0, Math.floor(t || 0)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
// Drag the bar to move through the video; the bar follows the video while it plays.
function wireSeek(el) {
  const v = el.querySelector('video'), s = el.querySelector('.rv-seek'), lab = el.querySelector('.rv-time');
  if (!v || !s || s.dataset.wired) return; s.dataset.wired = '1';
  let drag = false;
  const show = () => { lab.textContent = `${fmtSec(v.currentTime)} / ${fmtSec(v.duration)}`; };
  v.addEventListener('timeupdate', () => { if (!drag && v.duration) s.value = Math.round(v.currentTime / v.duration * 1000); });
  const start = () => { drag = true; lab.hidden = false; show(); };
  const end = () => { if (!drag) return; drag = false; lab.hidden = true; s.blur(); };
  s.addEventListener('pointerdown', start); s.addEventListener('touchstart', start, { passive: true });
  s.addEventListener('input', () => { if (!drag) start(); if (v.duration) { v.currentTime = s.value / 1000 * v.duration; show(); } });
  ['pointerup', 'pointercancel', 'touchend', 'change'].forEach(t => s.addEventListener(t, end));
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
    if (m.url) { const v = el.querySelector('video'); v.addEventListener('loadedmetadata', () => { if (v.videoHeight >= v.videoWidth * 1.15) v.classList.add('cover'); }, { once: true }); v.src = m.url; playReel(el); }
    else el.querySelectorAll('.rp-slide').forEach((s, i) => { if (m.imgs[i]) s.innerHTML = `<img src="${m.imgs[i]}" alt="">`; });
    el.classList.add('ready');
  } catch (e) { el.dataset.loaded = ''; el.querySelector('.reel-load').textContent = 'לא הצלחתי לטעון. בדקו את החיבור'; }
}
function reelLove(card, media) {
  const r = byId(S.reels, card.dataset.reel); if (!r) return;
  const burst = document.createElement('span'); burst.className = 'heart-burst'; burst.textContent = '\u2764\ufe0f'; media.appendChild(burst); setTimeout(() => burst.remove(), 900);
  haptic(10);
  if (viewer || poster) return;
  if ((r.reactions || {})[session()] !== 'love') { r.reactions = { ...(r.reactions || {}), [session()]: 'love' }; save(); patchReels(); }
}
// Reactions and comment counts change often; update them in place so a playing video keeps playing.
function patchReels() {
  const ids = [...document.querySelectorAll('.reel')].map(e => e.dataset.reel).join(), want = liveReels().map(r => r.id).join();
  if (ids !== want) { const f = document.getElementById('reels-feed'), y = f ? f.scrollTop : 0; render(); const g = document.getElementById('reels-feed'); if (g) g.scrollTop = y; return; }
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
    ${viewer || poster ? '' : `<form class="form cm-form" data-form="comment" data-reel="${r.id}"><div id="cm-reply" class="cm-reply" hidden></div><div class="mention-wrap"><textarea id="cm-t" name="text" rows="2" maxlength="500" placeholder="כתבו תגובה… אפשר לתייג עם @" data-mention required></textarea><div class="mention-box" hidden></div></div><button class="btn primary block">שליחה</button></form>`}`);
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
  const people = S.employees.length ? S.employees : Object.entries(S.names || {}).map(([id, name]) => ({ id, name }));
  const q = m[1], list = people.filter(e => e.name.includes(q)).slice(0, 6);
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
// Reels are no longer deleted automatically; a reel is removed only when its author or a manager deletes it.
let reelsCleaned = false;
async function cleanReels() {
  reelsCleaned = true;
}

/* ---------- display settings view ---------- */
const segCtl = (k, opts) => `<div class="seg-wrap" role="radiogroup">${opts.map(([v, l, style]) => `<button class="seg ${String(DS[k]) === String(v) ? 'on' : ''}" role="radio" aria-checked="${String(DS[k]) === String(v)}" data-action="ds" data-k="${k}" data-v="${v}" ${style ? `style="${style}"` : ''}>${l}</button>`).join('')}</div>`;
const tog = (k, l, sub) => `<button class="set-row" role="switch" aria-checked="${!!DS[k]}" data-action="ds-tog" data-k="${k}"><span class="grow"><b>${l}</b>${sub ? `<small>${sub}</small>` : ''}</span><span class="sw ${DS[k] ? 'on' : ''}"></span></button>`;
const grp = (label, val, body) => `<div class="set-group"><div class="set-label"><b>${label}</b>${val ? `<span>${val}</span>` : ''}</div>${body}</div>`;
function vDisplay() {
  const t = ROOT.getAttribute('data-theme'), dark = t === 'dark' || (!t && mq.matches);
  return back() + `<h2 class="vt">הגדרות תצוגה</h2>
  <p class="lead">ההגדרות נשמרות בטלפון הזה בלבד, כך שכל עובד מסדר את התצוגה לפי הנוחות שלו.</p>
  ${viewer || poster ? '' : `<div class="list"><button class="menu-item" data-action="nav" data-view="notif">${ic('bell')}<span class="grow">הגדרות התראות</span><small class="muted">על מה לקבל התראה, שעות שקט ושבת</small>${ic('chev', 'sm chev')}</button></div>`}
  <h3 class="sec">צבעים</h3>
  ${grp('מצב תצוגה', '', segCtl('theme', [['light', 'בהיר'], ['dark', 'כהה'], ['system', 'לפי המכשיר']]))}
  ${grp('צבע מבטא', ACC[DS.accent].n, `<div class="swatches">${Object.entries(ACC).map(([k, a]) => `<button class="sw-c ${DS.accent === k ? 'on' : ''}" style="--c:${a[dark ? 'd' : 'l'][0]}" data-action="ds" data-k="accent" data-v="${k}"><i></i>${a.n}</button>`).join('')}</div>`)}
  <div class="list">${tog('contrast', 'ניגודיות גבוהה', 'טקסט משני וקווי הפרדה כהים יותר, לקריאה בתאורה חזקה')}</div>
  <h3 class="sec">טקסט</h3>
  ${grp('גודל טקסט', `<span id="scale-val">${DS.scale}%</span>`, `<input type="range" id="ds-scale" min="80" max="140" step="5" value="${DS.scale}" data-ds-range="scale" aria-label="גודל טקסט"><div class="range-ends"><span>קטן</span><span>גדול</span></div>`)}
  ${grp('גופן', '', segCtl('font', [['system', 'אפל', 'font-family:-apple-system,system-ui,sans-serif'], ['Assistant', 'אסיסטנט', "font-family:'Assistant',sans-serif"], ['Heebo', 'היבו', "font-family:'Heebo',sans-serif"], ['Rubik', 'רוביק', "font-family:'Rubik',sans-serif"]]))}
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
  if (!navDir) navDir = replace ? 'pop' : TAB_VIEWS.includes(v) && TAB_VIEWS.includes(view) ? 'tab' : 'push';
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
  if (!navDir) navDir = 'pop';
  view = st.view || 'clock'; render(); window.scrollTo(0, 0);
});
/* ---------- motion: Apple-style springs. Interruptible, start from the on-screen value, carry the finger's velocity ---------- */
const reduceMotion = () => ROOT.classList.contains('no-motion') || !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
// A short tap of vibration on meaningful moments only (Android; iPhone browsers ignore it).
const haptic = p => { try { if (!reduceMotion() && navigator.vibrate) navigator.vibrate(p); } catch (e) { } };
const lerp = (a, b, t) => a + (b - a) * t;
// Sliding indicators: the highlight glides from where it was to the new tab or segment, like iOS.
const pillPos = {};
function slidePill(host, pill, target, key) {
  if (!host || !pill) return;
  if (!target) { pill.style.opacity = '0'; return; }
  const hr = host.getBoundingClientRect(), tr = target.getBoundingClientRect();
  const to = { x: tr.left - hr.left, w: tr.width, y: tr.top - hr.top, h: tr.height }, from = pillPos[key] || to;
  pillPos[key] = to; pill.style.opacity = '1';
  const set = t => { pill.style.transform = `translate3d(${lerp(from.x, to.x, t)}px,${to.y}px,0)`; pill.style.width = lerp(from.w, to.w, t) + 'px'; pill.style.height = to.h + 'px'; };
  if (from.x === to.x && from.w === to.w || reduceMotion()) return set(1);
  set(0); spring(0, 1, { damping: 0.85, response: 0.32, onUpdate: set });
}
function slideSegs(root = document) {
  root.querySelectorAll('.seg-wrap').forEach((w, i) => {
    let p = w.querySelector(':scope > .seg-pill'); if (!p) { p = document.createElement('span'); p.className = 'seg-pill'; p.setAttribute('aria-hidden', 'true'); w.prepend(p); }
    const first = w.querySelector('.seg'); const key = 'seg:' + view + ':' + (first ? (first.dataset.action || first.querySelector('input')?.name || '') : '') + ':' + i;
    slidePill(w, p, w.querySelector('.seg.on'), key);
  });
}
// Moving between screens: forward slides in from the leading edge, back from the other side, tabs cross-fade.
const TAB_VIEWS = ['clock', 'inv', 'deliv', 'reels', 'fun', 'more', 'alerts'];
let navDir = null;
function animateView(dir) {
  const v = document.querySelector('#main > .view'); if (!v || !dir) return;
  if (reduceMotion() || dir === 'none') return;
  const fixed = v.classList.contains('view-reels'), dx = dir === 'push' ? -42 : dir === 'pop' ? 42 : 0;
  const set = t => { v.style.opacity = String(dir === 'tab' ? lerp(0.35, 1, t) : t); if (!fixed && dx) v.style.transform = t >= 1 ? '' : `translate3d(${lerp(dx, 0, t)}px,0,0)`; };
  set(0); spring(0, 1, { damping: 1, response: dir === 'tab' ? 0.22 : 0.36, onUpdate: set, onDone: () => { v.style.opacity = ''; v.style.transform = ''; } });
}
// Swipe in from the screen edge to go back (the right edge, since the app reads right to left).
(() => {
  let st = null, hist = [];
  const backBtn = () => document.querySelector('#main [data-action=back]');
  document.addEventListener('touchstart', e => {
    st = null; if (layerOpen() || !backBtn() || e.touches.length !== 1) return;
    const t = e.touches[0]; if (t.clientX < innerWidth - 24) return;
    st = { x: t.clientX, y: t.clientY, on: false }; hist = [{ x: t.clientX, t: performance.now() }];
  }, { passive: true });
  document.addEventListener('touchmove', e => {
    if (!st) return; const t = e.touches[0], dx = t.clientX - st.x, dy = t.clientY - st.y;
    if (!st.on) { if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { st = null; return; } if (dx < -8) st.on = true; else return; }
    if (e.cancelable) e.preventDefault();
    const v = document.querySelector('#main > .view'); if (!v) return;
    const off = dx < 0 ? dx : rubber(dx, innerWidth);
    v.style.transform = `translate3d(${off}px,0,0)`; v.style.opacity = String(1 - Math.min(0.35, Math.abs(off) / innerWidth * 0.5));
    hist.push({ x: t.clientX, t: performance.now() }); if (hist.length > 6) hist.shift();
  }, { passive: false });
  const end = () => {
    if (!st) return; const on = st.on; st = null; if (!on) return;
    const v = document.querySelector('#main > .view'); if (!v) return;
    const a = hist[0], b = hist[hist.length - 1], vel = b.t > a.t ? (b.x - a.x) / (b.t - a.t) * 1000 : 0, x = liveX(v);
    if (-(x + project(vel)) > innerWidth * 0.35 && vel < 100) {
      spring(x, -innerWidth, { damping: 1, response: 0.25, velocity: vel, onUpdate: y => { v.style.transform = `translate3d(${y}px,0,0)`; v.style.opacity = String(Math.max(0.3, 1 + y / innerWidth)); }, onDone: () => { const bb = backBtn(); haptic(6); navDir = 'pop'; if (bb) bb.click(); } });
    } else spring(x, 0, { damping: 1, response: 0.3, velocity: vel, onUpdate: y => { v.style.transform = y ? `translate3d(${y}px,0,0)` : ''; v.style.opacity = String(1 - Math.min(0.35, Math.abs(y) / innerWidth * 0.5)); }, onDone: () => { v.style.transform = ''; v.style.opacity = ''; } });
  };
  document.addEventListener('touchend', end); document.addEventListener('touchcancel', end);
})();
// Defined like Apple's springs: damping ratio (1 = settles without bounce) and response (seconds; not a fixed duration).
function spring(from, to, { damping = 1, response = 0.35, velocity = 0, onUpdate, onDone } = {}) {
  const k = (2 * Math.PI / response) ** 2, c = 4 * Math.PI * damping / response;
  let x = from, v = velocity, last = performance.now(), raf = 0, stopped = false;
  const step = now => {
    if (stopped) return;
    const dt = Math.min(0.064, Math.max(0, (now - last) / 1000)); last = now;
    for (let n = Math.max(1, Math.ceil(dt / 0.004)), h = dt / n; n > 0; n--) { const a = -k * (x - to) - c * v; v += a * h; x += v * h; }
    if (Math.abs(x - to) < 0.4 && Math.abs(v) < 8) { x = to; onUpdate(x); if (onDone) onDone(); return; }
    onUpdate(x); raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return { stop() { stopped = true; cancelAnimationFrame(raf); } };
}
// Where a flick would come to rest (Apple's projection), and soft resistance past an edge.
const project = (v, d = 0.99) => (v / 1000) * d / (1 - d);
const rubber = (o, dim, c = 0.55) => (o * dim * c) / (dim + c * Math.abs(o));
const liveY = el => { const t = getComputedStyle(el).transform; return t && t !== 'none' ? new DOMMatrixReadOnly(t).m42 : 0; };
const liveX = el => { const t = getComputedStyle(el).transform; return t && t !== 'none' ? new DOMMatrixReadOnly(t).m41 : 0; };
let sheetAnim = null, sheetOutVel = 0;
function sheetSet(wrap, y) {
  const s = wrap.querySelector('.sheet'), b = wrap.querySelector('.backdrop'); if (!s) return;
  s.style.transform = y ? `translate3d(0,${y}px,0)` : '';
  const p = Math.max(0, Math.min(1, 1 - Math.max(0, y) / (s.offsetHeight || 1)));
  if (b) b.style.opacity = String(p);
  // Dim to focus: the screen behind recedes slightly while the sheet is up.
  const m = document.querySelector('main');
  if (m && !document.querySelector('.reels-feed')) m.style.transform = p > 0.001 && !reduceMotion() ? `scale(${1 - 0.035 * p})` : '';
}
function animSheet(wrap, from, to, opts) {
  if (sheetAnim && sheetAnim.wrap === wrap) sheetAnim.anim.stop();
  const anim = spring(from, to, { ...opts, onUpdate: y => sheetSet(wrap, y) });
  sheetAnim = { wrap, anim };
}
// Sheets rise from the bottom edge and leave the same way.
function sheetIn(wrap) {
  const s = wrap.querySelector('.sheet'); if (!s || reduceMotion()) return;
  const h = s.offsetHeight; sheetSet(wrap, h);
  animSheet(wrap, h, 0, { damping: 1, response: 0.32 });
}
function sheetOut(wrap, velocity) {
  wrap.classList.add('leaving'); document.body.appendChild(wrap);
  const s = wrap.querySelector('.sheet');
  if (!s || reduceMotion()) { const m = document.querySelector('main'); if (m) m.style.transform = ''; wrap.style.transition = 'opacity .15s'; requestAnimationFrame(() => { wrap.style.opacity = '0'; }); setTimeout(() => wrap.remove(), 170); return; }
  animSheet(wrap, liveY(s), s.offsetHeight + 24, { damping: 1, response: 0.28, velocity, onDone: () => wrap.remove() });
}
// Pull a sheet down to close it: it follows the finger 1:1, resists upward, and a flick decides by momentum.
function wireSheetDrag(wrap) {
  const s = wrap.querySelector('.sheet'), g = s && s.querySelector('.sheet-grab'); if (!s) return;
  let st = null, dragging = false, hist = [];
  const blocked = t => t.closest('input,textarea,select,button,a,label,.rp-track,.mention-box,.cms');
  const down = (y, t, grab) => { if (!grab && (s.scrollTop > 0 || blocked(t))) return; st = { y, grab }; dragging = false; hist = [{ y, t: performance.now() }]; };
  const move = (y, e) => {
    if (!st) return;
    if (!dragging) {
      const dy = y - st.y;
      if (dy > 8 || (st.grab && Math.abs(dy) > 3)) { dragging = true; if (sheetAnim && sheetAnim.wrap === wrap) sheetAnim.anim.stop(); st.base = liveY(s); st.y = y; s.classList.add('dragging'); }
      else if (dy < -8) { st = null; return; }
      else return;
    }
    if (e.cancelable) e.preventDefault();
    let off = st.base + (y - st.y); if (off < 0) off = -rubber(-off, s.offsetHeight);
    sheetSet(wrap, off);
    hist.push({ y, t: performance.now() }); if (hist.length > 6) hist.shift();
  };
  const up = () => {
    if (!st) return; const was = dragging; st = null; dragging = false; s.classList.remove('dragging'); if (!was) return;
    const a = hist[0], b = hist[hist.length - 1], v = b.t > a.t ? (b.y - a.y) / (b.t - a.t) * 1000 : 0, y = liveY(s);
    if (y + project(v) > s.offsetHeight * 0.45 && v > -100) { sheetOutVel = v; haptic(6); closeSheet(); }
    else animSheet(wrap, y, 0, { damping: Math.abs(v) > 300 ? 0.8 : 1, response: 0.3, velocity: v });
  };
  s.addEventListener('touchstart', e => down(e.touches[0].clientY, e.target, !!e.target.closest('.sheet-grab')), { passive: true });
  s.addEventListener('touchmove', e => move(e.touches[0].clientY, e), { passive: false });
  s.addEventListener('touchend', up); s.addEventListener('touchcancel', up);
  if (g) {
    g.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') return; g.setPointerCapture(e.pointerId); down(e.clientY, g, true); });
    g.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') move(e.clientY, e); });
    g.addEventListener('pointerup', e => { if (e.pointerType === 'mouse') up(); });
  }
}
function sheet(html) {
  const wasOpen = layerOpen(), layer = document.getElementById('layer');
  layer.innerHTML = `<div class="sheet-wrap"><div class="backdrop" data-action="close"></div><div class="sheet" role="dialog" aria-modal="true"><div class="sheet-grab" aria-hidden="true"></div><button class="sheet-x" data-action="close" aria-label="סגירה">${ic('x', 'sm')}</button>${html}</div></div>`;
  const wrap = layer.firstElementChild; wireSheetDrag(wrap); if (!wasOpen) sheetIn(wrap); else { const m = document.querySelector('main'); if (m && !document.querySelector('.reels-feed') && !reduceMotion()) m.style.transform = 'scale(0.965)'; }
  slideSegs(wrap);
  if (!wasOpen && !popSkip) try { history.pushState({ ...(history.state || {}), sheet: 1 }, ''); } catch (e) { }
}
function closeSheet() {
  const wasOpen = layerOpen(), layer = document.getElementById('layer');
  const v = sheetOutVel; sheetOutVel = 0;
  if (scanStop) { scanStop(); scanStop = null; }
  if (layer.firstElementChild) sheetOut(layer.firstElementChild, v);
  layer.innerHTML = ''; pinNext = null;
  if (wasOpen && history.state && history.state.sheet) { popSkip++; try { history.back(); } catch (e) { popSkip--; } }
  if (renderPending) render();
}
function toast(t) { let el = document.querySelector('.toast'); if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); } el.textContent = t; el.hidden = false; requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show'))); clearTimeout(toastT); toastT = setTimeout(() => { el.classList.remove('show'); toastT = setTimeout(() => { el.hidden = true; }, 280); }, 3000); }
// No more manager PIN: what an employee may do comes from the permissions the manager gave them.
function openPin() { toast('אין לך הרשאה לפעולה הזו. אפשר לבקש מהמנהל'); }
function drawPin(err) {
  const p = document.getElementById('pin'); if (!p) return; const L = store.pinLength();
  p.innerHTML = `<h3>סיסמת מנהל</h3><p class="muted">הזן קוד בן ${L} ספרות</p>
  ${err ? (haptic([20, 50, 20]), '') : ''}<div class="dots ${err ? 'shake' : ''}">${[...Array(L)].map((_, i) => `<i class="${i < pinBuf.length ? 'f' : ''}"></i>`).join('')}</div>
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
const needMgr = fn => viewer || (manager && !ro) ? fn() : openPin();

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
  // One tap pauses or plays; a double tap sends a heart, as on Instagram.
  'reel-tap': (d, el) => {
    const card = el.closest('.reel'), now = Date.now();
    if (now - (card._lt || 0) < 300) { card._lt = 0; clearTimeout(card._tt); return reelLove(card, el); }
    card._lt = now; clearTimeout(card._tt);
    card._tt = setTimeout(() => { const v = el.querySelector('video'); if (!v || !v.src) return; if (v.paused) playReel(card); else { v.pause(); card.classList.add('paused'); } }, 260);
  },
  'cap-more': (d, el) => el.classList.toggle('open'),
  'reel-sound': (d, el) => { reelMuted = !reelMuted; document.querySelectorAll('.reel video').forEach(v => { v.muted = reelMuted; }); document.querySelectorAll('.rv-sound').forEach(b => { b.textContent = reelMuted ? '🔇' : '🔊'; b.setAttribute('aria-label', reelMuted ? 'הפעלת קול' : 'השתקה'); }); },
  'reply-to': d => { replyTo = d.id; const b = document.getElementById('cm-reply'); b.hidden = false; b.innerHTML = `משיב/ה ל${esc(d.name)} <button type="button" class="link-btn" data-action="reply-clear">ביטול</button>`; const t = document.getElementById('cm-t'); if (d.by && d.by !== session()) { mentionTags.set(d.by, d.name); if (!t.value.includes('@' + d.name)) t.value = `@${d.name} ` + t.value; } t.focus(); },
  'reply-clear': () => { replyTo = null; const b = document.getElementById('cm-reply'); if (b) b.hidden = true; },
  'mention-pick': (d, el) => {
    const box = el.closest('.mention-box'), t = box.parentElement.querySelector('textarea'), e = emp(d.id), pos = t.selectionStart;
    const before = t.value.slice(0, pos).replace(/@([^\s@]*)$/, '@' + e.name + ' '); t.value = before + t.value.slice(pos);
    mentionTags.set(e.id, e.name); box.hidden = true; t.focus(); t.selectionStart = t.selectionEnd = before.length;
  },
  'cm-del': d => { S.reelComments = S.reelComments.filter(c => c.id !== d.id && !(canE('admin') && c.parent === d.id)); save(); refreshComments(); patchReels(); },
  'reel-del': d => sheet(`<h3>למחוק את הפוסט?</h3><p class="muted" style="margin-bottom:16px">הפוסט והתגובות שלו יימחקו מהאפליקציה לכולם.</p><div class="actions"><button class="btn" data-action="close">ביטול</button><button class="btn primary" data-action="reel-del-yes" data-id="${d.id}">מחיקה</button></div>`),
  'reel-del-yes': async d => { const r = byId(S.reels, d.id); closeSheet(); if (r) { await store.deleteReel(r); MEDIA.delete(r.id); } render(); toast('הפוסט נמחק'); },
  'reel-save': async d => { const r = byId(S.reels, d.id); if (!r) return; toast('מכין את הקובץ…'); const ids = await (async () => { const was = r.backedUp; r.backedUp = false; const all = S.reels; S.reels = [r]; try { return await backupReels(); } finally { S.reels = all; r.backedUp = was; } })(); toast(ids.length ? 'הקבצים ירדו למכשיר' : 'ההורדה נכשלה'); },
  'viewer-set': () => needMgr(() => sheet(`<h3>משתמש בקרה</h3><form class="form" data-form="viewer" style="margin-top:12px"><div class="two"><div class="field"><label for="vw-p">טלפון</label><input id="vw-p" name="phone" class="ltr" inputmode="numeric" value="${esc(S.viewerLogin ? S.viewerLogin.phone : '0000000000')}" required></div><div class="field"><label for="vw-n">מספר עובד</label><input id="vw-n" name="num" inputmode="numeric" value="${esc(S.viewerLogin ? S.viewerLogin.num : '1234')}" required></div></div><button class="btn primary block">שמירה</button></form>`)),
  'poster-set': () => needMgr(() => sheet(`<h3>חדשות מרקט</h3><p class="muted" style="margin-top:6px">פרטי הכניסה של חשבון הרילסים.</p><form class="form" data-form="poster" style="margin-top:12px"><div class="two"><div class="field"><label for="ps-p">טלפון</label><input id="ps-p" name="phone" class="ltr" inputmode="numeric" value="${esc(S.posterLogin ? S.posterLogin.phone : '')}" required></div><div class="field"><label for="ps-n">מספר עובד</label><input id="ps-n" name="num" inputmode="numeric" value="${esc(S.posterLogin ? S.posterLogin.num : '')}" required></div></div><button class="btn primary block">שמירה</button></form>`)),
  'poster-off': () => needMgr(async () => { const r = await store.setPoster(null); render(); toast(r.error || 'חשבון חדשות מרקט כובה'); }),
  'push-on': async () => {
    closeSheet();
    if (pushStatus === 'denied') return toast('ההתראות חסומות. אפשר להפעיל אותן בהגדרות הטלפון › אפליקציות › שאבעס מרקט › התראות');
    if (pushStatus === 'update') return toast('כדי לקבל התראות צריך להתקין את הגרסה החדשה של האפליקציה');
    if (pushStatus === 'unsupported') return toast(/iPhone|iPad/.test(navigator.userAgent) ? 'באייפון: פתחו בספארי, שיתוף › הוספה למסך הבית, ופתחו את האפליקציה משם' : 'הדפדפן הזה לא תומך בהתראות');
    await initPush(true);
    toast(pushStatus === 'on' ? 'ההתראות הופעלו' : pushStatus === 'denied' ? 'ההתראות נחסמו. אפשר לשנות בהגדרות הטלפון' : 'לא הצלחתי להפעיל התראות. נסו שוב');
    render();
  },
  'pp-tog': d => {
    if (!pp) return; pp[d.k] = !pp[d.k]; haptic(6); savePP(); render();
  },
  'g-login': async () => {
    if (busy) return; busy = true; render();
    const r = await store.googleLogin();
    if (r.redirect) return;
    busy = false;
    if (r.ok) { view = DS.home || 'clock'; monthChecked = false; render(); toast('שלום ' + first(cur().name)); initPush(isNativeApp()); return; }
    render(); if (r.error) toast(r.error);
  },
  'shared-login': () => { sharedLogin = true; render(); },
  'sync-info': () => { const t = syncNow(); if (t) toast(t.line); },
  'geo-tog': () => needMgr(() => { geoCfg.on = !geoCfg.on; geoSave(); haptic(6); render(); toast(geoCfg.on ? 'סגירת משמרת לפי מיקום הופעלה' : 'סגירת משמרת לפי מיקום כובתה'); }),
  'geo-set': d => needMgr(() => { geoCfg[d.k] = +d.v; geoSave(); haptic(6); render(); }),
  'geo-here': () => needMgr(async () => {
    if (geoBusy) return; geoBusy = true; render();
    try {
      const p = await geoOnce(); geoCfg.lat = +p.lat.toFixed(6); geoCfg.lng = +p.lng.toFixed(6); geoCfg.acc = Math.round(p.acc); geoSave();
      toast(p.acc > 60 ? `המיקום נשמר, בדיוק של כ-${Math.round(p.acc)} מ׳. ליד חלון או בכניסה יוצא מדויק יותר` : 'מיקום החנות נשמר');
    } catch (e) { toast(e === 'denied' ? 'אין הרשאה למיקום. אשרו מיקום בהגדרות הטלפון ונסו שוב' : 'לא הצלחתי לאתר מיקום. נסו שוב'); }
    geoBusy = false; render();
  }),
  'geo-clear': () => needMgr(() => { geoCfg.lat = null; geoCfg.lng = null; geoCfg.acc = null; geoSave(); render(); toast('מעכשיו: לפי המקום שבו העובד נכנס למשמרת'); }),
  'geo-retry': async () => {
    if (await geoSettings()) return;
    await geoStop(); geoErr = ''; geoMode = ''; geoSync();
    setTimeout(() => { if (geoErr === 'denied') toast(/iPhone|iPad/.test(navigator.userAgent) ? 'באייפון: הגדרות › אפליקציות › Safari › מיקום › לאפשר' : 'אשרו מיקום לאתר בהגדרות הדפדפן (סמל המנעול ליד הכתובת)'); }, 1500);
  },
  'push-test': async () => {
    try { await store.testPush(); toast('נשלחה התראת ניסיון. היא תקפוץ תוך כמה שניות'); } catch (e) { toast('לא הצלחתי לשלוח'); }
  },
  'push-later': () => { try { localStorage.setItem('push-later', String(Date.now())); } catch (e) { } render(); },
  'dm-open': d => { chatWith = d.id; chatDraft = ''; go('dm'); },
  // Delete a message: your own for everyone or just for you; one you received just for you.
  'dm-msg': d => {
    const m = byId(S.messages || [], d.id); if (!m) return;
    const mine = m.from === session(); haptic(8);
    sheet(`<h3>${mine ? 'ההודעה שלך' : 'הודעה מ' + esc(emp(m.from).name || '')}</h3><div class="dm-peek ${mine ? 'me' : ''}">${esc(m.text).replace(/\n/g, '<br>')}</div><small class="muted">${fmtD(m.ts)} ${fmtT(m.ts)}</small>
    <div class="dm-acts">${mine ? `<button class="btn block danger" data-action="dm-del-all" data-id="${m.id}">${ic('trash', 'sm')}מחיקה אצל כולם</button>` : ''}<button class="btn block ${mine ? '' : 'danger'}" data-action="dm-del-me" data-id="${m.id}">${ic('trash', 'sm')}מחיקה אצלי בלבד</button><button class="btn block" data-action="dm-copy" data-id="${m.id}">${ic('copy', 'sm')}העתקה</button><button class="btn block" data-action="close">ביטול</button></div>`);
  },
  'dm-del-all': d => {
    const m = byId(S.messages || [], d.id); if (!m || m.from !== session()) return;
    S.messages = S.messages.filter(x => x.id !== d.id); save(); closeSheet(); render(); toast('ההודעה נמחקה אצל כולם');
  },
  'dm-del-me': d => {
    const m = byId(S.messages || [], d.id); if (!m) return;
    m.hide = [...new Set([...(m.hide || []), session()])]; if (m.to === session()) m.read = true;
    save(); closeSheet(); render(); toast('ההודעה נמחקה אצלך');
  },
  'dm-copy': d => { const m = byId(S.messages || [], d.id); if (m) copyText(m.text); closeSheet(); },
  'dm-clear': () => sheet(`<h3>למחוק את כל השיחה?</h3><p class="muted" style="margin-bottom:16px">כל ההודעות בשיחה עם ${esc(emp(chatWith).name || '')} יימחקו אצלך. אצל ${esc(emp(chatWith).name || '')} הן יישארו.</p><div class="actions"><button class="btn" data-action="close">ביטול</button><button class="btn primary danger" data-action="dm-clear-yes">מחיקת השיחה</button></div>`),
  'dm-clear-yes': () => {
    const me = session();
    myMsgs().filter(m => m.pair.includes(chatWith)).forEach(m => { m.hide = [...new Set([...(m.hide || []), me])]; if (m.to === me) m.read = true; });
    save(); closeSheet(); render(); toast('השיחה נמחקה אצלך');
  },
  'pos-scan': () => needMgr(() => startScan()),
  // An item without a barcode or a fixed price: any name and any amount.
  'pos-free': () => sheet(`<h3>סכום חופשי</h3><p class="muted">לפריט בלי ברקוד או בלי מחיר קבוע. השם לא חובה.</p>
    <form class="form" data-form="pos-free" style="margin-top:12px"><div class="field"><label for="pf-n">שם הפריט</label><input id="pf-n" name="name" maxlength="60" placeholder="פריט כללי" autocomplete="off"></div>
    <div class="field-row"><div class="field"><label for="pf-p">סכום (₪)</label><input id="pf-p" name="price" type="number" min="0.01" step="0.01" inputmode="decimal" required></div><div class="field"><label for="pf-q">כמות</label><input id="pf-q" name="qty" type="number" min="1" step="1" value="1" inputmode="numeric"></div></div>
    <button class="btn primary block">הוספה לחשבון</button></form>`),
  // A weighed item: price per kilo and weight are typed each time, the amount is calculated.
  'pos-weigh': () => sheet(`<h3>פריט שקיל</h3><p class="muted">רושמים מחיר לקילו ומשקל, והסכום מחושב לבד.</p>
    <form class="form" data-form="pos-weigh" style="margin-top:12px"><div class="field"><label for="pw-n">שם הפריט</label><input id="pw-n" name="name" maxlength="60" placeholder="פריט שקיל" autocomplete="off"></div>
    <div class="field-row"><div class="field"><label for="pw-k">מחיר לק״ג (₪)</label><input id="pw-k" name="perKg" type="number" min="0.01" step="0.01" inputmode="decimal" required data-pw></div>
    <div class="field"><label for="pw-w">משקל</label><div class="pw-wt"><input id="pw-w" name="weight" type="number" min="0.001" step="0.001" inputmode="decimal" required data-pw><select name="unit" data-pw aria-label="יחידת משקל"><option value="kg">ק״ג</option><option value="g">גרם</option></select></div></div></div>
    <div class="pw-total"><span>סה״כ</span><b class="num" id="pw-total">₪0.00</b></div>
    <button class="btn primary block">הוספה לחשבון</button></form>`),
  'pos-add': d => { const p = findProd(d.k); if (!p) return; posAdd(p); posQ = ''; haptic(8); render(); },
  'pos-inc': d => { pos.lines[+d.i].qty++; posKeep(); render(); },
  'pos-dec': d => { const l = pos.lines[+d.i]; if (!l) return; l.qty--; if (l.qty <= 0) pos.lines.splice(+d.i, 1); posKeep(); render(); },
  'pos-pay': d => { pos.method = d.m; posKeep(); render(); },
  'pos-clear': () => { pos.lines = []; posKeep(); render(); },
  'pos-price': d => { const l = pos.lines[+d.i]; if (!l) return; sheet(`<h3>מחיר ליחידה</h3><p class="muted">${esc(l.name)}</p><form class="form" data-form="pos-price" data-i="${d.i}" style="margin-top:12px"><div class="field"><label for="pp-x">מחיר (₪)</label><input id="pp-x" name="price" type="number" min="0" step="0.1" inputmode="decimal" value="${l.price || ''}" required></div><button class="btn primary block">שמירה</button></form>`); },
  'pos-save': () => needMgr(() => {
    if (!pos.lines.length) return toast('החשבון ריק');
    const s = { id: uid(), no: nextSaleNo(), till: String(pos.till || '').trim(), method: pos.method, lines: pos.lines.map(({ name, bc, qty, price }) => ({ name, bc, qty, price })), total: posTotal(), by: session(), ts: Date.now() };
    S.sales = S.sales || []; S.sales.push(s); save();
    pos = { lines: [], method: pos.method, till: '' }; posKeep(); haptic([10, 40, 10]); render(); receiptSheet(s);
  }),
  'sale-open': d => { const s = byId(S.sales || [], d.id); if (s) receiptSheet(s); },
  'sale-pdf': d => { const s = byId(S.sales || [], d.id); if (s) salePdf(s, false); },
  'sale-share': d => { const s = byId(S.sales || [], d.id); if (s) salePdf(s, true); },
  'sale-del': d => sheet(`<h3>לבטל את החשבון?</h3><p class="muted" style="margin-bottom:16px">החשבון יימחק מהרשימה.</p><div class="actions"><button class="btn" data-action="close">חזרה</button><button class="btn primary" data-action="sale-del-yes" data-id="${d.id}">ביטול החשבון</button></div>`),
  'sale-del-yes': d => needMgr(() => { S.sales = (S.sales || []).filter(s => s.id !== d.id); save(); closeSheet(); render(); toast('החשבון בוטל'); }),
  'prod-nobc': () => { prodNoBc = !prodNoBc; prodShown = 60; render(); },
  'prod-more': () => { prodShown += 120; refreshProds(); },
  'inv-more': () => { invShown += 200; const b = document.getElementById('inv-all'); if (b) b.innerHTML = invAllHtml(); watchMore(); },
  'prod-new': () => needMgr(() => prodSheet(null)),
  'prod-open': d => { const p = findProd(d.k); if (p) prodSheet(p); },
  'prod-del': d => needMgr(() => { const p = findProd(d.k); if (!p) return; sheet(`<h3>למחוק את ${esc(p.name)}?</h3><p class="muted" style="margin-bottom:16px">המוצר יימחק מרשימת המוצרים.</p><div class="actions"><button class="btn" data-action="close">ביטול</button><button class="btn primary" data-action="prod-del-yes" data-k="${p.key}">מחיקה</button></div>`); }),
  'prod-del-yes': d => { const id = d.k.slice(2); S.catalog = (S.catalog || []).filter(c => c.id !== id); S.catalogDirty = true; save(); closeSheet(); render(); toast('המוצר נמחק'); },
  'prod-x15': () => { const c = document.getElementById('pp-c'), s = document.getElementById('pp-s'); const v = parseFloat(c.value || c.placeholder); if (!(v > 0)) return toast('צריך מחיר ספק כדי לחשב'); s.value = (Math.round(v * 1.5 * 10) / 10).toFixed(1); },
  'viewer-off': () => needMgr(async () => { const r = await store.setViewer(null); render(); toast(r.error || 'משתמש הבקרה כובה'); }),
  nav: d => go(d.view === 'login' ? 'clock' : d.view),
  back: d => { if (history.state && history.state.d > 0) history.back(); else go(d.view === 'login' ? 'clock' : d.view, true); },
  'item-bulk': () => needMgr(() => sheet(`<h3>הוספת פריטים מרשימה</h3><form class="form" data-form="bulk" style="margin-top:12px">
    <div class="field"><label for="bk-c">מחלקה</label><select id="bk-c" name="cat">${catOpts('drinks', SUBS[0])}</select></div>
    <div class="field"><label for="bk-t">רשימת פריטים · כל שורה פריט</label><textarea id="bk-t" name="list" rows="10" required placeholder="קולה פחית&#10;ספרייט פחית"></textarea><small>שורות ריקות ופריטים שכבר קיימים במחלקה מדולגים. הכמות מתחילה ב-0.</small></div>
    <button class="btn primary block">הוספה למלאי</button></form>`)),
  'owner-yes': async d => { const r = await (store.setOwner ? store.setOwner(d.id || session()) : store.claimOwner()); closeSheet(); render(); toast(r.error || `${emp(d.id || session()).name} נקבע/ה כבעל הבית`); },
  'emp-shifts': d => { const e = emp(d.id), now = Date.now(), ws = weekStart(now), mk = monthKey(now), own = !!store.isOwner?.();
    const list = S.shifts.filter(s => s.empId === e.id && s.status !== 'rejected' && (hoursRange === 'week' ? s.start >= ws : monthKey(s.start) === mk)).sort((a, b) => b.start - a.start);
    sheet(`<h3>${esc(e.name)} · משמרות ${hoursRange === 'week' ? 'השבוע' : 'החודש'}</h3>${own ? '' : '<p class="hint">רק בעל הבית יכול לערוך משמרות.</p>'}<div class="list" style="margin-top:10px">${list.map(s => `<div class="row"><div class="row-main"><div class="row-title">${fmtD(s.start)} ${s.end && !sameDay(s.start, s.end) ? '→ ' + fmtD(s.end) : ''}</div><div class="row-sub num">${fmtT(s.start)} – ${s.end ? fmtT(s.end) : 'פתוחה'} · ${fmtH(dur(s))} ש׳ ${s.status === 'pending' ? '<span class="pill pend">ממתין</span>' : ''}${s.editedBy ? '<span class="pill">נערך</span>' : ''}</div></div>${own ? `<button class="btn sm" data-action="shift-edit" data-id="${s.id}">עריכה</button>` : ''}</div>`).join('') || '<div class="row muted">אין משמרות בטווח הזה.</div>'}</div>`); },
  'shift-edit': d => { if (!store.isOwner?.()) return toast('רק בעל הבית יכול לערוך משמרות'); const s = byId(S.shifts, d.id); if (!s) return; const hm = t => { const x = new Date(t); return pad(x.getHours()) + ':' + pad(x.getMinutes()); };
    sheet(`<h3>עריכת משמרת · ${esc(emp(s.empId).name)}</h3><form class="form" data-form="shift-edit" data-id="${s.id}" style="margin-top:12px">
    <div class="two"><div class="field"><label for="se-d1">תאריך כניסה</label><input id="se-d1" name="d1" type="date" value="${dateKey(s.start)}" required></div><div class="field"><label for="se-t1">שעת כניסה</label><input id="se-t1" name="t1" type="time" value="${hm(s.start)}" required></div></div>
    <div class="two"><div class="field"><label for="se-d2">תאריך יציאה</label><input id="se-d2" name="d2" type="date" value="${s.end ? dateKey(s.end) : ''}" ${s.end ? 'required' : ''}></div><div class="field"><label for="se-t2">שעת יציאה</label><input id="se-t2" name="t2" type="time" value="${s.end ? hm(s.end) : ''}" ${s.end ? 'required' : ''}></div></div>
    ${s.end ? '' : '<p class="hint">המשמרת עדיין פתוחה. אם ממלאים יציאה, היא תיסגר.</p>'}
    <button class="btn primary block">שמירת השינויים</button></form><button class="btn danger block" style="margin-top:10px" data-action="shift-del" data-id="${s.id}">מחיקת המשמרת</button>`); },
  'shift-del': d => { const s = byId(S.shifts, d.id); if (!s) return; sheet(`<h3>למחוק את המשמרת?</h3><p class="muted" style="margin-bottom:16px">${esc(emp(s.empId).name)} · ${fmtD(s.start)} ${fmtT(s.start)}. השעות יירדו מהשכר.</p><div class="actions"><button class="btn" data-action="close">ביטול</button><button class="btn primary" data-action="shift-del-yes" data-id="${s.id}">מחיקה</button></div>`); },
  'shift-del-yes': d => { if (!store.isOwner?.()) return; S.shifts = S.shifts.filter(s => s.id !== d.id); save(); closeSheet(); render(); toast('המשמרת נמחקה'); },
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
  pin: () => openPin(),
  key: d => pinKey(d.k),
  lock: () => { },
  close: closeSheet,
  'fill-login': d => { const p = document.getElementById('lg-p'), n = document.getElementById('lg-n'); if (p) p.value = fmtPhone(d.p); if (n) n.value = d.n; },
  account: () => {
    const e = cur(); sheet(`<div class="emp-head" style="margin-bottom:14px">${avatar(e, 'xl')}<div><h3>${esc(e.name)}</h3>${poster ? '<div class="muted">משתמש להעלאת רילסים בלבד</div>' : `<div class="muted num">עובד מס׳ ${esc(e.num)} · <span class="ltr">${fmtPhone(e.phone)}</span></div>`}<label class="link-btn">${ic('camera', 'sm')}${ePhoto(e.id) ? 'החלפת התמונה שלי' : 'הוספת תמונה שלי'}<input type="file" accept="image/*" data-emp-photo="${e.id}" hidden></label></div></div>
    <div class="list">${poster || viewer ? '' : `<button class="menu-item" data-action="nav-close" data-view="notif">${ic('bell')}<span class="grow">הגדרות התראות</span><small class="muted">${PUSH_TXT[pushStatus] || ''}</small>${ic('chev', 'sm chev')}</button>`}<button class="menu-item" data-action="nav-close" data-view="display">${ic('eye')}<span class="grow">הגדרות תצוגה</span>${ic('chev', 'sm chev')}</button><button class="menu-item" data-action="logout">${ic('out')}<span class="grow">התנתקות</span></button></div>`);
  },
  'nav-close': d => { closeSheet(); view = d.view; render(); window.scrollTo(0, 0); },
  logout: async () => { closeSheet(); await store.logout(); view = 'clock'; render(); toast('התנתקת'); },
  clock: () => {
    const me = cur(), o = openShift(me.id);
    if (o) { geoEnd(o.id); o.end = Date.now(); o.status = 'approved'; delete o.allowUntil; toast(`יצאת מהמשמרת · ${fmtH(dur(o))} ש׳${DS.showPay ? ' · ' + money(dur(o) * me.wage) : ''}`); }
    else { const id = uid(), t = Date.now(); S.shifts.push({ id, empId: me.id, start: t, end: null, status: 'open', source: 'clock' }); geoBegin(id, t); toast('נכנסת למשמרת. עבודה נעימה'); }
    haptic(o ? [10, 60, 10] : 14); save(); render();
  },
  'req-hours': () => sheet(`<h3>בקשת אישור שעות</h3><p class="muted" style="margin-bottom:14px">לשעות שלא הוחתמו בשעון. הבקשה תישלח למנהל המערכת.</p>
    <form class="form" data-form="req"><div class="field"><label for="rq-d">תאריך כניסה</label><input id="rq-d" name="date" type="date" max="${dateKey(Date.now())}" value="${dateKey(Date.now())}" required></div>
    <div class="two"><div class="field"><label for="rq-f">שעת כניסה</label><input id="rq-f" name="from" type="time" value="08:00" required></div><div class="field"><label for="rq-t">שעת יציאה</label><input id="rq-t" name="to" type="time" value="16:00" required></div></div>
    <div class="field"><label for="rq-e">תאריך יציאה</label><input id="rq-e" name="endDate" type="date" max="${dateKey(Date.now())}" value="${dateKey(Date.now())}" required><small>אם המשמרת נגמרה אחרי חצות, בוחרים כאן את היום שאחרי.</small></div>
    <div class="field"><label for="rq-n">הסבר קצר</label><textarea id="rq-n" name="note" placeholder="למשל: הטלפון נגמר לי בסוללה"></textarea></div>
    <button class="btn primary block">שליחה לאישור</button></form>`),
  'inv-tab': d => { if (d.tab === 'snacks' && !invAll) return openPin(); invTab = d.tab; render(); },
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
  // Tapping the rating a task already has clears it.
  'task-rate': d => { const t = byId(S.tasks, d.id); if (!t) return; const v = +d.v; if (t.rating === v) delete t.rating; else t.rating = v; haptic(8); save(); render(); },
  'task-unrate': d => { const t = byId(S.tasks, d.id); if (!t) return; delete t.rating; save(); render(); },
  'emp-unrate': d => { const e = emp(d.id), n = empRating(d.id).n; sheet(`<h3>למחוק את הכוכבים של ${esc(e.name)}?</h3><p class="muted" style="margin-bottom:16px">הדירוג יימחק מ-${n} משימות. המשימות עצמן נשארות.</p><div class="actions"><button class="btn" data-action="close">ביטול</button><button class="btn primary" data-action="emp-unrate-yes" data-id="${d.id}">מחיקת הכוכבים</button></div>`); },
  'emp-unrate-yes': d => { S.tasks.forEach(t => { if (t.empId === d.id) delete t.rating; }); if (S.grades) delete S.grades[d.id]; save(); closeSheet(); render(); toast('הכוכבים נמחקו'); },
  'all-unrate': () => sheet(`<h3>למחוק את כל הכוכבים?</h3><p class="muted" style="margin-bottom:16px">כל הדירוגים של כל המשימות ושל כל העובדים יימחקו. המשימות עצמן נשארות.</p><div class="actions"><button class="btn" data-action="close">ביטול</button><button class="btn primary" data-action="all-unrate-yes">מחיקת כל הכוכבים</button></div>`),
  'all-unrate-yes': () => { S.tasks.forEach(t => { delete t.rating; }); S.grades = {}; save(); closeSheet(); render(); toast('כל הכוכבים נמחקו'); },
  'emp-edit': d => needMgr(() => {
    const e = byId(S.employees, d.id), acct = empAcct(e); sheet(`<div class="emp-head">${avatar(e, 'xl')}<div><h3>עריכת עובד</h3><label class="link-btn">${ic('camera', 'sm')}${ePhoto(e.id) ? 'החלפת תמונה' : 'הוספת תמונה'}<input type="file" accept="image/*" data-emp-photo="${e.id}" hidden></label></div></div><form class="form" data-form="emp-edit" data-id="${e.id}" style="margin-top:12px">${empFields(e, 'ee')}<button class="btn primary block">שמירה</button></form>
    ${acct}
    ${isOwnerEmp(e) || isPriv(e) ? '' : e.id !== session() ? `<button class="btn danger block" style="margin-top:10px" data-action="emp-del" data-id="${e.id}">הסרת העובד</button>` : '<p class="hint" style="margin-top:10px">אי אפשר להסיר את המשתמש שמחובר כרגע.</p>'}`);
  }),
  'emp-del': d => { const e = byId(S.employees, d.id); sheet(`<h3>להסיר את ${esc(e.name)}?</h3><p class="muted" style="margin-bottom:16px">העובד לא יוכל להתחבר יותר. המשמרות שכבר נרשמו יישארו בסיכומי השכר.</p><div class="actions"><button class="btn" data-action="close">ביטול</button><button class="btn primary" data-action="emp-del-yes" data-id="${e.id}">הסרה</button></div>`); },
  'emp-del-yes': d => needMgr(() => { const e = byId(S.employees, d.id), m = memOf(d.id); if (m) store.unlink(m.id); S.employees = S.employees.filter(x => x.id !== d.id); save(); closeSheet(); render(); toast(`${e.name} הוסר/ה מרשימת העובדים`); }),
  // ---- sign-ups and permissions ----
  'perm-preset': (d, el) => {
    const f = el.closest('form'), P = (PRESETS[d.p] || [])[1]; if (!f || !P) return;
    AREAS.forEach(a => { const v = P[a] || PERM_LEVELS(a)[0], r = f.querySelector(`input[name="pm-${a}"][value="${v}"]`) || f.querySelector(`input[name="pm-${a}"]`); if (r) r.checked = true; });
    haptic(6);
  },
  'su-open': d => needMgr(() => {
    const j = (S.signups || []).find(x => x.id === d.id); if (!j) return;
    sheet(`<h3>אישור הצטרפות</h3>
    <div class="row" style="margin:8px 0 4px"><span class="av lg">${j.photo ? `<img src="${esc(j.photo)}" alt="" referrerpolicy="no-referrer">` : esc((j.name || j.email || '?')[0])}</span><div class="row-main"><div class="row-title">${esc(j.name || 'בלי שם')}</div><div class="row-sub"><span class="ltr">${esc(j.email)}</span></div></div></div>
    <form class="form" data-form="su-approve" data-email="${esc(j.id)}" style="margin-top:10px">
      <div class="field"><label for="su-emp">מי זה/זו?</label><select id="su-emp" name="emp" data-su-emp>
        <option value="__new">עובד/ת חדש/ה</option>
        ${S.employees.map(e => `<option value="${e.id}">${esc(e.name)}${memOf(e.id) ? ' (כבר מחובר/ת לחשבון אחר)' : ''}</option>`).join('')}</select>
        <small>עובד/ת שכבר קיים/ת: השעות וההיסטוריה נשארות, והחשבון הזה יתחבר אליהם.</small></div>
      <div class="su-new"><div class="field-row"><div class="field"><label for="su-n">שם</label><input id="su-n" name="name" value="${esc(j.name || '')}" maxlength="60"></div>
        <div class="field"><label for="su-w">שכר לשעה (₪)</label><input id="su-w" name="wage" type="number" min="0" step="0.5" value="50" inputmode="decimal"></div></div></div>
      <h3 class="sec">הרשאות</h3>
      ${permEditor(PRESETS.basic[1])}
      <button class="btn primary block">אישור</button></form>`);
  }),
  'su-reject': d => needMgr(() => sheet(`<h3>לדחות את הבקשה?</h3><p class="muted" style="margin-bottom:16px">${esc(d.id)} לא יוכל/תוכל להיכנס לאפליקציה. אם ינסה/תנסה שוב, תגיע בקשה חדשה.</p><div class="actions"><button class="btn" data-action="close">ביטול</button><button class="btn danger" data-action="su-reject-yes" data-id="${esc(d.id)}">דחייה</button></div>`)),
  'su-reject-yes': async d => { const r = await store.reject(d.id); closeSheet(); render(); toast(r.error || 'הבקשה נדחתה'); },
  'mem-unlink': d => needMgr(() => sheet(`<h3>לנתק את החשבון?</h3><p class="muted" style="margin-bottom:16px"><span class="ltr">${esc(d.id)}</span> לא יוכל/תוכל להיכנס יותר עד שיאושר/תאושר מחדש. העובד/ת וההיסטוריה נשארים.</p><div class="actions"><button class="btn" data-action="close">ביטול</button><button class="btn danger" data-action="mem-unlink-yes" data-id="${esc(d.id)}">ניתוק</button></div>`)),
  'mem-unlink-yes': async d => { const r = await store.unlink(d.id); closeSheet(); render(); toast(r.error || 'החשבון נותק'); },
  regen: () => { buildSummary(S, prevMonthKey()); save(); view = 'alerts'; render(); toast('הסיכום החודשי הופק'); },
  reset: () => sheet(`<h3>לאפס את נתוני הדמו?</h3><p class="muted" style="margin-bottom:16px">כל השינויים יימחקו, כולל עובדים וסיסמת המנהל, והנתונים יחזרו לדוגמה ההתחלתית.</p><div class="actions"><button class="btn" data-action="close">ביטול</button><button class="btn primary" data-action="reset-yes">איפוס</button></div>`),
  'reset-yes': async () => { await store.resetDemo(); closeSheet(); view = 'clock'; invTab = 'drinks'; render(); toast('נתוני הדמו אופסו'); },
  ds: d => { let v = d.v; if (v === 'true') v = true; else if (v === 'false') v = false; DS[d.k] = v; saveDS(); applyDisplay(); render(); },
  'ds-tog': d => { DS[d.k] = !DS[d.k]; saveDS(); applyDisplay(); render(); },
  'ds-reset': () => { DS = { ...DS_DEFAULT }; saveDS(); applyDisplay(); render(); toast('ההגדרות הוחזרו לברירת המחדל'); }
};
const FORMS = {
  'shift-edit': (f, el) => {
    if (!store.isOwner?.()) return toast('רק בעל הבית יכול לערוך משמרות'); const s = byId(S.shifts, el.dataset.id); if (!s) return;
    const a = new Date(f.d1 + 'T' + f.t1).getTime(), hasEnd = f.d2 && f.t2, b = hasEnd ? new Date(f.d2 + 'T' + f.t2).getTime() : null;
    if (!a) return toast('תאריך או שעת כניסה לא תקינים');
    if (hasEnd && !(b > a)) return toast('היציאה חייבת להיות אחרי הכניסה');
    if (hasEnd && b - a > 24 * H) return toast('משמרת של יותר מ-24 שעות. בדקו את התאריכים');
    if (hasEnd && b > Date.now() + 5 * 6e4) return toast('שעת היציאה לא יכולה להיות בעתיד');
    s.start = a; if (hasEnd) { s.end = b; if (s.status === 'open') s.status = 'approved'; delete s.allowUntil; }
    s.editedBy = session(); s.editedAt = Date.now(); save(); closeSheet(); render(); toast('המשמרת עודכנה');
  },
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
    pendingUpload = null; closeSheet(); go('reels'); const rf = document.getElementById('reels-feed'); if (rf) rf.scrollTop = 0; toast('פורסם!');
  },
  comment: (f, el) => {
    const text = (f.text || '').trim(); if (!text) return;
    S.reelComments.push({ id: uid(), reel: el.dataset.reel, by: session(), text, ts: Date.now(), parent: replyTo || null, tags: pickedTags(text) });
    save(); replyTo = null; mentionTags = new Map(); el.reset(); const b = document.getElementById('cm-reply'); if (b) b.hidden = true; refreshComments(); patchReels();
    const box = document.getElementById('cms'); if (box) box.scrollTop = box.scrollHeight;
  },
  poster: async f => {
    const p = normPhone(f.phone), n = String(f.num).trim();
    if (!/^0\d{9}$/.test(p) || !/^\d{1,6}$/.test(n)) return toast('טלפון בן 10 ספרות ומספר עובד עד 6 ספרות');
    if (S.employees.some(e => normPhone(e.phone) === p) || (S.viewerLogin && S.viewerLogin.phone === p)) return toast('מספר הטלפון כבר בשימוש');
    const r = await store.setPoster(p, n); if (r.error) return toast(r.error); closeSheet(); render(); toast('חשבון חדשות מרקט פעיל');
  },
  viewer: async f => {
    const p = normPhone(f.phone), n = String(f.num).trim();
    if (!/^\d{10}$/.test(p) || !/^\d{1,6}$/.test(n)) return toast('טלפון בן 10 ספרות ומספר עובד עד 6 ספרות');
    if (S.employees.some(e => normPhone(e.phone) === p)) return toast('מספר הטלפון כבר שייך לעובד');
    const r = await store.setViewer(p, n); if (r.error) return toast(r.error); closeSheet(); render(); toast('משתמש הבקרה פעיל');
  },
  login: async f => {
    const p = normPhone(f.phone), n = String(f.num).trim();
    if (!/^0\d{9}$/.test(p)) return toast('הזינו מספר טלפון בן 10 ספרות');
    if (!n) return toast('הזינו מספר עובד');
    busy = true; render();
    const r = await store.login(p, n);
    busy = false;
    if (r.error) { render(); document.getElementById('lg-p').value = fmtPhone(p); document.getElementById('lg-n').value = n; return toast(r.error); }
    view = DS.home || 'clock'; monthChecked = false; render(); toast('שלום ' + first(cur().name));
    initPush(isNativeApp());
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
  deliv: f => { if (!String(f.name || '').trim()) return toast('מה אמור להגיע?'); S.deliveries.push({ id: uid(), date: /^\d{4}-\d{2}-\d{2}$/.test(f.date || '') && !isNaN(new Date(f.date + 'T12:00')) ? f.date : dateKey(Date.now()), name: f.name.trim(), qty: f.qty.trim(), supplier: f.supplier.trim(), arrived: false }); save(); closeSheet(); render(); toast('האספקה נוספה'); },
  item: f => { const [cat, sub] = f.cat.split('|'); S.inventory.push({ id: uid(), cat, sub: sub || null, name: f.name.trim(), qty: +f.qty || 0, min: +f.min || 0 }); save(); closeSheet(); render(); toast('הפריט נוסף למלאי'); },
  dm: f => {
    const text = String(f.text || '').trim(); if (!text || !chatWith) return;
    S.messages = S.messages || [];
    S.messages.push({ id: uid(), pair: [session(), chatWith], from: session(), to: chatWith, text, ts: Date.now(), read: false });
    chatDraft = ''; haptic(6); save(); render(); const t = document.getElementById('dm-t'); if (t) t.focus();
  },
  perms: async (f, el) => {
    if (!canE('staff')) return openPin();
    const r = await store.setPerms(el.dataset.email, readPerms(f));
    if (r.error) return toast(r.error);
    closeSheet(); render(); toast('ההרשאות נשמרו. הן נכנסות לתוקף אצל העובד מיד');
  },
  'su-approve': async (f, el) => {
    if (!canE('staff')) return openPin();
    const isNew = f.emp === '__new';
    if (isNew && !String(f.name || '').trim()) return toast('צריך למלא שם');
    const num = String(Math.max(100, ...S.employees.map(e => parseInt(e.num) || 0)) + 1);
    busy = true;
    const r = await store.approve(el.dataset.email, isNew ? { newEmp: { name: String(f.name).trim(), wage: parseFloat(f.wage) || 0, num }, perms: readPerms(f) } : { empId: f.emp, perms: readPerms(f) });
    busy = false;
    if (r.error) return toast(r.error);
    closeSheet(); render(); toast('אושר. האפליקציה תיפתח אצל העובד מיד');
  },
  'geo-ll': f => {
    const m = String(f.ll || '').match(/(-?\d{1,2}\.\d+)\s*[,،\s]\s*(-?\d{1,3}\.\d+)/);
    if (!m || Math.abs(+m[1]) > 90 || Math.abs(+m[2]) > 180) return toast('לא מצאתי מיקום. מדביקים שני מספרים, למשל 31.7683, 35.2137');
    geoCfg.lat = +(+m[1]).toFixed(6); geoCfg.lng = +(+m[2]).toFixed(6); geoCfg.acc = null; geoSave(); render(); toast('מיקום החנות נשמר');
  },
  'pos-free': f => {
    const price = Math.round(parseFloat(f.price) * 100) / 100, qty = Math.max(1, Math.floor(+f.qty || 1));
    if (!(price > 0)) return toast('רשמו סכום');
    pos.lines.unshift({ key: 'free:' + uid(), name: String(f.name || '').trim() || 'פריט כללי', bc: '', price, qty });
    posKeep(); haptic(10); closeSheet(); render();
  },
  'pos-weigh': f => {
    const perKg = parseFloat(f.perKg), w = parseFloat(f.weight), kg = f.unit === 'g' ? w / 1000 : w;
    if (!(perKg > 0) || !(kg > 0)) return toast('רשמו מחיר לק״ג ומשקל');
    const price = Math.round(perKg * kg * 100) / 100, name = String(f.name || '').trim() || 'פריט שקיל';
    pos.lines.unshift({ key: 'kg:' + uid(), name: `${name} · ${kg.toFixed(3)} ק״ג × ${money2(perKg)}`, bc: '', price, qty: 1, kg, perKg });
    posKeep(); haptic(10); closeSheet(); render();
  },
  'pos-find': f => {
    const q = String(f.q || '').trim(); if (!q) return;
    const p = posFind(q) || (r => r.length === 1 ? r[0] : null)(posSearch(q));
    if (p) { posAdd(p); haptic(10); beep(); posQ = ''; } else { posQ = q; toast(/^\d+$/.test(q) ? 'לא נמצא מוצר עם הברקוד הזה' : 'בחרו מוצר מהרשימה'); }
    render(); const i = document.getElementById('pos-q'); if (i) i.focus();
  },
  'pos-price': (f, el) => { const l = pos.lines[+el.dataset.i]; if (!l) return; l.price = Math.max(0, Math.round(parseFloat(f.price) * 100) / 100) || 0; posKeep(); closeSheet(); render(); },
  'prod-price': (f, el) => {
    if (!manager) return openPin(); const key = el.dataset.k, bc = String(f.barcode || '').trim();
    const r = barcodeBits(bc); if (bc && !(r && r.bits)) return toast((r && r.note) || 'הברקוד לא תקין');
    const dup = bcOwner(bc, key); if (dup) return toast(`הברקוד הזה כבר שייך ל${dup.name}`);
    const num = v => v === '' || v == null ? null : Math.max(0, Math.round(parseFloat(v) * 100) / 100);
    const cost = num(f.cost), price = num(f.price);
    if (key && key.startsWith('i:')) {
      const id = key.slice(2); S.prices = S.prices || {};
      if (!bc && cost == null && price == null) delete S.prices[id]; else S.prices[id] = { barcode: bc, cost, price };
    } else {
      const name = String(f.name || '').trim().replace(/\s+/g, ' '); if (!name) return toast('צריך למלא שם');
      const qty = f.qty === '' || f.qty == null ? null : parseFloat(f.qty);
      const rec = { name, dept: String(f.dept || '').trim() || 'כללי', bc, cost, price, qty: isNaN(qty) ? null : qty };
      Object.keys(rec).forEach(k => { if (rec[k] === null || rec[k] === '') delete rec[k]; });
      S.catalog = S.catalog || [];
      const ex = key && S.catalog.find(c => c.id === key.slice(2));
      if (ex) { ['bc', 'cost', 'price', 'qty'].forEach(k => delete ex[k]); Object.assign(ex, rec); }
      else { const counts = {}; S.catalog.forEach(c => { counts[c.chunk] = (counts[c.chunk] || 0) + 1; }); let k = 0; while ((counts['c' + k] || 0) >= CAT_CHUNK) k++; S.catalog.push({ id: uid(), code: '', unit: 'יח׳', chunk: 'c' + k, ...rec }); }
      S.catalogDirty = true;
    }
    save(); closeSheet(); render(); toast('פרטי המוצר נשמרו');
  },
  'item-edit': (f, el) => {
    if (!manager) return openPin(); const i = byId(S.inventory, el.dataset.id); if (!i) return; const [cat, sub] = f.cat.split('|');
    if (!f.name.trim()) return toast('צריך למלא שם');
    Object.assign(i, { name: f.name.trim(), cat, sub: sub || null, min: Math.max(0, parseInt(f.min) || 0) });
    if (S.images[i.id]) S.images[i.id].cat = cat;
    save(); closeSheet(); render(); toast('פרטי הפריט נשמרו');
  },
  emp: f => {
    if (!manager) return openPin(); const err = validateEmp(f, null); if (err) return toast(err);
    S.employees.push({ id: uid(), num: String(f.num).trim(), name: f.name.trim(), ...(f.phone ? { phone: normPhone(f.phone) } : {}), wage: parseFloat(f.wage) });
    save(); closeSheet(); render(); toast(`${f.name.trim()} נוסף/ה. כשייכנס/תיכנס עם Google, תשייך/י את החשבון ממסך העובדים`);
  },
  'emp-edit': (f, el) => {
    if (!manager) return openPin(); const e = byId(S.employees, el.dataset.id), err = validateEmp(f, e.id); if (err) return toast(err);
    if (f.phone === undefined) { Object.assign(e, { name: f.name.trim(), wage: parseFloat(f.wage) }); save(); closeSheet(); render(); return toast('פרטי העובד נשמרו'); }
    Object.assign(e, { name: f.name.trim(), num: String(f.num).trim(), wage: parseFloat(f.wage) });
    if (f.phone) e.phone = normPhone(f.phone); else delete e.phone;
    delete e.google;
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
const VIEW_OK = ['reel-share', 'sync-info', 'nav', 'back', 'close', 'inv-tab', 'range', 'sup-open', 'img-view', 'account', 'nav-close', 'logout', 'ds', 'ds-tog', 'ds-reset', 'reel-comments', 'reel-viewers', 'emp-shifts', 'reel-tap', 'cap-more', 'reel-sound', 'reel-open', 'order-open', 'sale-open', 'sale-pdf', 'sale-share', 'prod-open', 'prod-nobc', 'prod-more', 'inv-more', 'inv-update', 'emp-edit', 'fill-login', 'step'];
/* ---------- leisure: the shop's photo gallery, Snake and backgammon ---------- */
const FUN_VIEWS = ['fun', 'gallery', 'snake', 'bg'];
const funOk = () => !viewer && !poster;
const scoreOf = (game, id = session()) => (S.scores || []).find(s => s.game === game && s.emp === id) || null;
const dataToBlob = d => { const [h, b] = String(d).split(','), bin = atob(b), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return new Blob([u8], { type: (h.match(/data:([^;]+)/) || [])[1] || 'image/jpeg' }); };
const shareDone = r => { if (r === 'saved') toast('הקובץ ירד למכשיר'); };
const backFun = () => back('fun', 'חזרה לפנאי');
function vFun() {
  const g = galList(), sn = scoreOf('snake'), top = snakeRows()[0], wait = bgWaiting();
  return `<h2 class="vt">פנאי</h2>
  <div class="fun-cards">
    <button class="fun-card" data-action="nav" data-view="gallery">
      <div class="fc-thumbs">${g.slice(0, 4).map(p => `<img src="${p.thumb}" alt="">`).join('') || `<span class="fc-ph">${ic('image')}</span>`}</div>
      <div class="fc-txt"><b>גלריה</b><small>${g.length ? `${g.length.toLocaleString('he-IL')} תמונות` : 'עוד אין תמונות'} · מצלמים ישר לאפליקציה</small></div>
    </button>
    <button class="fun-card" data-action="nav" data-view="snake">
      <span class="fc-ic" aria-hidden="true">🐍</span>
      <div class="fc-txt"><b>סנייק</b><small>${sn ? `השיא שלך: ${sn.best || 0}` : 'עוד לא שיחקת'}${top ? ` · מוביל/ה: ${esc(first(emp(top.emp).name))} (${top.best})` : ''}</small></div>
    </button>
    <button class="fun-card" data-action="nav" data-view="bg">
      <span class="fc-ic" aria-hidden="true">🎲</span>
      <div class="fc-txt"><b>שש בש</b><small>נגד המחשב או נגד עובד אחר</small></div>
      ${wait ? `<span class="pill bad">${wait} מחכים לך</span>` : ''}
    </button>
  </div>`;
}

/* gallery: everyone sees the photos; each photo is a small preview plus the full photo, loaded when opened */
const GAL = new Map();
let galPending = null;
const galList = () => (S.gallery || []).filter(p => p.thumb).sort((a, b) => b.ts - a.ts);
function vGallery() {
  const list = galList();
  return backFun() + `<h2 class="vt">גלריה${list.length ? ' · ' + list.length.toLocaleString('he-IL') : ''}</h2>
  <div class="actions gal-actions">
    <label class="btn primary">${ic('camera', 'sm')}צילום<input type="file" accept="image/*" capture="environment" data-gal-file hidden></label>
    <label class="btn">${ic('image', 'sm')}מהטלפון<input type="file" accept="image/*" multiple data-gal-file hidden></label>
  </div>
  ${list.length ? `<div class="gal-grid">${list.map(p => `<button class="gal-th" data-action="gal-open" data-id="${p.id}" aria-label="תמונה של ${esc(emp(p.by).name)}"><img src="${p.thumb}" alt="" loading="lazy"></button>`).join('')}</div>`
    : `<div class="lock"><div class="lk">${ic('image')}</div><h4>עוד אין תמונות</h4><p class="muted">צלמו משהו בחנות והוא יופיע כאן לכולם.</p></div>`}`;
}
function galViewHtml(p) {
  const list = galList(), i = list.findIndex(x => x.id === p.id), a = emp(p.by);
  const canDel = p.by === session() || canE('admin');
  return `<div class="gal-view" data-id="${p.id}">
    <div class="gal-stage"><img id="gal-img" src="${GAL.get(p.id) || p.thumb}" alt="">${GAL.has(p.id) ? '' : '<span class="gal-load">טוען…</span>'}
      ${i > 0 ? `<button class="gal-nav prev" data-action="gal-go" data-d="-1" aria-label="התמונה הקודמת">›</button>` : ''}
      ${i < list.length - 1 ? `<button class="gal-nav next" data-action="gal-go" data-d="1" aria-label="התמונה הבאה">‹</button>` : ''}</div>
    <div class="gal-meta">${avatar(a, 'md')}<div><b>${esc(a.name || 'עובד')}</b><small class="muted"> · ${ago(p.ts)}</small>${p.caption ? `<p>${esc(p.caption)}</p>` : ''}</div></div>
    <div class="actions"><button class="btn primary" data-action="gal-share" data-id="${p.id}">${ic('share', 'sm')}שיתוף</button><button class="btn" data-action="gal-save" data-id="${p.id}">${ic('down', 'sm')}שמירה</button>${canDel ? `<button class="btn danger" data-action="gal-del" data-id="${p.id}">${ic('trash', 'sm')}מחיקה</button>` : ''}</div>
  </div>`;
}
async function galFull(id) {
  if (GAL.has(id)) return GAL.get(id);
  const d = await store.loadPhoto(id); if (d) GAL.set(id, d); return d;
}
function galShow(id) {
  const p = galList().find(x => x.id === id); if (!p) return;
  const cur = document.querySelector('.gal-view');
  if (cur) cur.outerHTML = galViewHtml(p); else sheet(galViewHtml(p));
  if (!GAL.has(id)) galFull(id).then(d => { const v = document.querySelector(`.gal-view[data-id="${id}"]`); if (!v || !d) return; v.querySelector('#gal-img').src = d; v.querySelector('.gal-load')?.remove(); }).catch(() => { const l = document.querySelector('.gal-load'); if (l) l.textContent = 'לא הצלחתי לטעון. בדקו את החיבור'; });
}
async function galPick(inp) {
  const files = [...(inp.files || [])].slice(0, 10); inp.value = ''; if (!files.length) return;
  toast('מכין את התמונות…');
  try {
    galPending = [];
    for (const f of files) galPending.push({ full: await shrinkImage(f, 1600, 650000), thumb: await shrinkImage(f, 420, 45000) });
  } catch (e) { galPending = null; return toast('לא הצלחתי לקרוא את התמונה. נסו תמונה אחרת'); }
  sheet(`<h3>${galPending.length > 1 ? `${galPending.length} תמונות לגלריה` : 'תמונה לגלריה'}</h3>
    <div class="gal-prev">${galPending.map(p => `<img src="${p.thumb}" alt="">`).join('')}</div>
    <form class="form" data-form="gal-up"><div class="field"><label for="gal-cap">כיתוב (לא חובה)</label><input id="gal-cap" name="caption" maxlength="300" placeholder="מה רואים בתמונה?"></div>
    <button class="btn primary block">העלאה לגלריה</button></form>`);
}
document.addEventListener('change', e => { if (e.target.matches('input[data-gal-file]')) galPick(e.target); });

/* Snake: one shared score table for everyone */
let snakeG = null;
const snakeRows = () => (S.scores || []).filter(s => s.game === 'snake' && (s.plays || 0) > 0 && emp(s.emp).name).sort((a, b) => (b.best || 0) - (a.best || 0) || (a.ts || 0) - (b.ts || 0));
const MEDAL = ['🥇', '🥈', '🥉'];
function snakeBoardHtml() {
  const rows = snakeRows();
  return rows.map((s, i) => `<div class="row ${s.emp === session() ? 'me-row' : ''}"><span class="rank">${MEDAL[i] || i + 1}</span>${avatar(emp(s.emp), 'md')}<div class="row-main"><div class="row-title">${esc(emp(s.emp).name)}</div><div class="row-sub"><span>${s.plays} משחקים</span><span>ממוצע ${Math.round((s.total || 0) / Math.max(1, s.plays))}</span></div></div><b class="num big-score">${s.best || 0}</b></div>`).join('')
    || '<div class="row muted">עוד אף אחד לא שיחק. תהיו הראשונים!</div>';
}
function vSnake() {
  const my = scoreOf('snake');
  return backFun() + `<h2 class="vt">סנייק</h2>
  <div class="snake-top"><span>ניקוד <b id="sn-score" class="num">0</b></span><span>השיא שלי <b id="sn-best" class="num">${my ? my.best || 0 : 0}</b></span></div>
  <div class="snake-wrap"><canvas id="snake" aria-label="לוח המשחק. החליקו או השתמשו בחיצים"></canvas></div>
  <div class="snake-pad" dir="ltr">
    <button data-action="snake-dir" data-d="u" aria-label="למעלה">▲</button>
    <button data-action="snake-dir" data-d="l" aria-label="שמאלה">◀</button>
    <button data-action="snake-go" aria-label="התחלה או הפסקה" class="sp-mid">▶︎❚❚</button>
    <button data-action="snake-dir" data-d="r" aria-label="ימינה">▶</button>
    <button data-action="snake-dir" data-d="d" aria-label="למטה">▼</button>
  </div>
  <p class="muted snake-help">החליקו על הלוח או לחצו על החיצים. כל פרי = נקודה, והנחש מאיץ.</p>
  <h3 class="sec">טבלת הניקוד של כולם</h3><div class="list" id="snake-board">${snakeBoardHtml()}</div>`;
}
function mountSnake() {
  if (snakeG) { snakeG.destroy(); snakeG = null; }
  const cv = document.getElementById('snake'); if (!cv) return;
  const size = Math.min(cv.parentElement.clientWidth || 340, 440), dpr = Math.min(3, window.devicePixelRatio || 1);
  cv.style.width = cv.style.height = size + 'px'; cv.width = cv.height = Math.round(size * dpr);
  const cs = getComputedStyle(ROOT), v = n => cs.getPropertyValue(n).trim();
  snakeG = createSnake(cv, {
    colors: { bg: v('--surface') || '#fff', grid: v('--sunk') || '#eee', head: v('--accent') || '#25528D', body: v('--ok') || '#2B7550', food: '#E5484D', eye: '#fff', veil: 'rgba(0,0,0,.5)', text: '#fff', font: v('--f-body') || 'sans-serif' },
    onScore: s => { const e = document.getElementById('sn-score'); if (e) e.textContent = s; haptic(6); },
    onOver: s => snakeOver(s)
  });
  let sx = 0, sy = 0, moved = false;
  cv.addEventListener('touchstart', e => { const t = e.touches[0]; sx = t.clientX; sy = t.clientY; moved = false; }, { passive: true });
  cv.addEventListener('touchmove', e => {
    e.preventDefault(); const t = e.touches[0], dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 20 || !snakeG) return;
    if (!snakeG.running()) snakeG.start();
    snakeG.turn(Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)]); sx = t.clientX; sy = t.clientY; moved = true;
  }, { passive: false });
  cv.addEventListener('click', () => { if (!moved && snakeG) { if (snakeG.isOver()) { const e = document.getElementById('sn-score'); if (e) e.textContent = 0; } snakeG.toggle(); } moved = false; });
}
async function snakeOver(s) {
  const my = scoreOf('snake') || {}, best = Math.max(my.best || 0, s);
  haptic([30, 40, 30]);
  if (s > 0 && s > (my.best || 0)) toast(my.plays ? `שיא אישי חדש: ${s}! 🎉` : `ניקוד ראשון: ${s}`);
  const r = await store.saveScore('snake', { best, plays: (my.plays || 0) + 1, total: (my.total || 0) + s });
  if (r && r.error) toast(r.error);
  const b = document.getElementById('sn-best'); if (b) b.textContent = best;
  updSnakeBoard();
}
function updSnakeBoard() { const b = document.getElementById('snake-board'); if (b) b.innerHTML = snakeBoardHtml(); }
const SNAKE_DIRS = { u: [0, -1], d: [0, 1], l: [-1, 0], r: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
document.addEventListener('keydown', e => {
  if (view !== 'snake' || !snakeG || /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || '')) return;
  if (SNAKE_DIRS[e.key]) { e.preventDefault(); if (!snakeG.running()) snakeG.start(); snakeG.turn(SNAKE_DIRS[e.key]); }
  else if (e.key === ' ') { e.preventDefault(); snakeG.toggle(); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden && snakeG) snakeG.pause(); });

/* backgammon: against the computer (kept on this phone) or against another employee (kept on the server) */
const BG_AI = 'dalpak-bg-ai', BG_REC = 'dalpak-bg-recorded';
let bg = null, bgBusy = false;
const DIE = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
const bgBoardOf = g => ({ pts: (g.pts || []).slice(), bar: { w: g.barW || 0, b: g.barB || 0 }, off: { w: g.offW || 0, b: g.offB || 0 } });
const bgFields = b => ({ pts: b.pts, barW: b.bar.w, barB: b.bar.b, offW: b.off.w, offB: b.off.b });
const myGames = () => (S.bgGames || []).filter(g => (g.players || []).includes(session()));
const bgMine = g => g.a === session() ? 'w' : 'b';
const bgOppOf = g => g.a === session() ? g.b : g.a;
const bgWaiting = () => myGames().filter(g => (g.status === 'invite' && g.b === session()) || (g.status === 'play' && g.turn === bgMine(g))).length;
function bgSaveAi() { if (!bg || bg.mode !== 'ai') return; try { localStorage.setItem(BG_AI, JSON.stringify({ board: bg.board, me: bg.me, turn: bg.turn, t: bg.t, over: bg.over, last: bg.last })); } catch (e) { } }
function bgLoadAi() { try { return JSON.parse(localStorage.getItem(BG_AI) || 'null'); } catch (e) { return null; } }
const bgRecorded = () => { try { return new Set(JSON.parse(localStorage.getItem(BG_REC) || '[]')); } catch (e) { return new Set(); } };
// Each player counts their own wins and losses once (online games: once per finished game).
async function bgRecord(won, ai, gameId) {
  if (gameId) { const s = bgRecorded(); if (s.has(gameId)) return; s.add(gameId); try { localStorage.setItem(BG_REC, JSON.stringify([...s].slice(-200))); } catch (e) { } }
  const c = scoreOf('bg') || {}, k = ai ? ['aiWins', 'aiLosses'] : ['wins', 'losses'];
  await store.saveScore('bg', { [won ? k[0] : k[1]]: (c[won ? k[0] : k[1]] || 0) + 1 });
}
function bgFromDoc(g) {
  const me = bgMine(g), board = bgBoardOf(g), myTurn = g.status === 'play' && g.turn === me;
  const prev = bg && bg.mode === 'online' && bg.id === g.id ? bg : null;
  let t = null;
  if (myTurn && g.dice) t = prev && prev.t && prev.t.dice.join() === g.dice.join() && bgKey(prev.t.start) === bgKey(board) ? prev.t : { start: board, dice: g.dice, played: [], board };
  const over = g.status === 'done' ? { winner: g.winner === session() ? me : other(me), mult: g.mult || 1, resign: g.resign || null } : null;
  bg = { mode: 'online', id: g.id, me, opp: bgOppOf(g), board, turn: g.turn, t, last: g.last || null, over, status: g.status, sel: prev && t === prev.t ? prev.sel : null };
  if (over) bgRecord(g.winner === session(), false, g.id);
}
function bgStartAi(fresh) {
  const s = fresh ? null : bgLoadAi();
  if (s && !s.over) { bg = { mode: 'ai', me: s.me || 'w', board: s.board, turn: s.turn, t: s.t, over: null, last: s.last, sel: null }; if (bg.turn !== bg.me) bgAiTurn(); return; }
  bg = { mode: 'ai', me: 'w', board: BG_START(), turn: null, t: null, over: null, last: null, sel: null };
  // Opening roll: each side rolls one die, the higher one starts.
  let d; do d = roll(); while (d[0] === d[1]);
  bg.turn = d[0] > d[1] ? 'w' : 'b'; bgSaveAi();
  toast(`פתיחה: ${DIE[d[0] - 1]} מול ${DIE[d[1] - 1]} · ${bg.turn === 'w' ? 'את/ה מתחיל/ה' : 'המחשב מתחיל'}`);
  if (bg.turn === 'b') setTimeout(bgAiTurn, 900);
}
function bgAiTurn() {
  if (!bg || bg.mode !== 'ai' || bg.over) return;
  const ai = other(bg.me), d = roll(); bg.turn = ai; bg.aiDice = d; drawBg();
  setTimeout(() => {
    if (!bg || bg.mode !== 'ai') return;
    const best = bgBest(bg.board, ai, d); let i = 0;
    const step = () => {
      if (!bg || bg.mode !== 'ai') return;
      if (i < best.moves.length) { bg.board = applyMove(bg.board, ai, best.moves[i]); bg.hl = best.moves[i]; i++; drawBg(); return setTimeout(step, 450); }
      bg.last = { by: ai, dice: d, moves: best.moves.map(m => `${m.from}>${m.to}`) }; bg.aiDice = null; bg.hl = null;
      const w = bgWinner(bg.board); if (w) return bgOver(w);
      if (!best.moves.length) toast('למחשב אין מהלכים אפשריים');
      bg.turn = bg.me; bgSaveAi(); drawBg();
    };
    step();
  }, 900);
}
function bgOver(w, resign) {
  bg.over = { ...w, resign: resign || null }; bg.turn = null; bg.t = null; bgSaveAi(); drawBg();
  const won = w.winner === bg.me;
  toast(won ? (w.mult === 3 ? 'ניצחון משולש (בקגמון)! 🏆' : w.mult === 2 ? 'ניצחון כפול (מארס)! 🏆' : 'ניצחת! 🏆') : 'הפעם המחשב ניצח');
  if (bg.mode === 'ai') bgRecord(won, true);
}
function bgPlay(m) {
  bg.t.board = applyMove(bg.t.board, bg.me, m); bg.t.played.push(m); bg.sel = null; haptic(8);
  if (bg.mode === 'ai') bgSaveAi();
  if (bgWinner(bg.t.board)) return bgFinish();
  drawBg();
}
async function bgFinish() {
  if (!bg || !bg.t || bgBusy) return;
  const b = bg.t.board, w = bgWinner(b), dice = bg.t.dice, moves = bg.t.played.map(m => `${m.from}>${m.to}`);
  if (bg.mode === 'ai') {
    bg.board = b; bg.last = { by: bg.me, dice, moves }; bg.t = null;
    if (w) return bgOver(w);
    bg.turn = other(bg.me); bgSaveAi(); drawBg(); return bgAiTurn();
  }
  const patch = { ...bgFields(b), turn: other(bg.me), dice: null, last: { by: bg.me, dice, moves }, ts: Date.now() };
  if (w) Object.assign(patch, { status: 'done', winner: session(), mult: w.mult });
  bgBusy = true; const r = await store.bgUpdate(bg.id, patch); bgBusy = false;
  if (r && r.error) return toast(r.error);
  bg.board = b; bg.turn = patch.turn; bg.t = null; bg.last = patch.last;
  if (w) { bg.over = { winner: bg.me, mult: w.mult }; bgRecord(true, false, bg.id); toast('ניצחת! 🏆'); }
  drawBg();
}
// The board, drawn from the player's side: their home is always at the bottom right.
function bgSvg(board, me, o = {}) {
  const W = 376, H = 300, L = 6, PW = 26, BAR = 22, R = 12, TH = 118;
  const disp = i => me === 'w' ? i : 23 - i;
  const px = p => p < 6 ? L + 6 * PW + BAR + (5 - p) * PW : p < 12 ? L + (11 - p) * PW : p < 18 ? L + (p - 12) * PW : L + 6 * PW + BAR + (p - 18) * PW;
  const opp = other(me), from = o.from || new Set(), dests = o.dests || new Set();
  let s = `<svg class="bg-board" viewBox="0 0 ${W} ${H}" role="img" aria-label="לוח שש בש"><rect class="bgb-frame" x="0" y="0" width="${W}" height="${H}" rx="10"/>
    <rect class="bgb-felt" x="${L}" y="6" width="${6 * PW}" height="${H - 12}"/><rect class="bgb-felt" x="${L + 6 * PW + BAR}" y="6" width="${6 * PW}" height="${H - 12}"/>
    <rect class="bgb-bar" x="${L + 6 * PW}" y="6" width="${BAR}" height="${H - 12}"/><rect class="bgb-tray" x="${L + 12 * PW + BAR + 4}" y="6" width="${W - (L + 12 * PW + BAR + 4) - 6}" height="${H - 12}" rx="4"/>`;
  for (let i = 0; i < 24; i++) {
    const p = disp(i), x = px(p), bot = p < 12, n = Math.abs(board.pts[i]), col = board.pts[i] > 0 ? 'w' : 'b';
    const y0 = bot ? H - 6 : 6, tip = bot ? H - 6 - TH : 6 + TH;
    s += `<polygon class="bgb-pt ${p % 2 ? 'a' : 'b'} ${from.has(i) ? 'can' : ''} ${o.sel === i ? 'sel' : ''}" points="${x},${y0} ${x + PW},${y0} ${x + PW / 2},${tip}"/>`;
    for (let k = 0; k < Math.min(n, 5); k++) {
      const cy = bot ? H - 6 - R - k * 2 * R : 6 + R + k * 2 * R;
      s += `<circle class="bgc ${col} ${o.hl && o.hl.to === i && k === Math.min(n, 5) - 1 ? 'hl' : ''}" cx="${x + PW / 2}" cy="${cy}" r="${R - 1}"/>`;
    }
    if (n > 5) s += `<text class="bgc-n ${col}" x="${x + PW / 2}" y="${(bot ? H - 6 - R - 4 * 2 * R : 6 + R + 4 * 2 * R) + 4}">${n}</text>`;
    if (dests.has(i)) s += `<circle class="bgb-dest" cx="${x + PW / 2}" cy="${bot ? H - 6 - R - Math.min(n, 4) * 2 * R : 6 + R + Math.min(n, 4) * 2 * R}" r="${R - 2}"/>`;
    s += `<rect class="bgb-hit" x="${x}" y="${bot ? H / 2 : 6}" width="${PW}" height="${H / 2 - 6}" data-action="bg-pt" data-p="${i}"/>`;
  }
  // The bar: the player's own checkers below the middle, the other side's above.
  const bx = L + 6 * PW + BAR / 2;
  for (let k = 0; k < board.bar[me]; k++) s += `<circle class="bgc ${me}" cx="${bx}" cy="${H / 2 + 16 + k * 2 * (R - 2)}" r="${R - 2}"/>`;
  for (let k = 0; k < board.bar[opp]; k++) s += `<circle class="bgc ${opp}" cx="${bx}" cy="${H / 2 - 16 - k * 2 * (R - 2)}" r="${R - 2}"/>`;
  if (from.has('bar')) s += `<rect class="bgb-can" x="${L + 6 * PW + 1}" y="${H / 2}" width="${BAR - 2}" height="${H / 2 - 8}" rx="4"/>`;
  s += `<rect class="bgb-hit" x="${L + 6 * PW}" y="${H / 2}" width="${BAR}" height="${H / 2 - 6}" data-action="bg-pt" data-p="bar"/>`;
  // Borne-off checkers in the tray at the side.
  const tx = L + 12 * PW + BAR + 7, tw = W - tx - 9;
  for (let k = 0; k < board.off[me]; k++) s += `<rect class="bgc ${me}" x="${tx}" y="${H - 10 - (k + 1) * 8}" width="${tw}" height="7" rx="2"/>`;
  for (let k = 0; k < board.off[opp]; k++) s += `<rect class="bgc ${opp}" x="${tx}" y="${10 + k * 8}" width="${tw}" height="7" rx="2"/>`;
  if (dests.has('off')) s += `<rect class="bgb-dest-off" x="${tx - 2}" y="${H / 2}" width="${tw + 4}" height="${H / 2 - 10}" rx="4"/>`;
  s += `<rect class="bgb-hit" x="${tx - 3}" y="${H / 2}" width="${tw + 6}" height="${H / 2 - 6}" data-action="bg-pt" data-p="off"/>`;
  return s + '</svg>';
}
const diceHtml = (d, used = []) => { if (!d) return ''; const all = d[0] === d[1] ? [d[0], d[0], d[0], d[0]] : [d[0], d[1]], u = used.slice(); return all.map(v => { const k = u.indexOf(v), x = k >= 0; if (x) u.splice(k, 1); return `<span class="die ${x ? 'used' : ''}">${DIE[v - 1]}</span>`; }).join(''); };
function bgGameHtml() {
  const me = bg.me, opp = other(me), oppName = bg.mode === 'ai' ? 'המחשב' : first(emp(bg.opp).name || 'עובד');
  const myTurn = !bg.over && bg.status !== 'invite' && bg.turn === me;
  const board = bg.t ? bg.t.board : bg.board, info = myTurn && bg.t ? turnInfo(bg.t, me) : null;
  const from = new Set(info ? info.moves.map(m => m.from) : []), dests = new Set(info && bg.sel !== null && bg.sel !== undefined ? info.moves.filter(m => m.from === bg.sel).map(m => m.to) : []);
  let status = '', btns = '';
  if (bg.over) {
    const won = bg.over.winner === me;
    status = won ? (bg.over.mult === 3 ? 'ניצחון משולש! 🏆' : bg.over.mult === 2 ? 'ניצחון כפול! 🏆' : 'ניצחת! 🏆') : bg.over.resign ? (bg.mode === 'ai' || bg.over.resign === session() ? 'פרשת מהמשחק' : `${oppName} פרש/ה. ניצחת!`) : `${oppName} ניצח/ה`;
    btns = bg.mode === 'ai' ? `<button class="btn primary" data-action="bg-ai-new">משחק חדש</button>` : `<button class="btn primary" data-action="bg-invite-to" data-id="${bg.opp}">משחק חוזר</button><button class="btn" data-action="bg-del" data-id="${bg.id}">מחיקה מהרשימה</button>`;
  } else if (bg.status === 'invite') status = `מחכה ש${oppName} יאשר/תאשר את ההזמנה`;
  else if (!myTurn) status = bg.mode === 'ai' ? 'המחשב משחק…' : `התור של ${oppName}`;
  else if (!bg.t) { status = 'התור שלך'; btns = `<button class="btn primary" data-action="bg-roll">🎲 הטלת קוביות</button>`; }
  else if (info.done) { status = 'סיימת את המהלכים'; btns = `<button class="btn primary" data-action="bg-done" ${bgBusy ? 'disabled' : ''}>סיום תור</button><button class="btn" data-action="bg-undo">ביטול המהלכים</button>`; }
  else if (!info.moves.length) { status = 'אין מהלכים אפשריים בהטלה הזו'; btns = `<button class="btn primary" data-action="bg-done">העברת התור</button>`; }
  else { status = bg.sel !== null && bg.sel !== undefined ? 'לאן להזיז? המקומות המסומנים' : 'בחרו כלי להזזה'; if (bg.t.played.length) btns = `<button class="btn" data-action="bg-undo">ביטול המהלכים</button>`; }
  const dice = myTurn && bg.t ? diceHtml(bg.t.dice, bg.t.played.map(m => m.die)) : bg.aiDice ? diceHtml(bg.aiDice) : bg.last ? `<span class="last-dice">${bg.last.by === me ? 'ההטלה שלך' : oppName}: ${diceHtml(bg.last.dice)}</span>` : '';
  return `<button class="link-btn" data-action="bg-lobby">${ic('chev', 'sm')}<span>לכל המשחקים</span></button>
  <div class="bg-players"><span class="bgp ${opp}"><i></i>${esc(oppName)} · ${pips(board, opp)} צעדים</span><span class="bgp ${me}"><i></i>את/ה · ${pips(board, me)} צעדים</span></div>
  ${bgSvg(board, me, { from, dests, sel: bg.sel, hl: bg.hl })}
  <div class="bg-dice">${dice}</div>
  <p class="bg-status">${status}</p>
  <div class="actions bg-btns">${btns}</div>
  ${!bg.over && bg.status !== 'invite' ? `<button class="link-btn danger-t bg-resign" data-action="bg-resign">פרישה מהמשחק</button>` : ''}`;
}
function bgLobbyHtml() {
  const saved = bgLoadAi(), open = saved && !saved.over, games = myGames().sort((a, b) => (b.ts || 0) - (a.ts || 0));
  const inv = games.filter(g => g.status === 'invite' && g.b === session()), sent = games.filter(g => g.status === 'invite' && g.a === session());
  const play = games.filter(g => g.status === 'play'), done = games.filter(g => g.status === 'done').slice(0, 6);
  const row = (g, right) => `<div class="row tap" data-action="bg-open" data-id="${g.id}">${avatar(emp(bgOppOf(g)), 'md')}<div class="row-main"><div class="row-title">${esc(emp(bgOppOf(g)).name)}</div><div class="row-sub">${right}</div></div></div>`;
  const champs = (S.scores || []).filter(s => s.game === 'bg' && emp(s.emp).name && ((s.wins || 0) + (s.losses || 0) + (s.aiWins || 0) + (s.aiLosses || 0))).sort((a, b) => (b.wins || 0) - (a.wins || 0) || (b.aiWins || 0) - (a.aiWins || 0));
  return `<h2 class="vt">שש בש</h2>
  <div class="list">
    <div class="row"><span class="fc-ic sm" aria-hidden="true">🤖</span><div class="row-main"><div class="row-title">נגד המחשב</div><div class="row-sub">${open ? 'יש לך משחק פתוח' : 'משחק מיידי, בלי לחכות לאף אחד'}</div></div><button class="btn primary sm" data-action="bg-ai">${open ? 'המשך' : 'משחק'}</button></div>
    <div class="row"><span class="fc-ic sm" aria-hidden="true">👥</span><div class="row-main"><div class="row-title">נגד עובד אחר</div><div class="row-sub">כל אחד משחק מהטלפון שלו</div></div><button class="btn primary sm" data-action="bg-invite">הזמנה</button></div>
  </div>
  ${inv.length ? `<h3 class="sec">הזמנות אליך</h3><div class="list">${inv.map(g => `<div class="row">${avatar(emp(g.a), 'md')}<div class="row-main"><div class="row-title">${esc(emp(g.a).name)}</div><div class="row-sub">מזמין/ה אותך למשחק</div></div><div class="actions"><button class="btn primary sm" data-action="bg-accept" data-id="${g.id}">משחק</button><button class="btn sm" data-action="bg-del" data-id="${g.id}">לא עכשיו</button></div></div>`).join('')}</div>` : ''}
  ${play.length || sent.length ? `<h3 class="sec">המשחקים שלי</h3><div class="list">${play.map(g => row(g, g.turn === bgMine(g) ? '<span class="pill ok">התור שלך</span>' : '<span>התור שלו/ה</span>')).join('')}${sent.map(g => row(g, '<span>מחכה לאישור ההזמנה</span>')).join('')}</div>` : ''}
  ${done.length ? `<h3 class="sec">הסתיימו</h3><div class="list">${done.map(g => row(g, g.winner === session() ? '<span class="pill ok">ניצחת</span>' : '<span class="pill">הפסדת</span>')).join('')}</div>` : ''}
  <h3 class="sec">טבלת האלופים</h3><div class="list">${champs.map((s, i) => `<div class="row ${s.emp === session() ? 'me-row' : ''}"><span class="rank">${MEDAL[i] || i + 1}</span>${avatar(emp(s.emp), 'md')}<div class="row-main"><div class="row-title">${esc(emp(s.emp).name)}</div><div class="row-sub"><span>נגד עובדים: ${s.wins || 0} ניצחונות, ${s.losses || 0} הפסדים</span><span>נגד המחשב: ${s.aiWins || 0}–${s.aiLosses || 0}</span></div></div><b class="num big-score">${s.wins || 0}</b></div>`).join('') || '<div class="row muted">עוד לא נגמר אף משחק.</div>'}</div>`;
}
function vBg() { return `<div id="bg-wrap">${bg ? bgGameHtml() : backFun() + bgLobbyHtml()}</div>`; }
function drawBg() { const w = document.getElementById('bg-wrap'); if (w && view === 'bg') w.innerHTML = bg ? bgGameHtml() : backFun() + bgLobbyHtml(); renderNav(); }
// Server changes while on the backgammon screen: update the board in place.
function patchBg() {
  if (bg && bg.mode === 'online') { const g = myGames().find(x => x.id === bg.id); if (!g) { bg = null; toast('המשחק נמחק'); } else bgFromDoc(g); }
  drawBg();
}

const FUN_ACT = {
  'gal-open': d => galShow(d.id),
  'gal-go': d => { const v = document.querySelector('.gal-view'); if (!v) return; const list = galList(), i = list.findIndex(x => x.id === v.dataset.id), n = list[i + +d.d]; if (n) galShow(n.id); },
  'gal-share': async d => { try { const f = await galFull(d.id); if (!f) return toast('לא הצלחתי לטעון את התמונה'); shareDone(await shareFiles([{ blob: dataToBlob(f), name: `shabbes-${d.id}.jpg` }])); } catch (e) { toast('השיתוף נכשל'); } },
  'gal-save': async d => { try { const f = await galFull(d.id); if (f) { download(dataToBlob(f), `shabbes-${d.id}.jpg`); toast('התמונה ירדה למכשיר'); } } catch (e) { toast('ההורדה נכשלה'); } },
  'gal-del': d => { const b = document.querySelector(`[data-action="gal-del"][data-id="${d.id}"]`); if (b) { b.dataset.action = 'gal-del-yes'; b.lastChild.textContent = 'למחוק? לחצו שוב'; } },
  'gal-del-yes': async d => { const p = (S.gallery || []).find(x => x.id === d.id); if (!p) return; const r = await store.deletePhoto(p); if (r && r.error) return toast(r.error); GAL.delete(d.id); closeSheet(); render(); toast('התמונה נמחקה'); },
  'reel-share': async d => {
    const r = byId(S.reels, d.id); if (!r) return; toast('מכין לשיתוף…');
    try {
      const m = await getMedia(r), name = `shabbes-reel-${r.id}`;
      const files = m.blob ? [{ blob: m.blob, name: name + (/webm/.test(r.mime || '') ? '.webm' : '.mp4') }] : m.imgs.map((s, i) => ({ blob: dataToBlob(s), name: `${name}_${i + 1}.jpg` }));
      shareDone(await shareFiles(files, r.caption || 'שאבעס מרקט'));
    } catch (e) { toast('השיתוף נכשל. בדקו את החיבור'); }
  },
  'snake-dir': d => { if (!snakeG) return; if (!snakeG.running()) snakeG.start(); snakeG.turn(SNAKE_DIRS[d.d]); },
  'snake-go': () => { if (!snakeG) return; if (snakeG.isOver()) { const e = document.getElementById('sn-score'); if (e) e.textContent = 0; } snakeG.toggle(); },
  'bg-ai': () => { bgStartAi(false); drawBg(); },
  'bg-ai-new': () => { try { localStorage.removeItem(BG_AI); } catch (e) { } bgStartAi(true); drawBg(); },
  'bg-lobby': () => { bg = null; drawBg(); window.scrollTo(0, 0); },
  'bg-open': d => { const g = myGames().find(x => x.id === d.id); if (!g) return; bgFromDoc(g); drawBg(); window.scrollTo(0, 0); },
  'bg-invite': () => {
    const list = S.employees.filter(e => e.id !== session() && e.id !== 'news').sort((a, b) => a.name.localeCompare(b.name, 'he'));
    sheet(`<h3>את מי להזמין?</h3><p class="muted" style="margin:4px 0 12px">ההזמנה תופיע אצלו/ה בפנאי › שש בש, עם התראה לטלפון.</p><div class="list">${list.map(e => `<button class="row tap" data-action="bg-invite-to" data-id="${e.id}">${avatar(e, 'md')}<div class="row-main"><div class="row-title">${esc(e.name)}</div></div></button>`).join('') || '<div class="row muted">אין עובדים אחרים</div>'}</div>`);
  },
  'bg-invite-to': async d => {
    if (bgBusy) return; bgBusy = true; const r = await store.bgCreate(d.id); bgBusy = false;
    if (r.error) return toast(r.error);
    closeSheet(); toast(`ההזמנה נשלחה ל${first(emp(d.id).name)}`);
    const g = myGames().find(x => x.id === r.id); if (g) bgFromDoc(g); else bg = null;
    if (view !== 'bg') go('bg'); else drawBg();
  },
  'bg-accept': async d => {
    const g = myGames().find(x => x.id === d.id); if (!g) return;
    const r = await store.bgUpdate(d.id, { status: 'play', turn: Math.random() < .5 ? 'w' : 'b', ts: Date.now() }); if (r && r.error) return toast(r.error);
    const n = myGames().find(x => x.id === d.id); if (n) bgFromDoc(n); drawBg();
  },
  'bg-del': async d => { const r = await store.bgDelete(d.id); if (r && r.error) return toast(r.error); if (bg && bg.id === d.id) bg = null; drawBg(); },
  'bg-pt': d => {
    if (!bg || !bg.t || bgBusy) return; const info = turnInfo(bg.t, bg.me); if (info.done) return;
    const p = d.p === 'bar' || d.p === 'off' ? d.p : +d.p;
    if (bg.sel !== null && bg.sel !== undefined) { const o = info.moves.filter(m => m.from === bg.sel && m.to === p).sort((a, b) => a.die - b.die); if (o.length) return bgPlay(o[0]); }
    const mv = info.moves.filter(m => m.from === p).sort((a, b) => a.die - b.die);
    if (!mv.length) { bg.sel = null; return drawBg(); }
    // Only one place this checker can go: move it right away.
    if (new Set(mv.map(m => m.to)).size === 1) return bgPlay(mv[0]);
    bg.sel = p; drawBg();
  },
  'bg-roll': async () => {
    if (!bg || bg.t || bgBusy) return; const d = roll();
    if (bg.mode === 'online') { bgBusy = true; const r = await store.bgUpdate(bg.id, { dice: d, ts: Date.now() }); bgBusy = false; if (r && r.error) return toast(r.error); }
    bg.t = { start: bg.board, dice: d, played: [], board: bg.board }; bg.sel = null; haptic(12);
    if (bg.mode === 'ai') bgSaveAi();
    drawBg();
  },
  'bg-undo': () => { if (!bg || !bg.t) return; bg.t.board = bg.t.start; bg.t.played = []; bg.sel = null; if (bg.mode === 'ai') bgSaveAi(); drawBg(); },
  'bg-done': () => bgFinish(),
  'bg-resign': () => { const b = document.querySelector('[data-action="bg-resign"]'); if (b) { b.dataset.action = 'bg-resign-yes'; b.textContent = 'לפרוש? לחצו שוב'; } },
  'bg-resign-yes': async () => {
    if (!bg || bg.over) return;
    if (bg.mode === 'ai') return bgOver({ winner: other(bg.me), mult: 1 }, true);
    const r = await store.bgUpdate(bg.id, { status: 'done', winner: bg.opp, resign: session(), ts: Date.now() }); if (r && r.error) return toast(r.error);
    bg.over = { winner: other(bg.me), mult: 1, resign: session() }; bgRecord(false, false, bg.id); drawBg();
  }
};
Object.assign(ACT, FUN_ACT);
FORMS['gal-up'] = async (v, f) => {
  if (!galPending || busy) return; busy = true; const list = galPending, btn = f.querySelector('button');
  try {
    for (let i = 0; i < list.length; i++) {
      if (btn) btn.textContent = list.length > 1 ? `מעלה ${i + 1} מתוך ${list.length}…` : 'מעלה…';
      const r = await store.uploadPhoto({ ...list[i], caption: (v.caption || '').trim().slice(0, 300) });
      if (r && r.error) { toast(r.error); return; }
    }
    galPending = null; closeSheet(); toast(list.length > 1 ? 'התמונות עלו לגלריה' : 'התמונה עלתה לגלריה'); render();
  } finally { busy = false; if (btn && galPending) btn.textContent = 'העלאה לגלריה'; }
};

document.addEventListener('click', e => { const b = e.target.closest('[data-action]'); if (!b) return; const a = ACT[b.dataset.action]; if (!a) return; e.preventDefault(); if ((viewer || ro) && !VIEW_OK.includes(b.dataset.action)) return toast(viewer ? 'משתמש בקרה · צפייה בלבד' : 'יש לך הרשאת צפייה בלבד באזור הזה'); if (poster && (!POSTER_OK.includes(b.dataset.action) || (b.dataset.action === 'nav' && !['reels', 'display'].includes(b.dataset.view)))) return toast('המשתמש הזה מיועד להעלאת רילסים בלבד'); a(b.dataset, b); });
document.addEventListener('click', e => { if (viewer && e.target.closest('a.btn, input[type=file], label.btn')) { e.preventDefault(); toast('משתמש בקרה · צפייה בלבד'); } }, true);
document.addEventListener('submit', e => { const f = e.target.closest('form[data-form]'); if (!f) return; e.preventDefault(); if (busy) return; if ((viewer || ro) && f.dataset.form !== 'login') return toast(viewer ? 'משתמש בקרה · צפייה בלבד' : 'יש לך הרשאת צפייה בלבד באזור הזה'); if (poster && !['login', 'reel'].includes(f.dataset.form)) return toast('המשתמש הזה מיועד להעלאת רילסים בלבד'); FORMS[f.dataset.form]?.(Object.fromEntries(new FormData(f)), f); });
document.addEventListener('input', e => { const r = e.target.closest('[data-ds-range]'); if (!r) return; DS[r.dataset.dsRange] = +r.value; applyDisplay(); const l = document.getElementById('scale-val'); if (l) l.textContent = r.value + '%'; });
document.addEventListener('change', e => { if (e.target.closest('[data-ds-range]')) saveDS(); if (e.target.closest('[data-calc]')) drawCalc(); });
document.addEventListener('change', e => { if (e.target.matches('[data-segpick]')) { e.target.closest('.seg-wrap').querySelectorAll('label.seg').forEach(l => l.classList.toggle('on', l.querySelector('input').checked)); slideSegs(e.target.closest('.sheet') || document.getElementById('main')); } });
document.addEventListener('input', e => {
  if (e.target.matches('[data-bc]')) bcPreview(e.target.value);
  if (e.target.matches('[data-prod-q]')) { prodQ = e.target.value; prodShown = 60; refreshProds(); }
  if (e.target.matches('[data-dm]')) { chatDraft = e.target.value; e.target.style.height = 'auto'; e.target.style.height = Math.min(140, e.target.scrollHeight) + 'px'; }
  if (e.target.matches('[data-pos-q]')) { posQ = e.target.value; const b = document.getElementById('pos-sug'); if (b) b.innerHTML = posSugHtml(); }
  if (e.target.matches('[data-pos-till]')) { pos.till = e.target.value; posKeep(); }
  if (e.target.matches('[data-pp-time]') && pp && /^\d\d:\d\d$/.test(e.target.value)) { pp[e.target.dataset.ppTime] = e.target.value; clearTimeout(ppTimer); ppTimer = setTimeout(savePP, 600); }
  if (e.target.matches('[data-pw]')) pwCalc();
  if (e.target.matches('[data-inv-q]')) { invQ = e.target.value; invShown = 80; const b = document.getElementById('inv-all'); if (b) b.innerHTML = invAllHtml(); watchMore(); }
});
document.addEventListener('input', e => { if (e.target.closest('[data-calc]')) drawCalc(); if (e.target.matches('[data-mention]')) mentionInput(e.target); });
document.addEventListener('change', e => { if (e.target.matches('input[data-up]')) prepUpload(e.target); });
document.addEventListener('change', e => { if (e.target.matches('[data-su-emp]')) { const n = e.target.closest('form').querySelector('.su-new'); if (n) n.hidden = e.target.value !== '__new'; } });
document.addEventListener('change', e => { if (e.target.matches('[data-prod-d]')) { prodDept = e.target.value; prodShown = 60; refreshProds(); } });
document.addEventListener('change', async e => {
  const inp = e.target.closest('input[data-import-csv]'); if (!inp || !inp.files || !inp.files[0]) return;
  if (!canE('products')) return openPin();
  if (!store.loaded('catalog')) return toast('רשימת המוצרים עדיין נטענת. נסו שוב בעוד רגע');
  try {
    const r = importCsv(await inp.files[0].text()); inp.value = '';
    if (r.error) return toast(r.error);
    save(); render();
    sheet(`<h3>הייבוא הסתיים</h3><div class="list" style="margin-top:10px"><div class="row"><div class="row-main">מוצרים חדשים</div><b>${r.added.toLocaleString('he-IL')}</b></div><div class="row"><div class="row-main">מוצרים שעודכנו</div><b>${r.updated.toLocaleString('he-IL')}</b></div><div class="row"><div class="row-main">חוברו לפריטים קיימים במלאי (לפי שם)</div><b>${r.linked.toLocaleString('he-IL')}</b></div><div class="row"><div class="row-main"><span class="nobc-t">●</span> בלי ברקוד</div><b>${r.noBc.toLocaleString('he-IL')}</b></div>${r.bcConflicts ? `<div class="row"><div class="row-main">ברקוד שכבר שייך למוצר אחר (לא נשמר)</div><b>${r.bcConflicts}</b></div>` : ''}${r.skipped ? `<div class="row"><div class="row-main">שורות שדולגו (פריט כללי או שורה חסרה)</div><b>${r.skipped}</b></div>` : ''}</div><button class="btn primary block" style="margin-top:12px" data-action="close">סגירה</button>`);
  } catch (err) { console.error(err); toast('לא הצלחתי לקרוא את הקובץ'); }
});
document.addEventListener('scroll', e => { const t = e.target; if (!t.classList || !t.classList.contains('rp-track')) return; const i = Math.round(Math.abs(t.scrollLeft) / t.clientWidth); t.parentElement.querySelectorAll('.rp-dots i').forEach((d, k) => d.classList.toggle('on', k === i)); }, true);
new MutationObserver(() => { if (document.getElementById('pr-calc') && !document.getElementById('pr-calc').innerHTML) drawCalc(); }).observe(document.getElementById('layer') || document.body, { childList: true, subtree: true });
// Item photos are shrunk on the phone before saving, so the shared database stays small and fast.
function shrinkImage(file, max = 360, limit = 120000) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => {
      const k = Math.min(1, max / Math.max(im.width, im.height)), c = document.createElement('canvas');
      c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); let q = .78, d = c.toDataURL('image/jpeg', q);
      while (d.length > limit && q > .3) { q -= .1; d = c.toDataURL('image/jpeg', q); }
      res(d);
    };
    im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('bad image')); };
    im.src = url;
  });
}
document.addEventListener('change', async e => {
  const inp = e.target.closest('input[data-img-for]'); if (!inp || !inp.files || !inp.files[0]) return;
  if (!canE('inv') && !canE('products')) return openPin();
  const id = inp.dataset.imgFor, i = byId(S.inventory, id); if (!i) return;
  try {
    const data = await shrinkImage(inp.files[0]);
    S.images[id] = { cat: i.cat, data }; save(); render(); ACT['inv-update']({ id }); toast('התמונה נשמרה');
  } catch (err) { toast('לא הצלחתי לקרוא את התמונה. נסו תמונה אחרת'); }
});
document.addEventListener('change', async e => {
  const inp = e.target.closest('input[data-emp-photo]'); if (!inp || !inp.files || !inp.files[0]) return;
  const id = inp.dataset.empPhoto; if (id !== session() && (poster || !canE('staff'))) return openPin();
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
  // A tapped web notification opens the app with ?open=<screen>&chat=<employee>.
  const qs = new URLSearchParams(location.search), opened = qs.get('open');
  try { history.replaceState({ view, d: 0 }, '', location.pathname); } catch (e) { }
  render();
  if (session()) { if (opened) openFromPush({ view: opened, chat: qs.get('chat') }); initPush(false); }
  let lastCount = alerts().count;
  setInterval(() => { tick(); if (!session()) return; geoCheck(); updateSync(); const c = alerts().count; if (c !== lastCount) { lastCount = c; renderNav(); } }, 1000);
})();
