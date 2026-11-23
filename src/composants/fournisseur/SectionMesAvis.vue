<script setup>
/**
 * Avis de vos clients : les clients venus retirer une commande. Le fournisseur leur demande un avis (une fois par
 * encaissement), le client répond depuis « Mes projets », l'avis publié s'affiche sur la fiche de l'annuaire.
 * À gauche la note (moyenne, répartition, suivi des demandes), à droite les clients classés par étape.
 * Section du menu principal (« Avis clients »), à la hauteur de l'écran : seule la liste des clients défile.
 */
import { computed, ref } from 'vue'
import { useAdmin } from '@/composables/useAdmin.js'
import { useEspaceFournisseur, formatDate } from '@/composables/useEspaceFournisseur.js'

const { notifier } = useAdmin()
const { paiements, mesAvis, avisIndisponibles, demanderAvis } = useEspaceFournisseur()

// ---------- Clients et avis ----------
const avisDe = computed(() => Object.fromEntries(mesAvis.value.map((a) => [a.paiement_id, a])))
// un encaissement = un client venu au comptoir (sans projet lié, impossible de le joindre)
const clients = computed(() => paiements.value.filter((p) => p.projet_id).map((p) => ({ paiement: p, avis: avisDe.value[p.id] || null })))
const etape = (c) => (!c.avis ? 'ademander' : c.avis.statut === 'publie' ? 'recus' : c.avis.statut === 'demande' ? 'attente' : 'sansreponse')

const publies = computed(() => mesAvis.value.filter((a) => a.statut === 'publie' && a.visible))
const moyenne = computed(() => (publies.value.length ? publies.value.reduce((s, a) => s + a.note, 0) / publies.value.length : 0))
const repartition = computed(() => [5, 4, 3, 2, 1].map((n) => {
  const nombre = publies.value.filter((a) => a.note === n).length
  return { note: n, nombre, part: publies.value.length ? (nombre / publies.value.length) * 100 : 0 }
}))
const demandes = computed(() => mesAvis.value.length)
const reponses = computed(() => mesAvis.value.filter((a) => a.statut === 'publie').length)
const tauxReponse = computed(() => (demandes.value ? Math.round((reponses.value / demandes.value) * 100) : 0))

// ---------- Filtre ----------
const FILTRES = [
  { id: 'ademander', label: 'À demander', vide: 'Tous vos clients ont reçu une demande.', icone: 'fa-regular fa-paper-plane' },
  { id: 'attente', label: 'En attente', vide: 'Aucune demande en attente de réponse.', icone: 'fa-regular fa-clock' },
  { id: 'recus', label: 'Avis reçus', vide: 'Pas encore d’avis : demandez-le à vos derniers clients.', icone: 'fa-regular fa-star' },
  { id: 'tous', label: 'Tous', vide: '', icone: 'fa-regular fa-user' }
]
const compte = computed(() => Object.fromEntries(FILTRES.map((f) => [f.id, f.id === 'tous' ? clients.value.length : clients.value.filter((c) => etape(c) === f.id).length])))
// à l'ouverture : ce qu'il reste à faire d'abord
const filtre = ref(compte.value.ademander ? 'ademander' : compte.value.recus ? 'recus' : 'tous')
const filtreActif = computed(() => FILTRES.find((f) => f.id === filtre.value))
const liste = computed(() => (filtre.value === 'tous' ? clients.value : clients.value.filter((c) => etape(c) === filtre.value)))

// ---------- Demandes ----------
const envoi = ref('') // id du paiement en cours de demande ('tous' pendant l'envoi groupé)
async function demander(p) {
  envoi.value = p.id
  try {
    await demanderAvis(p.id)
    notifier('Demande envoyée : le client la verra dans « Mes projets ».')
  } catch (e) {
    notifier(e?.message || 'Demande impossible pour le moment.', 'erreur')
  } finally {
    envoi.value = ''
  }
}
async function demanderATous() {
  const aFaire = clients.value.filter((c) => !c.avis).map((c) => c.paiement)
  envoi.value = 'tous'
  let faites = 0
  for (const p of aFaire) {
    try { await demanderAvis(p.id); faites++ } catch (e) { console.warn(e) }
  }
  envoi.value = ''
  notifier(faites === aFaire.length ? `${faites} demande${faites > 1 ? 's' : ''} envoyée${faites > 1 ? 's' : ''}.` : `${faites} demande(s) envoyée(s) sur ${aFaire.length} : réessayez pour les autres.`, faites === aFaire.length ? 'succes' : 'erreur')
}
const jour = (d) => formatDate(d, { day: 'numeric', month: 'short', year: 'numeric' })
</script>

