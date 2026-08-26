import { clearD10PrecomputedDataCache } from './D10PrecomputedDataRepository'
import { clearReferencePrecomputedDataCache } from './ReferencePrecomputedDataRepository'

export * from './PrecomputedDataSchema'
export * from './D10PrecomputedDataRepository'
export * from './ReferencePrecomputedDataRepository'

export function clearPrecomputedDataCache() {
  clearD10PrecomputedDataCache()
  clearReferencePrecomputedDataCache()
}
