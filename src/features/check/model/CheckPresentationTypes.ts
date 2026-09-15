import type {
  DisplayMode,
  DisplayRequestSnapshot,
} from '../../../domain/CalculationInputs'
import type {
  CheckCalculationRangePlan,
} from '../../../calculation/planning/RangePlannerTypes'
import type {
  ChartJsData,
  DisplayRangePlan,
  DistributionProjectionDecision,
  DistributionProjectionStatus,
} from '../../../shared/presentation/DistributionProjectionTypes'

export type CheckPresentationStatus = DistributionProjectionStatus
export type CheckPresentationDecision = DistributionProjectionDecision

/** One side of the Check presentation, including its projection decision. */
export interface CheckPresentationSide {
  readonly plan: DisplayRangePlan
  readonly status: DistributionProjectionStatus
  readonly reason: string | null
  readonly decision: DistributionProjectionDecision
}

/** The UI-independent payload consumed by the Check view. */
export interface CheckPresentation {
  readonly version: 1
  readonly kind: 'check-canonical-presentation'
  readonly status: CheckPresentationStatus
  readonly mode: DisplayMode
  readonly opposed: boolean
  readonly action: CheckPresentationSide
  readonly reaction?: CheckPresentationSide | null
  readonly chart: ChartJsData | null
  readonly decision: CheckPresentationDecision
}

/** The calculation lane's typed feedback plan for Check. */
export type CheckCalculationFeedbackPlan = CheckCalculationRangePlan

/** The display lane accepts either a full coverage plan or a preflight plan. */
export type CheckDisplayRequest = DisplayRequestSnapshot

