<!-- src/pages/roles.vue -->

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
const canCreate = computed(() => authStore.hasPermission('roles.create'))
const canEdit = computed(() => authStore.hasPermission('roles.update'))
const canDelete = computed(() => authStore.hasPermission('roles.delete'))

// Data
const roles = ref([])
const allPermissions = ref([])
const loading = ref(false)
const totalRoles = ref(0)

// Pagination & Filters
const page = ref(1)
const perPage = ref(10)
const search = ref('')
const totalPages = computed(() => Math.ceil(totalRoles.value / perPage.value))

// Dialogs
const showCreateDialog = ref(false)
const showEditDialog = ref(false)
const showDeleteDialog = ref(false)
const showPermissionsDialog = ref(false)
const dialogLoading = ref(false)

// Form Data
const defaultForm = {
  name: '',
  slug: '',
  description: '',
}
const form = ref({ ...defaultForm })
const formErrors = ref({})
const selectedRole = ref(null)

// Permission management
const selectedPermissionIds = ref([])

// Stats
const serverStats = ref(null)
const stats = computed(() => {
  if (serverStats.value) {
    return {
      total: serverStats.value.total_roles || 0,
      totalPermissions: serverStats.value.total_permissions || 0,
      mostUsedRole: serverStats.value.most_used_role || null,
      rolesWithUsers: serverStats.value.roles_with_users || 0,
    }
  }
  return { total: totalRoles.value, totalPermissions: 0, mostUsedRole: null, rolesWithUsers: 0 }
})

// Grouped permissions by module
const groupedPermissions = computed(() => {
  const groups = {}
  allPermissions.value.forEach(perm => {
    const parts = perm.name.split('.')
    const module = parts.length > 1 ? parts[0] : 'general'
    if (!groups[module]) groups[module] = []
    groups[module].push(perm)
  })
  return groups
})

const fetchStats = async () => {
  try {
    const response = await api.get('/admin-api/roles/stats')
    if (response.data.success) {
      serverStats.value = response.data.data
    }
  } catch (error) {
    // Stats are non-critical
  }
}

// Fetch roles
const fetchRoles = async () => {
  loading.value = true

  try {
    const params = new URLSearchParams({
      page: page.value,
      per_page: perPage.value,
    })

    if (search.value) params.append('search', search.value)

    const response = await api.get(`/admin-api/roles?${params}`)

    if (response.data.success) {
      roles.value = response.data.data?.roles || response.data.data || []
      totalRoles.value = response.data.data?.pagination?.total || roles.value.length
    }
  } catch (error) {
    console.error('Failed to fetch roles:', error)
    toastError('Failed to load roles')
  } finally {
    loading.value = false
  }
}

// Fetch all permissions
const fetchPermissions = async () => {
  try {
    const response = await api.get('/admin-api/permissions')
    if (response.data.success) {
      allPermissions.value = response.data.data?.permissions || response.data.data || []
    }
  } catch (error) {
    console.error('Failed to fetch permissions:', error)
  }
}

// Auto-generate slug from name
const generateSlug = (name) => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}

// Create role
const handleCreate = async () => {
  formErrors.value = {}

  if (!form.value.name) formErrors.value.name = 'Role name is required'
  if (!form.value.slug) formErrors.value.slug = 'Slug is required'

  if (Object.keys(formErrors.value).length > 0) return

  dialogLoading.value = true

  try {
    const response = await api.post('/admin-api/roles/create', {
      name: form.value.name,
      slug: form.value.slug,
      description: form.value.description || '',
    })

    if (response.data.success) {
      toastSuccess('Role created successfully')
      showCreateDialog.value = false
      resetForm()
      fetchRoles()
      fetchStats()
    }
  } catch (error) {
    // Handled by interceptor
  } finally {
    dialogLoading.value = false
  }
}

// Update role
const handleUpdate = async () => {
  formErrors.value = {}

  if (!form.value.name) formErrors.value.name = 'Role name is required'
  if (!form.value.slug) formErrors.value.slug = 'Slug is required'

  if (Object.keys(formErrors.value).length > 0) return

  dialogLoading.value = true

  try {
    const response = await api.put(`/admin-api/roles/${selectedRole.value.id}/update`, {
      name: form.value.name,
      slug: form.value.slug,
      description: form.value.description || '',
    })

    if (response.data.success) {
      toastSuccess('Role updated successfully')
      showEditDialog.value = false
      resetForm()
      fetchRoles()
    }
  } catch (error) {
    // Handled by interceptor
  } finally {
    dialogLoading.value = false
  }
}

