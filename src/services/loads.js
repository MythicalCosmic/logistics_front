// src/services/loads.js

import api from './api'

const BASE = '/admin-api'
const ANALYTICS = '/admins-api'

export const loadService = {
  list: (params) => api.get(`${BASE}/loads`, { params }).then(r => r.data),
  stats: () => api.get(`${BASE}/loads/stats`).then(r => r.data),
  get: (id) => api.get(`${BASE}/loads/${id}`).then(r => r.data),
  create: (data) => api.post(`${BASE}/loads/create`, data).then(r => r.data),
  update: (id, data) => api.put(`${BASE}/loads/${id}/update`, data).then(r => r.data),
  cancel: (id) => api.post(`${BASE}/loads/${id}/cancel`).then(r => r.data),
  updateStatus: (id, status) => api.post(`${BASE}/loads/${id}/status`, { status }).then(r => r.data),

  // Analytics (admins-api prefix)
  analyticsOverview: () => api.get(`${ANALYTICS}/analytics/overview`).then(r => r.data),
  loadFrequency: (params) => api.get(`${ANALYTICS}/analytics/loads/frequency`, { params }).then(r => r.data),
}
