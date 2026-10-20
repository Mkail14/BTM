/**
 * Bouton « Continuer avec Google » (Google Identity Services) : la fenêtre Google s'ouvre depuis le site
 * et affiche « btm.yt » (et non l'adresse technique de Supabase, comme avec la redirection OAuth).
 * Google rend un jeton d'identité, échangé contre une session par supabase.auth.signInWithIdToken.
 * L'identifiant client n'est pas secret (il figure dans toute page qui affiche un bouton Google).
 * Dans Google Cloud, l'adresse du site doit figurer dans « Origines JavaScript autorisées ».
 */
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '557607296482-8jkgd9squ5e2jdg1mufnl4p5fmn7m4sv.apps.googleusercontent.com'

let script = null
function chargerScript() {
  script ||= new Promise((resoudre, rejeter) => {
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.onload = resoudre
    s.onerror = () => { script = null; rejeter(new Error('Google ne répond pas.')) }
    document.head.appendChild(s)
  })
  return script
}

async function sha256(texte) {
  const octets = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texte))
  return [...new Uint8Array(octets)].map((o) => o.toString(16).padStart(2, '0')).join('')
}

/**
 * Affiche le bouton Google dans `element`. `surJeton(jeton, nonce)` reçoit le jeton d'identité et le nonce
 * en clair (Google en a reçu l'empreinte : Supabase vérifie que les deux correspondent).
 * `texte` : 'continue_with' | 'signup_with' | 'signin_with' ; `pilule` : bouton noir arrondi (accueil de la connexion sur téléphone).
 */
export async function afficherBoutonGoogle(element, { texte = 'continue_with', pilule = false, surJeton }) {
  await chargerScript()
  if (!element.isConnected) return
  const nonce = crypto.randomUUID()
  window.google.accounts.id.initialize({
    client_id: CLIENT_ID,
    nonce: await sha256(nonce),
    callback: (r) => surJeton(r.credential, nonce),
    ux_mode: 'popup',
    use_fedcm_for_button: true
  })
  element.replaceChildren()
  window.google.accounts.id.renderButton(element, {
    type: 'standard', theme: pilule ? 'filled_black' : 'outline', size: 'large', shape: pilule ? 'pill' : 'rectangular', text: texte, logo_alignment: 'center',
    width: Math.max(200, Math.min(400, Math.round(element.getBoundingClientRect().width))), locale: 'fr'
  })
}
