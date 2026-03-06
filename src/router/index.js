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
          path: 'account-settings',
          name: 'account-settings',
          component: () => import('../pages/account-settings.vue'),
          meta: { requiresAuth: true },
        },
        
        // Admin pages
        {
          path: 'users',
          name: 'users',
          component: () => import('../pages/user.vue'),
          meta: { 
            requiresAuth: true,
            permissions: ['user.view'],
          },
        },
        {
          path: 'roles',
          name: 'roles',
          component: () => import('../pages/roles.vue'),
          meta: { 
            requiresAuth: true,
            permissions: ['role.view'],
          },
        },
        // {
        //   path: 'teachers',
        //   name: 'teachers',
        //   component: () => import('../pages/teachers.vue'),
        //   meta: { 
        //     requiresAuth: true,
        //     permissions: ['user.view'],
        //   },
        // },
        {
          path: 'groups',
          name: 'groups',
          component: () => import('../pages/groups.vue'),
          meta: { 
            requiresAuth: true,
            permissions: ['group.view'],
          },
        },
        // {
        //   path: 'students',
        //   name: 'students',
        //   component: () => import('../pages/students.vue'),
        //   meta: { 
        //     requiresAuth: true,
        //     permissions: ['student.view'],
        //   },
        // },
        // {
        //   path: 'attendance',
        //   name: 'attendance',
        //   component: () => import('../pages/attendance.vue'),
        //   meta: { 
        //     requiresAuth: true,
        //     permissions: ['attendance.view'],
        //   },
        // },
        // {
        //   path: 'roles',
        //   name: 'roles',
        //   component: () => import('../pages/roles.vue'),
        //   meta: { 
        //     requiresAuth: true,
        //     permissions: ['role.view'],
        //   },
        // },
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
