<!-- src/pages/routes.vue -->

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
const canView = computed(() => authStore.hasPermission('loads.view'))

// Sort options
const sortOptions = [
  { title: 'Most Loads', value: '-load_count' },
  { title: 'Highest Payout', value: 'total_payout' },
  { title: 'Most Expensive', value: '-most_expensive' },
  { title: 'Cheapest', value: 'cheapest' },
  { title: 'Route ID', value: 'route_id' },
  { title: 'Latest Load', value: '-latest_load' },
]

// Status colors
const statusColors = {
  available: '#10b981',
  booked: '#3b82f6',
  in_transit: '#f59e0b',
  delivered: '#8b5cf6',
  cancelled: '#ef4444',
}

const statusLabels = {
  available: 'Available',
  booked: 'Booked',
  in_transit: 'In Transit',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}

// Data
const routes = ref([])
const loading = ref(false)
const totalRoutes = ref(0)

// Pagination & Filters
const page = ref(1)
const perPage = ref(20)
const search = ref('')
const sortBy = ref('-load_count')
const dateFrom = ref('')
const dateTo = ref('')
const totalPages = computed(() => Math.ceil(totalRoutes.value / perPage.value))

// Detail dialog
const showDetailDialog = ref(false)
const detailLoading = ref(false)
const selectedRoute = ref(null)
const routeDetail = ref(null)
const routeLoads = ref([])
const routeLoadsTotalPages = ref(1)
const routeLoadsPage = ref(1)
const routeLoadsPerPage = ref(10)
const routeLoadsStatus = ref(null)
const routeLoadsLoading = ref(false)
const routeAnalytics = ref(null)
const analyticsPeriod = ref('weekly')
const analyticsLoading = ref(false)
const detailTab = ref('overview')

