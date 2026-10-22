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
    const ex = (S.extras || []).filter(x => x.empId === e.id && x.status === 'approved' && monthKey(x.ts) === key);
    const deliv = sum(ex.filter(x => x.kind === 'delivery').map(x => +x.amount || 0)), bonus = sum(ex.filter(x => x.kind === 'bonus').map(x => +x.amount || 0));
    return { name: e.name, num: e.num || '', wage: e.wage, hours: h, pay: h * e.wage, deliv, bonus, total: h * e.wage + deliv + bonus, count: sh.length };
  }).filter(x => x.count || x.deliv || x.bonus);
  const id = 'sum-' + key;
  S.notifications = S.notifications.filter(n => n.id !== id);
  S.notifications.unshift({ id, type: 'summary', ts: ts || Date.now(), key, rows, hours: sum(rows.map(x => x.hours)), total: sum(rows.map(x => x.total)), deliv: sum(rows.map(x => x.deliv)), bonus: sum(rows.map(x => x.bonus)) });
}
export const hasSummary = (S, key) => S.notifications.some(n => n.id === 'sum-' + key);

// ---- barcodes: EAN-13 / EAN-8 for retail numbers, Code 128 for anything else ----
const EAN_L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const EAN_R = EAN_L.map(c => c.replace(/./g, b => b === '0' ? '1' : '0'));
const EAN_G = EAN_R.map(c => c.split('').reverse().join(''));
const EAN_PAR = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
// The check digit for an EAN/UPC number (digits without their check digit).
export const eanCheck = d => { let s = 0; [...d].reverse().forEach((c, i) => { s += +c * (i % 2 ? 1 : 3); }); return (10 - s % 10) % 10; };
const C128 = ['212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412', '211214', '211232', '2331112'];
const widthsToBits = w => [...w].map((n, i) => (i % 2 ? '0' : '1').repeat(+n)).join('');
// Turns the typed code into bars. Returns { type, bits, text, note } or null when there is nothing to draw.
export function barcodeBits(raw) {
  const v = String(raw || '').trim(); if (!v) return null;
  if (/^\d{13}$/.test(v) && eanCheck(v.slice(0, 12)) === +v[12]) {
    let b = '101'; const par = EAN_PAR[+v[0]];
    for (let i = 1; i <= 6; i++) b += (par[i - 1] === 'L' ? EAN_L : EAN_G)[+v[i]];
    b += '01010'; for (let i = 7; i <= 12; i++) b += EAN_R[+v[i]]; b += '101';
    return { type: 'EAN-13', bits: b, text: v };
  }
  if (/^\d{12}$/.test(v) && eanCheck(v.slice(0, 11)) === +v[11]) return { ...barcodeBits('0' + v), type: 'UPC-A', text: v };
  if (/^\d{8}$/.test(v) && eanCheck(v.slice(0, 7)) === +v[7]) {
    let b = '101'; for (let i = 0; i < 4; i++) b += EAN_L[+v[i]];
    b += '01010'; for (let i = 4; i < 8; i++) b += EAN_R[+v[i]]; b += '101';
    return { type: 'EAN-8', bits: b, text: v };
  }
  if (/[^\x20-\x7e]/.test(v)) return { note: 'אפשר להשתמש רק במספרים, אותיות באנגלית וסימנים' };
  // Code 128: set C packs digit pairs (shorter bars for long numbers), set B for everything else.
  const codes = /^\d+$/.test(v) && v.length % 2 === 0 ? [105, ...v.match(/\d\d/g).map(Number)] : [104, ...[...v].map(c => c.charCodeAt(0) - 32)];
  const check = codes.reduce((s, c, i) => s + c * (i || 1), 0) % 103;
  const bits = [...codes, check, 106].map(c => widthsToBits(C128[c])).join('');
  const len = v.length;
  return { type: 'Code 128', bits, text: v, note: /^\d+$/.test(v) && [8, 12, 13].includes(len) ? 'ספרת הביקורת לא מתאימה למספר EAN, לכן הברקוד נוצר בפורמט Code 128. בדקו את המספר.' : '' };
}
// An SVG barcode that scanners read off a phone screen: black bars on white with quiet zones.
export function barcodeSvg(raw, { h = 64, label = true } = {}) {
  const r = barcodeBits(raw); if (!r || !r.bits) return '';
  const q = 10, W = r.bits.length + q * 2, H = h + (label ? 16 : 0);
  let rects = '', i = 0;
  while (i < r.bits.length) { if (r.bits[i] === '1') { let j = i; while (r.bits[j] === '1') j++; rects += `<rect x="${i + q}" y="0" width="${j - i}" height="${h}"/>`; i = j; } else i++; }
  return `<svg class="bc-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" shape-rendering="crispEdges" role="img" aria-label="ברקוד ${r.text}"><rect width="${W}" height="${H}" fill="#fff"/><g fill="#000">${rects}</g>${label ? `<text x="${W / 2}" y="${H - 2}" text-anchor="middle" font-family="monospace" font-size="12" fill="#000">${r.text.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])}</text>` : ''}</svg>`;
}
