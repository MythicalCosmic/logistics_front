<!-- src/pages/user.vue -->

<script setup>
import { ref, onMounted, watch, computed } from 'vue'
import { useTheme } from 'vuetify'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import api from '@/services/api'

const authStore = useAuthStore()
const { success: toastSuccess, error: toastError } = useToast()
const vuetifyTheme = useTheme()
const isDark = computed(() => vuetifyTheme.global.current.value.dark)
const dialogCardStyle = computed(() => ({
  background: isDark.value ? '#1e1e2e' : '#ffffff',
  color: isDark.value ? '#e2e8f0' : '#1e293b',
  border: `1px solid ${isDark.value ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
  borderRadius: '16px',
}))

// Permissions
const canCreate = computed(() => authStore.hasPermission('users.create'))
const canEdit = computed(() => authStore.hasPermission('users.update'))
const canDelete = computed(() => authStore.hasPermission('users.delete'))
const canManageRoles = computed(() => authStore.hasPermission('roles.update'))

// Data
const users = ref([])
const roles = ref([])
const loading = ref(false)
const totalUsers = ref(0)

// Pagination & Filters
const page = ref(1)
const perPage = ref(10)
const search = ref('')
const filterRole = ref(null)
const filterStatus = ref(null)
const totalPages = computed(() => Math.ceil(totalUsers.value / perPage.value))

// Dialogs
const showCreateDialog = ref(false)
const showEditDialog = ref(false)
const showDeleteDialog = ref(false)
const showPasswordDialog = ref(false)
const showSessionsDialog = ref(false)
const showForceLogoutDialog = ref(false)
const dialogLoading = ref(false)

// Form Data
const defaultForm = {
  email: '',
  password: '',
  first_name: '',
  last_name: '',
  phone: '',
  role_id: null,
  is_active: true,
}
const form = ref({ ...defaultForm })
const formErrors = ref({})
const selectedUser = ref(null)
const newPassword = ref('')
const userSessions = ref([])

// Stats
const serverStats = ref(null)
const stats = computed(() => {
  if (serverStats.value) {
    return {
      total: serverStats.value.total_users || 0,
      active: serverStats.value.active_users || 0,
      inactive: serverStats.value.inactive_users || 0,
      sessions: serverStats.value.active_sessions || 0,
      newLast7d: serverStats.value.new_last_7d || 0,
      loggedIn24h: serverStats.value.logged_in_last_24h || 0,
      rolesBreakdown: serverStats.value.roles_breakdown || [],
    }
  }
  return { total: 0, active: 0, inactive: 0, sessions: 0, newLast7d: 0, loggedIn24h: 0, rolesBreakdown: [] }
})

// Avatar helper
const avatarText = (name) => {
  if (!name) return '?'
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

const avatarColor = (name) => {
  const colors = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#6366f1']
  let hash = 0
  for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

// Fetch functions
const fetchUsers = async () => {
  loading.value = true
  try {
    const params = { page: page.value, per_page: perPage.value, sort_by: '-created_at' }
    if (search.value) params.search = search.value
    if (filterRole.value) params.role = filterRole.value
    if (filterStatus.value !== null && filterStatus.value !== undefined) params.is_active = filterStatus.value
    const response = await api.get('/admin-api/users', { params })
    if (response.data.success) {
      users.value = response.data.data?.users || []
      totalUsers.value = response.data.data?.pagination?.total || 0
    }
  } catch (error) {
    toastError('Failed to load users')
  } finally {
    loading.value = false
  }
}

const fetchStats = async () => {
  try {
    const response = await api.get('/admin-api/users/stats')
    if (response.data.success) serverStats.value = response.data.data
  } catch (error) { /* non-critical */ }
}

const fetchRoles = async () => {
  try {
    const response = await api.get('/admin-api/roles')
    if (response.data.success) roles.value = response.data.data?.roles || []
  } catch (error) { /* non-critical */ }
}

// Create
const handleCreate = async () => {
  formErrors.value = {}
  if (!form.value.email) formErrors.value.email = 'Email is required'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.value.email)) formErrors.value.email = 'Invalid email format'
  if (!form.value.first_name) formErrors.value.first_name = 'First name is required'
  if (!form.value.last_name) formErrors.value.last_name = 'Last name is required'
  if (!form.value.password) formErrors.value.password = 'Password is required'
  else if (form.value.password.length < 8) formErrors.value.password = 'Min 8 characters'
  else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])/.test(form.value.password)) formErrors.value.password = 'Need uppercase, lowercase, number & special char'
  if (Object.keys(formErrors.value).length > 0) return

  dialogLoading.value = true
  try {
    const payload = {
      email: form.value.email,
      first_name: form.value.first_name,
      last_name: form.value.last_name,
      password: form.value.password,
      phone: form.value.phone || '',
    }
    if (form.value.role_id) payload.role_id = form.value.role_id
    const response = await api.post('/admin-api/users/create', payload)
    if (response.data.success) {
      toastSuccess('User created successfully')
      showCreateDialog.value = false
      resetForm()
      fetchUsers()
      fetchStats()
    }
  } catch (error) { /* interceptor */ }
  finally { dialogLoading.value = false }
}

// Update
const handleUpdate = async () => {
  formErrors.value = {}
  if (!form.value.email) formErrors.value.email = 'Email is required'
  if (!form.value.first_name) formErrors.value.first_name = 'First name is required'
  if (!form.value.last_name) formErrors.value.last_name = 'Last name is required'
  if (Object.keys(formErrors.value).length > 0) return

  dialogLoading.value = true
  try {
    const response = await api.put(`/admin-api/users/${selectedUser.value.id}/update`, {
      email: form.value.email,
      first_name: form.value.first_name,
      last_name: form.value.last_name,
      phone: form.value.phone || '',
    })
    if (response.data.success) {
      toastSuccess('User updated successfully')
      showEditDialog.value = false
      resetForm()
      fetchUsers()
    }
  } catch (error) { /* interceptor */ }
  finally { dialogLoading.value = false }
}

// Delete
const handleDelete = async () => {
  if (!selectedUser.value) return
  dialogLoading.value = true
  try {
    const isSelf = selectedUser.value.id === authStore.user?.id
    const response = await api.post(`/admin-api/users/${selectedUser.value.id}/delete`, { force: isSelf })
    if (response.data.success) {
      toastSuccess('User deactivated successfully')
      showDeleteDialog.value = false
      selectedUser.value = null
      fetchUsers()
      fetchStats()
    }
  } catch (error) { /* interceptor */ }
  finally { dialogLoading.value = false }
}

// Toggle Active
const handleToggleActive = async (user) => {
  try {
    const isSelf = user.id === authStore.user?.id
    const response = await api.post(`/admin-api/users/${user.id}/toggle-active`, { force: isSelf })
    if (response.data.success) {
      toastSuccess(`User ${response.data.data?.is_active ? 'activated' : 'deactivated'}`)
      fetchUsers()
      fetchStats()
    }
  } catch (error) { /* interceptor */ }
}

// Change Password
const handleChangePassword = async () => {
  if (!newPassword.value || newPassword.value.length < 8) {
    toastError('Password must be at least 8 characters')
    return
  }
  if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])/.test(newPassword.value)) {
    toastError('Need uppercase, lowercase, number & special char')
    return
  }
  dialogLoading.value = true
  try {
    const isSelf = selectedUser.value.id === authStore.user?.id
    const response = await api.post(`/admin-api/users/${selectedUser.value.id}/change-password`, {
      new_password: newPassword.value,
      force: isSelf,
    })
    if (response.data.success) {
      toastSuccess('Password changed successfully')
      showPasswordDialog.value = false
      newPassword.value = ''
      selectedUser.value = null
    }
  } catch (error) { /* interceptor */ }
  finally { dialogLoading.value = false }
}

// Force Logout
const handleForceLogout = async () => {
  if (!selectedUser.value) return
  dialogLoading.value = true
  try {
    const isSelf = selectedUser.value.id === authStore.user?.id
    const response = await api.post(`/admin-api/users/${selectedUser.value.id}/force-logout`, { force: isSelf })
    if (response.data.success) {
      toastSuccess(`${response.data.data?.sessions_terminated || 0} sessions terminated`)
      showForceLogoutDialog.value = false
      selectedUser.value = null
      fetchStats()
    }
  } catch (error) { /* interceptor */ }
  finally { dialogLoading.value = false }
}

// View Sessions
const openSessionsDialog = async (user) => {
  selectedUser.value = user
  userSessions.value = []
  showSessionsDialog.value = true
  try {
    const response = await api.get(`/admin-api/users/${user.id}/sessions`)
    if (response.data.success) userSessions.value = response.data.data?.sessions || []
  } catch (error) { /* interceptor */ }
}

// Role management
const handleAssignRole = async (user, roleId) => {
  try {
    const response = await api.post(`/admin-api/users/${user.id}/roles`, { role_id: roleId })
    if (response.data.success) {
      toastSuccess('Role assigned')
      fetchUsers()
    }
  } catch (error) { /* interceptor */ }
}

const handleRemoveRole = async (user, roleId) => {
  try {
    const response = await api.delete(`/admin-api/users/${user.id}/roles/remove`, { data: { role_id: roleId } })
    if (response.data.success) {
      toastSuccess('Role removed')
      fetchUsers()
    }
  } catch (error) { /* interceptor */ }
}

// Dialog helpers
const openEditDialog = async (user) => {
  selectedUser.value = user
  // Fetch full detail
  try {
    const response = await api.get(`/admin-api/users/${user.id}`)
    if (response.data.success) {
      const u = response.data.data
      selectedUser.value = u
      form.value = {
        email: u.email || '',
        first_name: u.first_name || '',
        last_name: u.last_name || '',
        phone: u.phone || '',
        password: '',
        role_id: null,
        is_active: u.is_active,
      }
      showEditDialog.value = true
    }
  } catch (error) { /* interceptor */ }
}

const openDeleteDialog = (user) => {
  selectedUser.value = user
  showDeleteDialog.value = true
}

const openPasswordDialog = (user) => {
  selectedUser.value = user
  newPassword.value = ''
  showPasswordDialog.value = true
}

const openForceLogoutDialog = (user) => {
  selectedUser.value = user
  showForceLogoutDialog.value = true
}

const resetForm = () => {
  form.value = { ...defaultForm }
  formErrors.value = {}
  selectedUser.value = null
}

// Formatters
const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const formatDateTime = (dateStr) => {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const relativeTime = (dateStr) => {
  if (!dateStr) return 'Never'
  const now = new Date()
  const date = new Date(dateStr)
  const diffMs = now - date
  const diffMin = Math.floor(diffMs / 60000)
  const diffHr = Math.floor(diffMs / 3600000)
  const diffDay = Math.floor(diffMs / 86400000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHr < 24) return `${diffHr}h ago`
  if (diffDay < 7) return `${diffDay}d ago`
  return formatDate(dateStr)
}

// Watchers
let searchTimeout = null
watch(search, () => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => { page.value = 1; fetchUsers() }, 300)
})
watch([filterRole, filterStatus], () => { page.value = 1; fetchUsers() })
watch(page, () => fetchUsers())

onMounted(() => {
  fetchUsers()
  fetchStats()
  fetchRoles()
})
</script>

<template>
  <div class="users-page" :class="{ 'dark-mode': isDark }">
    <!-- Loading -->
    <div v-if="loading && !users.length" class="d-flex justify-center align-center" style="min-height: 400px;">
      <VProgressCircular indeterminate size="48" color="primary" />
    </div>

    <template v-else>
      <!-- Page Header -->
      <div class="page-header mb-6">
        <div class="d-flex align-center justify-space-between flex-wrap" style="gap: 16px;">
          <div class="d-flex align-center" style="gap: 16px;">
            <div class="header-icon">
              <VIcon icon="bx-group" size="28" />
            </div>
            <div>
              <h1 class="text-h4 font-weight-bold" style="color: var(--text-primary);">Users</h1>
              <p class="text-body-2 mb-0" style="color: var(--text-secondary);">Manage user accounts and access</p>
            </div>
          </div>
          <VBtn v-if="canCreate" color="primary" size="large" class="create-btn" @click="showCreateDialog = true">
            <VIcon icon="bx-plus" class="me-2" />
            Add User
          </VBtn>
        </div>
      </div>

      <!-- Stats Row -->
      <VRow class="mb-6">
        <VCol v-for="(stat, i) in [
          { label: 'Total Users', value: stats.total, icon: 'bx-group', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)', badge: stats.newLast7d ? `+${stats.newLast7d} this week` : null },
          { label: 'Active', value: stats.active, icon: 'bx-user-check', color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
          { label: 'Inactive', value: stats.inactive, icon: 'bx-user-x', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
          { label: 'Active Sessions', value: stats.sessions, icon: 'bx-devices', color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)', badge: stats.loggedIn24h ? `${stats.loggedIn24h} today` : null },
        ]" :key="i" cols="12" sm="6" md="3">
          <VCard class="stat-card" :style="{ '--delay': `${i * 0.08}s` }">
            <VCardText class="pa-5">
              <div class="d-flex align-center justify-space-between mb-3">
                <div class="stat-icon-wrap" :style="{ background: stat.bg }">
                  <VIcon :icon="stat.icon" size="24" :style="{ color: stat.color }" />
                </div>
                <VChip v-if="stat.badge" size="x-small" variant="tonal" color="success" class="font-weight-bold">
                  {{ stat.badge }}
                </VChip>
              </div>
              <h3 class="text-h4 font-weight-bold mb-1" style="color: var(--text-primary);">{{ stat.value }}</h3>
              <span class="text-body-2" style="color: var(--text-secondary);">{{ stat.label }}</span>
            </VCardText>
          </VCard>
        </VCol>
      </VRow>

      <!-- Filters -->
      <VCard class="filter-card mb-6">
        <VCardText class="pa-4">
          <VRow align="center">
            <VCol cols="12" md="5">
              <VTextField
                v-model="search"
                placeholder="Search users..."
                variant="outlined"
                density="comfortable"
                hide-details
                clearable
                prepend-inner-icon="bx-search"
              />
            </VCol>
            <VCol cols="12" sm="6" md="3">
              <VSelect
                v-model="filterRole"
                :items="roles.map(r => ({ title: r.name, value: r.slug }))"
                placeholder="All Roles"
                variant="outlined"
                density="comfortable"
                hide-details
                clearable
                prepend-inner-icon="bx-shield"
              />
            </VCol>
            <VCol cols="12" sm="6" md="3">
              <VSelect
                v-model="filterStatus"
                :items="[{ title: 'Active', value: 'true' }, { title: 'Inactive', value: 'false' }]"
                placeholder="All Status"
                variant="outlined"
                density="comfortable"
                hide-details
                clearable
                prepend-inner-icon="bx-toggle-left"
              />
            </VCol>
            <VCol cols="12" md="1" class="d-flex justify-end">
              <VBtn icon variant="tonal" @click="search = ''; filterRole = null; filterStatus = null">
                <VIcon icon="bx-refresh" />
              </VBtn>
            </VCol>
          </VRow>
        </VCardText>
      </VCard>

      <!-- Users Table -->
      <VCard class="table-card">
        <VCardText class="pa-0">
          <div v-if="loading" class="d-flex justify-center pa-8">
            <VProgressCircular indeterminate color="primary" />
          </div>

          <div v-else-if="!users.length" class="text-center pa-12">
            <VIcon icon="bx-user-x" size="64" class="mb-4" style="color: var(--text-secondary); opacity: 0.5;" />
            <h3 class="text-h6 font-weight-bold mb-2" style="color: var(--text-primary);">No Users Found</h3>
            <p class="text-body-2" style="color: var(--text-secondary);">Try adjusting your search or filters</p>
          </div>

          <VTable v-else density="comfortable" class="users-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Phone</th>
                <th>Roles</th>
                <th>Status</th>
                <th>Last Login</th>
                <th v-if="canEdit || canDelete">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(user, idx) in users" :key="user.id" :style="{ '--delay': `${idx * 0.03}s` }">
                <td>
                  <div class="d-flex align-center" style="gap: 12px;">
                    <div class="user-avatar" :style="{ background: avatarColor(user.full_name) }">
                      {{ avatarText(user.full_name) }}
                    </div>
                    <div>
                      <span class="d-block font-weight-semibold" style="color: var(--text-primary);">{{ user.full_name }}</span>
                      <span class="d-block text-caption" style="color: var(--text-secondary);">{{ user.email }}</span>
                    </div>
                  </div>
                </td>
                <td style="color: var(--text-secondary);">{{ user.phone || '-' }}</td>
                <td>
                  <VChip
                    v-for="role in (user.roles || [])"
                    :key="role"
                    size="small"
                    variant="tonal"
                    color="primary"
                    class="me-1"
                  >
                    {{ role }}
                  </VChip>
                  <span v-if="!user.roles?.length" style="color: var(--text-secondary);">-</span>
                </td>
                <td>
                  <VChip
                    size="small"
                    variant="tonal"
                    :color="user.is_active ? 'success' : 'error'"
                  >
                    {{ user.is_active ? 'Active' : 'Inactive' }}
                  </VChip>
                </td>
                <td>
                  <span class="text-body-2" style="color: var(--text-secondary);">{{ relativeTime(user.last_login) }}</span>
                </td>
                <td v-if="canEdit || canDelete">
                  <VMenu location="bottom end">
                    <template #activator="{ props }">
                      <VBtn v-bind="props" icon variant="text" size="small">
                        <VIcon icon="bx-dots-vertical-rounded" />
                      </VBtn>
                    </template>
                    <VList density="compact" class="action-menu">
                      <VListItem v-if="canEdit" @click="openEditDialog(user)">
                        <template #prepend><VIcon icon="bx-edit" size="18" color="primary" /></template>
                        <VListItemTitle>Edit</VListItemTitle>
                      </VListItem>
                      <VListItem v-if="canEdit" @click="openPasswordDialog(user)">
                        <template #prepend><VIcon icon="bx-key" size="18" color="warning" /></template>
                        <VListItemTitle>Change Password</VListItemTitle>
                      </VListItem>
                      <VListItem v-if="canEdit" @click="handleToggleActive(user)">
                        <template #prepend><VIcon :icon="user.is_active ? 'bx-user-x' : 'bx-user-check'" size="18" :color="user.is_active ? 'error' : 'success'" /></template>
                        <VListItemTitle>{{ user.is_active ? 'Deactivate' : 'Activate' }}</VListItemTitle>
                      </VListItem>
                      <VListItem @click="openSessionsDialog(user)">
                        <template #prepend><VIcon icon="bx-devices" size="18" color="info" /></template>
                        <VListItemTitle>View Sessions</VListItemTitle>
                      </VListItem>
                      <VListItem v-if="canEdit" @click="openForceLogoutDialog(user)">
                        <template #prepend><VIcon icon="bx-log-out" size="18" color="warning" /></template>
                        <VListItemTitle>Force Logout</VListItemTitle>
                      </VListItem>
                      <VDivider v-if="canDelete" class="my-1" />
                      <VListItem v-if="canDelete" @click="openDeleteDialog(user)">
                        <template #prepend><VIcon icon="bx-trash" size="18" color="error" /></template>
                        <VListItemTitle class="text-error">Delete</VListItemTitle>
                      </VListItem>
                    </VList>
                  </VMenu>
                </td>
              </tr>
            </tbody>
          </VTable>

          <!-- Pagination -->
          <div v-if="totalPages > 1" class="d-flex align-center justify-space-between pa-4 flex-wrap" style="gap: 12px; border-top: 1px solid var(--card-border);">
            <span class="text-body-2" style="color: var(--text-secondary);">
              Showing {{ (page - 1) * perPage + 1 }} to {{ Math.min(page * perPage, totalUsers) }} of {{ totalUsers }}
            </span>
            <VPagination v-model="page" :length="totalPages" :total-visible="5" density="compact" />
          </div>
        </VCardText>
      </VCard>
    </template>

    <!-- Create Dialog -->
    <VDialog v-model="showCreateDialog" max-width="550" persistent>
      <VCard class="dialog-card" :style="dialogCardStyle">
        <VCardTitle class="d-flex align-center pa-5 pb-3" style="gap: 12px;">
          <div class="dialog-icon create"><VIcon icon="bx-user-plus" size="24" /></div>
          <div>
            <span class="d-block text-h6 font-weight-bold" style="color: var(--text-primary);">Create User</span>
            <span class="d-block text-caption" style="color: var(--text-secondary);">Add a new user account</span>
          </div>
          <VSpacer />
          <VBtn icon variant="text" size="small" @click="showCreateDialog = false; resetForm()"><VIcon icon="bx-x" /></VBtn>
        </VCardTitle>
        <VDivider />
        <VCardText class="pa-5">
          <VRow>
            <VCol cols="6">
              <VTextField v-model="form.first_name" label="First Name" variant="outlined" density="comfortable" :error-messages="formErrors.first_name" />
            </VCol>
            <VCol cols="6">
              <VTextField v-model="form.last_name" label="Last Name" variant="outlined" density="comfortable" :error-messages="formErrors.last_name" />
            </VCol>
            <VCol cols="12">
              <VTextField v-model="form.email" label="Email" type="email" variant="outlined" density="comfortable" :error-messages="formErrors.email" prepend-inner-icon="bx-envelope" />
            </VCol>
            <VCol cols="12">
              <VTextField v-model="form.password" label="Password" type="password" variant="outlined" density="comfortable" :error-messages="formErrors.password" prepend-inner-icon="bx-lock-alt" hint="Min 8 chars, uppercase, lowercase, number, special char" persistent-hint />
            </VCol>
            <VCol cols="12">
              <VTextField v-model="form.phone" label="Phone (optional)" variant="outlined" density="comfortable" prepend-inner-icon="bx-phone" />
            </VCol>
            <VCol cols="12">
              <VSelect v-model="form.role_id" :items="roles.map(r => ({ title: r.name, value: r.id }))" label="Role (optional)" variant="outlined" density="comfortable" clearable prepend-inner-icon="bx-shield" />
            </VCol>
          </VRow>
        </VCardText>
        <VDivider />
        <VCardActions class="pa-4">
          <VSpacer />
          <VBtn variant="outlined" @click="showCreateDialog = false; resetForm()">Cancel</VBtn>
          <VBtn color="primary" :loading="dialogLoading" @click="handleCreate">
            <VIcon icon="bx-plus" class="me-1" />Create
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>

    <!-- Edit Dialog -->
    <VDialog v-model="showEditDialog" max-width="550" persistent>
      <VCard class="dialog-card" :style="dialogCardStyle">
        <VCardTitle class="d-flex align-center pa-5 pb-3" style="gap: 12px;">
          <div class="dialog-icon edit"><VIcon icon="bx-edit" size="24" /></div>
          <div>
            <span class="d-block text-h6 font-weight-bold" style="color: var(--text-primary);">Edit User</span>
            <span class="d-block text-caption" style="color: var(--text-secondary);">{{ selectedUser?.full_name }}</span>
          </div>
          <VSpacer />
          <VBtn icon variant="text" size="small" @click="showEditDialog = false; resetForm()"><VIcon icon="bx-x" /></VBtn>
        </VCardTitle>
        <VDivider />
        <VCardText class="pa-5">
          <VRow>
            <VCol cols="6">
              <VTextField v-model="form.first_name" label="First Name" variant="outlined" density="comfortable" :error-messages="formErrors.first_name" />
            </VCol>
            <VCol cols="6">
              <VTextField v-model="form.last_name" label="Last Name" variant="outlined" density="comfortable" :error-messages="formErrors.last_name" />
            </VCol>
            <VCol cols="12">
              <VTextField v-model="form.email" label="Email" type="email" variant="outlined" density="comfortable" :error-messages="formErrors.email" prepend-inner-icon="bx-envelope" />
            </VCol>
            <VCol cols="12">
              <VTextField v-model="form.phone" label="Phone" variant="outlined" density="comfortable" prepend-inner-icon="bx-phone" />
            </VCol>
          </VRow>

          <!-- Role Management -->
          <template v-if="canManageRoles && selectedUser">
            <div class="text-subtitle-2 font-weight-bold mt-4 mb-2" style="color: var(--text-primary);">Roles</div>
            <div class="d-flex flex-wrap mb-2" style="gap: 8px;">
              <VChip
                v-for="role in (selectedUser.roles || [])"
                :key="role.id"
                closable
                color="primary"
                variant="tonal"
                @click:close="handleRemoveRole(selectedUser, role.id)"
              >
                {{ role.name }}
              </VChip>
              <span v-if="!selectedUser.roles?.length" class="text-body-2" style="color: var(--text-secondary);">No roles assigned</span>
            </div>
            <VSelect
              :items="roles.filter(r => !selectedUser.roles?.find(ur => ur.id === r.id)).map(r => ({ title: r.name, value: r.id }))"
              label="Add role..."
              variant="outlined"
              density="compact"
              hide-details
              @update:model-value="(val) => { if (val) { handleAssignRole(selectedUser, val); } }"
            />
          </template>
        </VCardText>
        <VDivider />
        <VCardActions class="pa-4">
          <VSpacer />
          <VBtn variant="outlined" @click="showEditDialog = false; resetForm()">Cancel</VBtn>
          <VBtn color="primary" :loading="dialogLoading" @click="handleUpdate">
            <VIcon icon="bx-check" class="me-1" />Save
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>

    <!-- Delete Dialog -->
    <VDialog v-model="showDeleteDialog" max-width="420">
      <VCard class="dialog-card text-center" :style="dialogCardStyle">
        <VCardText class="pa-6">
          <div class="delete-icon-wrap mx-auto mb-4">
            <VIcon icon="bx-error-circle" size="48" color="error" />
          </div>
          <h3 class="text-h6 font-weight-bold mb-2" style="color: var(--text-primary);">Delete User</h3>
          <p class="text-body-2 mb-0" style="color: var(--text-secondary);">
            Are you sure you want to deactivate <strong>{{ selectedUser?.full_name }}</strong>?
          </p>
        </VCardText>
        <VDivider />
        <VCardActions class="justify-center pa-4">
          <VBtn variant="outlined" @click="showDeleteDialog = false">Cancel</VBtn>
          <VBtn color="error" :loading="dialogLoading" @click="handleDelete">
            <VIcon icon="bx-trash" class="me-1" />Delete
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>

    <!-- Change Password Dialog -->
    <VDialog v-model="showPasswordDialog" max-width="420">
      <VCard class="dialog-card" :style="dialogCardStyle">
        <VCardTitle class="d-flex align-center pa-5 pb-3" style="gap: 12px;">
          <div class="dialog-icon warning"><VIcon icon="bx-key" size="24" /></div>
          <div>
            <span class="d-block text-h6 font-weight-bold" style="color: var(--text-primary);">Change Password</span>
            <span class="d-block text-caption" style="color: var(--text-secondary);">{{ selectedUser?.full_name }}</span>
          </div>
          <VSpacer />
          <VBtn icon variant="text" size="small" @click="showPasswordDialog = false"><VIcon icon="bx-x" /></VBtn>
        </VCardTitle>
        <VDivider />
        <VCardText class="pa-5">
          <VTextField
            v-model="newPassword"
            label="New Password"
            type="password"
            variant="outlined"
            density="comfortable"
            prepend-inner-icon="bx-lock-alt"
            hint="Min 8 chars, uppercase, lowercase, number, special char"
            persistent-hint
          />
          <VAlert type="warning" variant="tonal" density="compact" class="mt-3">
            This will terminate all user sessions.
          </VAlert>
        </VCardText>
        <VDivider />
        <VCardActions class="pa-4">
          <VSpacer />
          <VBtn variant="outlined" @click="showPasswordDialog = false">Cancel</VBtn>
          <VBtn color="warning" :loading="dialogLoading" @click="handleChangePassword">Change</VBtn>
        </VCardActions>
      </VCard>
    </VDialog>

    <!-- Sessions Dialog -->
    <VDialog v-model="showSessionsDialog" max-width="600">
      <VCard class="dialog-card" :style="dialogCardStyle">
        <VCardTitle class="d-flex align-center pa-5 pb-3" style="gap: 12px;">
          <div class="dialog-icon info"><VIcon icon="bx-devices" size="24" /></div>
          <div>
            <span class="d-block text-h6 font-weight-bold" style="color: var(--text-primary);">Active Sessions</span>
            <span class="d-block text-caption" style="color: var(--text-secondary);">{{ selectedUser?.full_name }}</span>
          </div>
          <VSpacer />
          <VBtn icon variant="text" size="small" @click="showSessionsDialog = false"><VIcon icon="bx-x" /></VBtn>
        </VCardTitle>
        <VDivider />
        <VCardText class="pa-5">
          <div v-if="!userSessions.length" class="text-center pa-6">
            <VIcon icon="bx-devices" size="48" class="mb-2" style="color: var(--text-secondary); opacity: 0.4;" />
            <p class="text-body-2" style="color: var(--text-secondary);">No active sessions</p>
          </div>
          <div v-else class="sessions-list">
            <div v-for="(session, i) in userSessions" :key="i" class="session-item">
              <div class="d-flex align-center" style="gap: 12px;">
                <VIcon icon="bx-desktop" size="20" style="color: var(--text-secondary);" />
                <div>
                  <span class="d-block font-weight-semibold text-body-2" style="color: var(--text-primary);">
                    {{ session.device || 'Unknown Device' }}
                    <VChip v-if="session.is_current" size="x-small" color="success" variant="tonal" class="ms-1">Current</VChip>
                  </span>
                  <span class="d-block text-caption" style="color: var(--text-secondary);">
                    IP: {{ session.ip_address }} &middot; Last active: {{ relativeTime(session.last_activity_at) }}
                  </span>
                  <span class="d-block text-caption" style="color: var(--text-secondary);">
                    Expires: {{ formatDateTime(session.expires_at) }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </VCardText>
      </VCard>
    </VDialog>

    <!-- Force Logout Dialog -->
    <VDialog v-model="showForceLogoutDialog" max-width="420">
      <VCard class="dialog-card text-center" :style="dialogCardStyle">
        <VCardText class="pa-6">
          <div class="delete-icon-wrap warning mx-auto mb-4">
            <VIcon icon="bx-log-out" size="48" color="warning" />
          </div>
          <h3 class="text-h6 font-weight-bold mb-2" style="color: var(--text-primary);">Force Logout</h3>
          <p class="text-body-2 mb-0" style="color: var(--text-secondary);">
            Terminate all sessions for <strong>{{ selectedUser?.full_name }}</strong>?
          </p>
        </VCardText>
        <VDivider />
        <VCardActions class="justify-center pa-4">
          <VBtn variant="outlined" @click="showForceLogoutDialog = false">Cancel</VBtn>
          <VBtn color="warning" :loading="dialogLoading" @click="handleForceLogout">
            <VIcon icon="bx-log-out" class="me-1" />Force Logout
          </VBtn>
        </VCardActions>
      </VCard>
    </VDialog>
  </div>
</template>

<style lang="scss" scoped>
.users-page {
  --card-bg: rgba(255, 255, 255, 0.85);
  --card-border: rgba(0, 0, 0, 0.06);
  --text-primary: #1e293b;
  --text-secondary: #64748b;
  --bg-subtle: rgba(0, 0, 0, 0.02);
  --dialog-bg: #ffffff;

  &.dark-mode {
    --card-bg: rgba(30, 30, 46, 0.85);
    --card-border: rgba(255, 255, 255, 0.06);
    --text-primary: #e2e8f0;
    --text-secondary: #94a3b8;
    --bg-subtle: rgba(255, 255, 255, 0.03);
    --dialog-bg: #1e1e2e;
  }
}

.header-icon {
  width: 52px;
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  border-radius: 14px;
  color: white;
  box-shadow: 0 8px 24px rgba(99, 102, 241, 0.3);
}

.create-btn {
  border-radius: 12px !important;
  font-weight: 600;
  letter-spacing: 0.3px;
}

.stat-card {
  background: var(--card-bg) !important;
  backdrop-filter: blur(20px);
  border: 1px solid var(--card-border);
  border-radius: 16px !important;
  transition: all 0.3s ease;
  animation: fadeInUp 0.5s ease both;
  animation-delay: var(--delay);

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 25px rgba(0, 0, 0, 0.08);
  }
}

.stat-icon-wrap {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.filter-card {
  background: var(--card-bg) !important;
  backdrop-filter: blur(20px);
  border: 1px solid var(--card-border);
  border-radius: 16px !important;
}

.table-card {
  background: var(--card-bg) !important;
  backdrop-filter: blur(20px);
  border: 1px solid var(--card-border);
  border-radius: 16px !important;
  overflow: hidden;
}

.users-table {
  th {
    text-transform: uppercase;
    font-size: 0.75rem;
    letter-spacing: 0.5px;
    font-weight: 600;
    color: var(--text-secondary) !important;
    border-bottom: 1px solid var(--card-border) !important;
    background: var(--bg-subtle) !important;
  }

  td {
    border-bottom: 1px solid var(--card-border) !important;
  }

  tr {
    animation: fadeInUp 0.3s ease both;
    animation-delay: var(--delay);
    transition: background 0.2s;

    &:hover {
      background: var(--bg-subtle);
    }
  }
}

.user-avatar {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 13px;
  font-weight: 700;
  flex-shrink: 0;
}

.action-menu {
  border-radius: 12px !important;
  min-width: 180px;
}

.dialog-card {
  background: var(--dialog-bg) !important;
  border: 1px solid var(--card-border);
  border-radius: 16px !important;
}

.dialog-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  &.create { background: rgba(16, 185, 129, 0.15); color: #10b981; }
  &.edit { background: rgba(99, 102, 241, 0.15); color: #6366f1; }
  &.warning { background: rgba(245, 158, 11, 0.15); color: #f59e0b; }
  &.info { background: rgba(59, 130, 246, 0.15); color: #3b82f6; }
}

.delete-icon-wrap {
  width: 72px;
  height: 72px;
  border-radius: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(239, 68, 68, 0.12);

  &.warning { background: rgba(245, 158, 11, 0.12); }
}

.sessions-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.session-item {
  padding: 12px;
  border-radius: 12px;
  background: var(--bg-subtle);
  border: 1px solid var(--card-border);
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
