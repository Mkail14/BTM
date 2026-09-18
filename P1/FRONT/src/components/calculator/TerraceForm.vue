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
      <label for="terrace-length">Longueur</label>
      <div class="input-group">
        <input
          id="terrace-length"
          type="number"
          min="0"
          step="0.1"
          placeholder="6"
          :class="{ 'has-error': fieldError('length') }"
          :value="modelValue.length"
          @input="update('length', $event.target.value)"
        />
        <span class="unit">m</span>
      </div>
      <p v-if="fieldError('length')" class="field-error">{{ fieldError('length') }}</p>
    </div>

    <div class="field">
      <label for="terrace-width">Largeur</label>
      <div class="input-group">
        <input
          id="terrace-width"
          type="number"
          min="0"
          step="0.1"
          placeholder="4"
          :class="{ 'has-error': fieldError('width') }"
          :value="modelValue.width"
          @input="update('width', $event.target.value)"
        />
        <span class="unit">m</span>
      </div>
      <p v-if="fieldError('width')" class="field-error">{{ fieldError('width') }}</p>
    </div>

    <div class="field">
      <label for="terrace-thickness">Épaisseur de la dalle</label>
      <div class="input-group">
        <input
          id="terrace-thickness"
          type="number"
          min="0"
          step="1"
          placeholder="10"
          :class="{ 'has-error': fieldError('thickness') }"
          :value="modelValue.thickness"
          @input="update('thickness', $event.target.value)"
        />
        <span class="unit">cm</span>
      </div>
      <p v-if="fieldError('thickness')" class="field-error">{{ fieldError('thickness') }}</p>
    </div>

    <div class="field">
      <label for="terrace-finish">Finition</label>
      <select
        id="terrace-finish"
        :class="{ 'has-error': fieldError('finish') }"
        :value="modelValue.finish"
        @change="update('finish', $event.target.value)"
      >
        <option value="" disabled>Choisir…</option>
        <option value="carrelage">Carrelage extérieur</option>
        <option value="beton_lisse">Béton lissé</option>
      </select>
      <p v-if="fieldError('finish')" class="field-error">{{ fieldError('finish') }}</p>
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
