import { describe, expect, it, vi } from 'vitest'

const routerHarness = vi.hoisted(() => ({
  routes: null,
}))

vi.mock('vue-router', () => ({
  createWebHistory: vi.fn(() => ({type: 'web-history'})),
  createRouter: vi.fn((options) => {
    routerHarness.routes = options.routes
    return {
      async push(path) {
        const route = options.routes.find((entry) => entry.path === path)
        if (route?.beforeEnter) {
          await route.beforeEnter()
        }
        return route
      },
    }
  }),
}))

import router from '../src/router/index.js'

describe('Attack route behavior', () => {
  it('enters Attack without route-level calculation preparation', async () => {
    await expect(router.push('/attack')).resolves.toMatchObject({
      path: '/attack',
    })
  })

  it('retains the Attack component and removes only its route guard', () => {
    const attackRoute = routerHarness.routes.find(
      (route) => route.path === '/attack'
    )

    expect(attackRoute).toBeDefined()
    expect(attackRoute.component).toBeTypeOf('function')
    expect(attackRoute).not.toHaveProperty('beforeEnter')
  })

  it('has no calculation preload guard on any calculation route', async () => {
    for (const path of ['/check', '/attack', '/backtrack']) {
      const route = routerHarness.routes.find((entry) => entry.path === path)
      expect(route).toBeDefined()
      expect(route).not.toHaveProperty('beforeEnter')
      await expect(router.push(path)).resolves.toMatchObject({ path })
    }
  })
})
