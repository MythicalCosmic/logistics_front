<!-- src/pages/facilities.vue -->

<script setup>
import { ref, onMounted, watch, computed } from 'vue'
import { useTheme } from 'vuetify'
import { useToast } from '@/composables/useToast'
import api from '@/services/api'

const { success: toastSuccess, error: toastError } = useToast()
const vuetifyTheme = useTheme()
const isDark = computed(() => vuetifyTheme.global.current.value.dark)

// Facility types
const facilityTypes = [
  { title: 'Warehouse', value: 'warehouse' },
  { title: 'Terminal', value: 'terminal' },
  { title: 'Yard', value: 'yard' },
  { title: 'Distribution Center', value: 'distribution_center' },
  { title: 'Cross Dock', value: 'cross_dock' },
  { title: 'Cold Storage', value: 'cold_storage' },
  { title: 'Port', value: 'port' },
]

// Data
const facilities = ref([])
const loading = ref(false)
const totalFacilities = ref(0)

// Pagination & Filters
const page = ref(1)
const perPage = ref(20)
const search = ref('')
const filterType = ref(null)
const filterState = ref(null)
const totalPages = computed(() => Math.ceil(totalFacilities.value / perPage.value))

// Dialogs
const showCreateDialog = ref(false)
const showEditDialog = ref(false)
const showDeleteDialog = ref(false)
const dialogLoading = ref(false)

// Form Data
const defaultForm = {
  code: '',
  name: '',
  address: '',
  city: '',
  state: '',
  zip_code: '',
  facility_type: 'warehouse',
}
const form = ref({ ...defaultForm })
const formErrors = ref({})
const selectedFacility = ref(null)

// Stats
const serverStats = ref(null)
const stats = computed(() => {
  if (serverStats.value) {
    return {
      total: serverStats.value.total_facilities ?? serverStats.value.total ?? totalFacilities.value,
      byType: serverStats.value.by_type || serverStats.value.facility_types || [],
      byState: serverStats.value.by_state || serverStats.value.states || [],
      recentCount: serverStats.value.recent_count ?? 0,
    }
  }
  // Derive from current list if no stats endpoint
  const typeMap = {}
  const stateMap = {}
  facilities.value.forEach(f => {
    typeMap[f.facility_type] = (typeMap[f.facility_type] || 0) + 1
    if (f.state) stateMap[f.state] = (stateMap[f.state] || 0) + 1
  })
  return {
    total: totalFacilities.value,
    byType: Object.entries(typeMap).map(([type, count]) => ({ type, count })),
    byState: Object.entries(stateMap).map(([state, count]) => ({ state, count })),
    recentCount: 0,
  }
})

// Unique states from facilities for filter
const availableStates = computed(() => {
  const states = new Set()
  facilities.value.forEach(f => {
    if (f.state) states.add(f.state)
  })
  return [...states].sort().map(s => ({ title: s, value: s }))
})

// Stat cards derived
const typeBreakdown = computed(() => {
  const types = {}
  facilities.value.forEach(f => {
    types[f.facility_type] = (types[f.facility_type] || 0) + 1
  })
  return types
})

const stateCount = computed(() => {
  const states = new Set()
  facilities.value.forEach(f => {
    if (f.state) states.add(f.state)
  })
  return states.size
})

const fetchStats = async () => {
  try {
    const response = await api.get('/admin-api/facilities/stats')
    if (response.data.success) {
      serverStats.value = response.data.data
    }
  } catch (error) {
    // Stats are non-critical
  }
}

// Fetch facilities
const fetchFacilities = async () => {
  loading.value = true

  try {
    const params = new URLSearchParams({
      page: page.value,
      per_page: perPage.value,
    })

    if (search.value) params.append('search', search.value)
    if (filterType.value) params.append('facility_type', filterType.value)
    if (filterState.value) params.append('state', filterState.value)

    const response = await api.get(`/admin-api/facilities?${params}`)

    if (response.data.success) {
      facilities.value = response.data.data?.facilities || []
      totalFacilities.value = response.data.data?.pagination?.total || 0
    }
  } catch (error) {
    console.error('Failed to fetch facilities:', error)
    toastError('Failed to load facilities')
  } finally {
    loading.value = false
  }
}

