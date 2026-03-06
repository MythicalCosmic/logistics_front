// src/router/index.js

import { createRouter, createWebHistory } from 'vue-router'
import { setupGuards } from './guards'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/dashboard' },
    
    // Default layout (authenticated pages)
    {
      path: '/',
      component: () => import('../layouts/default.vue'),
      children: [
        {
          path: 'dashboard',
          name: 'dashboard',
          component: () => import('../pages/dashboard.vue'),
          meta: { requiresAuth: true },
        },
        {
          path: 'users',
          name: 'users',
          component: () => import('../pages/user.vue'),
          meta: {
            requiresAuth: true,
            permissions: ['users.view'],
          },
        },
        {
          path: 'roles',
          name: 'roles',
          component: () => import('../pages/roles.vue'),
          meta: {
            requiresAuth: true,
            permissions: ['roles.view'],
          },
        },
      ],
    },
    
    // Blank layout (guest pages)
    {
      path: '/',
      component: () => import('../layouts/blank.vue'),
      children: [
        {
          path: 'login',
          name: 'login',
          component: () => import('../pages/login.vue'),
          meta: { requiresAuth: false },
        },
        // {
        //   path: 'not-authorized',
        //   name: 'not-authorized',
        //   component: () => import('../pages/not-authorized.vue'),
        //   meta: { requiresAuth: false },
        // },
        {
          path: ':pathMatch(.*)*',
          name: 'not-found',
          component: () => import('../pages/[...all].vue'),
          meta: { requiresAuth: false },
        },
      ],
    },
  ],
})

// Setup auth guards
setupGuards(router)

export default router
