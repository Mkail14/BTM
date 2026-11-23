import { describe, it, expect, vi } from 'vitest'
vi.mock('@/services/supabase/client.js', () => ({ supabase: {}, supabaseConfigure: false }))
const { appliquerPrixFournisseurs } = await import('@/services/supabase/serviceOffres.js')

const devis = {
  total: 300, totalMateriaux: 300,
  lignes: [
    { id: 'ciment', libelle: 'Ciment', unite: 'sac', quantite: 10, prixUnitaire: 10, sousTotal: 100 },
    { id: 'sable', libelle: 'Sable', unite: 't', quantite: 2, prixUnitaire: 50, sousTotal: 100 },
    { id: 'fer', libelle: 'Fer', unite: 'kg', quantite: 50, prixUnitaire: 2, sousTotal: 100 }
  ]
}
const offre = (prix) => ({ prix, prix_comptoir: prix, disponible: true })
const A = { id: 'a', nom: 'A', materiaux: { ciment: offre(9), sable: offre(60) } }
const B = { id: 'b', nom: 'B', materiaux: { ciment: offre(11), sable: offre(45) } }

describe('Devis avec plusieurs fournisseurs', () => {
  it('chaque matériau au prix du moins cher qui l’a en stock', () => {
    const r = appliquerPrixFournisseurs(devis, [A, B])
    expect(r.lignes[0]).toMatchObject({ prixUnitaire: 9, fournisseurNom: 'A' })
    expect(r.lignes[1]).toMatchObject({ prixUnitaire: 45, fournisseurNom: 'B' })
    expect(r.lignes[2]).toMatchObject({ prixUnitaire: 2, indisponible: true }) // chez aucun : prix de référence
    expect(r.total).toBe(90 + 90 + 100)
  })
  it('un seul fournisseur : comportement habituel', () => {
    const r = appliquerPrixFournisseurs(devis, [A])
    expect(r.lignes[1].prixUnitaire).toBe(60)
    expect(r.prixFournisseur.nom).toBe('A')
  })
  it('aucun fournisseur : devis inchangé', () => {
    expect(appliquerPrixFournisseurs(devis, [])).toBe(devis)
  })
})
