<!-- src/pages/analytics.vue -->

<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { useTheme } from 'vuetify'
import api from '@/services/api'

const vuetifyTheme = useTheme()
const isDark = computed(() => vuetifyTheme.global.current.value.dark)

// Data
const loading = ref(true)
const analyticsOverview = ref(null)
const weeklyFrequency = ref([])
const monthlyFrequency = ref([])
const loadStats = ref(null)
const trendsData = ref(null)
const compareData = ref(null)
const routesData = ref([])

// Filters
const sortFreqBy = ref('monthly')
const searchFreq = ref('')
const activeTab = ref('overview')
const expandedLoadId = ref(null)

// Trends filters
const trendsPeriod = ref('30d')
const trendsLoading = ref(false)

// Compare filters
const comparePeriod1 = ref('7d')
const comparePeriod2 = ref('30d')
const compareLoading = ref(false)

// Routes
const routesLoading = ref(false)

// ─── Computed: Frequency ───
const frequencyData = computed(() => {
  const weekMap = {}
  weeklyFrequency.value.forEach(l => { weekMap[l.load_id] = l })
  const monthMap = {}
  monthlyFrequency.value.forEach(l => { monthMap[l.load_id] = l })

  const allLoadIds = new Set([
    ...weeklyFrequency.value.map(l => l.load_id),
    ...monthlyFrequency.value.map(l => l.load_id),
  ])

  let data = [...allLoadIds].map(loadId => {
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
  })

  if (searchFreq.value) {
    const q = searchFreq.value.toLowerCase()
    data = data.filter(d =>
      d.load_id.toLowerCase().includes(q) ||
      (d.primary_route?.origin_city || '').toLowerCase().includes(q) ||
      (d.primary_route?.destination_city || '').toLowerCase().includes(q),
    )
  }

  if (sortFreqBy.value === 'monthly') data.sort((a, b) => b.monthly_count - a.monthly_count)
  else if (sortFreqBy.value === 'weekly') data.sort((a, b) => b.weekly_count - a.weekly_count)
  else if (sortFreqBy.value === 'payout') data.sort((a, b) => Number(b.total_payout) - Number(a.total_payout))
  else if (sortFreqBy.value === 'change') {
    data.sort((a, b) => {
      const ca = a.monthly_count > 0 ? ((a.weekly_count / a.monthly_count) * 4.3 - 1) : 0
      const cb = b.monthly_count > 0 ? ((b.weekly_count / b.monthly_count) * 4.3 - 1) : 0
      return cb - ca
    })
  }
  return data
})

const summaryStats = computed(() => {
  const data = frequencyData.value
  return {
    uniqueLoads: data.length,
    totalWeekly: data.reduce((s, d) => s + d.weekly_count, 0),
    totalMonthly: data.reduce((s, d) => s + d.monthly_count, 0),
    duplicatesMonthly: data.filter(d => d.monthly_count > 1).length,
    totalPayout: data.reduce((s, d) => s + Number(d.total_payout || 0), 0),
    avgWeekly: data.length > 0 ? (data.reduce((s, d) => s + d.weekly_count, 0) / data.length).toFixed(1) : '0',
  }
})

const topByFrequency = computed(() => frequencyData.value.slice(0, 5))
const topByPayout = computed(() =>
  [...frequencyData.value].sort((a, b) => Number(b.total_payout) - Number(a.total_payout)).slice(0, 5),
)
const trendingUp = computed(() =>
  frequencyData.value
    .filter(d => d.monthly_count > 0)
    .map(d => ({ ...d, weeklyRate: (d.weekly_count / d.monthly_count) * 4.3 }))
    .filter(d => d.weeklyRate > 1.2)
    .sort((a, b) => b.weeklyRate - a.weeklyRate)
    .slice(0, 5),
)
const trendingDown = computed(() =>
  frequencyData.value
    .filter(d => d.monthly_count > 1 && d.weekly_count === 0)
    .sort((a, b) => b.monthly_count - a.monthly_count)
    .slice(0, 5),
)

const statusBreakdown = computed(() => loadStats.value?.status_breakdown || {})
const financials = computed(() => loadStats.value?.financial || {})

// ─── Overview stats from the overview API ───
const overviewStats = computed(() => {
  if (!analyticsOverview.value) return []
  const items = []
  for (const [key, value] of Object.entries(analyticsOverview.value)) {
    if (value && typeof value === 'object') {
      for (const [subKey, subVal] of Object.entries(value)) {
        if (subVal && typeof subVal === 'object') {
          for (const [deepKey, deepVal] of Object.entries(subVal)) {
            if (deepVal !== null && deepVal !== undefined && typeof deepVal !== 'object') {
              items.push({ section: formatKey(key), label: formatKey(subKey) + ' — ' + formatKey(deepKey), value: deepVal, key: deepKey })
            }
          }
        } else if (subVal !== null && subVal !== undefined) {
          items.push({ section: formatKey(key), label: formatKey(subKey), value: subVal, key: subKey })
        }
      }
    } else if (value !== null && value !== undefined) {
      items.push({ section: 'General', label: formatKey(key), value, key })
    }
  }
  const grouped = {}
  items.forEach(item => {
    if (!grouped[item.section]) grouped[item.section] = { section: item.section, items: [] }
    grouped[item.section].items.push(item)
  })
  return Object.values(grouped)
})

// ─── Trends computed ───
const trendPoints = computed(() => trendsData.value?.data || trendsData.value?.data_points || [])
const trendSummary = computed(() => trendsData.value?.summary || {})
const maxTrendValue = computed(() => {
  const points = trendPoints.value
  if (!points.length) return 1
  return Math.max(...points.map(p => p.count || p.total || 0), 1)
})

// ─── Compare computed ───
const comparePeriods = computed(() => {
  if (!compareData.value) return { period1: {}, period2: {}, changes: {}, label1: '', label2: '' }
  return {
    period1: compareData.value.period_a?.stats || {},
    period2: compareData.value.period_b?.stats || {},
    changes: compareData.value.changes || {},
    label1: compareData.value.period_a?.label || comparePeriod1.value,
    label2: compareData.value.period_b?.label || comparePeriod2.value,
  }
})

// ─── Routes computed ───
const topRoutes = computed(() => {
  return (routesData.value || []).slice(0, 10)
})
const maxRouteCount = computed(() => {
  if (!topRoutes.value.length) return 1
  return Math.max(...topRoutes.value.map(r => r.count || r.load_count || 0), 1)
})

