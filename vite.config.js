import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

// https://vitejs.dev/config/
// Trois versions du site (lues par src/composables/useOuverture.js) :
//  - en-ligne : déploiement de production Vercel (btm.yt) ;
//  - develop  : prévisualisation Vercel (branche develop ou autre branche que main) ;
//  - local    : npm run dev / build sur l'ordinateur.
const ENVIRONNEMENT = process.env.VERCEL_ENV === 'production' ? 'en-ligne' : process.env.VERCEL_ENV === 'preview' ? 'develop' : 'local'

export default defineConfig({
  plugins: [vue()],
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
