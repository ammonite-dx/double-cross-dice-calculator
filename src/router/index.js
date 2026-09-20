// Composables
import { createRouter, createWebHistory } from 'vue-router'

const routes = [
    { path: '/', component: () => import('@/views/Home.vue') },
    { path: '/check', component: () => import('@/features/check/ui/CheckPage.vue') },
    { path: '/attack', component: () => import('@/features/attack/ui/AttackPage.vue') },
    { path: '/backtrack', component: () => import('@/features/backtrack/ui/BacktrackPage.vue') },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

export default router
