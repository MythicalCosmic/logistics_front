<!-- src/pages/users.vue -->

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

// Permissions
const canCreate = computed(() => authStore.hasPermission('users.create'))
const canEdit = computed(() => authStore.hasPermission('users.update'))
const canDelete = computed(() => authStore.hasPermission('users.delete'))

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
const dialogLoading = ref(false)

// Form Data
const defaultForm = {
  email: '',
  password: '',
  first_name: '',
  last_name: '',
  middle_name: '',
  role_ids: [],
  is_active: true,
}
const form = ref({ ...defaultForm })
const formErrors = ref({})
const selectedUser = ref(null)
const newPassword = ref('')

// Stats
const serverStats = ref(null)
const stats = computed(() => {
  if (serverStats.value) {
    const adminRole = serverStats.value.roles_breakdown?.find(r => r.slug === 'admin')
    return {
      total: serverStats.value.total_users || 0,
      active: serverStats.value.active_users || 0,
      inactive: serverStats.value.inactive_users || 0,
      admins: adminRole?.user_count || 0,
    }
  }
  return { total: totalUsers.value, active: 0, inactive: 0, admins: 0 }
})

const fetchStats = async () => {
  try {
    const response = await api.get('/admin-api/users/stats')
    if (response.data.success) {
      serverStats.value = response.data.data
    }
  } catch (error) {
    // Stats are non-critical
  }
}

// Fetch users
const fetchUsers = async () => {
  loading.value = true
  
  try {
    const params = new URLSearchParams({
      page: page.value,
      per_page: perPage.value,
    })
    
    if (search.value) params.append('search', search.value)
    if (filterRole.value) params.append('role', filterRole.value)
    if (filterStatus.value !== null && filterStatus.value !== '') {
      params.append('is_active', filterStatus.value)
    }
    
    const response = await api.get(`/admin-api/users?${params}`)
    
    if (response.data.success) {
      users.value = response.data.data?.users || []
      totalUsers.value = response.data.data?.pagination?.total || 0
    }
  } catch (error) {
    console.error('Failed to fetch users:', error)
    toastError('Failed to load users')
  } finally {
    loading.value = false
  }
}

// Fetch roles for dropdown
const fetchRoles = async () => {
  try {
    const response = await api.get('/admin-api/roles')
    if (response.data.success) {
      roles.value = response.data.data?.roles || response.data.data || []
    }
  } catch (error) {
    console.error('Failed to fetch roles:', error)
  }
}

// Create user
const handleCreate = async () => {
  formErrors.value = {}
  
  if (!form.value.email) formErrors.value.email = 'Email is required'
  if (!form.value.password) formErrors.value.password = 'Password is required'
  if (form.value.password && form.value.password.length < 6) {
    formErrors.value.password = 'Password must be at least 6 characters'
  }
  if (!form.value.first_name) formErrors.value.first_name = 'First name is required'
  if (!form.value.last_name) formErrors.value.last_name = 'Last name is required'
  
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
    if (form.value.role_ids?.length) payload.role_id = form.value.role_ids[0]

    const response = await api.post('/admin-api/users/create', payload)
    
    if (response.data.success) {
      toastSuccess('User created successfully')
      showCreateDialog.value = false
      resetForm()
      fetchUsers()
      fetchStats()
    }
  } catch (error) {
    // Handled by interceptor
  } finally {
    dialogLoading.value = false
  }
}

// Update user
const handleUpdate = async () => {
  formErrors.value = {}
  
  if (!form.value.email) formErrors.value.email = 'Email is required'
  if (!form.value.first_name) formErrors.value.first_name = 'First name is required'
  if (!form.value.last_name) formErrors.value.last_name = 'Last name is required'
  
  if (Object.keys(formErrors.value).length > 0) return
  
  dialogLoading.value = true
  
  try {
    await api.put(`/admin-api/users/${selectedUser.value.id}/update`, {
      email: form.value.email,
      first_name: form.value.first_name,
      last_name: form.value.last_name,
      phone: form.value.phone || '',
      is_active: form.value.is_active,
    })

    // Sync roles: compare old vs new
    // selectedUser.roles is an array of slugs from the list endpoint
    const oldRoleIds = (selectedUser.value.roles || [])
      .map(slug => roles.value.find(r => r.slug === slug)?.id)
      .filter(Boolean)
    const newRoleIds = form.value.role_ids || []

    // Assign new roles
    for (const roleId of newRoleIds) {
      if (!oldRoleIds.includes(roleId)) {
        await api.post(`/admin-api/users/${selectedUser.value.id}/roles`, { role_id: roleId })
      }
    }

    // Remove old roles
    for (const roleId of oldRoleIds) {
      if (!newRoleIds.includes(roleId)) {
        await api.delete(`/admin-api/users/${selectedUser.value.id}/roles/remove`, { data: { role_id: roleId } })
      }
    }

    toastSuccess('User updated successfully')
    showEditDialog.value = false
    resetForm()
    fetchUsers()
  } catch (error) {
    // Handled by interceptor
  } finally {
    dialogLoading.value = false
  }
}

// Delete user
const handleDelete = async () => {
  if (!selectedUser.value) return
  
  dialogLoading.value = true
  
  try {
    const response = await api.delete(`/admin-api/users/${selectedUser.value.id}/delete`)
    
    if (response.data.success) {
      toastSuccess('User deleted successfully')
      showDeleteDialog.value = false
      selectedUser.value = null
      fetchUsers()
      fetchStats()
    }
  } catch (error) {
    // Handled by interceptor
  } finally {
    dialogLoading.value = false
  }
}

