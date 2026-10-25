/**
 * Durée de vie de la session sur l'appareil.
 * - Site fermé (dernier onglet du site fermé) : la session est oubliée, il faut se reconnecter à la prochaine visite.
 *   Rechargement de la page, autre onglet du site encore ouvert : rien ne change.
 * - Inactivité : le compte est déconnecté après un délai sans aucun geste (souris, clavier, toucher, défilement),
 *   tous onglets confondus. Le délai dépend du compte (voir App.vue) : le reste du temps, aucune déconnexion.
 *
 * Les onglets ouverts se signalent dans le localStorage (registre) ; chaque onglet garde son identifiant dans son
 * sessionStorage, qui survit au rechargement mais disparaît avec l'onglet.
 */

const CLE_ONGLETS = 'btm-onglets' // localStorage : { identifiant d'onglet: dernier signe de vie (ms) }
const CLE_ONGLET = 'btm-onglet' // sessionStorage : { id, vu } de cet onglet
const CLE_ACTIVITE = 'btm-activite' // localStorage : dernier geste, tous onglets (ms)
const BATTEMENT = 30 * 1000
// Un onglet sans signe de vie depuis 2 min est fermé (navigateur tué, téléphone qui a vidé sa mémoire) : un onglet
// en arrière-plan ne bat qu'une fois par minute au plus (économie d'énergie des navigateurs).
const VIE = 2 * 60 * 1000
// Onglet rouvert (Ctrl+Maj+T, restauration du navigateur) après ce délai : traité comme une nouvelle visite
const RETOUR = 15 * 60 * 1000

const lire = (stockage, cle) => { try { return JSON.parse(stockage.getItem(cle)) } catch { return null } }
const ecrire = (stockage, cle, valeur) => { try { stockage.setItem(cle, JSON.stringify(valeur)) } catch { /* stockage indisponible */ } }
const vivants = (onglets, maintenant = Date.now()) => Object.fromEntries(Object.entries(onglets || {}).filter(([, t]) => maintenant - t < VIE))

/**
 * À appeler avant la création du client Supabase. Premier onglet d'une nouvelle visite (aucun autre onglet du site
 * ouvert, et pas un rechargement) : la session restée sur l'appareil est effacée.
 */
export function oublierSessionSiSiteFerme() {
  if (typeof window === 'undefined') return
  try {
    const onglet = lire(sessionStorage, CLE_ONGLET)
    const rechargement = onglet && Date.now() - onglet.vu < RETOUR
    if (rechargement || Object.keys(vivants(lire(localStorage, CLE_ONGLETS))).length) return
    for (const cle of Object.keys(localStorage)) if (/^sb-.+-auth-token/.test(cle)) localStorage.removeItem(cle)
    localStorage.removeItem(CLE_ACTIVITE)
  } catch { /* stockage indisponible : la session n'y est pas gardée non plus */ }
}

/** Inscrit cet onglet au registre tant qu'il est ouvert */
export function suivreOnglet() {
  const id = lire(sessionStorage, CLE_ONGLET)?.id || Math.random().toString(36).slice(2, 10)
  const signe = () => {
    const maintenant = Date.now()
    ecrire(localStorage, CLE_ONGLETS, { ...vivants(lire(localStorage, CLE_ONGLETS), maintenant), [id]: maintenant })
    ecrire(sessionStorage, CLE_ONGLET, { id, vu: maintenant })
  }
  const partir = () => {
    const onglets = vivants(lire(localStorage, CLE_ONGLETS))
    delete onglets[id]
    ecrire(localStorage, CLE_ONGLETS, onglets)
    ecrire(sessionStorage, CLE_ONGLET, { id, vu: Date.now() })
  }
  signe()
  setInterval(signe, BATTEMENT)
  window.addEventListener('pagehide', partir)
  window.addEventListener('pageshow', signe)
}

// ---------- Inactivité ----------

// Onglet rechargé (ou rouvert par le téléphone après une mise en veille) : l'inactivité d'avant compte toujours
let dernierGeste = typeof window === 'undefined' ? 0 : Number(lire(localStorage, CLE_ACTIVITE)) || Date.now()
let ecrit = 0
const derniereActivite = () => Math.max(dernierGeste, Number(lire(localStorage, CLE_ACTIVITE)) || 0)

/**
 * Surveille l'inactivité. `delai()` : délai du compte connecté (ms) ; null : pas de déconnexion automatique (visiteur,
 * fournisseur) ; undefined : compte pas encore identifié (ses gestes ne sont pas comptés, pour ne pas effacer une
 * inactivité passée). `expiree()` : appelé une fois le délai dépassé.
 * Vérifié toutes les 20 s, au retour sur l'onglet, et au premier geste après une pause : au sortir d'une veille, les
 * minuteries ont dormi et le premier mouvement de souris ne doit pas prolonger la session.
 */
export function surveillerInactivite(delai, expiree) {
  const verifier = () => {
    const d = delai()
    if (d && Date.now() - derniereActivite() > d) { expiree(); return true }
    return false
  }
  const geste = () => {
    const d = delai()
    if (d === undefined) return
    const maintenant = Date.now()
    if (maintenant - dernierGeste > 30000 && verifier()) return
    dernierGeste = maintenant
    if (maintenant - ecrit > 10000) { ecrit = maintenant; ecrire(localStorage, CLE_ACTIVITE, maintenant) } // partagé avec les autres onglets
  }
  // pas « scroll » : les galeries de l'accueil défilent seules et compteraient comme de l'activité
  for (const type of ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart']) window.addEventListener(type, geste, { passive: true, capture: true })
  setInterval(verifier, 20000)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') verifier() })
}
