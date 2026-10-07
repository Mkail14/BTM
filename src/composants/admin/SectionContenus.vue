<script setup>
/**
 * Contenu du site : un formulaire par section de texte (contenus_site).
 * Le formulaire est généré depuis `sectionsContenus` ; l'enregistrement met le site à jour immédiatement.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useAdmin, formatDate } from '@/composables/useAdmin.js'
import { useAuth } from '@/composables/useAuth.js'
import { useContenuSite, appliquerSection } from '@/composables/useContenuSite.js'
import { sectionsContenus, contenusParDefaut } from '@/donnees/contenusSite.js'
import GestionRealisations from './GestionRealisations.vue'

const { api, donnees, erreurs, charger, confirmer, executer } = useAdmin()
const { utilisateur } = useAuth()
const contenu = useContenuSite()
onMounted(() => charger(['contenus', 'realisations'], { force: true }))

// entrée à part : les réalisations (photos + infos) ne sont pas des textes de contenus_site
const GALERIE = 'galerie-realisations'
const aValider = computed(() => (donnees.realisations || []).filter((r) => r.statut === 'soumise').length)
const enLigne = computed(() => (donnees.realisations || []).filter((r) => r.statut === 'publiee').length)

const active = ref(sectionsContenus[0].cle)
const section = computed(() => sectionsContenus.find((s) => s.cle === active.value))
const brouillon = ref({})
const enregistrement = ref(false)

const copie = (o) => JSON.parse(JSON.stringify(o ?? {}))
const reinitialiserBrouillon = () => { brouillon.value = copie(contenu[active.value]) }
watch(active, reinitialiserBrouillon, { immediate: true })
// les contenus distants arrivent après l'ouverture : on recale le brouillon s'il n'a pas été touché
watch(() => contenu[active.value], (v) => { if (!modifie.value) brouillon.value = copie(v) }, { deep: true })

const modifie = computed(() => !!section.value && JSON.stringify(brouillon.value) !== JSON.stringify(contenu[active.value]))
const ligne = (cle) => donnees.contenus?.find((c) => c.cle === cle)
const personnalise = (cle) => JSON.stringify(contenu[cle]) !== JSON.stringify(contenusParDefaut[cle])
const trop = (champ) => champ.max && String(brouillon.value[champ.nom] ?? '').length > champ.max
const invalide = computed(() => !!section.value?.champs.some(trop))

async function choisir(cle) {
  if (cle === active.value) return
  if (modifie.value && !(await confirmer({ titre: 'Quitter sans enregistrer ?', texte: 'Les modifications de cette section seront perdues.', libelle: 'Quitter' }))) return
  active.value = cle
}

async function enregistrer(valeur = brouillon.value, message = 'Section enregistrée — le site est à jour.') {
  enregistrement.value = true
  const reussi = await executer(async () => {
    const enregistree = await api.enregistrerContenu(active.value, valeur, utilisateur.value?.id)
    appliquerSection(active.value, enregistree.valeur)
    const liste = (donnees.contenus || []).filter((c) => c.cle !== active.value)
    donnees.contenus = [...liste, enregistree]
  }, message)
  if (reussi) reinitialiserBrouillon()
  enregistrement.value = false
}

async function retablir() {
  const ok = await confirmer({ titre: 'Rétablir les textes d’origine ?', texte: `Tous les textes de « ${section.value.titre} » reprendront leur valeur initiale.`, libelle: 'Rétablir' })
  if (ok) await enregistrer({}, 'Textes d’origine rétablis.')
}
</script>

<template>
  <div class="contenus">
    <p v-if="erreurs.contenus" class="adm-alerte" role="alert"><i class="fa-solid fa-circle-exclamation"></i> {{ erreurs.contenus }}</p>

    <!-- Liste des sections -->
    <nav class="contenus-liste" aria-label="Sections de texte">
      <button
        v-for="s in sectionsContenus" :key="s.cle" type="button" class="contenus-item adm-carte" :class="{ actif: active === s.cle }"
        :aria-current="active === s.cle ? 'true' : undefined" @click="choisir(s.cle)"
      >
        <span class="contenus-icone"><i :class="s.icone" aria-hidden="true"></i></span>
        <span class="contenus-item-texte">
          <strong>{{ s.titre }}</strong>
          <small v-if="s.cle === 'annonce'">{{ contenu.annonce.actif ? 'En ligne' : 'Masqué' }}</small>
          <small v-else-if="personnalise(s.cle)">Modifié {{ ligne(s.cle) ? `le ${formatDate(ligne(s.cle).mis_a_jour_le, { day: 'numeric', month: 'short' })}` : '' }}</small>
          <small v-else>Textes d’origine</small>
        </span>
        <span v-if="s.cle === 'annonce' && contenu.annonce.actif" class="contenus-point" aria-hidden="true"></span>
      </button>
      <button
        type="button" class="contenus-item adm-carte" :class="{ actif: active === GALERIE }"
        :aria-current="active === GALERIE ? 'true' : undefined" @click="choisir(GALERIE)"
      >
        <span class="contenus-icone"><i class="fa-solid fa-images" aria-hidden="true"></i></span>
        <span class="contenus-item-texte">
          <strong>Réalisations — projets affichés</strong>
          <small>{{ aValider ? `${aValider} à valider · ` : '' }}{{ enLigne }} en ligne</small>
        </span>
        <span v-if="aValider" class="contenus-point contenus-point-alerte" aria-hidden="true"></span>
      </button>
    </nav>

    <!-- Réalisations : photos et infos des projets affichés sur l'accueil -->
    <GestionRealisations v-if="active === GALERIE" />

    <!-- Éditeur -->
    <form v-else class="adm-carte contenus-editeur" novalidate @submit.prevent="enregistrer()">
      <header class="editeur-tete">
        <div>
          <h2>{{ section.titre }}</h2>
          <p>{{ section.description }}</p>
        </div>
        <a :href="section.page" target="_blank" rel="noopener" class="adm-btn adm-btn-clair adm-btn-sm"><i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i> Voir sur le site</a>
      </header>

      <div class="adm-grille-form editeur-champs">
        <template v-for="c in section.champs" :key="c.nom">
          <div v-if="c.type === 'interrupteur'" class="plein editeur-interrupteur">
            <button :id="`c-${c.nom}`" type="button" role="switch" class="adm-interrupteur" :aria-checked="!!brouillon[c.nom]" @click="brouillon[c.nom] = !brouillon[c.nom]"></button>
            <label :for="`c-${c.nom}`">{{ c.label }}</label>
          </div>

          <div v-else class="adm-champ" :class="{ plein: c.plein }">
            <label :for="`c-${c.nom}`">{{ c.label }}</label>
            <select v-if="c.type === 'choix'" :id="`c-${c.nom}`" v-model="brouillon[c.nom]">
              <option v-for="o in c.options" :key="o.valeur" :value="o.valeur">{{ o.label }}</option>
            </select>
            <textarea v-else-if="c.type === 'long'" :id="`c-${c.nom}`" v-model="brouillon[c.nom]" rows="3" :aria-invalid="trop(c) || undefined" :placeholder="contenusParDefaut[section.cle][c.nom]"></textarea>
            <input v-else :id="`c-${c.nom}`" v-model="brouillon[c.nom]" :type="c.type === 'email' ? 'email' : 'text'" :aria-invalid="trop(c) || undefined" :placeholder="contenusParDefaut[section.cle][c.nom]" />
            <span class="adm-champ-aide">
              <span>{{ c.aide || '' }}</span>
              <span v-if="c.max" :class="{ trop: trop(c) }">{{ String(brouillon[c.nom] ?? '').length }} / {{ c.max }}</span>
            </span>
          </div>
        </template>
      </div>

      <footer class="editeur-pied">
        <button type="button" class="adm-btn adm-btn-fantome" :disabled="!personnalise(section.cle) || enregistrement" @click="retablir">
          <i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i> Textes d’origine
        </button>
        <span class="editeur-etat" aria-live="polite">{{ modifie ? 'Modifications non enregistrées' : '' }}</span>
        <button type="button" class="adm-btn adm-btn-clair" :disabled="!modifie || enregistrement" @click="reinitialiserBrouillon">Annuler</button>
        <button type="submit" class="adm-btn adm-btn-noir" :disabled="!modifie || invalide || enregistrement">
          <span v-if="enregistrement" class="spinner" aria-hidden="true"></span>
          <i v-else class="fa-solid fa-check" aria-hidden="true"></i> Enregistrer
        </button>
      </footer>
    </form>
  </div>
</template>

<style scoped>
.contenus { display: grid; grid-template-columns: 290px minmax(0, 1fr); gap: 16px; align-items: start; }
.contenus > .adm-alerte { grid-column: 1 / -1; margin: 0; }

.contenus-liste { position: sticky; top: 16px; display: flex; flex-direction: column; gap: 8px; }
.contenus-item {
  position: relative; display: flex; align-items: center; gap: 14px; width: 100%; padding: 14px 16px; border: 0; border-radius: 18px;
  font: inherit; text-align: left; cursor: pointer; transition: background var(--transition), color var(--transition), transform var(--transition);
}
.contenus-item:hover { transform: translateX(2px); }
.contenus-item.actif { background: var(--adm-noir); color: #fff; }
.contenus-icone { width: 40px; height: 40px; flex: none; display: grid; place-items: center; border-radius: 12px; background: var(--adm-ligne-2); color: var(--adm-encre); }
.contenus-item.actif .contenus-icone { background: rgba(255, 255, 255, .12); color: #fff; }
.contenus-item-texte { display: flex; flex-direction: column; min-width: 0; }
.contenus-item-texte strong { font-size: .92rem; font-weight: 600; }
.contenus-item-texte small { font-size: .78rem; color: var(--adm-muet); }
.contenus-item.actif small { color: rgba(255, 255, 255, .6); }
.contenus-point { position: absolute; right: 16px; width: 8px; height: 8px; border-radius: 50%; background: #10b981; box-shadow: 0 0 0 4px rgba(16, 185, 129, .18); }
.contenus-point-alerte { background: #f59e0b; box-shadow: 0 0 0 4px rgba(245, 158, 11, .2); }

.contenus-editeur { display: flex; flex-direction: column; }
.editeur-tete { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 14px; padding: 24px 26px 20px; border-bottom: 1px solid var(--adm-ligne-2); }
.editeur-tete h2 { margin: 0; font-family: var(--font-corps); font-size: 1.2rem; font-weight: 600; letter-spacing: 0; }
.editeur-tete p { margin: 6px 0 0; max-width: 560px; color: var(--adm-encre-2); font-size: .9rem; line-height: 1.5; }
.editeur-champs { padding: 24px 26px; }
.editeur-interrupteur { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-radius: 14px; background: var(--adm-ligne-2); }
.editeur-interrupteur label { font-weight: 600; font-size: .92rem; cursor: pointer; }
.editeur-pied { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 16px 26px; border-top: 1px solid var(--adm-ligne-2); }
.editeur-etat { flex: 1; text-align: right; font-size: .82rem; color: #b45309; }

@media (max-width: 1023px) {
  .contenus { grid-template-columns: minmax(0, 1fr); }
  .contenus-liste { position: static; flex-direction: row; overflow-x: auto; padding-bottom: 4px; scrollbar-width: none; }
  .contenus-item { flex: none; width: auto; padding: 10px 16px 10px 10px; }
  .contenus-item:hover { transform: none; }
  .contenus-point { right: 8px; top: 8px; }
}
@media (max-width: 640px) {
  .editeur-tete, .editeur-champs, .editeur-pied { padding-inline: 18px; }
  .editeur-etat { flex-basis: 100%; order: -1; text-align: left; }
}
</style>
