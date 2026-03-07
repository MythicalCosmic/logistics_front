<!-- src/pages/loads.vue -->

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
const canCreate = computed(() => authStore.hasPermission('loads.create'))
const canEdit = computed(() => authStore.hasPermission('loads.update'))
const canViewAnalytics = computed(() => authStore.hasPermission('analytics.view'))

// Enums
const statusOptions = [
  { title: 'Available', value: 'available' },
  { title: 'Booked', value: 'booked' },
  { title: 'In Transit', value: 'in_transit' },
  { title: 'Delivered', value: 'delivered' },
  { title: 'Cancelled', value: 'cancelled' },
]

const driverTypes = [
  { title: 'Solo', value: 'solo' },
  { title: 'Team', value: 'team' },
]

const loadTypes = [
  { title: 'Drop', value: 'drop' },
  { title: 'Live', value: 'live' },
]

const directions = [
  { title: 'One Way', value: 'one_way' },
  { title: 'Round Trip', value: 'round_trip' },
]

const sortOptions = [
  { title: 'Newest First', value: '-created_at' },
  { title: 'Oldest First', value: 'created_at' },
  { title: 'Highest Payout', value: '-payout' },
  { title: 'Most Miles', value: '-total_miles' },
  { title: 'Status', value: 'status' },
]

const statusTransitions = {
  available: [
    { value: 'booked', label: 'Book Load', icon: 'bx-bookmark-plus', color: '#3b82f6' },
    { value: 'cancelled', label: 'Cancel Load', icon: 'bx-x-circle', color: '#ef4444' },
  ],
  booked: [
    { value: 'in_transit', label: 'Start Transit', icon: 'bx-car', color: '#f59e0b' },
    { value: 'cancelled', label: 'Cancel Load', icon: 'bx-x-circle', color: '#ef4444' },
  ],
  in_transit: [
    { value: 'delivered', label: 'Mark Delivered', icon: 'bx-check-circle', color: '#10b981' },
  ],
  delivered: [],
  cancelled: [],
}

// Data
const loads = ref([])
const facilitiesList = ref([])
const loading = ref(false)
const totalLoads = ref(0)

// Pagination & Filters
const page = ref(1)
const perPage = ref(20)
const search = ref('')
const filterStatus = ref(null)
const sortBy = ref('-created_at')
const totalPages = computed(() => Math.ceil(totalLoads.value / perPage.value))

// Dialogs
const showCreateDialog = ref(false)
const showEditDialog = ref(false)
const showCancelDialog = ref(false)
const dialogLoading = ref(false)
const expandedLoadId = ref(null)
const groupByLoadId = ref(false)
const expandedGroups = ref({})

const toggleLoadExpand = (loadId) => {
  expandedLoadId.value = expandedLoadId.value === loadId ? null : loadId
}

const toggleGroupExpand = (groupId) => {
  expandedGroups.value = { ...expandedGroups.value, [groupId]: !expandedGroups.value[groupId] }
}

const groupedLoads = computed(() => {
  if (!groupByLoadId.value) return null
  const groups = {}
  loads.value.forEach(load => {
    const key = load.load_id || `single_${load.id}`
    if (!groups[key]) {
      groups[key] = { load_id: key, loads: [], totalPayout: 0, totalMiles: 0 }
    }
    groups[key].loads.push(load)
    groups[key].totalPayout += parseFloat(load.payout || 0)
    groups[key].totalMiles += parseFloat(load.total_miles || 0)
  })
  return Object.values(groups)
    .filter(g => g.loads.length > 0)
    .sort((a, b) => b.loads.length - a.loads.length)
})

const getRatePerMile = (load) => {
  const payout = parseFloat(load.payout || 0)
  const miles = parseFloat(load.total_miles || 0)
  if (!miles) return '-'
  return '$' + (payout / miles).toFixed(2)
}

