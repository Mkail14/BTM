/**
 * Suspension d'un compte (bannissement, migration 0022) : fin et motif transmis à la page « Compte suspendu ».
 * Le compte y arrive déconnecté ; ces informations sont donc lues juste avant (session encore ouverte, ou
 * fonction SQL suspension_compte après une connexion refusée) et gardées le temps de l'onglet.
 * Le motif ne passe jamais par l'adresse de la page.
 */
const CLE = 'btm-suspension'

/** `suspension` : { jusqua: date ISO | 'vie', motif } — ou null pour oublier une suspension précédente */
export function memoriserSuspension(suspension) {
  try {
    if (suspension) sessionStorage.setItem(CLE, JSON.stringify(suspension))
    else sessionStorage.removeItem(CLE)
  } catch { /* stockage indisponible : la page s'affiche sans date ni motif */ }
}

export function suspensionMemorisee() {
  try { return JSON.parse(sessionStorage.getItem(CLE)) || null } catch { return null }
}
