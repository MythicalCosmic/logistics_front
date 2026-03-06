// src/composables/useNavigation.js

import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import navItems from '@/navigation/vertical'

export function useNavigation() {
  const authStore = useAuthStore()
  
  const navigation = computed(() => {
    return navItems.filter(item => {
      // No permission required - show to everyone
      if (!item.permission) {
        return true
      }
      
      // Check single permission
      if (typeof item.permission === 'string') {
        return authStore.hasPermission(item.permission)
      }
      
      // Check array of permissions (any)
      if (Array.isArray(item.permission)) {
        return authStore.hasAnyPermission(item.permission)
      }
      
      return true
    })
  })
  
  return { navigation }
}
