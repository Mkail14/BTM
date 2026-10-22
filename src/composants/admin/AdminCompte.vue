<script setup>
/**
 * Compte & reversements (clic sur le profil admin) :
 *  - Reversements : les fournisseurs encaissent tout et reversent à BTM sa commission (codes promo BTM déduits).
 *    Quand les codes promo BTM dépassent la commission, BTM rembourse le fournisseur (« Verser »).
 *    Pas de validation : un virement compte dès que celui qui l'a fait clique « Virement fait ».
 *  - RIB de BTM : communiqué aux fournisseurs pour leurs reversements (IBAN contrôlé par sa clé).
 *  - RIB des fournisseurs : saisis par eux dans leur espace, pour que BTM les rembourse.
 *  - Profils : donner un profil (utilisateur, professionnel, fournisseur, administrateur) à un compte à partir de son
 *    e-mail, ou retirer ses droits à un administrateur. Le changement passe par api.definirRoleCompte ; le serveur revérifie le rôle de l'appelant.
 *  - Mise en ligne : ouvrir btm.yt au public, le mettre en maintenance, ou le laisser s'ouvrir seul dès
 *    SEUIL_FOURNISSEURS partenaires (useOuverture). Chaque changement est confirmé : il s'applique tout de suite au site.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { SEUIL_FOURNISSEURS, CLE_OUVERTURE, siteOuvert, lireModeOuverture, compterPartenaires, appliquerModeOuverture } from '@/composables/useOuverture.js'
import { useAdmin, formatDate, initiales } from '@/composables/useAdmin.js'
import { useAuth } from '@/composables/useAuth.js'
import { formaterEuros } from '@/services/calculs/moteurCalculs.js'
import { ibanValide, bicValide, normaliserIban, formaterIban, masquerIban } from '@/services/versements.js'
import AdminPanneau from './AdminPanneau.vue'

const emit = defineEmits(['fermer'])
const { api, donnees, erreurs, charger, confirmer, executer, notifier } = useAdmin()
const { utilisateur } = useAuth()
const onglet = ref('reversements')
onMounted(() => charger(['versement', 'reversements', 'paiements', 'fournisseurs', 'profils', 'ribsFournisseurs'], { force: true }))

// ---------- Reversements ----------
const somme = (liste) => Math.round(liste.reduce((s, x) => s + (Number(x) || 0), 0) * 100) / 100
const reversements = computed(() => donnees.reversements || [])
// sens 'vers_btm' : le fournisseur paie BTM ; 'vers_fournisseur' : BTM rembourse les codes promo qu'il a avancés
const versBtm = (r) => (r.sens || 'vers_btm') === 'vers_btm'
const recus = computed(() => reversements.value.filter((r) => r.statut === 'valide' && versBtm(r)))
const verses = computed(() => reversements.value.filter((r) => r.statut === 'valide' && !versBtm(r)))
const historique = reversements
/**
 * Par fournisseur : du = commission − codes promo BTM − crédit utilisé (négatif si BTM a offert plus que la commission),
 * reçu de lui, versé par BTM ; solde > 0 : il doit à BTM, solde < 0 : BTM lui doit (« btmDoit »).
 */
const parFournisseur = computed(() => {
  const noms = Object.fromEntries((donnees.fournisseurs || []).map((f) => [f.id, f.nom]))
  const lignes = {}
  const ligne = (id) => (lignes[id] ||= { id, nom: noms[id] || 'Fournisseur supprimé', du: 0, recu: 0, verse: 0 })
  for (const p of donnees.paiements || []) if (p.fournisseur_id && p.revenu_btm) ligne(p.fournisseur_id).du += Number(p.revenu_btm)
  for (const r of recus.value) ligne(r.fournisseur_id).recu += r.montant
  for (const r of verses.value) ligne(r.fournisseur_id).verse += r.montant
  return Object.values(lignes).map((l) => {
    const solde = somme([l.du, -l.recu, l.verse])
    return { ...l, du: somme([l.du]), recu: somme([l.recu]), verse: somme([l.verse]), reste: Math.max(0, solde), btmDoit: Math.max(0, -solde), rib: donnees.ribsFournisseurs?.[l.id] || null }
  }).sort((a, b) => b.btmDoit - a.btmDoit || b.reste - a.reste)
})

