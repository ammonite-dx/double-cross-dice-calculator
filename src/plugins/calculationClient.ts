import { inject, type App, type InjectionKey } from 'vue'

import {
  calculationClient as defaultCalculationClient,
} from '../runtime/CalculationClient'
import type { CalculationClient } from '../runtime/CalculationClientTypes'

/** Vue-side dependency-injection key for the calculation client. */
export const CALCULATION_CLIENT_KEY: InjectionKey<CalculationClient> =
  Symbol('calculationClient')

/** Register a calculation client for the application subtree. */
export function provideCalculationClient(
  app: App,
  client: CalculationClient = defaultCalculationClient,
): void {
  app.provide(CALCULATION_CLIENT_KEY, client)
}

/**
 * Resolve the calculation client for a feature page.
 *
 * Standalone page usage keeps the production singleton as a fallback, while
 * tests and embedded applications can provide a typed replacement.
 */
export function useCalculationClient(): CalculationClient {
  return inject(CALCULATION_CLIENT_KEY, defaultCalculationClient)
}
