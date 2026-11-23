// Tests d'attaque contre la base (schema.sql + toutes les migrations), en local sur PGlite.
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { creerBase, comme } from './base.mjs'

const A = '00000000-0000-0000-0000-00000000000a' // client
const B = '00000000-0000-0000-0000-00000000000b' // attaquant
const S = '00000000-0000-0000-0000-00000000000c' // compte fournisseur
const ADM = '00000000-0000-0000-0000-0000000000ad'
const F = '00000000-0000-0000-0000-0000000000f1'
let db

const refuse = async (promesse, motif) => {
  await assert.rejects(promesse, (e) => { if (motif) assert.match(e.message, motif); return true })
}

before(async () => {
  db = await creerBase()
  await db.exec(`
    insert into auth.users (id, email) values ('${A}', 'client@exemple.fr'), ('${B}', 'pirate@exemple.fr'),
      ('${S}', 'achat@quincaillerie.yt'), ('${ADM}', 'admin@btm.yt');
    insert into public.categories_fournisseurs (id, libelle) values ('quincaillerie', 'Quincaillerie') on conflict do nothing;
    insert into public.types_projets (id, libelle) values ('mur', 'Mur') on conflict do nothing;
    insert into public.fournisseurs (id, slug, nom, categorie_id, commune, telephone) values ('${F}', 'quinc', 'Quinc', 'quincaillerie', 'Mamoudzou', '0269000000');
    select set_config('request.jwt.claim.role', 'service_role', false);
    update public.profils set role = 'fournisseur', fournisseur_id = '${F}' where id = '${S}';
    update public.profils set role = 'admin' where id = '${ADM}';
    select set_config('request.jwt.claim.role', '', false);
  `)
})

test('un compte ne peut plus écrire une autre adresse e-mail dans son profil', async () => {
  await refuse(comme(db, B, `update public.profils set email = 'futur@fournisseur.yt' where id = '${B}'`), /e-mail/)
  await refuse(comme(db, B, `update public.profils set email = 'contact@btm.yt' where id = '${B}'`), /e-mail/)
  const r = await comme(db, B, `update public.profils set nom_affiche = 'Bob' where id = '${B}' returning nom_affiche`)
  assert.equal(r.rows[0].nom_affiche, 'Bob')
})

test("l'adresse du profil suit celle de la connexion", async () => {
  await db.exec(`update auth.users set email = 'nouvelle@exemple.fr' where id = '${A}'`)
  const r = await db.query(`select email from public.profils where id = $1`, [A])
  assert.equal(r.rows[0].email, 'nouvelle@exemple.fr')
})

test("l'admin (clé service) peut toujours changer l'adresse du profil", async () => {
  await comme(db, 'service', `update public.profils set email = 'modifie@exemple.fr' where id = '${A}'`)
  // éditeur SQL de Supabase (aucun jeton) : l'admin garde la main
  await db.exec(`update public.profils set email = 'nouvelle@exemple.fr' where id = '${A}'`)
})

test('un compte ne peut ni se donner un rôle ni se déclarer pro vérifié', async () => {
  await refuse(comme(db, B, `update public.profils set role = 'admin' where id = '${B}'`), /administrateurs/)
  await refuse(comme(db, B, `update public.profils set fournisseur_id = '${F}' where id = '${B}'`), /administrateurs/)
  await refuse(comme(db, B, `update public.profils set pro_statut = 'verifie' where id = '${B}'`), /BTM/)
  await comme(db, B, `select public.demander_verification_pro('Ma Société', '12345678901234')`)
  const r = await db.query(`select pro_statut from public.profils where id = $1`, [B])
  assert.equal(r.rows[0].pro_statut, 'en_attente')
})

