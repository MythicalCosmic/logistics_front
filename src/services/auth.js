// src/services/auth.js

import api from './api'

export const authService = {
  async login(email, password) {
    const response = await api.post('/api/login', { email, password, device: 'web' })
    return response.data
  },

  async logout() {
    const response = await api.post('/api/logout')
    return response.data
  },

  async getMe() {
    const response = await api.get('/api/me')
    return response.data
  },
}
