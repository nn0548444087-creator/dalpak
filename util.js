// Pure helpers shared by the app and both data stores.
export const H = 36e5, DAY = 864e5;
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
export const pad = n => String(n).padStart(2, '0');
export const sum = a => a.reduce((x, y) => x + y, 0);
export const dur = s => ((s.end ?? Date.now()) - s.start) / H;
export const sod = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
export const sameDay = (a, b) => sod(a) === sod(b);
export const monthKey = t => { const d = new Date(t); return d.getFullYear() + '-' + pad(d.getMonth() + 1); };
export const prevMonthKey = () => { const d = new Date(); return monthKey(new Date(d.getFullYear(), d.getMonth() - 1, 1)); };
export const dateKey = t => { const d = new Date(t); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
export const weekStart = t => { const d = new Date(sod(t)); d.setDate(d.getDate() - d.getDay()); return d.getTime(); };
export const normPhone = p => { let d = String(p || '').replace(/\D/g, ''); if (d.startsWith('972')) d = '0' + d.slice(3); return d; };
export const fmtPhone = p => { const d = normPhone(p); return d.length === 10 ? d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6) : d; };
export function rng(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// Monthly payroll summary: approved, closed shifts only. Deterministic id so it is created once per month.
export function buildSummary(S, key, ts) {
  const rows = S.employees.map(e => {
    const sh = S.shifts.filter(s => s.empId === e.id && s.status === 'approved' && s.end && monthKey(s.start) === key);
    const h = sum(sh.map(dur));
    return { name: e.name, num: e.num || '', wage: e.wage, hours: h, pay: h * e.wage, count: sh.length };
  }).filter(x => x.count);
  const id = 'sum-' + key;
  S.notifications = S.notifications.filter(n => n.id !== id);
  S.notifications.unshift({ id, type: 'summary', ts: ts || Date.now(), key, rows, hours: sum(rows.map(x => x.hours)), total: sum(rows.map(x => x.pay)) });
}
export const hasSummary = (S, key) => S.notifications.some(n => n.id === 'sum-' + key);
