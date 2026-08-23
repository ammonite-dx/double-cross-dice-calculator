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

import {
  calculationClient,
} from '../src/application/CalculationClient'
import router from '../src/router/index.js'

describe('Backtrack route behavior', () => {
  it('navigates to Backtrack without preparing its legacy assets', async () => {
    const prepare = vi
      .spyOn(calculationClient, 'prepare')
      .mockResolvedValue(undefined)

    await expect(router.push('/backtrack')).resolves.toMatchObject({
      path: '/backtrack',
    })

    expect(prepare).not.toHaveBeenCalled()
    prepare.mockRestore()
  })

  it('keeps route preparation for the other calculation views', async () => {
    const prepare = vi
      .spyOn(calculationClient, 'prepare')
      .mockResolvedValue(undefined)

    await router.push('/check')
    await router.push('/attack')

    expect(prepare).toHaveBeenNthCalledWith(1, 'check')
    expect(prepare).toHaveBeenNthCalledWith(2, 'attack')
    prepare.mockRestore()
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
