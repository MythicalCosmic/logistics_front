// src/services/auth.js

import api from './api'

export const authService = {
  login: (email, password) =>
    api.post('/api/login', { email, password, device: 'web' }).then(r => r.data),

  logout: () =>
    api.post('/api/logout').then(r => r.data),

  logoutAll: () =>
    api.post('/api/logout/all').then(r => r.data),

  getMe: () =>
    api.get('/api/me').then(r => r.data),

  changePassword: (data) =>
    api.post('/api/password/change', data).then(r => r.data),

  resetPassword: (email) =>
    api.post('/api/password/reset', { email }).then(r => r.data),

  resetPasswordConfirm: (token, new_password) =>
    api.post('/api/password/reset/confirm', { token, new_password }).then(r => r.data),

  getSessions: () =>
    api.get('/api/sessions').then(r => r.data),

  revokeSession: (session_key) =>
    api.delete('/api/sessions', { data: { session_key } }).then(r => r.data),
}
