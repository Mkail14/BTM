<script setup>
/**
 * Rédaction d'un e-mail depuis contact@btm.yt : nouveau message, réponse, réponse à tous, transfert.
 * Les pièces jointes sont lues dans le navigateur puis envoyées à la fonction « boite-mail » (10 Mo au total).
 */
import { computed, nextTick, onMounted, ref } from 'vue'
import { envoyerMessage, lireFichier } from '@/services/supabase/serviceMessagerie.js'

const props = defineProps({ brouillon: { type: Object, required: true } })
const emit = defineEmits(['fermer', 'envoye'])

const TAILLE_MAX = 10 * 1024 * 1024
const m = ref({ a: '', cc: '', cci: '', objet: '', texte: '', pieces: [], ...props.brouillon })
const copies = ref(!!(m.value.cc || m.value.cci))
const envoi = ref(false)
const erreur = ref('')
const champA = ref(null)
const champTexte = ref(null)

const taillePieces = computed(() => m.value.pieces.reduce((s, p) => s + (p.taille || p.base64.length * 0.75), 0))
const tailleLisible = (o) => (o > 1024 * 1024 ? `${(o / 1024 / 1024).toFixed(1).replace('.', ',')} Mo` : `${Math.max(1, Math.round(o / 1024))} Ko`)
const titre = computed(() => (m.value.enReponseA ? 'Répondre' : props.brouillon.transfert ? 'Transférer' : 'Nouveau message'))

onMounted(async () => {
  await nextTick()
  // réponse : le curseur va au début du message ; nouveau message ou transfert : au destinataire
  if (m.value.a && champTexte.value) { champTexte.value.focus(); champTexte.value.setSelectionRange(0, 0) } else champA.value?.focus()
})

async function ajouterPieces(e) {
  erreur.value = ''
  for (const f of [...e.target.files]) {
    if (taillePieces.value + f.size > TAILLE_MAX) { erreur.value = `« ${f.name} » dépasse la limite de 10 Mo de pièces jointes.`; break }
    m.value.pieces.push(await lireFichier(f))
  }
  e.target.value = ''
}

async function envoyer() {
  erreur.value = ''
  if (!m.value.a.trim()) { erreur.value = 'Indiquez au moins un destinataire.'; champA.value?.focus(); return }
  envoi.value = true
  try {
    await envoyerMessage({
      a: m.value.a, cc: copies.value ? m.value.cc : '', cci: copies.value ? m.value.cci : '',
      objet: m.value.objet, texte: m.value.texte, enReponseA: m.value.enReponseA || null,
      pieces: m.value.pieces.map(({ nom, type, base64 }) => ({ nom, type, base64 }))
    })
    emit('envoye')
  } catch (e) {
    erreur.value = e.message || 'L’envoi a échoué.'
  } finally {
    envoi.value = false
  }
}
</script>

