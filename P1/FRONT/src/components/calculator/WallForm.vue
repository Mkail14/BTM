<script setup>
const props = defineProps({
  modelValue: { type: Object, required: true },
  fieldError: { type: Function, required: true }
})
const emit = defineEmits(['update:modelValue'])

function update(field, value) {
  emit('update:modelValue', { ...props.modelValue, [field]: value })
}
</script>

<template>
  <div class="form-grid">
    <div class="field">
      <label for="wall-length">Longueur du mur</label>
      <div class="input-group">
        <input
          id="wall-length"
          type="number"
          min="0"
          step="0.1"
          placeholder="10"
          :class="{ 'has-error': fieldError('length') }"
          :value="modelValue.length"
          @input="update('length', $event.target.value)"
        />
        <span class="unit">m</span>
      </div>
      <p v-if="fieldError('length')" class="field-error">{{ fieldError('length') }}</p>
    </div>

    <div class="field">
      <label for="wall-height">Hauteur du mur</label>
      <div class="input-group">
        <input
          id="wall-height"
          type="number"
          min="0"
          step="0.1"
          placeholder="2"
          :class="{ 'has-error': fieldError('height') }"
          :value="modelValue.height"
          @input="update('height', $event.target.value)"
        />
        <span class="unit">m</span>
      </div>
      <p v-if="fieldError('height')" class="field-error">{{ fieldError('height') }}</p>
    </div>

    <div class="field">
      <label for="wall-thickness">Épaisseur</label>
      <select
        id="wall-thickness"
        :class="{ 'has-error': fieldError('thickness') }"
        :value="modelValue.thickness"
        @change="update('thickness', $event.target.value)"
      >
        <option value="" disabled>Choisir…</option>
        <option value="15">15 cm</option>
        <option value="20">20 cm</option>
      </select>
      <p v-if="fieldError('thickness')" class="field-error">{{ fieldError('thickness') }}</p>
    </div>

    <div class="field">
      <label for="wall-openings">Ouvertures (portes, fenêtres)</label>
      <div class="input-group">
        <input
          id="wall-openings"
          type="number"
          min="0"
          step="0.1"
          placeholder="0"
          :class="{ 'has-error': fieldError('openings') }"
          :value="modelValue.openings"
          @input="update('openings', $event.target.value)"
        />
        <span class="unit">m²</span>
      </div>
      <p class="field-hint">Surface totale à déduire du mur (optionnel).</p>
      <p v-if="fieldError('openings')" class="field-error">{{ fieldError('openings') }}</p>
    </div>
  </div>
</template>

<style scoped>
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 24px;
}

@media (max-width: 560px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