// Change password
const handleChangePassword = async () => {
  if (!newPassword.value || newPassword.value.length < 6) {
    toastError('Password must be at least 6 characters')
    return
  }
  
  dialogLoading.value = true
  
  try {
    const response = await api.post(`/admin-api/users/${selectedUser.value.id}/change-password`, {
      new_password: newPassword.value,
    })
    
    if (response.data.success) {
      toastSuccess('Password changed successfully')
      showPasswordDialog.value = false
      newPassword.value = ''
      selectedUser.value = null
    }
  } catch (error) {
    // Handled by interceptor
  } finally {
    dialogLoading.value = false
  }
}

// Open edit dialog
const openEditDialog = (user) => {
  selectedUser.value = user
  // user.roles from list is an array of slugs like ["admin", "driver"]
  // Map slugs to IDs using the fetched roles list
  const roleIds = (user.roles || [])
    .map(slug => roles.value.find(r => r.slug === slug)?.id)
    .filter(Boolean)

  form.value = {
    email: user.email,
    password: '',
    first_name: user.first_name,
    last_name: user.last_name,
    middle_name: '',
    role_ids: roleIds,
    is_active: user.is_active,
  }
  showEditDialog.value = true
}

// Open delete dialog
const openDeleteDialog = (user) => {
  selectedUser.value = user
  showDeleteDialog.value = true
}

// Open password dialog
const openPasswordDialog = (user) => {
  selectedUser.value = user
  newPassword.value = ''
  showPasswordDialog.value = true
}

// Reset form
const resetForm = () => {
  form.value = { ...defaultForm }
  formErrors.value = {}
  selectedUser.value = null
}

// Format date
const formatDate = (dateString) => {
  if (!dateString) return '-'
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

// Get initials
const getInitials = (user) => {
  return `${user.first_name?.charAt(0) || ''}${user.last_name?.charAt(0) || ''}`.toUpperCase()
}

// Get avatar gradient
const getAvatarGradient = (user) => {
  const colors = [
    ['#667eea', '#764ba2'],
    ['#f093fb', '#f5576c'],
    ['#4facfe', '#00f2fe'],
    ['#43e97b', '#38f9d7'],
    ['#fa709a', '#fee140'],
    ['#a8edea', '#fed6e3'],
    ['#ff9a9e', '#fecfef'],
    ['#ffecd2', '#fcb69f'],
  ]
  const index = (user.id || user.first_name?.charCodeAt(0) || 0) % colors.length
  return `linear-gradient(135deg, ${colors[index][0]}, ${colors[index][1]})`
}

// Get role color
const getRoleColor = (roleName) => {
  const name = roleName?.toLowerCase() || ''
  if (name.includes('super')) return { bg: 'rgba(244, 67, 54, 0.15)', text: '#f44336', border: 'rgba(244, 67, 54, 0.3)' }
  if (name.includes('admin')) return { bg: 'rgba(255, 152, 0, 0.15)', text: '#ff9800', border: 'rgba(255, 152, 0, 0.3)' }
  if (name.includes('manager')) return { bg: 'rgba(156, 39, 176, 0.15)', text: '#9c27b0', border: 'rgba(156, 39, 176, 0.3)' }
  return { bg: 'rgba(33, 150, 243, 0.15)', text: '#2196f3', border: 'rgba(33, 150, 243, 0.3)' }
}

// Watch for filter changes
let searchTimeout = null
watch(search, () => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    page.value = 1
    fetchUsers()
  }, 300)
})

watch([filterRole, filterStatus], () => {
  page.value = 1
  fetchUsers()
})

watch(page, () => {
  fetchUsers()
})

onMounted(() => {
  fetchUsers()
  fetchRoles()
  fetchStats()
})
</script>