// Create facility
const handleCreate = async () => {
  formErrors.value = {}

  if (!form.value.code) formErrors.value.code = 'Code is required'

  if (Object.keys(formErrors.value).length > 0) return

  dialogLoading.value = true

  try {
    const response = await api.post('/admin-api/facilities/create', {
      code: form.value.code,
      name: form.value.name || '',
      address: form.value.address || '',
      city: form.value.city || '',
      state: form.value.state || '',
      zip_code: form.value.zip_code || '',
      facility_type: form.value.facility_type || 'warehouse',
    })

    if (response.data.success) {
      toastSuccess('Facility created successfully')
      showCreateDialog.value = false
      resetForm()
      fetchFacilities()
      fetchStats()
    }
  } catch (error) {
    // Handled by interceptor
  } finally {
    dialogLoading.value = false
  }
}

// Update facility
const handleUpdate = async () => {
  formErrors.value = {}

  if (!form.value.code) formErrors.value.code = 'Code is required'

  if (Object.keys(formErrors.value).length > 0) return

  dialogLoading.value = true

  try {
    const response = await api.put(`/admin-api/facilities/${selectedFacility.value.id}/update`, {
      code: form.value.code,
      name: form.value.name || '',
      address: form.value.address || '',
      city: form.value.city || '',
      state: form.value.state || '',
      zip_code: form.value.zip_code || '',
      facility_type: form.value.facility_type || 'warehouse',
    })

    if (response.data.success) {
      toastSuccess('Facility updated successfully')
      showEditDialog.value = false
      resetForm()
      fetchFacilities()
      fetchStats()
    }
  } catch (error) {
    // Handled by interceptor
  } finally {
    dialogLoading.value = false
  }
}

// Delete facility
const handleDelete = async () => {
  if (!selectedFacility.value) return

  dialogLoading.value = true

  try {
    const response = await api.delete(`/admin-api/facilities/${selectedFacility.value.id}/delete`)

    if (response.data.success) {
      toastSuccess('Facility deleted successfully')
      showDeleteDialog.value = false
      selectedFacility.value = null
      fetchFacilities()
      fetchStats()
    }
  } catch (error) {
    // Handled by interceptor
  } finally {
    dialogLoading.value = false
  }
}

// Open edit dialog
const openEditDialog = (facility) => {
  selectedFacility.value = facility
  form.value = {
    code: facility.code,
    name: facility.name || '',
    address: facility.address || '',
    city: facility.city || '',
    state: facility.state || '',
    zip_code: facility.zip_code || '',
    facility_type: facility.facility_type || 'warehouse',
  }
  showEditDialog.value = true
}

// Open delete dialog
const openDeleteDialog = (facility) => {
  selectedFacility.value = facility
  showDeleteDialog.value = true
}

// Reset form
const resetForm = () => {
  form.value = { ...defaultForm }
  formErrors.value = {}
  selectedFacility.value = null
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

// Format type label
const formatType = (type) => {
  if (!type) return 'Unknown'
  return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// Get type color
const getTypeColor = (type) => {
  const t = type?.toLowerCase() || ''
  if (t.includes('warehouse')) return { bg: 'rgba(99, 102, 241, 0.15)', text: '#818cf8', border: 'rgba(99, 102, 241, 0.3)', gradient: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }
  if (t.includes('terminal')) return { bg: 'rgba(16, 185, 129, 0.15)', text: '#34d399', border: 'rgba(16, 185, 129, 0.3)', gradient: 'linear-gradient(135deg, #10b981, #06b6d4)' }
  if (t.includes('yard')) return { bg: 'rgba(245, 158, 11, 0.15)', text: '#fbbf24', border: 'rgba(245, 158, 11, 0.3)', gradient: 'linear-gradient(135deg, #f59e0b, #f97316)' }
  if (t.includes('distribution')) return { bg: 'rgba(236, 72, 153, 0.15)', text: '#f472b6', border: 'rgba(236, 72, 153, 0.3)', gradient: 'linear-gradient(135deg, #ec4899, #a855f7)' }
  if (t.includes('cross')) return { bg: 'rgba(6, 182, 212, 0.15)', text: '#22d3ee', border: 'rgba(6, 182, 212, 0.3)', gradient: 'linear-gradient(135deg, #06b6d4, #3b82f6)' }
  if (t.includes('cold')) return { bg: 'rgba(59, 130, 246, 0.15)', text: '#60a5fa', border: 'rgba(59, 130, 246, 0.3)', gradient: 'linear-gradient(135deg, #3b82f6, #6366f1)' }
  if (t.includes('port')) return { bg: 'rgba(156, 39, 176, 0.15)', text: '#ce93d8', border: 'rgba(156, 39, 176, 0.3)', gradient: 'linear-gradient(135deg, #9c27b0, #7b1fa2)' }
  return { bg: 'rgba(100, 116, 139, 0.15)', text: '#94a3b8', border: 'rgba(100, 116, 139, 0.3)', gradient: 'linear-gradient(135deg, #64748b, #475569)' }
}

// Get type icon
const getTypeIcon = (type) => {
  const t = type?.toLowerCase() || ''
  if (t.includes('warehouse')) return 'bx-buildings'
  if (t.includes('terminal')) return 'bx-bus'
  if (t.includes('yard')) return 'bx-grid-alt'
  if (t.includes('distribution')) return 'bx-transfer'
  if (t.includes('cross')) return 'bx-intersect'
  if (t.includes('cold')) return 'bx-water'
  if (t.includes('port')) return 'bx-boat'
  return 'bx-map-pin'
}

// Build full address string
const getFullAddress = (facility) => {
  const parts = [facility.address, facility.city, facility.state, facility.zip_code].filter(Boolean)
  return parts.join(', ') || 'No address provided'
}

// Watch for filter changes
let searchTimeout = null
watch(search, () => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    page.value = 1
    fetchFacilities()
  }, 300)
})

