export interface ResourceGuardPolicy {
  readonly capacityBytes: number
  readonly maxActive: number
  readonly maxQueued: number
  readonly reservationMultiplier: number
}

/** Partial policy accepted by the ResourceGuard constructor and factory. */
export interface ResourceGuardPolicyInput {
  readonly capacityBytes?: number
  /** Historical alias for capacityBytes. */
  readonly capacity?: number
  readonly maxActive?: number
  readonly maxQueued?: number
  readonly reservationMultiplier?: number
}

export interface ResourceReservationEstimate {
  readonly float64Bytes?: number
}

/** Structural plan metadata accepted by ResourceGuard, independent of operation. */
export interface ResourceReservationPlan {
  readonly operation?: string | null
  readonly estimates?: ResourceReservationEstimate | null
}

/** Minimal AbortSignal-like shape accepted by ResourceGuard. */
export interface ResourceGuardAbortSignal {
  readonly aborted: boolean
  addEventListener(
    type: 'abort',
    listener: (event: Event) => void,
    options?: AddEventListenerOptions,
  ): void
  removeEventListener(
    type: 'abort',
    listener: (event: Event) => void,
    options?: EventListenerOptions,
  ): void
}

export interface ResourceGuardAcquireOptions {
  readonly signal?: ResourceGuardAbortSignal | null
  readonly requestId?: string | number | null
  readonly operation?: string | null
}

export interface ResourceGuardRequest extends ResourceGuardAcquireOptions {
  readonly float64Bytes?: number
  readonly estimate?: ResourceReservationEstimate | null
  readonly estimateAvailable?: boolean
}

export interface ResourceLeaseMetadata {
  readonly operation: string
  readonly requestId: string | number | null | undefined
  readonly float64Bytes: number
  readonly reservedBytes: number
  readonly estimateAvailable: boolean
  readonly state: 'active' | 'queued' | 'released' | 'aborted'
}

export interface ResourceLease {
  readonly metadata: ResourceLeaseMetadata
  readonly released: boolean
  release(): boolean
}

export type ResourceLeaseResult = ResourceLease | Promise<ResourceLease>

export interface ResourceGuardSnapshot {
  readonly capacityBytes: number
  readonly maxActive: number
  readonly maxQueued: number
  readonly reservationMultiplier: number
  readonly reservedBytes: number
  readonly availableBytes: number
  readonly activeCount: number
  readonly queuedCount: number
  readonly active: readonly ResourceLeaseMetadata[]
  readonly queued: readonly ResourceLeaseMetadata[]
}

export interface ResourceGuard {
  readonly policy: ResourceGuardPolicy
  acquire(request?: ResourceGuardRequest): Promise<ResourceLease>
  acquireLease(request?: ResourceGuardRequest): ResourceLeaseResult
  acquireForPlan(
    plan: ResourceReservationPlan,
    options?: ResourceGuardAcquireOptions,
  ): ResourceLeaseResult
  acquirePlan(
    plan: ResourceReservationPlan,
    options?: ResourceGuardAcquireOptions,
  ): ResourceLeaseResult
  snapshot(): ResourceGuardSnapshot
  getSnapshot(): ResourceGuardSnapshot
  diagnostics(): ResourceGuardSnapshot
}