// Formatters
const formatMoney = (val) => {
  return Number(val || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const formatNumber = (val) => {
  return Number(val || 0).toLocaleString('en-US')
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

const routeLabel = (route) => {
  const origin = route.origin_state?.abbreviation || route.origin_state?.name || '?'
  const dest = route.destination_state?.abbreviation || route.destination_state?.name || '?'
  return `${origin} → ${dest}`
}

const routeLabelFull = (route) => {
  const origin = route.origin_state?.name || route.origin_state?.abbreviation || '?'
  const dest = route.destination_state?.name || route.destination_state?.abbreviation || '?'
  return `${origin} → ${dest}`
}

// Fetch routes
const fetchRoutes = async () => {
  loading.value = true
  try {
    const params = { page: page.value, per_page: perPage.value }
    if (search.value) params.search = search.value
    if (sortBy.value) params.sort_by = sortBy.value
    if (dateFrom.value) params.date_from = dateFrom.value
    if (dateTo.value) params.date_to = dateTo.value
    const response = await api.get('/api/routes', { params })
    if (response.data.success) {
      routes.value = response.data.data?.routes || []
      totalRoutes.value = response.data.data?.pagination?.total || 0
    }
  } catch (error) {
    toastError('Failed to load routes')
  } finally {
    loading.value = false
  }
}

// Fetch route detail
const fetchRouteDetail = async (routeId) => {
  detailLoading.value = true
  try {
    const response = await api.get(`/api/routes/${routeId}`)
    if (response.data.success) {
      routeDetail.value = response.data.data
    }
  } catch (error) {
    toastError('Failed to load route details')
  } finally {
    detailLoading.value = false
  }
}

// Fetch route loads
const fetchRouteLoads = async (routeId) => {
  routeLoadsLoading.value = true
  try {
    const params = { page: routeLoadsPage.value, per_page: routeLoadsPerPage.value }
    if (routeLoadsStatus.value) params.status = routeLoadsStatus.value
    const response = await api.get(`/api/routes/${routeId}/loads`, { params })
    if (response.data.success) {
      routeLoads.value = response.data.data?.loads || []
      routeLoadsTotalPages.value = response.data.data?.pagination?.pages || 1
    }
  } catch (error) {
    toastError('Failed to load route loads')
  } finally {
    routeLoadsLoading.value = false
  }
}

// Fetch route analytics
const fetchRouteAnalytics = async (routeId) => {
  analyticsLoading.value = true
  try {
    const response = await api.get(`/api/routes/${routeId}/analytics`, { params: { period: analyticsPeriod.value } })
    if (response.data.success) {
      routeAnalytics.value = response.data.data
    }
  } catch (error) {
    // analytics may not be available for all routes
    routeAnalytics.value = null
  } finally {
    analyticsLoading.value = false
  }
}

// Open detail dialog
const openDetail = async (route) => {
  selectedRoute.value = route
  routeDetail.value = null
  routeLoads.value = []
  routeAnalytics.value = null
  routeLoadsPage.value = 1
  routeLoadsStatus.value = null
  detailTab.value = 'overview'
  showDetailDialog.value = true

  // Parallel fetch
  await Promise.all([
    fetchRouteDetail(route.route_id),
    fetchRouteLoads(route.route_id),
    fetchRouteAnalytics(route.route_id),
  ])
}

// Status breakdown as array for rendering
const statusBreakdownEntries = computed(() => {
  if (!routeDetail.value?.status_breakdown) return []
  const breakdown = routeDetail.value.status_breakdown
  return Object.entries(breakdown)
    .filter(([, count]) => count > 0)
    .sort(([, a], [, b]) => b - a)
})

const totalStatusCount = computed(() => {
  return statusBreakdownEntries.value.reduce((sum, [, count]) => sum + count, 0)
})

// Watchers
let searchTimeout = null
watch(search, () => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => { page.value = 1; fetchRoutes() }, 300)
})
watch([sortBy, dateFrom, dateTo], () => { page.value = 1; fetchRoutes() })
watch(page, () => fetchRoutes())

// Detail watchers
watch(routeLoadsPage, () => {
  if (selectedRoute.value) fetchRouteLoads(selectedRoute.value.route_id)
})
watch(routeLoadsStatus, () => {
  routeLoadsPage.value = 1
  if (selectedRoute.value) fetchRouteLoads(selectedRoute.value.route_id)
})
watch(analyticsPeriod, () => {
  if (selectedRoute.value) fetchRouteAnalytics(selectedRoute.value.route_id)
})

onMounted(() => {
  fetchRoutes()
})
</script>

<template>
  <div class="routes-page" :class="{ 'dark-mode': isDark }">
    <!-- Loading -->
    <div v-if="loading && !routes.length" class="d-flex justify-center align-center" style="min-height: 400px;">
      <VProgressCircular indeterminate size="48" color="primary" />
    </div>

    <template v-else>
      <!-- Page Header -->
      <div class="page-header mb-6" style="--delay: 0s;">
        <div class="d-flex align-center justify-space-between flex-wrap" style="gap: 16px;">
          <div class="d-flex align-center" style="gap: 16px;">
            <div class="header-icon">
              <VIcon icon="bx-map-alt" size="28" />
            </div>
            <div>
              <h1 class="text-h4 font-weight-bold" style="color: var(--text-primary);">Routes</h1>
              <p class="text-body-2 mb-0" style="color: var(--text-secondary);">View and analyze shipping routes</p>
            </div>
          </div>
          <VChip variant="tonal" color="primary" size="large" class="font-weight-bold">
            <VIcon icon="bx-map" class="me-1" />
            {{ totalRoutes }} Routes
          </VChip>
        </div>
      </div>

      <!-- Filters -->
      <VCard class="filter-card mb-6" style="--delay: 0.08s;">
        <VCardText class="pa-4">
          <VRow align="center">
            <VCol cols="12" md="4">
              <VTextField
                v-model="search"
                placeholder="Search routes (state name or abbreviation)..."
                variant="outlined"
                density="comfortable"
                hide-details
                clearable
                prepend-inner-icon="bx-search"
              />
            </VCol>
            <VCol cols="12" sm="6" md="2">
              <VSelect
                v-model="sortBy"
                :items="sortOptions"
                label="Sort By"
                variant="outlined"
                density="comfortable"
                hide-details
                prepend-inner-icon="bx-sort"
              />
            </VCol>
            <VCol cols="12" sm="6" md="2">
              <VTextField
                v-model="dateFrom"
                label="Date From"
                type="date"
                variant="outlined"
                density="comfortable"
                hide-details
                clearable
              />
            </VCol>
            <VCol cols="12" sm="6" md="2">
              <VTextField
                v-model="dateTo"
                label="Date To"
                type="date"
                variant="outlined"
                density="comfortable"
                hide-details
                clearable
              />
            </VCol>
            <VCol cols="12" sm="6" md="2" class="d-flex justify-end" style="gap: 8px;">
              <VBtn
                icon
                variant="tonal"
                @click="search = ''; sortBy = '-load_count'; dateFrom = ''; dateTo = ''"
              >
                <VIcon icon="bx-refresh" />
              </VBtn>
            </VCol>
          </VRow>
        </VCardText>
      </VCard>

      <!-- Routes Table -->
      <VCard class="table-card" style="--delay: 0.16s;">
        <VCardText class="pa-0">
          <div v-if="loading" class="d-flex justify-center pa-8">
            <VProgressCircular indeterminate color="primary" />
          </div>

          <div v-else-if="!routes.length" class="text-center pa-12">
            <VIcon icon="bx-map-alt" size="64" class="mb-4" style="color: var(--text-secondary); opacity: 0.5;" />
            <h3 class="text-h6 font-weight-bold mb-2" style="color: var(--text-primary);">No Routes Found</h3>
            <p class="text-body-2" style="color: var(--text-secondary);">Try adjusting your search or filters</p>
          </div>

          <VTable v-else density="comfortable" class="routes-table">
            <thead>
              <tr>
                <th>Route</th>
                <th>Loads</th>
                <th>Total Payout</th>
                <th>Most Expensive</th>
                <th>Cheapest</th>
                <th>Total Miles</th>
                <th>Latest Load</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(route, idx) in routes"
                :key="route.route_id"
                :style="{ '--delay': `${idx * 0.03}s` }"
                class="route-row"
                @click="openDetail(route)"
              >
                <td>
                  <div class="d-flex align-center" style="gap: 12px;">
                    <div class="route-icon-wrap">
                      <VIcon icon="bx-transfer-alt" size="20" />
                    </div>
                    <div>
                      <span class="d-block font-weight-bold" style="color: var(--text-primary); font-size: 0.95rem;">
                        {{ routeLabel(route) }}
                      </span>
                      <span class="d-block text-caption" style="color: var(--text-secondary);">
                        {{ routeLabelFull(route) }}
                      </span>
                    </div>
                  </div>
                </td>
                <td>
                  <VChip size="small" variant="tonal" color="primary" class="font-weight-bold">
                    {{ route.load_count || 0 }}
                  </VChip>
                </td>
                <td>
                  <span class="font-weight-semibold" style="color: var(--text-primary);">
                    {{ formatMoney(route.total_payout) }}
                  </span>
                </td>
                <td>
                  <span style="color: #10b981; font-weight: 600;">{{ formatMoney(route.most_expensive) }}</span>
                </td>
                <td>
                  <span style="color: var(--text-secondary);">{{ formatMoney(route.cheapest) }}</span>
                </td>
                <td>
                  <span style="color: var(--text-secondary);">{{ formatNumber(route.total_miles) }} mi</span>
                </td>
                <td>
                  <span class="text-body-2" style="color: var(--text-secondary);">{{ relativeTime(route.latest_load) }}</span>
                </td>
              </tr>
            </tbody>
          </VTable>

          <!-- Pagination -->
          <div v-if="totalPages > 1" class="d-flex align-center justify-space-between pa-4 flex-wrap" style="gap: 12px; border-top: 1px solid var(--card-border);">
            <span class="text-body-2" style="color: var(--text-secondary);">
              Showing {{ (page - 1) * perPage + 1 }} to {{ Math.min(page * perPage, totalRoutes) }} of {{ totalRoutes }}
            </span>
            <VPagination v-model="page" :length="totalPages" :total-visible="5" density="compact" />
          </div>
        </VCardText>
      </VCard>
    </template>

    <!-- Route Detail Dialog -->
    <VDialog v-model="showDetailDialog" max-width="900" scrollable>
      <VCard class="dialog-card">
        <!-- Header -->
        <VCardTitle class="d-flex align-center pa-5 pb-3" style="gap: 12px;">
          <div class="dialog-icon route">
            <VIcon icon="bx-map-alt" size="24" />
          </div>
          <div>
            <span class="d-block text-h6 font-weight-bold" style="color: var(--text-primary);">
              {{ selectedRoute ? routeLabelFull(selectedRoute) : 'Route Detail' }}
            </span>
            <span class="d-block text-caption" style="color: var(--text-secondary);">
              Route #{{ selectedRoute?.route_id }}
            </span>
          </div>
          <VSpacer />
          <VBtn icon variant="text" size="small" @click="showDetailDialog = false">
            <VIcon icon="bx-x" />
          </VBtn>
        </VCardTitle>
        <VDivider />

        <VCardText class="pa-5" style="max-height: 70vh; overflow-y: auto;">
          <!-- Loading -->
          <div v-if="detailLoading" class="d-flex justify-center pa-8">
            <VProgressCircular indeterminate color="primary" />
          </div>

          <template v-else-if="routeDetail">
            <!-- Tabs -->
            <VTabs v-model="detailTab" class="mb-5">
              <VTab value="overview">Overview</VTab>
              <VTab value="loads">Loads</VTab>
              <VTab value="analytics">Analytics</VTab>
            </VTabs>

            <!-- Overview Tab -->
            <div v-show="detailTab === 'overview'">
              <!-- Stats Cards -->
              <VRow class="mb-5">
                <VCol v-for="(stat, i) in [
                  { label: 'Total Loads', value: routeDetail.load_count || 0, icon: 'bx-package', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
                  { label: 'Total Payout', value: formatMoney(routeDetail.total_payout), icon: 'bx-dollar-circle', color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
                  { label: 'Most Expensive', value: formatMoney(routeDetail.most_expensive), icon: 'bx-trending-up', color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)' },
                  { label: 'Cheapest', value: formatMoney(routeDetail.cheapest), icon: 'bx-trending-down', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
                  { label: 'Total Miles', value: `${formatNumber(routeDetail.total_miles)} mi`, icon: 'bx-trip', color: '#06b6d4', bg: 'rgba(6,182,212,0.12)' },
                ]" :key="i" cols="12" sm="6" md="4">
                  <div class="detail-stat-card" :style="{ '--delay': `${i * 0.05}s` }">
                    <div class="d-flex align-center" style="gap: 12px;">
                      <div class="stat-icon-wrap" :style="{ background: stat.bg }">
                        <VIcon :icon="stat.icon" size="22" :style="{ color: stat.color }" />
                      </div>
                      <div>
                        <span class="d-block text-caption" style="color: var(--text-secondary);">{{ stat.label }}</span>
                        <span class="d-block font-weight-bold" style="color: var(--text-primary); font-size: 1.1rem;">{{ stat.value }}</span>
                      </div>
                    </div>
                  </div>
                </VCol>
              </VRow>

              <!-- Date Range -->
              <div class="detail-info-row mb-5">
                <div class="d-flex align-center justify-space-between flex-wrap" style="gap: 16px;">
                  <div class="d-flex align-center" style="gap: 8px;">
                    <VIcon icon="bx-calendar" size="18" style="color: var(--text-secondary);" />
                    <span class="text-body-2" style="color: var(--text-secondary);">
                      Earliest: <strong style="color: var(--text-primary);">{{ formatDate(routeDetail.earliest_load) }}</strong>
                    </span>
                  </div>
                  <div class="d-flex align-center" style="gap: 8px;">
                    <VIcon icon="bx-calendar-check" size="18" style="color: var(--text-secondary);" />
                    <span class="text-body-2" style="color: var(--text-secondary);">
                      Latest: <strong style="color: var(--text-primary);">{{ formatDate(routeDetail.latest_load) }}</strong>
                    </span>
                  </div>
                </div>
              </div>

              <!-- Status Breakdown -->
              <div v-if="statusBreakdownEntries.length" class="mb-4">
                <h4 class="text-subtitle-1 font-weight-bold mb-3" style="color: var(--text-primary);">Status Breakdown</h4>

                <!-- Visual Bar -->
                <div class="status-bar mb-4" v-if="totalStatusCount > 0">
                  <div
                    v-for="([status, count]) in statusBreakdownEntries"
                    :key="status"
                    class="status-bar-segment"
                    :style="{
                      width: `${(count / totalStatusCount) * 100}%`,
                      background: statusColors[status] || '#94a3b8',
                    }"
                    :title="`${statusLabels[status] || status}: ${count}`"
                  />
                </div>

                <!-- Chips -->
                <div class="d-flex flex-wrap" style="gap: 8px;">
                  <VChip
                    v-for="([status, count]) in statusBreakdownEntries"
                    :key="status"
                    size="small"
                    variant="tonal"
                    :style="{
                      color: statusColors[status] || '#94a3b8',
                      background: `${statusColors[status] || '#94a3b8'}18`,
                      borderColor: `${statusColors[status] || '#94a3b8'}40`,
                      border: '1px solid',
                    }"
                  >
                    <VIcon :style="{ color: statusColors[status] }" size="14" icon="bx-circle" class="me-1" />
                    {{ statusLabels[status] || status }}: {{ count }}
                  </VChip>
                </div>
              </div>
            </div>

            <!-- Loads Tab -->
            <div v-show="detailTab === 'loads'">
              <!-- Loads Filter -->
              <div class="d-flex align-center mb-4 flex-wrap" style="gap: 12px;">
                <VSelect
                  v-model="routeLoadsStatus"
                  :items="[
                    { title: 'All Statuses', value: null },
                    { title: 'Available', value: 'available' },
                    { title: 'Booked', value: 'booked' },
                    { title: 'In Transit', value: 'in_transit' },
                    { title: 'Delivered', value: 'delivered' },
                    { title: 'Cancelled', value: 'cancelled' },
                  ]"
                  variant="outlined"
                  density="compact"
                  hide-details
                  style="max-width: 200px;"
                  prepend-inner-icon="bx-filter-alt"
                />
              </div>

              <!-- Loads Loading -->
              <div v-if="routeLoadsLoading" class="d-flex justify-center pa-6">
                <VProgressCircular indeterminate color="primary" size="32" />
              </div>

              <!-- Loads Empty -->
              <div v-else-if="!routeLoads.length" class="text-center pa-8">
                <VIcon icon="bx-package" size="48" class="mb-2" style="color: var(--text-secondary); opacity: 0.4;" />
                <p class="text-body-2" style="color: var(--text-secondary);">No loads found for this route</p>
              </div>

              <!-- Loads Table -->
              <template v-else>
                <VTable density="compact" class="loads-table">
                  <thead>
                    <tr>
                      <th>Load #</th>
                      <th>Status</th>
                      <th>Payout</th>
                      <th>Miles</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="load in routeLoads" :key="load.id || load.load_id">
                      <td>
                        <span class="font-weight-semibold" style="color: var(--text-primary);">
                          #{{ load.id || load.load_id }}
                        </span>
                      </td>
                      <td>
                        <VChip
                          size="x-small"
                          variant="tonal"
                          :style="{
                            color: statusColors[load.status] || '#94a3b8',
                            background: `${statusColors[load.status] || '#94a3b8'}18`,
                          }"
                        >
                          {{ statusLabels[load.status] || load.status }}
                        </VChip>
                      </td>
                      <td>
                        <span class="font-weight-semibold" style="color: var(--text-primary);">
                          {{ formatMoney(load.payout) }}
                        </span>
                      </td>
                      <td style="color: var(--text-secondary);">
                        {{ formatNumber(load.total_miles) }} mi
                      </td>
                      <td>
                        <span class="text-body-2" style="color: var(--text-secondary);">
                          {{ formatDate(load.created_at || load.pickup_date) }}
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </VTable>

                <!-- Loads Pagination -->
                <div v-if="routeLoadsTotalPages > 1" class="d-flex justify-center pt-4">
                  <VPagination
                    v-model="routeLoadsPage"
                    :length="routeLoadsTotalPages"
                    :total-visible="5"
                    density="compact"
                  />
                </div>
              </template>
            </div>

            <!-- Analytics Tab -->
            <div v-show="detailTab === 'analytics'">
              <!-- Period Selector -->
              <div class="d-flex align-center mb-4" style="gap: 8px;">
                <VBtnToggle v-model="analyticsPeriod" mandatory density="compact" variant="outlined" divided>
                  <VBtn value="weekly" size="small">Weekly</VBtn>
                  <VBtn value="monthly" size="small">Monthly</VBtn>
                  <VBtn value="yearly" size="small">Yearly</VBtn>
                </VBtnToggle>
              </div>

              <!-- Analytics Loading -->
              <div v-if="analyticsLoading" class="d-flex justify-center pa-6">
                <VProgressCircular indeterminate color="primary" size="32" />
              </div>

              <!-- No Analytics -->
              <div v-else-if="!routeAnalytics || !routeAnalytics.periods?.length" class="text-center pa-8">
                <VIcon icon="bx-line-chart" size="48" class="mb-2" style="color: var(--text-secondary); opacity: 0.4;" />
                <p class="text-body-2" style="color: var(--text-secondary);">No analytics data available for this period</p>
              </div>

              <!-- Analytics Content -->
              <template v-else>
                <!-- Summary -->
                <div v-if="routeAnalytics.summary" class="analytics-summary mb-5">
                  <VRow>
                    <VCol v-for="(item, i) in [
                      { label: 'Avg Payout', value: formatMoney(routeAnalytics.summary.avg_payout), icon: 'bx-dollar', color: '#10b981' },
                      { label: 'Total Loads', value: routeAnalytics.summary.total_loads || 0, icon: 'bx-package', color: '#3b82f6' },
                      { label: 'Total Revenue', value: formatMoney(routeAnalytics.summary.total_revenue || routeAnalytics.summary.total_payout), icon: 'bx-wallet', color: '#8b5cf6' },
                    ]" :key="i" cols="12" sm="4">
                      <div class="analytics-stat-item">
                        <VIcon :icon="item.icon" size="18" :style="{ color: item.color }" class="me-2" />
                        <div>
                          <span class="d-block text-caption" style="color: var(--text-secondary);">{{ item.label }}</span>
                          <span class="d-block font-weight-bold" style="color: var(--text-primary);">{{ item.value }}</span>
                        </div>
                      </div>
                    </VCol>
                  </VRow>
                </div>

                <!-- Periods Table -->
                <VTable density="compact" class="analytics-table">
                  <thead>
                    <tr>
                      <th>Period</th>
                      <th>Loads</th>
                      <th>Total Payout</th>
                      <th>Avg Payout</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="period in routeAnalytics.periods" :key="period.period || period.label">
                      <td>
                        <span class="font-weight-semibold" style="color: var(--text-primary);">
                          {{ period.period || period.label || '-' }}
                        </span>
                      </td>
                      <td style="color: var(--text-secondary);">{{ period.load_count || period.loads || 0 }}</td>
                      <td>
                        <span class="font-weight-semibold" style="color: var(--text-primary);">
                          {{ formatMoney(period.total_payout || period.revenue) }}
                        </span>
                      </td>
                      <td style="color: var(--text-secondary);">
                        {{ formatMoney(period.avg_payout || period.average_payout) }}
                      </td>
                    </tr>
                  </tbody>
                </VTable>
              </template>
            </div>
          </template>
        </VCardText>
      </VCard>
    </VDialog>
  </div>
