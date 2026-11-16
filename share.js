// Sharing a photo or video from the app: the phone's own share menu (WhatsApp, Instagram, saving to the gallery…).
// In the Android app this goes through the Share plugin (the app's web view has no share menu of its own);
// on iPhone and in browsers through the browser's share menu; where there is none, the file is downloaded.
import { Capacitor, registerPlugin } from '@capacitor/core';

const Share = registerPlugin('Share'), Files = registerPlugin('Filesystem');
const native = () => Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Share') && Capacitor.isPluginAvailable('Filesystem');
const b64 = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); });
export function download(blob, name) {
  const u = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 60000);
}
// files: [{ blob, name }]. Returns 'shared', 'cancel' or 'saved' (downloaded instead).
export async function shareFiles(files, title = '') {
  if (native()) {
    try {
      const uris = [];
      for (const f of files) uris.push((await Files.writeFile({ path: f.name, data: await b64(f.blob), directory: 'CACHE' })).uri);
      await Share.share({ title, files: uris, dialogTitle: 'שיתוף' });
      return 'shared';
    } catch (e) { if (/cancel/i.test(String((e && e.message) || e))) return 'cancel'; }
  }
  const list = files.map(f => new File([f.blob], f.name, { type: f.blob.type || 'application/octet-stream' }));
  if (navigator.canShare && navigator.canShare({ files: list })) {
    try { await navigator.share({ files: list, ...(title ? { title } : {}) }); return 'shared'; }
    catch (e) { if (e && e.name === 'AbortError') return 'cancel'; }
  }
  files.forEach(f => download(f.blob, f.name));
  return 'saved';
}
