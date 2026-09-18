const express = require('express')
const cors = require('cors')
const { supabase, isSupabaseConfigured } = require('./db')
const adminRoutes = require('./routes/admin')

const app = express()
const PORT = 3000

const fallbackMaterials = [
  { id: 1, label: 'Parpaing creux 15 cm', unit: 'unité', unit_price: 1.05, category: 'maçonnerie' },
  { id: 2, label: 'Parpaing creux 20 cm', unit: 'unité', unit_price: 1.25, category: 'maçonnerie' },
  { id: 3, label: 'Ciment (sac 25 kg)', unit: 'sac', unit_price: 9.5, category: 'liant' },
  { id: 4, label: 'Sable de construction', unit: 'tonne', unit_price: 55, category: 'granulat' },
  { id: 5, label: 'Gravier / gravillon', unit: 'tonne', unit_price: 60, category: 'granulat' },
  { id: 6, label: 'Treillis soudé', unit: 'panneau', unit_price: 28, category: 'ferraillage' },
  { id: 7, label: 'Fer à béton HA12', unit: 'barre', unit_price: 9, category: 'ferraillage' },
  { id: 8, label: 'Fil de ligature', unit: 'bobine', unit_price: 6.5, category: 'ferraillage' },
  { id: 9, label: 'Revêtement terrasse', unit: 'm²', unit_price: 25, category: 'finition' },
  { id: 10, label: 'Colle carrelage', unit: 'sac', unit_price: 18, category: 'finition' },
  { id: 11, label: 'Joint de carrelage', unit: 'sac', unit_price: 11, category: 'finition' }
]

const fallbackLabor = [
  { id: 1, project_type: 'mur', daily_rate: 150, productivity: 12 },
  { id: 2, project_type: 'dalle', daily_rate: 150, productivity: 15 },
  { id: 3, project_type: 'fondation', daily_rate: 150, productivity: 9 },
  { id: 4, project_type: 'terrasse', daily_rate: 150, productivity: 10 }
]

const fallbackDelivery = [{ id: 1, base_price: 70, per_tonne: 14 }]

const fallbackCalculationConfig = {
  materialMultiplier: 1,
  laborMultiplier: 1,
  deliveryMultiplier: 1,
  wasteRate: 0.05,
  profitMargin: 0.1,
  updatedAt: new Date().toISOString()
}

const adminHistory = [
  {
    id: 1,
    action: 'Initialisation',
    message: 'Paramétrage initial du moteur de calcul chargé.',
    createdAt: new Date().toISOString()
  }
]

function normalizeMaterial(item) {
  return {
    id: Number(item.id),
    label: item.label,
    unit: item.unit,
    unit_price: Number(item.unit_price),
    category: item.category
  }
}

function normalizeLabor(item) {
  return {
    id: Number(item.id),
    project_type: item.project_type,
    daily_rate: Number(item.daily_rate),
    productivity: Number(item.productivity)
  }
}

function normalizeDelivery(item) {
  return {
    id: Number(item.id),
    base_price: Number(item.base_price),
    per_tonne: Number(item.per_tonne)
  }
}

function hasSupabaseConnection() {
  return isSupabaseConfigured && Boolean(supabase)
}

function pushHistory(action, message) {
  adminHistory.unshift({
    id: Date.now() + Math.random(),
    action,
    message,
    createdAt: new Date().toISOString()
  })

  if (adminHistory.length > 12) {
    adminHistory.length = 12
  }
}

app.use(cors())
app.use(express.json())
app.use('/api/admin', adminRoutes)

app.get('/api/test', (req, res) => {
  res.json({ message: 'API BTM fonctionne !' })
})

app.get('/api/database-test', async (req, res) => {
  if (!hasSupabaseConnection()) {
    return res.json({ success: true, database: 'supabase-not-configured' })
  }

  try {
    const { data, error } = await supabase.from('profiles').select('id').limit(1)

    if (error) {
      throw error
    }

    res.json({
      success: true,
      database: 'supabase-connected',
      rows: data || []
    })
  } catch (error) {
    console.error('Erreur Supabase :', error.message)
    res.status(500).json({
      success: false,
      message: 'Impossible de contacter Supabase.'
    })
  }
})

