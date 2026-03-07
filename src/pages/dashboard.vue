<!-- src/pages/dashboard.vue -->

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useTheme } from 'vuetify'
import { useAuthStore } from '@/stores/auth'
import api from '@/services/api'

const authStore = useAuthStore()
const vuetifyTheme = useTheme()
const isDark = computed(() => vuetifyTheme.global.current.value.dark)
const user = computed(() => authStore.user)

// Data
const loading = ref(true)
const loadStats = ref(null)
const userStats = ref(null)
const facilityStats = ref(null)
const analyticsOverview = ref(null)
const recentLoads = ref([])

// Greeting
const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good Morning'
  if (hour < 17) return 'Good Afternoon'
  return 'Good Evening'
})

// Computed stats
const totalRevenue = computed(() => {
  const val = loadStats.value?.financial?.total_payout || 0
  return Number(val).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
})

const avgPayout = computed(() => {
  const val = loadStats.value?.financial?.avg_payout || 0
  return Number(val).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
})

const totalMiles = computed(() => {
  const val = loadStats.value?.financial?.total_miles || 0
  return Number(val).toLocaleString()
})

const statusBreakdown = computed(() => loadStats.value?.status_breakdown || {})

const statusItems = computed(() => {
  const sb = statusBreakdown.value
  return [
    { label: 'Available', value: sb.available || 0, color: '#10b981', icon: 'bx-package' },
    { label: 'Booked', value: sb.booked || 0, color: '#3b82f6', icon: 'bx-calendar-check' },
    { label: 'In Transit', value: sb.in_transit || 0, color: '#f59e0b', icon: 'bx-car' },
    { label: 'Delivered', value: sb.delivered || 0, color: '#8b5cf6', icon: 'bx-check-circle' },
    { label: 'Cancelled', value: sb.cancelled || 0, color: '#ef4444', icon: 'bx-x-circle' },
  ]
})

const totalStatusLoads = computed(() => statusItems.value.reduce((sum, item) => sum + item.value, 0) || 1)

// Fetch data
const fetchAll = async () => {
  loading.value = true
  const results = await Promise.allSettled([
    api.get('/api/loads/stats'),
    api.get('/admin-api/users/stats'),
    api.get('/admin-api/facilities/stats'),
    api.get('/admin-api/analytics/overview'),
    api.get('/api/loads?per_page=5&sort_by=-created_at'),
  ])

  if (results[0].status === 'fulfilled' && results[0].value.data.success) {
    loadStats.value = results[0].value.data.data
  }
  if (results[1].status === 'fulfilled' && results[1].value.data.success) {
    userStats.value = results[1].value.data.data
  }
  if (results[2].status === 'fulfilled' && results[2].value.data.success) {
    facilityStats.value = results[2].value.data.data
  }
  if (results[3].status === 'fulfilled' && results[3].value.data.success) {
    analyticsOverview.value = results[3].value.data.data
  }
  if (results[4].status === 'fulfilled' && results[4].value.data.success) {
    recentLoads.value = results[4].value.data.data?.loads || []
  }

  loading.value = false
}

