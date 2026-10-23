/**
 * Calculs du calculateur : quantités et prix sur des cas calculés à la main (prix de référence de donnees/materiaux.js).
 * Si un test échoue après un changement de formule ou de prix, c'est voulu : vérifiez le nouveau chiffre, puis
 * mettez le test à jour en connaissance de cause.
 */
import { describe, it, expect } from 'vitest'
import { calculerEstimation, validerDimensions, appliquerCodePromo, normaliserResultat, MESSAGES } from '../moteurCalculs.js'

const ligne = (r, id) => r.lignes.find((l) => l.id === id)

describe('Dalle', () => {
  // 6 × 5 m, 12 cm : 30 m², 3,6 m³ — le cas de la simulation « particulier pressé » (1 827,60 €)
  const r = calculerEstimation('dalle', { longueur: 6, largeur: 5, epaisseur: 12 })

  it('calcule surface et volume', () => {
    expect(r.mesures.find((m) => m.principale).valeur).toBe(30)
    expect(r.mesures.find((m) => m.unite === 'm³').valeur).toBe(3.6)
  })
  it('donne les quantités de matériaux', () => {
    expect(ligne(r, 'beton').quantite).toBe(8.64) // 3,6 m³ × 2,4 t/m³
    expect(ligne(r, 'ferraillage').quantite).toBe(150) // 30 m² × 5 kg/m²
    expect(ligne(r, 'gravier').quantite).toBe(2.88) // 3,6 m³ × 0,8 t/m³
  })
  it('donne le prix des matériaux seuls', () => {
    expect(r.total).toBe(1827.6)
    expect(r.totalMateriaux).toBe(1827.6)
    expect(r.fraisService).toBeUndefined() // le client ne paie aucun frais BTM
  })
  it('accepte la virgule décimale', () => {
    expect(calculerEstimation('dalle', { longueur: '6,0', largeur: '5', epaisseur: '12' }).total).toBe(1827.6)
  })
})

describe('Mur', () => {
  // 10 × 2,5 m, 3 m² d'ouvertures : 22 m² nets
  const r = calculerEstimation('mur', { longueur: 10, hauteur: 2.5, ouvertures: 3 })

  it('retire les ouvertures', () => {
    expect(r.mesures.find((m) => m.principale).valeur).toBe(22)
  })
  it('arrondit les parpaings et les sacs à l’unité supérieure', () => {
    expect(ligne(r, 'parpaing').quantite).toBe(289) // 22 / 0,08 × 1,05 = 288,75
    expect(ligne(r, 'ciment').quantite).toBe(9) // 22 / 2,5 = 8,8
    expect(ligne(r, 'sable').quantite).toBe(2.2) // 22 / 10
  })
  it('donne le prix', () => {
    expect(r.total).toBe(870.6) // 289 × 1,90 + 9 × 12,50 + 2,2 × 95
  })
  it('additionne plusieurs murs', () => {
    const deux = calculerEstimation('mur', { longueur: 10, hauteur: 2.5, ouvertures: 3, autresMurs: [{ longueur: 4, hauteur: 2.5, ouvertures: 0 }] })
    expect(deux.mesures.find((m) => m.principale).valeur).toBe(32)
    expect(ligne(deux, 'parpaing').quantite).toBe(420) // 32 / 0,08 × 1,05
  })
})

describe('Fondation', () => {
  // tranchée 10 m × 0,5 m × 0,6 m = 3 m³
  const r = calculerEstimation('fondation', { longueur: 10, largeur: 0.5, profondeur: 0.6 })
  it('donne béton armé et acier', () => {
    expect(ligne(r, 'beton_arme').quantite).toBe(7.2)
    expect(ligne(r, 'acier').quantite).toBe(150)
    expect(r.total).toBe(1506) // 7,2 × 155 + 150 × 2,60
  })
})

describe('Terrasse', () => {
  // 5 × 4 m, 10 cm, finition béton lissé
  const r = calculerEstimation('terrasse', { longueur: 5, largeur: 4, epaisseur: 10 })
  it('reprend la dalle et ajoute la finition', () => {
    expect(ligne(r, 'beton').quantite).toBe(4.8)
    expect(ligne(r, 'beton_lisse').quantite).toBe(20)
    expect(r.total).toBe(1352) // 696 + 220 + 136 + 300
  })
})

