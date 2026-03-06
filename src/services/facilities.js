// src/services/facilities.js

import api from './api'

const BASE = '/admin-api'

export const facilityService = {
  list: (params) => api.get(`${BASE}/facilities`, { params }).then(r => r.data),
  stats: () => api.get(`${BASE}/facilities/stats`).then(r => r.data),
  get: (id) => api.get(`${BASE}/facilities/${id}`).then(r => r.data),
  create: (data) => api.post(`${BASE}/facilities/create`, data).then(r => r.data),
  update: (id, data) => api.put(`${BASE}/facilities/${id}/update`, data).then(r => r.data),
  delete: (id) => api.delete(`${BASE}/facilities/${id}/delete`).then(r => r.data),
}