// ─── Fetch functions ───
const fetchAll = async () => {
  loading.value = true
  const results = await Promise.allSettled([
    api.get('/admin-api/analytics/overview'),
    api.get('/admin-api/analytics/loads/frequency', { params: { period: '7d', min_count: 1 } }),
    api.get('/admin-api/analytics/loads/frequency', { params: { period: '30d', min_count: 1 } }),
    api.get('/api/loads/stats'),
    api.get('/admin-api/analytics/loads/trends', { params: { period: '30d' } }),
    api.get('/admin-api/analytics/loads/compare', { params: { period_a: '7d', period_b: '30d' } }),
    api.get('/admin-api/analytics/loads/routes'),
  ])

  if (results[0].status === 'fulfilled' && results[0].value.data.success)
    analyticsOverview.value = results[0].value.data.data
  if (results[1].status === 'fulfilled' && results[1].value.data.success)
    weeklyFrequency.value = results[1].value.data.data?.loads || []
  if (results[2].status === 'fulfilled' && results[2].value.data.success)
    monthlyFrequency.value = results[2].value.data.data?.loads || []
  if (results[3].status === 'fulfilled' && results[3].value.data.success)
    loadStats.value = results[3].value.data.data
  if (results[4].status === 'fulfilled' && results[4].value.data.success)
    trendsData.value = results[4].value.data.data
  if (results[5].status === 'fulfilled' && results[5].value.data.success)
    compareData.value = results[5].value.data.data
  if (results[6].status === 'fulfilled' && results[6].value.data.success)
    routesData.value = results[6].value.data.data?.routes || results[6].value.data.data || []

  loading.value = false
}

const fetchTrends = async () => {
  trendsLoading.value = true
  try {
    const response = await api.get('/admin-api/analytics/loads/trends', { params: { period: trendsPeriod.value, group_by: 'day' } })
    if (response.data.success) trendsData.value = response.data.data
  } catch (e) { console.error('Trends fetch failed:', e) }
  trendsLoading.value = false
}

const fetchCompare = async () => {
  compareLoading.value = true
  try {
    const response = await api.get('/admin-api/analytics/loads/compare', {
      params: { period_a: comparePeriod1.value, period_b: comparePeriod2.value },
    })
    if (response.data.success) compareData.value = response.data.data
  } catch (e) { console.error('Compare fetch failed:', e) }
  compareLoading.value = false
}

watch(trendsPeriod, fetchTrends)
watch([comparePeriod1, comparePeriod2], fetchCompare)

