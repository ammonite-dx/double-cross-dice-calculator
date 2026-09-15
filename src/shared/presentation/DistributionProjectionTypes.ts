export type DisplayWarningSeverity = 'info' | 'warning' | 'error' | 'reject'

export interface DisplayWarning {
  readonly code: string
  readonly severity: DisplayWarningSeverity
  readonly message?: string
  readonly value?: unknown
  readonly limit?: unknown
  readonly [field: string]: unknown
}

// These small structural aliases intentionally live in the presentation
// layer. The shared adapter must not depend on domain or calculation modules;
// runtime validation remains owned by DistributionResult.js.
export type DisplayMode = 'pmf' | 'upper-tail'

export type CertifiedValue =
  | Readonly<{ kind: 'exact'; value: number }>
  | Readonly<{ kind: 'bounded'; lowerBound: number; upperBound: number }>
  | Readonly<{ kind: 'lower-bound'; lowerBound: number }>

export type DistributionSupport =
  | Readonly<{ kind: 'finite'; max: number }>
  | Readonly<{ kind: 'infinite' }>

export type DistributionOverflow =
  | Readonly<{
      readonly kind: 'exact'
      readonly lowerBound: number
      readonly probability: number
      readonly errorBound: number
    }>
  | Readonly<{
      readonly kind: 'upper-bound'
      readonly lowerBound: number
      readonly probabilityUpperBound: number
      readonly errorBound: number
    }>

export interface ProbabilityMassSummary {
  readonly explicitMass: number
  readonly overflowMass: number | null
  readonly overflowMassUpperBound: number
  readonly totalMass: number | null
  readonly totalMassUpperBound: number
  readonly unrepresentedMass: number | null
  readonly unrepresentedMassUpperBound: number
  readonly errorBound: number
  readonly isExact: boolean
}

/** The calculation-owned result shape consumed by the shared validator. */
export interface CanonicalDistributionResult {
  readonly version: number
  readonly values: Float64Array
  readonly offset: number
  readonly support: DistributionSupport
  readonly overflow: DistributionOverflow | null
}

export interface CanonicalDistributionEnvelope {
  readonly result: CanonicalDistributionResult
  readonly metadata: Readonly<{
    readonly modeledDistribution: true
    readonly [field: string]: unknown
  }>
}

/** A closed, inclusive display interval and its derived number of points. */
export interface DisplayWindow {
  readonly min: number
  readonly max: number
  readonly pointCount: number
}

/** A closed interval used to describe uncovered or known-zero coordinates. */
export type DisplayRangeSegment = DisplayWindow

export interface DisplayProjectionUncertainty {
  readonly positionUnknownProbabilityUpperBound: number
  readonly outputOverflowLowerBound?: number | null
}

export type DisplayKnownZero =
  | Readonly<{
      readonly kind: 'none'
      readonly pointCount: 0
      readonly right: null
    }>
  | Readonly<{
      readonly kind: 'finite-support-outside'
      readonly pointCount: number
      readonly right: DisplayRangeSegment
    }>

export interface DisplayCoverage {
  readonly explicit: {
    readonly offset: number
    readonly max: number | null
  }
  readonly support: DistributionSupport
  readonly overflow: DistributionOverflow | null
  readonly projectionUncertainty?: DisplayProjectionUncertainty
  readonly missingSegments: readonly DisplayRangeSegment[]
  readonly knownZero: DisplayKnownZero
}

export interface DisplayResourceEstimates {
  readonly pointCount: number
  readonly float64Bytes: number
  readonly chartPoints: number
}

export type DisplayRangePlanStatus = 'ready' | 'resource-rejected'

export type DisplayRangePlanDecision =
  | 'reuse'
  | 'known-zero'
  | 'recalculate'

/** The full coverage and resource plan returned by planDisplayRange. */
export interface DisplayRangePlan {
  readonly version: 1
  readonly kind: 'display-range-plan'
  readonly status: DisplayRangePlanStatus
  readonly accepted: boolean
  readonly decision: DisplayRangePlanDecision
  readonly reason: string
  readonly displayWindow: DisplayWindow
  readonly coverage: DisplayCoverage
  readonly estimates: DisplayResourceEstimates
  readonly warnings: readonly DisplayWarning[]
  readonly rejectionReasons: readonly string[]
}

