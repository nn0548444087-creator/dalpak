// Phone notifications (Firebase Cloud Messaging).
// The phone asks for permission, gets a delivery token and saves it under the signed-in employee.
// A server function (functions/index.js) then sends notifications for new messages, tasks,
// shift changes and reels, also while the app is closed.
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';

// Public key for web notifications (Firebase console › Project settings › Cloud Messaging › Web Push certificates).
export const VAPID = 'BCyrlpzwHmZyuFGoHWzZglocs9-Scomy5jsOHYv-a0xk_sXZkwgE3SXDo-QTWHV_ui6Cq7Bo0zAxrOkRQnAF2t0';

const native = () => Capacitor.isNativePlatform();
const webReady = async () => 'Notification' in window && 'serviceWorker' in navigator && VAPID.length > 40 && await isSupported().catch(() => false);

// on · ask (not decided yet) · denied (blocked in the phone's settings) · update (old app version) · unsupported
export async function pushState() {
  try {
    if (native()) {
      if (!Capacitor.isPluginAvailable('PushNotifications')) return 'update';
      const p = await PushNotifications.checkPermissions();
      return p.receive === 'granted' ? 'on' : p.receive === 'denied' ? 'denied' : 'ask';
    }
    if (!(await webReady())) return 'unsupported';
    return Notification.permission === 'granted' ? 'on' : Notification.permission === 'denied' ? 'denied' : 'ask';
  } catch (e) { return 'unsupported'; }
}

let listening = false;
export async function startPush(store, { ask = false, onForeground, onOpen } = {}) {
  try {
    if (native()) {
      if (!Capacitor.isPluginAvailable('PushNotifications')) return 'update';
      let p = await PushNotifications.checkPermissions();
      if (p.receive !== 'granted' && ask) p = await PushNotifications.requestPermissions();
      if (p.receive !== 'granted') return p.receive === 'denied' ? 'denied' : 'ask';
      if (!listening) {
        listening = true;
        await PushNotifications.createChannel({ id: 'general', name: 'התראות', description: 'הודעות, משימות, משמרות ורילסים', importance: 5, visibility: 1, vibration: true, lights: true }).catch(() => { });
        await PushNotifications.addListener('registration', t => store.savePushToken(t.value, 'android'));
        await PushNotifications.addListener('registrationError', e => console.warn('push registration', e));
        await PushNotifications.addListener('pushNotificationReceived', n => onForeground && onForeground(n.title, n.body, n.data || {}));
        await PushNotifications.addListener('pushNotificationActionPerformed', a => onOpen && onOpen((a.notification && a.notification.data) || {}));
      }
      await PushNotifications.register();
      return 'on';
    }
    if (!(await webReady())) return 'unsupported';
    let perm = Notification.permission;
    if (perm === 'default' && ask) perm = await Notification.requestPermission();
    if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'ask';
    const reg = await navigator.serviceWorker.register('./firebase-messaging-sw.js');
    const m = getMessaging(store.firebaseApp);
    const token = await getToken(m, { vapidKey: VAPID, serviceWorkerRegistration: reg });
    if (!token) return 'ask';
    await store.savePushToken(token, 'web');
    if (!listening) { listening = true; onMessage(m, p => onForeground && onForeground(p.notification && p.notification.title, p.notification && p.notification.body, p.data || {})); }
    return 'on';
  } catch (e) { console.warn('push', e); return 'error'; }
}
