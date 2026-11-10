// Sends phone notifications (Firebase Cloud Messaging) when something happens in the shop's database:
// a private message, a new task, a change in someone's shift, a new reel, or a new alert for the managers.
// Every phone saves its delivery token in pushTokens/{token} = { emp, token, platform }.
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();
const db = getFirestore();
const SITE = 'https://nn0548444087-creator.github.io/dalpak/';
const WATCHED = ['messages', 'tasks', 'shifts', 'reels', 'notifications'];

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

async function send(empIds, title, body, data = {}) {
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

// Permanent managers (logins marked admin), for the managers' alerts.
async function managers() {
  const snap = await db.collection('logins').where('admin', '==', true).get();
  return snap.docs.map(d => d.data().empId).filter(Boolean);
}

async function onMessage(before, after) {
  if (before || !after || !after.to) return;
  const from = first(await empName(after.from)) || 'עובד';
  await send([after.to], `הודעה מ${from}`, cut(after.text), { view: 'dm', chat: after.from });
}

async function onTask(before, after) {
  if (before || !after || !after.empId) return;
  await send([after.empId], 'משימה חדשה', cut(after.title), { view: 'tasks' });
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
  else if (before.status === 'open' && after.status === 'approved' && after.end && Math.abs(Date.now() - after.end) > 3 * 60000) title = 'המנהל סגר את המשמרת שלך';
  else if ((before.allowUntil || null) !== (after.allowUntil || null) && after.allowUntil) title = 'קיבלת אישור להמשיך במשמרת';
  if (title) await send([s.empId], title, when, { view: 'clock' });
}

async function onReel(before, after) {
  // A reel counts once all its parts are uploaded (ready flips to true).
  if (!after || after.ready !== true || (before && before.ready === true)) return;
  const emps = await db.collection('employees').get();
  const to = emps.docs.map(d => d.id).filter(id => id !== after.by);
  const who = after.by === 'news' ? 'חדשות מרקט' : first(await empName(after.by)) || 'מישהו';
  await send(to, `רילס חדש מ${who}`, cut(after.caption, 90) || 'יש סרטון חדש בפיד', { view: 'reels' });
}

async function onAlert(before, after) {
  if (before || !after || !after.text) return;
  await send(await managers(), 'התראה למנהלים', cut(after.text), { view: 'alerts' });
}

exports.notify = onDocumentWritten({ document: '{col}/{id}', region: 'me-west1', retry: false }, async event => {
  const col = event.params.col;
  if (!WATCHED.includes(col)) return;
  const before = event.data.before.exists ? event.data.before.data() : null;
  const after = event.data.after.exists ? event.data.after.data() : null;
  const run = { messages: onMessage, tasks: onTask, shifts: onShift, reels: onReel, notifications: onAlert }[col];
  try { await run(before, after); } catch (e) { console.error(col, event.params.id, e); }
});