</template>

<style lang="scss" scoped>
.routes-page {
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

.filter-card {
  background: var(--card-bg) !important;
  backdrop-filter: blur(20px);
  border: 1px solid var(--card-border);
  border-radius: 16px !important;
  animation: fadeInUp 0.5s ease both;
  animation-delay: var(--delay);
}

.table-card {
  background: var(--card-bg) !important;
  backdrop-filter: blur(20px);
  border: 1px solid var(--card-border);
  border-radius: 16px !important;
  overflow: hidden;
  animation: fadeInUp 0.5s ease both;
  animation-delay: var(--delay);
}

.routes-table {
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
  }
}

.route-row {
  cursor: pointer;

  &:hover {
    background: var(--bg-subtle);
  }
}

.route-icon-wrap {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(99, 102, 241, 0.12);
  color: #6366f1;
  flex-shrink: 0;
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

  &.route {
    background: rgba(99, 102, 241, 0.15);
    color: #6366f1;
  }
}

.detail-stat-card {
  padding: 16px;
  border-radius: 12px;
  background: var(--bg-subtle);
  border: 1px solid var(--card-border);
  animation: fadeInUp 0.3s ease both;
  animation-delay: var(--delay);
}

.stat-icon-wrap {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.detail-info-row {
  padding: 14px 16px;
  border-radius: 12px;
  background: var(--bg-subtle);
  border: 1px solid var(--card-border);
}

.status-bar {
  display: flex;
  height: 10px;
  border-radius: 6px;
  overflow: hidden;
  gap: 2px;
}

.status-bar-segment {
  min-width: 6px;
  border-radius: 4px;
  transition: width 0.5s ease;
}

.loads-table,
.analytics-table {
  th {
    text-transform: uppercase;
    font-size: 0.7rem;
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
    transition: background 0.2s;

    &:hover {
      background: var(--bg-subtle);
    }
  }
}

.analytics-summary {
  padding: 16px;
  border-radius: 12px;
  background: var(--bg-subtle);
  border: 1px solid var(--card-border);
}

.analytics-stat-item {
  display: flex;
  align-items: center;
  padding: 8px 0;
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
