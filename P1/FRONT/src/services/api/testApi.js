import { getMaterials } from './settingsApi.js'

getMaterials()
  .then((materials) => {
    console.log('MATÉRIAUX DEPUIS MARIA DB :', materials)
  })
  .catch((error) => {
    console.error('ERREUR API :', error)
  })