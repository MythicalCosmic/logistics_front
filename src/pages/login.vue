<!-- src/pages/login.vue -->

<script setup>
import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import logo from '@images/logo.svg?raw'

const authStore = useAuthStore()

const form = ref({
  email: '',
  password: '',
  remember: false,
})

const isPasswordVisible = ref(false)
const isLoading = ref(false)
const errors = ref({})

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
  <div class="auth-wrapper d-flex align-center justify-center pa-4">
    <VCard
      class="auth-card pa-6 pt-8"
      max-width="448"
      :elevation="2"
    >
      <VCardItem class="justify-center pb-4">
        <template #prepend>
          <div class="d-flex">
            <div class="d-flex text-primary" v-html="logo" />
          </div>
        </template>
        <VCardTitle class="text-2xl font-weight-bold">
          Attendance
        </VCardTitle>
      </VCardItem>

      <VCardText class="pt-2 pb-6">
        <h5 class="text-h5 mb-1 font-weight-medium">Welcome! 👋🏻</h5>
        <p class="mb-0 text-body-2 text-medium-emphasis">
          Please sign-in to your account
        </p>
      </VCardText>

      <VCardText>
        <VForm @submit.prevent="handleLogin">
          <VRow>
            <VCol cols="12">
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
              />
            </VCol>

            <VCol cols="12">
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
                @click:append-inner="isPasswordVisible = !isPasswordVisible"
              />
            </VCol>

            <VCol cols="12" class="pt-0 pb-2">
              <div class="d-flex align-center justify-space-between">
                <VCheckbox
                  v-model="form.remember"
                  label="Remember me"
                  density="compact"
                  :disabled="isLoading"
                  hide-details
                />
              </div>
            </VCol>

            <VCol cols="12">
              <VBtn
                block
                type="submit"
                color="primary"
                size="large"
                :loading="isLoading"
                :disabled="isLoading"
              >
                Login
              </VBtn>
            </VCol>
          </VRow>
        </VForm>
      </VCardText>
    </VCard>
  </div>
</template>

<style lang="scss">
@use "@core/scss/template/pages/page-auth.scss";

.auth-wrapper {
  min-height: 100vh;
  background: linear-gradient(135deg, #f5f7ff 0%, #e8ecff 100%);
}

.auth-card {
  border-radius: 16px !important;
  
  .v-text-field .v-field {
    border-radius: 10px;
  }
  
  .v-text-field .v-field__prepend-inner {
    padding-right: 8px;
  }
  
  .v-text-field .v-field__prepend-inner .v-icon {
    opacity: 0.7;
  }
  
  .v-btn {
    border-radius: 10px;
    font-weight: 500;
    letter-spacing: 0.5px;
  }
}
</style>