watch([filterType, filterState], () => {
  page.value = 1
  fetchFacilities()
})

watch(page, () => {
  fetchFacilities()
})

onMounted(() => {
  fetchFacilities()
  fetchStats()
})
</script>

<template>
  <div class="facilities-page" :class="{ 'theme-light': !isDark }">
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
            <VIcon icon="bx-buildings" size="32" />
          </div>
          <div>
            <h1 class="page-title">Facilities</h1>
            <p class="page-subtitle">Manage warehouses, terminals, and facility locations</p>
          </div>
        </div>
        <VBtn
          class="add-btn"
          size="large"
          @click="showCreateDialog = true"
        >
          <VIcon icon="bx-plus" class="me-2" />
          <span class="btn-text">Add Facility</span>
        </VBtn>
      </div>
    </div>

    <!-- Stats Cards -->
    <div class="stats-grid">
      <div class="stat-card stat-total">
        <div class="stat-icon">
          <VIcon icon="bx-buildings" size="28" />
        </div>
        <div class="stat-content">
          <span class="stat-value">{{ totalFacilities }}</span>
          <span class="stat-label">Total Facilities</span>
        </div>
        <div class="stat-decoration"></div>
      </div>

      <div class="stat-card stat-warehouses">
        <div class="stat-icon">
          <VIcon icon="bx-box" size="28" />
        </div>
        <div class="stat-content">
          <span class="stat-value">{{ typeBreakdown['warehouse'] || 0 }}</span>
          <span class="stat-label">Warehouses</span>
        </div>
        <div class="stat-decoration"></div>
      </div>

      <div class="stat-card stat-terminals">
        <div class="stat-icon">
          <VIcon icon="bx-bus" size="28" />
        </div>
        <div class="stat-content">
          <span class="stat-value">{{ typeBreakdown['terminal'] || 0 }}</span>
          <span class="stat-label">Terminals</span>
        </div>
        <div class="stat-decoration"></div>
      </div>

      <div class="stat-card stat-states">
        <div class="stat-icon">
          <VIcon icon="bx-map" size="28" />
        </div>
        <div class="stat-content">
          <span class="stat-value">{{ stateCount }}</span>
          <span class="stat-label">States</span>
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
            placeholder="Search by code, name, city, state..."
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
            v-model="filterType"
            :items="facilityTypes"
            item-title="title"
            item-value="value"
            placeholder="All Types"
            variant="outlined"
            density="comfortable"
            hide-details
            clearable
            class="filter-select"
          >
            <template #prepend-inner>
              <VIcon icon="bx-category" size="20" />
            </template>
          </VSelect>
        </div>

        <div class="filter-item">
          <VSelect
            v-model="filterState"
            :items="availableStates"
            item-title="title"
            item-value="value"
            placeholder="All States"
            variant="outlined"
            density="comfortable"
            hide-details
            clearable
            class="filter-select"
          >
            <template #prepend-inner>
              <VIcon icon="bx-map-pin" size="20" />
            </template>
          </VSelect>
        </div>

        <VBtn
          variant="tonal"
          class="clear-btn"
          @click="search = ''; filterType = null; filterState = null"
        >
          <VIcon icon="bx-refresh" class="me-2" />
          Reset
        </VBtn>
      </div>
    </div>

    <!-- Facilities List -->
    <div class="facilities-container">
      <!-- Loading State -->
      <div v-if="loading" class="loading-state">
        <div class="loading-spinner">
          <div class="spinner"></div>
        </div>
        <p>Loading facilities...</p>
      </div>

      <!-- Empty State -->
      <div v-else-if="!facilities.length" class="empty-state">
        <div class="empty-icon">
          <VIcon icon="bx-map-alt" size="64" />
        </div>
        <h3>No Facilities Found</h3>
        <p>Try adjusting your filters or add a new facility to get started.</p>
        <VBtn
          class="add-btn mt-4"
          @click="showCreateDialog = true"
        >
          <VIcon icon="bx-plus" class="me-2" />
          Add First Facility
        </VBtn>
      </div>

      <!-- Facilities Grid -->
      <div v-else class="facilities-grid">
        <div
          v-for="(facility, index) in facilities"
          :key="facility.id"
          class="facility-card"
          :style="{ '--delay': `${index * 0.05}s` }"
        >
          <div class="card-glow"></div>

          <!-- Facility Header -->
          <div class="facility-header">
            <div class="facility-avatar" :style="{ background: getTypeColor(facility.facility_type).gradient }">
              <VIcon :icon="getTypeIcon(facility.facility_type)" size="24" color="white" />
            </div>

            <div class="facility-info">
              <h3 class="facility-code">{{ facility.code }}</h3>
              <p class="facility-name">{{ facility.name || 'Unnamed facility' }}</p>
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
                <VListItem @click="openEditDialog(facility)">
                  <template #prepend>
                    <VIcon icon="bx-edit" color="primary" />
                  </template>
                  <VListItemTitle>Edit Facility</VListItemTitle>
                </VListItem>
                <VListItem
                  @click="openDeleteDialog(facility)"
                  class="delete-item"
                >
                  <template #prepend>
                    <VIcon icon="bx-trash" color="error" />
                  </template>
                  <VListItemTitle class="text-error">Delete Facility</VListItemTitle>
                </VListItem>
              </VList>
            </VMenu>
          </div>

          <!-- Address -->
          <div class="facility-address">
            <VIcon icon="bx-map" size="16" />
            <span>{{ getFullAddress(facility) }}</span>
          </div>

          <!-- Footer -->
          <div class="facility-footer">
            <span
              class="type-badge"
              :style="{
                background: getTypeColor(facility.facility_type).bg,
                color: getTypeColor(facility.facility_type).text,
                borderColor: getTypeColor(facility.facility_type).border,
              }"
            >
              <VIcon :icon="getTypeIcon(facility.facility_type)" size="14" class="me-1" />
              {{ formatType(facility.facility_type) }}
            </span>
            <div class="footer-date">
              <VIcon icon="bx-calendar" size="16" />
              <span>{{ formatDate(facility.created_at) }}</span>
            </div>
          </div>

          <!-- Quick Actions (Mobile) -->
          <div class="quick-actions">
            <VBtn
              icon
              size="small"
              variant="tonal"
              color="primary"
              @click="openEditDialog(facility)"
            >
              <VIcon icon="bx-edit" size="18" />
            </VBtn>
            <VBtn
              icon
              size="small"
              variant="tonal"
              color="error"
              @click="openDeleteDialog(facility)"
            >
              <VIcon icon="bx-trash" size="18" />
            </VBtn>
          </div>
        </div>
      </div>

      <!-- Pagination -->
      <div v-if="facilities.length && totalPages > 1" class="pagination-container">
        <div class="pagination-info">
          Showing <strong>{{ (page - 1) * perPage + 1 }}</strong> to
          <strong>{{ Math.min(page * perPage, totalFacilities) }}</strong> of
          <strong>{{ totalFacilities }}</strong> facilities
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
            <VIcon icon="bx-map-pin" size="28" />
          </div>
          <div>
            <h2 class="dialog-title">Add New Facility</h2>
            <p class="dialog-subtitle">Register a new warehouse or terminal location</p>
          </div>
          <VBtn icon variant="text" class="close-btn" @click="showCreateDialog = false; resetForm()">
            <VIcon icon="bx-x" />
          </VBtn>
        </div>

        <VCardText class="dialog-body">
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label">Code <span class="required">*</span></label>
              <VTextField
                v-model="form.code"
                variant="outlined"
                density="comfortable"
                placeholder="e.g. WH-001"
                :error-messages="formErrors.code"
              >
                <template #prepend-inner>
                  <VIcon icon="bx-hash" />
                </template>
              </VTextField>
            </div>
            <div class="form-group">
              <label class="form-label">Name</label>
              <VTextField
                v-model="form.name"
                variant="outlined"
                density="comfortable"
                placeholder="Facility name"
              >
                <template #prepend-inner>
                  <VIcon icon="bx-buildings" />
                </template>
              </VTextField>
            </div>
            <div class="form-group full-width">
              <label class="form-label">Facility Type</label>
              <VSelect
                v-model="form.facility_type"
                :items="facilityTypes"
                item-title="title"
                item-value="value"
                variant="outlined"
                density="comfortable"
                hide-details
              >
                <template #prepend-inner>
                  <VIcon icon="bx-category" />
                </template>
              </VSelect>
            </div>
            <div class="form-group full-width">
              <label class="form-label">Address</label>
              <VTextField
                v-model="form.address"
                variant="outlined"
                density="comfortable"
                placeholder="Street address"
              >
                <template #prepend-inner>
                  <VIcon icon="bx-map" />
                </template>
              </VTextField>
            </div>
            <div class="form-group">
              <label class="form-label">City</label>
              <VTextField
                v-model="form.city"
                variant="outlined"
                density="comfortable"
                placeholder="City"
              />
            </div>
            <div class="form-group">
              <label class="form-label">State</label>
              <VTextField
                v-model="form.state"
                variant="outlined"
                density="comfortable"
                placeholder="State"
              />
            </div>
            <div class="form-group full-width">
              <label class="form-label">Zip Code</label>
              <VTextField
                v-model="form.zip_code"
                variant="outlined"
                density="comfortable"
                placeholder="Zip code"
              >
                <template #prepend-inner>
                  <VIcon icon="bx-envelope" />
                </template>
              </VTextField>
            </div>
          </div>
        </VCardText>

        <div class="dialog-footer">
          <VBtn variant="outlined" size="large" @click="showCreateDialog = false; resetForm()">
            Cancel
          </VBtn>
          <VBtn class="submit-btn" size="large" :loading="dialogLoading" @click="handleCreate">
            <VIcon icon="bx-plus" class="me-2" />
            Create Facility
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
            <h2 class="dialog-title">Edit Facility</h2>
            <p class="dialog-subtitle">Update facility information</p>
          </div>
          <VBtn icon variant="text" class="close-btn" @click="showEditDialog = false; resetForm()">
            <VIcon icon="bx-x" />
          </VBtn>
        </div>

        <VCardText class="dialog-body">
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label">Code <span class="required">*</span></label>
              <VTextField
                v-model="form.code"
                variant="outlined"
                density="comfortable"
                placeholder="e.g. WH-001"
                :error-messages="formErrors.code"
              >
                <template #prepend-inner>
                  <VIcon icon="bx-hash" />
                </template>
              </VTextField>
            </div>
            <div class="form-group">
              <label class="form-label">Name</label>
              <VTextField
                v-model="form.name"
                variant="outlined"
                density="comfortable"
                placeholder="Facility name"
              >
                <template #prepend-inner>
                  <VIcon icon="bx-buildings" />
                </template>
              </VTextField>
            </div>
            <div class="form-group full-width">
              <label class="form-label">Facility Type</label>
              <VSelect
                v-model="form.facility_type"
                :items="facilityTypes"
                item-title="title"
                item-value="value"
                variant="outlined"
                density="comfortable"
                hide-details
              >
                <template #prepend-inner>
                  <VIcon icon="bx-category" />
                </template>
              </VSelect>
            </div>
            <div class="form-group full-width">
              <label class="form-label">Address</label>
              <VTextField
                v-model="form.address"
                variant="outlined"
                density="comfortable"
                placeholder="Street address"
              >
                <template #prepend-inner>
                  <VIcon icon="bx-map" />
                </template>
              </VTextField>
            </div>
            <div class="form-group">
              <label class="form-label">City</label>
              <VTextField
                v-model="form.city"
                variant="outlined"
                density="comfortable"
                placeholder="City"
              />
            </div>
            <div class="form-group">
              <label class="form-label">State</label>
              <VTextField
                v-model="form.state"
                variant="outlined"
                density="comfortable"
                placeholder="State"
              />
            </div>
            <div class="form-group full-width">
              <label class="form-label">Zip Code</label>
              <VTextField
                v-model="form.zip_code"
                variant="outlined"
                density="comfortable"
                placeholder="Zip code"
              >
                <template #prepend-inner>
                  <VIcon icon="bx-envelope" />
                </template>
              </VTextField>
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
          <h2 class="delete-title">Delete Facility</h2>
          <p class="delete-message">
            Are you sure you want to delete
            <strong>{{ selectedFacility?.code }}</strong>
            <template v-if="selectedFacility?.name"> ({{ selectedFacility.name }})</template>?
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
            Delete Facility
          </VBtn>
        </div>
      </VCard>
    </VDialog>
  </div>