test("un compte ne lit pas le profil, les projets ni les paiements d'un autre", async () => {
  await comme(db, A, `insert into public.projets (utilisateur_id, nom, type_projet_id, dimensions, resultat) values ('${A}', 'Mur A', 'mur', '{}', '{"lignes":[]}')`)
  assert.equal((await comme(db, B, `select * from public.profils where id = '${A}'`)).rows.length, 0)
  assert.equal((await comme(db, B, `select * from public.projets where utilisateur_id = '${A}'`)).rows.length, 0)
  const maj = await comme(db, B, `update public.projets set nom = 'pirate' where utilisateur_id = '${A}' returning id`)
  assert.equal(maj.rows.length, 0)
  await refuse(comme(db, B, `insert into public.projets (utilisateur_id, nom, type_projet_id, dimensions, resultat) values ('${A}', 'x', 'mur', '{}', '{}')`))
  await refuse(comme(db, B, `insert into public.paiements (projet_nom, montant_devis) values ('faux', 1)`))
  await refuse(comme(db, B, `insert into public.credits_fidelite (utilisateur_id, montant, libelle) values ('${B}', 1000, 'cadeau')`))
})

test('un anonyme ne lit ni les profils, ni les paiements, ni les codes promo', async () => {
  for (const t of ['profils', 'paiements', 'codes_promo', 'projets', 'credits_fidelite', 'journal_operations', 'reversements']) {
    assert.equal((await comme(db, null, `select * from public.${t}`)).rows.length, 0, t)
  }
  await refuse(comme(db, null, `select public.trouver_devis_par_code('ABCD-EFGH')`))
  await refuse(comme(db, null, `select * from public.cles_assistant()`))
})

test('code de retrait : 30 codes faux par 10 minutes, puis refus', async () => {
  const code = (await db.query(`select code_retrait from public.projets where utilisateur_id = $1`, [A])).rows[0].code_retrait
  const bon = await comme(db, S, `select public.trouver_devis_par_code($1) as d`, [code])
  assert.equal(bon.rows[0].d.nom, 'Mur A')
  for (let i = 0; i < 30; i++) {
    const r = await comme(db, S, `select public.trouver_devis_par_code($1) as d`, [`ZZZZ${String(i).padStart(4, '0')}`])
    assert.equal(r.rows[0].d, null)
  }
  await refuse(comme(db, S, `select public.trouver_devis_par_code('ZZZZ9999')`), /Trop de codes faux/)
  await refuse(comme(db, S, `select public.trouver_devis_par_code($1)`, [code]), /Trop de codes faux/)
})

test("réalisation : la photo doit être celle déposée dans le stockage du compte", async () => {
  const id = (await db.query(`insert into public.realisations (utilisateur_id, statut) values ($1, 'proposee') returning id`, [B])).rows[0].id
  await refuse(comme(db, B, `update public.realisations set photo_url = 'https://pirate.example/x.jpg', photo_chemin = '${B}/x.jpg' where id = '${id}'`), /Photo/)
  await refuse(comme(db, B, `update public.realisations set photo_url = 'https://x.supabase.co/storage/v1/object/public/realisations/${A}/x.jpg', photo_chemin = '${A}/x.jpg' where id = '${id}'`), /Photo/)
  const r = await comme(db, B, `update public.realisations set photo_url = 'https://x.supabase.co/storage/v1/object/public/realisations/${B}/x.jpg', photo_chemin = '${B}/x.jpg',
    statut = 'soumise', titre = 'Ma dalle', commune = 'Dembeni', auteur = 'Bob', consentement = true where id = '${id}' returning id`)
  assert.equal(r.rows.length, 1)
})

test('projets : 60 créations par heure et par compte, taille plafonnée', async () => {
  const C = '00000000-0000-0000-0000-0000000000c2'
  await db.exec(`insert into auth.users (id, email) values ('${C}', 'rafale@exemple.fr')`)
  for (let i = 0; i < 60; i++) {
    await comme(db, C, `insert into public.projets (utilisateur_id, nom, type_projet_id, dimensions, resultat) values ('${C}', 'p${i}', 'mur', '{}', '{}')`)
  }
  await refuse(comme(db, C, `insert into public.projets (utilisateur_id, nom, type_projet_id, dimensions, resultat) values ('${C}', 'trop', 'mur', '{}', '{}')`), /Trop de devis/)
  const gros = JSON.stringify({ lignes: Array.from({ length: 30000 }, (_, i) => ({ id: `m${i}`, libelle: 'x'.repeat(20) })) })
  await refuse(comme(db, A, `insert into public.projets (utilisateur_id, nom, type_projet_id, dimensions, resultat) values ('${A}', 'gros', 'mur', '{}', $1::jsonb)`, [gros]), /projets_taille_check/)
})

