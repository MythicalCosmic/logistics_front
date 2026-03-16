<!-- src/pages/states.vue -->

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

// Permission
const canView = computed(() => authStore.hasPermission('analytics.view'))

// Data
const states = ref([])
const loading = ref(false)
const totalStates = ref(0)
const mostExpensiveLoad = ref(null)

// Pagination & Filters
const page = ref(1)
const perPage = ref(20)
const search = ref('')
const period = ref('all')
const sortBy = ref('-load_count')
const totalPages = computed(() => Math.ceil(totalStates.value / perPage.value))

const periodOptions = [
  { title: 'All Time', value: 'all' },
  { title: 'Weekly', value: 'weekly' },
  { title: 'Monthly', value: 'monthly' },
  { title: 'Yearly', value: 'yearly' },
]

const sortOptions = [
  { title: 'Most Loads', value: '-load_count' },
  { title: 'Fewest Loads', value: 'load_count' },
  { title: 'Name A-Z', value: 'name' },
  { title: 'Name Z-A', value: '-name' },
  { title: 'Abbreviation', value: 'abbreviation' },
  { title: 'Highest Payout', value: '-total_payout' },
  { title: 'Most Miles', value: '-total_miles' },
]

// State Detail
const showDetailDialog = ref(false)
const detailLoading = ref(false)
const selectedState = ref(null)
const stateOverview = ref(null)
const stateRoutes = ref([])
const stateMostExpensive = ref(null)
const detailPage = ref(1)
const detailPerPage = ref(10)
const detailTotalRoutes = ref(0)
const detailSearch = ref('')
const detailDirection = ref('all')
const detailStatus = ref(null)
const detailPeriod = ref('all')
const detailSortBy = ref('-load_count')
const detailTotalPages = computed(() => Math.ceil(detailTotalRoutes.value / detailPerPage.value))

const directionOptions = [
  { title: 'All Directions', value: 'all' },
  { title: 'Inbound', value: 'inbound' },
  { title: 'Outbound', value: 'outbound' },
]

const statusOptions = [
  { title: 'Available', value: 'available' },
  { title: 'Booked', value: 'booked' },
  { title: 'In Transit', value: 'in_transit' },
  { title: 'Delivered', value: 'delivered' },
  { title: 'Cancelled', value: 'cancelled' },
]

const detailSortOptions = [
  { title: 'Most Loads', value: '-load_count' },
  { title: 'Highest Payout', value: '-total_payout' },
  { title: 'Most Miles', value: '-total_miles' },
  { title: 'Most Expensive', value: '-most_expensive' },
]

// Analytics
const showAnalytics = ref(false)
const analyticsLoading = ref(false)
const analyticsData = ref(null)
const analyticsPeriod = ref('monthly')

const analyticsPeriodOptions = [
  { title: 'Weekly', value: 'weekly' },
  { title: 'Monthly', value: 'monthly' },
  { title: 'Yearly', value: 'yearly' },
]

// Summary stats from fetched data
const summaryStats = computed(() => {
  const data = states.value
  return {
    totalStates: totalStates.value || data.length,
    totalLoads: data.reduce((sum, s) => sum + (s.load_count || 0), 0),
    totalPayout: data.reduce((sum, s) => sum + parseFloat(s.total_payout || 0), 0),
    totalMiles: data.reduce((sum, s) => sum + parseFloat(s.total_miles || 0), 0),
  }
})