// Delete role
const handleDelete = async () => {
  if (!selectedRole.value) return

  dialogLoading.value = true

  try {
    const response = await api.delete(`/admin-api/roles/${selectedRole.value.id}/delete`)

    if (response.data.success) {
      toastSuccess('Role deleted successfully')
      showDeleteDialog.value = false
      selectedRole.value = null
      fetchRoles()
      fetchStats()
    }
  } catch (error) {
    // Handled by interceptor
  } finally {
    dialogLoading.value = false
  }
}

// Save permissions (bulk)
const handleSavePermissions = async () => {
  if (!selectedRole.value) return

  dialogLoading.value = true

  try {
    const response = await api.post(`/admin-api/roles/${selectedRole.value.id}/permissions/bulk`, {
      permission_ids: selectedPermissionIds.value,
    })

    if (response.data.success) {
      toastSuccess('Permissions updated successfully')
      showPermissionsDialog.value = false
      selectedRole.value = null
      selectedPermissionIds.value = []
      fetchRoles()
    }
  } catch (error) {
    // Handled by interceptor
  } finally {
    dialogLoading.value = false
  }
}

// Open edit dialog
const openEditDialog = (role) => {
  selectedRole.value = role
  form.value = {
    name: role.name,
    slug: role.slug,
    description: role.description || '',
  }
  showEditDialog.value = true
}

// Open delete dialog
const openDeleteDialog = (role) => {
  selectedRole.value = role
  showDeleteDialog.value = true
}

// Open permissions dialog
const openPermissionsDialog = async (role) => {
  selectedRole.value = role
  dialogLoading.value = true
  showPermissionsDialog.value = true

  try {
    // Fetch role detail to get current permissions
    const response = await api.get(`/admin-api/roles/${role.id}`)
    if (response.data.success) {
      const roleData = response.data.data?.role || response.data.data
      selectedPermissionIds.value = (roleData.permissions || []).map(p => p.id)
    }
  } catch (error) {
    toastError('Failed to load role permissions')
  } finally {
    dialogLoading.value = false
  }
}

// Toggle all permissions in a module group
const toggleModulePermissions = (moduleName) => {
  const modulePerms = groupedPermissions.value[moduleName] || []
  const modulePermIds = modulePerms.map(p => p.id)
  const allSelected = modulePermIds.every(id => selectedPermissionIds.value.includes(id))

  if (allSelected) {
    selectedPermissionIds.value = selectedPermissionIds.value.filter(id => !modulePermIds.includes(id))
  } else {
    const newIds = new Set([...selectedPermissionIds.value, ...modulePermIds])
    selectedPermissionIds.value = [...newIds]
  }
}

// Check if all permissions in a module are selected
const isModuleFullySelected = (moduleName) => {
  const modulePerms = groupedPermissions.value[moduleName] || []
  return modulePerms.length > 0 && modulePerms.every(p => selectedPermissionIds.value.includes(p.id))
}

// Check if some permissions in a module are selected
const isModulePartiallySelected = (moduleName) => {
  const modulePerms = groupedPermissions.value[moduleName] || []
  const selectedCount = modulePerms.filter(p => selectedPermissionIds.value.includes(p.id)).length
  return selectedCount > 0 && selectedCount < modulePerms.length
}

// Reset form
const resetForm = () => {
  form.value = { ...defaultForm }
  formErrors.value = {}
  selectedRole.value = null
}

// Get role color based on name
const getRoleColor = (roleName) => {
  const name = roleName?.toLowerCase() || ''
  if (name.includes('super')) return { bg: 'rgba(244, 67, 54, 0.15)', text: '#f44336', border: 'rgba(244, 67, 54, 0.3)', gradient: 'linear-gradient(135deg, #f44336, #e91e63)' }
  if (name.includes('admin')) return { bg: 'rgba(255, 152, 0, 0.15)', text: '#ff9800', border: 'rgba(255, 152, 0, 0.3)', gradient: 'linear-gradient(135deg, #ff9800, #f57c00)' }
  if (name.includes('manager')) return { bg: 'rgba(156, 39, 176, 0.15)', text: '#9c27b0', border: 'rgba(156, 39, 176, 0.3)', gradient: 'linear-gradient(135deg, #9c27b0, #7b1fa2)' }
  if (name.includes('editor')) return { bg: 'rgba(0, 150, 136, 0.15)', text: '#009688', border: 'rgba(0, 150, 136, 0.3)', gradient: 'linear-gradient(135deg, #009688, #00796b)' }
  if (name.includes('driver')) return { bg: 'rgba(33, 150, 243, 0.15)', text: '#2196f3', border: 'rgba(33, 150, 243, 0.3)', gradient: 'linear-gradient(135deg, #2196f3, #1976d2)' }
  return { bg: 'rgba(99, 102, 241, 0.15)', text: '#818cf8', border: 'rgba(99, 102, 241, 0.3)', gradient: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }
}

