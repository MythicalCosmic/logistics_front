<!-- src/pages/roles.vue -->

<script setup>
import { ref, onMounted, watch, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useToast } from '@/composables/useToast'
import api from '@/services/api'

const authStore = useAuthStore()
const { success: toastSuccess, error: toastError } = useToast()

// Permissions
const canCreate = computed(() => authStore.hasPermission('role.create'))
const canEdit = computed(() => authStore.hasPermission('role.edit'))
const canDelete = computed(() => authStore.hasPermission('role.delete'))

// Data
const roles = ref([])
const allPermissions = ref({}) // Object not array - grouped by module from API
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
  description: '',
  permission_ids: [],
}
const form = ref({ ...defaultForm })
const formErrors = ref({})
const selectedRole = ref(null)

// Stats
const stats = computed(() => ({
  total: totalRoles.value,
  withUsers: roles.value.filter(r => r.user_count > 0).length,
  system: roles.value.filter(r => ['Super Admin', 'Admin', 'Teacher', 'Viewer'].includes(r.name)).length,
  custom: roles.value.filter(r => !['Super Admin', 'Admin', 'Teacher', 'Viewer'].includes(r.name)).length,
}))

// Check if all permissions in a module are selected
const isModuleFullySelected = (moduleName) => {
  const modulePerms = allPermissions.value[moduleName] || []
  if (modulePerms.length === 0) return false
  return modulePerms.every(p => form.value.permission_ids.includes(p.id))
}

// Check if some permissions in a module are selected
const isModulePartiallySelected = (moduleName) => {
  const modulePerms = allPermissions.value[moduleName] || []
  if (modulePerms.length === 0) return false
  const selected = modulePerms.filter(p => form.value.permission_ids.includes(p.id))
  return selected.length > 0 && selected.length < modulePerms.length
}

// Toggle all permissions in a module
const toggleModule = (moduleName) => {
  const modulePerms = allPermissions.value[moduleName] || []
  const modulePermIds = modulePerms.map(p => p.id)
  
  if (isModuleFullySelected(moduleName)) {
    form.value.permission_ids = form.value.permission_ids.filter(id => !modulePermIds.includes(id))
  } else {
    const newIds = modulePermIds.filter(id => !form.value.permission_ids.includes(id))
    form.value.permission_ids = [...form.value.permission_ids, ...newIds]
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
    
    const response = await api.get(`/admins/roles?${params}`)
    
    if (response.data.success) {
      roles.value = response.data.data || []
      totalRoles.value = response.data.meta?.total || response.data.data?.length || 0
    }
  } catch (error) {
    console.error('Failed to fetch roles:', error)
    toastError('Failed to load roles')
  } finally {
    loading.value = false
  }
}

// Fetch all permissions - returns grouped object
const fetchPermissions = async () => {
  try {
    const response = await api.get('/admins/roles/permissions')
    if (response.data.success) {
      // API returns grouped permissions like { user: [...], role: [...], etc }
      allPermissions.value = response.data.data || {}
    }
  } catch (error) {
    console.error('Failed to fetch permissions:', error)
  }
}

