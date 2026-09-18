<script setup>
import { computed, onMounted, ref } from 'vue'
import BoutonBase from '@/composants/commun/BoutonBase.vue'

const cleStockage = 'btm-avis-clients'
const avisInitiaux = [
  { id: 'initial-1', nom: 'Amina M.', ville: 'Mamoudzou', note: 5, commentaire: 'Une estimation claire et rapide pour préparer mon projet.', date: '2026-09-12' },
  { id: 'initial-2', nom: 'Youssouf B.', ville: 'Koungou', note: 4, commentaire: 'Les quantités sont faciles à comprendre. Très pratique avant de demander un devis.', date: '2026-09-10' },
  { id: 'initial-3', nom: 'Sarah A.', ville: 'Dzaoudzi', note: 5, commentaire: 'Enfin un outil pensé pour les projets de construction à Mayotte.', date: '2026-09-06' },
  { id: 'initial-4', nom: 'Nassim R.', ville: 'Pamandzi', note: 4, commentaire: 'Simple, lisible et utile pour comparer les matériaux.', date: '2026-09-02' }
]

const avis = ref([])
const modalOuverte = ref(false)
const envoiEffectue = ref(false)
const formulaire = ref({ nom: '', ville: '', note: 0, commentaire: '' })

const avisAffiches = computed(() => [...avis.value, ...avis.value])
const moyenne = computed(() => {
  if (!avis.value.length) return '0,0'
  return (avis.value.reduce((total, element) => total + element.note, 0) / avis.value.length).toFixed(1).replace('.', ',')
})

function chargerAvis() {
  try {
    const avisSauvegardes = JSON.parse(localStorage.getItem(cleStockage) || 'null')
    avis.value = Array.isArray(avisSauvegardes) && avisSauvegardes.length ? avisSauvegardes : avisInitiaux
  } catch {
    avis.value = avisInitiaux
  }
}

function ouvrirModal() {
  formulaire.value = { nom: '', ville: '', note: 0, commentaire: '' }
  envoiEffectue.value = false
  modalOuverte.value = true
}

function fermerModal() {
  modalOuverte.value = false
}

function envoyerAvis() {
  if (!formulaire.value.nom.trim() || !formulaire.value.note) return

  const nouvelAvis = {
    id: `avis-${Date.now()}`,
    nom: formulaire.value.nom.trim(),
    ville: formulaire.value.ville.trim() || 'Mayotte',
    note: formulaire.value.note,
    commentaire: formulaire.value.commentaire.trim(),
    date: new Date().toISOString().slice(0, 10)
  }

  avis.value = [nouvelAvis, ...avis.value]
  localStorage.setItem(cleStockage, JSON.stringify(avis.value))
  envoiEffectue.value = true
  formulaire.value = { nom: '', ville: '', note: 0, commentaire: '' }
}

function formaterDate(date) {
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(date))
}

onMounted(chargerAvis)
</script>