<template>
  <div class="users-page" :class="{ 'theme-light': !isDark }">
    <!-- Animated Background -->
    <div class="page-bg">
      <div class="bg-gradient"></div>
      <div class="bg-grid"></div>
      <div class="floating-shapes">
        <div class="shape shape-1"></div>
        <div class="shape shape-2"></div>
        <div class="shape shape-3"></div>
      </div>
    </div>

    <!-- Header Section -->
    <div class="page-header">
      <div class="header-content">
        <div class="header-left">
          <div class="header-icon">
            <VIcon icon="bx-group" size="32" />
          </div>
          <div>
            <h1 class="page-title">User Management</h1>
            <p class="page-subtitle">Control access and permissions across your platform</p>
          </div>
        </div>
        <VBtn
          v-if="canCreate"
          class="add-btn"
          size="large"
          @click="showCreateDialog = true"
        >
          <VIcon icon="bx-plus" class="me-2" />
          <span class="btn-text">Add User</span>
        </VBtn>
      </div>
    </div>

    <!-- Stats Cards -->
    <div class="stats-grid">
      <div class="stat-card stat-total">
        <div class="stat-icon">
          <VIcon icon="bx-user" size="28" />
        </div>
        <div class="stat-content">
          <span class="stat-value">{{ totalUsers }}</span>
          <span class="stat-label">Total Users</span>
        </div>
        <div class="stat-decoration"></div>
      </div>
      
      <div class="stat-card stat-active">
        <div class="stat-icon">
          <VIcon icon="bx-check-circle" size="28" />
        </div>
        <div class="stat-content">
          <span class="stat-value">{{ stats.active }}</span>
          <span class="stat-label">Active</span>
        </div>
        <div class="stat-decoration"></div>
      </div>
      
      <div class="stat-card stat-inactive">
        <div class="stat-icon">
          <VIcon icon="bx-x-circle" size="28" />
        </div>
        <div class="stat-content">
          <span class="stat-value">{{ stats.inactive }}</span>
          <span class="stat-label">Inactive</span>
        </div>
        <div class="stat-decoration"></div>
      </div>
      
      <div class="stat-card stat-admins">
        <div class="stat-icon">
          <VIcon icon="bx-shield" size="28" />
        </div>
        <div class="stat-content">
          <span class="stat-value">{{ stats.admins }}</span>
          <span class="stat-label">Admins</span>
        </div>
        <div class="stat-decoration"></div>
      </div>
    </div>

    <!-- Filters Section -->
    <div class="filters-card">
      <div class="filters-header">
        <VIcon icon="bx-filter-alt" class="filter-icon" />
        <span>Filters</span>
      </div>
      <div class="filters-body">
        <div class="filter-item search-filter">
          <VTextField
            v-model="search"
            placeholder="Search by name or email..."
            variant="outlined"
            density="comfortable"
            hide-details
            clearable
            class="search-input"
          >
            <template #prepend-inner>
              <VIcon icon="bx-search" class="search-icon" />
            </template>
          </VTextField>
        </div>
        
        <div class="filter-item">
          <VSelect
            v-model="filterRole"
            :items="roles"
            item-title="name"
            item-value="slug"
            placeholder="All Roles"
            variant="outlined"
            density="comfortable"
            hide-details
            clearable
            class="filter-select"
          >
            <template #prepend-inner>
              <VIcon icon="bx-crown" size="20" />
            </template>
          </VSelect>
        </div>
        
        <div class="filter-item">
          <VSelect
            v-model="filterStatus"
            :items="[
              { title: 'Active', value: 'true' },
              { title: 'Inactive', value: 'false' },
            ]"
            item-title="title"
            item-value="value"
            placeholder="All Status"
            variant="outlined"
            density="comfortable"
            hide-details
            clearable
            class="filter-select"
          >
            <template #prepend-inner>
              <VIcon icon="bx-pulse" size="20" />
            </template>
          </VSelect>
        </div>
        
        <VBtn
          variant="tonal"
          class="clear-btn"
          @click="search = ''; filterRole = null; filterStatus = null"
        >
          <VIcon icon="bx-refresh" class="me-2" />
          Reset
        </VBtn>
      </div>
    </div>

    <!-- Users List -->
    <div class="users-container">
      <!-- Loading State -->
      <div v-if="loading" class="loading-state">
        <div class="loading-spinner">
          <div class="spinner"></div>
        </div>
        <p>Loading users...</p>
      </div>

      <!-- Empty State -->
      <div v-else-if="!users.length" class="empty-state">
        <div class="empty-icon">
          <VIcon icon="bx-user-x" size="64" />
        </div>
        <h3>No Users Found</h3>
        <p>Try adjusting your filters or add a new user to get started.</p>
        <VBtn
          v-if="canCreate"
          class="add-btn mt-4"
          @click="showCreateDialog = true"
        >
          <VIcon icon="bx-plus" class="me-2" />
          Add First User
        </VBtn>
      </div>

      <!-- Users Grid -->
      <div v-else class="users-grid">
        <div
          v-for="(user, index) in users"
          :key="user.id"
          class="user-card"
          :style="{ '--delay': `${index * 0.05}s` }"
        >
          <div class="card-glow"></div>
          
          <!-- User Header -->
          <div class="user-header">
            <div class="user-avatar" :style="{ background: getAvatarGradient(user) }">
              <span>{{ getInitials(user) }}</span>
              <div class="status-indicator" :class="{ active: user.is_active }"></div>
            </div>
            
            <div class="user-info">
              <h3 class="user-name">{{ user.first_name }} {{ user.last_name }}</h3>
              <p class="user-email">{{ user.email }}</p>
              <p v-if="user.middle_name" class="user-middle">{{ user.middle_name }}</p>
            </div>

            <!-- Actions Menu -->
            <VMenu location="bottom end" :close-on-content-click="true">
              <template #activator="{ props }">
                <VBtn
                  v-bind="props"
                  icon
                  variant="text"
                  class="menu-btn"
                >
                  <VIcon icon="bx-dots-vertical-rounded" />
                </VBtn>
              </template>
              <VList class="action-menu">
                <VListItem v-if="canEdit" @click="openEditDialog(user)">
                  <template #prepend>
                    <VIcon icon="bx-edit" color="primary" />
                  </template>
                  <VListItemTitle>Edit User</VListItemTitle>
                </VListItem>
                <VListItem v-if="canEdit" @click="openPasswordDialog(user)">
                  <template #prepend>
                    <VIcon icon="bx-key" color="warning" />
                  </template>
                  <VListItemTitle>Change Password</VListItemTitle>
                </VListItem>
                <VListItem
                  v-if="canDelete && user.id !== authStore.user?.id"
                  @click="openDeleteDialog(user)"
                  class="delete-item"
                >
                  <template #prepend>
                    <VIcon icon="bx-trash" color="error" />
                  </template>
                  <VListItemTitle class="text-error">Delete User</VListItemTitle>
                </VListItem>
              </VList>
            </VMenu>
          </div>

          <!-- Roles -->
          <div class="user-roles">
            <template v-if="user.roles?.length">
              <span
                v-for="role in user.roles"
                :key="role"
                class="role-badge"
                :style="{
                  background: getRoleColor(role).bg,
                  color: getRoleColor(role).text,
                  borderColor: getRoleColor(role).border,
                }"
              >
                {{ role }}
              </span>
            </template>
            <span v-else class="no-roles">No roles assigned</span>
          </div>

          <!-- Footer -->
          <div class="user-footer">
            <div class="footer-item">
              <VIcon icon="bx-calendar" size="16" />
              <span>{{ formatDate(user.created_at) }}</span>
            </div>
            <div class="status-badge" :class="{ active: user.is_active }">
              <span class="status-dot"></span>
              {{ user.is_active ? 'Active' : 'Inactive' }}
            </div>
          </div>

          <!-- Quick Actions (Mobile) -->
          <div class="quick-actions">
            <VBtn
              v-if="canEdit"
              icon
              size="small"
              variant="tonal"
              color="primary"
              @click="openEditDialog(user)"
            >
              <VIcon icon="bx-edit" size="18" />
            </VBtn>
            <VBtn
              v-if="canEdit"
              icon
              size="small"
              variant="tonal"
              color="warning"
              @click="openPasswordDialog(user)"
            >
              <VIcon icon="bx-key" size="18" />
            </VBtn>
            <VBtn
              v-if="canDelete && user.id !== authStore.user?.id"
              icon
              size="small"
              variant="tonal"
              color="error"
              @click="openDeleteDialog(user)"
            >
              <VIcon icon="bx-trash" size="18" />
            </VBtn>
          </div>
        </div>
      </div>

      <!-- Pagination -->
      <div v-if="users.length" class="pagination-container">
        <div class="pagination-info">
          Showing <strong>{{ (page - 1) * perPage + 1 }}</strong> to 
          <strong>{{ Math.min(page * perPage, totalUsers) }}</strong> of 
          <strong>{{ totalUsers }}</strong> users
        </div>
        <div class="pagination-controls">
          <VBtn
            icon
            variant="tonal"
            :disabled="page === 1"
            @click="page--"
            class="page-btn"
          >
            <VIcon icon="bx-chevron-left" />
          </VBtn>
          
          <div class="page-numbers">
            <template v-for="p in Math.min(totalPages, 5)" :key="p">
              <VBtn
                :variant="page === p ? 'flat' : 'text'"
                :class="{ 'active-page': page === p }"
                class="page-num"
                @click="page = p"
              >
                {{ p }}
              </VBtn>
            </template>
            <span v-if="totalPages > 5" class="page-ellipsis">...</span>
          </div>
          
          <VBtn
            icon
            variant="tonal"
            :disabled="page >= totalPages"
            @click="page++"
            class="page-btn"
          >
            <VIcon icon="bx-chevron-right" />
          </VBtn>
        </div>
      </div>
    </div>

    <!-- Create Dialog -->
    <VDialog v-model="showCreateDialog" max-width="600" persistent class="custom-dialog">
      <VCard class="dialog-card">
        <div class="dialog-header">
          <div class="dialog-icon create">
            <VIcon icon="bx-user-plus" size="28" />
          </div>
          <div>
            <h2 class="dialog-title">Create New User</h2>
            <p class="dialog-subtitle">Add a new user to your platform</p>
          </div>
          <VBtn icon variant="text" class="close-btn" @click="showCreateDialog = false; resetForm()">
            <VIcon icon="bx-x" />
          </VBtn>
        </div>
        
        <VCardText class="dialog-body">
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label">First Name <span class="required">*</span></label>
              <VTextField
                v-model="form.first_name"
                variant="outlined"
                density="comfortable"
                placeholder="Enter first name"
                :error-messages="formErrors.first_name"
              />
            </div>
            <div class="form-group">
              <label class="form-label">Last Name <span class="required">*</span></label>
              <VTextField
                v-model="form.last_name"
                variant="outlined"
                density="comfortable"
                placeholder="Enter last name"
                :error-messages="formErrors.last_name"
              />
            </div>
            <div class="form-group full-width">
              <label class="form-label">Middle Name</label>
              <VTextField
                v-model="form.middle_name"
                variant="outlined"
                density="comfortable"
                placeholder="Enter middle name (optional)"
              />
            </div>
            <div class="form-group full-width">
              <label class="form-label">Email Address <span class="required">*</span></label>
              <VTextField
                v-model="form.email"
                type="email"
                variant="outlined"
                density="comfortable"
                placeholder="user@example.com"
                :error-messages="formErrors.email"
              >
                <template #prepend-inner>
                  <VIcon icon="bx-envelope" />
                </template>
              </VTextField>
            </div>
            <div class="form-group full-width">
              <label class="form-label">Password <span class="required">*</span></label>
              <VTextField
                v-model="form.password"
                type="password"
                variant="outlined"
                density="comfortable"
                placeholder="Minimum 6 characters"
                :error-messages="formErrors.password"
              >
                <template #prepend-inner>
                  <VIcon icon="bx-lock-alt" />
                </template>
              </VTextField>
            </div>
            <div class="form-group full-width">
              <label class="form-label">Assign Roles</label>
              <VSelect
                v-model="form.role_ids"
                :items="roles"
                item-title="name"
                item-value="id"
                variant="outlined"
                density="comfortable"
                multiple
                chips
                closable-chips
                placeholder="Select roles"
              >
                <template #prepend-inner>
                  <VIcon icon="bx-crown" />
                </template>
              </VSelect>
            </div>
            <div class="form-group full-width">
              <div class="switch-group">
                <div class="switch-info">
                  <VIcon icon="bx-check-shield" class="switch-icon" />
                  <div>
                    <span class="switch-label">Account Status</span>
                    <span class="switch-desc">User can access the platform when active</span>
                  </div>
                </div>
                <VSwitch
                  v-model="form.is_active"
                  color="success"
                  hide-details
                />
              </div>
            </div>
          </div>
        </VCardText>
        
        <div class="dialog-footer">
          <VBtn variant="outlined" size="large" @click="showCreateDialog = false; resetForm()">
            Cancel
          </VBtn>
          <VBtn class="submit-btn" size="large" :loading="dialogLoading" @click="handleCreate">
            <VIcon icon="bx-plus" class="me-2" />
            Create User
          </VBtn>
        </div>
      </VCard>
    </VDialog>

    <!-- Edit Dialog -->
    <VDialog v-model="showEditDialog" max-width="600" persistent class="custom-dialog">
      <VCard class="dialog-card">
        <div class="dialog-header">
          <div class="dialog-icon edit">
            <VIcon icon="bx-edit" size="28" />
          </div>
          <div>
            <h2 class="dialog-title">Edit User</h2>
            <p class="dialog-subtitle">Update user information and permissions</p>
          </div>
          <VBtn icon variant="text" class="close-btn" @click="showEditDialog = false; resetForm()">
            <VIcon icon="bx-x" />
          </VBtn>
        </div>
        
        <VCardText class="dialog-body">
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label">First Name <span class="required">*</span></label>
              <VTextField
                v-model="form.first_name"
                variant="outlined"
                density="comfortable"
                placeholder="Enter first name"
                :error-messages="formErrors.first_name"
              />
            </div>
            <div class="form-group">
              <label class="form-label">Last Name <span class="required">*</span></label>
              <VTextField
                v-model="form.last_name"
                variant="outlined"
                density="comfortable"
                placeholder="Enter last name"
                :error-messages="formErrors.last_name"
              />
            </div>
            <div class="form-group full-width">
              <label class="form-label">Middle Name</label>
              <VTextField
                v-model="form.middle_name"
                variant="outlined"
                density="comfortable"
                placeholder="Enter middle name (optional)"
              />
            </div>
            <div class="form-group full-width">
              <label class="form-label">Email Address <span class="required">*</span></label>
              <VTextField
                v-model="form.email"
                type="email"
                variant="outlined"
                density="comfortable"
                placeholder="user@example.com"
                :error-messages="formErrors.email"
              >
                <template #prepend-inner>
                  <VIcon icon="bx-envelope" />
                </template>
              </VTextField>
            </div>
            <div class="form-group full-width">
              <label class="form-label">Assign Roles</label>
              <VSelect
                v-model="form.role_ids"
                :items="roles"
                item-title="name"
                item-value="id"
                variant="outlined"
                density="comfortable"
                multiple
                chips
                closable-chips
                placeholder="Select roles"
              >
                <template #prepend-inner>
                  <VIcon icon="bx-crown" />
                </template>
              </VSelect>
            </div>
            <div class="form-group full-width">
              <div class="switch-group">
                <div class="switch-info">
                  <VIcon icon="bx-check-shield" class="switch-icon" />
                  <div>
                    <span class="switch-label">Account Status</span>
                    <span class="switch-desc">User can access the platform when active</span>
                  </div>
                </div>
                <VSwitch
                  v-model="form.is_active"
                  color="success"
                  hide-details
                />
              </div>
            </div>
          </div>
        </VCardText>
        
        <div class="dialog-footer">
          <VBtn variant="outlined" size="large" @click="showEditDialog = false; resetForm()">
            Cancel
          </VBtn>
          <VBtn class="submit-btn edit" size="large" :loading="dialogLoading" @click="handleUpdate">
            <VIcon icon="bx-check" class="me-2" />
            Save Changes
          </VBtn>
        </div>
      </VCard>
    </VDialog>

    <!-- Delete Dialog -->
    <VDialog v-model="showDeleteDialog" max-width="450" class="custom-dialog">
      <VCard class="dialog-card delete-dialog">
        <div class="delete-content">
          <div class="delete-icon">
            <VIcon icon="bx-error-circle" size="64" />
          </div>
          <h2 class="delete-title">Delete User</h2>
          <p class="delete-message">
            Are you sure you want to delete 
            <strong>{{ selectedUser?.first_name }} {{ selectedUser?.last_name }}</strong>?
          </p>
          <p class="delete-warning">
            <VIcon icon="bx-info-circle" size="16" />
            This action cannot be undone.
          </p>
        </div>
        
        <div class="dialog-footer delete-footer">
          <VBtn variant="outlined" size="large" @click="showDeleteDialog = false">
            Cancel
          </VBtn>
          <VBtn color="error" size="large" :loading="dialogLoading" @click="handleDelete">
            <VIcon icon="bx-trash" class="me-2" />
            Delete User
          </VBtn>
        </div>
      </VCard>
    </VDialog>

    <!-- Password Dialog -->
    <VDialog v-model="showPasswordDialog" max-width="450" class="custom-dialog">
      <VCard class="dialog-card">
        <div class="dialog-header">
          <div class="dialog-icon warning">
            <VIcon icon="bx-key" size="28" />
          </div>
          <div>
            <h2 class="dialog-title">Change Password</h2>
            <p class="dialog-subtitle">
              Set a new password for {{ selectedUser?.first_name }} {{ selectedUser?.last_name }}
            </p>
          </div>
          <VBtn icon variant="text" class="close-btn" @click="showPasswordDialog = false; newPassword = ''">
            <VIcon icon="bx-x" />
          </VBtn>
        </div>
        
        <VCardText class="dialog-body">
          <div class="form-group full-width">
            <label class="form-label">New Password <span class="required">*</span></label>
            <VTextField
              v-model="newPassword"
              type="password"
              variant="outlined"
              density="comfortable"
              placeholder="Minimum 6 characters"
            >
              <template #prepend-inner>
                <VIcon icon="bx-lock-alt" />
              </template>
            </VTextField>
          </div>
        </VCardText>
        
        <div class="dialog-footer">
          <VBtn variant="outlined" size="large" @click="showPasswordDialog = false; newPassword = ''">
            Cancel
          </VBtn>
          <VBtn color="warning" size="large" :loading="dialogLoading" @click="handleChangePassword">
            <VIcon icon="bx-check" class="me-2" />
            Update Password
          </VBtn>
        </div>
      </VCard>
    </VDialog>
  </div>
