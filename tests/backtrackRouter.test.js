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

describe('Backtrack route behavior', () => {
  it('navigates to Backtrack without preparing its legacy assets', async () => {
    await expect(router.push('/backtrack')).resolves.toMatchObject({
      path: '/backtrack',
    })
  })

  it('navigates to Check without a route-level calculation preload', async () => {
    await expect(router.push('/check')).resolves.toMatchObject({
      path: '/check',
    })

    const checkRoute = routerHarness.routes.find(
      (route) => route.path === '/check'
    )
    expect(checkRoute).not.toHaveProperty('beforeEnter')
  })

  it('keeps the Backtrack route component and removes only its guard', () => {
    const backtrackRoute = routerHarness.routes.find(
      (route) => route.path === '/backtrack'
    )

    expect(backtrackRoute).toBeDefined()
    expect(backtrackRoute.component).toBeTypeOf('function')
    expect(backtrackRoute).not.toHaveProperty('beforeEnter')
  })
})
