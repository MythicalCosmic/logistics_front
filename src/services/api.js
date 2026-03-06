// src/services/api.js

import axios from 'axios'
import { toast } from '@/composables/useToast'
import router from '@/router'

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

const api = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Add token to every request
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Handle responses
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      const { status, data } = error.response
      const message = data?.message || 'Something went wrong'
      
      switch (status) {
        case 401:
          localStorage.removeItem('token')
          toast.error(message || 'Session expired. Please login again.')
          if (router.currentRoute.value.name !== 'login') {
            router.push({ name: 'login' })
          }
          break
          
        case 403:
          toast.error(message || 'Access denied')
          break
          
        case 404:
          toast.error(message || 'Not found')
          break
          
        case 422:
          if (data?.errors) {
            const errorMessages = Object.values(data.errors).flat().join(', ')
            toast.error(errorMessages)
          } else {
            toast.error(message || 'Validation failed')
          }
          break
          
        case 500:
          toast.error('Server error. Please try again later.')
          break
          
        default:
          toast.error(message)
      }
    } else if (error.request) {
      toast.error('Network error. Check your connection.')
    } else {
      toast.error('An unexpected error occurred.')
    }
    
    return Promise.reject(error)
  }
)

export default api
