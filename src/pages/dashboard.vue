<!-- src/pages/dashboard.vue -->

<script setup>
import { ref, onMounted, computed, nextTick } from 'vue'
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
const barsAnimated = ref(false)

// Greeting
const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good Morning'
  if (hour < 17) return 'Good Afternoon'
  return 'Good Evening'
})

const todayFormatted = computed(() =>
  new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
)

// Formatters
const formatCurrency = (val) =>
  Number(val || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

const formatNumber = (val) => Number(val || 0).toLocaleString()

const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Computed stats
const totalRevenue = computed(() => formatCurrency(loadStats.value?.financial?.total_payout))

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

const statusColor = (status) => statusColors[status] || '#64748b'
const statusLabel = (status) => statusLabels[status] || status

const statusItems = computed(() => {
  const sb = loadStats.value?.status_breakdown || {}
  return [
    { key: 'available', label: 'Available', value: sb.available || 0, color: '#10b981', icon: 'bx-package' },
    { key: 'booked', label: 'Booked', value: sb.booked || 0, color: '#3b82f6', icon: 'bx-calendar-check' },
    { key: 'in_transit', label: 'In Transit', value: sb.in_transit || 0, color: '#f59e0b', icon: 'bx-car' },
    { key: 'delivered', label: 'Delivered', value: sb.delivered || 0, color: '#8b5cf6', icon: 'bx-check-circle' },
    { key: 'cancelled', label: 'Cancelled', value: sb.cancelled || 0, color: '#ef4444', icon: 'bx-x-circle' },
  ]
})

const totalStatusLoads = computed(() => statusItems.value.reduce((sum, item) => sum + item.value, 0) || 1)

const statusBarWidth = (value) => {
  if (!barsAnimated.value) return '0%'
  return Math.max((value / totalStatusLoads.value) * 100, value > 0 ? 2 : 0) + '%'
}

// Financial summary items
const financialItems = computed(() => {
  const fin = loadStats.value?.financial || {}
  return [
    { label: 'Total Revenue', value: formatCurrency(fin.total_payout), icon: 'bx-trending-up', color: '#10b981', bgColor: 'rgba(16, 185, 129, 0.12)' },
    { label: 'Total Miles', value: `${formatNumber(fin.total_miles)} mi`, icon: 'bx-map-alt', color: '#3b82f6', bgColor: 'rgba(59, 130, 246, 0.12)' },
    { label: 'Most Expensive', value: formatCurrency(fin.most_expensive), icon: 'bx-up-arrow-alt', color: '#8b5cf6', bgColor: 'rgba(139, 92, 246, 0.12)' },
    { label: 'Cheapest Load', value: formatCurrency(fin.cheapest), icon: 'bx-down-arrow-alt', color: '#f59e0b', bgColor: 'rgba(245, 158, 11, 0.12)' },
  ]
})

// Top routes
const topRoutes = computed(() => {
  const routes = analyticsOverview.value?.top_routes || []
  return routes.slice(0, 5)
})

// Quick stats cards
const quickStats = computed(() => [
  {
    title: 'Total Loads',
    value: loadStats.value?.total_loads || 0,
    icon: 'bx-package',
    iconColor: '#3b82f6',
    iconBg: 'rgba(59, 130, 246, 0.12)',
    chip: loadStats.value?.new_last_7d ? `+${loadStats.value.new_last_7d} this week` : null,
    chipColor: 'success',
  },
  {
    title: 'Total Revenue',
    value: totalRevenue.value,
    icon: 'bx-dollar-circle',
    iconColor: '#10b981',
    iconBg: 'rgba(16, 185, 129, 0.12)',
    chip: null,
  },
  {
    title: 'Total Users',
    value: userStats.value?.total_users || 0,
    icon: 'bx-group',
    iconColor: '#8b5cf6',
    iconBg: 'rgba(139, 92, 246, 0.12)',
    chip: userStats.value?.active_sessions ? `${userStats.value.active_sessions} online` : null,
    chipColor: 'info',
  },
  {
    title: 'Facilities',
    value: facilityStats.value?.total_facilities || 0,
    icon: 'bx-buildings',
    iconColor: '#f59e0b',
    iconBg: 'rgba(245, 158, 11, 0.12)',
    chip: null,
  },
])

// Weekly comparison
const weeklyComparison = computed(() => {
  const tw = analyticsOverview.value?.this_week || {}
  const change = tw.change_vs_last_week
  return {
    loads: tw.loads || 0,
    payout: formatCurrency(tw.total_payout),
    change: change != null ? change : null,
    miles: formatNumber(tw.total_miles),
  }
})

// Fetch data
const fetchAll = async () => {
  loading.value = true
  barsAnimated.value = false

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

  // Trigger bar animations after render
  await nextTick()
  setTimeout(() => {
    barsAnimated.value = true
  }, 100)
}

onMounted(fetchAll)
</script>

<template>
  <div class="dashboard-page" :class="{ 'dark-mode': isDark }">
    <!-- Loading -->
    <div v-if="loading" class="loading-container">
      <VProgressCircular indeterminate size="52" width="4" color="primary" />
      <p class="text-body-2 mt-4" style="color: var(--text-secondary);">Loading dashboard...</p>
    </div>

    <template v-else>
      <!-- Welcome Banner -->
      <div class="welcome-banner animate-in" style="--delay: 0">
        <div class="welcome-bg">
          <div class="welcome-shape shape-1" />
          <div class="welcome-shape shape-2" />
          <div class="welcome-shape shape-3" />
          <div class="welcome-shape shape-4" />
        </div>
        <div class="welcome-content">
          <VRow align="center">
            <VCol cols="12" md="8">
              <h3 class="welcome-title">
                {{ greeting }}, {{ user?.first_name || 'User' }}!
              </h3>
              <p class="welcome-subtitle">
                Here's what's happening with your operations today.
              </p>
            </VCol>
            <VCol cols="12" md="4" class="text-md-end">
              <div class="welcome-date-chip">
                <i class="bx bx-calendar" />
                {{ todayFormatted }}
              </div>
              <div v-if="weeklyComparison.change != null" class="welcome-trend-chip mt-2">
                <i :class="weeklyComparison.change >= 0 ? 'bx bx-trending-up' : 'bx bx-trending-down'" />
                {{ weeklyComparison.change >= 0 ? '+' : '' }}{{ weeklyComparison.change }}% vs last week
              </div>
            </VCol>
          </VRow>
        </div>
      </div>

      <!-- Quick Stats Row -->
      <VRow class="mb-2 mt-6">
        <VCol
          v-for="(stat, idx) in quickStats"
          :key="stat.title"
          cols="12"
          sm="6"
          md="3"
        >
          <div
            class="stat-card animate-in"
            :style="{ '--delay': (idx + 1) }"
          >
            <div class="stat-card-inner">
              <div class="d-flex align-center justify-space-between mb-3">
                <div class="stat-icon-wrap" :style="{ background: stat.iconBg }">
                  <VIcon :icon="stat.icon" size="24" :color="stat.iconColor" />
                </div>
                <VChip
                  v-if="stat.chip"
                  size="x-small"
                  variant="tonal"
                  :color="stat.chipColor"
                  class="font-weight-bold"
                >
                  {{ stat.chip }}
                </VChip>
              </div>
              <h3 class="stat-value">{{ stat.value }}</h3>
              <span class="stat-label">{{ stat.title }}</span>
            </div>
          </div>
        </VCol>
      </VRow>

      <!-- Main Content Row -->
      <VRow class="mt-2">
        <!-- Load Status Overview -->
        <VCol cols="12" md="8">
          <div class="dash-card animate-in" style="--delay: 5">
            <div class="dash-card-inner">
              <div class="d-flex align-center justify-space-between mb-5">
                <div>
                  <h6 class="card-title">Load Status Overview</h6>
                  <span class="card-subtitle">Current distribution of all loads</span>
                </div>
                <VBtn variant="tonal" color="primary" size="small" to="/loads">
                  View All
                  <VIcon icon="bx-right-arrow-alt" size="18" class="ms-1" />
                </VBtn>
              </div>

              <div class="status-bars">
                <div
                  v-for="item in statusItems"
                  :key="item.key"
                  class="status-bar-item"
                >
                  <div class="d-flex align-center justify-space-between mb-2">
                    <div class="d-flex align-center gap-2">
                      <div class="status-indicator" :style="{ background: item.color }">
                        <VIcon :icon="item.icon" size="14" color="white" />
                      </div>
                      <span class="status-bar-label">{{ item.label }}</span>
                    </div>
                    <div class="d-flex align-center gap-2">
                      <span class="status-bar-value">{{ item.value }}</span>
                      <span class="status-bar-pct">
                        {{ Math.round((item.value / totalStatusLoads) * 100) }}%
                      </span>
                    </div>
                  </div>
                  <div class="status-bar-track">
                    <div
                      class="status-bar-fill"
                      :style="{
                        width: statusBarWidth(item.value),
                        background: `linear-gradient(90deg, ${item.color}, ${item.color}cc)`,
                      }"
                    />
                  </div>
                </div>
              </div>

              <!-- Weekly snapshot -->
              <div v-if="analyticsOverview?.this_week" class="weekly-snapshot mt-5">
                <div class="weekly-snapshot-title">This Week</div>
                <div class="weekly-snapshot-grid">
                  <div class="weekly-item">
                    <span class="weekly-item-value">{{ weeklyComparison.loads }}</span>
                    <span class="weekly-item-label">Loads</span>
                  </div>
                  <div class="weekly-item">
                    <span class="weekly-item-value">{{ weeklyComparison.payout }}</span>
                    <span class="weekly-item-label">Revenue</span>
                  </div>
                  <div class="weekly-item">
                    <span class="weekly-item-value">{{ weeklyComparison.miles }}</span>
                    <span class="weekly-item-label">Miles</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </VCol>

        <!-- Right Column -->
        <VCol cols="12" md="4">
          <!-- Financial Summary -->
          <div class="dash-card animate-in mb-4" style="--delay: 6">
            <div class="dash-card-inner">
              <h6 class="card-title mb-4">Financial Summary</h6>

              <div
                v-for="(item, idx) in financialItems"
                :key="item.label"
                class="finance-row"
                :class="{ 'mb-4': idx < financialItems.length - 1 }"
              >
                <div class="d-flex align-center gap-3">
                  <div class="finance-icon" :style="{ background: item.bgColor, color: item.color }">
                    <VIcon :icon="item.icon" size="20" />
                  </div>
                  <div>
                    <span class="finance-label">{{ item.label }}</span>
                    <div class="finance-value">{{ item.value }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Users Overview -->
          <div class="dash-card animate-in" style="--delay: 7">
            <div class="dash-card-inner">
              <div class="d-flex align-center justify-space-between mb-4">
                <h6 class="card-title">Users Overview</h6>
                <VBtn variant="text" color="primary" size="x-small" to="/users">
                  Details
                </VBtn>
              </div>

              <div class="user-stat-row mb-3">
                <div class="d-flex align-center gap-3">
                  <div class="finance-icon" style="background: rgba(16, 185, 129, 0.12); color: #10b981;">
                    <VIcon icon="bx-user-check" size="20" />
                  </div>
                  <div>
                    <span class="finance-label">Active Users</span>
                    <div class="finance-value">{{ userStats?.active_users || 0 }}</div>
                  </div>
                </div>
              </div>

              <div class="user-stat-row mb-3">
                <div class="d-flex align-center gap-3">
                  <div class="finance-icon" style="background: rgba(239, 68, 68, 0.12); color: #ef4444;">
                    <VIcon icon="bx-user-x" size="20" />
                  </div>
                  <div>
                    <span class="finance-label">Inactive Users</span>
                    <div class="finance-value">{{ userStats?.inactive_users || 0 }}</div>
                  </div>
                </div>
              </div>

              <div v-if="userStats?.logged_in_last_24h != null" class="user-stat-row">
                <div class="d-flex align-center gap-3">
                  <div class="finance-icon" style="background: rgba(59, 130, 246, 0.12); color: #3b82f6;">
                    <VIcon icon="bx-log-in-circle" size="20" />
                  </div>
                  <div>
                    <span class="finance-label">Logged in (24h)</span>
                    <div class="finance-value">{{ userStats.logged_in_last_24h }}</div>
                  </div>
                </div>
              </div>

              <!-- Roles breakdown mini -->
              <div v-if="userStats?.roles_breakdown?.length" class="roles-mini mt-4">
                <div class="roles-mini-title">Roles Distribution</div>
                <div class="roles-mini-list">
                  <div
                    v-for="role in userStats.roles_breakdown.slice(0, 4)"
                    :key="role.slug"
                    class="roles-mini-item"
                  >
                    <span class="roles-mini-name">{{ role.name }}</span>
                    <span class="roles-mini-count">{{ role.user_count }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </VCol>
      </VRow>

      <!-- Recent Loads Table -->
      <VRow class="mt-4">
        <VCol cols="12">
          <div class="dash-card animate-in" style="--delay: 8">
            <div class="dash-card-inner">
              <div class="d-flex align-center justify-space-between mb-4">
                <div>
                  <h6 class="card-title">Recent Loads</h6>
                  <span class="card-subtitle">Latest loads added to the system</span>
                </div>
                <VBtn variant="tonal" color="primary" size="small" to="/loads">
                  View All
                </VBtn>
              </div>

              <div v-if="recentLoads.length === 0" class="empty-state">
                <VIcon icon="bx-package" size="48" />
                <p>No loads yet</p>
              </div>

              <div v-else class="recent-table-wrap">
                <VTable density="comfortable" class="recent-table">
                  <thead>
                    <tr>
                      <th>Load ID</th>
                      <th>Route</th>
                      <th>Status</th>
                      <th class="text-end">Payout</th>
                      <th class="text-end">Miles</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="load in recentLoads" :key="load.id" class="load-row">
                      <td>
                        <span class="load-id-text">{{ load.load_id || '-' }}</span>
                      </td>
                      <td>
                        <div class="route-cell">
                          <span class="route-origin">{{ load.origin_city || '?' }}, {{ load.origin_state || '?' }}</span>
                          <VIcon icon="bx-right-arrow-alt" size="16" class="route-arrow" />
                          <span class="route-dest">{{ load.destination_city || '?' }}, {{ load.destination_state || '?' }}</span>
                        </div>
                      </td>
                      <td>
                        <VChip
                          size="small"
                          variant="flat"
                          :style="{
                            color: 'white',
                            background: statusColor(load.status),
                            fontWeight: 600,
                            fontSize: '0.72rem',
                          }"
                        >
                          {{ statusLabel(load.status) }}
                        </VChip>
                      </td>
                      <td class="text-end">
                        <span class="payout-text">{{ formatCurrency(load.payout) }}</span>
                      </td>
                      <td class="text-end">
                        <span class="miles-text">{{ formatNumber(load.total_miles) }}</span>
                      </td>
                      <td>
                        <span class="date-text">{{ formatDate(load.created_at) }}</span>
                      </td>
                    </tr>
                  </tbody>
                </VTable>
              </div>
            </div>
          </div>
        </VCol>
      </VRow>

      <!-- Top Routes -->
      <VRow v-if="topRoutes.length" class="mt-4 mb-4">
        <VCol cols="12">
          <div class="dash-card animate-in" style="--delay: 9">
            <div class="dash-card-inner">
              <div class="d-flex align-center justify-space-between mb-4">
                <div>
                  <h6 class="card-title">Top Routes</h6>
                  <span class="card-subtitle">Most frequent routes by volume</span>
                </div>
                <VBtn variant="tonal" color="primary" size="small" to="/analytics">
                  Full Analytics
                  <VIcon icon="bx-right-arrow-alt" size="18" class="ms-1" />
                </VBtn>
              </div>

              <VRow>
                <VCol
                  v-for="(route, idx) in topRoutes"
                  :key="idx"
                  cols="12"
                  sm="6"
                  md="4"
                  lg
                >
                  <div class="route-card" :class="{ 'top-route': idx === 0 }">
                    <div class="route-card-rank">#{{ idx + 1 }}</div>
                    <div class="route-card-id">{{ route.load_id || `Route ${idx + 1}` }}</div>
                    <div class="route-card-stats">
                      <div class="route-stat">
                        <span class="route-stat-value">{{ route.count || 0 }}</span>
                        <span class="route-stat-label">Trips</span>
                      </div>
                      <div class="route-stat">
                        <span class="route-stat-value">{{ formatCurrency(route.total_payout) }}</span>
                        <span class="route-stat-label">Revenue</span>
                      </div>
                    </div>
                    <div v-if="route.most_expensive || route.cheapest" class="route-card-range">
                      <span v-if="route.cheapest" class="route-range-item low">{{ formatCurrency(route.cheapest) }}</span>
                      <span v-if="route.most_expensive && route.cheapest" class="route-range-sep">-</span>
                      <span v-if="route.most_expensive" class="route-range-item high">{{ formatCurrency(route.most_expensive) }}</span>
                    </div>
                  </div>
                </VCol>
              </VRow>
            </div>
          </div>
        </VCol>
      </VRow>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.dashboard-page {
  // Light mode defaults
  --card-bg: rgba(255, 255, 255, 0.82);
  --card-border: rgba(0, 0, 0, 0.06);
  --card-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  --hover-shadow: 0 8px 25px rgba(0, 0, 0, 0.08);
  --text-primary: #1e293b;
  --text-secondary: #64748b;
  --bg-subtle: rgba(0, 0, 0, 0.02);

  &.dark-mode {
    --card-bg: rgba(30, 30, 46, 0.82);
    --card-border: rgba(255, 255, 255, 0.06);
    --card-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
    --hover-shadow: 0 8px 25px rgba(0, 0, 0, 0.3);
    --text-primary: #e2e8f0;
    --text-secondary: #94a3b8;
    --bg-subtle: rgba(255, 255, 255, 0.03);
  }
}

// Loading
.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 400px;
}

