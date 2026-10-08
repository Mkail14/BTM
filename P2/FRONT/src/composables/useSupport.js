/**
 * useSupport — demandes d'assistance qui attendent le conseiller (admin) : pastilles du menu et du haut de page,
 * relues toutes les 30 secondes tant que l'espace admin est ouvert. Si l'admin l'a autorisé, une notification
 * du navigateur s'affiche à chaque nouvelle demande (en plus de l'e-mail reçu sur contact@btm.yt).
 */
import { ref } from 'vue'
import { compterDemandes } from '@/services/supabase/serviceSupport.js'

const enAttente = ref(0)
const notificationsNavigateur = ref(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported')
let minuterie = null

async function rafraichirDemandes() {
  try {
    const nb = await compterDemandes()
    if (nb > enAttente.value && notificationsNavigateur.value === 'granted' && document.hidden) {
      new Notification('Nouvelle demande d’assistance', { body: 'Un client attend un conseiller BTM.', icon: '/favicon.svg', tag: 'btm-support' })
    }
    enAttente.value = nb
  } catch { /* nouvel essai au prochain tour */ }
}

export function useSupport() {
  function suivre() {
    rafraichirDemandes()
    clearInterval(minuterie)
    minuterie = setInterval(rafraichirDemandes, 30000)
  }
  const arreter = () => { clearInterval(minuterie); minuterie = null }
  async function activerNotifications() {
    if (typeof Notification === 'undefined') return
    notificationsNavigateur.value = await Notification.requestPermission()
  }
  return { enAttente, notificationsNavigateur, rafraichirDemandes, suivre, arreter, activerNotifications }
}