// Create role
const handleCreate = async () => {
  formErrors.value = {}
  
  if (!form.value.name) formErrors.value.name = 'Role name is required'
  
  if (Object.keys(formErrors.value).length > 0) return
  
  dialogLoading.value = true
  
  try {
    const response = await api.post('/admins/roles/create', {
      name: form.value.name,
      description: form.value.description,
      permission_ids: form.value.permission_ids,
    })
    
    if (response.data.success) {
      toastSuccess('Role created successfully')
      showCreateDialog.value = false
      resetForm()
      fetchRoles()
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
  
  if (Object.keys(formErrors.value).length > 0) return
  
  dialogLoading.value = true
  
  try {
    await api.put(`/admins/roles/${selectedRole.value.id}/update`, {
      name: form.value.name,
      description: form.value.description,
    })
    
    toastSuccess('Role updated successfully')
    showEditDialog.value = false
    resetForm()
    fetchRoles()
  } catch (error) {
    // Handled by interceptor
  } finally {
    dialogLoading.value = false
  }
}

// Update permissions
const handleUpdatePermissions = async () => {
  dialogLoading.value = true
  
  try {
    await api.put(`/admins/roles/${selectedRole.value.id}/permissions`, {
      permission_ids: form.value.permission_ids,
    })
    
    toastSuccess('Permissions updated successfully')
    showPermissionsDialog.value = false
    resetForm()
    fetchRoles()
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
    const response = await api.delete(`/admins/roles/${selectedRole.value.id}/delete`)
    
    if (response.data.success) {
      toastSuccess('Role deleted successfully')
      showDeleteDialog.value = false
      selectedRole.value = null
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
    description: role.description || '',
    permission_ids: [],
  }
  showEditDialog.value = true
}

// Open permissions dialog
const openPermissionsDialog = async (role) => {
  selectedRole.value = role
  form.value.permission_ids = []
  
  try {
    const response = await api.get(`/admins/roles/${role.id}`)
    if (response.data.success) {
      const roleData = response.data.data
      // Handle permissions - could be grouped or flat
      if (roleData.permissions) {
        if (Array.isArray(roleData.permissions)) {
          form.value.permission_ids = roleData.permissions.map(p => p.id)
        } else {
          // If grouped, flatten it
          const ids = []
          Object.values(roleData.permissions).forEach(perms => {
            if (Array.isArray(perms)) {
              perms.forEach(p => ids.push(p.id))
            }
          })
          form.value.permission_ids = ids
        }
      }
    }
  } catch (error) {
    console.error('Failed to fetch role details:', error)
  }
  
  showPermissionsDialog.value = true
}

// Open delete dialog
const openDeleteDialog = (role) => {
  selectedRole.value = role
  showDeleteDialog.value = true
}

// Reset form
const resetForm = () => {
  form.value = { ...defaultForm }
  formErrors.value = {}
  selectedRole.value = null
}

// Check if role is system role
const isSystemRole = (roleName) => {
  return ['Super Admin', 'Admin', 'Teacher', 'Viewer'].includes(roleName)
}

// Get role color
const getRoleColor = (roleName) => {
  const name = roleName?.toLowerCase() || ''
  if (name.includes('super')) return { bg: 'linear-gradient(135deg, #ef4444, #f97316)', text: '#fff' }
  if (name.includes('admin')) return { bg: 'linear-gradient(135deg, #f59e0b, #eab308)', text: '#fff' }
  if (name.includes('teacher')) return { bg: 'linear-gradient(135deg, #10b981, #06b6d4)', text: '#fff' }
  if (name.includes('viewer')) return { bg: 'linear-gradient(135deg, #6366f1, #8b5cf6)', text: '#fff' }
  return { bg: 'linear-gradient(135deg, #64748b, #94a3b8)', text: '#fff' }
}

// Get role icon
const getRoleIcon = (roleName) => {
  const name = roleName?.toLowerCase() || ''
  if (name.includes('super')) return 'bx-crown'
  if (name.includes('admin')) return 'bx-shield'
  if (name.includes('teacher')) return 'bx-chalkboard'
  if (name.includes('viewer')) return 'bx-show'
  return 'bx-user-circle'
}

// Get module icon
const getModuleIcon = (moduleName) => {
  const icons = {
    user: 'bx-user',
    role: 'bx-shield',
    group: 'bx-group',
    student: 'bx-user-check',
    attendance: 'bx-calendar-check',
    report: 'bx-file',
  }
  return icons[moduleName] || 'bx-cog'
}

// Get module color
const getModuleColor = (moduleName) => {
  const colors = {
    user: { bg: 'rgba(99, 102, 241, 0.15)', text: '#818cf8', border: 'rgba(99, 102, 241, 0.3)' },
    role: { bg: 'rgba(239, 68, 68, 0.15)', text: '#f87171', border: 'rgba(239, 68, 68, 0.3)' },
    group: { bg: 'rgba(16, 185, 129, 0.15)', text: '#34d399', border: 'rgba(16, 185, 129, 0.3)' },
    student: { bg: 'rgba(6, 182, 212, 0.15)', text: '#22d3ee', border: 'rgba(6, 182, 212, 0.3)' },
    attendance: { bg: 'rgba(245, 158, 11, 0.15)', text: '#fbbf24', border: 'rgba(245, 158, 11, 0.3)' },
    report: { bg: 'rgba(139, 92, 246, 0.15)', text: '#a78bfa', border: 'rgba(139, 92, 246, 0.3)' },
  }
  return colors[moduleName] || { bg: 'rgba(100, 116, 139, 0.15)', text: '#94a3b8', border: 'rgba(100, 116, 139, 0.3)' }
}

// Get module display name
const getModuleName = (key) => {
  return key.charAt(0).toUpperCase() + key.slice(1)
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

onMounted(() => {
  fetchRoles()
  fetchPermissions()
})
</script>

<template>
  <div class="roles-page">
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
            <p class="page-subtitle">Manage access control and user permissions</p>
          </div>
        </div>
        <VBtn
          v-if="canCreate"
          class="add-btn"
          size="large"
          @click="showCreateDialog = true"
        >
          <VIcon icon="bx-plus" class="me-2" />
          <span class="btn-text">Create Role</span>
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
          <span class="stat-value">{{ totalRoles }}</span>
          <span class="stat-label">Total Roles</span>
        </div>
        <div class="stat-decoration"></div>
      </div>
      
      <div class="stat-card stat-active">
        <div class="stat-icon">
          <VIcon icon="bx-user-check" size="28" />
        </div>
        <div class="stat-content">
          <span class="stat-value">{{ stats.withUsers }}</span>
          <span class="stat-label">With Users</span>
        </div>
        <div class="stat-decoration"></div>
      </div>
      
      <div class="stat-card stat-system">
        <div class="stat-icon">
          <VIcon icon="bx-lock" size="28" />
        </div>
        <div class="stat-content">
          <span class="stat-value">{{ stats.system }}</span>
          <span class="stat-label">System Roles</span>
        </div>
        <div class="stat-decoration"></div>
      </div>
      
      <div class="stat-card stat-custom">
        <div class="stat-icon">
          <VIcon icon="bx-customize" size="28" />
        </div>
        <div class="stat-content">
          <span class="stat-value">{{ stats.custom }}</span>
          <span class="stat-label">Custom Roles</span>
        </div>
        <div class="stat-decoration"></div>
      </div>
    </div>

    <!-- Filters Section -->
    <div class="filters-card">
      <div class="filters-header">
        <VIcon icon="bx-filter-alt" class="filter-icon" />
        <span>Search Roles</span>
      </div>
      <div class="filters-body">
        <div class="filter-item search-filter">
          <VTextField
            v-model="search"
            placeholder="Search by role name..."
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

    <!-- Roles Container -->
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
        <p>Create a new role to get started with access control.</p>
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
            <div class="role-icon" :style="{ background: getRoleColor(role.name).bg }">
              <VIcon :icon="getRoleIcon(role.name)" size="24" color="white" />
            </div>
            
            <div class="role-info">
              <div class="role-name-row">
                <h3 class="role-name">{{ role.name }}</h3>
                <VChip
                  v-if="isSystemRole(role.name)"
                  size="x-small"
                  color="warning"
                  variant="tonal"
                  class="system-badge"
                >
                  System
                </VChip>
              </div>
              <p class="role-description">{{ role.description || 'No description' }}</p>
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
                    <VIcon icon="bx-key" color="info" />
                  </template>
                  <VListItemTitle>Manage Permissions</VListItemTitle>
                </VListItem>
                <VListItem v-if="canEdit && !isSystemRole(role.name)" @click="openEditDialog(role)">
                  <template #prepend>
                    <VIcon icon="bx-edit" color="primary" />
                  </template>
                  <VListItemTitle>Edit Role</VListItemTitle>
                </VListItem>
                <VListItem
                  v-if="canDelete && !isSystemRole(role.name)"
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

          <!-- Stats Row -->
          <div class="role-stats">
            <div class="role-stat">
              <VIcon icon="bx-user" size="18" />
              <span class="stat-number">{{ role.user_count || 0 }}</span>
              <span class="stat-text">Users</span>
            </div>
            <div class="role-stat">
              <VIcon icon="bx-key" size="18" />
              <span class="stat-number">{{ role.permission_count || 0 }}</span>
              <span class="stat-text">Permissions</span>
            </div>
          </div>

          <!-- Quick Actions -->
          <div class="role-actions">
            <VBtn
              v-if="canEdit"
              variant="tonal"
              color="info"
              size="small"
              class="action-btn"
              @click="openPermissionsDialog(role)"
            >
              <VIcon icon="bx-key" size="18" class="me-1" />
              Permissions
            </VBtn>
            <VBtn
              v-if="canEdit && !isSystemRole(role.name)"
              variant="tonal"
              color="primary"
              size="small"
              class="action-btn"
              @click="openEditDialog(role)"
            >
              <VIcon icon="bx-edit" size="18" class="me-1" />
              Edit
            </VBtn>
          </div>
        </div>
      </div>

      <!-- Pagination -->
      <div v-if="roles.length" class="pagination-container">
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
            <VIcon icon="bx-shield-plus" size="28" />
          </div>
          <div>
            <h2 class="dialog-title">Create New Role</h2>
            <p class="dialog-subtitle">Define a new role with specific permissions</p>
          </div>
          <VBtn icon variant="text" class="close-btn" @click="showCreateDialog = false; resetForm()">
            <VIcon icon="bx-x" />
          </VBtn>
        </div>
        
        <VCardText class="dialog-body">
          <div class="form-grid">
            <div class="form-group full-width">
              <label class="form-label">Role Name <span class="required">*</span></label>
              <VTextField
                v-model="form.name"
                variant="outlined"
                density="comfortable"
                placeholder="e.g., Content Manager"
                :error-messages="formErrors.name"
              >
                <template #prepend-inner>
                  <VIcon icon="bx-shield" />
                </template>
              </VTextField>
            </div>
            <div class="form-group full-width">
              <label class="form-label">Description</label>
              <VTextarea
                v-model="form.description"
                variant="outlined"
                density="comfortable"
                placeholder="Describe what this role is for..."
                rows="3"
              />
            </div>
            
            <!-- Permissions Selection -->
            <div class="form-group full-width">
              <label class="form-label">Permissions</label>
              <div class="permissions-grid">
                <div
                  v-for="(permissions, moduleName) in allPermissions"
                  :key="moduleName"
                  class="permission-module"
                  :style="{ borderColor: getModuleColor(moduleName).border }"
                >
                  <div class="module-header" @click="toggleModule(moduleName)">
                    <VCheckbox
                      :model-value="isModuleFullySelected(moduleName)"
                      :indeterminate="isModulePartiallySelected(moduleName)"
                      hide-details
                      density="compact"
                      @click.stop="toggleModule(moduleName)"
                    />
                    <div
                      class="module-icon"
                      :style="{ background: getModuleColor(moduleName).bg, color: getModuleColor(moduleName).text }"
                    >
                      <VIcon :icon="getModuleIcon(moduleName)" size="18" />
                    </div>
                    <span class="module-name">{{ getModuleName(moduleName) }}</span>
                    <span class="module-count">{{ permissions.length }}</span>
                  </div>
                  <div class="module-permissions">
                    <label
                      v-for="perm in permissions"
                      :key="perm.id"
                      class="permission-item"
                    >
                      <VCheckbox
                        v-model="form.permission_ids"
                        :value="perm.id"
                        hide-details
                        density="compact"
                      />
                      <span class="permission-name">{{ perm.name }}</span>
                    </label>
                  </div>
                </div>
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
            Create Role
          </VBtn>
        </div>
      </VCard>
    </VDialog>

    <!-- Edit Dialog -->
    <VDialog v-model="showEditDialog" max-width="500" persistent class="custom-dialog">
      <VCard class="dialog-card">
        <div class="dialog-header">
          <div class="dialog-icon edit">
            <VIcon icon="bx-edit" size="28" />
          </div>
          <div>
            <h2 class="dialog-title">Edit Role</h2>
            <p class="dialog-subtitle">Update role name and description</p>
          </div>
          <VBtn icon variant="text" class="close-btn" @click="showEditDialog = false; resetForm()">
            <VIcon icon="bx-x" />
          </VBtn>
        </div>
        
        <VCardText class="dialog-body">
          <div class="form-grid">
            <div class="form-group full-width">
              <label class="form-label">Role Name <span class="required">*</span></label>
              <VTextField
                v-model="form.name"
                variant="outlined"
                density="comfortable"
                placeholder="e.g., Content Manager"
                :error-messages="formErrors.name"
              >
                <template #prepend-inner>
                  <VIcon icon="bx-shield" />
                </template>
              </VTextField>
            </div>
            <div class="form-group full-width">
              <label class="form-label">Description</label>
              <VTextarea
                v-model="form.description"
                variant="outlined"
                density="comfortable"
                placeholder="Describe what this role is for..."
                rows="3"
              />
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

    <!-- Permissions Dialog -->
    <VDialog v-model="showPermissionsDialog" max-width="700" persistent class="custom-dialog">
      <VCard class="dialog-card">
        <div class="dialog-header">
          <div class="dialog-icon permissions">
            <VIcon icon="bx-key" size="28" />
          </div>
          <div>
            <h2 class="dialog-title">Manage Permissions</h2>
            <p class="dialog-subtitle">Configure permissions for {{ selectedRole?.name }}</p>
          </div>
          <VBtn icon variant="text" class="close-btn" @click="showPermissionsDialog = false; resetForm()">
            <VIcon icon="bx-x" />
          </VBtn>
        </div>
        
        <VCardText class="dialog-body permissions-body">
          <div class="permissions-grid">
            <div
              v-for="(permissions, moduleName) in allPermissions"
              :key="moduleName"
              class="permission-module"
              :style="{ borderColor: getModuleColor(moduleName).border }"
            >
              <div class="module-header" @click="toggleModule(moduleName)">
                <VCheckbox
                  :model-value="isModuleFullySelected(moduleName)"
                  :indeterminate="isModulePartiallySelected(moduleName)"
                  hide-details
                  density="compact"
                  @click.stop="toggleModule(moduleName)"
                />
                <div
                  class="module-icon"
                  :style="{ background: getModuleColor(moduleName).bg, color: getModuleColor(moduleName).text }"
                >
                  <VIcon :icon="getModuleIcon(moduleName)" size="18" />
                </div>
                <span class="module-name">{{ getModuleName(moduleName) }}</span>
                <span class="module-count">{{ permissions.length }}</span>
              </div>
              <div class="module-permissions">
                <label
                  v-for="perm in permissions"
                  :key="perm.id"
                  class="permission-item"
                >
                  <VCheckbox
                    v-model="form.permission_ids"
                    :value="perm.id"
                    hide-details
                    density="compact"
                  />
                  <span class="permission-name">{{ perm.name }}</span>
                </label>
              </div>
            </div>
          </div>
        </VCardText>
        
        <div class="dialog-footer">
          <div class="selected-count">
            <VIcon icon="bx-check-circle" size="18" />
            {{ form.permission_ids.length }} permissions selected
          </div>
          <VBtn variant="outlined" size="large" @click="showPermissionsDialog = false; resetForm()">
            Cancel
          </VBtn>
          <VBtn class="submit-btn permissions" size="large" :loading="dialogLoading" @click="handleUpdatePermissions">
            <VIcon icon="bx-save" class="me-2" />
            Save Permissions
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
          <p v-if="selectedRole?.user_count > 0" class="delete-warning danger">
            <VIcon icon="bx-error" size="16" />
            This role has {{ selectedRole?.user_count }} users assigned!
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
            Delete Role
          </VBtn>
        </div>
      </VCard>
    </VDialog>
  </div>
</template>

<style scoped>
/* All the same styles from before - no changes needed */
.roles-page {
  position: relative;
  min-height: 100vh;
  padding: 24px;
  overflow-x: hidden;
}

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
    radial-gradient(ellipse at 0% 0%, rgba(239, 68, 68, 0.12) 0%, transparent 50%),
    radial-gradient(ellipse at 100% 0%, rgba(245, 158, 11, 0.1) 0%, transparent 50%),
    radial-gradient(ellipse at 50% 100%, rgba(99, 102, 241, 0.08) 0%, transparent 50%),
    linear-gradient(180deg, #0f0f1a 0%, #1a1a2e 100%);
}

.bg-grid {
  position: absolute;
  inset: 0;
  background-image: 
    linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px);
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
  opacity: 0.4;
  animation: float 20s ease-in-out infinite;
}

.shape-1 {
  width: 600px;
  height: 600px;
  background: linear-gradient(135deg, #ef4444, #f97316);
  top: -200px;
  left: -200px;
}

.shape-2 {
  width: 400px;
  height: 400px;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  bottom: -100px;
  right: -100px;
  animation-delay: -7s;
}

.shape-3 {
  width: 300px;
  height: 300px;
  background: linear-gradient(135deg, #10b981, #06b6d4);
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

.page-header { margin-bottom: 32px; }

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
  background: linear-gradient(135deg, #ef4444, #f97316);
  border-radius: 16px;
  color: white;
  box-shadow: 0 8px 32px rgba(239, 68, 68, 0.3);
}

.page-title {
  font-size: 32px;
  font-weight: 700;
  color: #f8fafc;
  margin: 0;
}

.page-subtitle {
  font-size: 15px;
  color: #94a3b8;
  margin: 4px 0 0;
}

.add-btn {
  background: linear-gradient(135deg, #ef4444, #f97316) !important;
  color: white !important;
  font-weight: 600;
  padding: 0 28px !important;
  height: 48px !important;
  border-radius: 14px !important;
  box-shadow: 0 8px 32px rgba(239, 68, 68, 0.35);
}

.add-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 40px rgba(239, 68, 68, 0.45);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
  margin-bottom: 28px;
}

.stat-card {
  position: relative;
  background: rgba(30, 30, 46, 0.7);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.08);
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
  border-color: rgba(255, 255, 255, 0.15);
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

.stat-total .stat-icon { background: linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(249, 115, 22, 0.2)); color: #f87171; }
.stat-active .stat-icon { background: linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(6, 182, 212, 0.2)); color: #34d399; }
.stat-system .stat-icon { background: linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(234, 179, 8, 0.2)); color: #fbbf24; }
.stat-custom .stat-icon { background: linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(139, 92, 246, 0.2)); color: #818cf8; }

.stat-content { display: flex; flex-direction: column; }
.stat-value { font-size: 28px; font-weight: 700; color: #f8fafc; line-height: 1; }
.stat-label { font-size: 13px; color: #94a3b8; margin-top: 4px; }

.stat-decoration {
  position: absolute;
  right: -30px;
  bottom: -30px;
  width: 120px;
  height: 120px;
  border-radius: 50%;
  opacity: 0.08;
}

.stat-total .stat-decoration { background: linear-gradient(135deg, #ef4444, #f97316); }
.stat-active .stat-decoration { background: linear-gradient(135deg, #10b981, #06b6d4); }
.stat-system .stat-decoration { background: linear-gradient(135deg, #f59e0b, #eab308); }
.stat-custom .stat-decoration { background: linear-gradient(135deg, #6366f1, #8b5cf6); }

.filters-card {
  background: rgba(30, 30, 46, 0.7);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.08);
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
  color: #94a3b8;
  margin-bottom: 16px;
}

.filter-icon { color: #f87171; }

.filters-body {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.filter-item { flex: 1; min-width: 200px; }
.search-filter { flex: 2; min-width: 300px; }

.search-input :deep(.v-field) {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
}

.clear-btn {
  height: 48px !important;
  border-radius: 12px !important;
  flex-shrink: 0;
}

.roles-container {
  background: rgba(30, 30, 46, 0.5);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 24px;
  padding: 24px;
  min-height: 400px;
}

.loading-state, .empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  color: #94a3b8;
  text-align: center;
}

.loading-spinner { margin-bottom: 16px; }

.spinner {
  width: 48px;
  height: 48px;
  border: 3px solid rgba(239, 68, 68, 0.2);
  border-top-color: #ef4444;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

.empty-icon {
  width: 100px;
  height: 100px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(239, 68, 68, 0.1);
  border-radius: 24px;
  color: #f87171;
  margin-bottom: 24px;
}

.empty-state h3 { font-size: 22px; font-weight: 600; color: #f8fafc; margin: 0 0 8px; }

.roles-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 20px;
}

.role-card {
  position: relative;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  padding: 24px;
  transition: all 0.3s ease;
  animation: cardFadeIn 0.5s ease forwards;
  animation-delay: var(--delay);
  opacity: 0;
  transform: translateY(20px);
}

@keyframes cardFadeIn { to { opacity: 1; transform: translateY(0); } }

.role-card:hover {
  border-color: rgba(239, 68, 68, 0.3);
  transform: translateY(-4px);
}

.role-card:hover .card-glow { opacity: 1; }

.card-glow {
  position: absolute;
  inset: -1px;
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.15), transparent, rgba(249, 115, 22, 0.15));
  border-radius: 20px;
  opacity: 0;
  transition: opacity 0.3s ease;
  z-index: -1;
  filter: blur(20px);
}

.role-header {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  margin-bottom: 20px;
}

.role-icon {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
}

.role-info { flex: 1; min-width: 0; }

.role-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.role-name { font-size: 18px; font-weight: 600; color: #f8fafc; margin: 0; }
.system-badge { font-size: 10px; height: 20px; }
.role-description { font-size: 14px; color: #64748b; margin: 0; line-height: 1.4; }

.menu-btn { color: #64748b !important; margin: -8px -8px 0 0; }
.menu-btn:hover { color: #f8fafc !important; background: rgba(255, 255, 255, 0.1) !important; }

.action-menu {
  background: #1e1e2e !important;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px !important;
  padding: 8px !important;
  min-width: 200px;
}

.action-menu :deep(.v-list-item) { border-radius: 8px; min-height: 44px; }
.action-menu :deep(.v-list-item:hover) { background: rgba(255, 255, 255, 0.05); }

.delete-item {
  margin-top: 4px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding-top: 4px;
}

.role-stats {
  display: flex;
  gap: 24px;
  margin-bottom: 20px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.02);
  border-radius: 12px;
}

.role-stat {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #94a3b8;
}

.role-stat .stat-number { font-size: 18px; font-weight: 700; color: #f8fafc; }
.role-stat .stat-text { font-size: 13px; }

.role-actions { display: flex; gap: 10px; }
.action-btn { flex: 1; border-radius: 10px !important; }

.pagination-container {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 28px;
  padding-top: 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  flex-wrap: wrap;
  gap: 16px;
}

.pagination-info { font-size: 14px; color: #94a3b8; }
.pagination-info strong { color: #f8fafc; }

.pagination-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.page-btn { width: 40px !important; height: 40px !important; border-radius: 10px !important; }

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
  background: linear-gradient(135deg, #ef4444, #f97316) !important;
  color: white !important;
}

.custom-dialog :deep(.v-overlay__content) { margin: 16px; }

.dialog-card {
  background: #1e1e2e !important;
  border: 1px solid rgba(255, 255, 255, 0.1);
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

.dialog-icon.create { background: linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(6, 182, 212, 0.2)); color: #34d399; }
.dialog-icon.edit { background: linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(139, 92, 246, 0.2)); color: #818cf8; }
.dialog-icon.permissions { background: linear-gradient(135deg, rgba(6, 182, 212, 0.2), rgba(59, 130, 246, 0.2)); color: #22d3ee; }

.dialog-title { font-size: 22px; font-weight: 700; color: #f8fafc; margin: 0; }
.dialog-subtitle { font-size: 14px; color: #94a3b8; margin: 4px 0 0; }

.close-btn { position: absolute !important; right: 16px; top: 16px; color: #64748b !important; }

.dialog-body { padding: 24px !important; }
.permissions-body { max-height: 60vh; overflow-y: auto; }

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
}

.form-group { display: flex; flex-direction: column; gap: 8px; }
.form-group.full-width { grid-column: 1 / -1; }

.form-label { font-size: 14px; font-weight: 600; color: #e2e8f0; }
.form-label .required { color: #f87171; }

.form-group :deep(.v-field) {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
}

.permissions-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.permission-module {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  overflow: hidden;
  transition: all 0.2s ease;
}

.permission-module:hover { border-color: rgba(255, 255, 255, 0.15); }

.module-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.03);
  cursor: pointer;
  transition: background 0.2s ease;
}

.module-header:hover { background: rgba(255, 255, 255, 0.06); }

.module-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.module-name { font-size: 14px; font-weight: 600; color: #f8fafc; flex: 1; }

.module-count {
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
  background: rgba(255, 255, 255, 0.1);
  padding: 2px 8px;
  border-radius: 10px;
}

.module-permissions {
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.permission-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s ease;
}

.permission-item:hover { background: rgba(255, 255, 255, 0.05); }
.permission-name { font-size: 13px; color: #94a3b8; }

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 12px;
  padding: 20px 24px;
  background: rgba(0, 0, 0, 0.2);
}

.selected-count {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #22d3ee;
  margin-right: auto;
}

.submit-btn { background: linear-gradient(135deg, #10b981, #06b6d4) !important; color: white !important; font-weight: 600; }
.submit-btn.edit { background: linear-gradient(135deg, #6366f1, #8b5cf6) !important; }
.submit-btn.permissions { background: linear-gradient(135deg, #06b6d4, #3b82f6) !important; }

.delete-dialog { text-align: center; }
.delete-content { padding: 32px 24px; }

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

.delete-title { font-size: 24px; font-weight: 700; color: #f8fafc; margin: 0 0 12px; }
.delete-message { font-size: 16px; color: #94a3b8; margin: 0 0 16px; }
.delete-message strong { color: #f8fafc; }

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
  margin: 8px 0 0;
}

.delete-warning.danger { color: #f87171; background: rgba(239, 68, 68, 0.1); }
.delete-footer { justify-content: center; }

@media (max-width: 1200px) { .stats-grid { grid-template-columns: repeat(2, 1fr); } }

@media (max-width: 768px) {
  .roles-page { padding: 16px; }
  .header-content { flex-direction: column; align-items: flex-start; }
  .add-btn { width: 100%; }
  .page-title { font-size: 24px; }
  .stats-grid { grid-template-columns: repeat(2, 1fr); gap: 12px; }
  .stat-card { padding: 16px; }
  .stat-value { font-size: 22px; }
  .filters-body { flex-direction: column; }
  .filter-item, .search-filter { min-width: 100%; }
  .roles-grid { grid-template-columns: 1fr; }
  .permissions-grid { grid-template-columns: 1fr; }
  .form-grid { grid-template-columns: 1fr; }
  .pagination-container { flex-direction: column; text-align: center; }
  .pagination-info { order: 2; }
  .dialog-footer { flex-wrap: wrap; }
  .selected-count { width: 100%; justify-content: center; margin-bottom: 12px; }
}

@media (max-width: 480px) {
  .header-left { flex-direction: column; align-items: flex-start; gap: 12px; }
  .header-icon { width: 48px; height: 48px; }
  .stats-grid { grid-template-columns: 1fr; }
  .page-numbers { display: none; }
  .role-stats { flex-direction: column; gap: 12px; }
}
</style>
