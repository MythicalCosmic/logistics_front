<!-- src/pages/login.vue -->

<script setup>
import { useTheme } from 'vuetify'
import { useAuthStore } from '@/stores/auth'
import logo from '@images/logo.svg?raw'

const authStore = useAuthStore()
const vuetifyTheme = useTheme()
const isDark = computed(() => vuetifyTheme.global.current.value.dark)

const form = ref({
  email: '',
  password: '',
  remember: false,
})

const isPasswordVisible = ref(false)
const isLoading = ref(false)
const errors = ref({})
const mounted = ref(false)

onMounted(() => {
  requestAnimationFrame(() => {
    mounted.value = true
  })
})

const validateForm = () => {
  errors.value = {}

  if (!form.value.email) {
    errors.value.email = 'Email is required'
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.value.email)) {
    errors.value.email = 'Please enter a valid email'
  }

  if (!form.value.password) {
    errors.value.password = 'Password is required'
  }

  return Object.keys(errors.value).length === 0
}

const handleLogin = async () => {
  if (!validateForm()) return

  isLoading.value = true

  try {
    await authStore.login(form.value.email, form.value.password)
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <!-- Animated background -->
    <div class="login-bg">
      <div class="login-bg__gradient" />
      <div class="login-bg__shapes">
        <span
          v-for="i in 6"
          :key="i"
          class="floating-shape"
          :class="`floating-shape--${i}`"
        />
      </div>
    </div>

    <!-- Login card -->
    <div class="login-container d-flex align-center justify-center">
      <VCard
        class="login-card pa-8 pt-10"
        :class="{ 'login-card--visible': mounted }"
        max-width="460"
        width="100%"
        :elevation="0"
      >
        <!-- Logo -->
        <div class="d-flex align-center justify-center gap-3 mb-6">
          <div class="login-logo d-flex text-primary" v-html="logo" />
          <h1 class="text-h4 font-weight-bold text-primary">
            Sneat
          </h1>
        </div>

        <!-- Welcome text -->
        <div class="text-center mb-8">
          <h2 class="text-h5 font-weight-semibold mb-2">
            Welcome Back
          </h2>
          <p class="text-body-2 text-medium-emphasis mb-0">
            Sign in to your account to continue
          </p>
        </div>

        <!-- Form -->
        <VForm @submit.prevent="handleLogin">
          <div class="d-flex flex-column gap-5">
            <VTextField
              v-model="form.email"
              autofocus
              placeholder="johndoe@email.com"
              label="Email"
              type="email"
              variant="outlined"
              density="comfortable"
              :error-messages="errors.email"
              :disabled="isLoading"
              prepend-inner-icon="bx-envelope"
              class="login-field"
            />

            <VTextField
              v-model="form.password"
              label="Password"
              placeholder="Enter your password"
              :type="isPasswordVisible ? 'text' : 'password'"
              variant="outlined"
              density="comfortable"
              :error-messages="errors.password"
              :disabled="isLoading"
              prepend-inner-icon="bx-lock-alt"
              :append-inner-icon="isPasswordVisible ? 'bx-hide' : 'bx-show'"
              class="login-field"
              @click:append-inner="isPasswordVisible = !isPasswordVisible"
            />

            <div class="d-flex align-center justify-space-between mt-n2">
              <VCheckbox
                v-model="form.remember"
                label="Remember me"
                density="compact"
                :disabled="isLoading"
                hide-details
              />
            </div>

            <VBtn
              block
              type="submit"
              color="primary"
              size="large"
              :loading="isLoading"
              :disabled="isLoading"
              class="login-btn mt-2"
            >
              <VIcon start icon="bx-log-in" class="me-1" />
              Sign In
            </VBtn>
          </div>
        </VForm>

        <!-- Footer -->
        <div class="text-center mt-8">
          <p class="text-caption text-disabled mb-0">
            Secured with session-based authentication
          </p>
        </div>
      </VCard>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use "@core/scss/template/pages/page-auth.scss";

// ── Variables ──
$light-bg-start: #f0f2f8;
$light-bg-end: #e8ecff;
$light-card-bg: rgba(255, 255, 255, 0.92);
$light-shape-color: rgba(105, 108, 255, 0.06);

$dark-bg-start: #0f0f23;
$dark-bg-end: #1a1a2e;
$dark-card-bg: rgba(30, 30, 46, 0.92);
$dark-shape-color: rgba(105, 108, 255, 0.08);

// ── Keyframes ──
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(40px) scale(0.97);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes float1 {
  0%, 100% { transform: translate(0, 0) rotate(0deg); }
  25% { transform: translate(30px, -40px) rotate(5deg); }
  50% { transform: translate(-20px, -70px) rotate(-3deg); }
  75% { transform: translate(40px, -30px) rotate(7deg); }
}

@keyframes float2 {
  0%, 100% { transform: translate(0, 0) rotate(0deg); }
  33% { transform: translate(-40px, 30px) rotate(-8deg); }
  66% { transform: translate(30px, 50px) rotate(5deg); }
}

@keyframes float3 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(25px, -35px) scale(1.1); }
}

