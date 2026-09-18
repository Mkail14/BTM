<script setup>
import { useRouter } from 'vue-router'
import { PROJECT_TYPES } from '../../data/projectTypes.js'
import logo1 from '../../assets/logo1.png'
import logo2 from '../../assets/logo2.png'
import logo3 from '../../assets/logo3.png'
import logoSvg from '../../assets/logo.svg'

const router = useRouter()

const trustItems = [
  { name: 'My_Cult', logo: logo2 },
  { name: 'Kaza jeune', logo: logo3 },
  { name: 'My home', logo: logoSvg },
  { name: 'Dispositif d accompagnement', logo: logo1 }
]

function goToCalculator(typeId) {
  router.push({ path: '/calculateur', query: { type: typeId } })
}
</script>

<template>
  <section class="project-types">
    <div class="container">
      <header class="section-heading">
        <span class="eyebrow">Types de projets</span>
        <h2 class="section-title section-title--light">Quatre formules, un même moteur</h2>
      </header>

      <p class="section-sub">Chaque type de chantier garde ses propres ratios de matériaux et de main-d’œuvre, intégrés dans le même moteur de calcul.</p>

      <div class="type-grid">
        <button
          v-for="type in PROJECT_TYPES"
          :key="type.id"
          type="button"
          class="type-card"
          @click="goToCalculator(type.id)"
        >
          <svg v-if="type.icon === 'wall'" viewBox="0 0 64 64" class="type-icon">
            <rect x="6" y="10" width="24" height="14" fill="none" stroke="currentColor" stroke-width="2.5" />
            <rect x="30" y="10" width="24" height="14" fill="none" stroke="currentColor" stroke-width="2.5" />
            <rect x="18" y="24" width="24" height="14" fill="none" stroke="currentColor" stroke-width="2.5" />
            <rect x="6" y="38" width="24" height="14" fill="none" stroke="currentColor" stroke-width="2.5" />
            <rect x="30" y="38" width="24" height="14" fill="none" stroke="currentColor" stroke-width="2.5" />
          </svg>

          <svg v-else-if="type.icon === 'slab'" viewBox="0 0 64 64" class="type-icon">
            <rect x="6" y="26" width="52" height="12" fill="none" stroke="currentColor" stroke-width="2.5" />
            <line x1="10" y1="38" x2="18" y2="46" stroke="currentColor" stroke-width="2" />
            <line x1="20" y1="38" x2="28" y2="46" stroke="currentColor" stroke-width="2" />
            <line x1="30" y1="38" x2="38" y2="46" stroke="currentColor" stroke-width="2" />
            <line x1="40" y1="38" x2="48" y2="46" stroke="currentColor" stroke-width="2" />
            <line x1="50" y1="38" x2="56" y2="44" stroke="currentColor" stroke-width="2" />
          </svg>

          <svg v-else-if="type.icon === 'foundation'" viewBox="0 0 64 64" class="type-icon">
            <line x1="4" y1="24" x2="60" y2="24" stroke="currentColor" stroke-width="2" stroke-dasharray="3 3" />
            <path d="M14 24 L22 24 L22 38 L42 38 L42 24 L50 24 L50 46 L14 46 Z" fill="none" stroke="currentColor" stroke-width="2.5" />
          </svg>

          <svg v-else viewBox="0 0 64 64" class="type-icon">
            <rect x="6" y="16" width="52" height="34" fill="none" stroke="currentColor" stroke-width="2.5" />
            <line x1="6" y1="29" x2="58" y2="29" stroke="currentColor" stroke-width="1.4" />
            <line x1="6" y1="42" x2="58" y2="42" stroke="currentColor" stroke-width="1.4" />
            <line x1="24" y1="16" x2="24" y2="50" stroke="currentColor" stroke-width="1.4" />
            <line x1="42" y1="16" x2="42" y2="50" stroke="currentColor" stroke-width="1.4" />
          </svg>

          <h3>{{ type.shortLabel }}</h3>
          <p>{{ type.description }}</p>
          <span class="type-card__cta">Calculer <span aria-hidden="true">→</span></span>
        </button>
      </div>

      <div class="trust-bar">
        <p class="trust-label">Les structures qui nous font confiance</p>
        <div class="trust-marquee" aria-label="Structures de confiance">
          <div class="trust-track">
            <div v-for="groupIndex in 4" :key="`trust-group-${groupIndex}`" class="trust-group">
              <div v-for="(item, index) in trustItems" :key="`${item.name}-${groupIndex}-${index}`" class="trust-badge">
                <img :src="item.logo" :alt="`${item.name} logo`" class="trust-badge__logo" />
                <span>{{ item.name }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.project-types {
  position: relative;
  isolation: isolate;
  min-height: calc(100vh - var(--header-h));
  display: flex;
  align-items: center;
  padding-top: 48px;
  padding-bottom: 40px;
  overflow: hidden;
}

.project-types::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  background-image:
    linear-gradient(180deg, rgba(9, 17, 31, 0.38), rgba(9, 17, 31, 0.8)),
    url('../../assets/background.jpg');
  background-size: cover;
  background-position: center center;
  background-repeat: no-repeat;
  filter: blur(4px) brightness(0.72);
  transform: scale(1.05);
}

.container {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.type-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 18px;
  margin-top: 30px;
}

.type-card {
  text-align: left;
  padding: 24px 20px;
  cursor: pointer;
  transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
  font-family: inherit;
  min-height: 220px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 18px;
}

.type-card:hover {
  transform: translateY(-3px);
  border-color: rgba(251, 191, 36, 0.55);
  box-shadow: 0 16px 42px rgba(15, 23, 42, 0.24);
}

.type-icon {
  width: 42px;
  height: 42px;
  color: var(--color-yellow);
  margin-bottom: 16px;
}

.type-card h3 {
  font-size: 1.05rem;
  margin-bottom: 8px;
  color: var(--text-on-dark);
}

.type-card p {
  font-size: 0.88rem;
  color: rgba(244, 243, 239, 0.75);
  margin-bottom: 16px;
  min-height: 46px;
}

.type-card__cta {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--color-yellow);
}

.trust-bar {
  margin-top: 28px;
  padding-top: 18px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.trust-label {
  margin: 0 0 12px;
  color: rgba(244, 243, 239, 0.72);
  font-size: 0.75rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  font-family: var(--font-mono);
}

.trust-marquee {
  width: 100vw;
  margin-left: calc(50% - 50vw);
  overflow: hidden;
  position: relative;
  padding: 6px 0;
  mask-image: linear-gradient(90deg, transparent 0%, #000 8%, #000 92%, transparent 100%);
}

.trust-track {
  display: flex;
  width: max-content;
  gap: 14px;
  animation: trust-scroll 24s linear infinite;
  will-change: transform;
}

.trust-group {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-shrink: 0;
}

@keyframes trust-scroll {
  from { transform: translateX(0); }
  to { transform: translateX(-25%); }
}

.trust-badge {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px 10px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: var(--text-on-dark);
  font-size: 0.72rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  white-space: nowrap;
  flex-shrink: 0;
}

.trust-badge__logo {
  display: inline-block;
  width: 42px;
  height: 42px;
  border-radius: 12px;
  object-fit: cover;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
}


@media (max-width: 980px) {
  .type-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 620px) {
  .type-grid {
    grid-template-columns: 1fr;
  }
}
</style>
