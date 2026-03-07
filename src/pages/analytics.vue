<!-- src/pages/analytics.vue -->

<script setup>
import { ref, onMounted, computed } from 'vue'
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

// Filters
const sortFreqBy = ref('monthly')
const searchFreq = ref('')
const activeTab = ref('frequency')
const expandedLoadId = ref(null)

// Computed: Merged frequency data
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
      (d.primary_route?.destination_city || '').toLowerCase().includes(q)
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
    duplicatesWeekly: data.filter(d => d.weekly_count > 1).length,
    duplicatesMonthly: data.filter(d => d.monthly_count > 1).length,
    totalPayout: data.reduce((s, d) => s + Number(d.total_payout || 0), 0),
    avgWeekly: data.length > 0 ? (data.reduce((s, d) => s + d.weekly_count, 0) / data.length).toFixed(1) : '0',
  }
})

const topByFrequency = computed(() => frequencyData.value.slice(0, 5))
const topByPayout = computed(() =>
  [...frequencyData.value].sort((a, b) => Number(b.total_payout) - Number(a.total_payout)).slice(0, 5)
)
const trendingUp = computed(() =>
  frequencyData.value
    .filter(d => d.monthly_count > 0)
    .map(d => ({ ...d, weeklyRate: (d.weekly_count / d.monthly_count) * 4.3 }))
    .filter(d => d.weeklyRate > 1.2)
    .sort((a, b) => b.weeklyRate - a.weeklyRate)
    .slice(0, 5)
)
const trendingDown = computed(() =>
  frequencyData.value
    .filter(d => d.monthly_count > 1 && d.weekly_count === 0)
    .sort((a, b) => b.monthly_count - a.monthly_count)
    .slice(0, 5)
)

// Load stats
const statusBreakdown = computed(() => loadStats.value?.status_breakdown || {})
const financials = computed(() => loadStats.value?.financial || {})

// Fetch
const fetchAll = async () => {
  loading.value = true
  const results = await Promise.allSettled([
    api.get('/admin-api/analytics/overview'),
    api.get('/admin-api/analytics/loads/frequency', { params: { period: '7d', min_count: 1 } }),
    api.get('/admin-api/analytics/loads/frequency', { params: { period: '30d', min_count: 1 } }),
    api.get('/api/loads/stats'),
  ])

  if (results[0].status === 'fulfilled' && results[0].value.data.success)
    analyticsOverview.value = results[0].value.data.data
  if (results[1].status === 'fulfilled' && results[1].value.data.success)
    weeklyFrequency.value = results[1].value.data.data?.loads || []
  if (results[2].status === 'fulfilled' && results[2].value.data.success)
    monthlyFrequency.value = results[2].value.data.data?.loads || []
  if (results[3].status === 'fulfilled' && results[3].value.data.success)
    loadStats.value = results[3].value.data.data

  loading.value = false
}

// Helpers
const formatCurrency = (val) =>
  Number(val || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
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
  return `${origin || '?'} -> ${dest || '?'}`
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

// Overview data formatting helpers
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
  if (isMoney(key) && typeof val === 'number') return formatCurrency(val)
  if (isMoney(key) && typeof val === 'string') return formatCurrency(val)
  if (typeof val === 'number') return val.toLocaleString()
  return String(val)
}

