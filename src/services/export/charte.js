/**
 * Charte des PDF (devis, reçu, contrat) : noir et crème du logo, comme le site (style.css).
 */
export const NOIR = [17, 17, 17]
export const CREME = [244, 233, 219]
export const CREME_CLAIR = [247, 243, 238]
export const GRIS = [87, 83, 78]
export const ENCRE = [38, 38, 38]

const cache = {}

/** Logo du site en data URL pour jsPDF (null si le fichier ne charge pas : le PDF garde alors le texte « BTM ») */
export async function chargerLogo(chemin = '/logo-groupe-btm.png') {
  if (!(chemin in cache)) {
    cache[chemin] = fetch(chemin)
      .then((r) => (r.ok ? r.blob() : null))
      .then((blob) => blob && new Promise((ok) => {
        const lecteur = new FileReader()
        lecteur.onload = () => ok(lecteur.result)
        lecteur.onerror = () => ok(null)
        lecteur.readAsDataURL(blob)
      }))
      .catch(() => null)
  }
  return cache[chemin]
}

/** « Groupe BTM » crème (343 × 160) posé sur le bandeau noir, hauteur h en mm */
export function dessinerLogo(doc, logo, x, y, h) {
  if (!logo) return false
  doc.addImage(logo, 'PNG', x, y, h * 343 / 160, h, undefined, 'FAST') // FAST : PNG recompressé (sinon ~1 Mo par logo)
  return true
}