// Get role icon
const getRoleIcon = (roleName) => {
  const name = roleName?.toLowerCase() || ''
  if (name.includes('super')) return 'bx-crown'
  if (name.includes('admin')) return 'bx-shield-alt-2'
  if (name.includes('manager')) return 'bx-briefcase'
  if (name.includes('editor')) return 'bx-edit-alt'
  if (name.includes('driver')) return 'bx-car'
  return 'bx-user-check'
}

// Get module icon
const getModuleIcon = (moduleName) => {
  const name = moduleName.toLowerCase()
  if (name.includes('user')) return 'bx-user'
  if (name.includes('role')) return 'bx-shield'
  if (name.includes('load')) return 'bx-package'
  if (name.includes('order')) return 'bx-cart'
  if (name.includes('report')) return 'bx-bar-chart-alt-2'
  if (name.includes('setting')) return 'bx-cog'
  return 'bx-lock-alt'
}

// Watch for filter changes
let searchTimeout = null
watch(search, () => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    page.value = 1
    fetchRoles()
  }, 300)
})

watch(page, () => {
  fetchRoles()
})

// Auto-generate slug when name changes in create mode
watch(() => form.value.name, (newName) => {
  if (showCreateDialog.value) {
    form.value.slug = generateSlug(newName)
  }
})

onMounted(() => {
  fetchRoles()
  fetchPermissions()
  fetchStats()
})
</script>