/** Resource-only preflight returned before a distribution is available. */
export interface DisplayWindowResourcePlan {
  readonly version: 1
  readonly kind: 'display-window-resource-plan'
  readonly status: DisplayRangePlanStatus
  readonly accepted: boolean
  readonly decision: 'recalculate'
  readonly reason: 'resource-preflight'
  readonly displayWindow: DisplayWindow
  readonly estimates: DisplayResourceEstimates
  readonly warnings: readonly DisplayWarning[]
  readonly rejectionReasons: readonly string[]
}

/** A plan shape accepted by the feature feedback lane. */
export interface DisplayFeedbackPlan {
  readonly accepted: boolean
  readonly status: DisplayRangePlanStatus
  readonly decision: string
  readonly reason: string
  readonly displayWindow: DisplayWindow
  readonly estimates: DisplayResourceEstimates
  readonly warnings: readonly DisplayWarning[]
  readonly rejectionReasons: readonly string[]
}

export type DistributionDisplay = Readonly<{
  readonly version: 1
  readonly kind: 'canonical-distribution-display'
  readonly explicit: Readonly<{
    readonly offset: number
    readonly probabilities: readonly number[]
  }>
  readonly explicitMax: number | null
  readonly support: DistributionSupport
  readonly overflow: DistributionOverflow | null
  readonly mass: ProbabilityMassSummary
  readonly expectedValue: CertifiedValue
  readonly warnings: readonly DisplayWarning[]
  readonly projectionUncertainty?: DisplayProjectionUncertainty
  readonly displayWindow?: Readonly<{ min: number; max: number }>
}>

export type DistributionProjectionMode = DisplayMode

export type DistributionProjectionDecision =
  | 'reuse'
  | 'known-zero'
  | 'recalculate'
  | 'resource-rejected'
  | 'not-projectable'

export type DistributionProjectionStatus =
  | 'ready'
  | 'not-ready'
  | 'not-projectable'

export type DistributionProjectionReason = string

interface DistributionProjectionBase {
  readonly kind: 'canonical-distribution-projection'
  readonly version: 1
  readonly reason: DistributionProjectionReason
  readonly mode: DistributionProjectionMode
  readonly displayWindow: DisplayWindow
  readonly plan: DisplayRangePlan
}

/** A projection that owns a complete, window-sized probability buffer. */
export interface ReadyDistributionProjection
  extends DistributionProjectionBase {
  readonly status: 'ready'
  readonly decision: 'reuse' | 'known-zero'
  readonly values: Float64Array
}

/** A projection waiting for a wider calculation or rejected by resources. */
export interface NotReadyDistributionProjection
  extends DistributionProjectionBase {
  readonly status: 'not-ready'
  readonly decision: Exclude<
    DistributionProjectionDecision,
    'reuse' | 'known-zero'
  >
}

/** A projection whose requested window cannot be represented safely. */
export interface NotProjectableDistributionProjection
  extends DistributionProjectionBase {
  readonly status: 'not-projectable'
  readonly decision: 'recalculate' | 'not-projectable'
}

export type DistributionProjection =
  | ReadyDistributionProjection
  | NotReadyDistributionProjection
  | NotProjectableDistributionProjection

export interface ChartJsDataset {
  readonly data: Float64Array
  readonly parsing: true
  readonly label?: string
  readonly backgroundColor?: unknown
  readonly borderColor?: unknown
}

/** The small Chart.js DTO emitted only at the rendering boundary. */
export interface ChartJsData {
  readonly datasets: readonly [ChartJsDataset]
  readonly labels?: readonly number[]
}

export interface ChartMaterializerOptions {
  readonly includeLabels?: boolean
  readonly label?: string
  readonly backgroundColor?: unknown
  readonly borderColor?: unknown
}
