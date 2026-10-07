<script setup>
/**
 * Compte & reversements (clic sur le profil admin) :
 *  - Reversements : les fournisseurs encaissent tout et reversent à BTM ses frais de service.
 *    Un virement déclaré par le fournisseur est pris en compte tout de suite : l'admin en garde l'historique.
 *    BTM ne déclenche aucun virement ; la rémunération interne est gérée hors du site (RH).
 *  - RIB de BTM : communiqué aux fournisseurs pour leurs reversements (IBAN contrôlé par sa clé).
 *  - Administrateurs : désigner un administrateur par l'e-mail de son compte, ou lui retirer ses droits.
 *    Le changement de rôle passe par la fonction serveur admin-utilisateurs, qui revérifie le rôle de l'appelant.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useAdmin, formatDate, initiales } from '@/composables/useAdmin.js'
import { useAuth } from '@/composables/useAuth.js'
import { formaterEuros } from '@/services/calculs/moteurCalculs.js'
import { ibanValide, bicValide, normaliserIban, formaterIban, masquerIban } from '@/services/versements.js'
import AdminPanneau from './AdminPanneau.vue'

const emit = defineEmits(['fermer'])
const { api, donnees, erreurs, charger, confirmer, executer, notifier } = useAdmin()
const { utilisateur } = useAuth()
const onglet = ref('reversements')
onMounted(() => charger(['versement', 'reversements', 'paiements', 'fournisseurs', 'profils'], { force: true }))

// ---------- Reversements ----------
const somme = (liste) => Math.round(liste.reduce((s, x) => s + (Number(x) || 0), 0) * 100) / 100
const reversements = computed(() => donnees.reversements || [])
const recus = computed(() => reversements.value.filter((r) => r.statut === 'valide'))
/** Par fournisseur : frais BTM encaissés, reçus, reste dû */
const parFournisseur = computed(() => {
  const noms = Object.fromEntries((donnees.fournisseurs || []).map((f) => [f.id, f.nom]))
  const lignes = {}
  const ligne = (id) => (lignes[id] ||= { id, nom: noms[id] || 'Fournisseur supprimé', du: 0, recu: 0 })
  for (const p of donnees.paiements || []) if (p.fournisseur_id && p.revenu_btm) ligne(p.fournisseur_id).du += Number(p.revenu_btm)
  for (const r of recus.value) ligne(r.fournisseur_id).recu += r.montant
  return Object.values(lignes).map((l) => ({ ...l, du: somme([l.du]), recu: somme([l.recu]), reste: Math.max(0, somme([l.du, -l.recu])) })).sort((a, b) => b.reste - a.reste)
})
const totaux = computed(() => ({
  du: somme(parFournisseur.value.map((l) => l.du)),
  recu: somme(parFournisseur.value.map((l) => l.recu)),
  reste: somme(parFournisseur.value.map((l) => l.reste))
}))


// ---------- RIB ----------
const defaut = () => ({ titulaire: '', iban: '', bic: '', banque: '', frequence: 'mensuelle', jour: 5, seuil_minimum: 0 })
const parametres = computed(() => donnees.versement || null)
const ribRenseigne = computed(() => !!parametres.value?.iban)
const brouillon = ref(defaut())
const modeRib = ref(false) // false = RIB affiché masqué, true = saisie
function preparer() {
  const p = parametres.value
  brouillon.value = p ? { ...defaut(), ...p, iban: formaterIban(p.iban || '') } : defaut()
  modeRib.value = !p?.iban
}
watch(parametres, preparer, { immediate: true })

const ibanSaisi = computed(() => normaliserIban(brouillon.value.iban))
const erreurIban = computed(() => (ibanSaisi.value && !ibanValide(ibanSaisi.value) ? 'IBAN invalide : vérifiez les caractères (la clé de contrôle ne correspond pas).' : ''))
const erreurBic = computed(() => (brouillon.value.bic && !bicValide(brouillon.value.bic) ? 'BIC invalide (8 ou 11 caractères, ex. BFCOYTYT).' : ''))
const enregistrement = ref(false)

