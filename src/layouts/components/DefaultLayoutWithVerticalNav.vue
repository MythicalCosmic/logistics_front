<!-- src/layouts/default.vue -->

<script setup>
import { computed } from 'vue'
import { useTheme } from 'vuetify'
import { useAuthStore } from '@/stores/auth'
import VerticalNavSectionTitle from '@/@layouts/components/VerticalNavSectionTitle.vue'
import VerticalNavLayout from '@layouts/components/VerticalNavLayout.vue'
import VerticalNavLink from '@layouts/components/VerticalNavLink.vue'

// Components
import Footer from '@/layouts/components/Footer.vue'
import NavbarThemeSwitcher from '@/layouts/components/NavbarThemeSwitcher.vue'
import UserProfile from '@/layouts/components/UserProfile.vue'

const vuetifyTheme = useTheme()
const authStore = useAuthStore()

// Helper to check permission
const can = (permission) => {
  if (!permission) return true
  if (Array.isArray(permission)) {
    return authStore.hasAnyPermission(permission)
  }
  return authStore.hasPermission(permission)
}

// Navigation items with permissions
const navItems = computed(() => [
  {
    title: 'Dashboard',
    icon: 'bx-home',
    to: '/dashboard',
    permission: null, // Everyone
  },
  {
    title: 'Account Settings',
    icon: 'bx-cog',
    to: '/account-settings',
    permission: null, // Everyone
  },
])

// Management section items
const managementItems = computed(() => [
  {
    title: 'Users',
    icon: 'bx-user',
    to: '/users',
    permission: 'user.view',
  },
  {
    title: 'Teachers',
    icon: 'bx-chalkboard',
    to: '/teachers',
    permission: 'user.view',
  },
  {
    title: 'Groups',
    icon: 'bx-group',
    to: '/groups',
    permission: 'group.view',
  },
  {
    title: 'Students',
    icon: 'bx-user-check',
    to: '/students',
    permission: 'student.view',
  },
].filter(item => can(item.permission)))

// Attendance section items
const attendanceItems = computed(() => [
  {
    title: 'Attendance',
    icon: 'bx-calendar-check',
    to: '/attendance',
    permission: 'attendance.view',
  },
].filter(item => can(item.permission)))

// Settings section items
const settingsItems = computed(() => [
  {
    title: 'Roles & Permissions',
    icon: 'bx-shield',
    to: '/roles',
    permission: 'role.view',
  },
].filter(item => can(item.permission)))

// Check if sections should be visible
const showManagementSection = computed(() => managementItems.value.length > 0)
const showAttendanceSection = computed(() => attendanceItems.value.length > 0)
const showSettingsSection = computed(() => settingsItems.value.length > 0)
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

      <!-- Attendance Section -->
      <template v-if="showAttendanceSection">
        <VerticalNavSectionTitle
          :item="{ heading: 'Attendance' }"
        />
        <VerticalNavLink
          v-for="item in attendanceItems"
          :key="item.title"
          :item="item"
        />
      </template>

      <!-- Settings Section -->
      <template v-if="showSettingsSection">
        <VerticalNavSectionTitle
          :item="{ heading: 'Settings' }"
        />
        <VerticalNavLink
          v-for="item in settingsItems"
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