const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const formatCurrency = (val) => {
  return Number(val || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

const statusColor = (status) => {
  const map = { available: '#10b981', booked: '#3b82f6', in_transit: '#f59e0b', delivered: '#8b5cf6', cancelled: '#ef4444' }
  return map[status] || '#64748b'
}

const statusLabel = (status) => {
  const map = { available: 'Available', booked: 'Booked', in_transit: 'In Transit', delivered: 'Delivered', cancelled: 'Cancelled' }
  return map[status] || status
}

// Flatten analytics overview for snapshot display
const analyticsSnapshotItems = computed(() => {
  if (!analyticsOverview.value) return []
  const items = []
  for (const [key, value] of Object.entries(analyticsOverview.value)) {
    if (value && typeof value === 'object') {
      for (const [subKey, subVal] of Object.entries(value)) {
        if (subVal !== null && subVal !== undefined && typeof subVal !== 'object') {
          items.push({
            label: formatKeyLabel(key) + ' — ' + formatKeyLabel(subKey),
            value: formatSnapshotValue(subKey, subVal),
            icon: getSnapshotIcon(key),
            color: getSnapshotColor(key),
          })
        }
      }
    } else if (value !== null && value !== undefined) {
      items.push({
        label: formatKeyLabel(key),
        value: formatSnapshotValue(key, value),
        icon: getSnapshotIcon(key),
        color: getSnapshotColor(key),
      })
    }
  }
  return items.slice(0, 8)
})

const formatKeyLabel = (key) => key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

const formatSnapshotValue = (key, val) => {
  if (typeof val === 'string' && val.includes('%')) return val
  if (/payout|revenue|cost|amount|earning/i.test(key)) return formatCurrency(val)
  if (typeof val === 'number') return val.toLocaleString()
  return String(val)
}

const getSnapshotIcon = (key) => {
  const k = key.toLowerCase()
  if (k.includes('week')) return 'bx-calendar-week'
  if (k.includes('month')) return 'bx-calendar'
  if (k.includes('duplicate')) return 'bx-copy-alt'
  if (k.includes('revenue') || k.includes('payout')) return 'bx-wallet'
  if (k.includes('load')) return 'bx-package'
  return 'bx-bar-chart'
}

const getSnapshotColor = (key) => {
  const k = key.toLowerCase()
  if (k.includes('week')) return '#3b82f6'
  if (k.includes('month')) return '#8b5cf6'
  if (k.includes('duplicate')) return '#f59e0b'
  if (k.includes('revenue') || k.includes('payout')) return '#10b981'
  return '#6366f1'
}

onMounted(fetchAll)
</script>

<template>
  <div class="dashboard-page">
    <!-- Loading -->
    <div v-if="loading" class="d-flex justify-center align-center" style="min-height: 400px;">
      <VProgressCircular indeterminate size="48" color="primary" />
    </div>

    <template v-else>
      <!-- Welcome Banner -->
      <VCard class="welcome-card mb-6" :class="{ 'dark': isDark }">
        <div class="welcome-bg">
          <div class="welcome-shape shape-1" />
          <div class="welcome-shape shape-2" />
          <div class="welcome-shape shape-3" />
        </div>
        <VCardText class="welcome-content pa-6">
          <VRow align="center">
            <VCol cols="12" md="8">
              <h4 class="text-h4 font-weight-bold mb-1" style="color: white;">
                {{ greeting }}, {{ user?.first_name || 'User' }}!
              </h4>
              <p class="text-body-1 mb-0" style="color: rgba(255,255,255,0.85);">
                Here's what's happening with your operations today.
              </p>
            </VCol>
            <VCol cols="12" md="4" class="text-md-end">
              <VChip color="white" variant="flat" size="small" class="font-weight-medium">
                <VIcon icon="bx-calendar" size="16" class="me-1" />
                {{ new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) }}
              </VChip>
            </VCol>
          </VRow>
        </VCardText>
      </VCard>

      <!-- Quick Stats -->
      <VRow class="mb-2">
        <!-- Total Loads -->
        <VCol cols="12" sm="6" md="3">
          <VCard class="stat-card" :class="{ 'dark': isDark }">
            <VCardText class="pa-5">
              <div class="d-flex align-center justify-space-between mb-3">
                <div class="stat-icon-wrap" style="background: rgba(59, 130, 246, 0.12);">
                  <VIcon icon="bx-package" size="24" color="#3b82f6" />
                </div>
                <VChip
                  v-if="loadStats?.new_last_7d"
                  size="x-small"
                  variant="tonal"
                  color="success"
                  class="font-weight-bold"
                >
                  +{{ loadStats.new_last_7d }} this week
                </VChip>
              </div>
              <h3 class="text-h4 font-weight-bold mb-1">{{ loadStats?.total_loads || 0 }}</h3>
              <span class="text-body-2 text-medium-emphasis">Total Loads</span>
            </VCardText>
          </VCard>
        </VCol>

        <!-- Total Revenue -->
        <VCol cols="12" sm="6" md="3">
          <VCard class="stat-card" :class="{ 'dark': isDark }">
            <VCardText class="pa-5">
              <div class="d-flex align-center justify-space-between mb-3">
                <div class="stat-icon-wrap" style="background: rgba(16, 185, 129, 0.12);">
                  <VIcon icon="bx-dollar-circle" size="24" color="#10b981" />
                </div>
              </div>
              <h3 class="text-h4 font-weight-bold mb-1">{{ totalRevenue }}</h3>
              <span class="text-body-2 text-medium-emphasis">Total Revenue</span>
            </VCardText>
          </VCard>
        </VCol>

        <!-- Total Users -->
        <VCol cols="12" sm="6" md="3">
          <VCard class="stat-card" :class="{ 'dark': isDark }">
            <VCardText class="pa-5">
              <div class="d-flex align-center justify-space-between mb-3">
                <div class="stat-icon-wrap" style="background: rgba(139, 92, 246, 0.12);">
                  <VIcon icon="bx-group" size="24" color="#8b5cf6" />
                </div>
              </div>
              <h3 class="text-h4 font-weight-bold mb-1">{{ userStats?.total_users || 0 }}</h3>
              <span class="text-body-2 text-medium-emphasis">Total Users</span>
            </VCardText>
          </VCard>
        </VCol>

        <!-- Total Facilities -->
        <VCol cols="12" sm="6" md="3">
          <VCard class="stat-card" :class="{ 'dark': isDark }">
            <VCardText class="pa-5">
              <div class="d-flex align-center justify-space-between mb-3">
                <div class="stat-icon-wrap" style="background: rgba(245, 158, 11, 0.12);">
                  <VIcon icon="bx-buildings" size="24" color="#f59e0b" />
                </div>
              </div>
              <h3 class="text-h4 font-weight-bold mb-1">{{ facilityStats?.total_facilities || 0 }}</h3>
              <span class="text-body-2 text-medium-emphasis">Facilities</span>
            </VCardText>
          </VCard>
        </VCol>
      </VRow>

      <!-- Main Content Row -->
      <VRow>
        <!-- Load Status Breakdown -->
        <VCol cols="12" md="8">
          <VCard class="content-card" :class="{ 'dark': isDark }">
            <VCardText class="pa-5">
              <div class="d-flex align-center justify-space-between mb-5">
                <div>
                  <h6 class="text-h6 font-weight-bold">Load Status Overview</h6>
                  <span class="text-body-2 text-medium-emphasis">Current distribution of all loads</span>
                </div>
                <VBtn
                  variant="tonal"
                  color="primary"
                  size="small"
                  to="/loads"
                >
                  View All
                  <VIcon icon="bx-right-arrow-alt" size="18" class="ms-1" />
                </VBtn>
              </div>

              <!-- Status Bars -->
              <div class="status-bars">
                <div
                  v-for="item in statusItems"
                  :key="item.label"
                  class="status-bar-item mb-4"
                >
                  <div class="d-flex align-center justify-space-between mb-2">
                    <div class="d-flex align-center gap-2">
                      <div class="status-dot" :style="{ background: item.color }" />
                      <span class="text-body-2 font-weight-medium">{{ item.label }}</span>
                    </div>
                    <div class="d-flex align-center gap-2">
                      <span class="text-body-2 font-weight-bold">{{ item.value }}</span>
                      <span class="text-caption text-medium-emphasis">
                        ({{ Math.round((item.value / totalStatusLoads) * 100) }}%)
                      </span>
                    </div>
                  </div>
                  <div class="status-bar-track">
                    <div
                      class="status-bar-fill"
                      :style="{
                        width: Math.max((item.value / totalStatusLoads) * 100, item.value > 0 ? 2 : 0) + '%',
                        background: item.color,
                      }"
                    />
                  </div>
                </div>
              </div>
            </VCardText>
          </VCard>
        </VCol>

        <!-- Financial Summary -->
        <VCol cols="12" md="4">
          <VCard class="content-card mb-4" :class="{ 'dark': isDark }">
            <VCardText class="pa-5">
              <h6 class="text-h6 font-weight-bold mb-4">Financial Summary</h6>

              <div class="finance-item mb-4">
                <div class="d-flex align-center gap-3 mb-1">
                  <div class="finance-icon" style="background: rgba(16, 185, 129, 0.12); color: #10b981;">
                    <VIcon icon="bx-trending-up" size="20" />
                  </div>
                  <div>
                    <span class="text-body-2 text-medium-emphasis">Total Revenue</span>
                    <h6 class="text-subtitle-1 font-weight-bold">{{ totalRevenue }}</h6>
                  </div>
                </div>
              </div>

              <div class="finance-item mb-4">
                <div class="d-flex align-center gap-3 mb-1">
                  <div class="finance-icon" style="background: rgba(59, 130, 246, 0.12); color: #3b82f6;">
                    <VIcon icon="bx-bar-chart-alt-2" size="20" />
                  </div>
                  <div>
                    <span class="text-body-2 text-medium-emphasis">Avg. Payout / Load</span>
                    <h6 class="text-subtitle-1 font-weight-bold">{{ avgPayout }}</h6>
                  </div>
                </div>
              </div>

              <div class="finance-item mb-4">
                <div class="d-flex align-center gap-3 mb-1">
                  <div class="finance-icon" style="background: rgba(245, 158, 11, 0.12); color: #f59e0b;">
                    <VIcon icon="bx-map-alt" size="20" />
                  </div>
                  <div>
                    <span class="text-body-2 text-medium-emphasis">Total Miles</span>
                    <h6 class="text-subtitle-1 font-weight-bold">{{ totalMiles }} mi</h6>
                  </div>
                </div>
              </div>

              <div class="finance-item">
                <div class="d-flex align-center gap-3 mb-1">
                  <div class="finance-icon" style="background: rgba(139, 92, 246, 0.12); color: #8b5cf6;">
                    <VIcon icon="bx-map" size="20" />
                  </div>
                  <div>
                    <span class="text-body-2 text-medium-emphasis">Avg. Miles / Load</span>
                    <h6 class="text-subtitle-1 font-weight-bold">{{ Number(loadStats?.financial?.avg_miles || 0).toLocaleString() }} mi</h6>
                  </div>
                </div>
              </div>
            </VCardText>
          </VCard>

          <!-- Users Quick Stat -->
          <VCard class="content-card" :class="{ 'dark': isDark }">
            <VCardText class="pa-5">
              <h6 class="text-h6 font-weight-bold mb-4">Users Overview</h6>
              <div class="d-flex align-center gap-3 mb-3">
                <div class="finance-icon" style="background: rgba(16, 185, 129, 0.12); color: #10b981;">
                  <VIcon icon="bx-user-check" size="20" />
                </div>
                <div>
                  <span class="text-body-2 text-medium-emphasis">Active Users</span>
                  <h6 class="text-subtitle-1 font-weight-bold">{{ userStats?.active_users || 0 }}</h6>
                </div>
              </div>
              <div class="d-flex align-center gap-3">
                <div class="finance-icon" style="background: rgba(239, 68, 68, 0.12); color: #ef4444;">
                  <VIcon icon="bx-user-x" size="20" />
                </div>
                <div>
                  <span class="text-body-2 text-medium-emphasis">Inactive Users</span>
                  <h6 class="text-subtitle-1 font-weight-bold">{{ userStats?.inactive_users || 0 }}</h6>
                </div>
              </div>
            </VCardText>
          </VCard>
        </VCol>
      </VRow>

      <!-- Recent Loads -->
      <VRow class="mt-2">
        <VCol cols="12">
          <VCard class="content-card" :class="{ 'dark': isDark }">
            <VCardText class="pa-5">
              <div class="d-flex align-center justify-space-between mb-4">
                <div>
                  <h6 class="text-h6 font-weight-bold">Recent Loads</h6>
                  <span class="text-body-2 text-medium-emphasis">Latest loads added to the system</span>
                </div>
                <VBtn variant="tonal" color="primary" size="small" to="/loads">
                  View All
                </VBtn>
              </div>

              <div v-if="recentLoads.length === 0" class="text-center pa-6">
                <VIcon icon="bx-package" size="48" class="text-medium-emphasis mb-2" />
                <p class="text-body-2 text-medium-emphasis">No loads yet</p>
              </div>

              <VTable v-else density="comfortable" class="recent-table">
                <thead>
                  <tr>
                    <th>Load ID</th>
                    <th>Route</th>
                    <th>Status</th>
                    <th>Payout</th>
                    <th>Miles</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="load in recentLoads" :key="load.id">
                    <td>
                      <span class="font-weight-semibold" style="font-family: monospace;">
                        {{ load.load_id || '-' }}
                      </span>
                    </td>
                    <td>
                      <span class="text-body-2">
                        {{ load.origin_city || '?' }}, {{ load.origin_state || '?' }}
                        <VIcon icon="bx-right-arrow-alt" size="16" class="mx-1" />
                        {{ load.destination_city || '?' }}, {{ load.destination_state || '?' }}
                      </span>
                    </td>
                    <td>
                      <VChip
                        size="small"
                        variant="tonal"
                        :style="{ color: statusColor(load.status), background: statusColor(load.status) + '18' }"
                      >
                        {{ statusLabel(load.status) }}
                      </VChip>
                    </td>
                    <td class="font-weight-semibold">{{ formatCurrency(load.payout) }}</td>
                    <td>{{ Number(load.total_miles || 0).toLocaleString() }}</td>
                    <td class="text-medium-emphasis">{{ formatDate(load.created_at) }}</td>
                  </tr>
                </tbody>
              </VTable>
            </VCardText>
          </VCard>
        </VCol>
      </VRow>

      <!-- Analytics Snapshot -->
      <VRow v-if="analyticsSnapshotItems.length" class="mt-2">
        <VCol cols="12">
          <VCard class="content-card" :class="{ 'dark': isDark }">
            <VCardText class="pa-5">
              <div class="d-flex align-center justify-space-between mb-4">
                <div>
                  <h6 class="text-h6 font-weight-bold">Analytics Snapshot</h6>
                  <span class="text-body-2 text-medium-emphasis">Quick overview of key metrics</span>
                </div>
                <VBtn variant="tonal" color="primary" size="small" to="/analytics">
                  Full Analytics
                  <VIcon icon="bx-right-arrow-alt" size="18" class="ms-1" />
                </VBtn>
              </div>

              <VRow>
                <VCol
                  v-for="(item, idx) in analyticsSnapshotItems"
                  :key="idx"
                  cols="6"
                  sm="4"
                  md="3"
                >
                  <div class="analytics-chip pa-3 rounded-lg">
                    <div class="d-flex align-center gap-2 mb-2">
                      <div class="analytics-chip-icon" :style="{ background: item.color + '18', color: item.color }">
                        <VIcon :icon="item.icon" size="18" />
                      </div>
                    </div>
                    <span class="text-caption text-medium-emphasis" style="line-height: 1.3; display: block;">
                      {{ item.label }}
                    </span>
                    <h6 class="text-subtitle-1 font-weight-bold mt-1">
                      {{ item.value }}
                    </h6>
                  </div>
                </VCol>
              </VRow>
            </VCardText>
          </VCard>
        </VCol>
      </VRow>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.welcome-card {
  position: relative;
  overflow: hidden;
  background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 50%, #3b82f6 100%);
  border: none;

  .welcome-bg {
    position: absolute;
    inset: 0;
    overflow: hidden;
  }

  .welcome-shape {
    position: absolute;
    border-radius: 50%;
    opacity: 0.1;
    background: white;

    &.shape-1 {
      width: 200px;
      height: 200px;
      top: -60px;
      right: -30px;
      animation: float 8s ease-in-out infinite;
    }

    &.shape-2 {
      width: 120px;
      height: 120px;
      bottom: -40px;
      right: 120px;
      animation: float 6s ease-in-out infinite reverse;
    }

    &.shape-3 {
      width: 80px;
      height: 80px;
      top: 20px;
      right: 250px;
      animation: float 10s ease-in-out infinite;
    }
  }

  .welcome-content {
    position: relative;
    z-index: 1;
  }
}

.stat-card {
  transition: all 0.3s ease;
  border: 1px solid rgba(var(--v-border-color), 0.08);

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 25px rgba(0, 0, 0, 0.1);
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

.content-card {
  border: 1px solid rgba(var(--v-border-color), 0.08);
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-bar-track {
  height: 8px;
  border-radius: 4px;
  background: rgba(var(--v-border-color), 0.1);
  overflow: hidden;
}

.status-bar-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 1s ease;
}

.finance-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.analytics-chip {
  background: rgba(var(--v-border-color), 0.04);
  border: 1px solid rgba(var(--v-border-color), 0.08);
  transition: all 0.2s ease;

  &:hover {
    border-color: rgba(var(--v-border-color), 0.15);
    transform: translateY(-1px);
  }
}

.analytics-chip-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.recent-table {
  th {
    text-transform: uppercase;
    font-size: 0.75rem;
    letter-spacing: 0.5px;
    font-weight: 600;
    color: rgba(var(--v-theme-on-surface), 0.6);
    border-bottom: 1px solid rgba(var(--v-border-color), 0.12);
  }

  td {
    border-bottom: 1px solid rgba(var(--v-border-color), 0.06);
  }
}

@keyframes float {
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-15px); }
}
</style>
