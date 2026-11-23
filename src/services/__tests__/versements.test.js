/** IBAN et sommes dues : ce qui touche à l'argent des versements BTM */
import { describe, it, expect } from 'vitest'
import { ibanValide, bicValide, masquerIban, prochainVersement, montantAVerser } from '../versements.js'

describe('IBAN', () => {
  it('accepte un IBAN valide, avec ou sans espaces', () => {
    expect(ibanValide('FR76 3000 6000 0112 3456 7890 189')).toBe(true)
    expect(ibanValide('fr7630006000011234567890189')).toBe(true)
  })
  it('refuse une faute de frappe', () => {
    expect(ibanValide('FR76 3000 6000 0112 3456 7890 188')).toBe(false)
    expect(ibanValide('')).toBe(false)
  })
  it('masque le numéro', () => {
    expect(masquerIban('FR7630006000011234567890189')).toBe('FR76 •••• •••• •••• 0189')
  })
  it('contrôle le BIC', () => {
    expect(bicValide('BNPAFRPP')).toBe(true)
    expect(bicValide('BNPAFRPPXXX')).toBe(true)
    expect(bicValide('BNP')).toBe(false)
  })
})

describe('Versements', () => {
  it('reste dû = encaissé − déjà versé, jamais négatif', () => {
    expect(montantAVerser([{ revenu_btm: 10.5 }, { revenu_btm: '4.25' }], [{ montant: 5 }])).toBe(9.75)
    expect(montantAVerser([{ revenu_btm: 5 }], [{ montant: 20 }])).toBe(0)
  })
  it('prochaine date mensuelle', () => {
    const d = prochainVersement({ frequence: 'mensuelle', jour: 5 }, new Date(2026, 9, 19))
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 10, 5])
  })
  it('prochaine date trimestrielle (janvier, avril, juillet, octobre)', () => {
    const d = prochainVersement({ frequence: 'trimestrielle', jour: 5 }, new Date(2026, 9, 19))
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2027, 0, 5])
  })
})