<template>
  <section id="avis" class="section avis-section" aria-labelledby="avis-titre">
    <div class="conteneur">
      <header class="avis-entete">
        <div>
          <span class="section-surtitre">Ils parlent de BTM</span>
          <h2 id="avis-titre" class="section-titre">Des projets mieux préparés.</h2>
          <p class="section-sous-titre">Les retours de celles et ceux qui utilisent BTM.</p>
        </div>
        <div class="avis-resume" aria-label="Note moyenne des avis">
          <strong>{{ moyenne }}</strong>
          <span class="avis-etoiles" aria-hidden="true">★★★★★</span>
          <small>{{ avis.length }} avis</small>
        </div>
        <BoutonBase variante="primaire" icone="fa-solid fa-pen" @click="ouvrirModal">Ajouter une note</BoutonBase>
      </header>

      <div class="avis-defile" aria-label="Avis clients">
        <div class="avis-piste">
          <article v-for="(element, index) in avisAffiches" :key="`${element.id}-${index}`" class="avis-carte">
            <div class="avis-carte-haut">
              <div class="avis-avatar" aria-hidden="true">{{ element.nom.charAt(0).toUpperCase() }}</div>
              <div>
                <h3>{{ element.nom }}</h3>
                <p>{{ element.ville }}</p>
              </div>
              <span class="avis-note" :aria-label="`${element.note} étoiles sur 5`">{{ '★'.repeat(element.note) }}</span>
            </div>
            <p v-if="element.commentaire" class="avis-commentaire">“{{ element.commentaire }}”</p>
            <time :datetime="element.date">{{ formaterDate(element.date) }}</time>
          </article>
        </div>
      </div>
    </div>

    <div v-if="modalOuverte" class="avis-modal-fond" @click.self="fermerModal">
      <section class="avis-modal" role="dialog" aria-modal="true" aria-labelledby="avis-modal-titre">
        <button class="avis-fermer" type="button" aria-label="Fermer" @click="fermerModal">
          <i class="fa-solid fa-xmark" aria-hidden="true"></i>
        </button>
        <template v-if="!envoiEffectue">
          <span class="section-surtitre">Votre retour</span>
          <h2 id="avis-modal-titre">Partagez votre expérience.</h2>
          <p class="avis-modal-intro">Une note suffit. Le commentaire reste facultatif.</p>
          <form @submit.prevent="envoyerAvis">
            <label class="avis-label" for="avis-nom">Votre nom</label>
            <input id="avis-nom" v-model="formulaire.nom" required maxlength="60" autocomplete="name" placeholder="Ex. Amina M." />
            <label class="avis-label" for="avis-ville">Votre ville <span>(facultatif)</span></label>
            <input id="avis-ville" v-model="formulaire.ville" maxlength="60" autocomplete="address-level2" placeholder="Ex. Mamoudzou" />
            <fieldset class="avis-rating">
              <legend>Votre note <span>(obligatoire)</span></legend>
              <div class="avis-rating-choix">
                <button
                  v-for="note in 5"
                  :key="note"
                  type="button"
                  :class="{ actif: note <= formulaire.note }"
                  :aria-label="`${note} étoile${note > 1 ? 's' : ''}`"
                  :aria-pressed="note === formulaire.note"
                  @click="formulaire.note = note"
                >★</button>
              </div>
            </fieldset>
            <label class="avis-label" for="avis-commentaire">Commentaire <span>(facultatif)</span></label>
            <textarea id="avis-commentaire" v-model="formulaire.commentaire" maxlength="300" rows="4" placeholder="Qu'avez-vous pensé de votre expérience ?"></textarea>
            <button class="btn btn-primaire avis-submit" type="submit" :disabled="!formulaire.nom.trim() || !formulaire.note">Publier mon avis <i class="fa-solid fa-arrow-right"></i></button>
          </form>
        </template>
        <div v-else class="avis-succes">
          <div class="avis-succes-icone"><i class="fa-solid fa-check" aria-hidden="true"></i></div>
          <h2>Merci pour votre avis.</h2>
          <p>Votre retour apparaît maintenant dans la liste.</p>
          <button class="btn btn-secondaire" type="button" @click="fermerModal">Fermer</button>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.avis-section { background: var(--fond); overflow: hidden; }
