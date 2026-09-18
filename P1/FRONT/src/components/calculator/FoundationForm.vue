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
      <label for="foundation-length">Longueur de la fondation</label>
      <div class="input-group">
        <input
          id="foundation-length"
          type="number"
          min="0"
          step="0.1"
          placeholder="20"
          :class="{ 'has-error': fieldError('length') }"
          :value="modelValue.length"
          @input="update('length', $event.target.value)"
        />
        <span class="unit">m</span>
      </div>
      <p class="field-hint">Longueur totale de la tranchée (linéaire).</p>
      <p v-if="fieldError('length')" class="field-error">{{ fieldError('length') }}</p>
    </div>

    <div class="field">
      <label for="foundation-width">Largeur de tranchée</label>
      <div class="input-group">
        <input
          id="foundation-width"
          type="number"
          min="0"
          step="1"
          placeholder="40"
          :class="{ 'has-error': fieldError('width') }"
          :value="modelValue.width"
          @input="update('width', $event.target.value)"
        />
        <span class="unit">cm</span>
      </div>
      <p v-if="fieldError('width')" class="field-error">{{ fieldError('width') }}</p>
    </div>

    <div class="field">
      <label for="foundation-depth">Profondeur</label>
      <div class="input-group">
        <input
          id="foundation-depth"
          type="number"
          min="0"
          step="0.1"
          placeholder="0.6"
          :class="{ 'has-error': fieldError('depth') }"
          :value="modelValue.depth"
          @input="update('depth', $event.target.value)"
        />
        <span class="unit">m</span>
      </div>
      <p v-if="fieldError('depth')" class="field-error">{{ fieldError('depth') }}</p>
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