</template>

<style scoped>
/* Theme Variables */
.users-page {
  --primary: #6366f1;
  --primary-light: #818cf8;
  --primary-dark: #4f46e5;
  --success: #10b981;
  --warning: #f59e0b;
  --error: #ef4444;
  --card-bg: rgba(30, 30, 46, 0.7);
  --card-bg-subtle: rgba(255, 255, 255, 0.03);
  --card-border: rgba(255, 255, 255, 0.08);
  --card-border-hover: rgba(255, 255, 255, 0.15);
  --surface-bg: rgba(30, 30, 46, 0.5);
  --dialog-bg: #1e1e2e;
  --dialog-border: rgba(255, 255, 255, 0.1);
  --dialog-footer-bg: rgba(0, 0, 0, 0.2);
  --input-bg: rgba(255, 255, 255, 0.05);
  --hover-bg: rgba(255, 255, 255, 0.05);
  --hover-bg-strong: rgba(255, 255, 255, 0.1);
  --text-heading: #f8fafc;
  --text-body: #e2e8f0;
  --text-secondary: #94a3b8;
  --text-muted: #64748b;
  --border-line: rgba(255, 255, 255, 0.06);
  --status-ring: #1e1e2e;
  --grad-base-start: #0f0f1a;
  --grad-base-end: #1a1a2e;
  --grid-line: rgba(255, 255, 255, 0.02);
  --shape-opacity: 0.4;
  --shadow-card: 0 8px 24px rgba(0, 0, 0, 0.2);
  --shadow-btn: 0 8px 32px rgba(99, 102, 241, 0.35);
}

