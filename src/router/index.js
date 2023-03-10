// Composables
import { createRouter, createWebHistory } from 'vue-router'
import Home from '@/views/Home.vue'
import Check from '@/views/Check.vue'
import Attack from '@/views/Attack.vue'
import Backtrack from '@/views/Backtrack.vue'

const routes = [
    {path: '/', component: Home},
    {path: '/check', component: Check},
    {path: '/attack', component: Attack},
    {path: '/backtrack', component: Backtrack}
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

export default router
