<!-- src/pages/activity-logs.vue -->

<script setup>
import { ref, onMounted, watch, computed } from 'vue'
import { useTheme } from 'vuetify'
import api from '@/services/api'

const vuetifyTheme = useTheme()
const isDark = computed(() => vuetifyTheme.global.current.value.dark)

// Data
const logs = ref([])
const loading = ref(false)
const totalLogs = ref(0)

// Pagination & Filters
const page = ref(1)
const perPage = ref(20)
const search = ref('')
const dateFrom = ref('')
const dateTo = ref('')
const totalPages = computed(() => Math.ceil(totalLogs.value / perPage.value))

// Action config
const actionConfig = {
  'load.created': { color: '#10b981', icon: 'bx-package', label: 'Load Created' },
  'load.updated': { color: '#3b82f6', icon: 'bx-package', label: 'Load Updated' },
  'load.cancelled': { color: '#ef4444', icon: 'bx-package', label: 'Load Cancelled' },
  'load.status_changed': { color: '#f59e0b', icon: 'bx-package', label: 'Status Changed' },
  'load.assigned': { color: '#8b5cf6', icon: 'bx-user-check', label: 'Driver Assigned' },
  'user.login': { color: '#8b5cf6', icon: 'bx-log-in', label: 'User Login' },
  'user.logout': { color: '#64748b', icon: 'bx-log-out', label: 'User Logout' },
  'user.created': { color: '#10b981', icon: 'bx-user-plus', label: 'User Created' },
  'user.updated': { color: '#3b82f6', icon: 'bx-user', label: 'User Updated' },
  'user.deleted': { color: '#ef4444', icon: 'bx-user-x', label: 'User Deleted' },
  'role.created': { color: '#10b981', icon: 'bx-shield', label: 'Role Created' },
  'role.updated': { color: '#3b82f6', icon: 'bx-shield', label: 'Role Updated' },
  'role.deleted': { color: '#ef4444', icon: 'bx-shield', label: 'Role Deleted' },
  'facility.created': { color: '#10b981', icon: 'bx-buildings', label: 'Facility Created' },
  'facility.updated': { color: '#3b82f6', icon: 'bx-buildings', label: 'Facility Updated' },
  'facility.deleted': { color: '#ef4444', icon: 'bx-buildings', label: 'Facility Deleted' },
}

const getActionConfig = (action) => actionConfig[action] || { color: '#64748b', icon: 'bx-history', label: action }

