const MIN_CHECK_INTERVAL_MS = 60_000;
const CHECK_INTERVAL_MS = 5 * 60_000;

/** Vérifier le service worker suffit : ses caches sont remplacés sans toucher aux notes ni aux téléchargements. */
export async function checkForAppUpdate() {
  if (!('serviceWorker' in navigator)) throw new Error('Les mises à jour automatiques ne sont pas disponibles dans ce navigateur.');
  if (!navigator.onLine) throw new Error('Reconnecte-toi pour vérifier la version de Discover.');
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) throw new Error('Ferme puis rouvre Discover pour initialiser les mises à jour.');
  await registration.update();
}

/** Les PWA mobiles restent souvent ouvertes plusieurs jours : vérifier aussi lors de leur réouverture. */
export function watchAppUpdates(registration: ServiceWorkerRegistration) {
  let lastCheck = 0;
  let checking = false;
  const check = async () => {
    if (document.visibilityState !== 'visible' || !navigator.onLine || checking || Date.now() - lastCheck < MIN_CHECK_INTERVAL_MS) return;
    checking = true;
    lastCheck = Date.now();
    try { await registration.update(); }
    catch { /* Un passage hors ligne ne doit pas interrompre l'application. */ }
    finally { checking = false; }
  };
  const onResume = () => { void check(); };
  window.addEventListener('focus', onResume);
  window.addEventListener('online', onResume);
  document.addEventListener('visibilitychange', onResume);
  const timer = window.setInterval(onResume, CHECK_INTERVAL_MS);
  onResume();
  return () => {
    window.removeEventListener('focus', onResume);
    window.removeEventListener('online', onResume);
    document.removeEventListener('visibilitychange', onResume);
    window.clearInterval(timer);
  };
}
