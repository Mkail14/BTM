import { createApp } from 'vue'
import App from './App.vue'
import routeur from './routeur'
import { chargerContenus } from './composables/useContenuSite.js'
import { chargerTypesProjets } from './services/supabase/serviceTypesProjets.js'
// Polices et icônes servies par le site lui-même : aucune requête vers Google Fonts ou un CDN
// (pas d'adresse IP des visiteurs transmise à un tiers, et un affichage plus rapide)
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/barlow-condensed/500.css'
import '@fontsource/barlow-condensed/600.css'
import '@fontsource/barlow-condensed/700.css'
import '@fontsource/barlow-condensed/800.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/jetbrains-mono/600.css'
import '@fortawesome/fontawesome-free/css/all.min.css'
import './style.css'

// Textes et constantes pilotés depuis /admin : chargés en parallèle, les valeurs locales s'affichent en attendant
chargerContenus()
chargerTypesProjets()

createApp(App).use(routeur).mount('#app')