.users-page.theme-light {
  --card-bg: rgba(255, 255, 255, 0.9);
  --card-bg-subtle: rgba(0, 0, 0, 0.02);
  --card-border: rgba(0, 0, 0, 0.08);
  --card-border-hover: rgba(0, 0, 0, 0.14);
  --surface-bg: rgba(255, 255, 255, 0.8);
  --dialog-bg: #ffffff;
  --dialog-border: rgba(0, 0, 0, 0.1);
  --dialog-footer-bg: rgba(0, 0, 0, 0.03);
  --input-bg: rgba(0, 0, 0, 0.03);
  --hover-bg: rgba(0, 0, 0, 0.04);
  --hover-bg-strong: rgba(0, 0, 0, 0.08);
  --text-heading: #1e293b;
  --text-body: #334155;
  --text-secondary: #64748b;
  --text-muted: #94a3b8;
  --border-line: rgba(0, 0, 0, 0.06);
  --status-ring: #ffffff;
  --grad-base-start: #f8f9fe;
  --grad-base-end: #f1f3f9;
  --grid-line: rgba(0, 0, 0, 0.03);
  --shape-opacity: 0.12;
  --shadow-card: 0 2px 12px rgba(0, 0, 0, 0.06);
  --shadow-btn: 0 8px 32px rgba(99, 102, 241, 0.2);
}

