<!-- src/layouts/default.vue -->

<script setup>
import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import VerticalNavSectionTitle from '@/@layouts/components/VerticalNavSectionTitle.vue'
import VerticalNavLayout from '@layouts/components/VerticalNavLayout.vue'
import VerticalNavLink from '@layouts/components/VerticalNavLink.vue'

// Components
import Footer from '@/layouts/components/Footer.vue'
import NavbarThemeSwitcher from '@/layouts/components/NavbarThemeSwitcher.vue'
import UserProfile from '@/layouts/components/UserProfile.vue'

const authStore = useAuthStore()

// Helper to check permission
const can = (permission) => {
  if (!permission) return true
  if (Array.isArray(permission)) {
    return authStore.hasAnyPermission(permission)
  }
  return authStore.hasPermission(permission)
}

// Navigation items
const navItems = computed(() => [
  {
    title: 'Dashboard',
    icon: 'bx-home',
    to: '/dashboard',
    permission: null,
  },
])

// Management section items
const managementItems = computed(() => [
  {
    title: 'Users',
    icon: 'bx-user',
    to: '/users',
    permission: 'users.view',
  },
  {
    title: 'Roles',
    icon: 'bx-shield',
    to: '/roles',
    permission: 'roles.view',
  },
].filter(item => can(item.permission)))

const showManagementSection = computed(() => managementItems.value.length > 0)
</script>

<template>
  <VerticalNavLayout>
    <!-- 👉 Navbar -->
    <template #navbar="{ toggleVerticalOverlayNavActive }">
      <div class="d-flex h-100 align-center">
        <IconBtn
          class="ms-n3 d-lg-none"
          @click="toggleVerticalOverlayNavActive(true)"
        >
          <VIcon icon="bx-menu" />
        </IconBtn>

        <div
          class="d-flex align-center cursor-pointer"
          style="user-select: none;"
        >
          <IconBtn>
            <VIcon icon="bx-search" />
          </IconBtn>
          <span class="d-none d-md-flex align-center text-disabled">
            <span class="me-3">Search</span>
            <span class="meta-key">&#8984;K</span>
          </span>
        </div>

        <VSpacer />

        <NavbarThemeSwitcher class="me-2" />
        <UserProfile />
      </div>
    </template>

    <!-- 👉 Navigation -->
    <template #vertical-nav-content>
      <!-- Main nav items (visible to all) -->
      <VerticalNavLink
        v-for="item in navItems"
        :key="item.title"
        :item="item"
      />

      <!-- Management Section -->
      <template v-if="showManagementSection">
        <VerticalNavSectionTitle
          :item="{ heading: 'Management' }"
        />
        <VerticalNavLink
          v-for="item in managementItems"
          :key="item.title"
          :item="item"
        />
      </template>
    </template>

    <!-- 👉 Page Content -->
    <slot />

    <!-- 👉 Footer -->
    <template #footer>
      <Footer />
    </template>
  </VerticalNavLayout>
</template>

<style lang="scss" scoped>
.meta-key {
  border: thin solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 6px;
  block-size: 1.5625rem;
  line-height: 1.3125rem;
  padding-block: 0.125rem;
  padding-inline: 0.25rem;
}
</style>