async function enregistrerRib() {
  const b = brouillon.value
  if (!b.titulaire.trim()) { notifier('Indiquez le titulaire du compte.', 'erreur'); return }
  if (!ibanSaisi.value || erreurIban.value) { notifier(erreurIban.value || 'Indiquez l’IBAN.', 'erreur'); return }
  if (erreurBic.value) { notifier(erreurBic.value, 'erreur'); return }
  enregistrement.value = true
  const ok = await executer(async () => {
    donnees.versement = await api.enregistrerParametresVersement({ ...b, iban: ibanSaisi.value }, utilisateur.value?.id)
  }, 'RIB enregistré : il est affiché aux fournisseurs pour leurs reversements.')
  enregistrement.value = false
  if (ok) modeRib.value = false
}

async function supprimerRib() {
  if (!(await confirmer({ titre: 'Supprimer le RIB ?', texte: 'Les fournisseurs ne pourront plus vous reverser vos frais tant qu’un nouveau RIB n’est pas enregistré.', libelle: 'Supprimer', danger: true }))) return
  enregistrement.value = true
  await executer(async () => {
    donnees.versement = await api.enregistrerParametresVersement({ ...brouillon.value, titulaire: '', iban: null, bic: null, banque: '' }, utilisateur.value?.id)
  }, 'RIB supprimé.')
  enregistrement.value = false
}

// ---------- Administrateurs ----------
const ROLES = { admin: 'Administrateur', fournisseur: 'Fournisseur', user: 'Utilisateur' }
const nomDe = (p) => p.nom_affiche || p.email
const moi = computed(() => utilisateur.value?.id)
// soi-même d'abord, puis par nom
const admins = computed(() => (donnees.profils || []).filter((p) => p.role === 'admin')
  .sort((a, b) => (b.id === moi.value) - (a.id === moi.value) || nomDe(a).localeCompare(nomDe(b), 'fr')))

const emailSaisi = ref('')
const email = computed(() => emailSaisi.value.trim().toLowerCase())
const emailComplet = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.value))
const candidat = computed(() => (emailComplet.value ? (donnees.profils || []).find((p) => (p.email || '').toLowerCase() === email.value) || null : null))
// '' (rien à dire) | 'inconnu' | 'deja' | 'banni' | 'ok'
const etatCandidat = computed(() => {
  if (!emailComplet.value || !donnees.profils) return ''
  const c = candidat.value
  if (!c) return 'inconnu'
  if (c.role === 'admin') return 'deja'
  return api.banActif(c) ? 'banni' : 'ok'
})

const roleEnCours = ref('') // id du compte dont le rôle est en train de changer
/** Même enchaînement que la fiche d'un utilisateur : lecture du compte, puis enregistrement avec le nouveau rôle */
async function changerRole(profil, role, succes) {
  roleEnCours.value = profil.id
  const ok = await executer(async () => {
    const { id: _id, derniereConnexion: _d, fournisseur_id: _f, ...champs } = await api.lireUtilisateur(profil.id)
    await api.modifierUtilisateur(profil.id, { ...champs, role })
    if (profil.fournisseur_id) await api.lierCompteFournisseur(profil.id, null) // un administrateur ne représente plus une entreprise
    await charger(['profils'], { force: true })
  }, succes)
  roleEnCours.value = ''
  return ok
}

async function designer() {
  const c = candidat.value
  if (etatCandidat.value !== 'ok' || roleEnCours.value) return
  const texte = `${c.email} pourra modifier tout le site, les prix et les comptes, et désigner d’autres administrateurs.`
    + (c.role === 'fournisseur' ? ' Ce compte perdra son accès à l’espace fournisseur.' : '')
  if (!(await confirmer({ titre: 'Désigner cet administrateur ?', texte, libelle: 'Désigner administrateur' }))) return
  if (await changerRole(c, 'admin', `${nomDe(c)} est maintenant administrateur : l’accès s’ouvre à sa prochaine connexion.`)) emailSaisi.value = ''
}

