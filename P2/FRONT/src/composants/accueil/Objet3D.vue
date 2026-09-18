<script setup>
/**
 * Objet3D — petite maquette CSS 3D isométrique par type de projet :
 * mur (parpaings), dalle (plaque + treillis), fondation (tranchée + semelle), terrasse (carrelage + garde-corps).
 * Tourne légèrement au survol du parent (.objet3d-hote:hover).
 */
defineProps({ type: { type: String, required: true }, taille: { type: Number, default: 120 } })

const cube = (w, d, h, x, y, z, c) => ({ '--w': w + 'px', '--d': d + 'px', '--h': h + 'px', '--x': x + 'px', '--y': y + 'px', '--z': z + 'px', '--c': c })

const parpaings = []
for (let r = 0; r < 4; r++) {
  const dec = r % 2
  for (let c = 0; c < 3; c++) parpaings.push(cube(26, 14, 13, c * 27 + dec * 13 - 40, r * 13, -7, '#cbd5e1'))
}
const carreaux = []
for (let x = 0; x < 4; x++) for (let z = 0; z < 3; z++) carreaux.push(cube(18, 18, 3, x * 19 - 38, 10, z * 19 - 28, x % 2 === z % 2 ? '#e2e8f0' : '#cfd8e3'))
</script>

<template>
  <div class="objet3d" :style="{ width: taille + 'px', height: taille + 'px' }" aria-hidden="true">
    <div class="o-monde">
      <div class="o-sol"></div>

      <!-- MUR -->
      <template v-if="type === 'mur'">
        <div class="o-bloc" :style="cube(90, 30, 5, -45, -5, -15, '#94a3b8')"><div class="f haut"></div><div class="f avant"></div><div class="f droite"></div></div>
        <div v-for="(p, i) in parpaings" :key="i" class="o-bloc" :style="p"><div class="f haut"></div><div class="f avant"></div><div class="f droite"></div></div>
      </template>

      <!-- DALLE -->
      <template v-else-if="type === 'dalle'">
        <div class="o-bloc" :style="cube(90, 70, 6, -45, -6, -35, '#64748b')"><div class="f haut"></div><div class="f avant"></div><div class="f droite"></div></div>
        <div class="o-treillis"></div>
        <div class="o-bloc o-transp" :style="cube(90, 70, 10, -45, 4, -35, '#94a3b8')"><div class="f haut"></div><div class="f avant"></div><div class="f droite"></div></div>
      </template>

      <!-- FONDATION -->
      <template v-else-if="type === 'fondation'">
        <div class="o-bloc" :style="cube(100, 80, 8, -50, -8, -40, '#8b6b4a')"><div class="f haut o-terre"></div><div class="f avant"></div><div class="f droite"></div></div>
        <div class="o-bloc" :style="cube(70, 24, 22, -35, -6, -12, '#94a3b8')"><div class="f haut"></div><div class="f avant"></div><div class="f droite"></div></div>
        <div v-for="i in 3" :key="i" class="o-barre" :style="{ '--i': i }"></div>
      </template>

      <!-- TERRASSE -->
      <template v-else>
        <div class="o-bloc" :style="cube(80, 60, 10, -40, 0, -30, '#94a3b8')"><div class="f haut"></div><div class="f avant"></div><div class="f droite"></div></div>
        <div v-for="(c, i) in carreaux" :key="i" class="o-bloc" :style="c"><div class="f haut"></div><div class="f avant"></div><div class="f droite"></div></div>
        <div v-for="i in 4" :key="'g'+i" class="o-poteau" :style="{ '--i': i }"></div>
        <div class="o-rambarde"></div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.objet3d { position: relative; perspective: 600px; flex-shrink: 0; }
.o-monde { position: absolute; left: 50%; top: 62%; width: 0; height: 0; transform-style: preserve-3d;
  transform: rotateX(-30deg) rotateY(40deg); transition: transform .8s cubic-bezier(.22,.61,.36,1); }
:global(.objet3d-hote:hover) .o-monde { transform: rotateX(-24deg) rotateY(62deg); }
.o-sol { position: absolute; width: 140px; height: 120px; left: -70px; top: -60px; transform: rotateX(90deg) translateZ(-2px);
  background-image: linear-gradient(rgba(103,232,249,.25) 1px, transparent 1px), linear-gradient(90deg, rgba(103,232,249,.25) 1px, transparent 1px);
  background-size: 14px 14px; mask-image: radial-gradient(ellipse at center, #000 40%, transparent 80%); }
.o-bloc { position: absolute; transform-style: preserve-3d; width: var(--w); height: var(--h);
  transform: translate3d(var(--x), calc(-1 * var(--y) - var(--h)), var(--z)); }
.f { position: absolute; background: var(--c); border: 1px solid rgba(15,23,42,.35); box-sizing: border-box; }
.f.avant { width: var(--w); height: var(--h); filter: brightness(.9); }
.f.haut { width: var(--w); height: var(--d); transform: rotateX(90deg); transform-origin: top; filter: brightness(1.12); }
.f.droite { width: var(--d); height: var(--h); left: var(--w); transform: rotateY(90deg); transform-origin: left; filter: brightness(.75); }
.o-transp .f { opacity: .55; }
.o-treillis { position: absolute; width: 84px; height: 64px; left: -42px; transform: translate3d(0, -7px, -32px) rotateX(90deg); transform-origin: top;
  background-image: linear-gradient(#0e7490 2px, transparent 2px), linear-gradient(90deg, #0e7490 2px, transparent 2px); background-size: 12px 12px; }
.o-terre { background: repeating-linear-gradient(45deg, #8b6b4a 0 4px, #7a5c3f 4px 8px) !important; }
.o-barre { position: absolute; width: 3px; height: 34px; background: #0e7490; left: calc(-30px + var(--i) * 22px); transform: translate3d(0, -34px, 0); box-shadow: 0 0 4px rgba(34,211,238,.6); }
.o-poteau { position: absolute; width: 3px; height: 26px; background: #334155; transform: translate3d(calc(-40px + (var(--i) - 1) * 26px), -36px, -30px); }
.o-rambarde { position: absolute; width: 80px; height: 2px; background: #334155; transform: translate3d(-40px, -36px, -30px); }
</style>
