<!-- src/components/ToastNotification.vue -->

<script setup>
import { useToast } from '@/composables/useToast'

const { toasts, removeToast } = useToast()

const getIcon = (type) => {
  const icons = {
    success: 'bx-check-circle',
    error: 'bx-x-circle',
    warning: 'bx-error',
    info: 'bx-info-circle',
  }
  return icons[type] || icons.info
}

const getColor = (type) => {
  const colors = {
    success: 'success',
    error: 'error',
    warning: 'warning',
    info: 'info',
  }
  return colors[type] || colors.info
}
</script>

<template>
  <Teleport to="body">
    <div class="toast-container">
      <TransitionGroup name="toast">
        <VAlert
          v-for="toast in toasts"
          :key="toast.id"
          :type="getColor(toast.type)"
          :icon="getIcon(toast.type)"
          closable
          variant="tonal"
          class="toast-item mb-2"
          @click:close="removeToast(toast.id)"
        >
          {{ toast.message }}
        </VAlert>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style lang="scss" scoped>
.toast-container {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 400px;
  min-width: 300px;
}

.toast-item {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  border-radius: 8px;
}

// Slide animation
.toast-enter-active {
  animation: slideIn 0.3s ease-out;
}

.toast-leave-active {
  animation: slideOut 0.3s ease-in;
}

@keyframes slideIn {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes slideOut {
  from {
    transform: translateX(0);
    opacity: 1;
  }
  to {
    transform: translateX(100%);
    opacity: 0;
  }
}
</style>