async function retirer(p) {
  if (p.id === moi.value || roleEnCours.value) return
  if (!(await confirmer({
    titre: 'Retirer les droits administrateur ?', libelle: 'Retirer les droits', danger: true,
    texte: `${p.email} redeviendra un simple utilisateur et n’aura plus accès à l’administration. Son compte et ses projets sont conservés.`
  }))) return
  await changerRole(p, 'user', `${nomDe(p)} n’est plus administrateur.`)
}
</script>

<template>
  <AdminPanneau titre="Compte BTM" sous-titre="Reversements des fournisseurs, RIB et administrateurs." large @fermer="emit('fermer')">
    <div class="compte">
      <div class="adm-segments compte-onglets" role="tablist" aria-label="Compte et reversements">
        <button type="button" role="tab" :aria-selected="onglet === 'reversements'" @click="onglet = 'reversements'">
          <i class="fa-solid fa-money-bill-transfer" aria-hidden="true"></i> Reversements
        </button>
        <button type="button" role="tab" :aria-selected="onglet === 'rib'" @click="onglet = 'rib'"><i class="fa-solid fa-building-columns" aria-hidden="true"></i> RIB de BTM</button>
        <button type="button" role="tab" :aria-selected="onglet === 'admins'" @click="onglet = 'admins'"><i class="fa-solid fa-user-shield" aria-hidden="true"></i> Administrateurs</button>
      </div>

      <p v-if="onglet === 'admins' ? erreurs.profils : erreurs.versement || erreurs.reversements || erreurs.paiements" class="adm-alerte" role="alert">
        <i class="fa-solid fa-circle-exclamation"></i> {{ onglet === 'admins' ? erreurs.profils : erreurs.versement || erreurs.reversements || erreurs.paiements }}
      </p>

      <!-- ===================== Reversements ===================== -->
      <template v-if="onglet === 'reversements'">
        <div class="solde">
          <span class="solde-label">Reste à recevoir des fournisseurs</span>
          <strong class="solde-montant">{{ formaterEuros(totaux.reste) }}</strong>
          <span class="solde-detail">
            <template v-if="!ribRenseigne"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> Ajoutez le RIB de BTM : les fournisseurs en ont besoin pour vous reverser vos frais.</template>
            <template v-else>Versé par les fournisseurs sur {{ masquerIban(parametres.iban) }}</template>
          </span>
        </div>

        <dl class="chiffres">
          <div><dt>Frais BTM encaissés</dt><dd>{{ formaterEuros(totaux.du) }}</dd></div>
          <div><dt>Déjà reversés</dt><dd>{{ formaterEuros(totaux.recu) }}</dd></div>
          <div><dt>Reversements</dt><dd>{{ recus.length }}</dd></div>
        </dl>


        <template v-if="parFournisseur.length">
          <h3 class="compte-titre">Par fournisseur</h3>
          <table class="adm-table compte-table">
            <thead><tr><th>Fournisseur</th><th class="num">Dû</th><th class="num">Reçu</th><th class="num">Reste</th></tr></thead>
            <tbody>
              <tr v-for="l in parFournisseur" :key="l.id">
                <td>{{ l.nom }}</td>
                <td class="num">{{ formaterEuros(l.du) }}</td>
                <td class="num">{{ formaterEuros(l.recu) }}</td>
                <td class="num"><strong :class="{ reste: l.reste > 0 }">{{ formaterEuros(l.reste) }}</strong></td>
              </tr>
            </tbody>
          </table>
        </template>

        <h3 class="compte-titre">Reversements reçus</h3>
        <div v-if="!donnees.reversements" class="adm-chargement"><span class="spinner spinner-grand"></span></div>
        <ul v-else-if="recus.length" class="historique">
          <li v-for="r in recus" :key="r.id">
            <span class="historique-icone"><i class="fa-solid fa-check" aria-hidden="true"></i></span>
            <span class="historique-texte">
              <strong>{{ formaterEuros(r.montant) }} · {{ r.fournisseur_nom }}</strong>
              <small>{{ formatDate(r.declare_le) }} · réf. <span class="adm-mono">{{ r.reference }}</span></small>
            </span>
          </li>
        </ul>
        <p v-else class="compte-vide"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> Aucun reversement pour le moment.</p>
        <p class="compte-note"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> BTM ne déclenche aucun virement : les fournisseurs vous reversent vos frais sur ce RIB et les enregistrent dans leur espace.</p>
      </template>

      <!-- ===================== Administrateurs ===================== -->
      <template v-else-if="onglet === 'admins'">
        <form class="admins-ajout" novalidate @submit.prevent="designer">
          <div class="adm-champ">
            <label for="a-email">Désigner un administrateur</label>
            <div class="admins-saisie">
              <input id="a-email" v-model="emailSaisi" type="email" inputmode="email" autocomplete="off" spellcheck="false" placeholder="E-mail de son compte BTM" />
              <button type="submit" class="adm-btn adm-btn-noir" :disabled="etatCandidat !== 'ok' || !!roleEnCours">
                <span v-if="candidat && roleEnCours === candidat.id" class="spinner" aria-hidden="true"></span><i v-else class="fa-solid fa-user-shield" aria-hidden="true"></i> Désigner
              </button>
            </div>
          </div>
          <div aria-live="polite">
            <p v-if="etatCandidat === 'ok'" class="admins-trouve">
              <span class="adm-identite">
                <span class="adm-avatar rond">{{ initiales(nomDe(candidat)) }}</span>
                <span><strong>{{ nomDe(candidat) }}</strong><small>{{ candidat.email }}</small></span>
              </span>
              <span class="adm-badge">{{ ROLES[candidat.role] || candidat.role }}</span>
            </p>
            <p v-else-if="etatCandidat === 'inconnu'" class="admins-etat"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> Aucun compte BTM avec cette adresse. La personne doit d’abord créer son compte sur le site ; vous pourrez ensuite la désigner ici.</p>
            <p v-else-if="etatCandidat === 'deja'" class="admins-etat"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> Ce compte est déjà administrateur.</p>
            <p v-else-if="etatCandidat === 'banni'" class="admins-etat attention"><i class="fa-solid fa-ban" aria-hidden="true"></i> Ce compte est banni : levez le bannissement (page Utilisateurs) avant de le désigner.</p>
            <p v-else class="compte-note"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i> Un administrateur peut tout modifier : textes, prix, comptes et reversements. Ne désignez qu’une personne de confiance.</p>
          </div>
        </form>

        <h3 class="compte-titre">Administrateurs actuels<template v-if="donnees.profils"> · {{ admins.length }}</template></h3>
        <div v-if="!donnees.profils && !erreurs.profils" class="adm-chargement"><span class="spinner spinner-grand"></span></div>
        <ul v-else class="admins-liste">
          <li v-for="p in admins" :key="p.id">
            <span class="adm-identite">
              <span class="adm-avatar rond">{{ initiales(nomDe(p)) }}</span>
              <span><strong>{{ nomDe(p) }}</strong><small>{{ p.email }}</small></span>
            </span>
            <span v-if="p.id === moi" class="adm-badge adm-badge-info sans-point">Vous</span>
            <button v-else type="button" class="adm-btn adm-btn-clair adm-btn-sm" :disabled="!!roleEnCours" @click="retirer(p)">
              <span v-if="roleEnCours === p.id" class="spinner" aria-hidden="true"></span> Retirer
            </button>
          </li>
        </ul>
      </template>

      <!-- ===================== RIB ===================== -->
      <template v-else>
        <div v-if="ribRenseigne && !modeRib" class="rib-carte">
          <span class="rib-banque"><i class="fa-solid fa-building-columns" aria-hidden="true"></i> {{ parametres.banque || 'Compte de BTM' }}</span>
          <strong class="rib-iban adm-mono">{{ masquerIban(parametres.iban) }}</strong>
          <span class="rib-ligne"><span>{{ parametres.titulaire }}</span><span class="adm-mono">{{ parametres.bic }}</span></span>
          <small>Modifié le {{ formatDate(parametres.mis_a_jour_le) }}</small>
          <div class="rib-actions">
            <button type="button" class="adm-btn adm-btn-blanc adm-btn-sm" @click="modeRib = true"><i class="fa-solid fa-pen" aria-hidden="true"></i> Modifier le RIB</button>
            <button type="button" class="adm-btn adm-btn-contour adm-btn-sm" :disabled="enregistrement" @click="supprimerRib">Supprimer</button>
          </div>
        </div>

        <form v-else class="adm-grille-form" novalidate @submit.prevent="enregistrerRib">
          <p class="plein compte-intro">Compte professionnel de BTM, sur lequel les fournisseurs reversent vos frais de service.</p>
          <div class="adm-champ plein"><label for="r-titulaire">Titulaire du compte</label><input id="r-titulaire" v-model="brouillon.titulaire" maxlength="120" placeholder="BTM SAS" autocomplete="off" /></div>
          <div class="adm-champ plein">
            <label for="r-iban">IBAN</label>
            <input id="r-iban" v-model="brouillon.iban" class="adm-mono" autocomplete="off" spellcheck="false" placeholder="FR76 …" :aria-invalid="!!erreurIban || undefined" @blur="brouillon.iban = formaterIban(brouillon.iban)" />
            <span class="adm-champ-aide"><span :class="{ trop: erreurIban }">{{ erreurIban || (ibanSaisi && ibanValide(ibanSaisi) ? '✓ Clé de contrôle correcte' : 'Vérifié automatiquement (clé de contrôle).') }}</span></span>
          </div>
          <div class="adm-champ">
            <label for="r-bic">BIC</label>
            <input id="r-bic" v-model="brouillon.bic" class="adm-mono" maxlength="11" autocomplete="off" spellcheck="false" :aria-invalid="!!erreurBic || undefined" @input="brouillon.bic = brouillon.bic.toUpperCase()" />
            <span v-if="erreurBic" class="adm-champ-aide"><span class="trop">{{ erreurBic }}</span></span>
          </div>
          <div class="adm-champ"><label for="r-banque">Banque</label><input id="r-banque" v-model="brouillon.banque" maxlength="80" placeholder="Ex. : BFC Océan Indien" /></div>
          <div class="plein form-actions">
            <button v-if="ribRenseigne" type="button" class="adm-btn adm-btn-clair" @click="preparer">Annuler</button>
            <button type="submit" class="adm-btn adm-btn-noir" :disabled="enregistrement || !!erreurIban || !!erreurBic"><i class="fa-solid fa-lock" aria-hidden="true"></i> Enregistrer le RIB</button>
          </div>
          <p class="plein compte-note"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i> Affiché en entier uniquement aux comptes fournisseur, dans leur espace, pour effectuer leurs virements.</p>
        </form>
      </template>
    </div>
  </AdminPanneau>
