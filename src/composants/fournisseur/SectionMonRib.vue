<script setup>
/**
 * RIB du fournisseur (Mon compte) : BTM y vire ce qu'il lui doit, quand les codes promo BTM et le crédit fidélité
 * dépassent la commission. Privé : jamais affiché dans l'annuaire ni aux clients (table rib_fournisseurs).
 * Un panneau « compte bancaire » (lecture, saisie sur place ou vide) et, à côté, ce que BTM doit au fournisseur.
 */
import { ref } from 'vue'
import { useAdmin } from '@/composables/useAdmin.js'
import { useEspaceFournisseur } from '@/composables/useEspaceFournisseur.js'
import { formaterEuros } from '@/services/calculs/moteurCalculs.js'
import { formaterIban, ibanValide, bicValide, normaliserIban, masquerIban } from '@/services/versements.js'
import * as api from '@/services/supabase/serviceEspaceFournisseur.js'

const { notifier, confirmer } = useAdmin()
const { fiche, monRib, soldeBtm } = useEspaceFournisseur()

const edition = ref(null) // { titulaire, iban, bic, banque }
const erreur = ref('')
const envoi = ref(false)

function modifier() {
  const r = monRib.value
  edition.value = { titulaire: r?.titulaire || fiche.value?.nom || '', iban: r ? formaterIban(r.iban) : '', bic: r?.bic || '', banque: r?.banque || '' }
  erreur.value = ''
}
async function enregistrer() {
  const e = edition.value
  const iban = normaliserIban(e.iban)
  erreur.value = e.titulaire.trim().length < 2 ? 'Indiquez le titulaire du compte.'
    : !ibanValide(iban) ? 'IBAN invalide : vérifiez les caractères.'
    : e.bic && !bicValide(e.bic) ? 'BIC invalide (8 ou 11 caractères).' : ''
  if (erreur.value) return
  envoi.value = true
  try {
    monRib.value = await api.enregistrerMonRib({ titulaire: e.titulaire.trim(), iban, bic: e.bic.trim(), banque: e.banque.trim() })
    notifier('RIB enregistré.')
    edition.value = null
  } catch (err) {
    erreur.value = err?.message || 'Enregistrement impossible.'
  } finally {
    envoi.value = false
  }
}