// Animations
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes float {
  0%, 100% { transform: translateY(0px) rotate(0deg); }
  50% { transform: translateY(-15px) rotate(3deg); }
}

@keyframes floatReverse {
  0%, 100% { transform: translateY(0px) rotate(0deg); }
  50% { transform: translateY(12px) rotate(-2deg); }
}

@keyframes pulse {
  0%, 100% { opacity: 0.08; }
  50% { opacity: 0.15; }
}

.animate-in {
  opacity: 0;
  animation: fadeInUp 0.5s ease forwards;
  animation-delay: calc(var(--delay, 0) * 0.08s);
}

// Welcome Banner
.welcome-banner {
  position: relative;
  overflow: hidden;
  background: linear-gradient(135deg, #7c3aed 0%, #6366f1 35%, #3b82f6 70%, #06b6d4 100%);
  border-radius: 20px;
  padding: 0;
  min-height: 140px;

  .welcome-bg {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
  }

  .welcome-shape {
    position: absolute;
    border-radius: 50%;
    background: white;

    &.shape-1 {
      width: 220px;
      height: 220px;
      top: -80px;
      right: -40px;
      opacity: 0.08;
      animation: float 8s ease-in-out infinite;
    }

    &.shape-2 {
      width: 140px;
      height: 140px;
      bottom: -50px;
      right: 140px;
      opacity: 0.06;
      animation: floatReverse 6s ease-in-out infinite;
    }

    &.shape-3 {
      width: 90px;
      height: 90px;
      top: 15px;
      right: 280px;
      opacity: 0.07;
      animation: float 10s ease-in-out infinite;
    }

    &.shape-4 {
      width: 60px;
      height: 60px;
      bottom: 10px;
      left: 15%;
      opacity: 0.05;
      animation: pulse 4s ease-in-out infinite;
    }
  }

  .welcome-content {
    position: relative;
    z-index: 1;
    padding: 28px 32px;
  }

  .welcome-title {
    font-size: 1.65rem;
    font-weight: 700;
    color: white;
    margin-bottom: 6px;
    letter-spacing: -0.01em;
  }

  .welcome-subtitle {
    font-size: 0.95rem;
    color: rgba(255, 255, 255, 0.82);
    margin: 0;
  }

  .welcome-date-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: rgba(255, 255, 255, 0.18);
    backdrop-filter: blur(10px);
    color: white;
    padding: 6px 14px;
    border-radius: 20px;
    font-size: 0.82rem;
    font-weight: 500;

    i { font-size: 16px; }
  }

  .welcome-trend-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: rgba(255, 255, 255, 0.12);
    color: rgba(255, 255, 255, 0.92);
    padding: 4px 12px;
    border-radius: 16px;
    font-size: 0.76rem;
    font-weight: 600;

    i { font-size: 15px; }
  }
}

