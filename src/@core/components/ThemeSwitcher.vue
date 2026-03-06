<script setup>
import { useTheme } from 'vuetify'

const props = defineProps({
  themes: {
    type: Array,
    required: true,
  },
})

const {
  name: themeName,
  global: globalTheme,
} = useTheme()

// Load saved theme from localStorage
const savedTheme = localStorage.getItem('theme')
if (savedTheme && props.themes.some(t => t.name === savedTheme)) {
  globalTheme.name.value = savedTheme
}

const {
  state: currentThemeName,
  next: getNextThemeName,
  index: currentThemeIndex,
} = useCycleList(props.themes.map(t => t.name), { initialValue: globalTheme.name.value })

const changeTheme = () => {
  const next = getNextThemeName()
  globalTheme.name.value = next
  localStorage.setItem('theme', next)
}

// Update icon if theme is changed from other sources
watch(() => globalTheme.name.value, val => {
  currentThemeName.value = val
  localStorage.setItem('theme', val)
})
</script>

<template>
  <IconBtn @click="changeTheme">
    <VIcon :icon="props.themes[currentThemeIndex].icon" />
    <VTooltip
      activator="parent"
      open-delay="1000"
      scroll-strategy="close"
    >
      <span class="text-capitalize">{{ currentThemeName }}</span>
    </VTooltip>
  </IconBtn>
</template>
