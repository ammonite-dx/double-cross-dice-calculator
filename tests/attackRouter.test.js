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

import { calculationClient } from '../src/application/CalculationClient'
import router from '../src/router/index.js'

describe('Attack route behavior', () => {
  it('enters Attack without route-level calculation preparation', async () => {
    const prepare = vi
      .spyOn(calculationClient, 'prepare')
      .mockResolvedValue(undefined)

    await expect(router.push('/attack')).resolves.toMatchObject({
      path: '/attack',
    })

    expect(prepare).not.toHaveBeenCalled()
    prepare.mockRestore()
  })

  it('keeps the explicit CalculationClient.prepare attack API available', async () => {
    const prepare = vi
      .spyOn(calculationClient, 'prepare')
      .mockResolvedValue(undefined)

    await calculationClient.prepare('attack')

    expect(prepare).toHaveBeenCalledWith('attack')
    prepare.mockRestore()
  })

  it('retains the Attack component and removes only its route guard', () => {
    const attackRoute = routerHarness.routes.find(
      (route) => route.path === '/attack'
    )

    expect(attackRoute).toBeDefined()
    expect(attackRoute.component).toBeTypeOf('function')
    expect(attackRoute).not.toHaveProperty('beforeEnter')
  })
})
