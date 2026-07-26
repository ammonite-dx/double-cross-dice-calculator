// Composables
import { createRouter, createWebHistory } from 'vue-router'
import { loadDxAsset } from '@/data/PrecomputedDataRepository'

const routes = [
    {path: '/', component: () => import('@/views/Home.vue')},
    {path: '/check', component: () => import('@/views/Check.vue'), beforeEnter: async () => {
      await loadDxAsset(0)
    }},
    {path: '/attack', component: () => import('@/views/Attack.vue'), beforeEnter: async () => {
      await loadDxAsset(0)
    }},
    {path: '/backtrack', component: () => import('@/views/Backtrack.vue')}
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

export default router
