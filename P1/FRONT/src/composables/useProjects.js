import { ref } from 'vue'
import { getAllProjects, saveProject, removeProject } from '../services/storage/projectStorage.js'

/**
 * Composable CRUD pour les projets sauvegardés (page Dashboard).
 * Wrappe services/storage/projectStorage.js avec un état réactif.
 */
export function useProjects() {
  const projects = ref(getAllProjects())

  function refresh() {
    projects.value = getAllProjects()
  }

  function save(name, result, supplierId = null, customSupplierName = '') {
    const project = saveProject({ name, result, supplierId, customSupplierName })
    refresh()
    return project
  }

  function remove(id) {
    removeProject(id)
    refresh()
  }

  return { projects, refresh, save, remove }
}
