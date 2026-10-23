import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

// https://vitejs.dev/config/
// Trois versions du site (lues par src/composables/useOuverture.js) :
//  - en-ligne : déploiement de production Vercel (btm.yt) ;
//  - develop  : prévisualisation Vercel (branche develop ou autre branche que main) ;
//  - local    : npm run dev / build sur l'ordinateur.
const ENVIRONNEMENT = process.env.VERCEL_ENV === 'production' ? 'en-ligne' : process.env.VERCEL_ENV === 'preview' ? 'develop' : 'local'

// Police du grand titre de l'accueil (Barlow Condensed 700, alphabet latin) demandée dès la lecture de la page :
// sans cela, le navigateur ne la découvre qu'une fois le site affiché et le titre attend un téléchargement de plus.
const prechargerPoliceTitre = {
  name: 'precharger-police-titre',
  transformIndexHtml(html, ctx) {
    const police = Object.keys(ctx.bundle || {}).find((f) => /barlow-condensed-latin-700-normal.*\.woff2$/.test(f))
    if (!police) return
    return [{ tag: 'link', attrs: { rel: 'preload', as: 'font', type: 'font/woff2', href: `/${police}`, crossorigin: '' }, injectTo: 'head' }]
  }
}

export default defineConfig({
  plugins: [vue(), prechargerPoliceTitre],
  define: { __ENVIRONNEMENT__: JSON.stringify(ENVIRONNEMENT) },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: { port: 5173, host: true },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        // jspdf n'est pas listé : importé à la demande (services/export), il a déjà son propre bloc. Le nommer ici y
        // rangeait aussi des outils partagés avec le site, et ses 420 Ko étaient téléchargés à chaque ouverture.
        manualChunks: {
          vendor: ['vue', 'vue-router'],
          supabase: ['@supabase/supabase-js']
        }
      }
    }
  }
})
