/**
 * Prépare une photo avant envoi : redimensionnée (1600 px au plus) et recompressée en JPEG.
 * Une photo de téléphone de 4 à 10 Mo passe à quelques centaines de Ko : envoi rapide, page d'accueil légère.
 */
export async function compresserImage(fichier, { max = 1600, qualite = 0.82 } = {}) {
  if (!fichier?.type?.startsWith('image/')) throw new Error('Choisissez une image (JPEG, PNG ou WebP).')
  let image
  try {
    image = await createImageBitmap(fichier, { imageOrientation: 'from-image' })
  } catch {
    throw new Error('Ce format d’image n’est pas pris en charge : utilisez une photo JPEG, PNG ou WebP.')
  }
  const echelle = Math.min(1, max / Math.max(image.width, image.height))
  const toile = document.createElement('canvas')
  toile.width = Math.round(image.width * echelle)
  toile.height = Math.round(image.height * echelle)
  toile.getContext('2d').drawImage(image, 0, 0, toile.width, toile.height)
  image.close?.()
  const blob = await new Promise((r) => toile.toBlob(r, 'image/jpeg', qualite))
  if (!blob) throw new Error('Impossible de préparer la photo.')
  return blob
}
