/** Les 17 communes de Mayotte (fiche fournisseur, inscription des fournisseurs) */
export const COMMUNES = ['Acoua', 'Bandraboua', 'Bandrélé', 'Bouéni', 'Chiconi', 'Chirongui', 'Dembéni', 'Dzaoudzi', 'Kani-Kéli', 'Koungou', 'Mamoudzou', 'Mtsamboro', 'M’Tsangamouji', 'Ouangani', 'Pamandzi', 'Sada', 'Tsingoni']

// comparaison sans accents, apostrophes, tirets ni majuscules : « mtsangamouji », « M'TSANGAMOUJI », « kani keli »
const cle = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '')
const PAR_CLE = new Map(COMMUNES.map((c) => [cle(c), c]))

/** La commune de Mayotte écrite comme il faut (« Mamoudzou »), ou null si ce n'en est pas une */
export const communeMayotte = (t) => PAR_CLE.get(cle(t)) || null
