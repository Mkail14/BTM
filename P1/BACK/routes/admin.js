const express = require('express')
const { supabase, isSupabaseConfigured } = require('../db')
const { verifyJwt, requireRole, adminRateLimiter } = require('../middlewares/authAdmin')

const router = express.Router()

function hasSupabaseConnection() {
  return isSupabaseConfigured && Boolean(supabase)
}

function fallbackOverview() {
  return {
    totalProjects: 186,
    totalClients: 54,
    activeSuppliers: 12,
    totalMaterials: 18,
    topMaterials: [
      { label: 'Ciment (sac 25 kg)', usageCount: 132 },
      { label: 'Parpaing creux 20 cm', usageCount: 118 },
      { label: 'Gravier / gravillon', usageCount: 94 },
      { label: 'Treillis soudé', usageCount: 76 }
    ],
    recentActivity: [
      { label: 'Moteur de calcul mis à jour', time: 'Il y a 2 h' },
      { label: 'Nouveau client inscrit', time: 'Il y a 4 h' },
      { label: 'Prix matériau modifié', time: 'Aujourd’hui' }
    ]
  }
}

async function query(table, select = '*', filters = []) {
  if (!hasSupabaseConnection()) {
    return []
  }

  try {
    let request = supabase.from(table).select(select)

    for (const [column, operator, value] of filters) {
      request = request.filter(column, operator, value)
    }

    const { data, error } = await request

    if (error) {
      throw error
    }

    return data || []
  } catch (error) {
    console.error('Erreur Supabase admin :', error.message)
    return []
  }
}

router.use(verifyJwt)
router.use(requireRole('admin'))
router.use(adminRateLimiter)

router.get('/stats', async (req, res) => {
  if (!hasSupabaseConnection()) {
    return res.json(fallbackOverview())
  }

  try {
    const [totalProjects, totalClients, activeSuppliers, totalMaterials, topMaterials] = await Promise.all([
      query('projects', 'count', []),
      query('adherants', 'count', []),
      query('suppliers', 'count', [['is_active', 'eq', true]]),
      query('materials', 'count', []),
      query('project_items', 'material_id, materials(label)', [])
    ])

    const payload = {
      totalProjects: Number(totalProjects?.[0]?.count || 0),
      totalClients: Number(totalClients?.[0]?.count || 0),
      activeSuppliers: Number(activeSuppliers?.[0]?.count || 0),
      totalMaterials: Number(totalMaterials?.[0]?.count || 0),
      topMaterials: (topMaterials || []).map((row) => ({
        label: row.materials?.label || 'Matériau',
        usageCount: 0
      })),
      recentActivity: [
        { label: 'Moteur de calcul mis à jour', time: 'Il y a 2 h' },
        { label: 'Nouveau client inscrit', time: 'Il y a 4 h' },
        { label: 'Prix matériau modifié', time: 'Aujourd’hui' }
      ]
    }

    res.json(payload)
  } catch (error) {
    console.error('Erreur stats admin :', error.message)
    res.status(500).json({
      success: false,
      message: 'Impossible de charger les statistiques.'
    })
  }
})

router.get('/materials', async (req, res) => {
  if (!hasSupabaseConnection()) {
    return res.json([
      { id: 1, label: 'Ciment (sac 25 kg)', category: 'liant', unit: 'sac', unit_price: 9.5, is_active: true },
      { id: 2, label: 'Parpaing creux 20 cm', category: 'maçonnerie', unit: 'unité', unit_price: 1.25, is_active: true },
      { id: 3, label: 'Gravier / gravillon', category: 'granulat', unit: 'tonne', unit_price: 60, is_active: true }
    ])
  }

  try {
    const rows = await query('materials', 'id, label, category, unit, unit_price, is_active', [])
    res.json(rows)
  } catch (error) {
    console.error('Erreur listing matériaux admin :', error.message)
    res.status(500).json({
      success: false,
      message: 'Impossible de récupérer les matériaux.'
    })
  }
})

router.put('/materials/:id/price', async (req, res) => {
  const { id } = req.params
  const { unit_price } = req.body || {}

  if (!id || unit_price === undefined || Number.isNaN(Number(unit_price))) {
    return res.status(400).json({
      success: false,
      message: 'Le prix du matériau est invalide.'
    })
  }

  const normalizedPrice = Number(unit_price)

  if (!hasSupabaseConnection()) {
    return res.json({
      success: true,
      id: Number(id),
      unit_price: normalizedPrice,
      message: 'Prix enregistré en mode fallback local.'
    })
  }

  try {
    const { data, error } = await supabase
      .from('materials')
      .update({ unit_price: normalizedPrice })
      .eq('id', Number(id))
      .select('id, label, unit, category, unit_price')

    if (error) {
      throw error
    }

    res.json({
      success: true,
      material: (data && data[0]) || null
    })
  } catch (error) {
    console.error('Erreur mise à jour prix :', error.message)
    res.status(500).json({
      success: false,
      message: 'Impossible de mettre à jour le prix.'
    })
  }
})

router.get('/clients', async (req, res) => {
  if (!hasSupabaseConnection()) {
    return res.json([
      {
        id: 1,
        name: 'Sonia Martin',
        email: 'sonia@example.com',
        role: 'client',
        created_at: '2026-08-12T10:00:00Z',
        projectCount: 3
      },
      {
        id: 2,
        name: 'Nicolas Dupont',
        email: 'nicolas@example.com',
        role: 'client',
        created_at: '2026-08-09T08:30:00Z',
        projectCount: 2
      }
    ])
  }

  try {
    const rows = await query('adherants', 'id, email, created_at, nom, prenom', [])
    res.json((rows || []).map((row) => ({
      id: row.id,
      name: `${row.nom || ''} ${row.prenom || ''}`.trim() || 'Client',
      email: row.email,
      role: 'client',
      created_at: row.created_at,
      projectCount: 0
    })))
  } catch (error) {
    console.error('Erreur listing clients admin :', error.message)
    res.status(500).json({
      success: false,
      message: 'Impossible de récupérer les clients.'
    })
  }
})

module.exports = router
