/**
 * Portes et fenêtres d'un mur (calculateur, question « ouvertures »).
 * Chaque menuiserie est placée en touchant le mur dans la maquette 3D : `position` va de 0 (début du mur) à 1 (fin).
 * Le calcul garde un seul nombre, `ouvertures` (m²) : la somme des menuiseries + une surface « autre » saisie à la main.
 */
export const MENUISERIES = {
  porte: { libelle: 'Porte', icone: 'fa-solid fa-door-closed', largeur: 0.9, hauteur: 2.15, allege: 0 },
  fenetre: { libelle: 'Fenêtre', icone: 'fa-solid fa-border-all', largeur: 1.2, hauteur: 1, allege: 1 }
}

const nombre = (v) => {
  const n = parseFloat(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** Surface des portes et fenêtres placées (m²) */
export const surfaceMenuiseries = (liste = []) => liste.reduce((s, m) => s + nombre(m.largeur) * nombre(m.hauteur), 0)

/** Surface « autre » : le reste des ouvertures déclarées, qui n'est ni une porte ni une fenêtre placée */
export const surfaceAutre = (mur = {}) => Math.max(0, Math.round((nombre(mur.ouvertures) - surfaceMenuiseries(mur.menuiseries)) * 100) / 100)

/** « 1 porte, 2 fenêtres » (vide s'il n'y en a pas) */
export function decrireMenuiseries(liste = []) {
  const portes = liste.filter((m) => m.type === 'porte').length
  const fenetres = liste.filter((m) => m.type === 'fenetre').length
  return [portes && `${portes} porte${portes > 1 ? 's' : ''}`, fenetres && `${fenetres} fenêtre${fenetres > 1 ? 's' : ''}`].filter(Boolean).join(', ')
}