</template>

<style scoped>
.compte { display: flex; flex-direction: column; gap: 18px; }
.compte-onglets { align-self: flex-start; max-width: 100%; overflow-x: auto; scrollbar-width: none; box-shadow: inset 0 0 0 1px var(--adm-ligne); }
.compte-onglets button { flex: none; white-space: nowrap; }
.compte-titre { margin: 6px 0 0; font-family: var(--font-corps); font-size: .95rem; font-weight: 600; letter-spacing: 0; }
.compte-intro { margin: 0; color: var(--adm-encre-2); font-size: .9rem; }
.compte-note { display: flex; gap: 8px; margin: 0; color: var(--adm-muet); font-size: .8rem; line-height: 1.5; }
.compte-note i { margin-top: 3px; }
.compte-vide { display: flex; align-items: center; gap: 8px; margin: 0; color: var(--adm-muet); font-size: .88rem; }
.compte-vide i { color: var(--adm-muet); }
.form-actions { display: flex; justify-content: flex-end; gap: 8px; }

.solde { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; padding: 22px; border-radius: 20px; background: var(--adm-noir); color: #fff; }
.solde-label { font-size: .78rem; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: var(--lagon-300); }
.solde-montant { font-size: 2.2rem; font-weight: 600; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
.solde-detail { color: rgba(255, 255, 255, .72); font-size: .88rem; }
.solde-detail i { color: #fcd34d; margin-right: 4px; }
.adm-btn-blanc { background: #fff; color: var(--adm-noir); }
.adm-btn-blanc:hover:not(:disabled) { background: #e2e8f0; }
.adm-btn-contour { background: transparent; color: #fff; border-color: rgba(255, 255, 255, .3); }
.adm-btn-contour:hover:not(:disabled) { border-color: #fff; }

.chiffres { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin: 0; }
.chiffres div { padding: 14px 16px; border-radius: 14px; background: var(--adm-ligne-2); }
.chiffres dt { font-size: .78rem; color: var(--adm-muet); }
.chiffres dd { margin: 4px 0 0; font-size: 1.1rem; font-weight: 600; font-variant-numeric: tabular-nums; }

.historique { display: flex; flex-direction: column; margin: 0; padding: 0; list-style: none; }
.historique li { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--adm-ligne-2); }
.historique li:last-child { border-bottom: 0; }
.historique-icone { width: 36px; height: 36px; flex: none; display: grid; place-items: center; border-radius: 12px; background: var(--adm-ok-fond); color: var(--adm-ok-texte); }
.historique-texte { flex: 1 1 200px; display: flex; flex-direction: column; min-width: 0; }
.historique-texte small { color: var(--adm-muet); font-size: .8rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.compte-table td, .compte-table th { padding: 10px 12px; }
.compte-table strong.reste { color: var(--adm-attention-texte); }

.rib-carte {
  display: flex; flex-direction: column; gap: 8px; padding: 22px; border-radius: 20px; color: #fff;
  background: linear-gradient(135deg, #0f172a 0%, #164e63 100%); box-shadow: 0 18px 40px rgba(15, 23, 42, .25);
}
.rib-banque { font-size: .85rem; color: rgba(255, 255, 255, .75); }
.rib-banque i { margin-right: 6px; }
.rib-iban { margin: 10px 0 4px; font-size: 1.25rem; letter-spacing: .08em; }
.rib-ligne { display: flex; justify-content: space-between; gap: 12px; font-size: .9rem; }
.rib-carte small { color: rgba(255, 255, 255, .55); font-size: .78rem; }
.rib-actions { display: flex; gap: 8px; margin-top: 12px; }

.admins-ajout { display: flex; flex-direction: column; gap: 12px; padding: 18px; border-radius: 18px; background: var(--adm-ligne-2); }
.admins-saisie { display: flex; flex-wrap: wrap; gap: 8px; }
.admins-saisie input { flex: 1 1 220px; width: auto; }
.admins-trouve { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 0; padding: 10px 14px; border-radius: 14px; background: var(--adm-carte); box-shadow: inset 0 0 0 1px var(--adm-ligne); }
.admins-trouve .adm-identite, .admins-liste .adm-identite { flex: 1; }
.admins-etat { display: flex; gap: 8px; margin: 0; color: var(--adm-encre-2); font-size: .86rem; line-height: 1.5; }
.admins-etat i { margin-top: 4px; color: var(--adm-muet); }
.admins-etat.attention, .admins-etat.attention i { color: var(--adm-attention-texte); }
.admins-liste { display: flex; flex-direction: column; margin: 0; padding: 0; list-style: none; }
.admins-liste li { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--adm-ligne-2); }
.admins-liste li:last-child { border-bottom: 0; }
@media (max-width: 560px) { .chiffres { grid-template-columns: 1fr; } }
</style>
