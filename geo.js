// Location during a shift: used to close the shift when the employee leaves the shop and does not come back.
// In the Android app the location is read also while the app is closed (a background plugin, with a
// fixed notification while on shift). In a browser or on iPhone it is read only while the app is open.
import { Capacitor, registerPlugin } from '@capacitor/core';

const BG = registerPlugin('BackgroundGeolocation');
const bgReady = () => Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('BackgroundGeolocation');

// Distance in metres between two points ({ lat, lng }).
export function distM(a, b) {
  const r = Math.PI / 180, R = 6371000;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// One reading now (for setting the shop's location). Resolves { lat, lng, acc } or rejects with 'denied' / 'error'.
export function geoOnce(timeout = 20000) {
  return new Promise((ok, bad) => {
    if (!('geolocation' in navigator)) return bad('unsupported');
    navigator.geolocation.getCurrentPosition(
      p => ok({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }),
      e => bad(e && e.code === 1 ? 'denied' : 'error'),
      { enableHighAccuracy: true, maximumAge: 0, timeout });
  });
}

let watch = null;
export const geoWatching = () => !!watch;
export const geoBackground = () => bgReady();
// Starts reading the location. onPos({ lat, lng, acc, t }); onErr('denied' | 'error' | 'unsupported').
export async function geoStart(onPos, onErr) {
  if (watch) return watch.kind;
  if (bgReady()) {
    watch = { kind: 'bg', id: null };
    try {
      watch.id = await BG.addWatcher({
        backgroundTitle: 'שאבעס מרקט · במשמרת',
        backgroundMessage: 'המיקום נבדק במשמרת, כדי לסגור אותה אם יוצאים מהחנות',
        requestPermissions: true, stale: false, distanceFilter: 20
      }, (loc, err) => {
        if (err) return onErr(err.code === 'NOT_AUTHORIZED' ? 'denied' : 'error');
        if (loc) onPos({ lat: loc.latitude, lng: loc.longitude, acc: loc.accuracy, t: loc.time || Date.now() });
      });
      return 'bg';
    } catch (e) { watch = null; }
  }
  if (!('geolocation' in navigator)) { onErr('unsupported'); return null; }
  const id = navigator.geolocation.watchPosition(
    p => onPos({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, t: p.timestamp || Date.now() }),
    e => onErr(e && e.code === 1 ? 'denied' : 'error'),
    { enableHighAccuracy: true, maximumAge: 30000, timeout: 60000 });
  watch = { kind: 'web', id };
  return 'web';
}
export async function geoStop() {
  const w = watch; watch = null; if (!w) return;
  try { if (w.kind === 'bg') { if (w.id) await BG.removeWatcher({ id: w.id }); } else navigator.geolocation.clearWatch(w.id); } catch (e) { }
}
// Opens the phone's settings for this app (Android app only), to allow location.
export async function geoSettings() { if (bgReady()) { try { await BG.openSettings(); return true; } catch (e) { } } return false; }
