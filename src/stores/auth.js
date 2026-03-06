// src/stores/auth.js

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authService } from '@/services/auth'
import { toast } from '@/composables/useToast'
import router from '@/router'

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)
  const token = ref(localStorage.getItem('token') || null)
  const permissions = ref([])
  const loading = ref(false)
  const initialized = ref(false)
  
  const isAuthenticated = computed(() => !!token.value && !!user.value)
  const userFullName = computed(() => user.value?.full_name || '')
  
  const hasPermission = (permission) => permissions.value.includes(permission)
  const hasAnyPermission = (perms) => perms?.some(p => permissions.value.includes(p)) || false
  const hasAllPermissions = (perms) => perms?.every(p => permissions.value.includes(p)) || false
  
  const login = async (email, password) => {
    loading.value = true
    
    try {
      const response = await authService.login(email, password)
      
      if (response.success) {
        token.value = response.data.token
        localStorage.setItem('token', response.data.token)
        
        user.value = response.data.user
        permissions.value = response.data.user.permissions || []
        
        toast.success(`Welcome back, ${user.value.first_name}!`)
        
        const redirectUrl = router.currentRoute.value.query.redirect
        router.push(redirectUrl || '/dashboard')
        
        return true
      } else {
        toast.error(response.message || 'Login failed')
        return false
      }
    } catch (error) {
      // Error already handled by API interceptor
      return false
    } finally {
      loading.value = false
    }
  }
  
  const logout = async () => {
    try {
      await authService.logout()
    } catch (error) {
      // Continue logout even if API fails
    } finally {
      clearAuth()
      toast.success('Logged out successfully')
      router.push({ name: 'login' })
    }
  }
  
  const fetchUser = async () => {
    if (!token.value) {
      initialized.value = true
      return false
    }
    
    try {
      const response = await authService.getMe()
      
      if (response.success) {
        user.value = response.data
        permissions.value = response.data.permissions || []
        initialized.value = true
        return true
      }
      
      clearAuth()
      return false
    } catch (error) {
      clearAuth()
      return false
    }
  }
  
  const clearAuth = () => {
    token.value = null
    user.value = null
    permissions.value = []
    initialized.value = true
    localStorage.removeItem('token')
  }
  
  return {
    user,
    token,
    permissions,
    loading,
    initialized,
    isAuthenticated,
    userFullName,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    login,
    logout,
    fetchUser,
    clearAuth,
  }
})