<template>
  <div class="mp">
    <p v-if="avisIndisponibles" class="adm-alerte mp-alerte" role="alert"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> Les avis ne sont pas encore activés sur le serveur : BTM doit appliquer la mise à jour des avis fournisseurs.</p>

    <div v-else class="mp-grille">
      <!-- Votre note -->
      <aside class="mp-gauche">
        <section class="mp-bloc mp-note-bloc">
          <div class="mp-moyenne">
            <strong>{{ publies.length ? moyenne.toFixed(1).replace('.', ',') : '–' }}</strong>
            <span>
              <span class="adm-etoiles" :aria-label="`${moyenne.toFixed(1)} sur 5`"><i v-for="n in 5" :key="n" class="fa-solid fa-star" :class="{ eteinte: n > Math.round(moyenne) }" aria-hidden="true"></i></span>
              <small>{{ publies.length ? `${publies.length} avis publié${publies.length > 1 ? 's' : ''}` : 'Aucun avis pour l’instant' }}</small>
            </span>
          </div>
          <ul class="mp-repartition" aria-label="Répartition des notes">
            <li v-for="r in repartition" :key="r.note">
              <span>{{ r.note }} <i class="fa-solid fa-star" aria-hidden="true"></i></span>
              <span class="mp-barre"><span :style="{ width: `${r.part}%` }"></span></span>
              <span class="mp-nombre">{{ r.nombre }}</span>
            </li>
          </ul>
        </section>

        <ul class="mp-chiffres">
          <li><strong>{{ demandes }}</strong><small>Demandes envoyées</small></li>
          <li><strong>{{ compte.attente }}</strong><small>En attente</small></li>
          <li><strong>{{ demandes ? `${tauxReponse} %` : '–' }}</strong><small>Taux de réponse</small></li>
        </ul>

        <section class="mp-bloc mp-etapes">
          <h3>Comment ça marche</h3>
          <ol>
            <li><span>1</span><p>Après un retrait au comptoir, <strong>demandez un avis</strong> au client.</p></li>
            <li><span>2</span><p>Il le reçoit dans <strong>« Mes projets »</strong> et vous note de 1 à 5 étoiles.</p></li>
            <li><span>3</span><p>L’avis s’affiche sur <strong>votre fiche de l’annuaire</strong>. BTM peut masquer un avis abusif.</p></li>
          </ol>
        </section>
      </aside>

      <!-- Vos clients -->
      <section class="mp-bloc mp-clients">
        <div class="mp-clients-tete">
          <div class="adm-pilules" role="group" aria-label="Filtrer les clients">
            <button v-for="f in FILTRES" :key="f.id" type="button" class="adm-pilule" :class="{ actif: filtre === f.id }" :aria-pressed="filtre === f.id" @click="filtre = f.id">
              {{ f.label }} <small>{{ compte[f.id] }}</small>
            </button>
          </div>
          <button v-if="filtre === 'ademander' && compte.ademander > 1" type="button" class="adm-btn adm-btn-noir adm-btn-sm" :disabled="!!envoi" @click="demanderATous">
            <span v-if="envoi === 'tous'" class="spinner" aria-hidden="true"></span><i v-else class="fa-solid fa-paper-plane" aria-hidden="true"></i> Demander à tous ({{ compte.ademander }})
          </button>
        </div>

        <ul v-if="liste.length" class="mp-liste">
          <li v-for="c in liste" :key="c.paiement.id" :class="`mp-${etape(c)}`">
            <span class="mp-pastille" aria-hidden="true"><i :class="{ ademander: 'fa-regular fa-user', attente: 'fa-regular fa-clock', recus: 'fa-solid fa-star', sansreponse: 'fa-regular fa-comment-dots' }[etape(c)]"></i></span>
            <div class="mp-corps">
              <div class="mp-ligne">
                <span class="mp-client">
                  <strong>{{ c.paiement.projet_nom }}</strong>
                  <small>Retiré le {{ jour(c.paiement.paye_le) }}<template v-if="c.paiement.numero_recu"> · <span class="adm-mono">{{ c.paiement.numero_recu }}</span></template></small>
                </span>
                <button v-if="!c.avis" type="button" class="adm-btn adm-btn-clair adm-btn-sm" :disabled="!!envoi" @click="demander(c.paiement)">
                  <span v-if="envoi === c.paiement.id" class="spinner" aria-hidden="true"></span><i v-else class="fa-regular fa-paper-plane" aria-hidden="true"></i> Demander un avis
                </button>
                <span v-else-if="c.avis.statut === 'demande'" class="adm-badge adm-badge-info"><i class="fa-regular fa-clock" aria-hidden="true"></i> Demandé le {{ jour(c.avis.demande_le) }}</span>
                <span v-else-if="c.avis.statut === 'decline'" class="adm-badge">Pas de réponse</span>
                <span v-else class="mp-note">
                  <span v-if="!c.avis.visible" class="adm-badge adm-badge-attention">Masqué par BTM</span>
                  <span class="adm-etoiles" :aria-label="`${c.avis.note} sur 5`"><i v-for="n in 5" :key="n" class="fa-solid fa-star" :class="{ eteinte: n > c.avis.note }" aria-hidden="true"></i></span>
                </span>
              </div>
              <blockquote v-if="c.avis?.statut === 'publie'" class="mp-citation">
                <p>{{ c.avis.commentaire || 'Note sans commentaire.' }}</p>
                <footer>{{ c.avis.nom }} · {{ jour(c.avis.repondu_le) }}</footer>
              </blockquote>
            </div>
          </li>
        </ul>

        <div v-else class="mp-vide">
          <span><i :class="clients.length ? filtreActif.icone : 'fa-solid fa-store'" aria-hidden="true"></i></span>
          <strong>{{ clients.length ? filtreActif.vide : 'Pas encore de client' }}</strong>
          <p v-if="!clients.length">Dès qu’un client retire sa commande chez vous (« Valider un projet »), il apparaît ici et vous pouvez lui demander son avis.</p>
          <router-link v-if="!clients.length" to="/espace-fournisseur/valider" class="adm-btn adm-btn-clair adm-btn-sm"><i class="fa-solid fa-ticket" aria-hidden="true"></i> Valider un projet</router-link>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* section du menu principal, à la hauteur de l'écran : à gauche la note, à droite les clients (seule leur liste défile) */
