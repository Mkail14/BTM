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
      <label for="slab-length">Longueur</label>
      <div class="input-group">
        <input
          id="slab-length"
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
      <label for="slab-width">Largeur</label>
      <div class="input-group">
        <input
          id="slab-width"
          type="number"
          min="0"
          step="0.1"
          placeholder="5"
          :class="{ 'has-error': fieldError('width') }"
          :value="modelValue.width"
          @input="update('width', $event.target.value)"
        />
        <span class="unit">m</span>
      </div>
      <p v-if="fieldError('width')" class="field-error">{{ fieldError('width') }}</p>
    </div>

    <div class="field">
      <label for="slab-thickness">Épaisseur de la dalle</label>
      <div class="input-group">
        <input
          id="slab-thickness"
          type="number"
          min="0"
          step="1"
          placeholder="15"
          :class="{ 'has-error': fieldError('thickness') }"
          :value="modelValue.thickness"
          @input="update('thickness', $event.target.value)"
        />
        <span class="unit">cm</span>
      </div>
      <p class="field-hint">Généralement entre 12 et 20 cm selon l'usage.</p>
      <p v-if="fieldError('thickness')" class="field-error">{{ fieldError('thickness') }}</p>
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
