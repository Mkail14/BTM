import { apiGet, apiPost, apiPut } from './apiClient.js'

export function getMaterials() {
  return apiGet('/materials')
}

export function getLaborSettings() {
  return apiGet('/labor-settings')
}

export function getDeliverySettings() {
  return apiGet('/delivery-settings')
}

export function getCalculationSettings() {
  return apiGet('/calculation-settings')
}

export function updateCalculationSettings(config) {
  return apiPut('/calculation-settings', { config })
}

export function getAdminHistory() {
  return apiGet('/admin-history')
}

export function addAdminHistory(action, message) {
  return apiPost('/admin-history', { action, message })
}

export function updateMaterial(id, payload) {
  return apiPut(`/materials/${id}`, payload)
}

export function updateLaborSetting(id, payload) {
  return apiPut(`/labor-settings/${id}`, payload)
}

export function updateDeliverySetting(id, payload) {
  return apiPut(`/delivery-settings/${id}`, payload)
}