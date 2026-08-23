// Composables
import { createRouter, createWebHistory } from 'vue-router'
import { calculationClient } from '@/application/CalculationClient'

async function prepareCalculation(routeName) {
  try {
    await calculationClient.prepare(routeName)
  } catch (error) {
    console.error(`Failed to prepare ${routeName} calculation`, error)
  }
}

const routes = [
    {path: '/', component: () => import('@/views/Home.vue')},
    {path: '/check', component: () => import('@/views/Check.vue'), beforeEnter: async () => {
      await prepareCalculation('check')
    }},
    {path: '/attack', component: () => import('@/views/Attack.vue'), beforeEnter: async () => {
      await prepareCalculation('attack')
    }},
    {path: '/backtrack', component: () => import('@/views/Backtrack.vue')}
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

export default router