// Stat Cards
.stat-card {
  background: var(--card-bg);
  backdrop-filter: blur(20px);
  border: 1px solid var(--card-border);
  border-radius: 16px;
  box-shadow: var(--card-shadow);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  height: 100%;

  &:hover {
    transform: translateY(-2px);
    box-shadow: var(--hover-shadow);
    border-color: rgba(99, 102, 241, 0.15);
  }

  .stat-card-inner {
    padding: 22px;
  }

  .stat-icon-wrap {
    width: 46px;
    height: 46px;
    border-radius: 13px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .stat-value {
    font-size: 1.55rem;
    font-weight: 700;
    color: var(--text-primary);
    margin-bottom: 2px;
    letter-spacing: -0.02em;
  }

  .stat-label {
    font-size: 0.82rem;
    color: var(--text-secondary);
    font-weight: 500;
  }
}

// Dashboard Cards
.dash-card {
  background: var(--card-bg);
  backdrop-filter: blur(20px);
  border: 1px solid var(--card-border);
  border-radius: 16px;
  box-shadow: var(--card-shadow);
  transition: box-shadow 0.3s ease;

  &:hover {
    box-shadow: var(--hover-shadow);
  }

  .dash-card-inner {
    padding: 24px;
  }
}

.card-title {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0;
}

.card-subtitle {
  font-size: 0.82rem;
  color: var(--text-secondary);
}

// Status Bars
.status-bars {
  .status-bar-item {
    margin-bottom: 18px;

    &:last-child {
      margin-bottom: 0;
    }
  }

  .status-indicator {
    width: 26px;
    height: 26px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .status-bar-label {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .status-bar-value {
    font-size: 0.88rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .status-bar-pct {
    font-size: 0.72rem;
    color: var(--text-secondary);
    min-width: 32px;
    text-align: right;
  }

  .status-bar-track {
    height: 8px;
    border-radius: 4px;
    background: var(--bg-subtle);
    overflow: hidden;
    border: 1px solid var(--card-border);
  }

  .status-bar-fill {
    height: 100%;
    border-radius: 4px;
    transition: width 1s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative;

    &::after {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.2) 50%, transparent 100%);
      border-radius: inherit;
    }
  }
}

// Weekly snapshot
.weekly-snapshot {
  background: var(--bg-subtle);
  border: 1px solid var(--card-border);
  border-radius: 12px;
  padding: 16px;

  .weekly-snapshot-title {
    font-size: 0.76rem;
    font-weight: 700;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.8px;
    margin-bottom: 12px;
  }

  .weekly-snapshot-grid {
    display: flex;
    gap: 24px;
  }

  .weekly-item {
    display: flex;
    flex-direction: column;

    .weekly-item-value {
      font-size: 1.1rem;
      font-weight: 700;
      color: var(--text-primary);
    }

    .weekly-item-label {
      font-size: 0.72rem;
      color: var(--text-secondary);
      font-weight: 500;
    }
  }
}

// Financial items
.finance-row {
  padding: 8px 0;
}

.finance-icon {
  width: 42px;
  height: 42px;
  border-radius: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.finance-label {
  font-size: 0.78rem;
  color: var(--text-secondary);
  display: block;
  line-height: 1.2;
}

.finance-value {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-top: 1px;
}

// Roles mini section
.roles-mini {
  border-top: 1px solid var(--card-border);
  padding-top: 14px;

  .roles-mini-title {
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    color: var(--text-secondary);
    margin-bottom: 10px;
  }

  .roles-mini-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .roles-mini-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 5px 10px;
    background: var(--bg-subtle);
    border-radius: 8px;

    .roles-mini-name {
      font-size: 0.8rem;
      font-weight: 500;
      color: var(--text-primary);
    }

    .roles-mini-count {
      font-size: 0.78rem;
      font-weight: 700;
      color: var(--text-secondary);
      background: var(--card-border);
      padding: 1px 8px;
      border-radius: 10px;
    }
  }
}

// Empty state
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 32px;
  color: var(--text-secondary);

  p {
    margin-top: 8px;
    font-size: 0.88rem;
  }
}

// Recent Table
.recent-table-wrap {
  overflow-x: auto;
  margin: 0 -24px -24px;
  padding: 0 24px 24px;
}

.recent-table {
  background: transparent !important;

  th {
    text-transform: uppercase;
    font-size: 0.7rem !important;
    letter-spacing: 0.8px;
    font-weight: 700 !important;
    color: var(--text-secondary) !important;
    border-bottom: 1px solid var(--card-border) !important;
    padding: 10px 16px !important;
    white-space: nowrap;
  }

  td {
    border-bottom: 1px solid var(--card-border) !important;
    padding: 12px 16px !important;
    vertical-align: middle;
  }

  .load-row {
    transition: background 0.15s ease;

    &:hover {
      background: var(--bg-subtle);
    }

    &:last-child td {
      border-bottom: none !important;
    }
  }
}

.load-id-text {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-primary);
}

