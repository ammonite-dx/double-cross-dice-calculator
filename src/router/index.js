// Composables
import { createRouter, createWebHistory } from 'vue-router'
import {
  loadD10Asset,
  loadDrAsset,
  loadDxAsset,
  loadLivingdeadAsset,
} from '@/data/PrecomputedDataRepository'

const routes = [
    {path: '/', component: () => import('@/views/Home.vue')},
    {path: '/check', component: () => import('@/views/Check.vue'), beforeEnter: async () => {
      await loadDxAsset(0)
    }},
    {path: '/attack', component: () => import('@/views/Attack.vue'), beforeEnter: async () => {
      await Promise.all([loadDxAsset(0), loadDrAsset(0), loadD10Asset()])
    }},
    {path: '/backtrack', component: () => import('@/views/Backtrack.vue'), beforeEnter: async () => {
      await Promise.all([loadD10Asset(), loadLivingdeadAsset()])
    }}
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

export default router
