export interface ResourceGuardPolicy {
  readonly capacityBytes: number
  readonly maxActive: number
  readonly maxQueued: number
  readonly reservationMultiplier: number
}

export interface ResourceReservationEstimate {
  readonly float64Bytes?: number
}

/** Structural plan metadata accepted by ResourceGuard, independent of operation. */
export interface ResourceReservationPlan {
  readonly operation?: string
  readonly estimates?: ResourceReservationEstimate | null
}

export interface ResourceGuardAcquireOptions {
  readonly signal?: AbortSignal
  readonly requestId?: string | number
  readonly operation?: string
}

export interface ResourceGuardRequest extends ResourceGuardAcquireOptions {
  readonly float64Bytes?: number
  readonly estimate?: ResourceReservationEstimate
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
