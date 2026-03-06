// src/router/guards.js

import { useAuthStore } from '@/stores/auth'
import { toast } from '@/composables/useToast'

export const setupGuards = (router) => {
  router.beforeEach(async (to, from, next) => {
    const authStore = useAuthStore()
    
    const publicPages = ['login', 'not-found', 'not-authorized']
    const isPublicPage = publicPages.includes(to.name)
    const requiresAuth = to.meta.requiresAuth !== false && !isPublicPage
    const hasToken = !!localStorage.getItem('token')
    
    // Going to login with token - verify and redirect
    if (to.name === 'login' && hasToken) {
      const isValid = await authStore.fetchUser()
      if (isValid) {
        return next({ name: 'dashboard' })
      } else {
        localStorage.removeItem('token')
        return next()
      }
    }
    
    // Requires auth but no token
    if (requiresAuth && !hasToken) {
      toast.error('Please login to continue')
      return next({ name: 'login', query: { redirect: to.fullPath } })
    }
    
    // Requires auth with token - verify with server
    if (requiresAuth && hasToken) {
      const isValid = await authStore.fetchUser()
      
      if (!isValid) {
        localStorage.removeItem('token')
        toast.error('Session expired. Please login again.')
        return next({ name: 'login', query: { redirect: to.fullPath } })
      }
      
      // Check permissions
      if (to.meta.permissions) {
        const hasAccess = to.meta.requireAll
          ? authStore.hasAllPermissions(to.meta.permissions)
          : authStore.hasAnyPermission(to.meta.permissions)
        
        if (!hasAccess) {
          toast.error('You don\'t have permission to access this page')
          return next({ name: 'not-authorized' })
        }
      }
    }
    
    next()
  })
}