const avatarText = (name) => {
  if (!name) return '?'
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

const avatarColor = (name) => {
  const colors = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#6366f1']
  let hash = 0
  for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

const relativeTime = (dateStr) => {
  if (!dateStr) return '-'
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
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const formatFullDate = (dateStr) => {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Fetch
const fetchLogs = async () => {
  loading.value = true
  try {
    const params = { page: page.value, per_page: perPage.value }
    if (search.value) params.search = search.value
    if (dateFrom.value) params.date_from = dateFrom.value
    if (dateTo.value) params.date_to = dateTo.value

    const response = await api.get('/admin-api/activity-logs', { params })
    if (response.data.success) {
      logs.value = response.data.data?.logs || []
      totalLogs.value = response.data.data?.pagination?.total || 0
    }
  } catch (error) {
    console.error('Failed to fetch logs:', error)
  } finally {
    loading.value = false
  }
}

// Watchers
let searchTimeout = null
watch(search, () => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => { page.value = 1; fetchLogs() }, 300)
})
watch([dateFrom, dateTo], () => { page.value = 1; fetchLogs() })
watch(page, () => fetchLogs())

const clearFilters = () => {
  search.value = ''
  dateFrom.value = ''
  dateTo.value = ''
  page.value = 1
  fetchLogs()
}

onMounted(fetchLogs)
</script>

<template>
  <div class="activity-logs-page" :class="{ 'dark-mode': isDark }">
    <!-- Page Header -->
    <div class="page-header mb-6">
      <div class="d-flex align-center" style="gap: 16px;">
        <div class="header-icon">
          <VIcon icon="bx-history" size="28" />
        </div>
        <div>
          <h1 class="text-h4 font-weight-bold" style="color: var(--text-primary);">Activity Logs</h1>
          <p class="text-body-2 mb-0" style="color: var(--text-secondary);">Track all system actions and changes</p>
        </div>
      </div>
    </div>

    <!-- Filters -->
    <VCard class="filter-card mb-6">
      <VCardText class="pa-4">
        <VRow align="center">
          <VCol cols="12" md="5">
            <VTextField
              v-model="search"
              placeholder="Search actions, users, IPs..."
              variant="outlined"
              density="comfortable"
              hide-details
              clearable
              prepend-inner-icon="bx-search"
            />
          </VCol>
          <VCol cols="12" sm="6" md="3">
            <VTextField
              v-model="dateFrom"
              label="From"
              type="date"
              variant="outlined"
              density="comfortable"
              hide-details
            />
          </VCol>
          <VCol cols="12" sm="6" md="3">
            <VTextField
              v-model="dateTo"
              label="To"
              type="date"
              variant="outlined"
              density="comfortable"
              hide-details
            />
          </VCol>
          <VCol cols="12" md="1" class="d-flex justify-end">
            <VBtn icon variant="tonal" @click="clearFilters">
              <VIcon icon="bx-refresh" />
            </VBtn>
          </VCol>
        </VRow>
      </VCardText>
    </VCard>

    <!-- Logs -->
    <VCard class="logs-card">
      <VCardText class="pa-0">
        <!-- Loading -->
        <div v-if="loading && !logs.length" class="d-flex justify-center pa-12">
          <VProgressCircular indeterminate color="primary" />
        </div>

        <!-- Empty -->
        <div v-else-if="!logs.length" class="text-center pa-12">
          <VIcon icon="bx-history" size="64" class="mb-4" style="color: var(--text-secondary); opacity: 0.4;" />
          <h3 class="text-h6 font-weight-bold mb-2" style="color: var(--text-primary);">No Activity Logs</h3>
          <p class="text-body-2" style="color: var(--text-secondary);">No logs found for the selected filters</p>
        </div>

        <!-- Timeline -->
        <div v-else class="timeline">
          <div
            v-for="(log, idx) in logs"
            :key="log.id"
            class="timeline-item"
            :style="{ '--delay': `${idx * 0.03}s` }"
          >
            <div class="timeline-dot" :style="{ background: getActionConfig(log.action).color }">
              <VIcon :icon="getActionConfig(log.action).icon" size="14" color="white" />
            </div>
            <div class="timeline-line" />
            <div class="timeline-content">
              <div class="d-flex align-center justify-space-between flex-wrap" style="gap: 8px;">
                <div class="d-flex align-center" style="gap: 10px;">
                  <!-- User Avatar -->
                  <div v-if="log.user" class="log-avatar" :style="{ background: avatarColor(log.user.full_name) }">
                    {{ avatarText(log.user.full_name) }}
                  </div>
                  <div>
                    <span class="font-weight-semibold text-body-2" style="color: var(--text-primary);">
                      {{ log.user?.full_name || 'System' }}
                    </span>
                    <span class="text-caption d-block" style="color: var(--text-secondary);">
                      {{ log.user?.email || '' }}
                    </span>
                  </div>
                </div>
                <div class="d-flex align-center" style="gap: 8px;">
                  <VChip
                    size="small"
                    variant="tonal"
                    :style="{
                      color: getActionConfig(log.action).color,
                      background: getActionConfig(log.action).color + '18',
                    }"
                  >
                    {{ getActionConfig(log.action).label }}
                  </VChip>
                  <span class="text-caption" style="color: var(--text-secondary);" :title="formatFullDate(log.created_at)">
                    {{ relativeTime(log.created_at) }}
                  </span>
                </div>
              </div>

              <p class="text-body-2 mt-2 mb-0" style="color: var(--text-primary);">
                {{ log.details }}
              </p>

              <div class="d-flex align-center mt-2 flex-wrap" style="gap: 12px;">
                <span v-if="log.load" class="log-meta">
                  <VIcon icon="bx-package" size="14" />
                  Load: {{ log.load.load_id }}
                </span>
                <span v-if="log.ip_address" class="log-meta">
                  <VIcon icon="bx-globe" size="14" />
                  {{ log.ip_address }}
                </span>
                <span class="log-meta">
                  <VIcon icon="bx-time" size="14" />
                  {{ formatFullDate(log.created_at) }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Pagination -->
        <div v-if="totalPages > 1" class="d-flex align-center justify-space-between pa-4 flex-wrap" style="gap: 12px; border-top: 1px solid var(--card-border);">
          <span class="text-body-2" style="color: var(--text-secondary);">
            Showing {{ (page - 1) * perPage + 1 }} to {{ Math.min(page * perPage, totalLogs) }} of {{ totalLogs }}
          </span>
          <VPagination v-model="page" :length="totalPages" :total-visible="5" density="compact" />
        </div>
      </VCardText>
    </VCard>
  </div>
</template>

<style lang="scss" scoped>
.activity-logs-page {
  --card-bg: rgba(255, 255, 255, 0.85);
  --card-border: rgba(0, 0, 0, 0.06);
  --text-primary: #1e293b;
  --text-secondary: #64748b;
  --bg-subtle: rgba(0, 0, 0, 0.02);

  &.dark-mode {
    --card-bg: rgba(30, 30, 46, 0.85);
    --card-border: rgba(255, 255, 255, 0.06);
    --text-primary: #e2e8f0;
    --text-secondary: #94a3b8;
    --bg-subtle: rgba(255, 255, 255, 0.03);
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
}

.logs-card {
  background: var(--card-bg) !important;
  backdrop-filter: blur(20px);
  border: 1px solid var(--card-border);
  border-radius: 16px !important;
  overflow: hidden;
}

.timeline {
  padding: 24px;
}

.timeline-item {
  position: relative;
  display: flex;
  gap: 16px;
  padding-bottom: 24px;
  animation: fadeInUp 0.4s ease both;
  animation-delay: var(--delay);

  &:last-child {
    padding-bottom: 0;

    .timeline-line { display: none; }
  }
}

.timeline-dot {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  position: relative;
  z-index: 1;
}

.timeline-line {
  position: absolute;
  left: 15px;
  top: 36px;
  bottom: 0;
  width: 2px;
  background: var(--card-border);
}

.timeline-content {
  flex: 1;
  min-width: 0;
  padding: 12px 16px;
  background: var(--bg-subtle);
  border: 1px solid var(--card-border);
  border-radius: 12px;
  transition: all 0.2s ease;

  &:hover {
    border-color: rgba(99, 102, 241, 0.15);
  }
}

.log-avatar {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-size: 11px;
  font-weight: 700;
  flex-shrink: 0;
}

.log-meta {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