// Flatten nested analytics object to simple key-value pairs for display
const flattenedOverview = computed(() => {
  if (!analyticsOverview.value) return []
  const items = []
  for (const [key, value] of Object.entries(analyticsOverview.value)) {
    if (value && typeof value === 'object') {
      for (const [subKey, subVal] of Object.entries(value)) {
        if (subVal && typeof subVal === 'object') {
          // Third level — flatten further
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
  // Group by section
  const grouped = {}
  items.forEach(item => {
    if (!grouped[item.section]) grouped[item.section] = { section: item.section, items: [] }
    grouped[item.section].items.push(item)
  })
  return Object.values(grouped)
})

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

onMounted(fetchAll)
</script>

<template>
  <div class="analytics-page" :class="{ 'theme-light': !isDark }">
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

    <!-- Loading -->
    <div v-if="loading" class="loading-state">
      <div class="spinner"></div>
      <p>Loading analytics...</p>
    </div>

    <template v-else>
      <!-- Header -->
      <div class="page-header">
        <div class="header-content">
          <div class="header-left">
            <div class="header-icon">
              <VIcon icon="bx-bar-chart-alt-2" size="32" />
            </div>
            <div>
              <h1 class="page-title">Analytics</h1>
              <p class="page-subtitle">Load frequency, trends, and performance insights</p>
            </div>
          </div>
          <VBtn class="refresh-btn" size="large" @click="fetchAll" :loading="loading">
            <VIcon icon="bx-refresh" class="me-2" />
            Refresh
          </VBtn>
        </div>
      </div>

      <!-- Summary Stats Grid -->
      <div class="stats-grid">
        <div class="stat-card stat-1">
          <div class="stat-icon"><VIcon icon="bx-cube" size="28" /></div>
          <div class="stat-content">
            <span class="stat-value">{{ summaryStats.uniqueLoads }}</span>
            <span class="stat-label">Unique Loads</span>
          </div>
          <div class="stat-decoration"></div>
        </div>
        <div class="stat-card stat-2">
          <div class="stat-icon"><VIcon icon="bx-calendar" size="28" /></div>
          <div class="stat-content">
            <span class="stat-value">{{ summaryStats.totalWeekly }}</span>
            <span class="stat-label">This Week</span>
          </div>
          <div class="stat-decoration"></div>
        </div>
        <div class="stat-card stat-3">
          <div class="stat-icon"><VIcon icon="bx-calendar-alt" size="28" /></div>
          <div class="stat-content">
            <span class="stat-value">{{ summaryStats.totalMonthly }}</span>
            <span class="stat-label">This Month</span>
          </div>
          <div class="stat-decoration"></div>
        </div>
        <div class="stat-card stat-4">
          <div class="stat-icon"><VIcon icon="bx-copy" size="28" /></div>
          <div class="stat-content">
            <span class="stat-value">{{ summaryStats.duplicatesMonthly }}</span>
            <span class="stat-label">Repeating Loads</span>
          </div>
          <div class="stat-decoration"></div>
        </div>
        <div class="stat-card stat-5">
          <div class="stat-icon"><VIcon icon="bx-dollar-circle" size="28" /></div>
          <div class="stat-content">
            <span class="stat-value">{{ formatCurrency(summaryStats.totalPayout) }}</span>
            <span class="stat-label">Total Payout</span>
          </div>
          <div class="stat-decoration"></div>
        </div>
        <div class="stat-card stat-6">
          <div class="stat-icon"><VIcon icon="bx-line-chart" size="28" /></div>
          <div class="stat-content">
            <span class="stat-value">{{ summaryStats.avgWeekly }}x</span>
            <span class="stat-label">Avg Freq / Week</span>
          </div>
          <div class="stat-decoration"></div>
        </div>
      </div>

      <!-- Tab Navigation -->
      <div class="tab-nav">
        <button
          v-for="tab in [
            { value: 'frequency', icon: 'bx-bar-chart', label: 'Frequency' },
            { value: 'comparison', icon: 'bx-git-compare', label: 'Compare' },
            { value: 'insights', icon: 'bx-bulb', label: 'Insights' },
            { value: 'overview', icon: 'bx-grid-alt', label: 'Overview' },
          ]"
          :key="tab.value"
          class="tab-btn"
          :class="{ active: activeTab === tab.value }"
          @click="activeTab = tab.value"
        >
          <VIcon :icon="tab.icon" size="20" />
          <span>{{ tab.label }}</span>
        </button>
      </div>

      <!-- Tab: Frequency -->
      <div v-if="activeTab === 'frequency'" class="tab-content">
        <div class="content-card">
          <!-- Filters -->
          <div class="freq-filters">
            <div class="search-wrap">
              <VIcon icon="bx-search" size="20" class="search-icon-abs" />
              <input
                v-model="searchFreq"
                placeholder="Search load ID, city..."
                class="search-input"
              />
              <button v-if="searchFreq" class="clear-search" @click="searchFreq = ''">
                <VIcon icon="bx-x" size="18" />
              </button>
            </div>
            <div class="sort-wrap">
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
                class="sort-select"
              />
            </div>
            <div class="freq-count-badge">
              <VIcon icon="bx-package" size="16" />
              {{ frequencyData.length }} loads
            </div>
          </div>

          <!-- Empty -->
          <div v-if="frequencyData.length === 0" class="empty-state">
            <div class="empty-icon"><VIcon icon="bx-search-alt" size="48" /></div>
            <h3>No Frequency Data</h3>
            <p>No recurring loads found for the current filters.</p>
          </div>

          <!-- Frequency Cards -->
          <div v-else class="freq-cards">
            <div
              v-for="(item, index) in frequencyData"
              :key="item.load_id"
              class="freq-card"
              :class="{ expanded: expandedLoadId === item.load_id }"
              :style="{ '--delay': `${index * 0.03}s` }"
              @click="toggleExpand(item.load_id)"
            >
              <div class="freq-card-main">
                <!-- Left: ID + Route -->
                <div class="freq-left">
                  <span class="freq-load-id">{{ item.load_id }}</span>
                  <span class="freq-route">{{ getRouteDisplay(item.primary_route) }}</span>
                </div>

                <!-- Center: Bars -->
                <div class="freq-bars">
                  <div class="freq-bar-row">
                    <span class="bar-label">W</span>
                    <div class="bar-track">
                      <div class="bar-fill weekly" :style="{ width: getBarWidth(item.weekly_count, maxWeekly) }"></div>
                    </div>
                    <span class="bar-count">{{ item.weekly_count }}x</span>
                  </div>
                  <div class="freq-bar-row">
                    <span class="bar-label">M</span>
                    <div class="bar-track">
                      <div class="bar-fill monthly" :style="{ width: getBarWidth(item.monthly_count, maxMonthly) }"></div>
                    </div>
                    <span class="bar-count">{{ item.monthly_count }}x</span>
                  </div>
                </div>

                <!-- Right: Trend + Payout -->
                <div class="freq-right">
                  <span
                    class="trend-badge"
                    :class="{
                      up: getChangePercent(item) > 10,
                      down: getChangePercent(item) < -10,
                    }"
                  >
                    <VIcon
                      :icon="getChangePercent(item) > 0 ? 'bx-trending-up' : getChangePercent(item) < 0 ? 'bx-trending-down' : 'bx-minus'"
                      size="14"
                    />
                    {{ getChangePercent(item) > 0 ? '+' : '' }}{{ getChangePercent(item) }}%
                  </span>
                  <span class="freq-payout">{{ formatCurrency(item.total_payout) }}</span>
                </div>

                <!-- Expand Arrow -->
                <div class="expand-arrow">
                  <VIcon :icon="expandedLoadId === item.load_id ? 'bx-chevron-up' : 'bx-chevron-down'" size="20" />
                </div>
              </div>

              <!-- Expanded Detail -->
              <div v-if="expandedLoadId === item.load_id" class="freq-card-detail" @click.stop>
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
                    <span class="detail-value">{{ item.monthly_count > 0 ? ((item.weekly_count / item.monthly_count) * 4.3).toFixed(1) : '0' }}x projected</span>
                  </div>
                </div>
                <div v-if="getStatusEntries(item.status_breakdown).length" class="detail-statuses">
                  <span class="detail-label">Status Breakdown</span>
                  <div class="status-pills">
                    <span
                      v-for="[status, count] in getStatusEntries(item.status_breakdown)"
                      :key="status"
                      class="status-pill"
                      :style="{ background: (statusColorMap[status] || '#64748b') + '20', color: statusColorMap[status] || '#64748b' }"
                    >
                      {{ status.replace(/_/g, ' ') }}: {{ count }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Tab: Comparison -->
      <div v-if="activeTab === 'comparison'" class="tab-content">
        <div class="content-card">
          <div class="section-header">
            <div class="section-icon comparison"><VIcon icon="bx-git-compare" size="24" /></div>
            <div>
              <h2>Weekly vs Monthly</h2>
              <p>Side-by-side frequency comparison for each recurring load</p>
            </div>
          </div>

          <!-- Legend -->
          <div class="comparison-legend">
            <div class="legend-item">
              <span class="legend-dot weekly"></span>
              <span>This Week</span>
            </div>
            <div class="legend-item">
              <span class="legend-dot monthly"></span>
              <span>This Month</span>
            </div>
          </div>

          <div v-if="frequencyData.length === 0" class="empty-state small">
            <p>No data to compare</p>
          </div>

          <div v-else class="comparison-list">
            <div
              v-for="(item, index) in frequencyData.slice(0, 25)"
              :key="item.load_id"
              class="comparison-item"
              :style="{ '--delay': `${index * 0.03}s` }"
            >
              <div class="comp-header">
                <span class="comp-id">{{ item.load_id }}</span>
                <span class="comp-route">{{ getRouteDisplay(item.primary_route) }}</span>
                <span
                  class="trend-badge small"
                  :class="{ up: getChangePercent(item) > 10, down: getChangePercent(item) < -10 }"
                >
                  {{ getChangePercent(item) > 0 ? '+' : '' }}{{ getChangePercent(item) }}%
                </span>
              </div>
              <div class="comp-bars">
                <div class="comp-bar-wrap">
                  <div class="comp-bar weekly" :style="{ width: getBarWidth(item.weekly_count, maxWeekly) }">
                    <span v-if="item.weekly_count > 0" class="comp-bar-label">{{ item.weekly_count }}</span>
                  </div>
                </div>
                <div class="comp-bar-wrap">
                  <div class="comp-bar monthly" :style="{ width: getBarWidth(item.monthly_count, maxMonthly) }">
                    <span v-if="item.monthly_count > 0" class="comp-bar-label">{{ item.monthly_count }}</span>
                  </div>
                </div>
              </div>
              <div class="comp-payout">{{ formatCurrency(item.total_payout) }}</div>
            </div>

            <div v-if="frequencyData.length > 25" class="show-more-note">
              Showing top 25 of {{ frequencyData.length }} loads
            </div>
          </div>
        </div>
      </div>

      <!-- Tab: Insights -->
      <div v-if="activeTab === 'insights'" class="tab-content">
        <div class="insights-grid">
          <!-- Most Frequent -->
          <div class="insight-card">
            <div class="insight-header">
              <div class="insight-icon gold"><VIcon icon="bx-trophy" size="24" /></div>
              <h3>Most Frequent</h3>
            </div>
            <div v-if="topByFrequency.length === 0" class="insight-empty">No data yet</div>
            <div v-for="(item, idx) in topByFrequency" :key="item.load_id" class="insight-row">
              <div class="rank" :class="['r' + idx]">{{ idx + 1 }}</div>
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

          <!-- Highest Payout -->
          <div class="insight-card">
            <div class="insight-header">
              <div class="insight-icon green"><VIcon icon="bx-dollar-circle" size="24" /></div>
              <h3>Top Revenue</h3>
            </div>
            <div v-if="topByPayout.length === 0" class="insight-empty">No data yet</div>
            <div v-for="(item, idx) in topByPayout" :key="item.load_id" class="insight-row">
              <div class="rank" :class="['r' + idx]">{{ idx + 1 }}</div>
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
          <div class="insight-card">
            <div class="insight-header">
              <div class="insight-icon emerald"><VIcon icon="bx-trending-up" size="24" /></div>
              <h3>Trending Up</h3>
              <span class="insight-badge up">Increasing</span>
            </div>
            <div v-if="trendingUp.length === 0" class="insight-empty">No trending loads this week</div>
            <div v-for="item in trendingUp" :key="item.load_id" class="insight-row">
              <VIcon icon="bx-up-arrow-alt" size="20" class="trend-arrow up" />
              <div class="insight-info">
                <span class="insight-id">{{ item.load_id }}</span>
                <span class="insight-route">{{ item.weekly_count }}x/week vs {{ item.monthly_count }}x/month</span>
              </div>
              <span class="trend-badge up small">+{{ Math.round((item.weeklyRate - 1) * 100) }}%</span>
            </div>
          </div>

          <!-- Inactive -->
          <div class="insight-card">
            <div class="insight-header">
              <div class="insight-icon red"><VIcon icon="bx-trending-down" size="24" /></div>
              <h3>Inactive This Week</h3>
              <span class="insight-badge down">No activity</span>
            </div>
            <div v-if="trendingDown.length === 0" class="insight-empty">All loads active this week</div>
            <div v-for="item in trendingDown" :key="item.load_id" class="insight-row">
              <VIcon icon="bx-down-arrow-alt" size="20" class="trend-arrow down" />
              <div class="insight-info">
                <span class="insight-id">{{ item.load_id }}</span>
                <span class="insight-route">{{ item.monthly_count }}x this month, 0 this week</span>
              </div>
              <span class="insight-date">{{ formatDate(item.last_seen) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Tab: Overview -->
      <div v-if="activeTab === 'overview'" class="tab-content">
        <div class="overview-grid">
          <!-- Financial Overview -->
          <div class="content-card">
            <div class="section-header">
              <div class="section-icon finance"><VIcon icon="bx-wallet" size="24" /></div>
              <div>
                <h2>Financial Overview</h2>
                <p>Revenue and cost metrics</p>
              </div>
            </div>
            <div class="overview-metrics">
              <div class="metric-card">
                <span class="metric-label">Total Revenue</span>
                <span class="metric-value large green">{{ formatCurrency(financials.total_payout) }}</span>
              </div>
              <div class="metric-card">
                <span class="metric-label">Average Payout</span>
                <span class="metric-value">{{ formatCurrency(financials.avg_payout) }}</span>
              </div>
              <div class="metric-card">
                <span class="metric-label">Total Miles</span>
                <span class="metric-value">{{ Number(financials.total_miles || 0).toLocaleString() }} mi</span>
              </div>
              <div class="metric-card">
                <span class="metric-label">Avg Miles / Load</span>
                <span class="metric-value">{{ Number(financials.avg_miles || 0).toLocaleString() }} mi</span>
              </div>
            </div>
          </div>

          <!-- Status Distribution -->
          <div class="content-card">
            <div class="section-header">
              <div class="section-icon status"><VIcon icon="bx-pie-chart-alt-2" size="24" /></div>
              <div>
                <h2>Status Distribution</h2>
                <p>Current load status breakdown</p>
              </div>
            </div>
            <div class="status-distribution">
              <div
                v-for="(label, status) in { available: 'Available', booked: 'Booked', in_transit: 'In Transit', delivered: 'Delivered', cancelled: 'Cancelled' }"
                :key="status"
                class="status-row"
              >
                <div class="status-row-left">
                  <span class="status-dot" :style="{ background: statusColorMap[status] }"></span>
                  <span class="status-name">{{ label }}</span>
                </div>
                <div class="status-row-right">
                  <span class="status-count">{{ statusBreakdown[status] || 0 }}</span>
                  <div class="status-bar-track">
                    <div
                      class="status-bar-fill"
                      :style="{
                        width: getBarWidth(statusBreakdown[status] || 0, loadStats?.total_loads || 1),
                        background: statusColorMap[status],
                      }"
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Analytics Summary Data -->
          <template v-if="flattenedOverview.length">
            <div
              v-for="group in flattenedOverview"
              :key="group.section"
              class="content-card"
              :class="{ 'full-width': group.items.length > 4 }"
            >
              <div class="section-header">
                <div class="section-icon data"><VIcon :icon="getOverviewIcon(group.section.toLowerCase())" size="24" /></div>
                <div>
                  <h2>{{ group.section }}</h2>
                  <p>{{ group.items.length }} metrics</p>
                </div>
              </div>
              <div class="overview-metrics">
                <div
                  v-for="item in group.items"
                  :key="item.label"
                  class="metric-card"
                >
                  <span class="metric-label">{{ item.label }}</span>
                  <span
                    class="metric-value"
                    :class="{ green: isMoney(item.key), teal: isPercent(item.key, item.value) }"
                  >
                    {{ formatOverviewValue(item.key, item.value) }}
                  </span>
                </div>
              </div>
            </div>
          </template>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* Theme Variables */
.analytics-page {
  --primary: #0d9488;
  --primary-light: #2dd4bf;
  --card-bg: rgba(30, 30, 46, 0.7);
  --card-bg-subtle: rgba(255, 255, 255, 0.03);
  --card-border: rgba(255, 255, 255, 0.08);
  --card-border-hover: rgba(255, 255, 255, 0.15);
  --surface-bg: rgba(30, 30, 46, 0.5);
  --input-bg: rgba(255, 255, 255, 0.05);
  --hover-bg: rgba(255, 255, 255, 0.05);
  --text-heading: #f8fafc;
  --text-body: #e2e8f0;
  --text-secondary: #94a3b8;
  --text-muted: #64748b;
  --border-line: rgba(255, 255, 255, 0.06);
  --grad-base-start: #0f0f1a;
  --grad-base-end: #1a1a2e;
  --grid-line: rgba(255, 255, 255, 0.02);
  --shape-opacity: 0.4;
}
.analytics-page.theme-light {
  --card-bg: rgba(255, 255, 255, 0.9);
  --card-bg-subtle: rgba(0, 0, 0, 0.02);
  --card-border: rgba(0, 0, 0, 0.08);
  --card-border-hover: rgba(0, 0, 0, 0.14);
  --surface-bg: rgba(255, 255, 255, 0.8);
  --input-bg: rgba(0, 0, 0, 0.03);
  --hover-bg: rgba(0, 0, 0, 0.04);
  --text-heading: #1e293b;
  --text-body: #334155;
  --text-secondary: #64748b;
  --text-muted: #94a3b8;
  --border-line: rgba(0, 0, 0, 0.06);
  --grad-base-start: #f8f9fe;
  --grad-base-end: #f1f3f9;
  --grid-line: rgba(0, 0, 0, 0.03);
  --shape-opacity: 0.12;
}

.analytics-page { position: relative; min-height: 100vh; padding: 24px; overflow-x: hidden; }

/* Background */
.page-bg { position: fixed; inset: 0; z-index: -1; overflow: hidden; }
.bg-gradient { position: absolute; inset: 0; background: radial-gradient(ellipse at 0% 0%, rgba(13,148,136,0.15) 0%, transparent 50%), radial-gradient(ellipse at 100% 0%, rgba(6,182,212,0.1) 0%, transparent 50%), radial-gradient(ellipse at 50% 100%, rgba(16,185,129,0.08) 0%, transparent 50%), linear-gradient(180deg, var(--grad-base-start) 0%, var(--grad-base-end) 100%); }
.bg-grid { position: absolute; inset: 0; background-image: linear-gradient(var(--grid-line) 1px, transparent 1px), linear-gradient(90deg, var(--grid-line) 1px, transparent 1px); background-size: 60px 60px; mask-image: radial-gradient(ellipse at center, black 30%, transparent 70%); }
.floating-shapes { position: absolute; inset: 0; overflow: hidden; }
.shape { position: absolute; border-radius: 50%; filter: blur(100px); opacity: var(--shape-opacity); animation: drift 20s ease-in-out infinite; }
.shape-1 { width: 500px; height: 500px; background: linear-gradient(135deg, #0d9488, #06b6d4); top: -150px; right: -150px; }
.shape-2 { width: 400px; height: 400px; background: linear-gradient(135deg, #10b981, #34d399); bottom: -100px; left: -100px; animation-delay: -7s; }
.shape-3 { width: 250px; height: 250px; background: linear-gradient(135deg, #8b5cf6, #6366f1); top: 40%; left: 40%; animation-delay: -14s; }
@keyframes drift { 0%, 100% { transform: translate(0, 0) scale(1); } 33% { transform: translate(25px, -25px) scale(1.04); } 66% { transform: translate(-15px, 15px) scale(0.96); } }

/* Loading */
.loading-state { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 60vh; color: var(--text-secondary); }
.spinner { width: 48px; height: 48px; border: 3px solid rgba(13,148,136,0.2); border-top-color: #0d9488; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 16px; }
@keyframes spin { to { transform: rotate(360deg); } }

/* Header */
.page-header { margin-bottom: 32px; }
.header-content { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 20px; }
.header-left { display: flex; align-items: center; gap: 16px; }
.header-icon { display: flex; align-items: center; justify-content: center; width: 56px; height: 56px; background: linear-gradient(135deg, #0d9488, #06b6d4); border-radius: 16px; color: white; box-shadow: 0 8px 32px rgba(13,148,136,0.3); }
.page-title { font-size: 32px; font-weight: 700; color: var(--text-heading); margin: 0; letter-spacing: -0.5px; }
.page-subtitle { font-size: 15px; color: var(--text-secondary); margin: 4px 0 0; }
.refresh-btn { background: linear-gradient(135deg, #0d9488, #06b6d4) !important; color: white !important; font-weight: 600; padding: 0 28px !important; height: 48px !important; border-radius: 14px !important; box-shadow: 0 8px 32px rgba(13,148,136,0.3); transition: all 0.3s ease; }
.refresh-btn:hover { transform: translateY(-2px); }

/* Stats Grid */
.stats-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 16px; margin-bottom: 28px; }
.stat-card { position: relative; background: var(--card-bg); backdrop-filter: blur(20px); border: 1px solid var(--card-border); border-radius: 18px; padding: 20px; display: flex; align-items: center; gap: 14px; overflow: hidden; transition: all 0.3s ease; }
.stat-card:hover { transform: translateY(-3px); border-color: var(--card-border-hover); }
.stat-icon { display: flex; align-items: center; justify-content: center; width: 48px; height: 48px; border-radius: 12px; flex-shrink: 0; }
.stat-1 .stat-icon { background: linear-gradient(135deg, rgba(59,130,246,0.2), rgba(99,102,241,0.2)); color: #60a5fa; }
.stat-2 .stat-icon { background: linear-gradient(135deg, rgba(16,185,129,0.2), rgba(52,211,153,0.2)); color: #34d399; }
.stat-3 .stat-icon { background: linear-gradient(135deg, rgba(139,92,246,0.2), rgba(167,139,250,0.2)); color: #a78bfa; }
.stat-4 .stat-icon { background: linear-gradient(135deg, rgba(245,158,11,0.2), rgba(251,191,36,0.2)); color: #fbbf24; }
.stat-5 .stat-icon { background: linear-gradient(135deg, rgba(16,185,129,0.2), rgba(6,182,212,0.2)); color: #2dd4bf; }
.stat-6 .stat-icon { background: linear-gradient(135deg, rgba(236,72,153,0.2), rgba(244,114,182,0.2)); color: #f472b6; }
.stat-content { display: flex; flex-direction: column; min-width: 0; }
.stat-value { font-size: 22px; font-weight: 700; color: var(--text-heading); line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.stat-label { font-size: 12px; color: var(--text-secondary); margin-top: 3px; }
.stat-decoration { position: absolute; right: -25px; bottom: -25px; width: 80px; height: 80px; border-radius: 50%; opacity: 0.06; }
.stat-1 .stat-decoration { background: #3b82f6; }
.stat-2 .stat-decoration { background: #10b981; }
.stat-3 .stat-decoration { background: #8b5cf6; }
.stat-4 .stat-decoration { background: #f59e0b; }
.stat-5 .stat-decoration { background: #0d9488; }
.stat-6 .stat-decoration { background: #ec4899; }

/* Tab Nav */
.tab-nav { display: flex; gap: 8px; margin-bottom: 24px; background: var(--card-bg); backdrop-filter: blur(20px); border: 1px solid var(--card-border); border-radius: 16px; padding: 6px; }
.tab-btn { display: flex; align-items: center; gap: 8px; padding: 12px 20px; border-radius: 12px; border: none; background: transparent; color: var(--text-secondary); font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.25s ease; flex: 1; justify-content: center; }
.tab-btn:hover { background: var(--hover-bg); color: var(--text-heading); }
.tab-btn.active { background: linear-gradient(135deg, #0d9488, #06b6d4); color: white; box-shadow: 0 4px 15px rgba(13,148,136,0.3); }

/* Content Card */
.content-card { background: var(--card-bg); backdrop-filter: blur(20px); border: 1px solid var(--card-border); border-radius: 20px; padding: 24px; }
.section-header { display: flex; align-items: flex-start; gap: 14px; margin-bottom: 24px; }
.section-icon { width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; border-radius: 12px; flex-shrink: 0; }
.section-icon.comparison { background: linear-gradient(135deg, rgba(139,92,246,0.2), rgba(99,102,241,0.2)); color: #a78bfa; }
.section-icon.finance { background: linear-gradient(135deg, rgba(16,185,129,0.2), rgba(6,182,212,0.2)); color: #2dd4bf; }
.section-icon.status { background: linear-gradient(135deg, rgba(245,158,11,0.2), rgba(251,191,36,0.2)); color: #fbbf24; }
.section-icon.data { background: linear-gradient(135deg, rgba(59,130,246,0.2), rgba(99,102,241,0.2)); color: #60a5fa; }
.section-header h2 { font-size: 18px; font-weight: 700; color: var(--text-heading); margin: 0; }
.section-header p { font-size: 13px; color: var(--text-secondary); margin: 2px 0 0; }

/* Frequency Filters */
.freq-filters { display: flex; gap: 12px; align-items: center; margin-bottom: 20px; flex-wrap: wrap; }
.search-wrap { position: relative; flex: 1; min-width: 220px; }
.search-icon-abs { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: var(--text-muted); pointer-events: none; }
.search-input { width: 100%; padding: 10px 36px 10px 42px; background: var(--input-bg); border: 1px solid var(--card-border); border-radius: 12px; color: var(--text-body); font-size: 14px; outline: none; transition: border-color 0.2s; }
.search-input:focus { border-color: #0d9488; }
.search-input::placeholder { color: var(--text-muted); }
.clear-search { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 4px; display: flex; }
.sort-wrap { width: 180px; }
.sort-select :deep(.v-field) { background: var(--input-bg); border-radius: 12px; }
.freq-count-badge { display: flex; align-items: center; gap: 6px; padding: 8px 16px; background: rgba(13,148,136,0.12); color: var(--primary-light); border-radius: 20px; font-size: 13px; font-weight: 600; white-space: nowrap; }

/* Empty */
.empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 20px; text-align: center; }
.empty-state.small { padding: 40px; }
.empty-icon { width: 80px; height: 80px; display: flex; align-items: center; justify-content: center; background: rgba(13,148,136,0.1); border-radius: 20px; color: var(--primary-light); margin-bottom: 16px; }
.empty-state h3 { font-size: 20px; font-weight: 600; color: var(--text-heading); margin: 0 0 8px; }
.empty-state p { color: var(--text-secondary); margin: 0; }

/* Frequency Cards */
.freq-cards { display: flex; flex-direction: column; gap: 8px; }
.freq-card { background: var(--card-bg-subtle); border: 1px solid var(--card-border); border-radius: 14px; cursor: pointer; transition: all 0.3s ease; animation: fadeSlide 0.4s ease forwards; animation-delay: var(--delay); opacity: 0; }
@keyframes fadeSlide { to { opacity: 1; transform: translateY(0); } }
.freq-card { transform: translateY(10px); }
.freq-card:hover { border-color: rgba(13,148,136,0.3); transform: translateY(-1px); }
.freq-card.expanded { border-color: rgba(13,148,136,0.4); background: var(--hover-bg); }
.freq-card-main { display: flex; align-items: center; gap: 16px; padding: 16px 20px; }
.freq-left { flex: 0 0 200px; min-width: 0; }
.freq-load-id { display: block; font-size: 15px; font-weight: 700; color: var(--text-heading); font-family: monospace; letter-spacing: 0.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.freq-route { display: block; font-size: 12px; color: var(--text-muted); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.freq-bars { flex: 1; min-width: 120px; }
.freq-bar-row { display: flex; align-items: center; gap: 8px; }
.freq-bar-row + .freq-bar-row { margin-top: 4px; }
.bar-label { font-size: 11px; font-weight: 700; color: var(--text-muted); width: 14px; text-align: center; }
.bar-track { flex: 1; height: 8px; border-radius: 4px; background: rgba(var(--v-border-color), 0.08); overflow: hidden; }
.bar-fill { height: 100%; border-radius: 4px; transition: width 0.8s ease; }
.bar-fill.weekly { background: linear-gradient(90deg, #10b981, #34d399); }
.bar-fill.monthly { background: linear-gradient(90deg, #8b5cf6, #a78bfa); }
.bar-count { font-size: 13px; font-weight: 700; color: var(--text-body); min-width: 32px; text-align: right; }
.freq-right { flex: 0 0 140px; display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
.freq-payout { font-size: 14px; font-weight: 700; color: #2dd4bf; }
.expand-arrow { flex: 0 0 24px; color: var(--text-muted); transition: color 0.2s; }
.freq-card:hover .expand-arrow { color: var(--text-body); }

/* Trend Badge */
.trend-badge { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 700; padding: 3px 10px; border-radius: 8px; background: rgba(100,116,139,0.12); color: var(--text-secondary); }
.trend-badge.up { background: rgba(16,185,129,0.12); color: #34d399; }
.trend-badge.down { background: rgba(239,68,68,0.12); color: #f87171; }
.trend-badge.small { font-size: 11px; padding: 2px 8px; }

/* Expanded Detail */
.freq-card-detail { padding: 0 20px 20px; border-top: 1px solid var(--border-line); margin-top: 0; padding-top: 16px; animation: expandIn 0.3s ease; }
@keyframes expandIn { from { opacity: 0; max-height: 0; } to { opacity: 1; max-height: 300px; } }
.detail-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.detail-item { background: var(--input-bg); border-radius: 10px; padding: 12px; }
.detail-label { display: block; font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 4px; }
.detail-value { font-size: 15px; font-weight: 700; color: var(--text-heading); }
.detail-value.money { color: #2dd4bf; }
.detail-statuses { margin-top: 12px; }
.status-pills { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
.status-pill { font-size: 12px; font-weight: 600; padding: 4px 12px; border-radius: 8px; text-transform: capitalize; }

/* Comparison */
.comparison-legend { display: flex; gap: 20px; margin-bottom: 20px; }
.legend-item { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-secondary); font-weight: 600; }
.legend-dot { width: 12px; height: 12px; border-radius: 3px; }
.legend-dot.weekly { background: linear-gradient(135deg, #10b981, #34d399); }
.legend-dot.monthly { background: linear-gradient(135deg, #8b5cf6, #a78bfa); }
.comparison-list { display: flex; flex-direction: column; gap: 12px; }
.comparison-item { background: var(--card-bg-subtle); border: 1px solid var(--card-border); border-radius: 14px; padding: 16px 20px; transition: all 0.2s ease; animation: fadeSlide 0.4s ease forwards; animation-delay: var(--delay); opacity: 0; transform: translateY(10px); }
.comparison-item:hover { border-color: var(--card-border-hover); }
.comp-header { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; }
.comp-id { font-size: 14px; font-weight: 700; color: var(--text-heading); font-family: monospace; }
.comp-route { font-size: 12px; color: var(--text-muted); flex: 1; }
.comp-bars { display: flex; flex-direction: column; gap: 4px; margin-bottom: 6px; }
.comp-bar-wrap { height: 14px; border-radius: 7px; background: rgba(var(--v-border-color), 0.06); overflow: hidden; }
.comp-bar { height: 100%; border-radius: 7px; transition: width 0.8s ease; display: flex; align-items: center; justify-content: flex-end; padding-right: 8px; min-width: fit-content; }
.comp-bar.weekly { background: linear-gradient(90deg, #10b981, #34d399); }
.comp-bar.monthly { background: linear-gradient(90deg, #8b5cf6, #a78bfa); }
.comp-bar-label { font-size: 10px; font-weight: 700; color: white; }
.comp-payout { font-size: 13px; font-weight: 700; color: #2dd4bf; text-align: right; }
.show-more-note { text-align: center; padding: 16px; font-size: 13px; color: var(--text-muted); }

/* Insights Grid */
.insights-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; }
.insight-card { background: var(--card-bg); backdrop-filter: blur(20px); border: 1px solid var(--card-border); border-radius: 20px; padding: 24px; transition: all 0.3s ease; }
.insight-card:hover { border-color: var(--card-border-hover); }
.insight-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.insight-icon { width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; border-radius: 10px; flex-shrink: 0; }
.insight-icon.gold { background: linear-gradient(135deg, rgba(245,158,11,0.2), rgba(251,191,36,0.2)); color: #fbbf24; }
.insight-icon.green { background: linear-gradient(135deg, rgba(16,185,129,0.2), rgba(52,211,153,0.2)); color: #34d399; }
.insight-icon.emerald { background: linear-gradient(135deg, rgba(16,185,129,0.2), rgba(6,182,212,0.2)); color: #2dd4bf; }
.insight-icon.red { background: linear-gradient(135deg, rgba(239,68,68,0.2), rgba(248,113,113,0.2)); color: #f87171; }
.insight-header h3 { font-size: 16px; font-weight: 700; color: var(--text-heading); margin: 0; flex: 1; }
.insight-badge { font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 6px; }
.insight-badge.up { background: rgba(16,185,129,0.12); color: #34d399; }
.insight-badge.down { background: rgba(239,68,68,0.12); color: #f87171; }
.insight-empty { padding: 24px; text-align: center; color: var(--text-muted); font-size: 14px; }
.insight-row { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 10px; transition: background 0.2s; margin-bottom: 4px; }
.insight-row:hover { background: var(--hover-bg); }
.rank { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 800; flex-shrink: 0; }
.rank.r0 { background: linear-gradient(135deg, rgba(245,158,11,0.2), rgba(251,191,36,0.3)); color: #fbbf24; }
.rank.r1 { background: rgba(148,163,184,0.15); color: #94a3b8; }
.rank.r2 { background: rgba(180,83,9,0.15); color: #b45309; }
.rank.r3, .rank.r4 { background: rgba(var(--v-border-color), 0.08); color: var(--text-muted); }
.insight-info { flex: 1; min-width: 0; }
.insight-id { display: block; font-size: 14px; font-weight: 700; color: var(--text-heading); font-family: monospace; }
.insight-route { display: block; font-size: 12px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.insight-stat { text-align: right; flex-shrink: 0; }
.insight-count { display: block; font-size: 16px; font-weight: 800; color: var(--text-heading); }
.insight-money { display: block; font-size: 15px; font-weight: 800; color: #2dd4bf; }
.insight-period { display: block; font-size: 11px; color: var(--text-muted); }
.insight-date { font-size: 12px; color: var(--text-muted); white-space: nowrap; }
.trend-arrow { flex-shrink: 0; }
.trend-arrow.up { color: #34d399; }
.trend-arrow.down { color: #f87171; }

/* Overview Grid */
.overview-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; }
.overview-grid .full-width { grid-column: 1 / -1; }
.overview-metrics { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
.metric-card { background: var(--input-bg); border-radius: 12px; padding: 16px; }
.metric-label { display: block; font-size: 12px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 6px; }
.metric-value { font-size: 20px; font-weight: 800; color: var(--text-heading); }
.metric-value.large { font-size: 26px; }
.metric-value.green { color: #2dd4bf; }
.metric-value.teal { color: #0d9488; }

/* Status Distribution */
.status-distribution { display: flex; flex-direction: column; gap: 14px; }
.status-row { display: flex; align-items: center; gap: 12px; }
.status-row-left { display: flex; align-items: center; gap: 8px; flex: 0 0 120px; }
.status-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.status-name { font-size: 13px; font-weight: 600; color: var(--text-body); }
.status-row-right { display: flex; align-items: center; gap: 10px; flex: 1; }
.status-count { font-size: 14px; font-weight: 700; color: var(--text-heading); min-width: 30px; }
.status-bar-track { flex: 1; height: 8px; border-radius: 4px; background: rgba(var(--v-border-color), 0.08); overflow: hidden; }
.status-bar-fill { height: 100%; border-radius: 4px; transition: width 0.8s ease; }


/* Responsive */
@media (max-width: 1200px) {
  .stats-grid { grid-template-columns: repeat(3, 1fr); }
  .detail-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 768px) {
  .analytics-page { padding: 16px; }
  .page-title { font-size: 24px; }
  .header-content { flex-direction: column; align-items: flex-start; }
  .refresh-btn { width: 100%; }
  .stats-grid { grid-template-columns: repeat(2, 1fr); gap: 10px; }
  .stat-card { padding: 14px; }
  .stat-value { font-size: 18px; }
  .tab-nav { flex-wrap: wrap; }
  .tab-btn { padding: 10px 14px; font-size: 13px; }
  .tab-btn span { display: none; }
  .freq-card-main { flex-wrap: wrap; }
  .freq-left { flex: 1 1 100%; }
  .freq-bars { flex: 1 1 100%; }
  .freq-right { flex: 1 1 auto; flex-direction: row; align-items: center; gap: 12px; }
  .detail-grid { grid-template-columns: 1fr 1fr; }
  .insights-grid { grid-template-columns: 1fr; }
  .overview-grid { grid-template-columns: 1fr; }
  .comparison-legend { flex-wrap: wrap; }
}
@media (max-width: 480px) {
  .stats-grid { grid-template-columns: 1fr 1fr; }
  .detail-grid { grid-template-columns: 1fr; }
}
</style>