// Virement de BTM vers un fournisseur (remboursement des codes promo BTM qu'il a avancés)
const versement = ref(null) // { ligne, montant, reference, envoi, erreur }
function ouvrirVersement(l) {
  const mois = new Date().toISOString().slice(0, 7).replace('-', '')
  versement.value = { ligne: l, montant: String(l.btmDoit).replace('.', ','), reference: `BTM-PROMO-${mois}`, envoi: false, erreur: '' }
}
async function verser() {
  const v = versement.value
  const montant = Number(String(v.montant).replace(',', '.'))
  v.erreur = ''
  if (!(montant > 0)) { v.erreur = 'Indiquez le montant viré.'; return }
  if (montant > v.ligne.btmDoit + 0.001) { v.erreur = `BTM ne doit que ${formaterEuros(v.ligne.btmDoit)} à ce fournisseur.`; return }
  if (v.reference.trim().length < 3) { v.erreur = 'Indiquez la référence du virement.'; return }
  v.envoi = true
  const ok = await executer(async () => {
    const r = await api.verserAuFournisseur(v.ligne.id, montant, v.reference.trim())
    donnees.reversements = [{ ...r, fournisseur_nom: v.ligne.nom }, ...reversements.value]
  }, `Virement de ${formaterEuros(montant)} à ${v.ligne.nom} enregistré.`)
  v.envoi = false
  if (ok) versement.value = null
}

// ---------- RIB des fournisseurs ----------
const ribsFournisseurs = computed(() => (donnees.fournisseurs || [])
  .map((f) => ({ id: f.id, nom: f.nom, commune: f.commune, rib: donnees.ribsFournisseurs?.[f.id] || null, btmDoit: parFournisseur.value.find((l) => l.id === f.id)?.btmDoit || 0 }))
  .sort((a, b) => b.btmDoit - a.btmDoit || !!b.rib - !!a.rib || a.nom.localeCompare(b.nom, 'fr')))
async function copier(texte, quoi) {
  try { await navigator.clipboard.writeText(texte); notifier(`${quoi} copié.`, 'info') } catch { notifier('Copie impossible.', 'erreur') }
}

