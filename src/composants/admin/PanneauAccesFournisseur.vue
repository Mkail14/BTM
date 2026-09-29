<script setup>
/**
 * Accès d'un fournisseur à son espace : invitation par e-mail, suivi (invité → actif), relance, retrait.
 * L'invitation part automatiquement par e-mail. Si le service d'envoi ne la délivre pas (Supabase sans
 * serveur SMTP configuré), l'admin la transmet lui-même : lien copié ou e-mail préparé — jamais affiché en clair.
 */
import { computed, ref } from 'vue'
import { useAdmin, initiales } from '@/composables/useAdmin.js'
import AdminPanneau from './AdminPanneau.vue'

const props = defineProps({
  fournisseur: { type: Object, required: true },
  acces: { type: Object, default: null } // { id, email, statut: 'invite'|'actif', invite_le, derniere_connexion }
})
const emit = defineEmits(['fermer', 'maj'])
const { api, confirmer, notifier } = useAdmin()

const compte = ref(props.acces)
const email = ref(props.fournisseur.email || '')
const erreur = ref('')
const enCours = ref('') // action en cours : 'inviter' | 'relancer' | 'copier' | 'retirer'
const retour = ref(null) // { type: 'envoye'|'manuel'|'relie', lien? } après une action

const actif = computed(() => compte.value?.statut === 'actif')
const dateHeure = (d) => (d ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(d)) : '')

async function executer(nom, action) {
  enCours.value = nom
  erreur.value = ''
  try { await action() } catch (e) { erreur.value = e?.message || 'L’opération a échoué.' } finally { enCours.value = '' }
}

function inviter() {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.value.trim())) { erreur.value = 'Adresse e-mail invalide.'; return }
  executer('inviter', async () => {
    const r = await api.inviterFournisseur(email.value.trim(), props.fournisseur.id)
    compte.value = r.acces
    retour.value = r.relie ? { type: 'relie' } : r.envoye ? { type: 'envoye' } : { type: 'manuel', lien: r.lien }
    emit('maj')
  })
}

function relancer() {
  executer('relancer', async () => {
    const r = await api.relancerFournisseur(compte.value.id)
    retour.value = r.envoye ? { type: 'envoye' } : { type: 'manuel', lien: r.lien }
    if (r.envoye) notifier(actif.value ? `Lien de nouveau mot de passe envoyé à ${compte.value.email}.` : `Invitation renvoyée à ${compte.value.email}.`)
  })
}

async function copier(lien) {
  await navigator.clipboard.writeText(lien)
  notifier('Lien d’invitation copié : collez-le dans votre message au fournisseur.', 'info')
}
function copierLien() {
  executer('copier', async () => {
    const lien = retour.value?.lien || await api.lienFournisseur(compte.value.id)
    if (retour.value?.type === 'manuel') retour.value.lien = lien
    await copier(lien).catch(() => { throw new Error('Copie impossible : autorisez l’accès au presse-papiers et réessayez.') })
  })
}

/** E-mail prêt à envoyer depuis la messagerie de l'admin (le lien n'apparaît que dans le message) */
const mailto = computed(() => {
  const lien = retour.value?.lien
  if (!lien || !compte.value) return ''
  const sujet = encodeURIComponent(`Votre espace fournisseur BTM — ${props.fournisseur.nom}`)
  const corps = encodeURIComponent([
    'Bonjour,', '',
    `${props.fournisseur.nom} dispose désormais d’un espace fournisseur sur BTM (Bâtiment & Travaux Mayotte).`,
    'Vous y retrouvez les devis des clients qui vous choisissent, vous validez leurs retraits au comptoir et vous suivez vos encaissements.', '',
    actif.value ? 'Pour choisir un nouveau mot de passe, ouvrez ce lien :' : 'Pour activer votre accès et choisir votre mot de passe, ouvrez ce lien (valable 24 heures) :',
    lien, '', 'Cordialement,', 'L’équipe BTM'
  ].join('\n'))
  return `mailto:${compte.value.email}?subject=${sujet}&body=${corps}`
})

