<script setup>
/**
 * Type de compte (fenêtre « Mon profil ») : particulier ou professionnel.
 * Un professionnel est vérifié par l'équipe BTM (SIRET) : en attente, vérifié ou refusé (avec motif).
 */
import { computed, ref, watch } from 'vue'
import { useAuth } from '@/composables/useAuth.js'
import { demanderVerificationPro, passerParticulier } from '@/services/supabase/serviceAuth.js'
import { nettoyerSiret, formaterSiret, siretValide, rechercherSiret } from '@/services/entreprises.js'

const { typeProfil, demandePro, rechargerRole } = useAuth()
const statut = computed(() => demandePro.value?.statut || null)

const formulaire = ref(false)
const siret = ref('')
const raison = ref('')
const erreur = ref('')
const message = ref('')
const envoi = ref(false)
const trouvee = ref(null)

function ouvrir() {
  siret.value = formaterSiret(demandePro.value?.siret || '')
  raison.value = demandePro.value?.raisonSociale || ''
  erreur.value = ''
  formulaire.value = true
}

// Aide à la saisie : nom de l'entreprise retrouvé dans le registre public
watch(siret, async (v) => {
  trouvee.value = null
  const s = nettoyerSiret(v)
  if (!siretValide(s)) return
  try {
    const e = await rechercherSiret(s)
    if (nettoyerSiret(siret.value) !== s) return
    trouvee.value = e
    if (e && !raison.value.trim()) raison.value = e.nom
  } catch { /* registre indisponible : l'équipe vérifiera */ }
})

async function envoyer() {
  erreur.value = ''
  if (!siretValide(siret.value)) { erreur.value = 'Ce numéro SIRET n’est pas valide (14 chiffres).'; return }
  if (!raison.value.trim()) { erreur.value = 'Indiquez le nom de l’entreprise.'; return }
  envoi.value = true
  try {
    await demanderVerificationPro(raison.value.trim(), nettoyerSiret(siret.value))
    await rechargerRole()
    formulaire.value = false
    message.value = 'Demande envoyée : notre équipe vérifie votre entreprise.'
  } catch (e) {
    erreur.value = e.message || 'Envoi impossible.'
  } finally {
    envoi.value = false
  }
}

async function abandonner() {
  envoi.value = true
  try {
    await passerParticulier()
    await rechargerRole()
    message.value = 'Votre compte est de nouveau un compte particulier.'
  } catch (e) {
    erreur.value = e.message || 'Action impossible.'
  } finally {
    envoi.value = false
  }
}
</script>

<template>
  <div class="tc">
    <h3>Type de compte</h3>

    <!-- État actuel -->
    <div v-if="statut === 'verifie'" class="tc-etat ok">
      <i class="fa-solid fa-circle-check" aria-hidden="true"></i>
      <div><strong>Professionnel vérifié</strong><small>{{ demandePro.raisonSociale }} · SIRET {{ formaterSiret(demandePro.siret) }}</small></div>
    </div>
    <div v-else-if="statut === 'en_attente'" class="tc-etat attente">
      <i class="fa-solid fa-hourglass-half" aria-hidden="true"></i>
      <div>
        <strong>Professionnel · SIRET en vérification</strong>
        <small>{{ demandePro.raisonSociale }} · SIRET {{ formaterSiret(demandePro.siret) }}. Les outils pro sont déjà ouverts ; notre équipe confirme votre entreprise.</small>
      </div>
    </div>
    <div v-else-if="statut === 'refuse'" class="tc-etat refus">
      <i class="fa-solid fa-circle-xmark" aria-hidden="true"></i>
      <div><strong>Demande refusée</strong><small>{{ demandePro.motif }}</small></div>
    </div>
    <div v-else class="tc-etat">
      <i class="fa-solid fa-house-user" aria-hidden="true"></i>
      <div><strong>Particulier</strong><small>Vous êtes une entreprise du BTP ? Demandez un compte professionnel.</small></div>
    </div>

    <p v-if="message" class="tc-message" role="status">{{ message }}</p>

    <!-- Actions -->
    <div v-if="!formulaire" class="tc-actions">
      <button v-if="!statut && typeProfil !== 'fournisseur'" type="button" class="btn btn-primaire" @click="ouvrir"><i class="fa-solid fa-helmet-safety" aria-hidden="true"></i> Devenir professionnel</button>
      <button v-if="statut === 'refuse' || statut === 'en_attente'" type="button" class="btn btn-secondaire" @click="ouvrir">{{ statut === 'refuse' ? 'Corriger et redemander' : 'Modifier ma demande' }}</button>
      <button v-if="statut && statut !== 'verifie'" type="button" class="btn btn-ghost" :disabled="envoi" @click="abandonner">Rester particulier</button>
    </div>

    <form v-else class="tc-form" novalidate @submit.prevent="envoyer">
      <div class="champ">
        <label for="tc-siret">Numéro SIRET</label>
        <input id="tc-siret" v-model="siret" inputmode="numeric" maxlength="17" autocomplete="off" placeholder="14 chiffres" class="mono" @blur="siret = formaterSiret(siret)" />
        <p v-if="trouvee" class="champ-aide tc-trouvee"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> {{ trouvee.nom }}<template v-if="trouvee.commune"> · {{ trouvee.commune }}</template></p>
      </div>
      <div class="champ">
        <label for="tc-raison">Raison sociale</label>
        <input id="tc-raison" v-model="raison" maxlength="120" autocomplete="organization" />
      </div>
      <p v-if="erreur" class="champ-erreur" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ erreur }}</p>
      <div class="tc-actions">
        <button type="button" class="btn btn-ghost" @click="formulaire = false">Annuler</button>
        <button type="submit" class="btn btn-primaire" :disabled="envoi"><span v-if="envoi" class="spinner" aria-hidden="true"></span> Envoyer la demande</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.tc { display: flex; flex-direction: column; gap: 16px; }
.tc h3 { margin: 0; color: var(--ardoise); font-size: 1.45rem; }
.tc-etat { display: flex; align-items: flex-start; gap: 12px; padding: 14px 16px; border-radius: var(--rayon); background: var(--gris-50); border: 1px solid var(--gris-200); }
.tc-etat > i { margin-top: 3px; font-size: 1.1rem; color: var(--gris-500); }
.tc-etat div { display: flex; flex-direction: column; gap: 2px; }
.tc-etat strong { color: var(--ardoise); }
.tc-etat small { color: var(--texte-secondaire); font-size: .86rem; line-height: 1.45; }
.tc-etat.ok { background: #ecfdf5; border-color: #a7f3d0; }
.tc-etat.ok > i { color: #047857; }
.tc-etat.attente { background: #fffbeb; border-color: #fde68a; }
.tc-etat.attente > i { color: #b45309; }
.tc-etat.refus { background: var(--erreur-clair); border-color: #fecdd3; }
.tc-etat.refus > i { color: var(--erreur); }
.tc-message { margin: 0; color: #047857; font-weight: 600; font-size: .9rem; }
.tc-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.tc-form { display: flex; flex-direction: column; gap: 14px; }
.tc-form .mono { font-family: var(--font-mono); letter-spacing: .04em; }
.tc-trouvee { color: #047857; font-weight: 600; }
</style>
