// src/services/users.js

import api from './api'

const BASE = '/admins-api'

export const userService = {
  list: (params) => api.get(`${BASE}/users`, { params }).then(r => r.data),
  stats: () => api.get(`${BASE}/users/stats`).then(r => r.data),
  get: (id) => api.get(`${BASE}/users/${id}`).then(r => r.data),
  create: (data) => api.post(`${BASE}/users/create`, data).then(r => r.data),
  update: (id, data) => api.put(`${BASE}/users/${id}/update`, data).then(r => r.data),
  delete: (id, force = false) => api.delete(`${BASE}/users/${id}/delete`, { data: { force } }).then(r => r.data),
  toggleActive: (id, force = false) => api.post(`${BASE}/users/${id}/toggle-active`, { force }).then(r => r.data),
  changePassword: (id, data) => api.post(`${BASE}/users/${id}/change-password`, data).then(r => r.data),
  forceLogout: (id, force = false) => api.post(`${BASE}/users/${id}/force-logout`, { force }).then(r => r.data),
  sessions: (id) => api.get(`${BASE}/users/${id}/sessions`).then(r => r.data),
  assignRole: (userId, roleId) => api.post(`${BASE}/users/${userId}/roles`, { role_id: roleId }).then(r => r.data),
  removeRole: (userId, roleId) => api.delete(`${BASE}/users/${userId}/roles/remove`, { data: { role_id: roleId } }).then(r => r.data),

  // Roles (for forms/filters)
  listRoles: () => api.get(`${BASE}/roles`).then(r => r.data),
}