async function retirer() {
  const ok = await confirmer({
    titre: 'Retirer l’accès fournisseur ?',
    texte: actif.value
      ? `${compte.value.email} ne pourra plus ouvrir l’espace de ${props.fournisseur.nom}. Son compte BTM est conservé comme compte particulier.`
      : `L’invitation envoyée à ${compte.value.email} sera annulée et le compte, jamais activé, supprimé.`,
    libelle: 'Retirer l’accès', danger: true
  })
  if (!ok) return
  executer('retirer', async () => {
    await api.retirerFournisseur(compte.value.id)
    notifier(`Accès de ${props.fournisseur.nom} retiré.`)
    emit('maj')
    emit('fermer')
  })
}
</script>

<template>
  <AdminPanneau :titre="`Accès fournisseur — ${fournisseur.nom}`" sous-titre="L’espace où le fournisseur valide les retraits au comptoir et suit ses encaissements." @fermer="emit('fermer')">
    <!-- ========== Pas encore d'accès : invitation ========== -->
    <form v-if="!compte" id="form-invitation" class="pa" novalidate @submit.prevent="inviter">
      <div class="adm-champ">
        <label for="pa-email">E-mail du responsable</label>
        <input id="pa-email" v-model="email" type="email" autocomplete="off" placeholder="contact@entreprise.yt" @input="erreur = ''" />
        <span class="adm-champ-aide"><span>Une adresse qui a déjà un compte BTM est simplement reliée à {{ fournisseur.nom }}.</span></span>
      </div>

      <ol class="pa-parcours" aria-label="Déroulement">
        <li><span><i class="fa-regular fa-envelope" aria-hidden="true"></i></span><div><strong>Invitation par e-mail</strong><small>Le responsable reçoit un e-mail de BTM.</small></div></li>
        <li><span><i class="fa-solid fa-key" aria-hidden="true"></i></span><div><strong>Activation</strong><small>Il choisit son mot de passe (lien valable 24 h).</small></div></li>
        <li><span><i class="fa-solid fa-store" aria-hidden="true"></i></span><div><strong>Espace fournisseur</strong><small>Il valide les retraits et suit ses encaissements.</small></div></li>
      </ol>
    </form>

    <!-- ========== Accès existant : suivi et gestion ========== -->
    <div v-else class="pa">
      <!-- Résultat de la dernière action -->
      <div v-if="retour?.type === 'envoye'" class="pa-bandeau pa-ok" role="status">
        <i class="fa-solid fa-paper-plane" aria-hidden="true"></i>
        <div><strong>{{ actif ? 'E-mail envoyé' : 'Invitation envoyée' }}</strong><p>{{ compte.email }} a reçu un e-mail pour {{ actif ? 'choisir un nouveau mot de passe' : 'activer son accès' }}. Le lien est valable 24 heures.</p></div>
      </div>
      <div v-else-if="retour?.type === 'relie'" class="pa-bandeau pa-ok" role="status">
        <i class="fa-solid fa-link" aria-hidden="true"></i>
        <div><strong>Compte existant relié</strong><p>{{ compte.email }} ouvre désormais l’espace de {{ fournisseur.nom }} avec ses identifiants habituels.</p></div>
      </div>
      <div v-else-if="retour?.type === 'manuel'" class="pa-bandeau pa-attention" role="status">
        <i class="fa-solid fa-envelope-circle-check" aria-hidden="true"></i>
        <div>
          <strong>Invitation prête — à transmettre</strong>
          <p>L’e-mail n’a pas pu partir automatiquement (le service d’envoi de Supabase ne délivre qu’aux adresses de l’équipe tant qu’aucun serveur SMTP n’est configuré). Envoyez-la depuis votre messagerie :</p>
          <div class="pa-bandeau-actions">
            <a :href="mailto" class="adm-btn adm-btn-noir adm-btn-sm"><i class="fa-regular fa-envelope" aria-hidden="true"></i> Préparer l’e-mail</a>
            <button type="button" class="adm-btn adm-btn-clair adm-btn-sm" :disabled="enCours === 'copier'" @click="copierLien"><i class="fa-regular fa-copy" aria-hidden="true"></i> Copier le lien</button>
          </div>
        </div>
      </div>

      <!-- Carte du compte -->
      <section class="pa-compte">
        <span class="adm-avatar rond pa-avatar">{{ initiales(compte.email) }}</span>
        <div class="pa-compte-texte">
          <strong>{{ compte.email }}</strong>
          <small>Responsable · {{ fournisseur.nom }}</small>
        </div>
        <span v-if="actif" class="adm-badge adm-badge-ok">Actif</span>
        <span v-else class="adm-badge adm-badge-attention">En attente d’activation</span>
      </section>

      <ol class="pa-suivi" aria-label="Suivi de l’accès">
        <li class="fait"><span></span><div><strong>Invitation envoyée</strong><small>{{ dateHeure(compte.invite_le) }}</small></div></li>
        <li :class="{ fait: actif }"><span></span><div><strong>{{ actif ? 'Accès activé' : 'Activation par le fournisseur' }}</strong><small>{{ actif ? `Dernière connexion le ${dateHeure(compte.derniere_connexion)}` : 'En attente : il doit ouvrir le lien reçu et choisir son mot de passe.' }}</small></div></li>
      </ol>

      <!-- Gestion -->
      <section class="pa-gestion" aria-label="Gérer l’accès">
        <button type="button" class="pa-action" :disabled="!!enCours" @click="relancer">
          <span class="pa-action-icone"><span v-if="enCours === 'relancer'" class="spinner" aria-hidden="true"></span><i v-else :class="actif ? 'fa-solid fa-key' : 'fa-solid fa-paper-plane'" aria-hidden="true"></i></span>
          <span><strong>{{ actif ? 'Réinitialiser le mot de passe' : 'Renvoyer l’invitation' }}</strong><small>{{ actif ? 'Envoie un e-mail pour choisir un nouveau mot de passe.' : 'Un nouvel e-mail avec un lien valable 24 h.' }}</small></span>
          <i class="fa-solid fa-chevron-right pa-chevron" aria-hidden="true"></i>
        </button>
        <button v-if="!actif && retour?.type !== 'manuel'" type="button" class="pa-action" :disabled="!!enCours" @click="copierLien">
          <span class="pa-action-icone"><span v-if="enCours === 'copier'" class="spinner" aria-hidden="true"></span><i v-else class="fa-regular fa-copy" aria-hidden="true"></i></span>
          <span><strong>Copier le lien d’invitation</strong><small>Pour le transmettre vous-même (SMS, WhatsApp, e-mail).</small></span>
          <i class="fa-solid fa-chevron-right pa-chevron" aria-hidden="true"></i>
        </button>
        <button type="button" class="pa-action pa-action-danger" :disabled="!!enCours" @click="retirer">
          <span class="pa-action-icone"><span v-if="enCours === 'retirer'" class="spinner" aria-hidden="true"></span><i v-else class="fa-solid fa-user-slash" aria-hidden="true"></i></span>
          <span><strong>Retirer l’accès</strong><small>{{ actif ? 'Le compte redevient un compte particulier.' : 'Annule l’invitation et supprime le compte non activé.' }}</small></span>
          <i class="fa-solid fa-chevron-right pa-chevron" aria-hidden="true"></i>
        </button>
      </section>
    </div>

    <p v-if="erreur" class="adm-erreur-texte" role="alert"><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i> {{ erreur }}</p>

    <template #pied>
      <template v-if="!compte">
        <button type="button" class="adm-btn adm-btn-clair" @click="emit('fermer')">Annuler</button>
        <button type="submit" form="form-invitation" class="adm-btn adm-btn-noir" :disabled="enCours === 'inviter'">
          <span v-if="enCours === 'inviter'" class="spinner" aria-hidden="true"></span><i v-else class="fa-solid fa-paper-plane" aria-hidden="true"></i> Envoyer l’invitation
        </button>
      </template>
      <button v-else type="button" class="adm-btn adm-btn-noir" @click="emit('fermer')">Terminé</button>
    </template>
  </AdminPanneau>