<template>
  <div class="roles-page" :class="{ 'theme-light': !isDark }">
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
            <VIcon icon="bx-shield" size="32" />
          </div>
          <div>
            <h1 class="page-title">Roles & Permissions</h1>
            <p class="page-subtitle">Manage access control and security policies</p>
          </div>
        </div>
        <VBtn
          v-if="canCreate"
          class="add-btn"
          size="large"
          @click="showCreateDialog = true"
        >
          <VIcon icon="bx-plus" class="me-2" />
          <span class="btn-text">Add Role</span>
        </VBtn>
      </div>
    </div>

    <!-- Stats Cards -->
    <div class="stats-grid">
      <div class="stat-card stat-total">
        <div class="stat-icon">
          <VIcon icon="bx-shield" size="28" />
        </div>
        <div class="stat-content">
          <span class="stat-value">{{ stats.total }}</span>
          <span class="stat-label">Total Roles</span>
        </div>
        <div class="stat-decoration"></div>
      </div>

      <div class="stat-card stat-permissions">
        <div class="stat-icon">
          <VIcon icon="bx-lock-alt" size="28" />
        </div>
        <div class="stat-content">
          <span class="stat-value">{{ stats.totalPermissions }}</span>
          <span class="stat-label">Permissions</span>
        </div>
        <div class="stat-decoration"></div>
      </div>

      <div class="stat-card stat-active">
        <div class="stat-icon">
          <VIcon icon="bx-group" size="28" />
        </div>
        <div class="stat-content">
          <span class="stat-value">{{ stats.rolesWithUsers }}</span>
          <span class="stat-label">Roles In Use</span>
        </div>
        <div class="stat-decoration"></div>
      </div>

      <div class="stat-card stat-popular">
        <div class="stat-icon">
          <VIcon icon="bx-trending-up" size="28" />
        </div>
        <div class="stat-content">
          <span class="stat-value">{{ stats.mostUsedRole?.name || '-' }}</span>
          <span class="stat-label">Most Used Role</span>
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
            placeholder="Search roles by name or slug..."
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

        <VBtn
          variant="tonal"
          class="clear-btn"
          @click="search = ''"
        >
          <VIcon icon="bx-refresh" class="me-2" />
          Reset
        </VBtn>
      </div>
    </div>

    <!-- Roles List -->
    <div class="roles-container">
      <!-- Loading State -->
      <div v-if="loading" class="loading-state">
        <div class="loading-spinner">
          <div class="spinner"></div>
        </div>
        <p>Loading roles...</p>
      </div>

      <!-- Empty State -->
      <div v-else-if="!roles.length" class="empty-state">
        <div class="empty-icon">
          <VIcon icon="bx-shield-x" size="64" />
        </div>
        <h3>No Roles Found</h3>
        <p>Try adjusting your search or create a new role to get started.</p>
        <VBtn
          v-if="canCreate"
          class="add-btn mt-4"
          @click="showCreateDialog = true"
        >
          <VIcon icon="bx-plus" class="me-2" />
          Create First Role
        </VBtn>
      </div>

      <!-- Roles Grid -->
      <div v-else class="roles-grid">
        <div
          v-for="(role, index) in roles"
          :key="role.id"
          class="role-card"
          :style="{ '--delay': `${index * 0.05}s` }"
        >
          <div class="card-glow"></div>

          <!-- Role Header -->
          <div class="role-header">
            <div class="role-avatar" :style="{ background: getRoleColor(role.name).gradient }">
              <VIcon :icon="getRoleIcon(role.name)" size="24" color="white" />
            </div>

            <div class="role-info">
              <h3 class="role-name">{{ role.name }}</h3>
              <p class="role-slug">{{ role.slug }}</p>
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
                <VListItem v-if="canEdit" @click="openPermissionsDialog(role)">
                  <template #prepend>
                    <VIcon icon="bx-lock-alt" color="info" />
                  </template>
                  <VListItemTitle>Manage Permissions</VListItemTitle>
                </VListItem>
                <VListItem v-if="canEdit" @click="openEditDialog(role)">
                  <template #prepend>
                    <VIcon icon="bx-edit" color="primary" />
                  </template>
                  <VListItemTitle>Edit Role</VListItemTitle>
                </VListItem>
                <VListItem
                  v-if="canDelete"
                  @click="openDeleteDialog(role)"
                  class="delete-item"
                >
                  <template #prepend>
                    <VIcon icon="bx-trash" color="error" />
                  </template>
                  <VListItemTitle class="text-error">Delete Role</VListItemTitle>
                </VListItem>
              </VList>
            </VMenu>
          </div>

          <!-- Description -->
          <p class="role-description">
            {{ role.description || 'No description provided' }}
          </p>

          <!-- Permissions Count -->
          <div class="role-permissions-info">
            <div class="permission-count">
              <VIcon icon="bx-lock-alt" size="16" />
              <span>{{ role.permissions_count ?? role.permissions?.length ?? 0 }} permissions</span>
            </div>
            <div class="user-count">
              <VIcon icon="bx-user" size="16" />
              <span>{{ role.users_count ?? 0 }} users</span>
            </div>
          </div>

          <!-- Footer -->
          <div class="role-footer">
            <div class="footer-item">
              <span
                class="role-badge"
                :style="{
                  background: getRoleColor(role.name).bg,
                  color: getRoleColor(role.name).text,
                  borderColor: getRoleColor(role.name).border,
                }"
              >
                {{ role.slug }}
              </span>
            </div>
            <VBtn
              v-if="canEdit"
              variant="tonal"
              size="small"
              class="permissions-btn"
              @click="openPermissionsDialog(role)"
            >
              <VIcon icon="bx-lock-open-alt" size="16" class="me-1" />
              Permissions
            </VBtn>
          </div>

          <!-- Quick Actions (Mobile) -->
          <div class="quick-actions">
            <VBtn
              v-if="canEdit"
              icon
              size="small"
              variant="tonal"
              color="info"
              @click="openPermissionsDialog(role)"
            >
              <VIcon icon="bx-lock-alt" size="18" />
            </VBtn>
            <VBtn
              v-if="canEdit"
              icon
              size="small"
              variant="tonal"
              color="primary"
              @click="openEditDialog(role)"
            >
              <VIcon icon="bx-edit" size="18" />
            </VBtn>
            <VBtn
              v-if="canDelete"
              icon
              size="small"
              variant="tonal"
              color="error"
              @click="openDeleteDialog(role)"
            >
              <VIcon icon="bx-trash" size="18" />
            </VBtn>
          </div>
        </div>
      </div>

      <!-- Pagination -->
      <div v-if="roles.length && totalPages > 1" class="pagination-container">
        <div class="pagination-info">
          Showing <strong>{{ (page - 1) * perPage + 1 }}</strong> to
          <strong>{{ Math.min(page * perPage, totalRoles) }}</strong> of
          <strong>{{ totalRoles }}</strong> roles
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
    <VDialog v-model="showCreateDialog" max-width="550" persistent class="custom-dialog">
      <VCard class="dialog-card">
        <div class="dialog-header">
          <div class="dialog-icon create">
            <VIcon icon="bx-shield-plus" size="28" />
          </div>
          <div>
            <h2 class="dialog-title">Create New Role</h2>
            <p class="dialog-subtitle">Define a new access role for your platform</p>
          </div>
          <VBtn icon variant="text" class="close-btn" @click="showCreateDialog = false; resetForm()">
            <VIcon icon="bx-x" />
          </VBtn>
        </div>

        <VCardText class="dialog-body">
          <div class="form-stack">
            <div class="form-group">
              <label class="form-label">Role Name <span class="required">*</span></label>
              <VTextField
                v-model="form.name"
                variant="outlined"
                density="comfortable"
                placeholder="e.g. Content Manager"
                :error-messages="formErrors.name"
              >
                <template #prepend-inner>
                  <VIcon icon="bx-shield" />
                </template>
              </VTextField>
            </div>
            <div class="form-group">
              <label class="form-label">Slug <span class="required">*</span></label>
              <VTextField
                v-model="form.slug"
                variant="outlined"
                density="comfortable"
                placeholder="e.g. content-manager"
                :error-messages="formErrors.slug"
              >
                <template #prepend-inner>
                  <VIcon icon="bx-hash" />
                </template>
              </VTextField>
            </div>
            <div class="form-group">
              <label class="form-label">Description</label>
              <VTextarea
                v-model="form.description"
                variant="outlined"
                density="comfortable"
                placeholder="Brief description of this role's purpose..."
                rows="3"
                auto-grow
              >
                <template #prepend-inner>
                  <VIcon icon="bx-text" />
                </template>
              </VTextarea>
            </div>
          </div>
        </VCardText>

        <div class="dialog-footer">
          <VBtn variant="outlined" size="large" @click="showCreateDialog = false; resetForm()">
            Cancel
          </VBtn>
          <VBtn class="submit-btn" size="large" :loading="dialogLoading" @click="handleCreate">
            <VIcon icon="bx-plus" class="me-2" />
            Create Role
          </VBtn>
        </div>
      </VCard>
    </VDialog>

    <!-- Edit Dialog -->
    <VDialog v-model="showEditDialog" max-width="550" persistent class="custom-dialog">
      <VCard class="dialog-card">
        <div class="dialog-header">
          <div class="dialog-icon edit">
            <VIcon icon="bx-edit" size="28" />
          </div>
          <div>
            <h2 class="dialog-title">Edit Role</h2>
            <p class="dialog-subtitle">Update role information</p>
          </div>
          <VBtn icon variant="text" class="close-btn" @click="showEditDialog = false; resetForm()">
            <VIcon icon="bx-x" />
          </VBtn>
        </div>

        <VCardText class="dialog-body">
          <div class="form-stack">
            <div class="form-group">
              <label class="form-label">Role Name <span class="required">*</span></label>
              <VTextField
                v-model="form.name"
                variant="outlined"
                density="comfortable"
                placeholder="e.g. Content Manager"
                :error-messages="formErrors.name"
              >
                <template #prepend-inner>
                  <VIcon icon="bx-shield" />
                </template>
              </VTextField>
            </div>
            <div class="form-group">
              <label class="form-label">Slug <span class="required">*</span></label>
              <VTextField
                v-model="form.slug"
                variant="outlined"
                density="comfortable"
                placeholder="e.g. content-manager"
                :error-messages="formErrors.slug"
              >
                <template #prepend-inner>
                  <VIcon icon="bx-hash" />
                </template>
              </VTextField>
            </div>
            <div class="form-group">
              <label class="form-label">Description</label>
              <VTextarea
                v-model="form.description"
                variant="outlined"
                density="comfortable"
                placeholder="Brief description of this role's purpose..."
                rows="3"
                auto-grow
              >
                <template #prepend-inner>
                  <VIcon icon="bx-text" />
                </template>
              </VTextarea>
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
          <h2 class="delete-title">Delete Role</h2>
          <p class="delete-message">
            Are you sure you want to delete
            <strong>{{ selectedRole?.name }}</strong>?
          </p>
          <p class="delete-warning">
            <VIcon icon="bx-info-circle" size="16" />
            This will remove the role from all assigned users.
          </p>
        </div>

        <div class="dialog-footer delete-footer">
          <VBtn variant="outlined" size="large" @click="showDeleteDialog = false">
            Cancel
          </VBtn>
          <VBtn color="error" size="large" :loading="dialogLoading" @click="handleDelete">
            <VIcon icon="bx-trash" class="me-2" />
            Delete Role
          </VBtn>
        </div>
      </VCard>
    </VDialog>

    <!-- Permissions Dialog -->
    <VDialog v-model="showPermissionsDialog" max-width="700" persistent class="custom-dialog">
      <VCard class="dialog-card">
        <div class="dialog-header">
          <div class="dialog-icon permissions">
            <VIcon icon="bx-lock-alt" size="28" />
          </div>
          <div>
            <h2 class="dialog-title">Manage Permissions</h2>
            <p class="dialog-subtitle">
              Configure permissions for <strong>{{ selectedRole?.name }}</strong>
            </p>
          </div>
          <VBtn icon variant="text" class="close-btn" @click="showPermissionsDialog = false; selectedPermissionIds = []">
            <VIcon icon="bx-x" />
          </VBtn>
        </div>

        <VCardText class="dialog-body permissions-body">
          <div v-if="dialogLoading && !Object.keys(groupedPermissions).length" class="loading-state" style="padding: 40px;">
            <div class="loading-spinner">
              <div class="spinner"></div>
            </div>
            <p>Loading permissions...</p>
          </div>

          <div v-else class="permissions-grid">
            <div
              v-for="(perms, moduleName) in groupedPermissions"
              :key="moduleName"
              class="permission-module"
            >
              <div class="module-header" @click="toggleModulePermissions(moduleName)">
                <div class="module-info">
                  <div class="module-icon">
                    <VIcon :icon="getModuleIcon(moduleName)" size="20" />
                  </div>
                  <span class="module-name">{{ moduleName }}</span>
                  <span class="module-count">{{ perms.filter(p => selectedPermissionIds.includes(p.id)).length }}/{{ perms.length }}</span>
                </div>
                <VCheckbox
                  :model-value="isModuleFullySelected(moduleName)"
                  :indeterminate="isModulePartiallySelected(moduleName)"
                  hide-details
                  density="compact"
                  color="primary"
                  @click.stop="toggleModulePermissions(moduleName)"
                />
              </div>

              <div class="module-permissions">
                <label
                  v-for="perm in perms"
                  :key="perm.id"
                  class="permission-item"
                  :class="{ active: selectedPermissionIds.includes(perm.id) }"
                >
                  <VCheckbox
                    :model-value="selectedPermissionIds.includes(perm.id)"
                    hide-details
                    density="compact"
                    color="primary"
                    @update:model-value="(val) => {
                      if (val) {
                        selectedPermissionIds.push(perm.id)
                      } else {
                        selectedPermissionIds = selectedPermissionIds.filter(id => id !== perm.id)
                      }
                    }"
                  />
                  <div class="permission-info">
                    <span class="permission-name">{{ perm.name }}</span>
                    <span v-if="perm.description" class="permission-desc">{{ perm.description }}</span>
                  </div>
                </label>
              </div>
            </div>
          </div>
        </VCardText>

        <div class="dialog-footer">
          <div class="footer-info">
            <VIcon icon="bx-check-circle" size="16" />
            <span>{{ selectedPermissionIds.length }} permissions selected</span>
          </div>
          <div class="footer-actions">
            <VBtn variant="outlined" size="large" @click="showPermissionsDialog = false; selectedPermissionIds = []">
              Cancel
            </VBtn>
            <VBtn class="submit-btn permissions-save" size="large" :loading="dialogLoading" @click="handleSavePermissions">
              <VIcon icon="bx-check" class="me-2" />
              Save Permissions
            </VBtn>
          </div>
        </div>
      </VCard>
    </VDialog>
  </div>
