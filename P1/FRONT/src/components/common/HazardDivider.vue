<template>
  <div class="hazard-strip" role="presentation" aria-hidden="true" />
</template>

<style scoped>
.hazard-strip {
  position: relative;
  height: 14px;
  background: repeating-linear-gradient(
    90deg,
    var(--color-yellow) 0 24px,
    var(--color-black) 24px 48px
  );
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.12);
}
</style>
