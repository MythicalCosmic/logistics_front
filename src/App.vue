<script setup>
import { useTheme } from 'vuetify'
import { hexToRgb } from '@layouts/utils'
import ToastNotification from '@/components/ToastNotification.vue'

const { global } = useTheme()
</script>

<template>
  <VApp :style="`--v-global-theme-primary: ${hexToRgb(global.current.value.colors.primary)}`">
    <RouterView />
        <ToastNotification />
  </VApp>
</template>
