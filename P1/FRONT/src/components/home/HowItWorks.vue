<script setup>
const steps = [
  {
    num: '01',
    title: 'Choisissez le type de projet',
    text: 'Mur, dalle, fondation ou terrasse : chaque solution a sa formule spécifique.'
  },
  {
    num: '02',
    title: 'Saisissez les dimensions',
    text: 'Longueur, hauteur, épaisseur et quantité : le formulaire s’adapte à votre chantier.'
  },
  {
    num: '03',
    title: 'Obtenez l’estimation',
    text: 'Matériaux, main-d’œuvre et budget total calculés instantanément.'
  },
  {
    num: '04',
    title: 'Comparez les fournisseurs',
    text: 'Trouvez les bons partenaires locaux pour acheter au meilleur prix.'
  }
]

const testimonials = [
  {
    name: 'Amina',
    role: 'Propriétaire, Dzaoudzi',
    text: 'J’ai estimé mon mur en moins de 2 minutes. Très clair et beaucoup plus simple que les devis classiques.'
  },
  {
    name: 'Yacine',
    role: 'Entrepreneur local',
    text: 'Le calcul de matériaux est fiable et me fait gagner du temps sur les chantiers de petite et moyenne envergure.'
  },
  {
    name: 'Nadia',
    role: 'Chef de projet',
    text: 'On voit immédiatement le budget et les quantités. Ça aide vraiment à choisir avant d’acheter.'
  },
  {
    name: 'Moussa',
    role: 'Bricoleur',
    text: 'Le site est très pratique pour planifier une terrasse ou un ouvrage sans se tromper sur les quantités.'
  },
  {
    name: 'Sofia',
    role: 'Gestionnaire de bien',
    text: 'Les estimations sont claires, rapides et surtout utiles pour comparer les fournisseurs locaux.'
  },
  {
    name: 'Karim',
    role: 'Maçon',
    text: 'J’utilise le simulateur pour vérifier les besoins avant d’acheter. C’est un vrai gain de productivité.'
  }
]

</script>

<template>
  <section class="how-it-works">
    <div class="container page-shell">
      <header class="section-heading section-heading--light">
        <span class="eyebrow">Comment ça marche</span>
        <h2 class="section-title section-title--light">Quatre étapes, un budget clair</h2>
      </header>

      <ol class="steps">
        <li v-for="step in steps" :key="step.num" class="step">
          <div class="step__num">{{ step.num }}</div>
          <div class="step__body">
            <h3>{{ step.title }}</h3>
            <p>{{ step.text }}</p>
          </div>
        </li>
      </ol>

      <div class="testimonials">
        <header class="section-heading">
          <span class="eyebrow eyebrow--dark">Ce que les clients disent</span>
          <h2 class="section-title section-title--white">Des avis qui rassurent</h2>
        </header>

        <div class="reviews-marquee marquee-left" aria-label="Témoignages clients">
          <div class="reviews-track">
            <div v-for="groupIndex in 4" :key="`left-group-${groupIndex}`" class="review-group">
              <article v-for="(review, index) in testimonials" :key="`left-${review.name}-${groupIndex}-${index}`" class="review-card">
                <div class="review-card__top">
                  <div class="review-card__author">
                    <span class="review-card__avatar" aria-hidden="true">{{ review.name.charAt(0) }}</span>
                    <div class="review-card__identity">
                      <strong>{{ review.name }}</strong>
                      <span>{{ review.role }}</span>
                    </div>
                  </div>
                  <div class="review-card__stars" aria-label="5 étoiles">★★★★★</div>
                </div>
                <p class="review-card__quote">“{{ review.text }}”</p>
              </article>
            </div>
          </div>
        </div>

        <div class="reviews-marquee marquee-right" aria-label="Témoignages clients 2">
          <div class="reviews-track">
            <div v-for="groupIndex in 4" :key="`right-group-${groupIndex}`" class="review-group">
              <article v-for="(review, index) in testimonials" :key="`right-${review.name}-${groupIndex}-${index}`" class="review-card">
                <div class="review-card__top">
                  <div class="review-card__author">
                    <span class="review-card__avatar" aria-hidden="true">{{ review.name.charAt(0) }}</span>
                    <div class="review-card__identity">
                      <strong>{{ review.name }}</strong>
                      <span>{{ review.role }}</span>
                    </div>
                  </div>
                  <div class="review-card__stars" aria-label="5 étoiles">★★★★★</div>
                </div>
                <p class="review-card__quote">“{{ review.text }}”</p>
              </article>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.how-it-works {
  min-height: calc(100vh - var(--header-h));
  display: flex;
  align-items: center;
  padding: 48px 0 56px;
  background: linear-gradient(180deg, rgba(245, 243, 239, 0.48), rgba(15, 23, 42, 0.28));
}

