export const CALCULATION_REQUEST_STATUS = Object.freeze({
  IDLE: 'idle',
  PENDING: 'pending',
  RUNNING: 'running',
  SUCCESS: 'success',
  ERROR: 'error',
  CANCELLED: 'cancelled',
  RESOURCE_REJECTED: 'resource-rejected',
} as const)

export type CalculationRequestStatus =
  typeof CALCULATION_REQUEST_STATUS[
    keyof typeof CALCULATION_REQUEST_STATUS
  ]