const jour = (d) => (d ? new Intl.DateTimeFormat('fr-FR', { timeZone: 'Indian/Mayotte', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(d)) : '—')

async function supprimer() {
  const ok = await confirmer({
    titre: 'Supprimer le RIB ?',
    texte: 'BTM ne pourra plus vous rembourser par virement tant que vous n’en ajoutez pas un autre.',
    libelle: 'Supprimer', danger: true
  })
  if (!ok) return
  envoi.value = true
  try {
    monRib.value = await api.supprimerMonRib()
    notifier('RIB supprimé.')
  } catch (err) {
    notifier(err?.message || 'Suppression impossible.', 'erreur')
  } finally {
    envoi.value = false
  }
}
</script>

<template>
  <div class="cp-vue">
    <header class="cp-tete">
      <div><h2>Compte de remboursement</h2><p>Le compte bancaire sur lequel BTM vous verse ce qu’il vous doit.</p></div>
    </header>

    <div class="rib">
      <!-- Compte bancaire : lecture, saisie ou vide, toujours dans le même panneau -->
      <section class="rib-panneau" :class="{ vide: !monRib && !edition }">
        <!-- Saisie -->
        <form v-if="edition" novalidate @submit.prevent="enregistrer">
          <div class="rib-panneau-tete">
            <div><strong>{{ monRib ? 'Modifier le compte' : 'Ajouter un compte' }}</strong><small>Les champs * sont obligatoires</small></div>
          </div>
          <div class="rib-corps">
            <p v-if="erreur" class="adm-erreur-texte rib-erreur" role="alert"><i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i> {{ erreur }}</p>
            <div class="cp-champs rib-champs">
              <div class="adm-champ plein"><label for="mr-iban">IBAN *</label><input id="mr-iban" v-model="edition.iban" class="adm-mono" autocomplete="off" placeholder="FR76 3000 6000 0112 3456 7890 189" /></div>
              <div class="adm-champ plein"><label for="mr-titulaire">Titulaire *</label><input id="mr-titulaire" v-model="edition.titulaire" maxlength="120" /></div>
              <div class="adm-champ"><label for="mr-bic">BIC</label><input id="mr-bic" v-model="edition.bic" class="adm-mono" maxlength="11" placeholder="Facultatif" /></div>
              <div class="adm-champ"><label for="mr-banque">Banque</label><input id="mr-banque" v-model="edition.banque" maxlength="80" placeholder="Facultatif" /></div>
            </div>
          </div>
          <footer class="rib-pied">
            <button type="button" class="adm-btn adm-btn-clair adm-btn-sm" :disabled="envoi" @click="edition = null">Annuler</button>
            <button type="submit" class="adm-btn adm-btn-noir adm-btn-sm" :disabled="envoi"><span v-if="envoi" class="spinner" aria-hidden="true"></span> Enregistrer</button>
          </footer>
        </form>

        <!-- Lecture -->
        <template v-else-if="monRib">
          <div class="rib-panneau-tete">
            <span class="rib-icone"><i class="fa-solid fa-building-columns" aria-hidden="true"></i></span>
            <div>
              <strong>{{ monRib.banque || 'Compte bancaire' }}</strong>
              <small class="adm-mono">{{ masquerIban(monRib.iban) }}</small>
            </div>
            <span class="adm-badge adm-badge-ok">Actif</span>
            <div class="rib-actions">
              <button type="button" class="adm-btn adm-btn-clair adm-btn-sm" :disabled="envoi" @click="modifier">Modifier</button>
              <button type="button" class="adm-icone-btn danger" title="Supprimer le compte" aria-label="Supprimer le compte" :disabled="envoi" @click="supprimer">
                <span v-if="envoi" class="spinner" aria-hidden="true"></span><i v-else class="fa-regular fa-trash-can" aria-hidden="true"></i>
              </button>
            </div>
          </div>
          <dl class="rib-details">
            <div><dt>Titulaire</dt><dd>{{ monRib.titulaire }}</dd></div>
            <div><dt>BIC</dt><dd class="adm-mono" :class="{ vide: !monRib.bic }">{{ monRib.bic || '—' }}</dd></div>
            <div><dt>Mis à jour le</dt><dd>{{ jour(monRib.mis_a_jour_le) }}</dd></div>
          </dl>
        </template>

        <!-- Aucun compte -->
        <div v-else class="rib-vide">
          <span class="rib-icone"><i class="fa-solid fa-building-columns" aria-hidden="true"></i></span>
          <strong>Aucun compte bancaire</strong>
          <p>Ajoutez un RIB pour recevoir les remboursements de BTM.</p>
          <button type="button" class="adm-btn adm-btn-noir adm-btn-sm" @click="modifier"><i class="fa-solid fa-plus" aria-hidden="true"></i> Ajouter un RIB</button>
        </div>
      </section>

      <!-- Ce que BTM vous doit -->
      <aside class="rib-panneau rib-solde" :class="{ alerte: !monRib && soldeBtm.btmDoit > 0 }">
        <small>À recevoir de BTM</small>
        <strong>{{ formaterEuros(soldeBtm.btmDoit) }}</strong>
        <p>{{ soldeBtm.btmDoit > 0 ? (monRib ? 'Versé sur ce compte au prochain virement.' : 'Ajoutez un RIB pour le recevoir.') : 'Rien en attente pour l’instant.' }}</p>
      </aside>
    </div>

    <p class="rib-note"><i class="fa-solid fa-lock" aria-hidden="true"></i> Visible uniquement par BTM : votre RIB n’apparaît jamais aux clients.</p>
  </div>
</template>

<style scoped>
/* Deux panneaux de même largeur et de même hauteur : le compte et le montant à recevoir */
.rib { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.rib-panneau { border: 1px solid var(--adm-ligne); border-radius: 16px; background: var(--adm-carte); }
.rib-panneau.vide { border-style: dashed; background: none; }

.rib-panneau-tete { display: flex; align-items: center; gap: 14px; padding: 18px 20px; }
.rib-panneau-tete > div:not(.rib-actions) { display: flex; flex: 1; flex-direction: column; gap: 2px; min-width: 0; }
.rib-panneau-tete strong { font-size: .98rem; font-weight: 600; }
.rib-panneau-tete small { overflow: hidden; color: var(--adm-muet); font-size: .84rem; text-overflow: ellipsis; white-space: nowrap; }
.rib-icone { width: 42px; height: 42px; flex: none; display: grid; place-items: center; border-radius: 12px; background: var(--adm-ligne-2); color: var(--adm-encre-2); }
.rib-actions { display: flex; align-items: center; gap: 4px; margin-left: 8px; }

.rib-details { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; margin: 0; padding: 16px 20px 18px; border-top: 1px solid var(--adm-ligne-2); }
.rib-details dt { margin-bottom: 4px; color: var(--adm-muet); font-size: .76rem; }
.rib-details dd { overflow: hidden; margin: 0; font-size: .9rem; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.rib-details dd.vide { color: var(--adm-muet); }

.rib-corps { padding: 0 20px 18px; }
.rib-champs { margin-top: 0; }
.rib-erreur { margin: 0 0 14px; }
.rib-pied { display: flex; justify-content: flex-end; gap: 8px; padding: 14px 20px; border-top: 1px solid var(--adm-ligne-2); }

.rib-vide { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 32px 24px; text-align: center; }
.rib-vide .rib-icone { margin-bottom: 6px; }
.rib-vide strong { font-size: .98rem; font-weight: 600; }
.rib-vide p { margin: 0 0 10px; color: var(--adm-muet); font-size: .86rem; }

.rib-solde { display: flex; flex-direction: column; justify-content: center; gap: 4px; padding: 18px 20px; }
.rib-solde small { color: var(--adm-muet); font-size: .8rem; }
.rib-solde strong { font-size: 1.6rem; font-weight: 600; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
.rib-solde p { margin: 2px 0 0; color: var(--adm-muet); font-size: .82rem; line-height: 1.45; }
.rib-solde.alerte { border-color: var(--adm-attention-bord); background: var(--adm-attention-fond); }
.rib-solde.alerte p { color: var(--adm-attention-texte); }

.rib-note { display: flex; align-items: center; gap: 8px; margin: 16px 0 0; color: var(--adm-muet); font-size: .8rem; }
.rib-note i { font-size: .72rem; }

@media (max-width: 900px) {
  .rib { grid-template-columns: minmax(0, 1fr); }
  .rib-panneau-tete { flex-wrap: wrap; }
  .rib-actions { width: 100%; margin-left: 0; }
  .rib-actions .adm-btn { flex: 1; }
  .rib-details { grid-template-columns: minmax(0, 1fr); gap: 12px; }
}
</style>
