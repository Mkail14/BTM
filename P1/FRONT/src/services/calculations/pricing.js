import { getCalculationSettings, getMaterials } from '../../services/api/settingsApi.js'
import { DELIVERY, LABOR, MATERIALS } from '../../data/materials.js'

let materialsCache = null
let settingsCache = null
let dataLoadingPromise = null

const MATERIAL_IDS = {
  parpaing15: 1,
  parpaing20: 2,
  ciment: 3,
  sable: 4,
  gravier: 5,
  treillisSoude: 6,
  ferBeton: 7,
  ligature: 8,
  revetementTerrasse: 9,
  colleCarrelage: 10,
  jointCarrelage: 11
}

const fallbackMaterials = Object.entries(MATERIALS).map(([key, material]) => ({
  id: MATERIAL_IDS[key],
  label: material.label,
  unit: material.unit,
  unit_price: material.unitPrice
}))

const fallbackSettings = {
  labor: Object.entries(LABOR.productivity).map(([project_type, productivity], index) => ({
    id: index + 1,
    project_type,
    daily_rate: LABOR.dailyRate,
    productivity
  })),
  delivery: {
    base_price: DELIVERY.base,
    per_tonne: DELIVERY.perTonne
  },
  config: {
    materialMultiplier: 1,
    laborMultiplier: 1,
    deliveryMultiplier: 1,
    wasteRate: 0.05,
    profitMargin: 0.1
  }
}

export function invalidateCalculationCache() {
  materialsCache = null
  settingsCache = null
  dataLoadingPromise = null
}

async function loadData() {
  if (materialsCache && settingsCache) return

  if (!dataLoadingPromise) {
    dataLoadingPromise = Promise.all([getMaterials(), getCalculationSettings()])
      .then(([materials, settings]) => {
        materialsCache = materials
        settingsCache = settings
      })
      .catch(() => {
        materialsCache = fallbackMaterials
        settingsCache = fallbackSettings
      })
      .finally(() => {
        dataLoadingPromise = null
      })
  }

  await dataLoadingPromise
}

export function getCalculationConfig() {
  const config = settingsCache?.config || {
    materialMultiplier: 1,
    laborMultiplier: 1,
    deliveryMultiplier: 1,
    wasteRate: 0.05,
    profitMargin: 0.1
  }

  return {
    materialMultiplier: Number(config.materialMultiplier ?? 1),
    laborMultiplier: Number(config.laborMultiplier ?? 1),
    deliveryMultiplier: Number(config.deliveryMultiplier ?? 1),
    wasteRate: Number(config.wasteRate ?? 0.05),
    profitMargin: Number(config.profitMargin ?? 0.1)
  }
}

export function applyProfitMargin(value) {
  const config = getCalculationConfig()
  return round2(Number(value || 0) * (1 + config.profitMargin))
}

export async function lineItem(key, quantity) {
  await loadData()

  const material = materialsCache.find((item) => {
    return Number(item.id) === MATERIAL_IDS[key]
  })

  if (!material) {
    throw new Error(`Matériau inconnu : "${key}"`)
  }

  const qty = Math.max(0, quantity)
  const config = getCalculationConfig()
  const qtyWithWaste = qty * (1 + config.wasteRate)
  const baseSubtotal = qtyWithWaste * Number(material.unit_price)
  const adjustedSubtotal = baseSubtotal * config.materialMultiplier

  return {
    key,
    label: material.label,
    unit: material.unit,
    quantity: round2(qtyWithWaste),
    unitPrice: Number(material.unit_price),
    subtotal: round2(adjustedSubtotal)
  }
}

export function sumMaterials(items) {
  return round2(items.reduce((total, item) => total + item.subtotal, 0))
}

export async function estimateDelivery(totalWeightTonnes) {
  await loadData()

  const extra = Math.max(0, totalWeightTonnes - 1)
  const base = Number(settingsCache.delivery.base_price)
  const perTonne = Number(settingsCache.delivery.per_tonne)
  const config = getCalculationConfig()

  return round2((base + extra * perTonne) * config.deliveryMultiplier)
}

export async function estimateLabor(projectTypeId, workQuantity) {
  await loadData()

  const setting = settingsCache.labor.find(
    (item) => item.project_type === projectTypeId
  )

  if (!setting) {
    throw new Error(`Paramètres de main-d'œuvre inconnus : "${projectTypeId}"`)
  }

  const dailyOutput = Number(setting.productivity)
  const dailyRate = Number(setting.daily_rate)
  const config = getCalculationConfig()

  const days = Math.max(0.5, roundHalf(workQuantity / dailyOutput))
  const total = days * dailyRate * config.laborMultiplier

  return {
    days,
    dailyRate,
    total: round2(total)
  }
}

export function round2(value) {
  return Math.round(value * 100) / 100
}

export function roundHalf(value) {
  return Math.round(value * 2) / 2
}