<template>
  <div class="mr-fond" @keydown.esc="emit('fermer')">
    <form class="mr adm-carte" role="dialog" aria-modal="true" aria-labelledby="mr-titre" novalidate @submit.prevent="envoyer">
      <header class="mr-tete">
        <h2 id="mr-titre">{{ titre }}</h2>
        <button type="button" class="adm-icone-btn" aria-label="Fermer sans envoyer" @click="emit('fermer')"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
      </header>

      <div class="mr-champs">
        <label class="mr-ligne"><span>De</span><input value="BTM <contact@btm.yt>" disabled /></label>
        <label class="mr-ligne">
          <span>À</span><input ref="champA" v-model="m.a" type="text" autocomplete="email" placeholder="adresse@exemple.fr, autre@exemple.fr" />
          <button v-if="!copies" type="button" class="mr-lien" @click="copies = true">Cc / Cci</button>
        </label>
        <template v-if="copies">
          <label class="mr-ligne"><span>Cc</span><input v-model="m.cc" type="text" placeholder="En copie" /></label>
          <label class="mr-ligne"><span>Cci</span><input v-model="m.cci" type="text" placeholder="En copie cachée" /></label>
        </template>
        <label class="mr-ligne"><span>Objet</span><input v-model="m.objet" type="text" maxlength="300" placeholder="Objet du message" /></label>
      </div>

      <textarea ref="champTexte" v-model="m.texte" class="mr-texte" aria-label="Message" placeholder="Votre message…"></textarea>

      <ul v-if="m.pieces.length" class="mr-pieces">
        <li v-for="(p, i) in m.pieces" :key="i">
          <i class="fa-solid fa-paperclip" aria-hidden="true"></i><span>{{ p.nom }}</span><small>{{ tailleLisible(p.taille || p.base64.length * 0.75) }}</small>
          <button type="button" :aria-label="`Retirer ${p.nom}`" @click="m.pieces.splice(i, 1)"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
        </li>
      </ul>

      <p v-if="erreur" class="adm-erreur-texte" role="alert"><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i> {{ erreur }}</p>

      <footer class="mr-pied">
        <button type="submit" class="adm-btn adm-btn-noir" :disabled="envoi">
          <span v-if="envoi" class="spinner" aria-hidden="true"></span><i v-else class="fa-solid fa-paper-plane" aria-hidden="true"></i> Envoyer
        </button>
        <label class="adm-btn adm-btn-clair mr-joindre">
          <i class="fa-solid fa-paperclip" aria-hidden="true"></i> Joindre un fichier
          <input type="file" multiple class="visually-hidden" @change="ajouterPieces" />
        </label>
        <small class="mr-limite">{{ m.pieces.length ? `${tailleLisible(taillePieces)} / 10 Mo` : '' }}</small>
        <button type="button" class="adm-btn adm-btn-fantome" @click="emit('fermer')">Annuler</button>
      </footer>
    </form>
  </div>
</template>

<style scoped>
.mr-fond { position: fixed; inset: 0; z-index: 300; display: grid; place-items: center; padding: 20px; background: rgba(15, 23, 42, .45); backdrop-filter: blur(3px); }
.mr { display: flex; flex-direction: column; width: min(760px, 100%); max-height: 92vh; padding: 0; overflow: hidden; }
.mr-tete { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px 10px 22px; }
.mr-tete h2 { margin: 0; font-family: var(--font-corps); font-size: 1.05rem; font-weight: 700; }
.mr-champs { border-top: 1px solid var(--adm-ligne); }
.mr-ligne { display: flex; align-items: center; gap: 12px; padding: 0 22px; border-bottom: 1px solid var(--adm-ligne-2); }
.mr-ligne > span { width: 48px; flex: none; color: var(--adm-muet); font-size: .85rem; }
.mr-ligne input { flex: 1; min-width: 0; min-height: 44px; border: 0; outline: 0; background: transparent; color: var(--adm-encre); font: inherit; font-size: .93rem; }
.mr-ligne input:disabled { color: var(--adm-encre-2); }
.mr-lien { border: 0; background: none; color: var(--adm-accent); font: inherit; font-size: .84rem; font-weight: 600; cursor: pointer; white-space: nowrap; }
.mr-texte { flex: 1; min-height: 260px; padding: 16px 22px; border: 0; outline: 0; resize: none; color: var(--adm-encre); font: inherit; font-size: .95rem; line-height: 1.6; }
.mr-pieces { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; padding: 0 22px 10px; list-style: none; }
.mr-pieces li { display: inline-flex; align-items: center; gap: 8px; padding: 6px 8px 6px 12px; border-radius: 10px; background: var(--adm-ligne-2); font-size: .84rem; }
.mr-pieces span { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mr-pieces small { color: var(--adm-muet); }
.mr-pieces button { width: 24px; height: 24px; border: 0; border-radius: 50%; background: transparent; color: var(--adm-muet); cursor: pointer; }
.mr-pieces button:hover { background: #fff; color: var(--adm-baisse); }
.mr .adm-erreur-texte { margin: 0 22px 10px; }
.mr-pied { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 12px 22px; border-top: 1px solid var(--adm-ligne); background: #fafbfc; }
.mr-joindre { cursor: pointer; }
.mr-limite { flex: 1; color: var(--adm-muet); font-size: .8rem; }
@media (max-width: 640px) { .mr-fond { padding: 0; } .mr { max-height: 100%; height: 100%; border-radius: 0; } }
</style>