const totaux = computed(() => ({
  du: somme(parFournisseur.value.map((l) => l.du)),
  recu: somme(parFournisseur.value.map((l) => l.recu)),
  reste: somme(parFournisseur.value.map((l) => l.reste)),
  btmDoit: somme(parFournisseur.value.map((l) => l.btmDoit))
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

// ---------- Profils ----------
const nomDe = (p) => p.nom_affiche || p.email
const moi = computed(() => utilisateur.value?.id)
// soi-même d'abord, puis par nom
const admins = computed(() => (donnees.profils || []).filter((p) => p.role === 'admin')
  .sort((a, b) => (b.id === moi.value) - (a.id === moi.value) || nomDe(a).localeCompare(nomDe(b), 'fr')))

const PROFILS = Object.keys(api.ROLES_COMPTE) // utilisateur, professionnel, fournisseur, administrateur
const roleChoisi = ref('professionnel')
const fournisseurChoisi = ref('')
const nomFournisseur = computed(() => Object.fromEntries((donnees.fournisseurs || []).map((f) => [f.id, f.nom])))

const emailSaisi = ref('')
const email = computed(() => emailSaisi.value.trim().toLowerCase())
const emailComplet = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.value))
const candidat = computed(() => (emailComplet.value ? (donnees.profils || []).find((p) => (p.email || '').toLowerCase() === email.value) || null : null))
// '' (rien à dire) | 'inconnu' | 'moi' | 'principal' | 'banni' | 'deja' | 'ok'
const etatCandidat = computed(() => {
  if (!emailComplet.value || !donnees.profils) return ''
  const c = candidat.value
  if (!c) return 'inconnu'
  if (c.id === moi.value) return 'moi'
  if (api.estAdminPrincipal(c)) return 'principal'
  if (api.banActif(c)) return 'banni'
  const meme = api.roleCompte(c) === roleChoisi.value && (roleChoisi.value !== 'fournisseur' || !fournisseurChoisi.value || c.fournisseur_id === fournisseurChoisi.value)
  return meme ? 'deja' : 'ok'
})

const roleEnCours = ref('') // id du compte dont le rôle est en train de changer
async function changerRole(profil, choix, fournisseurId, succes) {
  roleEnCours.value = profil.id
  const ok = await executer(async () => {
    await api.definirRoleCompte(profil, choix, { fournisseurId })
    await charger(['profils'], { force: true })
  }, succes)
  roleEnCours.value = ''
  return ok
}

async function donnerRole() {
  const c = candidat.value
  const choix = roleChoisi.value
  if (etatCandidat.value !== 'ok' || roleEnCours.value) return
  if (choix === 'fournisseur' && !fournisseurChoisi.value) { notifier('Choisissez l’entreprise de l’annuaire que ce compte représente.', 'erreur'); return }
  const entreprise = nomFournisseur.value[fournisseurChoisi.value]
  const effets = {
    particulier: `${c.email} redeviendra un utilisateur normal : site public, calculateur et « Mes projets ».`,
    admin: `${c.email} pourra modifier tout le site, les prix et les comptes, et changer le profil des autres comptes.`,
    professionnel: `${c.email} aura un compte professionnel vérifié, avec le devis pro : plusieurs ouvrages réunis dans un même devis.`,
    fournisseur: `${c.email} représentera ${entreprise} : il verra les devis qui ont choisi cette entreprise et confirmera leur paiement. Un compte fournisseur n’utilise plus le site comme client.`
  }
  const pertes = (c.role === 'admin' ? ' Ce compte perdra ses droits d’administrateur.' : '') + (c.role === 'fournisseur' && choix !== 'fournisseur' ? ' Il perdra son accès à l’espace fournisseur.' : '')
    + (c.pro_statut === 'verifie' && choix === 'particulier' ? ' Il perdra le devis pro.' : '')
  const label = api.ROLES_COMPTE[choix].label.toLowerCase()
  if (!(await confirmer({ titre: `Donner le profil ${label} ?`, texte: effets[choix] + pertes, libelle: 'Donner ce profil', danger: c.role === 'admin' }))) return
  if (await changerRole(c, choix, fournisseurChoisi.value || null, `${nomDe(c)} est maintenant ${label} : le changement s’applique à sa prochaine connexion.`)) emailSaisi.value = ''
}

async function retirer(p) {
  if (p.id === moi.value || api.estAdminPrincipal(p) || roleEnCours.value) return
  if (!(await confirmer({
    titre: 'Retirer les droits administrateur ?', libelle: 'Retirer les droits', danger: true,
    texte: `${p.email} redeviendra un simple utilisateur et n’aura plus accès à l’administration. Son compte et ses projets sont conservés.`
  }))) return
  // il redevient ce qu'il était par ailleurs : professionnel vérifié ou particulier
  await changerRole(p, api.roleCompte({ ...p, role: 'user' }), null, `${nomDe(p)} n’est plus administrateur.`)
}

// ---------- Mise en ligne ----------
const MODES = {
  auto: { label: 'Automatique', icone: 'fa-solid fa-wand-magic-sparkles', aide: `Page d’attente tant qu’il y a moins de ${SEUIL_FOURNISSEURS} fournisseurs partenaires, puis ouverture toute seule.` },
  'en-ligne': { label: 'En ligne', icone: 'fa-solid fa-globe', aide: 'Le site est ouvert à tout le monde, quel que soit le nombre de partenaires.' },
  maintenance: { label: 'Maintenance', icone: 'fa-solid fa-screwdriver-wrench', aide: 'Page « Site en maintenance » pour le public. Admins et fournisseurs gardent leur espace.' }
}
const ouverture = ref(null) // { mode, partenaires } une fois lu
const erreurOuverture = ref('')
const changementMode = ref('')
async function lireOuverture() {
  erreurOuverture.value = ''
  try {
    const [mode, partenaires] = await Promise.all([lireModeOuverture(), compterPartenaires()])
    ouverture.value = { mode, partenaires }
  } catch (e) {
    erreurOuverture.value = e?.message || 'État du site illisible.'
  }
}
watch(onglet, (o) => { if (o === 'site') lireOuverture() }, { immediate: true })
const publicOuvert = computed(() => ouverture.value && siteOuvert(ouverture.value.mode, ouverture.value.partenaires))
const etatPublic = computed(() => {
  const o = ouverture.value
  if (!o) return ''
  if (o.mode === 'maintenance') return 'En maintenance'
  return publicOuvert.value ? 'En ligne' : `En attente · ${o.partenaires} / ${SEUIL_FOURNISSEURS} fournisseurs`
})

async function changerMode(mode) {
  const o = ouverture.value
  if (!o || mode === o.mode || changementMode.value) return
  const ouvrira = siteOuvert(mode, o.partenaires)
  const textes = {
    'en-ligne': { titre: 'Mettre le site en ligne ?', libelle: 'Mettre en ligne', texte: 'Tout le monde pourra utiliser btm.yt tout de suite : calculateur, inscription et devis.' },
    maintenance: { titre: 'Mettre le site en maintenance ?', libelle: 'Mettre en maintenance', danger: true, texte: 'Les visiteurs et les clients verront la page « Site en maintenance » tout de suite. Les admins et les fournisseurs gardent leur espace.' },
    auto: { titre: 'Repasser en automatique ?', libelle: 'Passer en automatique', texte: ouvrira ? `Il y a déjà ${o.partenaires} fournisseurs partenaires : le site sera en ligne.` : `Avec ${o.partenaires} fournisseur${o.partenaires > 1 ? 's' : ''} partenaire${o.partenaires > 1 ? 's' : ''} sur ${SEUIL_FOURNISSEURS}, le public verra la page d’attente jusqu’au ${SEUIL_FOURNISSEURS}e.` }
  }
  if (!(await confirmer(textes[mode]))) return
  changementMode.value = mode
  const ok = await executer(async () => {
    await api.enregistrerContenu(CLE_OUVERTURE, { mode }, utilisateur.value?.id)
    ouverture.value = { ...o, mode }
    appliquerModeOuverture(mode, o.partenaires)
  }, ouvrira ? 'Le site est en ligne.' : mode === 'maintenance' ? 'Le site est en maintenance.' : 'Mode automatique : le public voit la page d’attente.')
  changementMode.value = ''
  if (!ok) lireOuverture()
}
</script>

<template>
  <AdminPanneau titre="Compte BTM" sous-titre="Reversements des fournisseurs, RIB, profils des comptes et mise en ligne du site." large @fermer="emit('fermer')">
    <div class="compte">
      <div class="adm-segments compte-onglets" role="tablist" aria-label="Compte et reversements">
        <button type="button" role="tab" :aria-selected="onglet === 'reversements'" @click="onglet = 'reversements'">
          <i class="fa-solid fa-money-bill-transfer" aria-hidden="true"></i> Reversements
        </button>
        <button type="button" role="tab" :aria-selected="onglet === 'rib'" @click="onglet = 'rib'"><i class="fa-solid fa-building-columns" aria-hidden="true"></i> RIB de BTM</button>
        <button type="button" role="tab" :aria-selected="onglet === 'ribsFournisseurs'" @click="onglet = 'ribsFournisseurs'"><i class="fa-solid fa-truck" aria-hidden="true"></i> RIB fournisseurs</button>
        <button type="button" role="tab" :aria-selected="onglet === 'admins'" @click="onglet = 'admins'"><i class="fa-solid fa-id-badge" aria-hidden="true"></i> Profils</button>
        <button type="button" role="tab" :aria-selected="onglet === 'site'" @click="onglet = 'site'"><i class="fa-solid fa-power-off" aria-hidden="true"></i> Mise en ligne</button>
      </div>

      <!-- ===================== Mise en ligne ===================== -->
      <template v-if="onglet === 'site'">
        <p v-if="erreurOuverture" class="adm-alerte" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ erreurOuverture }}</p>
        <div v-else-if="!ouverture" class="adm-chargement"><span class="spinner spinner-grand"></span></div>
        <template v-else>
          <div class="solde site-etat">
            <span class="solde-label">btm.yt pour le public</span>
            <strong class="solde-montant"><span class="site-voyant" :class="ouverture.mode === 'maintenance' ? 'maintenance' : publicOuvert ? 'ouvert' : 'attente'" aria-hidden="true"></span>{{ etatPublic }}</strong>
            <span class="solde-detail">Les admins et les fournisseurs gardent toujours leur espace.</span>
          </div>
          <div class="site-modes" role="radiogroup" aria-label="État du site">
            <button v-for="(m, cle) in MODES" :key="cle" type="button" class="site-mode" :class="{ actif: ouverture.mode === cle }" role="radio" :aria-checked="ouverture.mode === cle" :disabled="!!changementMode" @click="changerMode(cle)">
              <span class="site-mode-icone"><span v-if="changementMode === cle" class="spinner" aria-hidden="true"></span><i v-else :class="m.icone" aria-hidden="true"></i></span>
              <span class="site-mode-texte"><strong>{{ m.label }}</strong><small>{{ m.aide }}</small></span>
              <i v-if="ouverture.mode === cle" class="fa-solid fa-circle-check site-mode-coche" aria-hidden="true"></i>
            </button>
          </div>
          <p class="compte-note"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> Le changement s’applique tout de suite, sans redéploiement. Les visiteurs déjà sur le site le voient à leur prochain chargement de page.</p>
          <section class="site-publication" aria-labelledby="site-publication-titre">
            <div>
              <h3 id="site-publication-titre">Publier le code de Develop</h3>
              <p>Prépare une demande de fusion vers <code>main</code>. GitHub bloque la fusion si des conflits existent : résolvez-les avant de pouvoir mettre le code en ligne. Après la fusion, Vercel déploie la production.</p>
            </div>
            <a class="adm-btn adm-btn-noir" href="https://github.com/Mkail14/BTM/compare/main...develop?expand=1" target="_blank" rel="noopener noreferrer">
              <i class="fa-brands fa-github" aria-hidden="true"></i> Préparer la mise en ligne
            </a>
          </section>
        </template>
      </template>

      <p v-else-if="onglet === 'admins' ? erreurs.profils : erreurs.versement || erreurs.reversements || erreurs.paiements" class="adm-alerte" role="alert">
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
          <div><dt>Revenu BTM encaissé</dt><dd>{{ formaterEuros(totaux.du) }}</dd></div>
          <div><dt>Reçu sur le compte</dt><dd>{{ formaterEuros(totaux.recu) }}</dd></div>
          <div v-if="totaux.btmDoit"><dt>BTM doit aux fournisseurs</dt><dd class="btm-doit">{{ formaterEuros(totaux.btmDoit) }}</dd></div>
        </dl>
        <p v-if="totaux.btmDoit" class="compte-note"><i class="fa-solid fa-tags" aria-hidden="true"></i> Des codes promo BTM ont dépassé la commission : le fournisseur a fait la remise au client à la place de BTM. Remboursez-le par virement, puis enregistrez-le avec « Verser ».</p>

        <template v-if="parFournisseur.length">
          <h3 class="compte-titre">Par fournisseur</h3>
          <table class="adm-table compte-table">
            <thead><tr><th>Fournisseur</th><th class="num">Dû</th><th class="num">Reçu</th><th class="num">Reste</th></tr></thead>
            <tbody>
              <tr v-for="l in parFournisseur" :key="l.id">
                <td>{{ l.nom }}<small v-if="l.verse" class="compte-petit">{{ formaterEuros(l.verse) }} versés par BTM</small></td>
                <td class="num">{{ formaterEuros(l.du) }}</td>
                <td class="num">{{ formaterEuros(l.recu) }}</td>
                <td class="num">
                  <template v-if="l.btmDoit">
                    <strong class="btm-doit">BTM doit {{ formaterEuros(l.btmDoit) }}</strong>
                    <button type="button" class="adm-btn adm-btn-noir adm-btn-sm compte-verser" @click="ouvrirVersement(l)">Verser</button>
                  </template>
                  <strong v-else :class="{ reste: l.reste > 0 }">{{ formaterEuros(l.reste) }}</strong>
                </td>
              </tr>
            </tbody>
          </table>
        </template>

        <!-- Virement de BTM vers un fournisseur -->
        <form v-if="versement" class="versement" novalidate @submit.prevent="verser">
          <strong><i class="fa-solid fa-money-bill-transfer" aria-hidden="true"></i> Rembourser {{ versement.ligne.nom }}</strong>
          <p>Faites le virement depuis le compte de BTM, puis cliquez « Virement fait » : il est déduit de ce que BTM lui doit et apparaît dans son historique.</p>
          <div v-if="versement.ligne.rib" class="rib-carte">
            <span><small>Titulaire</small><strong>{{ versement.ligne.rib.titulaire }}</strong></span>
            <span><small>IBAN</small><strong class="adm-mono">{{ formaterIban(versement.ligne.rib.iban) }}</strong>
              <button type="button" class="adm-icone-btn" aria-label="Copier l’IBAN" @click="copier(versement.ligne.rib.iban, 'IBAN')"><i class="fa-regular fa-copy" aria-hidden="true"></i></button></span>
            <span v-if="versement.ligne.rib.bic"><small>BIC</small><strong class="adm-mono">{{ versement.ligne.rib.bic }}</strong></span>
          </div>
          <p v-else class="adm-alerte"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> Ce fournisseur n’a pas encore enregistré son RIB (Espace fournisseur → Paiements). Demandez-le-lui.</p>
          <div class="adm-champ">
            <label for="vers-montant">Montant viré</label>
            <span class="adm-saisie-unite"><input id="vers-montant" v-model="versement.montant" inputmode="decimal" /><span>€</span></span>
          </div>
          <div class="adm-champ">
            <label for="vers-ref">Référence du virement</label>
            <input id="vers-ref" v-model="versement.reference" class="adm-mono" maxlength="60" />
          </div>
          <p v-if="versement.erreur" class="adm-erreur-texte" role="alert"><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i> {{ versement.erreur }}</p>
          <span class="verif-actions">
            <button type="button" class="adm-btn adm-btn-clair adm-btn-sm" @click="versement = null">Annuler</button>
            <button type="submit" class="adm-btn adm-btn-noir adm-btn-sm" :disabled="versement.envoi">
              <span v-if="versement.envoi" class="spinner" aria-hidden="true"></span><i v-else class="fa-solid fa-check" aria-hidden="true"></i> Virement fait
            </button>
          </span>
        </form>

        <h3 class="compte-titre">Historique des reversements</h3>
        <div v-if="!donnees.reversements" class="adm-chargement"><span class="spinner spinner-grand"></span></div>
        <ul v-else-if="historique.length" class="historique">
          <li v-for="r in historique" :key="r.id">
            <span class="historique-icone" :class="{ refuse: r.statut === 'refuse' }"><i :class="r.statut === 'refuse' ? 'fa-solid fa-xmark' : 'fa-solid fa-check'" aria-hidden="true"></i></span>
            <span class="historique-texte">
              <strong>{{ versBtm(r) ? '' : '− ' }}{{ formaterEuros(r.montant) }} · {{ versBtm(r) ? `reçu de ${r.fournisseur_nom}` : `versé par BTM à ${r.fournisseur_nom}` }}</strong>
              <small>{{ formatDate(r.declare_le) }} · réf. <span class="adm-mono">{{ r.reference }}</span><template v-if="r.statut === 'refuse'"> · refusé : {{ r.motif_refus }}</template></small>
            </span>
          </li>
        </ul>
        <p v-else class="compte-vide"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> Aucun reversement pour le moment.</p>
        <p class="compte-note"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> Les fournisseurs vous reversent la commission sur le RIB de BTM et cliquent « Virement fait » : il compte tout de suite. Vérifiez vos relevés bancaires avec la référence indiquée.</p>
      </template>

      <!-- ===================== RIB des fournisseurs ===================== -->
      <template v-else-if="onglet === 'ribsFournisseurs'">
        <p class="compte-note"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> Chaque fournisseur enregistre son RIB dans son espace (Paiements). BTM l’utilise pour le rembourser quand les codes promo BTM dépassent sa commission.</p>
        <div v-if="!donnees.fournisseurs || !donnees.ribsFournisseurs" class="adm-chargement"><span class="spinner spinner-grand"></span></div>
        <ul v-else class="historique">
          <li v-for="f in ribsFournisseurs" :key="f.id">
            <span class="historique-icone" :class="{ refuse: !f.rib }"><i :class="f.rib ? 'fa-solid fa-building-columns' : 'fa-solid fa-question'" aria-hidden="true"></i></span>
            <span class="historique-texte">
              <strong>{{ f.nom }}<template v-if="f.btmDoit"> · <span class="btm-doit">BTM doit {{ formaterEuros(f.btmDoit) }}</span></template></strong>
              <small v-if="f.rib">{{ f.rib.titulaire }} · <span class="adm-mono">{{ formaterIban(f.rib.iban) }}</span><template v-if="f.rib.bic"> · {{ f.rib.bic }}</template></small>
              <small v-else>RIB pas encore enregistré</small>
            </span>
            <button v-if="f.rib" type="button" class="adm-icone-btn" :aria-label="`Copier l’IBAN de ${f.nom}`" @click="copier(f.rib.iban, 'IBAN')"><i class="fa-regular fa-copy" aria-hidden="true"></i></button>
            <button v-if="f.btmDoit" type="button" class="adm-btn adm-btn-noir adm-btn-sm" @click="onglet = 'reversements'; ouvrirVersement(parFournisseur.find((l) => l.id === f.id))">Verser</button>
          </li>
        </ul>
      </template>

      <!-- ===================== Administrateurs ===================== -->
      <template v-else-if="onglet === 'admins'">
        <form class="admins-ajout" novalidate @submit.prevent="donnerRole">
          <div class="adm-champ">
            <span class="adm-champ-label">Profil à donner</span>
            <div class="admins-roles" role="radiogroup" aria-label="Profil à donner">
              <button v-for="cle in PROFILS" :key="cle" type="button" class="adm-pilule" :class="{ actif: roleChoisi === cle }" role="radio" :aria-checked="roleChoisi === cle" @click="roleChoisi = cle">
                <i :class="api.ROLES_COMPTE[cle].icone" aria-hidden="true"></i> {{ api.ROLES_COMPTE[cle].label }}
              </button>
            </div>
            <span class="adm-champ-aide"><span>{{ api.ROLES_COMPTE[roleChoisi].aide }}</span></span>
          </div>
          <div v-if="roleChoisi === 'fournisseur'" class="adm-champ">
            <label for="a-fournisseur">Entreprise représentée</label>
            <select id="a-fournisseur" v-model="fournisseurChoisi">
              <option value="" disabled>Choisir dans l’annuaire…</option>
              <option v-for="f in donnees.fournisseurs || []" :key="f.id" :value="f.id">{{ f.nom }} — {{ f.commune }}</option>
            </select>
          </div>
          <div class="adm-champ">
            <label for="a-email">Compte concerné</label>
            <div class="admins-saisie">
              <input id="a-email" v-model="emailSaisi" type="email" inputmode="email" autocomplete="off" spellcheck="false" placeholder="E-mail de son compte BTM" />
              <button type="submit" class="adm-btn adm-btn-noir" :disabled="etatCandidat !== 'ok' || !!roleEnCours">
                <span v-if="candidat && roleEnCours === candidat.id" class="spinner" aria-hidden="true"></span><i v-else :class="api.ROLES_COMPTE[roleChoisi].icone" aria-hidden="true"></i> Donner ce profil
              </button>
            </div>
          </div>
          <div aria-live="polite">
            <p v-if="etatCandidat === 'ok' || etatCandidat === 'deja'" class="admins-trouve">
              <span class="adm-identite">
                <span class="adm-avatar rond">{{ initiales(nomDe(candidat)) }}</span>
                <span><strong>{{ nomDe(candidat) }}</strong><small>{{ candidat.email }}</small></span>
              </span>
              <span class="adm-badge" :class="{ 'adm-badge-ok': etatCandidat === 'deja' }">{{ etatCandidat === 'deja' ? 'a déjà ce profil' : `aujourd’hui : ${api.ROLES_COMPTE[api.roleCompte(candidat)].label.toLowerCase()}` }}</span>
            </p>
            <p v-else-if="etatCandidat === 'inconnu'" class="admins-etat"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> Aucun compte BTM avec cette adresse. La personne doit d’abord créer son compte sur le site ; vous pourrez ensuite lui donner un profil ici.</p>
            <p v-else-if="etatCandidat === 'moi'" class="admins-etat"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> C’est votre compte : vous ne pouvez pas changer votre propre profil.</p>
            <p v-else-if="etatCandidat === 'principal'" class="admins-etat"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i> C’est le compte administrateur principal : il reste administrateur.</p>
            <p v-else-if="etatCandidat === 'banni'" class="admins-etat attention"><i class="fa-solid fa-ban" aria-hidden="true"></i> Ce compte est banni : levez le bannissement (page Utilisateurs) avant de changer son profil.</p>
            <p v-else class="compte-note"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> Un compte n’a qu’un profil à la fois, et chaque profil a ses pages. Le même choix se trouve dans la fiche du compte, page Utilisateurs.</p>
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
            <span v-if="api.estAdminPrincipal(p)" class="adm-badge adm-badge-noir sans-point" title="Ce compte ne peut être ni supprimé, ni banni, ni rétrogradé"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i> Principal</span>
            <span v-if="p.id === moi" class="adm-badge adm-badge-info sans-point">Vous</span>
            <button v-else-if="!api.estAdminPrincipal(p)" type="button" class="adm-btn adm-btn-clair adm-btn-sm" :disabled="!!roleEnCours" @click="retirer(p)">
              <span v-if="roleEnCours === p.id" class="spinner" aria-hidden="true"></span> Retirer
            </button>
          </li>
        </ul>
      </template>

      <!-- ===================== RIB ===================== -->
      <template v-else-if="onglet === 'rib'">
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
.historique-icone.attente { background: #fef3c7; color: var(--adm-attention-texte); }
.historique-icone.refuse { background: var(--adm-ligne-2); color: var(--adm-muet); }
.verif-actions { display: flex; gap: 6px; }
.verif-refus { display: flex; flex-wrap: wrap; gap: 6px; flex: 1 1 100%; }
.verif-refus input { flex: 1 1 220px; width: auto; }
.historique-texte { flex: 1 1 200px; display: flex; flex-direction: column; min-width: 0; }
.historique-texte small { color: var(--adm-muet); font-size: .8rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.compte-table td, .compte-table th { padding: 10px 12px; }
.compte-table strong.reste { color: var(--adm-attention-texte); }
.btm-doit { color: var(--adm-baisse); }
.compte-petit { display: block; color: var(--adm-muet); font-size: .76rem; }
.compte-verser { margin-left: 8px; }
.versement { display: flex; flex-direction: column; gap: 10px; padding: 14px 16px; border-radius: 14px; background: var(--adm-survol); box-shadow: inset 0 0 0 1px var(--adm-ligne); }
.versement p { margin: 0; color: var(--adm-encre-2); font-size: .86rem; }
.versement .verif-actions { justify-content: flex-end; }
.rib-carte { display: flex; flex-direction: column; gap: 6px; padding: 12px 14px; border-radius: 12px; background: var(--adm-carte); box-shadow: inset 0 0 0 1px var(--adm-ligne); }
.rib-carte span { display: flex; align-items: center; gap: 10px; font-size: .88rem; }
.rib-carte small { width: 70px; color: var(--adm-muet); }

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

.site-etat .solde-montant { display: flex; align-items: center; gap: 12px; font-size: 1.6rem; }
.site-voyant { width: 12px; height: 12px; flex: none; border-radius: 50%; background: #f59e0b; box-shadow: 0 0 0 5px rgba(245, 158, 11, .2); }
.site-voyant.ouvert { background: #22c55e; box-shadow: 0 0 0 5px rgba(34, 197, 94, .2); }
.site-voyant.maintenance { background: #ef4444; box-shadow: 0 0 0 5px rgba(239, 68, 68, .2); }
.site-modes { display: flex; flex-direction: column; gap: 8px; }
.site-mode {
  display: flex; align-items: center; gap: 14px; width: 100%; padding: 14px 16px; border: 0; border-radius: 16px; text-align: left;
  background: var(--adm-ligne-2); color: var(--adm-encre); font: inherit; cursor: pointer; transition: box-shadow var(--transition), background var(--transition);
}
.site-mode:hover:not(:disabled) { box-shadow: inset 0 0 0 1px var(--adm-ligne); }
.site-mode.actif { background: var(--adm-carte); box-shadow: inset 0 0 0 2px var(--adm-noir); }
.site-mode:disabled { cursor: progress; }
.site-mode:focus-visible { outline: 2px solid var(--adm-accent); outline-offset: 2px; }
.site-mode-icone { width: 40px; height: 40px; flex: none; display: grid; place-items: center; border-radius: 12px; background: var(--adm-carte); color: var(--adm-encre-2); }
.site-mode.actif .site-mode-icone { background: var(--adm-noir); color: #fff; }
.site-mode-texte { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.site-mode-texte small { color: var(--adm-muet); font-size: .82rem; line-height: 1.45; }
.site-mode-coche { color: var(--adm-noir); font-size: 1.1rem; }
.adm-sombre .site-mode.actif { box-shadow: inset 0 0 0 2px var(--adm-accent); }
.adm-sombre .site-mode-coche { color: var(--adm-accent); }
.site-publication { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 14px; padding: 18px; border: 1px solid var(--adm-ligne); border-radius: 16px; }
.site-publication h3 { margin: 0 0 4px; font-size: .95rem; }
.site-publication p { max-width: 470px; margin: 0; color: var(--adm-muet); font-size: .82rem; line-height: 1.5; }
.site-publication code { font-family: var(--font-mono); font-size: .95em; }
.site-publication .adm-btn { flex: none; }

.admins-ajout { display: flex; flex-direction: column; gap: 12px; padding: 18px; border-radius: 18px; background: var(--adm-ligne-2); }
.admins-saisie { display: flex; flex-wrap: wrap; gap: 8px; }
.admins-saisie input { flex: 1 1 220px; width: auto; }
.admins-trouve { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 0; padding: 10px 14px; border-radius: 14px; background: var(--adm-carte); box-shadow: inset 0 0 0 1px var(--adm-ligne); }
.admins-trouve .adm-identite, .admins-liste .adm-identite { flex: 1; }
.admins-roles { display: flex; flex-wrap: wrap; gap: 6px; }
.admins-roles .adm-pilule { background: var(--adm-carte); }
.admins-roles .adm-pilule.actif { background: var(--adm-noir); }
.admins-etat { display: flex; gap: 8px; margin: 0; color: var(--adm-encre-2); font-size: .86rem; line-height: 1.5; }
.admins-etat i { margin-top: 4px; color: var(--adm-muet); }
.admins-etat.attention, .admins-etat.attention i { color: var(--adm-attention-texte); }
.admins-liste { display: flex; flex-direction: column; margin: 0; padding: 0; list-style: none; }
.admins-liste li { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--adm-ligne-2); }
.admins-liste li:last-child { border-bottom: 0; }
@media (max-width: 560px) {
  .chiffres { grid-template-columns: 1fr; }
  .solde, .rib-carte { padding: 18px; }
  .solde-montant { font-size: 1.8rem; }
  .rib-iban { font-size: 1.02rem; letter-spacing: .04em; word-break: break-all; }
  .compte-table { font-size: .82rem; }
  .compte-table td, .compte-table th { padding: 8px 6px; }
  .admins-ajout { padding: 14px; }
}
</style>
