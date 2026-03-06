// src/router/guards.js

import { useAuthStore } from '@/stores/auth'
import { toast } from '@/composables/useToast'

export const setupGuards = (router) => {
  router.beforeEach(async (to, from, next) => {
    const authStore = useAuthStore()

    const publicPages = ['login', 'not-found', 'not-authorized']
    const isPublicPage = publicPages.includes(to.name)
    const requiresAuth = to.meta.requiresAuth !== false && !isPublicPage

    // Fetch user if not yet initialized
    if (!authStore.initialized) {
      await authStore.fetchUser()
    }

    // Going to login while already authenticated - redirect to dashboard
    if (to.name === 'login' && authStore.isAuthenticated) {
      return next({ name: 'dashboard' })
    }

    // Requires auth but not authenticated
    if (requiresAuth && !authStore.isAuthenticated) {
      toast.error('Please login to continue')
      return next({ name: 'login', query: { redirect: to.fullPath } })
    }

    // Check permissions
    if (requiresAuth && to.meta.permissions) {
      const hasAccess = to.meta.requireAll
        ? authStore.hasAllPermissions(to.meta.permissions)
        : authStore.hasAnyPermission(to.meta.permissions)

      if (!hasAccess) {
        toast.error("You don't have permission to access this page")
        return next({ name: 'dashboard' })
      }
    }

    next()
  })
}
