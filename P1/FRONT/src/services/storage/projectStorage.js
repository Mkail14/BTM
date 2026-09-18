/**
 * Service de persistance des projets sauvegardés.
 *
 * Implémentation actuelle : localStorage (pas de backend disponible, voir
 * 00_START_HERE.md). L'interface publique (getAll / save / remove / getById)
 * est volontairement la même forme qu'aurait un futur service basé sur
 * services/api/apiClient.js, pour pouvoir remplacer l'implémentation par de
 * vrais appels API sans toucher aux composants qui l'utilisent.
 */
const STORAGE_KEY = 'btm.savedProjects'

export function getAllProjects() {
  return readAll().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}

export function getProjectById(id) {
  return readAll().find((project) => project.id === id) || null
}

export function saveProject({ name, result, supplierId = null, customSupplierName = '' }) {
  const projects = readAll()
  const project = {
    id: generateId(),
    name: name?.trim() || defaultName(result),
    projectType: result.projectType,
    result,
    supplierId,
    customSupplierName: customSupplierName?.trim() || '',
    createdAt: new Date().toISOString()
  }
  projects.push(project)
  writeAll(projects)
  return project
}

export function removeProject(id) {
  const projects = readAll().filter((project) => project.id !== id)
  writeAll(projects)
}

function defaultName(result) {
  const labels = { mur: 'Mur', dalle: 'Dalle', fondation: 'Fondation', terrasse: 'Terrasse' }
  const date = new Date().toLocaleDateString('fr-FR')
  return `${labels[result.projectType] || 'Projet'} du ${date}`
}

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function writeAll(projects) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects))
  } catch {
    // Quota dépassé ou stockage indisponible : on échoue silencieusement,
    // l'appelant (useProjects) garde son propre état réactif à jour.
  }
}

function generateId() {
  return `proj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}
