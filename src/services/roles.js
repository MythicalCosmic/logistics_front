// src/services/roles.js

import api from './api'

const BASE = '/admin-api'

export const roleService = {
  list: (params) => api.get(`${BASE}/roles`, { params }).then(r => r.data),
  stats: () => api.get(`${BASE}/roles/stats`).then(r => r.data),
  get: (id) => api.get(`${BASE}/roles/${id}`).then(r => r.data),
  create: (data) => api.post(`${BASE}/roles/create`, data).then(r => r.data),
  update: (id, data) => api.put(`${BASE}/roles/${id}/update`, data).then(r => r.data),
  delete: (id) => api.delete(`${BASE}/roles/${id}/delete`).then(r => r.data),
  assignPermission: (id, permissionId) => api.post(`${BASE}/roles/${id}/permissions`, { permission_id: permissionId }).then(r => r.data),
  removePermission: (id, permissionId) => api.delete(`${BASE}/roles/${id}/permissions/remove`, { data: { permission_id: permissionId } }).then(r => r.data),
  bulkPermissions: (id, permissionIds) => api.post(`${BASE}/roles/${id}/permissions/bulk`, { permission_ids: permissionIds }).then(r => r.data),
  listPermissions: () => api.get(`${BASE}/permissions`).then(r => r.data),
}
