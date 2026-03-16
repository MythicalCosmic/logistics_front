// src/services/loads.js

import api from './api'

const BASE = '/api'
const ADMIN = '/admin-api'

export const loadService = {
  // Loads CRUD
  list: (params) => api.get(`${BASE}/loads`, { params }).then(r => r.data),
  stats: () => api.get(`${BASE}/loads/stats`).then(r => r.data),
  get: (id) => api.get(`${BASE}/loads/${id}`).then(r => r.data),
  create: (data) => api.post(`${BASE}/loads/create`, data).then(r => r.data),
  update: (id, data) => api.put(`${BASE}/loads/${id}/update`, data).then(r => r.data),
  cancel: (id) => api.post(`${BASE}/loads/${id}/cancel`).then(r => r.data),
  updateStatus: (id, status) => api.post(`${BASE}/loads/${id}/status`, { status }).then(r => r.data),
  assign: (id, driver_id) => api.post(`${BASE}/loads/${id}/assign`, { driver_id }).then(r => r.data),
  myLoads: (params) => api.get(`${BASE}/loads/my`, { params }).then(r => r.data),

  // States & Routes
  states: (params) => api.get(`${BASE}/states`, { params }).then(r => r.data),
  routes: (params) => api.get(`${BASE}/routes`, { params }).then(r => r.data),
  routeDetail: (routeId) => api.get(`${BASE}/routes/${routeId}`).then(r => r.data),
  routeLoads: (routeId, params) => api.get(`${BASE}/routes/${routeId}/loads`, { params }).then(r => r.data),
  routeAnalytics: (routeId, params) => api.get(`${BASE}/routes/${routeId}/analytics`, { params }).then(r => r.data),

  // Admin Analytics
  analyticsOverview: (params) => api.get(`${ADMIN}/analytics/overview`, { params }).then(r => r.data),
  loadFrequency: (params) => api.get(`${ADMIN}/analytics/loads/frequency`, { params }).then(r => r.data),
  loadRoutes: (params) => api.get(`${ADMIN}/analytics/loads/routes`, { params }).then(r => r.data),
  loadTrends: (params) => api.get(`${ADMIN}/analytics/loads/trends`, { params }).then(r => r.data),
  loadCompare: (params) => api.get(`${ADMIN}/analytics/loads/compare`, { params }).then(r => r.data),

  // Admin States
  adminStates: (params) => api.get(`${ADMIN}/states`, { params }).then(r => r.data),
  adminStateDetail: (abbr, params) => api.get(`${ADMIN}/states/${abbr}`, { params }).then(r => r.data),
  adminStateAnalytics: (abbr, params) => api.get(`${ADMIN}/states/${abbr}/analytics`, { params }).then(r => r.data),

  // Activity Logs
  activityLogs: (params) => api.get(`${ADMIN}/activity-logs`, { params }).then(r => r.data),
  activityLog: (id) => api.get(`${ADMIN}/activity-logs/${id}`).then(r => r.data),
}