// Formatters
const formatMoney = (val) => {
  const num = parseFloat(val || 0)
  return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const formatNumber = (val) => {
  return Number(val || 0).toLocaleString()
}

const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Fetch states list
const fetchStates = async () => {
  loading.value = true
  try {
    const params = { page: page.value, per_page: perPage.value, sort_by: sortBy.value }
    if (search.value) params.search = search.value
    if (period.value && period.value !== 'all') params.period = period.value

    const response = await api.get('/admin-api/states', { params })
    if (response.data.success) {
      states.value = response.data.data?.states || []
      totalStates.value = response.data.data?.pagination?.total || states.value.length
      mostExpensiveLoad.value = response.data.data?.most_expensive_load || null
    }
  } catch (error) {
    toastError('Failed to load states')
  } finally {
    loading.value = false
  }
}

// Fetch state detail
const fetchStateDetail = async (abbreviation) => {
  detailLoading.value = true
  try {
    const params = {
      page: detailPage.value,
      per_page: detailPerPage.value,
      sort_by: detailSortBy.value,
    }
    if (detailSearch.value) params.search = detailSearch.value
    if (detailPeriod.value && detailPeriod.value !== 'all') params.period = detailPeriod.value
    if (detailDirection.value && detailDirection.value !== 'all') params.direction = detailDirection.value
    if (detailStatus.value) params.status = detailStatus.value

    const response = await api.get(`/admin-api/states/${abbreviation}`, { params })
    if (response.data.success) {
      const data = response.data.data
      stateOverview.value = data.overview || null
      stateRoutes.value = data.routes || []
      stateMostExpensive.value = data.most_expensive_load || null
      detailTotalRoutes.value = data.pagination?.total || stateRoutes.value.length
    }
  } catch (error) {
    toastError('Failed to load state details')
  } finally {
    detailLoading.value = false
  }
}

// Fetch state analytics
const fetchStateAnalytics = async (abbreviation) => {
  analyticsLoading.value = true
  try {
    const response = await api.get(`/admin-api/states/${abbreviation}/analytics`, {
      params: { period: analyticsPeriod.value },
    })
    if (response.data.success) {
      analyticsData.value = response.data.data
    }
  } catch (error) {
    toastError('Failed to load analytics')
  } finally {
    analyticsLoading.value = false
  }
}

// Open state detail
const openStateDetail = (state) => {
  selectedState.value = state
  detailPage.value = 1
  detailSearch.value = ''
  detailDirection.value = 'all'
  detailStatus.value = null
  detailPeriod.value = period.value
  detailSortBy.value = '-load_count'
  showAnalytics.value = false
  analyticsData.value = null
  showDetailDialog.value = true
  fetchStateDetail(state.abbreviation)
}

// Toggle analytics in detail view
const toggleAnalytics = () => {
  showAnalytics.value = !showAnalytics.value
  if (showAnalytics.value && !analyticsData.value && selectedState.value) {
    fetchStateAnalytics(selectedState.value.abbreviation)
  }
}

// Status chip config
const statusConfig = {
  available: { color: 'success', icon: 'bx-check-circle' },
  booked: { color: 'info', icon: 'bx-bookmark' },
  in_transit: { color: 'warning', icon: 'bx-car' },
  delivered: { color: 'primary', icon: 'bx-package' },
  cancelled: { color: 'error', icon: 'bx-x-circle' },
}

// Watchers
let searchTimeout = null
watch(search, () => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => { page.value = 1; fetchStates() }, 300)
})
watch([period, sortBy], () => { page.value = 1; fetchStates() })
watch(page, () => fetchStates())

// Detail watchers
let detailSearchTimeout = null
watch(detailSearch, () => {
  clearTimeout(detailSearchTimeout)
  detailSearchTimeout = setTimeout(() => {
    detailPage.value = 1
    if (selectedState.value) fetchStateDetail(selectedState.value.abbreviation)
  }, 300)
})
watch([detailDirection, detailStatus, detailPeriod, detailSortBy], () => {
  detailPage.value = 1
  if (selectedState.value) fetchStateDetail(selectedState.value.abbreviation)
})
watch(detailPage, () => {
  if (selectedState.value) fetchStateDetail(selectedState.value.abbreviation)
})
watch(analyticsPeriod, () => {
  if (showAnalytics.value && selectedState.value) {
    fetchStateAnalytics(selectedState.value.abbreviation)
  }
})

onMounted(() => {
  fetchStates()
})
</script>