/* Page Layout */
.users-page {
  position: relative;
  min-height: 100vh;
  padding: 24px;
  overflow-x: hidden;
}

/* Animated Background */
.page-bg {
  position: fixed;
  inset: 0;
  z-index: -1;
  overflow: hidden;
}

.bg-gradient {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse at 0% 0%, rgba(99, 102, 241, 0.15) 0%, transparent 50%),
    radial-gradient(ellipse at 100% 0%, rgba(139, 92, 246, 0.1) 0%, transparent 50%),
    radial-gradient(ellipse at 50% 100%, rgba(16, 185, 129, 0.08) 0%, transparent 50%),
    linear-gradient(180deg, var(--grad-base-start) 0%, var(--grad-base-end) 100%);
}

.bg-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(var(--grid-line) 1px, transparent 1px),
    linear-gradient(90deg, var(--grid-line) 1px, transparent 1px);
  background-size: 60px 60px;
  mask-image: radial-gradient(ellipse at center, black 30%, transparent 70%);
}

.floating-shapes {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

.shape {
  position: absolute;
  border-radius: 50%;
  filter: blur(100px);
  opacity: var(--shape-opacity);
  animation: float 20s ease-in-out infinite;
}

.shape-1 {
  width: 600px;
  height: 600px;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  top: -200px;
  left: -200px;
  animation-delay: 0s;
}

.shape-2 {
  width: 400px;
  height: 400px;
  background: linear-gradient(135deg, #10b981, #06b6d4);
  bottom: -100px;
  right: -100px;
  animation-delay: -7s;
}

.shape-3 {
  width: 300px;
  height: 300px;
  background: linear-gradient(135deg, #f59e0b, #ef4444);
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  animation-delay: -14s;
}

@keyframes float {
  0%, 100% { transform: translate(0, 0) scale(1); }
  33% { transform: translate(30px, -30px) scale(1.05); }
  66% { transform: translate(-20px, 20px) scale(0.95); }
}

/* Header */
.page-header {
  margin-bottom: 32px;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 20px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.header-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  border-radius: 16px;
  color: white;
  box-shadow: 0 8px 32px rgba(99, 102, 241, 0.3);
}

.page-title {
  font-size: 32px;
  font-weight: 700;
  color: var(--text-heading);
  margin: 0;
  letter-spacing: -0.5px;
}

.page-subtitle {
  font-size: 15px;
  color: var(--text-secondary);
  margin: 4px 0 0;
}

.add-btn {
  background: linear-gradient(135deg, #6366f1, #8b5cf6) !important;
  color: white !important;
  font-weight: 600;
  padding: 0 28px !important;
  height: 48px !important;
  border-radius: 14px !important;
  box-shadow: var(--shadow-btn);
  transition: all 0.3s ease;
}

.add-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 40px rgba(99, 102, 241, 0.45);
}

/* Stats Grid */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
  margin-bottom: 28px;
}

.stat-card {
  position: relative;
  background: var(--card-bg);
  backdrop-filter: blur(20px);
  border: 1px solid var(--card-border);
  border-radius: 20px;
  padding: 24px;
  display: flex;
  align-items: center;
  gap: 16px;
  overflow: hidden;
  transition: all 0.3s ease;
}

.stat-card:hover {
  transform: translateY(-4px);
  border-color: var(--card-border-hover);
}

.stat-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  border-radius: 14px;
  flex-shrink: 0;
}

.stat-total .stat-icon {
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(139, 92, 246, 0.2));
  color: var(--primary-light);
}