</template>

<style scoped>
/* Theme Variables */
.roles-page {
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

.roles-page.theme-light {
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
.roles-page {
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

.stat-permissions .stat-icon {
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(249, 115, 22, 0.2));
  color: #fbbf24;
}

.stat-active .stat-icon {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(6, 182, 212, 0.2));
  color: #34d399;
}

.stat-popular .stat-icon {
  background: linear-gradient(135deg, rgba(236, 72, 153, 0.2), rgba(168, 85, 247, 0.2));
  color: #f472b6;
}

.stat-content {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-heading);
  line-height: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stat-popular .stat-value {
  font-size: 18px;
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

.stat-permissions .stat-decoration {
  background: linear-gradient(135deg, #f59e0b, #f97316);
}

.stat-active .stat-decoration {
  background: linear-gradient(135deg, #10b981, #06b6d4);
}

.stat-popular .stat-decoration {
  background: linear-gradient(135deg, #ec4899, #a855f7);
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

.clear-btn {
  height: 48px !important;
  border-radius: 12px !important;
  flex-shrink: 0;
}

/* Roles Container */
.roles-container {
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

/* Roles Grid */
.roles-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 20px;
}

/* Role Card */
.role-card {
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

.role-card:hover {
  border-color: rgba(99, 102, 241, 0.3);
  transform: translateY(-4px);
}

.role-card:hover .card-glow {
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

/* Role Header */
.role-header {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  margin-bottom: 12px;
}

.role-avatar {
  position: relative;
  width: 52px;
  height: 52px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: var(--shadow-card);
}

.role-info {
  flex: 1;
  min-width: 0;
}

.role-name {
  font-size: 17px;
  font-weight: 600;
  color: var(--text-heading);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.role-slug {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 2px 0 0;
  font-family: monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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
  min-width: 200px;
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

/* Description */
.role-description {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0 0 16px;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* Permissions Count */
.role-permissions-info {
  display: flex;
  gap: 20px;
  margin-bottom: 16px;
}

.permission-count,
.user-count {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-muted);
}

.permission-count .v-icon {
  color: var(--primary-light);
}

.user-count .v-icon {
  color: #34d399;
}

/* Role Footer */
.role-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 16px;
  border-top: 1px solid var(--border-line);
}

.role-badge {
  font-size: 12px;
  font-weight: 600;
  padding: 6px 12px;
  border-radius: 8px;
  border: 1px solid;
  letter-spacing: 0.3px;
  font-family: monospace;
}

.permissions-btn {
  font-size: 12px;
  font-weight: 600;
  border-radius: 10px !important;
  text-transform: none;
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

.dialog-icon.permissions {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(99, 102, 241, 0.2));
  color: #60a5fa;
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

.form-stack {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
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

.submit-btn.permissions-save {
  background: linear-gradient(135deg, #3b82f6, #6366f1) !important;
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

/* Permissions Dialog */
.permissions-body {
  max-height: 60vh;
  overflow-y: auto;
}

.permissions-grid {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.permission-module {
  background: var(--card-bg-subtle);
  border: 1px solid var(--card-border);
  border-radius: 16px;
  overflow: hidden;
}

.module-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  cursor: pointer;
  transition: background 0.2s ease;
  background: var(--hover-bg);
}

.module-header:hover {
  background: var(--hover-bg-strong);
}

.module-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.module-icon {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(139, 92, 246, 0.15));
  border-radius: 10px;
  color: var(--primary-light);
}

.module-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-heading);
  text-transform: capitalize;
}

.module-count {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  background: var(--input-bg);
  padding: 3px 10px;
  border-radius: 20px;
}

.module-permissions {
  padding: 8px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.permission-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.permission-item:hover {
  background: var(--hover-bg);
}

.permission-item.active {
  background: rgba(99, 102, 241, 0.08);
}

.permission-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.permission-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-body);
  font-family: monospace;
}

.permission-desc {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 2px;
}

.footer-info {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--primary-light);
  font-weight: 600;
}

.footer-actions {
  display: flex;
  gap: 12px;
}

/* Mobile Responsive */
@media (max-width: 1200px) {
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .roles-page {
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

  .roles-grid {
    grid-template-columns: 1fr;
  }

  .role-card {
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

  .dialog-footer {
    flex-wrap: wrap;
  }

  .footer-info {
    width: 100%;
    justify-content: center;
    margin-bottom: 8px;
  }

  .footer-actions {
    width: 100%;
    justify-content: flex-end;
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