.avis-entete { display: grid; grid-template-columns: 1fr auto auto; gap: 28px; align-items: end; margin-bottom: 38px; }
.avis-entete > div:first-child { max-width: 650px; }
.avis-resume { display: grid; justify-items: center; gap: 2px; padding: 0 20px; border-left: 1px solid var(--gris-300); border-right: 1px solid var(--gris-300); }
.avis-resume strong { font-size: 2rem; line-height: 1; color: var(--ardoise); }
.avis-etoiles, .avis-note { color: #f59e0b; letter-spacing: 2px; }
.avis-resume small { color: var(--texte-secondaire); font-size: .78rem; }
.avis-defile { position: relative; width: 100vw; margin-left: calc(50% - 50vw); overflow: hidden; mask-image: linear-gradient(90deg, transparent, #000 7%, #000 93%, transparent); }
.avis-piste { display: flex; width: max-content; gap: 18px; animation: defiler-avis 34s linear infinite; }
.avis-piste:hover { animation-play-state: paused; }
.avis-carte { width: min(360px, 78vw); min-height: 205px; padding: 24px; background: #fff; border: 1px solid var(--bordure); border-radius: var(--rayon-lg); box-shadow: var(--ombre-sm); }
.avis-carte-haut { display: grid; grid-template-columns: 42px 1fr auto; gap: 12px; align-items: center; }
.avis-avatar { width: 42px; height: 42px; display: grid; place-items: center; border-radius: 50%; color: #fff; background: var(--ardoise); font-weight: 700; }
.avis-carte h3 { color: var(--ardoise); font-size: 1rem; }
.avis-carte-haut p { margin-top: 2px; color: var(--texte-secondaire); font-size: .8rem; }
.avis-note { font-size: .86rem; white-space: nowrap; }
.avis-commentaire { margin-top: 24px; color: var(--texte); line-height: 1.6; font-size: .94rem; }
.avis-carte time { display: block; margin-top: 20px; color: var(--gris-500); font-size: .75rem; }
.avis-modal-fond { position: fixed; inset: 0; z-index: 300; display: grid; place-items: center; padding: 20px; background: rgba(6, 32, 44, .62); backdrop-filter: blur(5px); }
.avis-modal { position: relative; width: min(100%, 520px); max-height: calc(100dvh - 40px); overflow-y: auto; padding: 34px; background: #fff; border-radius: var(--rayon-lg); box-shadow: var(--ombre-lg); }
.avis-fermer { position: absolute; top: 16px; right: 16px; width: 36px; height: 36px; border: 0; border-radius: 50%; background: var(--gris-100); color: var(--gris-700); cursor: pointer; }
.avis-modal h2 { margin-top: 8px; color: var(--ardoise); font-size: 1.65rem; }
.avis-modal-intro { margin: 8px 0 24px; color: var(--texte-secondaire); }
.avis-label, .avis-rating legend { display: block; margin: 16px 0 7px; color: var(--ardoise); font-weight: 600; font-size: .88rem; }
.avis-label span, .avis-rating span { color: var(--gris-500); font-weight: 400; }
.avis-modal input, .avis-modal textarea { width: 100%; padding: 12px 14px; border: 1.5px solid var(--gris-300); border-radius: var(--rayon-sm); background: #fff; color: var(--texte); font: inherit; resize: vertical; }
.avis-modal input:focus, .avis-modal textarea:focus { outline: none; border-color: var(--lagon-500); box-shadow: 0 0 0 4px rgba(6, 182, 212, .18); }
.avis-rating { border: 0; padding: 0; }
.avis-rating-choix { display: flex; gap: 4px; }
.avis-rating-choix button { padding: 0 3px; border: 0; background: transparent; color: var(--gris-300); font-size: 2rem; line-height: 1; cursor: pointer; transition: color .2s, transform .2s; }
.avis-rating-choix button:hover, .avis-rating-choix button.actif { color: #f59e0b; transform: translateY(-2px); }
.avis-submit { margin-top: 24px; width: 100%; justify-content: center; }
.avis-succes { padding: 26px 0 8px; text-align: center; }
.avis-succes-icone { width: 58px; height: 58px; display: grid; place-items: center; margin: 0 auto 18px; border-radius: 50%; background: #d1fae5; color: #047857; font-size: 1.4rem; }
.avis-succes h2 { margin-top: 0; }
.avis-succes p { margin: 10px 0 24px; color: var(--texte-secondaire); }
@keyframes defiler-avis { from { transform: translateX(0); } to { transform: translateX(calc(-50% - 9px)); } }
@media (prefers-reduced-motion: reduce) { .avis-piste { animation: none; } }
@media (max-width: 760px) { .avis-entete { grid-template-columns: 1fr auto; align-items: start; } .avis-entete > .avis-resume { grid-column: 2; grid-row: 1; } .avis-entete > .btn { grid-column: 1 / -1; justify-self: start; } }
@media (max-width: 480px) { .avis-modal { padding: 28px 22px; } .avis-carte { padding: 20px; } }
</style>