.stat-active .stat-icon {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(6, 182, 212, 0.2));
  color: #34d399;
}

.stat-inactive .stat-icon {
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(244, 114, 182, 0.2));
  color: #f87171;
}

.stat-admins .stat-icon {
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(249, 115, 22, 0.2));
  color: #fbbf24;
}

.stat-content {
  display: flex;
  flex-direction: column;
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-heading);
  line-height: 1;
}

.stat-label {
  font-size: 13px;
  color: var(--text-secondary);
  margin-top: 4px;
}

.stat-decoration {
  position: absolute;
  right: -30px;
  bottom: -30px;
  width: 120px;
  height: 120px;
  border-radius: 50%;
  opacity: 0.08;
}

.stat-total .stat-decoration {
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
}

.stat-active .stat-decoration {
  background: linear-gradient(135deg, #10b981, #06b6d4);
}

.stat-inactive .stat-decoration {
  background: linear-gradient(135deg, #ef4444, #f472b6);
}

.stat-admins .stat-decoration {
  background: linear-gradient(135deg, #f59e0b, #f97316);
}

/* Filters */
.filters-card {
  background: var(--card-bg);
  backdrop-filter: blur(20px);
  border: 1px solid var(--card-border);
  border-radius: 20px;
  padding: 20px;
  margin-bottom: 28px;
}

.filters-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 16px;
}

.filter-icon {
  color: var(--primary-light);
}

.filters-body {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.filter-item {
  flex: 1;
  min-width: 200px;
}

.search-filter {
  flex: 2;
  min-width: 280px;
}

.search-input :deep(.v-field) {
  background: var(--input-bg);
  border-radius: 12px;
}

.search-icon {
  color: var(--text-secondary);
}

.filter-select :deep(.v-field) {
  background: var(--input-bg);
  border-radius: 12px;
}

.clear-btn {
  height: 48px !important;
  border-radius: 12px !important;
  flex-shrink: 0;
}

/* Users Container */
.users-container {
  background: var(--surface-bg);
  backdrop-filter: blur(20px);
  border: 1px solid var(--card-border);
  border-radius: 24px;
  padding: 24px;
  min-height: 400px;
}

/* Loading State */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  color: var(--text-secondary);
}

.loading-spinner {
  margin-bottom: 16px;
}

.spinner {
  width: 48px;
  height: 48px;
  border: 3px solid rgba(99, 102, 241, 0.2);
  border-top-color: #6366f1;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Empty State */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  text-align: center;
}

.empty-icon {
  width: 100px;
  height: 100px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(99, 102, 241, 0.1);
  border-radius: 24px;
  color: var(--primary-light);
  margin-bottom: 24px;
}

.empty-state h3 {
  font-size: 22px;
  font-weight: 600;
  color: var(--text-heading);
  margin: 0 0 8px;
}

.empty-state p {
  color: var(--text-secondary);
  margin: 0;
}

/* Users Grid */
.users-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 20px;
}

/* User Card */
.user-card {
  position: relative;
  background: var(--card-bg-subtle);
  border: 1px solid var(--card-border);
  border-radius: 20px;
  padding: 24px;
  transition: all 0.3s ease;
  animation: cardFadeIn 0.5s ease forwards;
  animation-delay: var(--delay);
  opacity: 0;
  transform: translateY(20px);
}

@keyframes cardFadeIn {
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.user-card:hover {
  border-color: var(--card-glow-border, rgba(99, 102, 241, 0.3));
  transform: translateY(-4px);
}

.user-card:hover .card-glow {
  opacity: 1;
}

.card-glow {
  position: absolute;
  inset: -1px;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.15), transparent, rgba(139, 92, 246, 0.15));
  border-radius: 20px;
  opacity: 0;
  transition: opacity 0.3s ease;
  z-index: -1;
  filter: blur(20px);
}

/* User Header */
.user-header {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  margin-bottom: 16px;
}

.user-avatar {
  position: relative;
  width: 56px;
  height: 56px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: var(--shadow-card);
}

.user-avatar span {
  font-size: 18px;
  font-weight: 700;
  color: white;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.status-indicator {
  position: absolute;
  bottom: -2px;
  right: -2px;
  width: 16px;
  height: 16px;
  background: #ef4444;
  border: 3px solid var(--status-ring);
  border-radius: 50%;
}

.status-indicator.active {
  background: #10b981;
}

.user-info {
  flex: 1;
  min-width: 0;
}

.user-name {
  font-size: 17px;
  font-weight: 600;
  color: var(--text-heading);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-email {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 2px 0 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-middle {
  font-size: 13px;
  color: var(--text-muted);
  margin: 2px 0 0;
}

.menu-btn {
  color: var(--text-muted) !important;
  margin: -8px -8px 0 0;
}

.menu-btn:hover {
  color: var(--text-heading) !important;
  background: var(--hover-bg-strong) !important;
}

/* Action Menu */
.action-menu {
  background: var(--dialog-bg) !important;
  border: 1px solid var(--dialog-border);
  border-radius: 12px !important;
  padding: 8px !important;
  min-width: 180px;
}

.action-menu :deep(.v-list-item) {
  border-radius: 8px;
  min-height: 44px;
}

.action-menu :deep(.v-list-item:hover) {
  background: var(--input-bg);
}

.delete-item {
  margin-top: 4px;
  border-top: 1px solid var(--card-border);
  padding-top: 4px;
}

/* Roles */
.user-roles {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
  min-height: 28px;
}

.role-badge {
  font-size: 12px;
  font-weight: 600;
  padding: 6px 12px;
  border-radius: 8px;
  border: 1px solid;
  letter-spacing: 0.3px;
}

.no-roles {
  font-size: 13px;
  color: var(--text-muted);
  font-style: italic;
}

/* User Footer */
.user-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 16px;
  border-top: 1px solid var(--border-line);
}

.footer-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-muted);
}