.mp { display: flex; flex-direction: column; height: 100%; }
.mp-alerte { flex: none; }
.mp-grille { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(280px, 360px) minmax(0, 1fr); gap: 20px; }
.mp-gauche { display: flex; flex-direction: column; gap: 14px; min-height: 0; overflow-y: auto; scrollbar-width: none; }
.mp-bloc { border-radius: var(--adm-rayon); background: var(--adm-carte); box-shadow: var(--adm-ombre); }

/* Note */
/* les deux blocs se partagent la hauteur de la colonne : pas de vide en bas, bords alignés sur le bloc des clients */
.mp-note-bloc, .mp-etapes { flex: 1 0 auto; display: flex; flex-direction: column; }
.mp-note-bloc { padding: 18px 20px; }
.mp-moyenne { display: flex; align-items: center; gap: 14px; margin-bottom: 14px; }
.mp-moyenne > strong { font-size: 2.6rem; font-weight: 600; letter-spacing: -.03em; line-height: 1; font-variant-numeric: tabular-nums; }
.mp-moyenne > span { display: flex; flex-direction: column; gap: 4px; }
.mp-moyenne .adm-etoiles { font-size: 1rem; }
.mp-moyenne small { color: var(--adm-muet); font-size: .8rem; }
.mp-repartition { flex: 1; display: flex; flex-direction: column; justify-content: space-evenly; gap: 6px; margin: 0; padding: 0; list-style: none; }
.mp-repartition li { display: grid; grid-template-columns: 34px minmax(0, 1fr) 22px; align-items: center; gap: 10px; color: var(--adm-encre-2); font-size: .8rem; }
.mp-repartition i { color: #f59e0b; font-size: .68rem; }
.mp-barre { height: 7px; overflow: hidden; border-radius: 999px; background: var(--adm-ligne); }
.mp-barre span { display: block; height: 100%; border-radius: inherit; background: #f59e0b; transition: width .4s ease; }
.mp-nombre { text-align: right; font-variant-numeric: tabular-nums; }

.mp-chiffres { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin: 0; padding: 0; list-style: none; }
.mp-chiffres li { display: flex; flex-direction: column; gap: 2px; padding: 14px; border-radius: var(--adm-rayon); background: var(--adm-carte); box-shadow: var(--adm-ombre); }
.mp-chiffres strong { font-size: 1.25rem; font-weight: 600; font-variant-numeric: tabular-nums; }
.mp-chiffres small { color: var(--adm-muet); font-size: .72rem; line-height: 1.3; }

.mp-etapes { padding: 16px 18px; }
.mp-etapes h3 { margin: 0 0 10px; color: var(--adm-muet); font-family: var(--font-corps); font-size: .72rem; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; }
.mp-etapes ol { flex: 1; display: flex; flex-direction: column; justify-content: space-evenly; gap: 10px; margin: 0; padding: 0; list-style: none; }
.mp-etapes li { display: flex; gap: 10px; }
.mp-etapes li > span { width: 22px; height: 22px; flex: none; display: grid; place-items: center; border-radius: 50%; background: var(--adm-accent-doux); color: var(--adm-info-texte); font-size: .72rem; font-weight: 700; }
.mp-etapes p { margin: 0; color: var(--adm-encre-2); font-size: .82rem; line-height: 1.45; }
.mp-etapes strong { color: var(--adm-encre); font-weight: 600; }

/* Clients */
.mp-clients { display: flex; flex-direction: column; min-height: 0; padding: 14px 6px 6px 16px; }
.mp-clients-tete { flex: none; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; padding: 0 10px 12px 0; border-bottom: 1px solid var(--adm-ligne-2); }
.mp-liste { flex: 1; min-height: 0; margin: 0; padding: 4px 10px 6px 0; overflow-y: auto; list-style: none; scrollbar-width: thin; }
.mp-liste li { display: flex; gap: 12px; padding: 12px 0; border-top: 1px solid var(--adm-ligne-2); }
.mp-liste li:first-child { border-top: 0; }
.mp-pastille { width: 38px; height: 38px; flex: none; display: grid; place-items: center; border-radius: 12px; background: var(--adm-ligne-2); color: var(--adm-muet); font-size: .9rem; }
.mp-attente .mp-pastille { background: var(--adm-accent-doux); color: var(--adm-info-texte); }
.mp-recus .mp-pastille { background: rgba(245, 158, 11, .14); color: #f59e0b; }
.mp-corps { flex: 1; min-width: 0; }
.mp-ligne { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 38px; }
.mp-client { display: flex; flex-direction: column; min-width: 0; }
.mp-client strong { overflow: hidden; font-size: .92rem; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.mp-client small { color: var(--adm-muet); font-size: .78rem; }
.mp-ligne > .adm-btn, .mp-ligne > .adm-badge, .mp-note { flex: none; }
.mp-note { display: inline-flex; align-items: center; gap: 8px; }
.mp-note .adm-etoiles { font-size: .9rem; }
.mp-citation { margin: 8px 0 0; padding: 10px 14px; border-left: 3px solid #f59e0b; border-radius: 0 12px 12px 0; background: var(--adm-ligne-2); }
.mp-citation p { margin: 0; color: var(--adm-encre); font-size: .88rem; line-height: 1.5; }
.mp-citation footer { margin-top: 4px; color: var(--adm-muet); font-size: .76rem; }

.mp-vide { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 24px; text-align: center; }
.mp-vide > span { width: 56px; height: 56px; display: grid; place-items: center; margin-bottom: 4px; border-radius: 18px; background: var(--adm-ligne-2); color: var(--adm-muet); font-size: 1.3rem; }
.mp-vide strong { font-size: .98rem; font-weight: 600; }
.mp-vide p { max-width: 380px; margin: 0 0 6px; color: var(--adm-muet); font-size: .86rem; line-height: 1.5; }

@media (max-width: 1100px) {
  .mp { height: auto; }
  .mp-grille { grid-template-columns: minmax(0, 1fr); }
  .mp-gauche, .mp-liste { overflow: visible; }
  .mp-note-bloc, .mp-etapes { flex: none; }
}
</style>