.route-cell {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.84rem;
  white-space: nowrap;

  .route-origin {
    color: var(--text-primary);
    font-weight: 500;
  }

  .route-arrow {
    color: var(--text-secondary);
    opacity: 0.6;
    flex-shrink: 0;
  }

  .route-dest {
    color: var(--text-secondary);
  }
}

.payout-text {
  font-weight: 700;
  font-size: 0.88rem;
  color: var(--text-primary);
}

.miles-text {
  font-size: 0.84rem;
  color: var(--text-secondary);
}

.date-text {
  font-size: 0.8rem;
  color: var(--text-secondary);
  white-space: nowrap;
}

// Top Routes
.route-card {
  background: var(--bg-subtle);
  border: 1px solid var(--card-border);
  border-radius: 14px;
  padding: 18px;
  transition: all 0.25s ease;
  position: relative;
  overflow: hidden;
  height: 100%;

  &:hover {
    transform: translateY(-2px);
    box-shadow: var(--hover-shadow);
    border-color: rgba(99, 102, 241, 0.2);
  }

  &.top-route {
    border-color: rgba(99, 102, 241, 0.25);
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.06) 0%, rgba(59, 130, 246, 0.04) 100%);

    .route-card-rank {
      background: linear-gradient(135deg, #6366f1, #3b82f6);
      color: white;
    }
  }

  .route-card-rank {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 8px;
    font-size: 0.72rem;
    font-weight: 800;
    background: var(--card-border);
    color: var(--text-secondary);
    margin-bottom: 10px;
  }

  .route-card-id {
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 12px;
    word-break: break-all;
  }

  .route-card-stats {
    display: flex;
    gap: 16px;
    margin-bottom: 8px;
  }

  .route-stat {
    display: flex;
    flex-direction: column;

    .route-stat-value {
      font-size: 0.92rem;
      font-weight: 700;
      color: var(--text-primary);
    }

    .route-stat-label {
      font-size: 0.68rem;
      color: var(--text-secondary);
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }
  }

  .route-card-range {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 6px;
    font-size: 0.72rem;

    .route-range-item {
      font-weight: 600;

      &.low { color: #10b981; }
      &.high { color: #8b5cf6; }
    }

    .route-range-sep {
      color: var(--text-secondary);
    }
  }
}

// Responsive
@media (max-width: 960px) {
  .welcome-banner {
    border-radius: 16px;

    .welcome-content {
      padding: 22px 20px;
    }

    .welcome-title {
      font-size: 1.35rem;
    }
  }

  .weekly-snapshot-grid {
    flex-wrap: wrap;
    gap: 16px !important;
  }

  .route-cell {
    flex-direction: column;
    align-items: flex-start;
    gap: 0 !important;

    .route-arrow {
      display: none;
    }

    .route-dest {
      font-size: 0.78rem;
    }
  }
}

@media (max-width: 600px) {
  .stat-card .stat-card-inner {
    padding: 16px;
  }

  .stat-card .stat-value {
    font-size: 1.25rem;
  }

  .dash-card .dash-card-inner {
    padding: 18px;
  }

  .welcome-banner .welcome-content {
    padding: 18px 16px;
  }

  .welcome-banner .welcome-title {
    font-size: 1.15rem;
  }
}
</style>