describe('Carrelage', () => {
  it('au prix moyen du catalogue', () => {
    const r = calculerEstimation('carrelage', { longueur: 5, largeur: 4, format: '60x60', carreau: 'standard' })
    expect(ligne(r, 'carrelage_sol').quantite).toBe(22) // 20 m² + 10 %
    expect(ligne(r, 'colle_carrelage').quantite).toBe(4) // 100 kg en sacs de 25 kg
    expect(ligne(r, 'joint_carrelage').quantite).toBe(10)
    expect(r.mesures.find((m) => m.label.startsWith('Nombre de carreaux')).valeur).toBe(62) // 22 / 0,36 = 61,1
    expect(r.total).toBe(759) // 22 × 30 + 4 × 16 + 10 × 3,50
  })
  it('avec un modèle de fournisseur, au carreau entier', () => {
    const carreau = { id: 'm1', nom: 'Gris clair', format: '60x60', prix: 4.5 }
    const r = calculerEstimation('carrelage', { longueur: 5, largeur: 4, format: '60x60', carreau })
    expect(ligne(r, 'carreau:m1')).toMatchObject({ quantite: 62, prixUnitaire: 4.5, sousTotal: 279 })
  })
  it('avec un modèle vendu au carton, en cartons entiers', () => {
    const carreau = { id: 'm1', nom: 'Armani Grey', format: '60x60', prix: 16, parCarton: 4 }
    const r = calculerEstimation('carrelage', { longueur: 5, largeur: 4, format: '60x60', carreau })
    expect(ligne(r, 'carreau:m1')).toMatchObject({ unite: 'carton', quantite: 16, prixUnitaire: 16, sousTotal: 256 }) // 62 carreaux → 16 cartons
  })
  it('ignore un modèle d’un autre format', () => {
    const carreau = { id: 'm1', nom: 'Gris clair', format: '30x30', prix: 1.2 }
    const r = calculerEstimation('carrelage', { longueur: 5, largeur: 4, format: '60x60', carreau })
    expect(ligne(r, 'carreau:m1')).toBeUndefined()
    expect(ligne(r, 'carrelage_sol')).toBeDefined()
  })
})

describe('Prix des fournisseurs', () => {
  it('remplace le prix de référence', () => {
    const catalogue = { beton: { id: 'beton', libelle: 'Béton', unite: 't', prixUnitaire: 100 } }
    const r = calculerEstimation('dalle', { longueur: 6, largeur: 5, epaisseur: 12 }, { catalogue })
    expect(ligne(r, 'beton').sousTotal).toBe(864)
    expect(r.total).toBe(864 + 330 + 244.8)
  })
})

describe('Validation des dimensions', () => {
  it('refuse un champ vide, nul ou négatif', () => {
    const { valide, erreurs } = validerDimensions('dalle', { longueur: '', largeur: 0, epaisseur: -2 })
    expect(valide).toBe(false)
    expect(erreurs.longueur).toBe(MESSAGES.obligatoire)
    expect(erreurs.largeur).toBe(MESSAGES.nombreInvalide)
    expect(erreurs.epaisseur).toBe(MESSAGES.nombreInvalide)
  })
  it('refuse des ouvertures plus grandes que le mur', () => {
    const { erreurs } = validerDimensions('mur', { longueur: 2, hauteur: 2, ouvertures: 5 })
    expect(erreurs.ouvertures).toBe(MESSAGES.ouverturesTropGrandes)
  })
  it('accepte zéro ouverture', () => {
    expect(validerDimensions('mur', { longueur: 2, hauteur: 2, ouvertures: 0 }).valide).toBe(true)
  })
  it('refuse une valeur au-delà du maximum', () => {
    expect(validerDimensions('mur', { longueur: 100000, hauteur: 2 }).valide).toBe(false)
  })
  it('ne calcule pas des dimensions invalides', () => {
    expect(() => calculerEstimation('dalle', { longueur: 0, largeur: 5, epaisseur: 12 })).toThrow('Dimensions invalides')
  })
})

describe('Codes promo', () => {
  const base = calculerEstimation('dalle', { longueur: 6, largeur: 5, epaisseur: 12 })
  it('en pourcentage', () => {
    const r = appliquerCodePromo(base, { code: 'DIX', type: 'pourcentage', valeur: 10, portee: 'total' })
    expect(r.remise.montant).toBe(182.76)
    expect(r.total).toBe(1644.84)
  })
  it('en montant, jamais plus que le devis', () => {
    const r = appliquerCodePromo(base, { code: 'GROS', type: 'montant', valeur: 5000, portee: 'total' })
    expect(r.total).toBe(0)
  })
  it('retirer le code rend le prix initial', () => {
    const avec = appliquerCodePromo(base, { code: 'DIX', type: 'pourcentage', valeur: 10, portee: 'total' })
    expect(appliquerCodePromo(avec, null).total).toBe(1827.6)
  })
})

describe('Anciennes estimations enregistrées', () => {
  it('retire main-d’œuvre et livraison du total', () => {
    const ancien = { totalMateriaux: 1000, mainOeuvre: 400, livraison: 80, total: 1480 }
    expect(normaliserResultat(ancien).total).toBe(1000)
  })
  it('retire les frais de service payés autrefois par le client', () => {
    const ancien = { totalMateriaux: 1000, sousTotal: 1000, fraisService: { taux: 1.25, montant: 12.5 }, total: 1012.5 }
    expect(normaliserResultat(ancien).total).toBe(1000)
  })
})
