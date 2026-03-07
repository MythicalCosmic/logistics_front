<script setup>
import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()
const user = computed(() => authStore.user)
const initials = computed(() => {
  if (!user.value) return '?'
  const f = user.value.first_name?.[0] || ''
  const l = user.value.last_name?.[0] || ''
  return (f + l).toUpperCase() || '?'
})

const handleLogout = () => {
  authStore.logout()
}
</script>

<template>
  <VBadge
    dot
    location="bottom right"
    offset-x="3"
    offset-y="3"
    color="success"
    bordered
  >
    <VAvatar
      class="cursor-pointer"
      color="primary"
      variant="tonal"
    >
      <span class="text-body-1 font-weight-semibold">{{ initials }}</span>

      <VMenu
        activator="parent"
        width="230"
        location="bottom end"
        offset="14px"
      >
        <VList>
          <VListItem>
            <template #prepend>
              <VListItemAction start>
                <VBadge
                  dot
                  location="bottom right"
                  offset-x="3"
                  offset-y="3"
                  color="success"
                >
                  <VAvatar
                    color="primary"
                    variant="tonal"
                  >
                    <span class="text-body-2 font-weight-semibold">{{ initials }}</span>
                  </VAvatar>
                </VBadge>
              </VListItemAction>
            </template>

            <VListItemTitle class="font-weight-semibold">
              {{ user?.full_name || 'User' }}
            </VListItemTitle>
            <VListItemSubtitle>{{ user?.email || '' }}</VListItemSubtitle>
          </VListItem>
          <VDivider class="my-2" />

          <VListItem link to="/dashboard">
            <template #prepend>
              <VIcon
                class="me-2"
                icon="bx-home"
                size="22"
              />
            </template>
            <VListItemTitle>Dashboard</VListItemTitle>
          </VListItem>

          <VDivider class="my-2" />

          <VListItem @click="handleLogout">
            <template #prepend>
              <VIcon
                class="me-2"
                icon="bx-log-out"
                size="22"
              />
            </template>
            <VListItemTitle>Logout</VListItemTitle>
          </VListItem>
        </VList>
      </VMenu>
    </VAvatar>
  </VBadge>
</template>
