import { createApp } from 'vue'
import App from './App.vue'
import routeur from './routeur'
import { chargerContenus } from './composables/useContenuSite.js'
import { chargerTypesProjets } from './services/supabase/serviceTypesProjets.js'
import './style.css'

// Textes et constantes pilotés depuis /admin : chargés en parallèle, les valeurs locales s'affichent en attendant
chargerContenus()
chargerTypesProjets()

createApp(App).use(routeur).mount('#app')