.page-shell {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 28px;
}

.section-heading {
  margin-bottom: 0;
}

.section-heading h2,
.section-heading h3 {
  margin: 0;
}

.section-heading--light .section-title {
  color: var(--text-on-dark);
}

.steps {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 18px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.step {
  position: relative;
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 22px;
  padding: 22px 18px 18px;
  box-shadow: 0 18px 32px rgba(15, 23, 42, 0.08);
}

.step__num {
  font-family: var(--font-mono);
  font-size: 0.74rem;
  font-weight: 700;
  color: var(--color-violet);
  width: 42px;
  height: 42px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 20px;
  background: rgba(124, 58, 237, 0.08);
  border: 1px solid rgba(124, 58, 237, 0.18);
}

.step__body h3 {
  font-size: 1.04rem;
  margin-bottom: 8px;
  color: var(--text-on-light);
}

.step__body p {
  font-size: 0.86rem;
  color: var(--text-on-light-dim);
  margin: 0;
  line-height: 1.6;
}

.testimonials {
  padding-top: 18px;
  color: var(--text-on-light);
}



.reviews-marquee {
  width: 100vw;
  margin-left: calc(50% - 50vw);
  overflow: hidden;
  position: relative;
  mask-image: linear-gradient(90deg, transparent 0%, #000 8%, #000 92%, transparent 100%);
  padding: 12px 0 6px;
  isolation: isolate;
}

.reviews-track {
  display: flex;
  width: max-content;
  gap: 18px;
  will-change: transform;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
}

.review-group {
  display: flex;
  flex-shrink: 0;
  gap: 18px;
}

.marquee-left .reviews-track {
  animation-name: marquee-left;
  animation-duration: 24s;
}

.marquee-right .reviews-track {
  animation-name: marquee-right;
  animation-duration: 24s;
}

@keyframes marquee-left {
  from {
    transform: translateX(0);
  }
  to {
    transform: translateX(-25%);
  }
}

@keyframes marquee-right {
  from {
    transform: translateX(-25%);
  }
  to {
    transform: translateX(0);
  }
}

.review-card {
  flex: 0 0 auto;
  width: min(360px, 80vw);
  background: rgba(255, 255, 255, 0.68);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  color: var(--text-on-light);
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 20px;
  padding: 18px 18px 16px;
  box-shadow: 0 18px 28px rgba(15, 23, 42, 0.08);
  filter: blur(0.15px);
}

.review-card__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 14px;
}

.review-card__author {
  display: flex;
  align-items: center;
  gap: 10px;
}

.review-card__avatar {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-display);
  font-size: 0.9rem;
  color: var(--color-black);
  background: var(--color-yellow);
}

.review-card__identity {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.review-card__identity strong {
  font-size: 0.9rem;
  color: var(--text-on-light);
}

.review-card__identity span {
  font-size: 0.7rem;
  color: var(--text-on-light-dim);
  font-family: var(--font-mono);
}

.review-card__stars {
  font-size: 0.8rem;
  letter-spacing: 0.12em;
  color: var(--color-yellow-dark);
}

.review-card__quote {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.6;
  color: var(--text-on-light-dim);
}

@media (max-width: 980px) {
  .steps {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 620px) {
  .steps {
    grid-template-columns: 1fr;
  }
}
</style>
