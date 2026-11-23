/**
 * Écran de chargement (index.html) : il reste affiché tant que la première page n'est pas vraiment prête.
 * Un composant lourd (scène 3D de l'accueil…) le retient le temps de se charger ; plafonné pour ne jamais bloquer.
 */
const attentes = []
let retire = false

/** Retient l'écran ; renvoie la fonction qui le libère (sans effet une fois l'écran parti) */
export function retenirEcranChargement() {
  if (retire) return () => {}
  let liberer
  attentes.push(new Promise((r) => { liberer = r }))
  return liberer
}

/** Fait avancer la ligne de chargement jusqu'à `part` (0 à 1) : une étape réelle vient de se terminer */
export const avancerChargement = (part) => window.__btmProgres?.(part)

/** Retire l'écran quand tout ce qui le retient est prêt (au plus tard après `plafond` ms) */
export async function retirerEcranChargement(plafond = 4500) {
  if (retire) return
  retire = true
  avancerChargement(0.6)
  // polices puis éléments retenus (3D…) : chacun fait avancer la ligne vers la fin
  const etapes = [document.fonts?.ready ?? Promise.resolve(), ...attentes]
  let finies = 0
  const suivies = etapes.map((p) => p.then(() => avancerChargement(0.6 + 0.35 * (++finies / etapes.length))))
  await Promise.race([Promise.all(suivies), new Promise((r) => setTimeout(r, plafond))])
  // deux images : la page est peinte avant le fondu, l'animation de sortie ne saccade pas
  requestAnimationFrame(() => requestAnimationFrame(() => window.__btmPret?.()))
}