const getTimeDiff = (start, end) => {
  if (!start || !end) return '-'
  const diff = new Date(end) - new Date(start)
  const hours = Math.floor(diff / 3600000)
  const mins = Math.floor((diff % 3600000) / 60000)
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m`
}

// Form Data
const defaultForm = {
  load_id: '',
  tour_id: '',
  origin_facility: '',
  origin_city: '',
  origin_state: '',
  origin_datetime: '',
  destination_facility: '',
  destination_city: '',
  destination_state: '',
  destination_datetime: '',
  total_stops: 2,
  total_miles: '',
  payout: '',
  driver_type: 'solo',
  load_type: 'drop',
  direction: 'one_way',
}
const form = ref({ ...defaultForm })
const formErrors = ref({})
const selectedLoad = ref(null)

// Stats
const serverStats = ref(null)
const stats = computed(() => {
  if (serverStats.value) {
    const sb = serverStats.value.status_breakdown || {}
    const fin = serverStats.value.financial || {}
    return {
      total: serverStats.value.total_loads || 0,
      available: sb.available || 0,
      inTransit: sb.in_transit || 0,
      delivered: sb.delivered || 0,
      booked: sb.booked || 0,
      cancelled: sb.cancelled || 0,
      totalPayout: fin.total_payout || '0',
      avgPayout: fin.avg_payout || '0',
      totalMiles: fin.total_miles || '0',
      avgMiles: fin.avg_miles || '0',
      newLast7d: serverStats.value.new_last_7d || 0,
    }
  }
  return { total: 0, available: 0, inTransit: 0, delivered: 0, booked: 0, cancelled: 0, totalPayout: '0', avgPayout: '0', totalMiles: '0', avgMiles: '0', newLast7d: 0 }
})

// Analytics
const analyticsOverview = ref(null)
const weeklyFrequency = ref([])
const monthlyFrequency = ref([])
const analyticsPeriod = ref('30d')
const analyticsLoading = ref(false)

const frequencyData = computed(() => {
  const weekMap = {}
  weeklyFrequency.value.forEach(l => { weekMap[l.load_id] = l })

  const monthMap = {}
  monthlyFrequency.value.forEach(l => { monthMap[l.load_id] = l })

  // Merge: use monthly as base, add weekly counts
  const allLoadIds = new Set([
    ...weeklyFrequency.value.map(l => l.load_id),
    ...monthlyFrequency.value.map(l => l.load_id),
  ])

  return [...allLoadIds].map(loadId => {
    const monthly = monthMap[loadId] || {}
    const weekly = weekMap[loadId] || {}
    return {
      load_id: loadId,
      weekly_count: weekly.count || 0,
      monthly_count: monthly.count || 0,
      total_payout: monthly.total_payout || weekly.total_payout || '0',
      avg_payout: monthly.avg_payout || weekly.avg_payout || '0',
      avg_miles: monthly.avg_miles || weekly.avg_miles || '0',
      last_seen: monthly.last_seen || weekly.last_seen,
      primary_route: monthly.primary_route || weekly.primary_route,
      status_breakdown: monthly.status_breakdown || weekly.status_breakdown || {},
    }
  }).sort((a, b) => b.monthly_count - a.monthly_count)
})

// Facility helpers
const facilityOptions = computed(() =>
  facilitiesList.value.map(f => ({
    title: f.code + (f.name ? ` - ${f.name}` : ''),
    value: String(f.id),
  }))
)

const facilityMap = computed(() => {
  const map = {}
  facilitiesList.value.forEach(f => {
    map[String(f.id)] = f
    map[f.code] = f
  })
  return map
})

const getFacilityDisplay = (value) => {
  if (!value) return '-'
  const f = facilityMap.value[String(value)]
  if (f) return f.code + (f.name ? ` - ${f.name}` : '')
  return value
}

const getFacilityShort = (value) => {
  if (!value) return '-'
  const f = facilityMap.value[String(value)]
  return f ? f.code : value
}

// Fetch functions
const fetchLoads = async () => {
  loading.value = true
  try {
    const params = new URLSearchParams({
      page: page.value,
      per_page: perPage.value,
      sort_by: sortBy.value,
    })
    if (search.value) params.append('search', search.value)
    if (filterStatus.value) params.append('status', filterStatus.value)

    const response = await api.get(`/api/loads?${params}`)
    if (response.data.success) {
      loads.value = response.data.data?.loads || []
      totalLoads.value = response.data.data?.pagination?.total || 0
    }
  } catch (error) {
    console.error('Failed to fetch loads:', error)
    toastError('Failed to load loads')
  } finally {
    loading.value = false
  }
}

const fetchStats = async () => {
  try {
    const response = await api.get('/api/loads/stats')
    if (response.data.success) {
      serverStats.value = response.data.data
    }
  } catch (error) { /* non-critical */ }
}

const fetchFacilities = async () => {
  try {
    const response = await api.get('/admin-api/facilities?per_page=100')
    if (response.data.success) {
      facilitiesList.value = response.data.data?.facilities || []
    }
  } catch (error) { /* non-critical */ }
}

const fetchAnalytics = async () => {
  analyticsLoading.value = true
  try {
    const [overviewRes, weekRes, monthRes] = await Promise.allSettled([
      api.get('/admin-api/analytics/overview'),
      api.get('/admin-api/analytics/loads/frequency', { params: { period: '7d', min_count: 1 } }),
      api.get('/admin-api/analytics/loads/frequency', { params: { period: '30d', min_count: 1 } }),
    ])

    if (overviewRes.status === 'fulfilled' && overviewRes.value.data.success) {
      analyticsOverview.value = overviewRes.value.data.data
    }
    if (weekRes.status === 'fulfilled' && weekRes.value.data.success) {
      weeklyFrequency.value = weekRes.value.data.data?.loads || []
    }
    if (monthRes.status === 'fulfilled' && monthRes.value.data.success) {
      monthlyFrequency.value = monthRes.value.data.data?.loads || []
    }
  } catch (error) { /* non-critical */ }
  finally { analyticsLoading.value = false }
}

// Create load
const handleCreate = async () => {
  formErrors.value = {}
  if (!form.value.origin_facility) formErrors.value.origin_facility = 'Origin facility is required'
  if (!form.value.destination_facility) formErrors.value.destination_facility = 'Destination facility is required'
  if (!form.value.origin_datetime) formErrors.value.origin_datetime = 'Origin datetime is required'
  if (!form.value.destination_datetime) formErrors.value.destination_datetime = 'Destination datetime is required'
  if (!form.value.total_miles) formErrors.value.total_miles = 'Total miles is required'
  if (!form.value.payout) formErrors.value.payout = 'Payout is required'

  if (Object.keys(formErrors.value).length > 0) return

  dialogLoading.value = true
  try {
    const response = await api.post('/api/loads/create', {
      load_id: form.value.load_id || '',
      tour_id: form.value.tour_id || '',
      origin_facility: form.value.origin_facility,
      origin_city: form.value.origin_city || '',
      origin_state: form.value.origin_state || '',
      origin_datetime: toISODatetime(form.value.origin_datetime),
      destination_facility: form.value.destination_facility,
      destination_city: form.value.destination_city || '',
      destination_state: form.value.destination_state || '',
      destination_datetime: toISODatetime(form.value.destination_datetime),
      total_stops: Number(form.value.total_stops) || 2,
      total_miles: Number(form.value.total_miles),
      payout: Number(form.value.payout),
      driver_type: form.value.driver_type || 'solo',
      load_type: form.value.load_type || 'drop',
      direction: form.value.direction || 'one_way',
    })

    if (response.data.success) {
      toastSuccess('Load created successfully')
      showCreateDialog.value = false
      resetForm()
      fetchLoads()
      fetchStats()
      if (canViewAnalytics.value) fetchAnalytics()
    }
  } catch (error) { /* interceptor */ }
  finally { dialogLoading.value = false }
}

// Update load
const handleUpdate = async () => {
  formErrors.value = {}
  if (!form.value.origin_facility) formErrors.value.origin_facility = 'Origin facility is required'
  if (!form.value.destination_facility) formErrors.value.destination_facility = 'Destination facility is required'
  if (!form.value.origin_datetime) formErrors.value.origin_datetime = 'Origin datetime is required'
  if (!form.value.destination_datetime) formErrors.value.destination_datetime = 'Destination datetime is required'
  if (!form.value.total_miles) formErrors.value.total_miles = 'Total miles is required'
  if (!form.value.payout) formErrors.value.payout = 'Payout is required'

  if (Object.keys(formErrors.value).length > 0) return

  dialogLoading.value = true
  try {
    const response = await api.put(`/api/loads/${selectedLoad.value.id}/update`, {
      load_id: form.value.load_id || '',
      tour_id: form.value.tour_id || '',
      origin_facility: form.value.origin_facility,
      origin_city: form.value.origin_city || '',
      origin_state: form.value.origin_state || '',
      origin_datetime: toISODatetime(form.value.origin_datetime),
      destination_facility: form.value.destination_facility,
      destination_city: form.value.destination_city || '',
      destination_state: form.value.destination_state || '',
      destination_datetime: toISODatetime(form.value.destination_datetime),
      total_stops: Number(form.value.total_stops) || 2,
      total_miles: Number(form.value.total_miles),
      payout: Number(form.value.payout),
      driver_type: form.value.driver_type || 'solo',
      load_type: form.value.load_type || 'drop',
    })

    if (response.data.success) {
      toastSuccess('Load updated successfully')
      showEditDialog.value = false
      resetForm()
      fetchLoads()
      fetchStats()
    }
  } catch (error) { /* interceptor */ }
  finally { dialogLoading.value = false }
}

// Cancel load
const handleCancel = async () => {
  if (!selectedLoad.value) return
  dialogLoading.value = true
  try {
    const response = await api.post(`/api/loads/${selectedLoad.value.id}/cancel`)
    if (response.data.success) {
      toastSuccess('Load cancelled successfully')
      showCancelDialog.value = false
      selectedLoad.value = null
      fetchLoads()
      fetchStats()
    }
  } catch (error) { /* interceptor */ }
  finally { dialogLoading.value = false }
}

// Change status
const handleStatusChange = async (load, newStatus) => {
  try {
    const response = await api.post(`/api/loads/${load.id}/status`, { status: newStatus })
    if (response.data.success) {
      toastSuccess(`Status updated to ${formatStatus(newStatus)}`)
      fetchLoads()
      fetchStats()
    }
  } catch (error) { /* interceptor */ }
}

// Dialog helpers
const openEditDialog = (load) => {
  selectedLoad.value = load
  form.value = {
    load_id: load.load_id || '',
    tour_id: load.tour_id || '',
    origin_facility: load.origin_facility || '',
    origin_city: load.origin_city || '',
    origin_state: load.origin_state || '',
    origin_datetime: toLocalDatetime(load.origin_datetime),
    destination_facility: load.destination_facility || '',
    destination_city: load.destination_city || '',
    destination_state: load.destination_state || '',
    destination_datetime: toLocalDatetime(load.destination_datetime),
    total_stops: load.total_stops || 2,
    total_miles: load.total_miles || '',
    payout: load.payout || '',
    driver_type: load.driver_type || 'solo',
    load_type: load.load_type || 'drop',
    direction: 'one_way',
  }
  showEditDialog.value = true
}

const openCancelDialog = (load) => {
  selectedLoad.value = load
  showCancelDialog.value = true
}

const resetForm = () => {
  form.value = { ...defaultForm }
  formErrors.value = {}
  selectedLoad.value = null
}

// Helpers
const toLocalDatetime = (isoString) => {
  if (!isoString) return ''
  return isoString.slice(0, 16)
}

const toISODatetime = (localDatetime) => {
  if (!localDatetime) return null
  return localDatetime.length === 16 ? localDatetime + ':00Z' : localDatetime
}

const formatDate = (dateString) => {
  if (!dateString) return '-'
  return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const formatDateTime = (dateString) => {
  if (!dateString) return '-'
  return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const formatMoney = (value) => {
  const num = parseFloat(value)
  if (isNaN(num)) return '$0'
  return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

const formatStatus = (status) => {
  if (!status) return '-'
  return status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

const getStatusColor = (status) => {
  const s = status?.toLowerCase() || ''
  if (s === 'available') return { bg: 'rgba(16, 185, 129, 0.15)', text: '#34d399', border: 'rgba(16, 185, 129, 0.3)' }
  if (s === 'booked') return { bg: 'rgba(59, 130, 246, 0.15)', text: '#60a5fa', border: 'rgba(59, 130, 246, 0.3)' }
  if (s === 'in_transit') return { bg: 'rgba(245, 158, 11, 0.15)', text: '#fbbf24', border: 'rgba(245, 158, 11, 0.3)' }
  if (s === 'delivered') return { bg: 'rgba(99, 102, 241, 0.15)', text: '#818cf8', border: 'rgba(99, 102, 241, 0.3)' }
  if (s === 'cancelled') return { bg: 'rgba(239, 68, 68, 0.15)', text: '#f87171', border: 'rgba(239, 68, 68, 0.3)' }
  return { bg: 'rgba(100, 116, 139, 0.15)', text: '#94a3b8', border: 'rgba(100, 116, 139, 0.3)' }
}

const getStatusIcon = (status) => {
  const s = status?.toLowerCase() || ''
  if (s === 'available') return 'bx-package'
  if (s === 'booked') return 'bx-bookmark'
  if (s === 'in_transit') return 'bx-car'
  if (s === 'delivered') return 'bx-check-circle'
  if (s === 'cancelled') return 'bx-x-circle'
  return 'bx-loader'
}

const canEditLoad = (load) => {
  return canEdit.value && !['delivered', 'cancelled'].includes(load.status)
}

const getAvailableTransitions = (load) => {
  return statusTransitions[load.status] || []
}

// Watchers
let searchTimeout = null
watch(search, () => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => { page.value = 1; fetchLoads() }, 300)
})

watch([filterStatus, sortBy], () => { page.value = 1; fetchLoads() })
watch(page, () => { fetchLoads() })

onMounted(() => {
  fetchLoads()
  fetchStats()
  fetchFacilities()
  if (canViewAnalytics.value) fetchAnalytics()
})
</script>

<template>
  <div class="loads-page" :class="{ 'theme-light': !isDark }">
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

    <!-- Header -->
    <div class="page-header">
      <div class="header-content">
        <div class="header-left">
          <div class="header-icon">
            <VIcon icon="bx-package" size="32" />
          </div>
          <div>
            <h1 class="page-title">Load Management</h1>
            <p class="page-subtitle">Track, manage, and analyze your freight loads</p>
          </div>
        </div>
        <VBtn v-if="canCreate" class="add-btn" size="large" @click="showCreateDialog = true">
          <VIcon icon="bx-plus" class="me-2" />
          <span class="btn-text">Add Load</span>
        </VBtn>
      </div>
    </div>

    <!-- Stats Grid -->
    <div class="stats-grid">
      <div class="stat-card stat-total">
        <div class="stat-icon"><VIcon icon="bx-package" size="28" /></div>
        <div class="stat-content">
          <span class="stat-value">{{ stats.total }}</span>
          <span class="stat-label">Total Loads</span>
        </div>
        <div class="stat-decoration"></div>
      </div>
      <div class="stat-card stat-available">
        <div class="stat-icon"><VIcon icon="bx-check-circle" size="28" /></div>
        <div class="stat-content">
          <span class="stat-value">{{ stats.available }}</span>
          <span class="stat-label">Available</span>
        </div>
        <div class="stat-decoration"></div>
      </div>
      <div class="stat-card stat-transit">
        <div class="stat-icon"><VIcon icon="bx-car" size="28" /></div>
        <div class="stat-content">
          <span class="stat-value">{{ stats.inTransit }}</span>
          <span class="stat-label">In Transit</span>
        </div>
        <div class="stat-decoration"></div>
      </div>
      <div class="stat-card stat-revenue">
        <div class="stat-icon"><VIcon icon="bx-dollar-circle" size="28" /></div>
        <div class="stat-content">
          <span class="stat-value">{{ formatMoney(stats.totalPayout) }}</span>
          <span class="stat-label">Total Revenue</span>
        </div>
        <div class="stat-decoration"></div>
      </div>
    </div>

    <!-- Analytics Section -->
    <div v-if="canViewAnalytics" class="analytics-section">
      <div class="analytics-header">
        <div class="analytics-title">
          <div class="analytics-icon"><VIcon icon="bx-bar-chart-alt-2" size="22" /></div>
          <div>
            <h2>Load Frequency Analysis</h2>
            <p>Track recurring loads — weekly and monthly appearances</p>
          </div>
        </div>
        <div v-if="analyticsOverview" class="analytics-summary">
          <div class="summary-chip">
            <VIcon icon="bx-trending-up" size="16" />
            <span>{{ analyticsOverview.this_week?.loads || 0 }} this week</span>
            <span v-if="analyticsOverview.this_week?.change_vs_last_week !== '0'" class="change-badge" :class="{ positive: parseFloat(analyticsOverview.this_week?.change_vs_last_week) > 0 }">
              {{ parseFloat(analyticsOverview.this_week?.change_vs_last_week) > 0 ? '+' : '' }}{{ analyticsOverview.this_week?.change_vs_last_week }}%
            </span>
          </div>
          <div class="summary-chip duplicates">
            <VIcon icon="bx-copy-alt" size="16" />
            <span>{{ analyticsOverview.total_duplicates || 0 }} duplicates</span>
          </div>
        </div>
      </div>

      <!-- Frequency Table -->
      <div v-if="analyticsLoading" class="analytics-loading">
        <div class="spinner small"></div>
        <span>Loading analytics...</span>
      </div>
      <div v-else-if="frequencyData.length" class="frequency-list">
        <div class="frequency-header-row">
          <span class="freq-col-id">Load ID</span>
          <span class="freq-col-week">This Week</span>
          <span class="freq-col-month">This Month</span>
          <span class="freq-col-payout">Total Payout</span>
          <span class="freq-col-route">Route</span>
          <span class="freq-col-seen">Last Seen</span>
        </div>
        <div
          v-for="item in frequencyData.slice(0, 10)"
          :key="item.load_id"
          class="frequency-row"
        >
          <div class="freq-col-id">
            <span class="freq-load-id">{{ item.load_id }}</span>
          </div>
          <div class="freq-col-week">
            <span class="freq-count" :class="{ highlight: item.weekly_count >= 2 }">{{ item.weekly_count }}x</span>
          </div>
          <div class="freq-col-month">
            <span class="freq-count" :class="{ highlight: item.monthly_count >= 3 }">{{ item.monthly_count }}x</span>
          </div>
          <div class="freq-col-payout">
            <span>{{ formatMoney(item.total_payout) }}</span>
          </div>
          <div class="freq-col-route">
            <span v-if="item.primary_route" class="freq-route">
              {{ item.primary_route.origin }} → {{ item.primary_route.destination }}
            </span>
            <span v-else class="text-muted">-</span>
          </div>
          <div class="freq-col-seen">
            <span>{{ formatDate(item.last_seen) }}</span>
          </div>
        </div>
      </div>
      <div v-else class="analytics-empty">
        <VIcon icon="bx-analyse" size="32" />
        <span>No recurring loads found yet</span>
      </div>
    </div>

    <!-- Filters -->
    <div class="filters-card">
      <div class="filters-header">
        <VIcon icon="bx-filter-alt" class="filter-icon" />
        <span>Filters</span>
      </div>
      <div class="filters-body">
        <div class="filter-item search-filter">
          <VTextField
            v-model="search"
            placeholder="Search by load ID, tour, city, state..."
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
            v-model="filterStatus"
            :items="statusOptions"
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
              <VIcon icon="bx-loader-circle" size="20" />
            </template>
          </VSelect>
        </div>
        <div class="filter-item">
          <VSelect
            v-model="sortBy"
            :items="sortOptions"
            item-title="title"
            item-value="value"
            variant="outlined"
            density="comfortable"
            hide-details
            class="filter-select"
          >
            <template #prepend-inner>
              <VIcon icon="bx-sort" size="20" />
            </template>
          </VSelect>
        </div>
        <VBtn
          variant="tonal"
          class="group-btn"
          :class="{ active: groupByLoadId }"
          @click="groupByLoadId = !groupByLoadId"
        >
          <VIcon :icon="groupByLoadId ? 'bx-layer' : 'bx-collection'" class="me-2" />
          {{ groupByLoadId ? 'Grouped' : 'Group' }}
        </VBtn>
        <VBtn variant="tonal" class="clear-btn" @click="search = ''; filterStatus = null; sortBy = '-created_at'">
          <VIcon icon="bx-refresh" class="me-2" />
          Reset
        </VBtn>
      </div>
    </div>

    <!-- Loads Container -->
    <div class="loads-container">
      <div v-if="loading" class="loading-state">
        <div class="loading-spinner"><div class="spinner"></div></div>
        <p>Loading loads...</p>
      </div>

      <div v-else-if="!loads.length" class="empty-state">
        <div class="empty-icon"><VIcon icon="bx-package" size="64" /></div>
        <h3>No Loads Found</h3>
        <p>Try adjusting your filters or create a new load to get started.</p>
        <VBtn v-if="canCreate" class="add-btn mt-4" @click="showCreateDialog = true">
          <VIcon icon="bx-plus" class="me-2" />
          Create First Load
        </VBtn>
      </div>

      <!-- Grouped View -->
      <div v-else-if="groupByLoadId && groupedLoads" class="grouped-view">
        <div
          v-for="(group, gIdx) in groupedLoads"
          :key="group.load_id"
          class="load-group"
          :style="{ '--delay': `${gIdx * 0.05}s` }"
        >
          <div class="group-header" @click="toggleGroupExpand(group.load_id)">
            <div class="group-header-left">
              <div class="group-icon">
                <VIcon icon="bx-layer" size="20" />
                <span class="group-count-badge">{{ group.loads.length }}</span>
              </div>
              <div class="group-info">
                <span class="group-id">{{ group.load_id }}</span>
                <span class="group-subtitle">{{ group.loads.length }} load{{ group.loads.length > 1 ? 's' : '' }} with this ID</span>
              </div>
            </div>
            <div class="group-header-right">
              <div class="group-stat">
                <span class="group-stat-label">Total Payout</span>
                <span class="group-stat-value money">{{ formatMoney(group.totalPayout) }}</span>
              </div>
              <div class="group-stat">
                <span class="group-stat-label">Total Miles</span>
                <span class="group-stat-value">{{ group.totalMiles.toLocaleString() }} mi</span>
              </div>
              <div class="group-stat">
                <span class="group-stat-label">Avg Payout</span>
                <span class="group-stat-value">{{ formatMoney(group.totalPayout / group.loads.length) }}</span>
              </div>
              <VIcon :icon="expandedGroups[group.load_id] ? 'bx-chevron-up' : 'bx-chevron-down'" size="22" class="group-chevron" />
            </div>
          </div>

          <!-- Group status summary -->
          <div class="group-status-bar">
            <span
              v-for="status in ['available', 'booked', 'in_transit', 'delivered', 'cancelled']"
              :key="status"
              v-show="group.loads.filter(l => l.status === status).length > 0"
              class="group-status-chip"
              :style="{ background: getStatusColor(status).bg, color: getStatusColor(status).text, borderColor: getStatusColor(status).border }"
            >
              {{ formatStatus(status) }}: {{ group.loads.filter(l => l.status === status).length }}
            </span>
          </div>

          <!-- Expanded group loads -->
          <div v-if="expandedGroups[group.load_id]" class="group-loads">
            <div
              v-for="(load, index) in group.loads"
              :key="load.id"
              class="load-card in-group"
              :class="{ 'is-expanded': expandedLoadId === load.id }"
              :style="{ '--delay': `${index * 0.03}s` }"
              @click="toggleLoadExpand(load.id)"
            >
              <div class="card-glow"></div>
              <div class="load-header" @click.stop>
                <div class="load-id-section">
                  <span class="load-id-label">{{ load.load_id || `#${load.id}` }}</span>
                  <span v-if="load.tour_id" class="tour-id">Tour: {{ load.tour_id }}</span>
                </div>
                <div class="header-right">
                  <span class="status-badge" :style="{ background: getStatusColor(load.status).bg, color: getStatusColor(load.status).text, borderColor: getStatusColor(load.status).border }">
                    <VIcon :icon="getStatusIcon(load.status)" size="14" class="me-1" />
                    {{ formatStatus(load.status) }}
                  </span>
                  <VMenu location="bottom end" :close-on-content-click="true">
                    <template #activator="{ props }">
                      <VBtn v-bind="props" icon variant="text" class="menu-btn" @click.stop>
                        <VIcon icon="bx-dots-vertical-rounded" />
                      </VBtn>
                    </template>
                    <VList class="action-menu">
                      <VListItem v-if="canEditLoad(load)" @click="openEditDialog(load)">
                        <template #prepend><VIcon icon="bx-edit" color="primary" /></template>
                        <VListItemTitle>Edit Load</VListItemTitle>
                      </VListItem>
                      <template v-for="transition in getAvailableTransitions(load)" :key="transition.value">
                        <VListItem v-if="canEdit" @click="handleStatusChange(load, transition.value)">
                          <template #prepend><VIcon :icon="transition.icon" :color="transition.value === 'cancelled' ? 'error' : 'info'" /></template>
                          <VListItemTitle :class="{ 'text-error': transition.value === 'cancelled' }">{{ transition.label }}</VListItemTitle>
                        </VListItem>
                      </template>
                    </VList>
                  </VMenu>
                </div>
              </div>
              <div class="load-route">
                <div class="route-point origin">
                  <div class="route-dot"></div>
                  <div class="route-info">
                    <span class="route-facility">{{ getFacilityShort(load.origin_facility) }}</span>
                    <span class="route-location">{{ [load.origin_city, load.origin_state].filter(Boolean).join(', ') || 'Origin' }}</span>
                  </div>
                  <span class="route-time">{{ formatDateTime(load.origin_datetime) }}</span>
                </div>
                <div class="route-line">
                  <div class="route-line-inner"></div>
                  <span class="route-miles">{{ parseFloat(load.total_miles || 0).toLocaleString() }} mi</span>
                </div>
                <div class="route-point destination">
                  <div class="route-dot dest"></div>
                  <div class="route-info">
                    <span class="route-facility">{{ getFacilityShort(load.destination_facility) }}</span>
                    <span class="route-location">{{ [load.destination_city, load.destination_state].filter(Boolean).join(', ') || 'Destination' }}</span>
                  </div>
                  <span class="route-time">{{ formatDateTime(load.destination_datetime) }}</span>
                </div>
              </div>
              <div class="load-details">
                <div class="detail-chip payout"><VIcon icon="bx-dollar" size="16" /><span>{{ formatMoney(load.payout) }}</span></div>
                <div class="detail-chip"><VIcon icon="bx-map-pin" size="16" /><span>{{ load.total_stops }} stops</span></div>
                <div class="detail-chip"><VIcon icon="bx-user" size="16" /><span class="text-capitalize">{{ load.driver_type }}</span></div>
                <div class="detail-chip"><VIcon icon="bx-transfer-alt" size="16" /><span class="text-capitalize">{{ load.load_type }}</span></div>
              </div>
              <div class="load-footer">
                <div class="footer-item"><VIcon icon="bx-calendar" size="16" /><span>{{ formatDate(load.created_at) }}</span></div>
                <div v-if="load.rate_per_mile" class="footer-item"><span class="rate-badge">${{ parseFloat(load.rate_per_mile).toFixed(2) }}/mi</span></div>
              </div>
              <div class="expand-hint">
                <VIcon :icon="expandedLoadId === load.id ? 'bx-chevron-up' : 'bx-chevron-down'" size="18" />
                <span>{{ expandedLoadId === load.id ? 'Less' : 'Details' }}</span>
              </div>
              <div v-if="expandedLoadId === load.id" class="expanded-panel" @click.stop>
                <div class="expanded-grid">
                  <div class="expanded-section">
                    <div class="expanded-section-title"><VIcon icon="bx-dollar-circle" size="16" /><span>Financial</span></div>
                    <div class="expanded-stats">
                      <div class="estat"><span class="estat-label">Payout</span><span class="estat-value money">{{ formatMoney(load.payout) }}</span></div>
                      <div class="estat"><span class="estat-label">Rate / Mile</span><span class="estat-value">{{ getRatePerMile(load) }}</span></div>
                      <div class="estat"><span class="estat-label">Total Miles</span><span class="estat-value">{{ parseFloat(load.total_miles || 0).toLocaleString() }}</span></div>
                    </div>
                  </div>
                  <div class="expanded-section">
                    <div class="expanded-section-title"><VIcon icon="bx-time" size="16" /><span>Schedule</span></div>
                    <div class="expanded-stats">
                      <div class="estat"><span class="estat-label">Pickup</span><span class="estat-value">{{ formatDateTime(load.origin_datetime) }}</span></div>
                      <div class="estat"><span class="estat-label">Delivery</span><span class="estat-value">{{ formatDateTime(load.destination_datetime) }}</span></div>
                      <div class="estat"><span class="estat-label">Transit</span><span class="estat-value">{{ getTimeDiff(load.origin_datetime, load.destination_datetime) }}</span></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Regular View -->
      <div v-else class="loads-grid">
        <div
          v-for="(load, index) in loads"
          :key="load.id"
          class="load-card"
          :class="{ 'is-expanded': expandedLoadId === load.id }"
          :style="{ '--delay': `${index * 0.04}s` }"
          @click="toggleLoadExpand(load.id)"
        >
          <div class="card-glow"></div>

          <!-- Card Header -->
          <div class="load-header" @click.stop>
            <div class="load-id-section">
              <span class="load-id-label">{{ load.load_id || `#${load.id}` }}</span>
              <span v-if="load.tour_id" class="tour-id">Tour: {{ load.tour_id }}</span>
            </div>
            <div class="header-right">
              <span
                class="status-badge"
                :style="{
                  background: getStatusColor(load.status).bg,
                  color: getStatusColor(load.status).text,
                  borderColor: getStatusColor(load.status).border,
                }"
              >
                <VIcon :icon="getStatusIcon(load.status)" size="14" class="me-1" />
                {{ formatStatus(load.status) }}
              </span>
              <VMenu location="bottom end" :close-on-content-click="true">
                <template #activator="{ props }">
                  <VBtn v-bind="props" icon variant="text" class="menu-btn">
                    <VIcon icon="bx-dots-vertical-rounded" />
                  </VBtn>
                </template>
                <VList class="action-menu">
                  <VListItem v-if="canEditLoad(load)" @click="openEditDialog(load)">
                    <template #prepend><VIcon icon="bx-edit" color="primary" /></template>
                    <VListItemTitle>Edit Load</VListItemTitle>
                  </VListItem>
                  <template v-for="transition in getAvailableTransitions(load)" :key="transition.value">
                    <VListItem v-if="canEdit" @click="handleStatusChange(load, transition.value)">
                      <template #prepend><VIcon :icon="transition.icon" :color="transition.value === 'cancelled' ? 'error' : 'info'" /></template>
                      <VListItemTitle :class="{ 'text-error': transition.value === 'cancelled' }">{{ transition.label }}</VListItemTitle>
                    </VListItem>
                  </template>
                  <VListItem
                    v-if="canEditLoad(load)"
                    @click="openCancelDialog(load)"
                    class="delete-item"
                  >
                    <template #prepend><VIcon icon="bx-x-circle" color="error" /></template>
                    <VListItemTitle class="text-error">Cancel Load</VListItemTitle>
                  </VListItem>
                </VList>
              </VMenu>
            </div>
          </div>

          <!-- Route -->
          <div class="load-route">
            <div class="route-point origin">
              <div class="route-dot"></div>
              <div class="route-info">
                <span class="route-facility">{{ getFacilityShort(load.origin_facility) }}</span>
                <span class="route-location">{{ [load.origin_city, load.origin_state].filter(Boolean).join(', ') || 'Origin' }}</span>
              </div>
              <span class="route-time">{{ formatDateTime(load.origin_datetime) }}</span>
            </div>
            <div class="route-line">
              <div class="route-line-inner"></div>
              <span class="route-miles">{{ parseFloat(load.total_miles || 0).toLocaleString() }} mi</span>
            </div>
            <div class="route-point destination">
              <div class="route-dot dest"></div>
              <div class="route-info">
                <span class="route-facility">{{ getFacilityShort(load.destination_facility) }}</span>
                <span class="route-location">{{ [load.destination_city, load.destination_state].filter(Boolean).join(', ') || 'Destination' }}</span>
              </div>
              <span class="route-time">{{ formatDateTime(load.destination_datetime) }}</span>
            </div>
          </div>

          <!-- Details -->
          <div class="load-details">
            <div class="detail-chip payout">
              <VIcon icon="bx-dollar" size="16" />
              <span>{{ formatMoney(load.payout) }}</span>
            </div>
            <div class="detail-chip">
              <VIcon icon="bx-map-pin" size="16" />
              <span>{{ load.total_stops }} stops</span>
            </div>
            <div class="detail-chip">
              <VIcon icon="bx-user" size="16" />
              <span class="text-capitalize">{{ load.driver_type }}</span>
            </div>
            <div class="detail-chip">
              <VIcon icon="bx-transfer-alt" size="16" />
              <span class="text-capitalize">{{ load.load_type }}</span>
            </div>
          </div>

          <!-- Footer -->
          <div class="load-footer">
            <div class="footer-item">
              <VIcon icon="bx-calendar" size="16" />
              <span>{{ formatDate(load.created_at) }}</span>
            </div>
            <div v-if="load.rate_per_mile" class="footer-item">
              <span class="rate-badge">${{ parseFloat(load.rate_per_mile).toFixed(2) }}/mi</span>
            </div>
            <div v-if="load.assigned_driver" class="footer-item driver">
              <VIcon icon="bx-user-check" size="16" />
              <span>{{ load.assigned_driver.full_name }}</span>
            </div>
          </div>

          <!-- Quick Actions (Mobile) -->
          <div class="quick-actions">
            <VBtn v-if="canEditLoad(load)" icon size="small" variant="tonal" color="primary" @click.stop="openEditDialog(load)">
              <VIcon icon="bx-edit" size="18" />
            </VBtn>
            <template v-for="t in getAvailableTransitions(load)" :key="t.value">
              <VBtn v-if="canEdit && t.value !== 'cancelled'" icon size="small" variant="tonal" :color="t.value === 'delivered' ? 'success' : 'info'" @click.stop="handleStatusChange(load, t.value)">
                <VIcon :icon="t.icon" size="18" />
              </VBtn>
            </template>
            <VBtn v-if="canEditLoad(load)" icon size="small" variant="tonal" color="error" @click.stop="openCancelDialog(load)">
              <VIcon icon="bx-x-circle" size="18" />
            </VBtn>
          </div>

          <!-- Expand Indicator -->
          <div class="expand-hint">
            <VIcon :icon="expandedLoadId === load.id ? 'bx-chevron-up' : 'bx-chevron-down'" size="18" />
            <span>{{ expandedLoadId === load.id ? 'Less' : 'Details' }}</span>
          </div>

          <!-- Expanded Details Panel -->
          <div v-if="expandedLoadId === load.id" class="expanded-panel" @click.stop>
            <div class="expanded-grid">
              <!-- Financial -->
              <div class="expanded-section">
                <div class="expanded-section-title">
                  <VIcon icon="bx-dollar-circle" size="16" />
                  <span>Financial</span>
                </div>
                <div class="expanded-stats">
                  <div class="estat">
                    <span class="estat-label">Payout</span>
                    <span class="estat-value money">{{ formatMoney(load.payout) }}</span>
                  </div>
                  <div class="estat">
                    <span class="estat-label">Rate / Mile</span>
                    <span class="estat-value">{{ getRatePerMile(load) }}</span>
                  </div>
                  <div class="estat">
                    <span class="estat-label">Total Miles</span>
                    <span class="estat-value">{{ parseFloat(load.total_miles || 0).toLocaleString() }}</span>
                  </div>
                </div>
              </div>

              <!-- Route Details -->
              <div class="expanded-section">
                <div class="expanded-section-title">
                  <VIcon icon="bx-map" size="16" />
                  <span>Route Details</span>
                </div>
                <div class="expanded-stats">
                  <div class="estat">
                    <span class="estat-label">Origin Facility</span>
                    <span class="estat-value">{{ getFacilityDisplay(load.origin_facility) }}</span>
                  </div>
                  <div class="estat">
                    <span class="estat-label">Destination Facility</span>
                    <span class="estat-value">{{ getFacilityDisplay(load.destination_facility) }}</span>
                  </div>
                  <div class="estat">
                    <span class="estat-label">Transit Time</span>
                    <span class="estat-value">{{ getTimeDiff(load.origin_datetime, load.destination_datetime) }}</span>
                  </div>
                </div>
              </div>

              <!-- Timing -->
              <div class="expanded-section">
                <div class="expanded-section-title">
                  <VIcon icon="bx-time" size="16" />
                  <span>Schedule</span>
                </div>
                <div class="expanded-stats">
                  <div class="estat">
                    <span class="estat-label">Pickup</span>
                    <span class="estat-value">{{ formatDateTime(load.origin_datetime) }}</span>
                  </div>
                  <div class="estat">
                    <span class="estat-label">Delivery</span>
                    <span class="estat-value">{{ formatDateTime(load.destination_datetime) }}</span>
                  </div>
                  <div class="estat">
                    <span class="estat-label">Created</span>
                    <span class="estat-value">{{ formatDate(load.created_at) }}</span>
                  </div>
                </div>
              </div>

              <!-- Load Info -->
              <div class="expanded-section">
                <div class="expanded-section-title">
                  <VIcon icon="bx-info-circle" size="16" />
                  <span>Load Info</span>
                </div>
                <div class="expanded-stats">
                  <div class="estat">
                    <span class="estat-label">Direction</span>
                    <span class="estat-value text-capitalize">{{ (load.direction || 'one_way').replace(/_/g, ' ') }}</span>
                  </div>
                  <div class="estat">
                    <span class="estat-label">Driver Type</span>
                    <span class="estat-value text-capitalize">{{ load.driver_type || 'solo' }}</span>
                  </div>
                  <div class="estat">
                    <span class="estat-label">Load Type</span>
                    <span class="estat-value text-capitalize">{{ load.load_type || 'drop' }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Driver Info -->
            <div v-if="load.assigned_driver" class="expanded-driver">
              <VIcon icon="bx-user-check" size="18" />
              <div>
                <span class="driver-name">{{ load.assigned_driver.full_name }}</span>
                <span v-if="load.assigned_driver.email" class="driver-email">{{ load.assigned_driver.email }}</span>
              </div>
            </div>

            <!-- Quick Actions in expanded -->
            <div class="expanded-actions">
              <VBtn v-if="canEditLoad(load)" variant="tonal" color="primary" size="small" @click.stop="openEditDialog(load)">
                <VIcon icon="bx-edit" size="16" class="me-1" />
                Edit
              </VBtn>
              <template v-for="t in getAvailableTransitions(load)" :key="t.value">
                <VBtn v-if="canEdit" variant="tonal" :color="t.value === 'cancelled' ? 'error' : 'info'" size="small" @click.stop="handleStatusChange(load, t.value)">
                  <VIcon :icon="t.icon" size="16" class="me-1" />
                  {{ t.label }}
                </VBtn>
              </template>
            </div>
          </div>
        </div>
      </div>

      <!-- Pagination -->
      <div v-if="loads.length && totalPages > 1" class="pagination-container">
        <div class="pagination-info">
          Showing <strong>{{ (page - 1) * perPage + 1 }}</strong> to
          <strong>{{ Math.min(page * perPage, totalLoads) }}</strong> of
          <strong>{{ totalLoads }}</strong> loads
        </div>
        <div class="pagination-controls">
          <VBtn icon variant="tonal" :disabled="page === 1" @click="page--" class="page-btn">
            <VIcon icon="bx-chevron-left" />
          </VBtn>
          <div class="page-numbers">
            <template v-for="p in Math.min(totalPages, 5)" :key="p">
              <VBtn :variant="page === p ? 'flat' : 'text'" :class="{ 'active-page': page === p }" class="page-num" @click="page = p">
                {{ p }}
              </VBtn>
            </template>
            <span v-if="totalPages > 5" class="page-ellipsis">...</span>
          </div>
          <VBtn icon variant="tonal" :disabled="page >= totalPages" @click="page++" class="page-btn">
            <VIcon icon="bx-chevron-right" />
          </VBtn>
        </div>
      </div>
    </div>

    <!-- Create Dialog -->
    <VDialog v-model="showCreateDialog" max-width="700" persistent class="custom-dialog">
      <VCard class="dialog-card">
        <div class="dialog-header">
          <div class="dialog-icon create"><VIcon icon="bx-package" size="28" /></div>
          <div>
            <h2 class="dialog-title">Create New Load</h2>
            <p class="dialog-subtitle">Register a new freight load</p>
          </div>
          <VBtn icon variant="text" class="close-btn" @click="showCreateDialog = false; resetForm()">
            <VIcon icon="bx-x" />
          </VBtn>
        </div>
        <VCardText class="dialog-body">
          <div class="form-section-title">Identification</div>
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label">Load ID</label>
              <VTextField v-model="form.load_id" variant="outlined" density="comfortable" placeholder="External load ID" />
            </div>
            <div class="form-group">
              <label class="form-label">Tour ID</label>
              <VTextField v-model="form.tour_id" variant="outlined" density="comfortable" placeholder="Tour identifier" />
            </div>
          </div>

          <div class="form-section-title">Origin</div>
          <div class="form-grid">
            <div class="form-group full-width">
              <label class="form-label">Facility <span class="required">*</span></label>
              <VSelect
                v-model="form.origin_facility"
                :items="facilityOptions"
                item-title="title"
                item-value="value"
                variant="outlined"
                density="comfortable"
                placeholder="Select origin facility"
                :error-messages="formErrors.origin_facility"
              >
                <template #prepend-inner><VIcon icon="bx-buildings" /></template>
              </VSelect>
            </div>
            <div class="form-group">
              <label class="form-label">City</label>
              <VTextField v-model="form.origin_city" variant="outlined" density="comfortable" placeholder="City" />
            </div>
            <div class="form-group">
              <label class="form-label">State</label>
              <VTextField v-model="form.origin_state" variant="outlined" density="comfortable" placeholder="State" />
            </div>
            <div class="form-group full-width">
              <label class="form-label">Pickup Date & Time <span class="required">*</span></label>
              <VTextField v-model="form.origin_datetime" type="datetime-local" variant="outlined" density="comfortable" :error-messages="formErrors.origin_datetime" />
            </div>
          </div>

          <div class="form-section-title">Destination</div>
          <div class="form-grid">
            <div class="form-group full-width">
              <label class="form-label">Facility <span class="required">*</span></label>
              <VSelect
                v-model="form.destination_facility"
                :items="facilityOptions"
                item-title="title"
                item-value="value"
                variant="outlined"
                density="comfortable"
                placeholder="Select destination facility"
                :error-messages="formErrors.destination_facility"
              >
                <template #prepend-inner><VIcon icon="bx-buildings" /></template>
              </VSelect>
            </div>
            <div class="form-group">
              <label class="form-label">City</label>
              <VTextField v-model="form.destination_city" variant="outlined" density="comfortable" placeholder="City" />
            </div>
            <div class="form-group">
              <label class="form-label">State</label>
              <VTextField v-model="form.destination_state" variant="outlined" density="comfortable" placeholder="State" />
            </div>
            <div class="form-group full-width">
              <label class="form-label">Delivery Date & Time <span class="required">*</span></label>
              <VTextField v-model="form.destination_datetime" type="datetime-local" variant="outlined" density="comfortable" :error-messages="formErrors.destination_datetime" />
            </div>
          </div>

          <div class="form-section-title">Load Details</div>
          <div class="form-grid cols-3">
            <div class="form-group">
              <label class="form-label">Total Miles <span class="required">*</span></label>
              <VTextField v-model="form.total_miles" type="number" variant="outlined" density="comfortable" placeholder="0" :error-messages="formErrors.total_miles">
                <template #prepend-inner><VIcon icon="bx-trip" /></template>
              </VTextField>
            </div>
            <div class="form-group">
              <label class="form-label">Payout <span class="required">*</span></label>
              <VTextField v-model="form.payout" type="number" variant="outlined" density="comfortable" placeholder="0.00" :error-messages="formErrors.payout">
                <template #prepend-inner><VIcon icon="bx-dollar" /></template>
              </VTextField>
            </div>
            <div class="form-group">
              <label class="form-label">Stops</label>
              <VTextField v-model="form.total_stops" type="number" variant="outlined" density="comfortable" placeholder="2" />
            </div>
            <div class="form-group">
              <label class="form-label">Driver Type</label>
              <VSelect v-model="form.driver_type" :items="driverTypes" item-title="title" item-value="value" variant="outlined" density="comfortable" hide-details />
            </div>
            <div class="form-group">
              <label class="form-label">Load Type</label>
              <VSelect v-model="form.load_type" :items="loadTypes" item-title="title" item-value="value" variant="outlined" density="comfortable" hide-details />
            </div>
            <div class="form-group">
              <label class="form-label">Direction</label>
              <VSelect v-model="form.direction" :items="directions" item-title="title" item-value="value" variant="outlined" density="comfortable" hide-details />
            </div>
          </div>
        </VCardText>
        <div class="dialog-footer">
          <VBtn variant="outlined" size="large" @click="showCreateDialog = false; resetForm()">Cancel</VBtn>
          <VBtn class="submit-btn" size="large" :loading="dialogLoading" @click="handleCreate">
            <VIcon icon="bx-plus" class="me-2" />
            Create Load
          </VBtn>
        </div>
      </VCard>
    </VDialog>

    <!-- Edit Dialog -->
    <VDialog v-model="showEditDialog" max-width="700" persistent class="custom-dialog">
      <VCard class="dialog-card">
        <div class="dialog-header">
          <div class="dialog-icon edit"><VIcon icon="bx-edit" size="28" /></div>
          <div>
            <h2 class="dialog-title">Edit Load</h2>
            <p class="dialog-subtitle">Update load #{{ selectedLoad?.load_id || selectedLoad?.id }}</p>
          </div>
          <VBtn icon variant="text" class="close-btn" @click="showEditDialog = false; resetForm()">
            <VIcon icon="bx-x" />
          </VBtn>
        </div>
        <VCardText class="dialog-body">
          <div class="form-section-title">Identification</div>
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label">Load ID</label>
              <VTextField v-model="form.load_id" variant="outlined" density="comfortable" placeholder="External load ID" />
            </div>
            <div class="form-group">
              <label class="form-label">Tour ID</label>
              <VTextField v-model="form.tour_id" variant="outlined" density="comfortable" placeholder="Tour identifier" />
            </div>
          </div>

          <div class="form-section-title">Origin</div>
          <div class="form-grid">
            <div class="form-group full-width">
              <label class="form-label">Facility <span class="required">*</span></label>
              <VSelect v-model="form.origin_facility" :items="facilityOptions" item-title="title" item-value="value" variant="outlined" density="comfortable" :error-messages="formErrors.origin_facility">
                <template #prepend-inner><VIcon icon="bx-buildings" /></template>
              </VSelect>
            </div>
            <div class="form-group">
              <label class="form-label">City</label>
              <VTextField v-model="form.origin_city" variant="outlined" density="comfortable" />
            </div>
            <div class="form-group">
              <label class="form-label">State</label>
              <VTextField v-model="form.origin_state" variant="outlined" density="comfortable" />
            </div>
            <div class="form-group full-width">
              <label class="form-label">Pickup Date & Time <span class="required">*</span></label>
              <VTextField v-model="form.origin_datetime" type="datetime-local" variant="outlined" density="comfortable" :error-messages="formErrors.origin_datetime" />
            </div>
          </div>

          <div class="form-section-title">Destination</div>
          <div class="form-grid">
            <div class="form-group full-width">
              <label class="form-label">Facility <span class="required">*</span></label>
              <VSelect v-model="form.destination_facility" :items="facilityOptions" item-title="title" item-value="value" variant="outlined" density="comfortable" :error-messages="formErrors.destination_facility">
                <template #prepend-inner><VIcon icon="bx-buildings" /></template>
              </VSelect>
            </div>
            <div class="form-group">
              <label class="form-label">City</label>
              <VTextField v-model="form.destination_city" variant="outlined" density="comfortable" />
            </div>
            <div class="form-group">
              <label class="form-label">State</label>
              <VTextField v-model="form.destination_state" variant="outlined" density="comfortable" />
            </div>
            <div class="form-group full-width">
              <label class="form-label">Delivery Date & Time <span class="required">*</span></label>
              <VTextField v-model="form.destination_datetime" type="datetime-local" variant="outlined" density="comfortable" :error-messages="formErrors.destination_datetime" />
            </div>
          </div>

          <div class="form-section-title">Load Details</div>
          <div class="form-grid cols-3">
            <div class="form-group">
              <label class="form-label">Total Miles <span class="required">*</span></label>
              <VTextField v-model="form.total_miles" type="number" variant="outlined" density="comfortable" :error-messages="formErrors.total_miles" />
            </div>
            <div class="form-group">
              <label class="form-label">Payout <span class="required">*</span></label>
              <VTextField v-model="form.payout" type="number" variant="outlined" density="comfortable" :error-messages="formErrors.payout" />
            </div>
            <div class="form-group">
              <label class="form-label">Stops</label>
              <VTextField v-model="form.total_stops" type="number" variant="outlined" density="comfortable" />
            </div>
            <div class="form-group">
              <label class="form-label">Driver Type</label>
              <VSelect v-model="form.driver_type" :items="driverTypes" item-title="title" item-value="value" variant="outlined" density="comfortable" hide-details />
            </div>
            <div class="form-group">
              <label class="form-label">Load Type</label>
              <VSelect v-model="form.load_type" :items="loadTypes" item-title="title" item-value="value" variant="outlined" density="comfortable" hide-details />
            </div>
          </div>
        </VCardText>
        <div class="dialog-footer">
          <VBtn variant="outlined" size="large" @click="showEditDialog = false; resetForm()">Cancel</VBtn>
          <VBtn class="submit-btn edit" size="large" :loading="dialogLoading" @click="handleUpdate">
            <VIcon icon="bx-check" class="me-2" />
            Save Changes
          </VBtn>
        </div>
      </VCard>
    </VDialog>

    <!-- Cancel Dialog -->
    <VDialog v-model="showCancelDialog" max-width="450" class="custom-dialog">
      <VCard class="dialog-card delete-dialog">
        <div class="delete-content">
          <div class="delete-icon"><VIcon icon="bx-error-circle" size="64" /></div>
          <h2 class="delete-title">Cancel Load</h2>
          <p class="delete-message">
            Are you sure you want to cancel load
            <strong>{{ selectedLoad?.load_id || `#${selectedLoad?.id}` }}</strong>?
          </p>
          <p class="delete-warning">
            <VIcon icon="bx-info-circle" size="16" />
            This action cannot be undone.
          </p>
        </div>
        <div class="dialog-footer delete-footer">
          <VBtn variant="outlined" size="large" @click="showCancelDialog = false">Keep Load</VBtn>
          <VBtn color="error" size="large" :loading="dialogLoading" @click="handleCancel">
            <VIcon icon="bx-x-circle" class="me-2" />
            Cancel Load
          </VBtn>
        </div>
      </VCard>
    </VDialog>
  </div>
</template>

<style scoped>
/* Theme Variables */
.loads-page {
  --primary: #6366f1;
  --primary-light: #818cf8;
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

.loads-page.theme-light {
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

.loads-page { position: relative; min-height: 100vh; padding: 24px; overflow-x: hidden; }

/* Background */
.page-bg { position: fixed; inset: 0; z-index: -1; overflow: hidden; }
.bg-gradient { position: absolute; inset: 0; background: radial-gradient(ellipse at 0% 0%, rgba(99,102,241,0.15) 0%, transparent 50%), radial-gradient(ellipse at 100% 0%, rgba(139,92,246,0.1) 0%, transparent 50%), radial-gradient(ellipse at 50% 100%, rgba(16,185,129,0.08) 0%, transparent 50%), linear-gradient(180deg, var(--grad-base-start) 0%, var(--grad-base-end) 100%); }
.bg-grid { position: absolute; inset: 0; background-image: linear-gradient(var(--grid-line) 1px, transparent 1px), linear-gradient(90deg, var(--grid-line) 1px, transparent 1px); background-size: 60px 60px; mask-image: radial-gradient(ellipse at center, black 30%, transparent 70%); }
.floating-shapes { position: absolute; inset: 0; overflow: hidden; }
.shape { position: absolute; border-radius: 50%; filter: blur(100px); opacity: var(--shape-opacity); animation: float 20s ease-in-out infinite; }
.shape-1 { width: 600px; height: 600px; background: linear-gradient(135deg, #6366f1, #8b5cf6); top: -200px; left: -200px; }
.shape-2 { width: 400px; height: 400px; background: linear-gradient(135deg, #10b981, #06b6d4); bottom: -100px; right: -100px; animation-delay: -7s; }
.shape-3 { width: 300px; height: 300px; background: linear-gradient(135deg, #f59e0b, #ef4444); top: 50%; left: 50%; transform: translate(-50%, -50%); animation-delay: -14s; }
@keyframes float { 0%, 100% { transform: translate(0, 0) scale(1); } 33% { transform: translate(30px, -30px) scale(1.05); } 66% { transform: translate(-20px, 20px) scale(0.95); } }

/* Header */
.page-header { margin-bottom: 32px; }
.header-content { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 20px; }
.header-left { display: flex; align-items: center; gap: 16px; }
.header-icon { display: flex; align-items: center; justify-content: center; width: 56px; height: 56px; background: linear-gradient(135deg, #6366f1, #8b5cf6); border-radius: 16px; color: white; box-shadow: 0 8px 32px rgba(99,102,241,0.3); }
.page-title { font-size: 32px; font-weight: 700; color: var(--text-heading); margin: 0; letter-spacing: -0.5px; }
.page-subtitle { font-size: 15px; color: var(--text-secondary); margin: 4px 0 0; }
.add-btn { background: linear-gradient(135deg, #6366f1, #8b5cf6) !important; color: white !important; font-weight: 600; padding: 0 28px !important; height: 48px !important; border-radius: 14px !important; box-shadow: var(--shadow-btn); transition: all 0.3s ease; }
.add-btn:hover { transform: translateY(-2px); box-shadow: 0 12px 40px rgba(99,102,241,0.45); }

/* Stats */
.stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-bottom: 28px; }
.stat-card { position: relative; background: var(--card-bg); backdrop-filter: blur(20px); border: 1px solid var(--card-border); border-radius: 20px; padding: 24px; display: flex; align-items: center; gap: 16px; overflow: hidden; transition: all 0.3s ease; }
.stat-card:hover { transform: translateY(-4px); border-color: var(--card-border-hover); }
.stat-icon { display: flex; align-items: center; justify-content: center; width: 52px; height: 52px; border-radius: 14px; flex-shrink: 0; }
.stat-total .stat-icon { background: linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.2)); color: var(--primary-light); }
.stat-available .stat-icon { background: linear-gradient(135deg, rgba(16,185,129,0.2), rgba(6,182,212,0.2)); color: #34d399; }
.stat-transit .stat-icon { background: linear-gradient(135deg, rgba(245,158,11,0.2), rgba(249,115,22,0.2)); color: #fbbf24; }
.stat-revenue .stat-icon { background: linear-gradient(135deg, rgba(236,72,153,0.2), rgba(168,85,247,0.2)); color: #f472b6; }
.stat-content { display: flex; flex-direction: column; min-width: 0; }
.stat-value { font-size: 28px; font-weight: 700; color: var(--text-heading); line-height: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.stat-label { font-size: 13px; color: var(--text-secondary); margin-top: 4px; }
.stat-decoration { position: absolute; right: -30px; bottom: -30px; width: 120px; height: 120px; border-radius: 50%; opacity: 0.08; }
.stat-total .stat-decoration { background: linear-gradient(135deg, #6366f1, #8b5cf6); }
.stat-available .stat-decoration { background: linear-gradient(135deg, #10b981, #06b6d4); }
.stat-transit .stat-decoration { background: linear-gradient(135deg, #f59e0b, #f97316); }
.stat-revenue .stat-decoration { background: linear-gradient(135deg, #ec4899, #a855f7); }

/* Analytics Section */
.analytics-section { background: var(--card-bg); backdrop-filter: blur(20px); border: 1px solid var(--card-border); border-radius: 20px; padding: 24px; margin-bottom: 28px; border-left: 3px solid #818cf8; }
.analytics-header { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px; margin-bottom: 20px; }
.analytics-title { display: flex; align-items: flex-start; gap: 12px; }
.analytics-icon { width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.2)); border-radius: 10px; color: var(--primary-light); flex-shrink: 0; }
.analytics-title h2 { font-size: 18px; font-weight: 700; color: var(--text-heading); margin: 0; }
.analytics-title p { font-size: 13px; color: var(--text-secondary); margin: 2px 0 0; }
.analytics-summary { display: flex; gap: 12px; flex-wrap: wrap; }
.summary-chip { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: var(--primary-light); background: rgba(99,102,241,0.1); padding: 6px 14px; border-radius: 20px; }
.summary-chip.duplicates { color: #f59e0b; background: rgba(245,158,11,0.1); }
.change-badge { font-size: 11px; padding: 2px 6px; border-radius: 4px; background: rgba(239,68,68,0.15); color: #f87171; }
.change-badge.positive { background: rgba(16,185,129,0.15); color: #34d399; }
.analytics-loading { display: flex; align-items: center; justify-content: center; gap: 12px; padding: 40px; color: var(--text-secondary); font-size: 14px; }
.spinner.small { width: 24px; height: 24px; border-width: 2px; }
.analytics-empty { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 40px; color: var(--text-muted); font-size: 14px; }

/* Frequency Table */
.frequency-list { overflow-x: auto; }
.frequency-header-row { display: grid; grid-template-columns: 1.5fr 0.8fr 0.8fr 1fr 2fr 1fr; gap: 12px; padding: 10px 16px; font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid var(--border-line); min-width: 700px; }
.frequency-row { display: grid; grid-template-columns: 1.5fr 0.8fr 0.8fr 1fr 2fr 1fr; gap: 12px; padding: 14px 16px; font-size: 14px; color: var(--text-body); border-bottom: 1px solid var(--border-line); transition: background 0.2s; align-items: center; min-width: 700px; }
.frequency-row:hover { background: var(--hover-bg); }
.frequency-row:last-child { border-bottom: none; }
.freq-load-id { font-weight: 700; color: var(--text-heading); font-family: monospace; font-size: 15px; }
.freq-count { font-weight: 700; color: var(--text-secondary); font-size: 16px; }
.freq-count.highlight { color: #f59e0b; background: rgba(245,158,11,0.1); padding: 2px 8px; border-radius: 6px; }
.freq-route { font-size: 12px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* Filters */
.filters-card { background: var(--card-bg); backdrop-filter: blur(20px); border: 1px solid var(--card-border); border-radius: 20px; padding: 20px; margin-bottom: 28px; }
.filters-header { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; color: var(--text-secondary); margin-bottom: 16px; }
.filter-icon { color: var(--primary-light); }
.filters-body { display: flex; gap: 16px; flex-wrap: wrap; }
.filter-item { flex: 1; min-width: 200px; }
.search-filter { flex: 2; min-width: 280px; }
.search-input :deep(.v-field), .filter-select :deep(.v-field) { background: var(--input-bg); border-radius: 12px; }
.search-icon { color: var(--text-secondary); }
.clear-btn { height: 48px !important; border-radius: 12px !important; flex-shrink: 0; }
.group-btn { height: 48px !important; border-radius: 12px !important; flex-shrink: 0; transition: all 0.3s ease; }
.group-btn.active { background: linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.2)) !important; color: #818cf8 !important; border: 1px solid rgba(99,102,241,0.3) !important; }

/* Grouped View */
.grouped-view { display: flex; flex-direction: column; gap: 16px; }
.load-group { background: var(--card-bg-subtle); border: 1px solid var(--card-border); border-radius: 18px; overflow: hidden; animation: fadeUp 0.4s ease-out both; animation-delay: var(--delay); }
.group-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 22px; cursor: pointer; transition: background 0.2s; gap: 16px; }
.group-header:hover { background: var(--hover-bg); }
.group-header-left { display: flex; align-items: center; gap: 14px; }
.group-icon { position: relative; width: 42px; height: 42px; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.15)); border-radius: 12px; color: #818cf8; }
.group-count-badge { position: absolute; top: -6px; right: -6px; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; font-size: 11px; font-weight: 700; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(99,102,241,0.4); }
.group-info { display: flex; flex-direction: column; gap: 2px; }
.group-id { font-size: 16px; font-weight: 700; color: var(--text-heading); font-family: 'JetBrains Mono', monospace; }
.group-subtitle { font-size: 12px; color: var(--text-muted); }
.group-header-right { display: flex; align-items: center; gap: 20px; }
.group-stat { display: flex; flex-direction: column; align-items: flex-end; gap: 1px; }
.group-stat-label { font-size: 10px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.3px; }
.group-stat-value { font-size: 14px; font-weight: 700; color: var(--text-heading); }
.group-stat-value.money { color: #10b981; }
.group-chevron { color: var(--text-muted); transition: transform 0.3s ease; }
.group-status-bar { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 22px 14px; }
.group-status-chip { font-size: 11px; font-weight: 600; padding: 4px 10px; border-radius: 8px; border: 1px solid; }
.group-loads { padding: 8px 16px 16px; display: grid; grid-template-columns: repeat(auto-fill, minmax(400px, 1fr)); gap: 12px; border-top: 1px solid var(--border-line); }
.load-card.in-group { border-radius: 14px; }

/* Loads Container */
.loads-container { background: var(--surface-bg); backdrop-filter: blur(20px); border: 1px solid var(--card-border); border-radius: 24px; padding: 24px; min-height: 400px; }
.loading-state { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 80px 20px; color: var(--text-secondary); }
.loading-spinner { margin-bottom: 16px; }
.spinner { width: 48px; height: 48px; border: 3px solid rgba(99,102,241,0.2); border-top-color: #6366f1; border-radius: 50%; animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 80px 20px; text-align: center; }
.empty-icon { width: 100px; height: 100px; display: flex; align-items: center; justify-content: center; background: rgba(99,102,241,0.1); border-radius: 24px; color: var(--primary-light); margin-bottom: 24px; }
.empty-state h3 { font-size: 22px; font-weight: 600; color: var(--text-heading); margin: 0 0 8px; }
.empty-state p { color: var(--text-secondary); margin: 0; }

/* Loads Grid */
.loads-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 20px; }
.load-card { position: relative; background: var(--card-bg-subtle); border: 1px solid var(--card-border); border-radius: 20px; padding: 24px; transition: all 0.3s ease; animation: cardFadeIn 0.5s ease forwards; animation-delay: var(--delay); opacity: 0; transform: translateY(20px); }
@keyframes cardFadeIn { to { opacity: 1; transform: translateY(0); } }
.load-card:hover { border-color: rgba(99,102,241,0.3); transform: translateY(-4px); }
.load-card:hover .card-glow { opacity: 1; }
.card-glow { position: absolute; inset: -1px; background: linear-gradient(135deg, rgba(99,102,241,0.15), transparent, rgba(139,92,246,0.15)); border-radius: 20px; opacity: 0; transition: opacity 0.3s ease; z-index: -1; filter: blur(20px); }

/* Load Header */
.load-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
.load-id-section { display: flex; flex-direction: column; gap: 2px; }
.load-id-label { font-size: 18px; font-weight: 700; color: var(--text-heading); font-family: monospace; letter-spacing: 0.5px; }
.tour-id { font-size: 12px; color: var(--text-muted); }
.header-right { display: flex; align-items: center; gap: 8px; }
.status-badge { display: inline-flex; align-items: center; font-size: 12px; font-weight: 600; padding: 5px 12px; border-radius: 8px; border: 1px solid; white-space: nowrap; }
.menu-btn { color: var(--text-muted) !important; }
.menu-btn:hover { color: var(--text-heading) !important; background: var(--hover-bg-strong) !important; }
.action-menu { background: var(--dialog-bg) !important; border: 1px solid var(--dialog-border); border-radius: 12px !important; padding: 8px !important; min-width: 180px; }
.action-menu :deep(.v-list-item) { border-radius: 8px; min-height: 44px; }
.action-menu :deep(.v-list-item:hover) { background: var(--input-bg); }
.delete-item { margin-top: 4px; border-top: 1px solid var(--card-border); padding-top: 4px; }

/* Route Display */
.load-route { margin-bottom: 16px; padding: 14px; background: var(--hover-bg); border-radius: 14px; }
.route-point { display: flex; align-items: center; gap: 10px; }
.route-dot { width: 10px; height: 10px; border-radius: 50%; background: #34d399; flex-shrink: 0; box-shadow: 0 0 8px rgba(52,211,153,0.4); }
.route-dot.dest { background: #f87171; box-shadow: 0 0 8px rgba(248,113,113,0.4); }
.route-info { flex: 1; min-width: 0; }
.route-facility { font-size: 14px; font-weight: 600; color: var(--text-heading); display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.route-location { font-size: 12px; color: var(--text-muted); display: block; }
.route-time { font-size: 12px; color: var(--text-secondary); white-space: nowrap; flex-shrink: 0; }
.route-line { display: flex; align-items: center; gap: 8px; padding: 6px 0 6px 4px; margin-left: 0; }
.route-line-inner { width: 2px; height: 20px; background: linear-gradient(to bottom, #34d399, #f87171); margin-left: 3px; border-radius: 1px; flex-shrink: 0; }
.route-miles { font-size: 12px; font-weight: 600; color: var(--primary-light); background: rgba(99,102,241,0.1); padding: 2px 10px; border-radius: 10px; white-space: nowrap; }

/* Details */
.load-details { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
.detail-chip { display: flex; align-items: center; gap: 4px; font-size: 12px; color: var(--text-secondary); background: var(--hover-bg); padding: 5px 10px; border-radius: 8px; }
.detail-chip.payout { font-weight: 700; color: #34d399; background: rgba(16,185,129,0.1); }

/* Footer */
.load-footer { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; padding-top: 16px; border-top: 1px solid var(--border-line); }
.footer-item { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--text-muted); }
.footer-item.driver { color: var(--primary-light); }
.rate-badge { font-size: 11px; font-weight: 700; color: #fbbf24; background: rgba(245,158,11,0.1); padding: 2px 8px; border-radius: 6px; }

/* Quick Actions */
.quick-actions { display: none; gap: 8px; margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border-line); }

/* Expand Hint */
.expand-hint { display: flex; align-items: center; justify-content: center; gap: 4px; margin-top: 12px; padding-top: 10px; border-top: 1px dashed var(--border-line); font-size: 12px; color: var(--text-muted); cursor: pointer; transition: color 0.2s; }
.expand-hint:hover { color: var(--primary-light); }
.load-card.is-expanded .expand-hint { color: var(--primary-light); }

/* Expanded Card */
.load-card { cursor: pointer; }
.load-card.is-expanded { border-color: rgba(99,102,241,0.4); background: var(--card-bg); }
.load-card.is-expanded:hover { transform: none; }

.expanded-panel { margin-top: 16px; padding-top: 20px; border-top: 1px solid var(--border-line); animation: expandPanel 0.3s ease; }
@keyframes expandPanel { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }

.expanded-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

.expanded-section { background: var(--hover-bg); border-radius: 12px; padding: 14px; }
.expanded-section-title { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; color: var(--primary-light); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px; }
.expanded-stats { display: flex; flex-direction: column; gap: 8px; }
.estat { display: flex; justify-content: space-between; align-items: center; }
.estat-label { font-size: 12px; color: var(--text-muted); }
.estat-value { font-size: 13px; font-weight: 700; color: var(--text-heading); text-align: right; max-width: 60%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.estat-value.money { color: #34d399; }

.expanded-driver { display: flex; align-items: center; gap: 12px; margin-top: 14px; padding: 12px; background: rgba(99,102,241,0.08); border-radius: 10px; color: var(--primary-light); }
.driver-name { display: block; font-size: 14px; font-weight: 600; color: var(--text-heading); }
.driver-email { display: block; font-size: 12px; color: var(--text-muted); }

.expanded-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--border-line); }

/* Pagination */
.pagination-container { display: flex; justify-content: space-between; align-items: center; margin-top: 28px; padding-top: 20px; border-top: 1px solid var(--border-line); flex-wrap: wrap; gap: 16px; }
.pagination-info { font-size: 14px; color: var(--text-secondary); }
.pagination-info strong { color: var(--text-heading); font-weight: 600; }
.pagination-controls { display: flex; align-items: center; gap: 8px; }
.page-btn { width: 40px !important; height: 40px !important; border-radius: 10px !important; }
.page-numbers { display: flex; align-items: center; gap: 4px; }
.page-num { min-width: 40px !important; height: 40px !important; border-radius: 10px !important; font-weight: 600; }
.active-page { background: linear-gradient(135deg, #6366f1, #8b5cf6) !important; color: white !important; }
.page-ellipsis { color: var(--text-muted); padding: 0 8px; }

/* Dialogs */
.custom-dialog :deep(.v-overlay__content) { margin: 16px; }
.dialog-card { background: var(--dialog-bg) !important; border: 1px solid var(--dialog-border); border-radius: 24px !important; overflow: hidden; }
.dialog-header { display: flex; align-items: flex-start; gap: 16px; padding: 24px 24px 0; position: relative; }
.dialog-icon { display: flex; align-items: center; justify-content: center; width: 52px; height: 52px; border-radius: 14px; flex-shrink: 0; }
.dialog-icon.create { background: linear-gradient(135deg, rgba(16,185,129,0.2), rgba(6,182,212,0.2)); color: #34d399; }
.dialog-icon.edit { background: linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.2)); color: var(--primary-light); }
.dialog-title { font-size: 22px; font-weight: 700; color: var(--text-heading); margin: 0; }
.dialog-subtitle { font-size: 14px; color: var(--text-secondary); margin: 4px 0 0; }
.close-btn { position: absolute !important; right: 16px; top: 16px; color: var(--text-muted) !important; }
.dialog-body { padding: 24px !important; max-height: 65vh; overflow-y: auto; }

.form-section-title { font-size: 13px; font-weight: 700; color: var(--primary-light); text-transform: uppercase; letter-spacing: 0.5px; margin: 20px 0 12px; padding-bottom: 8px; border-bottom: 1px solid var(--border-line); }
.form-section-title:first-child { margin-top: 0; }

.form-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
.form-grid.cols-3 { grid-template-columns: repeat(3, 1fr); }
.form-group { display: flex; flex-direction: column; gap: 6px; }
.form-group.full-width { grid-column: 1 / -1; }
.form-label { font-size: 13px; font-weight: 600; color: var(--text-body); }
.form-label .required { color: #f87171; }
.form-group :deep(.v-field) { background: var(--input-bg); border-radius: 12px; }

.dialog-footer { display: flex; justify-content: flex-end; gap: 12px; padding: 20px 24px; background: var(--dialog-footer-bg); }
.submit-btn { background: linear-gradient(135deg, #10b981, #06b6d4) !important; color: white !important; font-weight: 600; }
.submit-btn.edit { background: linear-gradient(135deg, #6366f1, #8b5cf6) !important; }

/* Delete Dialog */
.delete-dialog { text-align: center; }
.delete-content { padding: 32px 24px; }
.delete-icon { width: 80px; height: 80px; display: flex; align-items: center; justify-content: center; background: rgba(239,68,68,0.15); border-radius: 20px; color: #f87171; margin: 0 auto 20px; }
.delete-title { font-size: 24px; font-weight: 700; color: var(--text-heading); margin: 0 0 12px; }
.delete-message { font-size: 16px; color: var(--text-secondary); margin: 0 0 16px; }
.delete-message strong { color: var(--text-heading); }
.delete-warning { display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 13px; color: #f59e0b; background: rgba(245,158,11,0.1); padding: 10px 16px; border-radius: 8px; margin: 0; }
.delete-footer { justify-content: center; }

/* Responsive */
@media (max-width: 1200px) {
  .stats-grid { grid-template-columns: repeat(2, 1fr); }
  .form-grid.cols-3 { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 768px) {
  .loads-page { padding: 16px; }
  .header-content { flex-direction: column; align-items: flex-start; }
  .add-btn { width: 100%; }
  .page-title { font-size: 24px; }
  .stats-grid { grid-template-columns: repeat(2, 1fr); gap: 12px; }
  .stat-card { padding: 16px; }
  .stat-value { font-size: 22px; }
  .filters-body { flex-direction: column; }
  .filter-item, .search-filter { min-width: 100%; }
  .loads-grid { grid-template-columns: 1fr; }
  .group-loads { grid-template-columns: 1fr; }
  .group-header { flex-direction: column; align-items: flex-start; }
  .group-header-right { width: 100%; justify-content: space-between; }
  .group-stat { align-items: flex-start; }
  .load-card { padding: 20px; }
  .menu-btn { display: none !important; }
  .quick-actions { display: flex; }
  .expanded-grid { grid-template-columns: 1fr; }
  .pagination-container { flex-direction: column; text-align: center; }
  .pagination-info { order: 2; }
  .form-grid, .form-grid.cols-3 { grid-template-columns: 1fr; }
  .form-group { grid-column: 1; }
  .dialog-header { flex-wrap: wrap; }
  .dialog-icon { width: 44px; height: 44px; }
  .dialog-title { font-size: 18px; }
  .frequency-header-row { display: none; }
  .frequency-row { grid-template-columns: 1fr 1fr; gap: 8px; padding: 12px; }
  .freq-col-route, .freq-col-seen { display: none; }
  .analytics-header { flex-direction: column; }
}
@media (max-width: 480px) {
  .header-left { flex-direction: column; align-items: flex-start; gap: 12px; }
  .header-icon { width: 48px; height: 48px; }
  .stats-grid { grid-template-columns: 1fr; }
  .page-numbers { display: none; }
}
</style>
