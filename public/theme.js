// Thème clair / sombre posé avant le premier affichage (sinon la page s'afficherait en clair puis basculerait).
// Fichier à part et non script dans la page : la politique de sécurité du site (vercel.json, script-src 'self')
// bloque les scripts écrits dans le HTML. Même règle que src/composables/useTheme.js.
(function () {
  var choix = null
  try { choix = localStorage.getItem('btm-theme') || localStorage.getItem('btm-admin-theme') } catch (e) {}
  var sombre = choix ? choix === 'sombre' : !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = sombre ? 'sombre' : 'clair'
  document.documentElement.style.colorScheme = sombre ? 'dark' : 'light'
})()