.status-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  padding: 6px 12px;
  border-radius: 20px;
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
}

.status-badge.active {
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

/* Quick Actions */
.quick-actions {
  display: none;
  gap: 8px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border-line);
}

/* Pagination */
.pagination-container {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 28px;
  padding-top: 20px;
  border-top: 1px solid var(--border-line);
  flex-wrap: wrap;
  gap: 16px;
}

.pagination-info {
  font-size: 14px;
  color: var(--text-secondary);
}

.pagination-info strong {
  color: var(--text-heading);
  font-weight: 600;
}

.pagination-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.page-btn {
  width: 40px !important;
  height: 40px !important;
  border-radius: 10px !important;
}

.page-numbers {
  display: flex;
  align-items: center;
  gap: 4px;
}

.page-num {
  min-width: 40px !important;
  height: 40px !important;
  border-radius: 10px !important;
  font-weight: 600;
}

.active-page {
  background: linear-gradient(135deg, #6366f1, #8b5cf6) !important;
  color: white !important;
}

.page-ellipsis {
  color: var(--text-muted);
  padding: 0 8px;
}

/* Dialogs */
.custom-dialog :deep(.v-overlay__content) {
  margin: 16px;
}
.custom-dialog :deep(.v-overlay__scrim) {
  background: rgba(0, 0, 0, 0.85) !important;
}

.dialog-card {
  background: var(--dialog-bg) !important;
  border: 1px solid var(--dialog-border);
  border-radius: 24px !important;
  overflow: hidden;
}

.dialog-header {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 24px 24px 0;
  position: relative;
}

.dialog-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  border-radius: 14px;
  flex-shrink: 0;
}

.dialog-icon.create {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(6, 182, 212, 0.2));
  color: #34d399;
}

.dialog-icon.edit {
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(139, 92, 246, 0.2));
  color: var(--primary-light);
}

.dialog-icon.warning {
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(249, 115, 22, 0.2));
  color: #fbbf24;
}

.dialog-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-heading);
  margin: 0;
}

.dialog-subtitle {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 4px 0 0;
}

.close-btn {
  position: absolute !important;
  right: 16px;
  top: 16px;
  color: var(--text-muted) !important;
}

.dialog-body {
  padding: 24px !important;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-group.full-width {
  grid-column: 1 / -1;
}

.form-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-body);
}

.form-label .required {
  color: #f87171;
}

.form-group :deep(.v-field) {
  background: var(--input-bg);
  border-radius: 12px;
}

.switch-group {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--card-bg-subtle);
  border: 1px solid var(--card-border);
  border-radius: 14px;
  padding: 16px;
}

.switch-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.switch-icon {
  color: var(--primary-light);
}

.switch-label {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-heading);
  display: block;
}

.switch-desc {
  font-size: 13px;
  color: var(--text-muted);
  display: block;
  margin-top: 2px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 20px 24px;
  background: var(--dialog-footer-bg);
}

.submit-btn {
  background: linear-gradient(135deg, #10b981, #06b6d4) !important;
  color: white !important;
  font-weight: 600;
}

.submit-btn.edit {
  background: linear-gradient(135deg, #6366f1, #8b5cf6) !important;
}

/* Delete Dialog */
.delete-dialog {
  text-align: center;
}

.delete-content {
  padding: 32px 24px;
}

.delete-icon {
  width: 80px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(239, 68, 68, 0.15);
  border-radius: 20px;
  color: #f87171;
  margin: 0 auto 20px;
}

.delete-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-heading);
  margin: 0 0 12px;
}

.delete-message {
  font-size: 16px;
  color: var(--text-secondary);
  margin: 0 0 16px;
}

.delete-message strong {
  color: var(--text-heading);
}

.delete-warning {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 13px;
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.1);
  padding: 10px 16px;
  border-radius: 8px;
  margin: 0;
}

.delete-footer {
  justify-content: center;
}

/* Mobile Responsive */
@media (max-width: 1200px) {
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .users-page {
    padding: 16px;
  }

  .header-content {
    flex-direction: column;
    align-items: flex-start;
  }

  .add-btn {
    width: 100%;
  }

  .page-title {
    font-size: 24px;
  }

  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }

  .stat-card {
    padding: 16px;
  }

  .stat-value {
    font-size: 22px;
  }

  .filters-body {
    flex-direction: column;
  }

  .filter-item {
    min-width: 100%;
  }

  .search-filter {
    min-width: 100%;
  }

  .users-grid {
    grid-template-columns: 1fr;
  }

  .user-card {
    padding: 20px;
  }

  .menu-btn {
    display: none !important;
  }

  .quick-actions {
    display: flex;
  }

  .pagination-container {
    flex-direction: column;
    text-align: center;
  }

  .pagination-info {
    order: 2;
  }

  .form-grid {
    grid-template-columns: 1fr;
  }

  .form-group {
    grid-column: 1;
  }

  .dialog-header {
    flex-wrap: wrap;
  }

  .dialog-icon {
    width: 44px;
    height: 44px;
  }

  .dialog-title {
    font-size: 18px;
  }
}

@media (max-width: 480px) {
  .header-left {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .header-icon {
    width: 48px;
    height: 48px;
  }

  .stats-grid {
    grid-template-columns: 1fr;
  }

  .page-numbers {
    display: none;
  }
}
</style>