// ─── Helpers ───
const formatCurrency = (val) =>
  Number(val || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const formatKey = (key) => key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

const isMoney = (key) => /payout|revenue|cost|amount|price|earning/i.test(key)
const isPercent = (key, val) => {
  if (typeof val === 'string' && val.includes('%')) return true
  return /change|percent|rate|ratio|growth/i.test(key)
}
const formatOverviewValue = (key, val) => {
  if (val === null || val === undefined) return '-'
  if (typeof val === 'object') return '-'
  if (typeof val === 'string' && val.includes('%')) return val
  if (isMoney(key)) return formatCurrency(val)
  if (typeof val === 'number') return val.toLocaleString()
  return String(val)
}

const getChangePercent = (item) => {
  if (!item.monthly_count) return 0
  return Math.round(((item.weekly_count / item.monthly_count) * 4.3 - 1) * 100)
}

const getRouteDisplay = (route) => {
  if (!route) return '-'
  const origin = [route.origin_city, route.origin_state].filter(Boolean).join(', ')
  const dest = [route.destination_city, route.destination_state].filter(Boolean).join(', ')
  if (!origin && !dest) return '-'
  return `${origin || '?'} → ${dest || '?'}`
}

const getBarWidth = (value, max) => {
  if (!max) return '0%'
  return Math.max((value / max) * 100, value > 0 ? 3 : 0) + '%'
}

const maxMonthly = computed(() => Math.max(...frequencyData.value.map(d => d.monthly_count), 1))
const maxWeekly = computed(() => Math.max(...frequencyData.value.map(d => d.weekly_count), 1))

const toggleExpand = (loadId) => {
  expandedLoadId.value = expandedLoadId.value === loadId ? null : loadId
}

const getStatusEntries = (breakdown) => {
  if (!breakdown || typeof breakdown !== 'object') return []
  return Object.entries(breakdown).filter(([, v]) => v > 0)
}

const statusColorMap = {
  available: '#10b981', booked: '#3b82f6', in_transit: '#f59e0b',
  delivered: '#8b5cf6', cancelled: '#ef4444',
}

const getOverviewIcon = (key) => {
  const k = key.toLowerCase()
  if (k.includes('week')) return 'bx-calendar-week'
  if (k.includes('month')) return 'bx-calendar'
  if (k.includes('duplicate')) return 'bx-copy-alt'
  if (k.includes('financial') || k.includes('revenue') || k.includes('payout')) return 'bx-wallet'
  if (k.includes('status')) return 'bx-loader-circle'
  if (k.includes('route') || k.includes('lane')) return 'bx-map'
  if (k.includes('driver')) return 'bx-user'
  return 'bx-bar-chart'
}

const getCompareChangeClass = (val) => {
  const num = Number(val)
  if (num > 0) return 'positive'
  if (num < 0) return 'negative'
  return 'neutral'
}

const formatCompareChange = (val) => {
  const num = Number(val || 0)
  if (typeof val === 'string' && val.includes('%')) return val
  if (num > 0) return `+${num.toLocaleString()}`
  return num.toLocaleString()
}

onMounted(fetchAll)
</script>

<template>
  <div class="analytics-page" :class="{ 'dark-mode': isDark }">
    <!-- Loading -->
    <div v-if="loading" class="d-flex flex-column align-center justify-center" style="min-height: 60vh;">
      <VProgressCircular indeterminate color="primary" size="48" />
      <p class="text-body-2 mt-4" style="color: var(--text-secondary);">Loading analytics...</p>
    </div>

    <template v-else>
      <!-- Page Header -->
      <div class="page-header mb-6">
        <div class="d-flex align-center justify-space-between flex-wrap" style="gap: 16px;">
          <div class="d-flex align-center" style="gap: 16px;">
            <div class="header-icon">
              <VIcon icon="bx-bar-chart-alt-2" size="28" />
            </div>
            <div>
              <h1 class="text-h4 font-weight-bold" style="color: var(--text-primary);">Analytics</h1>
              <p class="text-body-2 mb-0" style="color: var(--text-secondary);">Load frequency, trends, routes & performance insights</p>
            </div>
          </div>
          <VBtn
            variant="flat"
            class="refresh-btn"
            @click="fetchAll"
            :loading="loading"
          >
            <VIcon icon="bx-refresh" class="me-2" />
            Refresh
          </VBtn>
        </div>
      </div>

      <!-- Summary Stats -->
      <div class="stats-grid mb-6">
        <div v-for="(stat, idx) in [
          { icon: 'bx-cube', value: summaryStats.uniqueLoads, label: 'Unique Loads', cls: 'stat-blue' },
          { icon: 'bx-calendar', value: summaryStats.totalWeekly, label: 'This Week', cls: 'stat-green' },
          { icon: 'bx-calendar-alt', value: summaryStats.totalMonthly, label: 'This Month', cls: 'stat-purple' },
          { icon: 'bx-copy', value: summaryStats.duplicatesMonthly, label: 'Repeating', cls: 'stat-amber' },
          { icon: 'bx-dollar-circle', value: formatCurrency(summaryStats.totalPayout), label: 'Total Payout', cls: 'stat-teal' },
          { icon: 'bx-line-chart', value: summaryStats.avgWeekly + 'x', label: 'Avg Freq/Week', cls: 'stat-pink' },
        ]" :key="idx"
          class="stat-card"
          :class="stat.cls"
          :style="{ '--delay': `${idx * 0.05}s` }"
        >
          <div class="stat-icon-wrap">
            <VIcon :icon="stat.icon" size="24" />
          </div>
          <div class="stat-info">
            <span class="stat-value">{{ stat.value }}</span>
            <span class="stat-label">{{ stat.label }}</span>
          </div>
        </div>
      </div>

      <!-- Tab Navigation -->
      <div class="tab-nav mb-6">
        <button
          v-for="tab in [
            { value: 'overview', icon: 'bx-grid-alt', label: 'Overview' },
            { value: 'frequency', icon: 'bx-bar-chart', label: 'Frequency' },
            { value: 'trends', icon: 'bx-line-chart', label: 'Trends' },
            { value: 'compare', icon: 'bx-git-compare', label: 'Compare' },
            { value: 'routes', icon: 'bx-map', label: 'Routes' },
            { value: 'insights', icon: 'bx-bulb', label: 'Insights' },
          ]"
          :key="tab.value"
          class="tab-btn"
          :class="{ active: activeTab === tab.value }"
          @click="activeTab = tab.value"
        >
          <VIcon :icon="tab.icon" size="18" />
          <span>{{ tab.label }}</span>
        </button>
      </div>

      <!-- ═══════════ TAB: Overview ═══════════ -->
      <div v-if="activeTab === 'overview'" class="tab-content">
        <div class="overview-grid">
          <!-- Financial Overview -->
          <div class="content-card">
            <div class="section-header">
              <div class="section-icon finance"><VIcon icon="bx-wallet" size="22" /></div>
              <div>
                <h3 class="section-title">Financial Overview</h3>
                <p class="section-subtitle">Revenue and cost metrics</p>
              </div>
            </div>
            <div class="metrics-grid">
              <div class="metric-item">
                <span class="metric-label">Total Revenue</span>
                <span class="metric-value money">{{ formatCurrency(financials.total_payout) }}</span>
              </div>
              <div class="metric-item">
                <span class="metric-label">Average Payout</span>
                <span class="metric-value">{{ formatCurrency(financials.avg_payout) }}</span>
              </div>
              <div class="metric-item">
                <span class="metric-label">Total Miles</span>
                <span class="metric-value">{{ Number(financials.total_miles || 0).toLocaleString() }} mi</span>
              </div>
              <div class="metric-item">
                <span class="metric-label">Avg Miles / Load</span>
                <span class="metric-value">{{ Number(financials.avg_miles || 0).toLocaleString() }} mi</span>
              </div>
            </div>
          </div>

          <!-- Status Distribution -->
          <div class="content-card">
            <div class="section-header">
              <div class="section-icon status"><VIcon icon="bx-pie-chart-alt-2" size="22" /></div>
              <div>
                <h3 class="section-title">Status Distribution</h3>
                <p class="section-subtitle">Current load status breakdown</p>
              </div>
            </div>
            <div class="status-list">
              <div
                v-for="(label, status) in { available: 'Available', booked: 'Booked', in_transit: 'In Transit', delivered: 'Delivered', cancelled: 'Cancelled' }"
                :key="status"
                class="status-row"
              >
                <div class="d-flex align-center" style="gap: 8px; flex: 0 0 120px;">
                  <span class="status-dot" :style="{ background: statusColorMap[status] }"></span>
                  <span class="text-body-2 font-weight-semibold" style="color: var(--text-primary);">{{ label }}</span>
                </div>
                <span class="text-body-2 font-weight-bold" style="color: var(--text-primary); min-width: 30px;">{{ statusBreakdown[status] || 0 }}</span>
                <div class="bar-track" style="flex: 1;">
                  <div
                    class="bar-fill"
                    :style="{ width: getBarWidth(statusBreakdown[status] || 0, loadStats?.total_loads || 1), background: statusColorMap[status] }"
                  ></div>
                </div>
              </div>
            </div>
          </div>

          <!-- Dynamic Overview Sections -->
          <template v-if="overviewStats.length">
            <div
              v-for="group in overviewStats"
              :key="group.section"
              class="content-card"
              :class="{ 'full-width': group.items.length > 4 }"
            >
              <div class="section-header">
                <div class="section-icon data"><VIcon :icon="getOverviewIcon(group.section.toLowerCase())" size="22" /></div>
                <div>
                  <h3 class="section-title">{{ group.section }}</h3>
                  <p class="section-subtitle">{{ group.items.length }} metrics</p>
                </div>
              </div>
              <div class="metrics-grid">
                <div v-for="item in group.items" :key="item.label" class="metric-item">
                  <span class="metric-label">{{ item.label }}</span>
                  <span class="metric-value" :class="{ money: isMoney(item.key), accent: isPercent(item.key, item.value) }">
                    {{ formatOverviewValue(item.key, item.value) }}
                  </span>
                </div>
              </div>
            </div>
          </template>
        </div>
      </div>

      <!-- ═══════════ TAB: Frequency ═══════════ -->
      <div v-if="activeTab === 'frequency'" class="tab-content">
        <div class="content-card">
          <!-- Filters -->
          <div class="d-flex align-center flex-wrap mb-5" style="gap: 12px;">
            <VTextField
              v-model="searchFreq"
              placeholder="Search load ID, city..."
              variant="outlined"
              density="compact"
              hide-details
              clearable
              prepend-inner-icon="bx-search"
              style="flex: 1; min-width: 220px;"
            />
            <VSelect
              v-model="sortFreqBy"
              :items="[
                { title: 'Monthly Count', value: 'monthly' },
                { title: 'Weekly Count', value: 'weekly' },
                { title: 'Highest Payout', value: 'payout' },
                { title: 'Trending', value: 'change' },
              ]"
              variant="outlined"
              density="compact"
              hide-details
              style="width: 180px; flex-shrink: 0;"
            />
            <VChip color="primary" variant="tonal" size="small">
              <VIcon icon="bx-package" size="16" start />
              {{ frequencyData.length }} loads
            </VChip>
          </div>

          <!-- Empty -->
          <div v-if="frequencyData.length === 0" class="text-center pa-12">
            <VIcon icon="bx-search-alt" size="64" style="color: var(--text-secondary); opacity: 0.4;" class="mb-4" />
            <h3 class="text-h6 font-weight-bold mb-2" style="color: var(--text-primary);">No Frequency Data</h3>
            <p class="text-body-2" style="color: var(--text-secondary);">No recurring loads found for current filters.</p>
          </div>

          <!-- Frequency Cards -->
          <div v-else class="freq-list">
            <div
              v-for="(item, index) in frequencyData"
              :key="item.load_id"
              class="freq-card"
              :class="{ expanded: expandedLoadId === item.load_id }"
              :style="{ '--delay': `${index * 0.03}s` }"
              @click="toggleExpand(item.load_id)"
            >
              <div class="freq-main">
                <div class="freq-left">
                  <span class="freq-id">{{ item.load_id }}</span>
                  <span class="freq-route">{{ getRouteDisplay(item.primary_route) }}</span>
                </div>
                <div class="freq-bars">
                  <div class="freq-bar-row">
                    <span class="bar-label">W</span>
                    <div class="bar-track"><div class="bar-fill weekly" :style="{ width: getBarWidth(item.weekly_count, maxWeekly) }"></div></div>
                    <span class="bar-count">{{ item.weekly_count }}x</span>
                  </div>
                  <div class="freq-bar-row">
                    <span class="bar-label">M</span>
                    <div class="bar-track"><div class="bar-fill monthly" :style="{ width: getBarWidth(item.monthly_count, maxMonthly) }"></div></div>
                    <span class="bar-count">{{ item.monthly_count }}x</span>
                  </div>
                </div>
                <div class="freq-right">
                  <span class="trend-badge" :class="{ up: getChangePercent(item) > 10, down: getChangePercent(item) < -10 }">
                    <VIcon :icon="getChangePercent(item) > 0 ? 'bx-trending-up' : getChangePercent(item) < 0 ? 'bx-trending-down' : 'bx-minus'" size="14" />
                    {{ getChangePercent(item) > 0 ? '+' : '' }}{{ getChangePercent(item) }}%
                  </span>
                  <span class="freq-payout">{{ formatCurrency(item.total_payout) }}</span>
                </div>
                <VIcon :icon="expandedLoadId === item.load_id ? 'bx-chevron-up' : 'bx-chevron-down'" size="20" style="color: var(--text-secondary); flex-shrink: 0;" />
              </div>

              <!-- Expanded -->
              <div v-if="expandedLoadId === item.load_id" class="freq-detail" @click.stop>
                <div class="detail-grid">
                  <div class="detail-item">
                    <span class="detail-label">Avg Payout</span>
                    <span class="detail-value money">{{ formatCurrency(item.avg_payout) }}</span>
                  </div>
                  <div class="detail-item">
                    <span class="detail-label">Avg Miles</span>
                    <span class="detail-value">{{ Number(item.avg_miles || 0).toLocaleString() }} mi</span>
                  </div>
                  <div class="detail-item">
                    <span class="detail-label">Last Seen</span>
                    <span class="detail-value">{{ formatDate(item.last_seen) }}</span>
                  </div>
                  <div class="detail-item">
                    <span class="detail-label">Weekly Rate</span>
                    <span class="detail-value">{{ item.monthly_count > 0 ? ((item.weekly_count / item.monthly_count) * 4.3).toFixed(1) : '0' }}x proj.</span>
                  </div>
                </div>
                <div v-if="getStatusEntries(item.status_breakdown).length" class="mt-3">
                  <span class="detail-label">Status Breakdown</span>
                  <div class="d-flex flex-wrap mt-2" style="gap: 6px;">
                    <VChip
                      v-for="[status, count] in getStatusEntries(item.status_breakdown)"
                      :key="status"
                      size="x-small"
                      variant="tonal"
                      :style="{ color: statusColorMap[status] || '#64748b' }"
                    >
                      {{ status.replace(/_/g, ' ') }}: {{ count }}
                    </VChip>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ═══════════ TAB: Trends ═══════════ -->
      <div v-if="activeTab === 'trends'" class="tab-content">
        <div class="content-card">
          <div class="d-flex align-center justify-space-between flex-wrap mb-5" style="gap: 12px;">
            <div class="section-header mb-0">
              <div class="section-icon trends"><VIcon icon="bx-line-chart" size="22" /></div>
              <div>
                <h3 class="section-title">Load Trends</h3>
                <p class="section-subtitle">Volume and activity over time</p>
              </div>
            </div>
            <div class="d-flex align-center" style="gap: 8px;">
              <VBtnToggle v-model="trendsPeriod" mandatory density="compact" variant="outlined" divided>
                <VBtn value="7d" size="small">7D</VBtn>
                <VBtn value="14d" size="small">14D</VBtn>
                <VBtn value="30d" size="small">30D</VBtn>
                <VBtn value="90d" size="small">90D</VBtn>
              </VBtnToggle>
            </div>
          </div>

          <VProgressLinear v-if="trendsLoading" indeterminate color="primary" class="mb-4" />

          <!-- Trend Summary Cards -->
          <div v-if="trendSummary" class="trend-summary mb-5">
            <div v-for="(val, key) in trendSummary" :key="key" class="trend-summary-item" v-show="typeof val !== 'object'">
              <span class="detail-label">{{ formatKey(key) }}</span>
              <span class="detail-value" :class="{ money: isMoney(key) }">
                {{ isMoney(key) ? formatCurrency(val) : (typeof val === 'number' ? val.toLocaleString() : val) }}
              </span>
            </div>
          </div>

          <!-- Trend Chart (CSS bars) -->
          <div v-if="trendPoints.length" class="trend-chart">
            <div class="trend-chart-inner">
              <div
                v-for="(point, idx) in trendPoints"
                :key="idx"
                class="trend-bar-col"
                :style="{ '--delay': `${idx * 0.02}s` }"
              >
                <div class="trend-bar-value">{{ point.count || point.total || 0 }}</div>
                <div class="trend-bar-track">
                  <div
                    class="trend-bar-fill"
                    :style="{ height: getBarWidth(point.count || point.total || 0, maxTrendValue) }"
                  ></div>
                </div>
                <div class="trend-bar-label">{{ point.label || point.date || '' }}</div>
              </div>
            </div>
          </div>

          <div v-else-if="!trendsLoading" class="text-center pa-8">
            <VIcon icon="bx-line-chart" size="48" style="color: var(--text-secondary); opacity: 0.4;" class="mb-3" />
            <p class="text-body-2" style="color: var(--text-secondary);">No trend data available for this period</p>
          </div>
        </div>
      </div>

      <!-- ═══════════ TAB: Compare ═══════════ -->
      <div v-if="activeTab === 'compare'" class="tab-content">
        <div class="content-card">
          <div class="d-flex align-center justify-space-between flex-wrap mb-5" style="gap: 12px;">
            <div class="section-header mb-0">
              <div class="section-icon compare"><VIcon icon="bx-git-compare" size="22" /></div>
              <div>
                <h3 class="section-title">Period Comparison</h3>
                <p class="section-subtitle">Compare metrics across two time periods</p>
              </div>
            </div>
            <div class="d-flex align-center flex-wrap" style="gap: 8px;">
              <VSelect
                v-model="comparePeriod1"
                :items="[
                  { title: 'Last 7 days', value: '7d' },
                  { title: 'Last 14 days', value: '14d' },
                  { title: 'Last 30 days', value: '30d' },
                ]"
                variant="outlined"
                density="compact"
                hide-details
                label="Period 1"
                style="width: 160px;"
              />
              <VIcon icon="bx-transfer-alt" size="20" style="color: var(--text-secondary);" />
              <VSelect
                v-model="comparePeriod2"
                :items="[
                  { title: 'Last 7 days', value: '7d' },
                  { title: 'Last 14 days', value: '14d' },
                  { title: 'Last 30 days', value: '30d' },
                  { title: 'Last 90 days', value: '90d' },
                ]"
                variant="outlined"
                density="compact"
                hide-details
                label="Period 2"
                style="width: 160px;"
              />
            </div>
          </div>

          <VProgressLinear v-if="compareLoading" indeterminate color="primary" class="mb-4" />

          <div v-if="compareData" class="compare-grid">
            <!-- Period 1 -->
            <div class="compare-period">
              <h4 class="compare-period-title">
                <VIcon icon="bx-calendar" size="18" class="me-2" />
                {{ comparePeriods.label1 || 'Period 1' }}
              </h4>
              <div class="compare-metrics">
                <div v-for="(val, key) in comparePeriods.period1" :key="key" class="compare-metric" v-show="typeof val !== 'object'">
                  <span class="detail-label">{{ formatKey(key) }}</span>
                  <span class="detail-value" :class="{ money: isMoney(key) }">
                    {{ isMoney(key) ? formatCurrency(val) : (typeof val === 'number' ? val.toLocaleString() : val) }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Changes -->
            <div class="compare-changes">
              <h4 class="compare-period-title">
                <VIcon icon="bx-transfer-alt" size="18" class="me-2" />
                Changes
              </h4>
              <div class="compare-metrics">
                <div v-for="(val, key) in comparePeriods.changes" :key="key" class="compare-metric" v-show="val && typeof val === 'object'">
                  <span class="detail-label">{{ formatKey(key) }}</span>
                  <span class="detail-value" :class="getCompareChangeClass(val?.change)">
                    {{ formatCompareChange(val?.change) }}
                    <span v-if="val?.change_pct" class="text-caption ms-1">({{ val.change_pct }}%)</span>
                  </span>
                </div>
              </div>
            </div>

            <!-- Period 2 -->
            <div class="compare-period">
              <h4 class="compare-period-title">
                <VIcon icon="bx-calendar-alt" size="18" class="me-2" />
                {{ comparePeriods.label2 || 'Period 2' }}
              </h4>
              <div class="compare-metrics">
                <div v-for="(val, key) in comparePeriods.period2" :key="key" class="compare-metric" v-show="typeof val !== 'object'">
                  <span class="detail-label">{{ formatKey(key) }}</span>
                  <span class="detail-value" :class="{ money: isMoney(key) }">
                    {{ isMoney(key) ? formatCurrency(val) : (typeof val === 'number' ? val.toLocaleString() : val) }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div v-else-if="!compareLoading" class="text-center pa-8">
            <VIcon icon="bx-git-compare" size="48" style="color: var(--text-secondary); opacity: 0.4;" class="mb-3" />
            <p class="text-body-2" style="color: var(--text-secondary);">Select periods to compare</p>
          </div>
        </div>
      </div>

      <!-- ═══════════ TAB: Routes ═══════════ -->
      <div v-if="activeTab === 'routes'" class="tab-content">
        <div class="content-card">
          <div class="section-header mb-5">
            <div class="section-icon route"><VIcon icon="bx-map" size="22" /></div>
            <div>
              <h3 class="section-title">Top Routes</h3>
              <p class="section-subtitle">Most active origin-destination lanes</p>
            </div>
          </div>

          <div v-if="!topRoutes.length" class="text-center pa-8">
            <VIcon icon="bx-map" size="48" style="color: var(--text-secondary); opacity: 0.4;" class="mb-3" />
            <p class="text-body-2" style="color: var(--text-secondary);">No route data available</p>
          </div>

          <div v-else class="routes-list">
            <div
              v-for="(route, idx) in topRoutes"
              :key="idx"
              class="route-card"
              :style="{ '--delay': `${idx * 0.04}s` }"
            >
              <div class="route-rank" :class="{ gold: idx === 0, silver: idx === 1, bronze: idx === 2 }">
                {{ idx + 1 }}
              </div>
              <div class="route-info">
                <div class="route-lane">
                  <span class="route-origin">{{ route.origin_city || route.origin || '?' }}, {{ route.origin_state || '' }}</span>
                  <VIcon icon="bx-right-arrow-alt" size="18" style="color: var(--text-secondary);" />
                  <span class="route-dest">{{ route.destination_city || route.destination || '?' }}, {{ route.destination_state || '' }}</span>
                </div>
                <div class="d-flex align-center flex-wrap" style="gap: 12px; margin-top: 4px;">
                  <span class="route-meta">
                    <VIcon icon="bx-package" size="14" />
                    {{ route.count || route.load_count || 0 }} loads
                  </span>
                  <span v-if="route.avg_payout || route.total_payout" class="route-meta money">
                    <VIcon icon="bx-dollar" size="14" />
                    {{ formatCurrency(route.avg_payout || route.total_payout) }}
                  </span>
                  <span v-if="route.avg_miles || route.total_miles" class="route-meta">
                    <VIcon icon="bx-trip" size="14" />
                    {{ Number(route.avg_miles || route.total_miles || 0).toLocaleString() }} mi
                  </span>
                </div>
              </div>
              <div class="route-bar-wrap">
                <div class="bar-track" style="width: 120px;">
                  <div
                    class="bar-fill route-bar"
                    :style="{ width: getBarWidth(route.count || route.load_count || 0, maxRouteCount) }"
                  ></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ═══════════ TAB: Insights ═══════════ -->
      <div v-if="activeTab === 'insights'" class="tab-content">
        <div class="insights-grid">
          <!-- Most Frequent -->
          <div class="content-card">
            <div class="section-header">
              <div class="section-icon gold"><VIcon icon="bx-trophy" size="22" /></div>
              <h3 class="section-title">Most Frequent</h3>
            </div>
            <div v-if="!topByFrequency.length" class="text-center pa-6">
              <p class="text-body-2" style="color: var(--text-secondary);">No data yet</p>
            </div>
            <div v-for="(item, idx) in topByFrequency" :key="item.load_id" class="insight-row">
              <div class="insight-rank" :class="['r' + idx]">{{ idx + 1 }}</div>
              <div class="insight-info">
                <span class="insight-id">{{ item.load_id }}</span>
                <span class="insight-route">{{ getRouteDisplay(item.primary_route) }}</span>
              </div>
              <div class="insight-stat">
                <span class="insight-count">{{ item.monthly_count }}x</span>
                <span class="insight-period">/ month</span>
              </div>
            </div>
          </div>

          <!-- Top Revenue -->
          <div class="content-card">
            <div class="section-header">
              <div class="section-icon green"><VIcon icon="bx-dollar-circle" size="22" /></div>
              <h3 class="section-title">Top Revenue</h3>
            </div>
            <div v-if="!topByPayout.length" class="text-center pa-6">
              <p class="text-body-2" style="color: var(--text-secondary);">No data yet</p>
            </div>
            <div v-for="(item, idx) in topByPayout" :key="item.load_id" class="insight-row">
              <div class="insight-rank" :class="['r' + idx]">{{ idx + 1 }}</div>
              <div class="insight-info">
                <span class="insight-id">{{ item.load_id }}</span>
                <span class="insight-route">{{ getRouteDisplay(item.primary_route) }}</span>
              </div>
              <div class="insight-stat">
                <span class="insight-money">{{ formatCurrency(item.total_payout) }}</span>
                <span class="insight-period">{{ item.monthly_count }}x/mo</span>
              </div>
            </div>
          </div>

          <!-- Trending Up -->
          <div class="content-card">
            <div class="section-header">
              <div class="section-icon emerald"><VIcon icon="bx-trending-up" size="22" /></div>
              <h3 class="section-title" style="flex: 1;">Trending Up</h3>
              <VChip size="x-small" color="success" variant="tonal">Increasing</VChip>
            </div>
            <div v-if="!trendingUp.length" class="text-center pa-6">
              <p class="text-body-2" style="color: var(--text-secondary);">No trending loads this week</p>
            </div>
            <div v-for="item in trendingUp" :key="item.load_id" class="insight-row">
              <VIcon icon="bx-up-arrow-alt" size="20" color="success" />
              <div class="insight-info">
                <span class="insight-id">{{ item.load_id }}</span>
                <span class="insight-route">{{ item.weekly_count }}x/week vs {{ item.monthly_count }}x/month</span>
              </div>
              <span class="trend-badge up small">+{{ Math.round((item.weeklyRate - 1) * 100) }}%</span>
            </div>
          </div>

          <!-- Inactive -->
          <div class="content-card">
            <div class="section-header">
              <div class="section-icon red"><VIcon icon="bx-trending-down" size="22" /></div>
              <h3 class="section-title" style="flex: 1;">Inactive This Week</h3>
              <VChip size="x-small" color="error" variant="tonal">No activity</VChip>
            </div>
            <div v-if="!trendingDown.length" class="text-center pa-6">
              <p class="text-body-2" style="color: var(--text-secondary);">All loads active this week</p>
            </div>
            <div v-for="item in trendingDown" :key="item.load_id" class="insight-row">
              <VIcon icon="bx-down-arrow-alt" size="20" color="error" />
              <div class="insight-info">
                <span class="insight-id">{{ item.load_id }}</span>
                <span class="insight-route">{{ item.monthly_count }}x this month, 0 this week</span>
              </div>
              <span class="text-caption" style="color: var(--text-secondary);">{{ formatDate(item.last_seen) }}</span>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style lang="scss" scoped>
// ─── Theme Variables ───
.analytics-page {
  --card-bg: rgba(255, 255, 255, 0.85);
  --card-border: rgba(0, 0, 0, 0.06);
  --text-primary: #1e293b;
  --text-secondary: #64748b;
  --bg-subtle: rgba(0, 0, 0, 0.02);
  --input-bg: rgba(0, 0, 0, 0.03);
  --hover-bg: rgba(0, 0, 0, 0.04);

  &.dark-mode {
    --card-bg: rgba(30, 30, 46, 0.85);
    --card-border: rgba(255, 255, 255, 0.06);
    --text-primary: #e2e8f0;
    --text-secondary: #94a3b8;
    --bg-subtle: rgba(255, 255, 255, 0.03);
    --input-bg: rgba(255, 255, 255, 0.05);
    --hover-bg: rgba(255, 255, 255, 0.05);
  }
}

// ─── Header ───
.header-icon {
  width: 52px;
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #0d9488, #06b6d4);
  border-radius: 14px;
  color: white;
  box-shadow: 0 8px 24px rgba(13, 148, 136, 0.3);
}

.refresh-btn {
  background: linear-gradient(135deg, #0d9488, #06b6d4) !important;
  color: white !important;
  font-weight: 600;
  border-radius: 12px !important;
  padding: 0 24px !important;
  box-shadow: 0 4px 16px rgba(13, 148, 136, 0.3);
  transition: all 0.3s ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(13, 148, 136, 0.4);
  }
}

// ─── Stats Grid ───
.stats-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 14px;
}

.stat-card {
  background: var(--card-bg);
  backdrop-filter: blur(20px);
  border: 1px solid var(--card-border);
  border-radius: 16px;
  padding: 18px;
  display: flex;
  align-items: center;
  gap: 12px;
  transition: all 0.3s ease;
  animation: fadeInUp 0.5s ease both;
  animation-delay: var(--delay);

  &:hover {
    transform: translateY(-3px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
  }
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

.stat-blue .stat-icon-wrap { background: linear-gradient(135deg, rgba(59,130,246,0.15), rgba(99,102,241,0.15)); color: #3b82f6; }
.stat-green .stat-icon-wrap { background: linear-gradient(135deg, rgba(16,185,129,0.15), rgba(52,211,153,0.15)); color: #10b981; }
.stat-purple .stat-icon-wrap { background: linear-gradient(135deg, rgba(139,92,246,0.15), rgba(167,139,250,0.15)); color: #8b5cf6; }
.stat-amber .stat-icon-wrap { background: linear-gradient(135deg, rgba(245,158,11,0.15), rgba(251,191,36,0.15)); color: #f59e0b; }
.stat-teal .stat-icon-wrap { background: linear-gradient(135deg, rgba(13,148,136,0.15), rgba(6,182,212,0.15)); color: #0d9488; }
.stat-pink .stat-icon-wrap { background: linear-gradient(135deg, rgba(236,72,153,0.15), rgba(244,114,182,0.15)); color: #ec4899; }

.stat-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.stat-value {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stat-label {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 2px;
}

// ─── Tab Navigation ───
.tab-nav {
  display: flex;
  gap: 6px;
  background: var(--card-bg);
  backdrop-filter: blur(20px);
  border: 1px solid var(--card-border);
  border-radius: 14px;
  padding: 5px;
  overflow-x: auto;
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  border-radius: 10px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.25s ease;
  flex: 1;
  justify-content: center;
  white-space: nowrap;

  &:hover {
    background: var(--hover-bg);
    color: var(--text-primary);
  }

  &.active {
    background: linear-gradient(135deg, #0d9488, #06b6d4);
    color: white;
    box-shadow: 0 4px 15px rgba(13, 148, 136, 0.3);
  }
}

// ─── Content Card ───
.content-card {
  background: var(--card-bg);
  backdrop-filter: blur(20px);
  border: 1px solid var(--card-border);
  border-radius: 18px;
  padding: 24px;
  transition: border-color 0.2s ease;

  &:hover {
    border-color: rgba(13, 148, 136, 0.1);
  }
}

.section-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}

.section-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  flex-shrink: 0;
}

.section-icon.finance { background: linear-gradient(135deg, rgba(16,185,129,0.15), rgba(6,182,212,0.15)); color: #0d9488; }
.section-icon.status { background: linear-gradient(135deg, rgba(245,158,11,0.15), rgba(251,191,36,0.15)); color: #f59e0b; }
.section-icon.data { background: linear-gradient(135deg, rgba(59,130,246,0.15), rgba(99,102,241,0.15)); color: #3b82f6; }
.section-icon.trends { background: linear-gradient(135deg, rgba(13,148,136,0.15), rgba(6,182,212,0.15)); color: #06b6d4; }
.section-icon.compare { background: linear-gradient(135deg, rgba(139,92,246,0.15), rgba(99,102,241,0.15)); color: #8b5cf6; }
.section-icon.route { background: linear-gradient(135deg, rgba(245,158,11,0.15), rgba(251,191,36,0.15)); color: #f59e0b; }
.section-icon.gold { background: linear-gradient(135deg, rgba(245,158,11,0.15), rgba(251,191,36,0.15)); color: #f59e0b; }
.section-icon.green { background: linear-gradient(135deg, rgba(16,185,129,0.15), rgba(52,211,153,0.15)); color: #10b981; }
.section-icon.emerald { background: linear-gradient(135deg, rgba(13,148,136,0.15), rgba(6,182,212,0.15)); color: #06b6d4; }
.section-icon.red { background: linear-gradient(135deg, rgba(239,68,68,0.15), rgba(248,113,113,0.15)); color: #ef4444; }

.section-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.section-subtitle {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 2px 0 0;
}

// ─── Metrics Grid ───
.metrics-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.metric-item {
  background: var(--bg-subtle);
  border-radius: 12px;
  padding: 14px;
}

.metric-label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.3px;
  margin-bottom: 4px;
}

.metric-value {
  font-size: 18px;
  font-weight: 800;
  color: var(--text-primary);

  &.money { color: #0d9488; }
  &.accent { color: #3b82f6; }
}

// ─── Bars (shared) ───
.bar-track {
  flex: 1;
  height: 8px;
  border-radius: 4px;
  background: var(--bg-subtle);
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.8s ease;

  &.weekly { background: linear-gradient(90deg, #10b981, #34d399); }
  &.monthly { background: linear-gradient(90deg, #8b5cf6, #a78bfa); }
  &.route-bar { background: linear-gradient(90deg, #f59e0b, #fbbf24); }
}

// ─── Status ───
.status-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.status-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

// ─── Frequency ───
.freq-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.freq-card {
  background: var(--bg-subtle);
  border: 1px solid var(--card-border);
  border-radius: 14px;
  cursor: pointer;
  transition: all 0.3s ease;
  animation: fadeInUp 0.4s ease both;
  animation-delay: var(--delay);

  &:hover {
    border-color: rgba(13, 148, 136, 0.3);
    transform: translateY(-1px);
  }

  &.expanded {
    border-color: rgba(13, 148, 136, 0.4);
    background: var(--hover-bg);
  }
}

.freq-main {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 18px;
}

.freq-left {
  flex: 0 0 200px;
  min-width: 0;
}

.freq-id {
  display: block;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
  font-family: monospace;
  letter-spacing: 0.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.freq-route {
  display: block;
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.freq-bars {
  flex: 1;
  min-width: 120px;
}

.freq-bar-row {
  display: flex;
  align-items: center;
  gap: 8px;

  & + & { margin-top: 4px; }
}

.bar-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-secondary);
  width: 14px;
  text-align: center;
}

.bar-count {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
  min-width: 32px;
  text-align: right;
}

.freq-right {
  flex: 0 0 130px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.freq-payout {
  font-size: 14px;
  font-weight: 700;
  color: #0d9488;
}

// ─── Trend Badge ───
.trend-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 6px;
  background: var(--bg-subtle);
  color: var(--text-secondary);

  &.up { background: rgba(16, 185, 129, 0.12); color: #10b981; }
  &.down { background: rgba(239, 68, 68, 0.12); color: #ef4444; }
  &.small { font-size: 11px; padding: 1px 6px; }
}

// ─── Frequency Detail ───
.freq-detail {
  padding: 0 18px 18px;
  border-top: 1px solid var(--card-border);
  padding-top: 14px;
  animation: expandIn 0.3s ease;
}

@keyframes expandIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}

.detail-item {
  background: var(--input-bg);
  border-radius: 10px;
  padding: 12px;
}

.detail-label {
  display: block;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.3px;
  margin-bottom: 4px;
}

.detail-value {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);

  &.money { color: #0d9488; }
  &.positive { color: #10b981; }
  &.negative { color: #ef4444; }
  &.neutral { color: var(--text-secondary); }
}

// ─── Trends Chart ───
.trend-summary {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 10px;
}

.trend-summary-item {
  background: var(--bg-subtle);
  border-radius: 10px;
  padding: 12px;
}

.trend-chart {
  overflow-x: auto;
  padding: 8px 0;
}

.trend-chart-inner {
  display: flex;
  gap: 6px;
  align-items: flex-end;
  min-height: 200px;
  padding-bottom: 24px;
  position: relative;
}

.trend-bar-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
  min-width: 32px;
  animation: fadeInUp 0.4s ease both;
  animation-delay: var(--delay);
}

.trend-bar-value {
  font-size: 10px;
  font-weight: 700;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.trend-bar-track {
  width: 100%;
  max-width: 28px;
  height: 160px;
  background: var(--bg-subtle);
  border-radius: 6px;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}

.trend-bar-fill {
  width: 100%;
  background: linear-gradient(180deg, #0d9488, #06b6d4);
  border-radius: 6px;
  transition: height 0.8s ease;
  min-height: 2px;
}

.trend-bar-label {
  font-size: 9px;
  color: var(--text-secondary);
  margin-top: 6px;
  white-space: nowrap;
  text-align: center;
  max-width: 48px;
  overflow: hidden;
  text-overflow: ellipsis;
}

// ─── Compare ───
.compare-grid {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 20px;
}

.compare-period,
.compare-changes {
  min-width: 0;
}

.compare-period-title {
  display: flex;
  align-items: center;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 14px;
}

.compare-metrics {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.compare-metric {
  background: var(--bg-subtle);
  border-radius: 10px;
  padding: 10px 12px;
}

.compare-changes {
  border-left: 2px solid var(--card-border);
  border-right: 2px solid var(--card-border);
  padding: 0 20px;
}

// ─── Routes ───
.routes-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.route-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  background: var(--bg-subtle);
  border: 1px solid var(--card-border);
  border-radius: 12px;
  transition: all 0.2s ease;
  animation: fadeInUp 0.4s ease both;
  animation-delay: var(--delay);

  &:hover {
    border-color: rgba(245, 158, 11, 0.2);
    transform: translateY(-1px);
  }
}

.route-rank {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 800;
  flex-shrink: 0;
  background: var(--bg-subtle);
  color: var(--text-secondary);

  &.gold { background: linear-gradient(135deg, rgba(245,158,11,0.2), rgba(251,191,36,0.3)); color: #f59e0b; }
  &.silver { background: rgba(148,163,184,0.15); color: #94a3b8; }
  &.bronze { background: rgba(180,83,9,0.15); color: #b45309; }
}

.route-info {
  flex: 1;
  min-width: 0;
}

.route-lane {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.route-origin,
.route-dest {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.route-meta {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-secondary);

  &.money { color: #0d9488; font-weight: 600; }
}

.route-bar-wrap {
  flex-shrink: 0;
}

// ─── Overview Grid ───
.overview-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;

  .full-width { grid-column: 1 / -1; }
}

// ─── Insights Grid ───
.insights-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
}

.insight-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  transition: background 0.2s;
  margin-bottom: 4px;

  &:hover { background: var(--hover-bg); }
}

.insight-rank {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 800;
  flex-shrink: 0;

  &.r0 { background: linear-gradient(135deg, rgba(245,158,11,0.2), rgba(251,191,36,0.3)); color: #f59e0b; }
  &.r1 { background: rgba(148,163,184,0.15); color: #94a3b8; }
  &.r2 { background: rgba(180,83,9,0.15); color: #b45309; }
  &.r3, &.r4 { background: var(--bg-subtle); color: var(--text-secondary); }
}

.insight-info {
  flex: 1;
  min-width: 0;
}

.insight-id {
  display: block;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
  font-family: monospace;
}

.insight-route {
  display: block;
  font-size: 11px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.insight-stat { text-align: right; flex-shrink: 0; }
.insight-count { display: block; font-size: 15px; font-weight: 800; color: var(--text-primary); }
.insight-money { display: block; font-size: 14px; font-weight: 800; color: #0d9488; }
.insight-period { display: block; font-size: 11px; color: var(--text-secondary); }

// ─── Animation ───
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

// ─── Responsive ───
@media (max-width: 1200px) {
  .stats-grid { grid-template-columns: repeat(3, 1fr); }
  .detail-grid { grid-template-columns: repeat(2, 1fr); }
  .compare-grid { grid-template-columns: 1fr; }
  .compare-changes { border-left: none; border-right: none; border-top: 2px solid var(--card-border); border-bottom: 2px solid var(--card-border); padding: 20px 0; }
}

@media (max-width: 768px) {
  .stats-grid { grid-template-columns: repeat(2, 1fr); gap: 10px; }
  .stat-card { padding: 14px; }
  .stat-value { font-size: 16px; }
  .tab-nav { overflow-x: auto; }
  .tab-btn { padding: 8px 12px; font-size: 12px; }
  .tab-btn span { display: none; }
  .freq-main { flex-wrap: wrap; }
  .freq-left { flex: 1 1 100%; }
  .freq-bars { flex: 1 1 100%; }
  .freq-right { flex: 1 1 auto; flex-direction: row; align-items: center; gap: 12px; }
  .detail-grid { grid-template-columns: 1fr 1fr; }
  .insights-grid { grid-template-columns: 1fr; }
  .overview-grid { grid-template-columns: 1fr; }
}

@media (max-width: 480px) {
  .stats-grid { grid-template-columns: 1fr 1fr; }
  .detail-grid { grid-template-columns: 1fr; }
}
</style>