app.get('/api/materials', async (req, res) => {
  if (!hasSupabaseConnection()) {
    return res.json(fallbackMaterials)
  }

  try {
    const { data, error } = await supabase.from('materials').select('*')

    if (error) {
      throw error
    }

    res.json(data || fallbackMaterials)
  } catch (error) {
    console.error('Erreur materials :', error.message)
    res.json(fallbackMaterials)
  }
})

app.put('/api/materials/:id', async (req, res) => {
  const id = Number(req.params.id)
  const { label, unit, unit_price, category } = req.body

  if (!id || !label || !unit || unit_price === undefined || !category) {
    return res.status(400).json({
      success: false,
      message: 'Toutes les informations du matériau sont obligatoires'
    })
  }

  if (!hasSupabaseConnection()) {
    const index = fallbackMaterials.findIndex((item) => item.id === id)
    const updated = normalizeMaterial({ id, label, unit, unit_price, category })

    if (index === -1) {
      fallbackMaterials.push(updated)
    } else {
      fallbackMaterials[index] = updated
    }

    return res.json(updated)
  }

  try {
    const { data, error } = await supabase
      .from('materials')
      .update({ label, unit, unit_price: Number(unit_price), category })
      .eq('id', id)
      .select()

    if (error) {
      throw error
    }

    res.json((data && data[0]) || { id, label, unit, unit_price: Number(unit_price), category })
  } catch (error) {
    console.error('Erreur modification material :', error.message)
    const index = fallbackMaterials.findIndex((item) => item.id === id)
    const updated = normalizeMaterial({ id, label, unit, unit_price, category })

    if (index === -1) {
      fallbackMaterials.push(updated)
    } else {
      fallbackMaterials[index] = updated
    }

    res.json(updated)
  }
})

app.get('/api/labor-settings', async (req, res) => {
  if (!hasSupabaseConnection()) {
    return res.json(fallbackLabor)
  }

  try {
    const { data, error } = await supabase.from('labor_settings').select('*')

    if (error) {
      throw error
    }

    res.json(data || fallbackLabor)
  } catch (error) {
    console.error('Erreur labor :', error.message)
    res.json(fallbackLabor)
  }
})

app.put('/api/labor-settings/:id', async (req, res) => {
  const id = Number(req.params.id)
  const { project_type, daily_rate, productivity } = req.body

  if (!id || !project_type || daily_rate === undefined || productivity === undefined) {
    return res.status(400).json({
      success: false,
      message: 'Les paramètres de main-d’œuvre sont incomplets.'
    })
  }

  if (!hasSupabaseConnection()) {
    const index = fallbackLabor.findIndex((item) => item.id === id)
    const updated = normalizeLabor({ id, project_type, daily_rate, productivity })

    if (index === -1) {
      fallbackLabor.push(updated)
    } else {
      fallbackLabor[index] = updated
    }

    return res.json(updated)
  }

  try {
    const { data, error } = await supabase
      .from('labor_settings')
      .update({ project_type, daily_rate: Number(daily_rate), productivity: Number(productivity) })
      .eq('id', id)
      .select()

    if (error) {
      throw error
    }

    res.json((data && data[0]) || { id, project_type, daily_rate: Number(daily_rate), productivity: Number(productivity) })
  } catch (error) {
    console.error('Erreur modification labor :', error.message)
    const index = fallbackLabor.findIndex((item) => item.id === id)
    const updated = normalizeLabor({ id, project_type, daily_rate, productivity })

    if (index === -1) {
      fallbackLabor.push(updated)
    } else {
      fallbackLabor[index] = updated
    }

    res.json(updated)
  }
})

app.get('/api/delivery-settings', async (req, res) => {
  if (!hasSupabaseConnection()) {
    return res.json(fallbackDelivery)
  }

  try {
    const { data, error } = await supabase.from('delivery_settings').select('*')

    if (error) {
      throw error
    }

    res.json(data || fallbackDelivery)
  } catch (error) {
    console.error('Erreur delivery :', error.message)
    res.json(fallbackDelivery)
  }
})

