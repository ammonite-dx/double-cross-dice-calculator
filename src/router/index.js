// Composables
import { createRouter, createWebHistory } from 'vue-router'

const routes = [
    {path: '/', component: () => import('@/views/Home.vue')},
    {path: '/check', component: () => import('@/views/Check.vue')},
    {path: '/attack', component: () => import('@/views/Attack.vue')},
    {path: '/backtrack', component: () => import('@/views/Backtrack.vue')}
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

export default router
