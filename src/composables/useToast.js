// src/composables/useToast.js

import { ref } from 'vue'

// Global state - outside the function so it's shared
const toasts = ref([])
let toastId = 0

export function useToast() {
  const addToast = (message, type = 'info', duration = 4000) => {
    const id = ++toastId
    
    toasts.value.push({
      id,
      message,
      type,
      show: true,
    })
    
    setTimeout(() => {
      removeToast(id)
    }, duration)
    
    return id
  }
  
  const removeToast = (id) => {
    const index = toasts.value.findIndex(t => t.id === id)
    if (index > -1) {
      toasts.value[index].show = false
      setTimeout(() => {
        toasts.value = toasts.value.filter(t => t.id !== id)
      }, 300)
    }
  }
  
  const success = (message, duration) => addToast(message, 'success', duration)
  const error = (message, duration) => addToast(message, 'error', duration)
  const warning = (message, duration) => addToast(message, 'warning', duration)
  const info = (message, duration) => addToast(message, 'info', duration)
  
  return {
    toasts,
    addToast,
    removeToast,
    success,
    error,
    warning,
    info,
  }
}

// Export a singleton for use outside Vue components (like in axios interceptors)
export const toast = {
  success: (message, duration) => {
    const { success } = useToast()
    return success(message, duration)
  },
  error: (message, duration) => {
    const { error } = useToast()
    return error(message, duration)
  },
  warning: (message, duration) => {
    const { warning } = useToast()
    return warning(message, duration)
  },
  info: (message, duration) => {
    const { info } = useToast()
    return info(message, duration)
  },
}