app.put('/api/delivery-settings/:id', async (req, res) => {
  const id = Number(req.params.id)
  const { base_price, per_tonne } = req.body

  if (!id || base_price === undefined || per_tonne === undefined) {
    return res.status(400).json({
      success: false,
      message: 'Les paramètres de livraison sont incomplets.'
    })
  }

  if (!hasSupabaseConnection()) {
    const index = fallbackDelivery.findIndex((item) => item.id === id)
    const updated = normalizeDelivery({ id, base_price, per_tonne })

    if (index === -1) {
      fallbackDelivery.push(updated)
    } else {
      fallbackDelivery[index] = updated
    }

    return res.json(updated)
  }

  try {
    const { data, error } = await supabase
      .from('delivery_settings')
      .update({ base_price: Number(base_price), per_tonne: Number(per_tonne) })
      .eq('id', id)
      .select()

    if (error) {
      throw error
    }

    res.json((data && data[0]) || { id, base_price: Number(base_price), per_tonne: Number(per_tonne) })
  } catch (error) {
    console.error('Erreur modification delivery :', error.message)
    const index = fallbackDelivery.findIndex((item) => item.id === id)
    const updated = normalizeDelivery({ id, base_price, per_tonne })

    if (index === -1) {
      fallbackDelivery.push(updated)
    } else {
      fallbackDelivery[index] = updated
    }

    res.json(updated)
  }
})

app.get('/api/calculation-settings', async (req, res) => {
  if (!hasSupabaseConnection()) {
    return res.json({
      labor: fallbackLabor,
      delivery: fallbackDelivery[0],
      config: fallbackCalculationConfig
    })
  }

  try {
    const [laborResult, deliveryResult] = await Promise.all([
      supabase.from('labor_settings').select('*'),
      supabase.from('delivery_settings').select('*').eq('id', 1)
    ])

    if (laborResult.error) throw laborResult.error
    if (deliveryResult.error) throw deliveryResult.error

    res.json({
      labor: laborResult.data || fallbackLabor,
      delivery: (deliveryResult.data && deliveryResult.data[0]) || fallbackDelivery[0],
      config: fallbackCalculationConfig
    })
  } catch (error) {
    console.error('Erreur calculation :', error.message)
    res.json({
      labor: fallbackLabor,
      delivery: fallbackDelivery[0],
      config: fallbackCalculationConfig
    })
  }
})

app.put('/api/calculation-settings', async (req, res) => {
  const { config } = req.body || {}

  if (!config || typeof config !== 'object') {
    return res.status(400).json({
      success: false,
      message: 'Le bloc de configuration est obligatoire.'
    })
  }

  const nextConfig = {
    materialMultiplier: Number(config.materialMultiplier ?? 1),
    laborMultiplier: Number(config.laborMultiplier ?? 1),
    deliveryMultiplier: Number(config.deliveryMultiplier ?? 1),
    wasteRate: Number(config.wasteRate ?? 0.05),
    profitMargin: Number(config.profitMargin ?? 0.1),
    updatedAt: new Date().toISOString()
  }

  Object.assign(fallbackCalculationConfig, nextConfig)
  pushHistory('Calcul', `Moteur de calcul mis à jour : matériaux x${nextConfig.materialMultiplier}, main d'œuvre x${nextConfig.laborMultiplier}, livraison x${nextConfig.deliveryMultiplier}.`)

  res.json({
    success: true,
    config: fallbackCalculationConfig
  })
})

app.get('/api/admin-history', async (req, res) => {
  res.json(adminHistory)
})

app.post('/api/admin-history', async (req, res) => {
  const { action, message } = req.body || {}

  if (!action || !message) {
    return res.status(400).json({
      success: false,
      message: 'Action et message requis.'
    })
  }

  pushHistory(action, message)
  res.status(201).json({
    success: true,
    item: adminHistory[0]
  })
})

app.listen(PORT, () => {
  console.log('Serveur BTM demarre sur http://localhost:' + PORT)
})