</template>

<style scoped>
/* Theme Variables */
.facilities-page {
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
  --grad-base-start: #0f0f1a;
  --grad-base-end: #1a1a2e;
  --grid-line: rgba(255, 255, 255, 0.02);
  --shape-opacity: 0.4;
  --shadow-card: 0 8px 24px rgba(0, 0, 0, 0.2);
  --shadow-btn: 0 8px 32px rgba(99, 102, 241, 0.35);
}

.facilities-page.theme-light {
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
  --grad-base-start: #f8f9fe;
  --grad-base-end: #f1f3f9;
  --grid-line: rgba(0, 0, 0, 0.03);
  --shape-opacity: 0.12;
  --shadow-card: 0 2px 12px rgba(0, 0, 0, 0.06);
  --shadow-btn: 0 8px 32px rgba(99, 102, 241, 0.2);
}

/* Page Layout */
.facilities-page {
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

.stat-warehouses .stat-icon {
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(249, 115, 22, 0.2));
  color: #fbbf24;
}

.stat-terminals .stat-icon {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(6, 182, 212, 0.2));
  color: #34d399;
}

.stat-states .stat-icon {
  background: linear-gradient(135deg, rgba(236, 72, 153, 0.2), rgba(168, 85, 247, 0.2));
  color: #f472b6;
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

.stat-warehouses .stat-decoration {
  background: linear-gradient(135deg, #f59e0b, #f97316);
}

.stat-terminals .stat-decoration {
  background: linear-gradient(135deg, #10b981, #06b6d4);
}

.stat-states .stat-decoration {
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

.filter-select :deep(.v-field) {
  background: var(--input-bg);
  border-radius: 12px;
}

.clear-btn {
  height: 48px !important;
  border-radius: 12px !important;
  flex-shrink: 0;
}

/* Facilities Container */
.facilities-container {
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

/* Facilities Grid */
.facilities-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 20px;
}

/* Facility Card */
.facility-card {
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

.facility-card:hover {
  border-color: rgba(99, 102, 241, 0.3);
  transform: translateY(-4px);
}

.facility-card:hover .card-glow {
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

/* Facility Header */
.facility-header {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  margin-bottom: 14px;
}

.facility-avatar {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: var(--shadow-card);
}

.facility-info {
  flex: 1;
  min-width: 0;
}

.facility-code {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-heading);
  margin: 0;
  font-family: monospace;
  letter-spacing: 0.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.facility-name {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 2px 0 0;
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

/* Address */
.facility-address {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 13px;
  color: var(--text-muted);
  margin-bottom: 16px;
  line-height: 1.5;
}

.facility-address .v-icon {
  color: var(--primary-light);
  flex-shrink: 0;
  margin-top: 2px;
}

/* Footer */
.facility-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 16px;
  border-top: 1px solid var(--border-line);
}

.type-badge {
  display: inline-flex;
  align-items: center;
  font-size: 12px;
  font-weight: 600;
  padding: 6px 12px;
  border-radius: 8px;
  border: 1px solid;
  letter-spacing: 0.3px;
}

.footer-date {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-muted);
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
  .facilities-page {
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

  .facilities-grid {
    grid-template-columns: 1fr;
  }

  .facility-card {
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
