<script setup>
/** État vide (ER04 / ER05) */
defineProps({
  icone: { type: String, default: 'fa-regular fa-folder-open' },
  titre: { type: String, required: true },
  message: { type: String, default: '' }
})
</script>

<template>
  <section class="etat-vide" role="status">
    <div class="etat-vide-icone"><i :class="icone" aria-hidden="true"></i></div>
    <h3>{{ titre }}</h3>
    <p v-if="message">{{ message }}</p>
    <div v-if="$slots.default" class="etat-vide-actions"><slot /></div>
  </section>
</template>

<style scoped>
.etat-vide {
  text-align: center; padding: 56px 24px; background: var(--blanc); border: 1px dashed var(--gris-300);
  border-radius: var(--rayon-lg); animation: apparaitre .5s ease;
}
.etat-vide-icone {
  width: 84px; height: 84px; margin: 0 auto 18px; border-radius: 50%; display: grid; place-items: center;
  background: var(--beton-clair); color: var(--ardoise-3); font-size: 1.8rem;
}
h3 { font-size: 1.6rem; color: var(--ardoise); margin-bottom: 8px; }
p { color: var(--texte-secondaire); max-width: 420px; margin: 0 auto; }
.etat-vide-actions { margin-top: 24px; display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
</style>
