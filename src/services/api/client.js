/**
 * Client de l'API REST BTM (BACK/src, Node.js + MariaDB).
 * La connexion est gérée par l'API : elle rend un jeton (JWT) que le navigateur garde
 * — localStorage avec « Rester connecté », sinon sessionStorage (oublié à la fermeture de l'onglet) —
 * et joint à chaque appel (Authorization: Bearer …). L'API le revérifie à chaque requête.
 * Si VITE_API_URL est absent, l'application fonctionne avec les données locales.
 */
import { oublierSessionSiSiteFerme, suivreOnglet } from '@/services/session.js'

const base = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')

// Site fermé depuis la visite précédente : la session restée sur l'appareil est oubliée avant d'être lue
if (typeof window !== 'undefined') { oublierSessionSiSiteFerme(); suivreOnglet() }

export const apiConfiguree = Boolean(base)

export class ErreurApi extends Error {
  constructor(statut, message, details) {
    super(message)
    this.statut = statut
    this.details = details
    this.code = details?.code || null // ex. EMAIL_NON_VERIFIE, COMPTE_SUSPENDU, MOT_DE_PASSE_A_CHANGER
  }
}

// ---------- Jeton de session ----------
export const CLE_JETON = 'btm-jeton'
const abonnesJeton = new Set()

export function lireJeton() {
  try { return localStorage.getItem(CLE_JETON) || sessionStorage.getItem(CLE_JETON) } catch { return null }
}

/** `durable` : « Rester connecté » (localStorage) ; sinon le jeton disparaît avec l'onglet */
export function enregistrerJeton(jeton, { durable = true } = {}) {
  try {
    localStorage.removeItem(CLE_JETON)
    sessionStorage.removeItem(CLE_JETON)
    ;(durable ? localStorage : sessionStorage).setItem(CLE_JETON, jeton)
  } catch { /* stockage indisponible : la session ne dure que le temps de la page */ }
  abonnesJeton.forEach((cb) => cb(jeton))
}

export function oublierJeton() {
  const avait = lireJeton()
  try { localStorage.removeItem(CLE_JETON); sessionStorage.removeItem(CLE_JETON) } catch { /* rien à effacer */ }
  if (avait) abonnesJeton.forEach((cb) => cb(null))
}

/** Prévenu quand la session s'ouvre ou se ferme (dans cet onglet, ou dans un autre onglet du site) */
export function surChangementJeton(callback) {
  abonnesJeton.add(callback)
  return () => abonnesJeton.delete(callback)
}
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => { if (e.key === CLE_JETON) abonnesJeton.forEach((cb) => cb(e.newValue)) })
}

/**
 * @param {'GET'|'POST'|'PUT'|'PATCH'|'DELETE'} methode
 * @param {string} chemin  ex. '/projets'
 * @param {object|FormData} [corps]  FormData : envoi de fichier (photo, pièce du dossier)
 */
export async function appelApi(methode, chemin, corps, { delai = 30000 } = {}) {
  if (!apiConfiguree) throw new ErreurApi(0, 'API non configurée (VITE_API_URL).')
  const jeton = lireJeton()
  const estFormulaire = typeof FormData !== 'undefined' && corps instanceof FormData
  let reponse
  try {
    reponse = await fetch(`${base}${chemin}`, {
      method: methode,
      headers: {
        Accept: 'application/json',
        ...(corps !== undefined && !estFormulaire ? { 'Content-Type': 'application/json' } : {}),
        ...(jeton ? { Authorization: `Bearer ${jeton}` } : {})
      },
      body: corps === undefined ? undefined : estFormulaire ? corps : JSON.stringify(corps),
      // jamais de chargement sans fin si le serveur ne répond pas
      signal: AbortSignal.timeout(delai)
    })
  } catch (e) {
    if (e?.name === 'TimeoutError') throw new ErreurApi(0, 'Le serveur BTM met trop de temps à répondre. Réessayez dans un instant.')
    throw new ErreurApi(0, 'Le serveur BTM ne répond pas. Vérifiez votre connexion à Internet et réessayez.')
  }
  if (reponse.status === 204) return null
  const donnees = await reponse.json().catch(() => null)
  if (!reponse.ok) {
    // jeton expiré, compte banni ou mot de passe changé ailleurs : la session de cet appareil est fermée
    if (reponse.status === 401 && jeton) oublierJeton()
    throw new ErreurApi(reponse.status, donnees?.erreur || `Erreur ${reponse.status}`, donnees?.details)
  }
  return donnees
}

export const api = {
  get: (chemin, options) => appelApi('GET', chemin, undefined, options),
  post: (chemin, corps, options) => appelApi('POST', chemin, corps, options),
  put: (chemin, corps, options) => appelApi('PUT', chemin, corps, options),
  patch: (chemin, corps, options) => appelApi('PATCH', chemin, corps, options),
  delete: (chemin, corps, options) => appelApi('DELETE', chemin, corps, options)
}

/** Fichier (Blob ou File) + champs texte -> FormData, pour api.post(chemin, formulaire(...)) */
export function formulaire(fichier, champs = {}, nomFichier = 'fichier') {
  const f = new FormData()
  if (fichier) f.append('fichier', fichier, fichier.name || `${nomFichier}.jpg`)
  for (const [cle, valeur] of Object.entries(champs)) {
    if (valeur !== undefined && valeur !== null && valeur !== '') f.append(cle, String(valeur))
  }
  return f
}
