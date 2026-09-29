# BTM — FRONT (Vue 3 + Vite → Vercel)

Interface de la plateforme BTM. Voir le README racine pour la présentation complète.

```bash
npm install
cp .env.example .env     # clés publiques Supabase (optionnel : mode local sinon)
npm run dev              # développement (http://localhost:5173)
npm run build            # production → dist/
```

Déploiement Vercel : Root Directory `FRONT`, framework Vite, variables `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`.