@keyframes gradientShift {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}

// ── Page ──
.login-page {
  position: relative;
  min-height: 100vh;
  overflow: hidden;
}

// ── Background ──
.login-bg {
  position: fixed;
  inset: 0;
  z-index: 0;

  &__gradient {
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, $light-bg-start 0%, $light-bg-end 50%, lighten($light-bg-start, 2%) 100%);
    background-size: 200% 200%;
    animation: gradientShift 15s ease infinite;

    .v-theme--dark & {
      background: linear-gradient(135deg, $dark-bg-start 0%, $dark-bg-end 50%, darken($dark-bg-end, 5%) 100%);
      background-size: 200% 200%;
    }
  }

  &__shapes {
    position: absolute;
    inset: 0;
    overflow: hidden;
  }
}

// ── Floating shapes ──
.floating-shape {
  position: absolute;
  border-radius: 50%;
  background: $light-shape-color;
  pointer-events: none;

  .v-theme--dark & {
    background: $dark-shape-color;
  }

  &--1 {
    width: 300px;
    height: 300px;
    top: -80px;
    right: -60px;
    border-radius: 30% 70% 70% 30% / 30% 30% 70% 70%;
    animation: float1 20s ease-in-out infinite;
  }

  &--2 {
    width: 200px;
    height: 200px;
    bottom: -40px;
    left: -40px;
    border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%;
    animation: float2 25s ease-in-out infinite;
  }

  &--3 {
    width: 150px;
    height: 150px;
    top: 40%;
    left: 10%;
    border-radius: 40% 60% 60% 40% / 50% 60% 40% 50%;
    animation: float3 18s ease-in-out infinite;
  }

  &--4 {
    width: 100px;
    height: 100px;
    top: 20%;
    right: 15%;
    border-radius: 50%;
    animation: float2 22s ease-in-out infinite reverse;
  }

  &--5 {
    width: 180px;
    height: 180px;
    bottom: 15%;
    right: 10%;
    border-radius: 50% 30% 50% 70% / 40% 60% 40% 60%;
    animation: float1 28s ease-in-out infinite;
  }

  &--6 {
    width: 120px;
    height: 120px;
    top: 60%;
    left: 35%;
    border-radius: 30% 70% 50% 50% / 50% 50% 70% 30%;
    animation: float3 24s ease-in-out infinite reverse;
  }
}

// ── Container ──
.login-container {
  position: relative;
  z-index: 1;
  min-height: 100vh;
  padding: 24px;
}

// ── Card ──
.login-card {
  background: $light-card-bg !important;
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border-radius: 20px !important;
  border: 1px solid rgba(255, 255, 255, 0.3);
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.06),
    0 2px 8px rgba(0, 0, 0, 0.04) !important;

  // Hidden state (before animation)
  opacity: 0;
  transform: translateY(40px) scale(0.97);
  transition: none;

  &--visible {
    animation: fadeInUp 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }

  .v-theme--dark & {
    background: $dark-card-bg !important;
    border: 1px solid rgba(255, 255, 255, 0.06);
    box-shadow:
      0 8px 32px rgba(0, 0, 0, 0.3),
      0 0 60px rgba(105, 108, 255, 0.04) !important;
  }
}

// ── Logo ──
.login-logo {
  :deep(svg) {
    width: 36px;
    height: 36px;
  }
}

// ── Fields ──
.login-field {
  :deep(.v-field) {
    border-radius: 12px;
    transition: box-shadow 0.25s ease, border-color 0.25s ease;
  }

  :deep(.v-field--focused) {
    box-shadow: 0 0 0 3px rgba(var(--v-theme-primary), 0.12);
  }

  :deep(.v-field__prepend-inner) {
    padding-inline-end: 8px;

    .v-icon {
      opacity: 0.6;
      font-size: 20px;
    }
  }

  :deep(.v-field__append-inner) {
    .v-icon {
      opacity: 0.5;
      font-size: 20px;
      cursor: pointer;
      transition: opacity 0.2s ease;

      &:hover {
        opacity: 0.8;
      }
    }
  }
}

// ── Button ──
.login-btn {
  border-radius: 12px !important;
  font-weight: 600;
  letter-spacing: 0.4px;
  text-transform: none;
  font-size: 15px;
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s ease;

  &:hover:not(:disabled) {
    transform: translateY(-1px) scale(1.01);
    box-shadow: 0 6px 20px rgba(var(--v-theme-primary), 0.35);
  }

  &:active:not(:disabled) {
    transform: translateY(0) scale(0.99);
  }
}

// ── Responsive ──
@media (max-width: 500px) {
  .login-card {
    border-radius: 16px !important;
  }

  .login-container {
    padding: 16px;
  }
}
</style>