<template>
  <div class="states-page" :class="{ 'dark-mode': isDark }">
    <!-- Loading -->
    <div v-if="loading && !states.length" class="d-flex justify-center align-center" style="min-height: 400px;">
      <VProgressCircular indeterminate size="48" color="primary" />
    </div>

    <template v-else>
      <!-- Page Header -->
      <div class="page-header mb-6">
        <div class="d-flex align-center justify-space-between flex-wrap" style="gap: 16px;">
          <div class="d-flex align-center" style="gap: 16px;">
            <div class="header-icon">
              <VIcon icon="bx-map-alt" size="28" />
            </div>
            <div>
              <h1 class="text-h4 font-weight-bold" style="color: var(--text-primary);">States</h1>
              <p class="text-body-2 mb-0" style="color: var(--text-secondary);">View load activity and routes by state</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Stats Row -->
      <VRow class="mb-6">
        <VCol v-for="(stat, i) in [
          { label: 'Total States', value: formatNumber(summaryStats.totalStates), icon: 'bx-map', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
          { label: 'Total Loads', value: formatNumber(summaryStats.totalLoads), icon: 'bx-package', color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
          { label: 'Total Payout', value: formatMoney(summaryStats.totalPayout), icon: 'bx-dollar-circle', color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)' },
          { label: 'Total Miles', value: formatNumber(Math.round(summaryStats.totalMiles)), icon: 'bx-trip', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
        ]" :key="i" cols="12" sm="6" md="3">
          <VCard class="stat-card" :style="{ '--delay': `${i * 0.08}s` }">
            <VCardText class="pa-5">
              <div class="d-flex align-center justify-space-between mb-3">
                <div class="stat-icon-wrap" :style="{ background: stat.bg }">
                  <VIcon :icon="stat.icon" size="24" :style="{ color: stat.color }" />
                </div>
              </div>
              <h3 class="text-h5 font-weight-bold mb-1" style="color: var(--text-primary);">{{ stat.value }}</h3>
              <span class="text-body-2" style="color: var(--text-secondary);">{{ stat.label }}</span>
            </VCardText>
          </VCard>
        </VCol>
      </VRow>

      <!-- Filters -->
      <VCard class="filter-card mb-6">
        <VCardText class="pa-4">
          <VRow align="center">
            <VCol cols="12" md="4">
              <VTextField
                v-model="search"
                placeholder="Search states..."
                variant="outlined"
                density="comfortable"
                hide-details
                clearable
                prepend-inner-icon="bx-search"
              />
            </VCol>
            <VCol cols="12" sm="6" md="3">
              <VSelect
                v-model="period"
                :items="periodOptions"
                label="Period"
                variant="outlined"
                density="comfortable"
                hide-details
                prepend-inner-icon="bx-calendar"
              />
            </VCol>
            <VCol cols="12" sm="6" md="3">
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
            <VCol cols="12" md="2" class="d-flex justify-end">
              <VBtn icon variant="tonal" @click="search = ''; period = 'all'; sortBy = '-load_count'">
                <VIcon icon="bx-refresh" />
              </VBtn>
            </VCol>
          </VRow>
        </VCardText>
      </VCard>

      <!-- States Table -->
      <VCard class="table-card">
        <VCardText class="pa-0">
          <div v-if="loading" class="d-flex justify-center pa-8">
            <VProgressCircular indeterminate color="primary" />
          </div>

          <div v-else-if="!states.length" class="text-center pa-12">
            <VIcon icon="bx-map-alt" size="64" class="mb-4" style="color: var(--text-secondary); opacity: 0.5;" />
            <h3 class="text-h6 font-weight-bold mb-2" style="color: var(--text-primary);">No States Found</h3>
            <p class="text-body-2" style="color: var(--text-secondary);">Try adjusting your search or filters</p>
          </div>

          <VTable v-else density="comfortable" class="states-table">
            <thead>
              <tr>
                <th>State</th>
                <th>Loads</th>
                <th>Routes</th>
                <th>Total Payout</th>
                <th>Most Expensive</th>
                <th>Total Miles</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(state, idx) in states"
                :key="state.abbreviation"
                :style="{ '--delay': `${idx * 0.03}s` }"
                class="state-row"
                @click="openStateDetail(state)"
              >
                <td>
                  <div class="d-flex align-center" style="gap: 12px;">
                    <div class="state-badge">
                      {{ state.abbreviation }}
                    </div>
                    <div>
                      <span class="d-block font-weight-semibold" style="color: var(--text-primary);">{{ state.name }}</span>
                      <span class="d-block text-caption" style="color: var(--text-secondary);">{{ state.abbreviation }}</span>
                    </div>
                  </div>
                </td>
                <td>
                  <span class="font-weight-semibold" style="color: var(--text-primary);">{{ formatNumber(state.load_count) }}</span>
                </td>
                <td>
                  <span style="color: var(--text-secondary);">{{ formatNumber(state.route_count) }}</span>
                </td>
                <td>
                  <span class="font-weight-semibold" style="color: #10b981;">{{ formatMoney(state.total_payout) }}</span>
                </td>
                <td>
                  <span style="color: var(--text-primary);">{{ formatMoney(state.most_expensive) }}</span>
                </td>
                <td>
                  <span style="color: var(--text-secondary);">{{ formatNumber(Math.round(parseFloat(state.total_miles || 0))) }}</span>
                </td>
                <td>
                  <VBtn icon variant="text" size="small" @click.stop="openStateDetail(state)">
                    <VIcon icon="bx-chevron-right" />
                  </VBtn>
                </td>
              </tr>
            </tbody>
          </VTable>

          <!-- Pagination -->
          <div v-if="totalPages > 1" class="d-flex align-center justify-space-between pa-4 flex-wrap" style="gap: 12px; border-top: 1px solid var(--card-border);">
            <span class="text-body-2" style="color: var(--text-secondary);">
              Showing {{ (page - 1) * perPage + 1 }} to {{ Math.min(page * perPage, totalStates) }} of {{ totalStates }}
            </span>
            <VPagination v-model="page" :length="totalPages" :total-visible="5" density="compact" />
          </div>
        </VCardText>
      </VCard>
    </template>

    <!-- State Detail Dialog -->
    <VDialog v-model="showDetailDialog" max-width="950" scrollable>
      <VCard class="dialog-card">
        <!-- Header -->
        <VCardTitle class="d-flex align-center pa-5 pb-3" style="gap: 12px;">
          <div class="dialog-icon info">
            <VIcon icon="bx-map-pin" size="24" />
          </div>
          <div>
            <span class="d-block text-h6 font-weight-bold" style="color: var(--text-primary);">
              {{ selectedState?.name }}
            </span>
            <span class="d-block text-caption" style="color: var(--text-secondary);">
              {{ selectedState?.abbreviation }} - State Detail & Routes
            </span>
          </div>
          <VSpacer />
          <VBtn
            variant="tonal"
            size="small"
            :color="showAnalytics ? 'primary' : 'default'"
            class="me-2"
            @click="toggleAnalytics"
          >
            <VIcon icon="bx-bar-chart-alt-2" class="me-1" size="18" />
            Analytics
          </VBtn>
          <VBtn icon variant="text" size="small" @click="showDetailDialog = false">
            <VIcon icon="bx-x" />
          </VBtn>
        </VCardTitle>
        <VDivider />

        <VCardText class="pa-5" style="max-height: 70vh; overflow-y: auto;">
          <!-- Detail Loading -->
          <div v-if="detailLoading && !stateRoutes.length" class="d-flex justify-center pa-8">
            <VProgressCircular indeterminate color="primary" />
          </div>

          <template v-else>
            <!-- Overview Stats -->
            <VRow v-if="stateOverview" class="mb-5">
              <VCol v-for="(stat, i) in [
                { label: 'Total Loads', value: formatNumber(stateOverview.total_loads), icon: 'bx-package', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
                { label: 'Total Routes', value: formatNumber(stateOverview.total_routes), icon: 'bx-git-merge', color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
                { label: 'Total Payout', value: formatMoney(stateOverview.total_payout), icon: 'bx-dollar-circle', color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)' },
                { label: 'Total Miles', value: formatNumber(Math.round(parseFloat(stateOverview.total_miles || 0))), icon: 'bx-trip', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
              ]" :key="i" cols="6" md="3">
                <div class="overview-stat-card">
                  <div class="stat-icon-wrap mb-2" :style="{ background: stat.bg }">
                    <VIcon :icon="stat.icon" size="20" :style="{ color: stat.color }" />
                  </div>
                  <div class="text-h6 font-weight-bold" style="color: var(--text-primary);">{{ stat.value }}</div>
                  <div class="text-caption" style="color: var(--text-secondary);">{{ stat.label }}</div>
                </div>
              </VCol>
            </VRow>

            <!-- Most Expensive Load -->
            <div v-if="stateMostExpensive" class="most-expensive-card mb-5">
              <div class="d-flex align-center" style="gap: 12px;">
                <div class="stat-icon-wrap" style="background: rgba(245, 158, 11, 0.12);">
                  <VIcon icon="bx-crown" size="20" style="color: #f59e0b;" />
                </div>
                <div>
                  <span class="text-body-2 font-weight-bold" style="color: var(--text-primary);">
                    Most Expensive Load: {{ formatMoney(stateMostExpensive.payout) }}
                  </span>
                  <span class="d-block text-caption" style="color: var(--text-secondary);">
                    {{ stateMostExpensive.origin_city }}, {{ stateMostExpensive.origin_state }}
                    &rarr;
                    {{ stateMostExpensive.destination_city }}, {{ stateMostExpensive.destination_state }}
                    &middot; {{ formatNumber(Math.round(parseFloat(stateMostExpensive.total_miles || 0))) }} mi
                  </span>
                </div>
              </div>
            </div>

            <!-- Analytics Section -->
            <template v-if="showAnalytics">
              <div class="analytics-section mb-5">
                <div class="d-flex align-center justify-space-between mb-3">
                  <h3 class="text-subtitle-1 font-weight-bold" style="color: var(--text-primary);">
                    <VIcon icon="bx-bar-chart-alt-2" size="20" class="me-1" />
                    Analytics
                  </h3>
                  <VSelect
                    v-model="analyticsPeriod"
                    :items="analyticsPeriodOptions"
                    variant="outlined"
                    density="compact"
                    hide-details
                    style="max-width: 160px;"
                  />
                </div>

                <div v-if="analyticsLoading" class="d-flex justify-center pa-6">
                  <VProgressCircular indeterminate color="primary" size="32" />
                </div>

                <template v-else-if="analyticsData">
                  <!-- Analytics Overview -->
                  <VRow v-if="analyticsData.overview" class="mb-4">
                    <VCol v-for="(stat, i) in [
                      { label: 'Avg Loads/Period', value: analyticsData.overview.avg_loads_per_period || 0, color: '#3b82f6' },
                      { label: 'Avg Payout/Period', value: formatMoney(analyticsData.overview.avg_payout_per_period), color: '#10b981' },
                      { label: 'Peak Loads', value: analyticsData.overview.peak_loads || 0, color: '#f59e0b' },
                    ]" :key="i" cols="4">
                      <div class="analytics-mini-stat">
                        <div class="text-h6 font-weight-bold" :style="{ color: stat.color }">{{ stat.value }}</div>
                        <div class="text-caption" style="color: var(--text-secondary);">{{ stat.label }}</div>
                      </div>
                    </VCol>
                  </VRow>

                  <!-- Top Routes -->
                  <div v-if="analyticsData.top_routes?.length" class="mb-4">
                    <h4 class="text-subtitle-2 font-weight-bold mb-2" style="color: var(--text-primary);">Top Routes</h4>
                    <div class="top-routes-list">
                      <div v-for="(route, i) in analyticsData.top_routes.slice(0, 5)" :key="i" class="top-route-item">
                        <div class="d-flex align-center justify-space-between">
                          <div class="d-flex align-center" style="gap: 8px;">
                            <VChip size="x-small" color="primary" variant="tonal" class="font-weight-bold">
                              #{{ i + 1 }}
                            </VChip>
                            <span class="text-body-2 font-weight-semibold" style="color: var(--text-primary);">
                              {{ route.origin_state }} &rarr; {{ route.destination_state }}
                            </span>
                          </div>
                          <div class="d-flex align-center" style="gap: 16px;">
                            <span class="text-caption" style="color: var(--text-secondary);">
                              {{ formatNumber(route.load_count) }} loads
                            </span>
                            <span class="text-caption font-weight-bold" style="color: #10b981;">
                              {{ formatMoney(route.total_payout) }}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Periods Timeline -->
                  <div v-if="analyticsData.periods?.length">
                    <h4 class="text-subtitle-2 font-weight-bold mb-2" style="color: var(--text-primary);">Period Breakdown</h4>
                    <div class="periods-list">
                      <div v-for="(p, i) in analyticsData.periods.slice(0, 12)" :key="i" class="period-item">
                        <div class="d-flex align-center justify-space-between">
                          <span class="text-body-2 font-weight-semibold" style="color: var(--text-primary);">
                            {{ p.period_label || p.period }}
                          </span>
                          <div class="d-flex align-center" style="gap: 16px;">
                            <VChip size="x-small" variant="tonal" color="info">
                              {{ formatNumber(p.load_count) }} loads
                            </VChip>
                            <span class="text-caption font-weight-bold" style="color: #10b981;">
                              {{ formatMoney(p.total_payout) }}
                            </span>
                            <span class="text-caption" style="color: var(--text-secondary);">
                              {{ formatNumber(Math.round(parseFloat(p.total_miles || 0))) }} mi
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </template>

                <div v-else class="text-center pa-6">
                  <VIcon icon="bx-bar-chart" size="48" class="mb-2" style="color: var(--text-secondary); opacity: 0.4;" />
                  <p class="text-body-2 mb-0" style="color: var(--text-secondary);">No analytics data available</p>
                </div>
              </div>
              <VDivider class="mb-5" />
            </template>

            <!-- Detail Filters -->
            <div class="detail-filters mb-4">
              <VRow align="center" dense>
                <VCol cols="12" sm="4">
                  <VTextField
                    v-model="detailSearch"
                    placeholder="Search routes..."
                    variant="outlined"
                    density="compact"
                    hide-details
                    clearable
                    prepend-inner-icon="bx-search"
                  />
                </VCol>
                <VCol cols="6" sm="2">
                  <VSelect
                    v-model="detailDirection"
                    :items="directionOptions"
                    variant="outlined"
                    density="compact"
                    hide-details
                  />
                </VCol>
                <VCol cols="6" sm="2">
                  <VSelect
                    v-model="detailStatus"
                    :items="statusOptions"
                    placeholder="Status"
                    variant="outlined"
                    density="compact"
                    hide-details
                    clearable
                  />
                </VCol>
                <VCol cols="6" sm="2">
                  <VSelect
                    v-model="detailPeriod"
                    :items="periodOptions"
                    variant="outlined"
                    density="compact"
                    hide-details
                  />
                </VCol>
                <VCol cols="6" sm="2">
                  <VSelect
                    v-model="detailSortBy"
                    :items="detailSortOptions"
                    variant="outlined"
                    density="compact"
                    hide-details
                  />
                </VCol>
              </VRow>
            </div>

            <!-- Routes Table -->
            <div v-if="detailLoading" class="d-flex justify-center pa-4">
              <VProgressCircular indeterminate color="primary" size="32" />
            </div>

            <div v-else-if="!stateRoutes.length" class="text-center pa-8">
              <VIcon icon="bx-git-merge" size="48" class="mb-2" style="color: var(--text-secondary); opacity: 0.4;" />
              <p class="text-body-2 mb-0" style="color: var(--text-secondary);">No routes found</p>
            </div>

            <VTable v-else density="compact" class="routes-table">
              <thead>
                <tr>
                  <th>Route</th>
                  <th>Loads</th>
                  <th>Total Payout</th>
                  <th>Most Expensive</th>
                  <th>Cheapest</th>
                  <th>Total Miles</th>
                  <th>Latest</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="route in stateRoutes" :key="route.route_id">
                  <td>
                    <div class="d-flex align-center" style="gap: 8px;">
                      <VChip size="x-small" variant="tonal" color="primary" class="font-weight-bold">
                        {{ route.origin_state?.abbreviation }}
                      </VChip>
                      <VIcon icon="bx-right-arrow-alt" size="16" style="color: var(--text-secondary);" />
                      <VChip size="x-small" variant="tonal" color="secondary" class="font-weight-bold">
                        {{ route.destination_state?.abbreviation }}
                      </VChip>
                    </div>
                    <div class="text-caption mt-1" style="color: var(--text-secondary);">
                      {{ route.origin_state?.name }} &rarr; {{ route.destination_state?.name }}
                    </div>
                  </td>
                  <td>
                    <span class="font-weight-semibold" style="color: var(--text-primary);">
                      {{ formatNumber(route.load_count) }}
                    </span>
                  </td>
                  <td>
                    <span class="font-weight-semibold" style="color: #10b981;">
                      {{ formatMoney(route.total_payout) }}
                    </span>
                  </td>
                  <td>
                    <span style="color: var(--text-primary);">{{ formatMoney(route.most_expensive) }}</span>
                  </td>
                  <td>
                    <span style="color: var(--text-secondary);">{{ formatMoney(route.cheapest) }}</span>
                  </td>
                  <td>
                    <span style="color: var(--text-secondary);">
                      {{ formatNumber(Math.round(parseFloat(route.total_miles || 0))) }}
                    </span>
                  </td>
                  <td>
                    <span class="text-caption" style="color: var(--text-secondary);">
                      {{ formatDate(route.latest_load) }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </VTable>

            <!-- Routes Pagination -->
            <div v-if="detailTotalPages > 1" class="d-flex align-center justify-space-between pt-4 flex-wrap" style="gap: 12px; border-top: 1px solid var(--card-border); margin-top: 16px;">
              <span class="text-body-2" style="color: var(--text-secondary);">
                Showing {{ (detailPage - 1) * detailPerPage + 1 }} to {{ Math.min(detailPage * detailPerPage, detailTotalRoutes) }} of {{ detailTotalRoutes }} routes
              </span>
              <VPagination v-model="detailPage" :length="detailTotalPages" :total-visible="5" density="compact" />
            </div>
          </template>
        </VCardText>
      </VCard>
    </VDialog>
  </div>
</template>

<style lang="scss" scoped>
.states-page {
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

.states-table {
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

.state-row {
  cursor: pointer;
}

.state-badge {
  width: 42px;
  height: 42px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 700;
  flex-shrink: 0;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(139, 92, 246, 0.15));
  color: #6366f1;
  border: 1px solid rgba(99, 102, 241, 0.2);

  .dark-mode & {
    color: #a5b4fc;
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.25), rgba(139, 92, 246, 0.25));
    border-color: rgba(99, 102, 241, 0.3);
  }
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

  &.info { background: rgba(59, 130, 246, 0.15); color: #3b82f6; }
}

.overview-stat-card {
  padding: 16px;
  border-radius: 12px;
  background: var(--bg-subtle);
  border: 1px solid var(--card-border);
  text-align: center;
}

.most-expensive-card {
  padding: 16px;
  border-radius: 12px;
  background: rgba(245, 158, 11, 0.06);
  border: 1px solid rgba(245, 158, 11, 0.15);
}

.analytics-section {
  padding: 20px;
  border-radius: 12px;
  background: var(--bg-subtle);
  border: 1px solid var(--card-border);
}

.analytics-mini-stat {
  text-align: center;
  padding: 12px;
  border-radius: 10px;
  background: var(--card-bg);
  border: 1px solid var(--card-border);
}

.top-routes-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.top-route-item {
  padding: 10px 14px;
  border-radius: 10px;
  background: var(--card-bg);
  border: 1px solid var(--card-border);
}

.periods-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.period-item {
  padding: 10px 14px;
  border-radius: 10px;
  background: var(--card-bg);
  border: 1px solid var(--card-border);
}

.routes-table {
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

.detail-filters {
  padding: 12px 16px;
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
