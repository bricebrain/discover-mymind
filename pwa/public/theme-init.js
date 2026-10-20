// Thème choisi dans l'app, appliqué avant le premier affichage (même clé que src/settings/theme.ts). Défaut : clair.
(function () {
  var saved = null;
  try { saved = localStorage.getItem('discover:theme'); } catch (e) {}
  var dark = saved === 'dark' || (saved === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  var theme = dark ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#0d0e12' : '#ffffff');
})();