test('stockage : 20 photos par compte, et jamais dans le dossier d’un autre', async () => {
  await refuse(comme(db, B, `insert into storage.objects (bucket_id, name) values ('realisations', '${A}/vol.jpg')`))
  for (let i = 0; i < 20; i++) await comme(db, B, `insert into storage.objects (bucket_id, name) values ('realisations', '${B}/p${i}.jpg')`)
  await refuse(comme(db, B, `insert into storage.objects (bucket_id, name) values ('realisations', '${B}/p21.jpg')`))
  await refuse(comme(db, B, `insert into storage.objects (bucket_id, name) values ('dossiers-fournisseurs', '${A}/kbis.pdf')`))
  assert.equal((await comme(db, B, `select * from storage.objects where bucket_id = 'dossiers-fournisseurs'`)).rows.length, 0)
})

test('dossier fournisseur : 30 messages par heure, et pas dans le dossier d’un autre', async () => {
  const d = (await db.query(`insert into public.demandes_fournisseur (utilisateur_id, entreprise) values ($1, 'Entreprise B') returning id`, [B])).rows[0].id
  await refuse(comme(db, A, `select public.envoyer_message_dossier('${d}', 'intrus')`), /non autorisée/)
  for (let i = 0; i < 30; i++) await comme(db, B, `select public.envoyer_message_dossier('${d}', 'message ${i}')`)
  await refuse(comme(db, B, `select public.envoyer_message_dossier('${d}', 'de trop')`), /Trop de messages/)
  await comme(db, ADM, `select public.envoyer_message_dossier('${d}', 'réponse BTM')`) // l'admin n'est pas limité
})

test("encaissement : le montant et la commission sont calculés par la base, jamais par le navigateur", async () => {
  await db.exec(`insert into public.materiaux (id, libelle, unite, prix_unitaire) values ('ciment', 'Ciment', 'sac', 10) on conflict (id) do update set prix_unitaire = 10;
                 insert into public.catalogue_fournisseur (fournisseur_id, materiau_id, prix_unitaire) values ('${F}', 'ciment', 12)`)
  const pid = (await comme(db, A, `insert into public.projets (utilisateur_id, nom, type_projet_id, dimensions, resultat, cout_total)
    values ('${A}', 'Dalle', 'mur', '{}', '{"lignes":[{"id":"ciment","libelle":"Ciment","quantite":10,"prixUnitaire":0.01}]}', 0.1) returning id`)).rows[0].id
  // le client ne peut pas encaisser lui-même
  await refuse(comme(db, A, `select public.encaisser_devis('${pid}', '[]', 'especes', null, 1000, null)`), /fournisseur/)
  const p = (await comme(db, S, `select * from public.encaisser_devis('${pid}', '[]', 'especes', null, 1000, null)`)).rows[0]
  assert.equal(Number(p.montant_materiaux), 120) // 10 × 12 € (prix du catalogue), pas 0,01 € venu du devis
  const taux = Number((await db.query(`select taux from public.reglages_commission()`)).rows[0].taux)
  assert.equal(Number(p.commission), Math.round(120 * taux) / 100)
  // rejouer l'encaissement est refusé ; le devis encaissé est figé
  await refuse(comme(db, S, `select public.encaisser_devis('${pid}', '[]', 'especes', null, 1000, null)`), /déjà encaissé/)
  await refuse(comme(db, A, `update public.projets set resultat = '{"lignes":[]}' where id = '${pid}'`), /encaissé/)
  // le client ne peut pas modifier ou supprimer le paiement
  assert.equal((await comme(db, A, `update public.paiements set montant_devis = 0 where projet_id = '${pid}' returning id`)).rows.length, 0)
  assert.equal((await comme(db, S, `delete from public.paiements where projet_id = '${pid}' returning id`)).rows.length, 0)
})
