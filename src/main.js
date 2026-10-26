import { createApp } from 'vue'
import App from './App.vue'
import routeur from './routeur'
import { chargerContenus } from './composables/useContenuSite.js'
import { chargerTypesProjets } from './services/supabase/serviceTypesProjets.js'
import { avancerChargement } from './composables/useEcranChargement.js'
import { suivreFluidite } from './composables/useAppareil.js'
// Polices et icônes servies par le site lui-même : aucune requête vers Google Fonts ou un CDN
// (pas d'adresse IP des visiteurs transmise à un tiers, et un affichage plus rapide)
import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-500.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/inter/latin-700.css'
import '@fontsource/barlow-condensed/latin-500.css'
import '@fontsource/barlow-condensed/latin-600.css'
import '@fontsource/barlow-condensed/latin-700.css'
import '@fontsource/barlow-condensed/latin-800.css'
import '@fontsource/jetbrains-mono/latin-500.css'
import '@fontsource/jetbrains-mono/latin-600.css'
import '@fortawesome/fontawesome-free/css/all.min.css'
import './style.css'

// Textes et constantes pilotés depuis /admin : chargés en parallèle, les valeurs locales s'affichent en attendant
chargerContenus()
chargerTypesProjets()

// Rechargement : la page repart du haut au lieu de reprendre la position du défilement
// (le routeur garde, lui, la position des retours en arrière : scrollBehavior dans routeur/index.js)
if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
window.scrollTo(0, 0)

avancerChargement(0.35) // scripts du site chargés : la ligne de l'écran de chargement avance
createApp(App).use(routeur).mount('#app')
suivreFluidite() // appareil qui saccade : le site passe en rendu léger (composables/useAppareil.js)