</template>

<style scoped>
.pa { display: flex; flex-direction: column; gap: 20px; }

/* Déroulement de l'invitation */
.pa-parcours { display: flex; flex-direction: column; margin: 0; padding: 0; list-style: none; }
.pa-parcours li { position: relative; display: flex; gap: 14px; padding-bottom: 18px; }
.pa-parcours li:last-child { padding-bottom: 0; }
.pa-parcours li:not(:last-child)::before { content: ''; position: absolute; left: 19px; top: 40px; bottom: 2px; width: 2px; background: var(--adm-ligne); }
.pa-parcours li > span { width: 40px; height: 40px; flex: none; display: grid; place-items: center; border-radius: 12px; background: var(--adm-ligne-2); color: var(--adm-encre); }
.pa-parcours div { display: flex; flex-direction: column; padding-top: 2px; }
.pa-parcours strong, .pa-suivi strong { font-size: .92rem; font-weight: 600; }
.pa-parcours small, .pa-suivi small { color: var(--adm-muet); font-size: .82rem; }

/* Bandeaux de résultat */
.pa-bandeau { display: flex; gap: 14px; padding: 16px; border-radius: 16px; }
.pa-bandeau > i { margin-top: 2px; font-size: 1.1rem; }
.pa-bandeau strong { font-size: .95rem; }
.pa-bandeau p { margin: 4px 0 0; font-size: .86rem; line-height: 1.5; }
.pa-ok { background: #ecfdf5; color: #065f46; }
.pa-attention { background: #fffbeb; color: #78350f; }
.pa-bandeau-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }

/* Compte */
.pa-compte { display: flex; align-items: center; gap: 14px; padding: 16px; border-radius: 16px; box-shadow: inset 0 0 0 1px var(--adm-ligne); }
.pa-avatar { width: 44px; height: 44px; background: var(--adm-noir); color: #fff; }
.pa-compte-texte { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.pa-compte-texte strong { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pa-compte-texte small { color: var(--adm-muet); font-size: .82rem; }

/* Suivi */
.pa-suivi { display: flex; flex-direction: column; margin: 0; padding: 0 4px; list-style: none; }
.pa-suivi li { position: relative; display: flex; gap: 14px; padding-bottom: 16px; }
.pa-suivi li:last-child { padding-bottom: 0; }
.pa-suivi li:not(:last-child)::before { content: ''; position: absolute; left: 6px; top: 18px; bottom: 0; width: 2px; background: var(--adm-ligne); }
.pa-suivi li > span { width: 14px; height: 14px; flex: none; margin-top: 4px; border-radius: 50%; border: 2px solid var(--adm-muet); background: #fff; }
.pa-suivi li.fait > span { border-color: #059669; background: #059669; box-shadow: 0 0 0 3px #d1fae5; }
.pa-suivi div { display: flex; flex-direction: column; }

/* Gestion */
.pa-gestion { display: flex; flex-direction: column; border-radius: 16px; box-shadow: inset 0 0 0 1px var(--adm-ligne); overflow: hidden; }
.pa-action {
  display: flex; align-items: center; gap: 14px; width: 100%; padding: 14px 16px; border: 0; border-top: 1px solid var(--adm-ligne-2);
  background: #fff; color: inherit; font: inherit; text-align: left; cursor: pointer; transition: background var(--transition);
}
.pa-action:first-child { border-top: 0; }
.pa-action:hover:not(:disabled) { background: #fafbfc; }
.pa-action:disabled { opacity: .55; cursor: wait; }
.pa-action > span:nth-child(2) { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.pa-action strong { font-size: .92rem; font-weight: 600; }
.pa-action small { color: var(--adm-muet); font-size: .8rem; }
.pa-action-icone { width: 36px; height: 36px; flex: none; display: grid; place-items: center; border-radius: 10px; background: var(--adm-ligne-2); color: var(--adm-encre); }
.pa-action-icone .spinner { width: 16px; height: 16px; border-width: 2px; }
.pa-chevron { color: var(--adm-muet); font-size: .75rem; }
.pa-action-danger strong { color: var(--adm-baisse); }
.pa-action-danger .pa-action-icone { background: #fff1f2; color: var(--adm-baisse); }
</style>
