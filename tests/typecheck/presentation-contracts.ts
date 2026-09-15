import type {
  ChartJsData,
  DisplayRangePlan,
  DistributionProjection,
  NotProjectableDistributionProjection,
  ReadyDistributionProjection,
} from '../../src/shared/presentation/DistributionProjectionTypes'
import { materializeChartJsData } from '../../src/shared/presentation/ChartSeriesAdapter'
import type { CheckPresentation } from '../../src/features/check/model/CheckPresentationTypes'
import type {
  AttackDisplayPresentation,
  AttackScoreDisplayBatchPresentation,
} from '../../src/features/attack/model/AttackPresentationTypes'

declare const projection: DistributionProjection
declare const plan: DisplayRangePlan
declare const readyProjection: ReadyDistributionProjection

if (projection.status === 'ready') {
  projection.values[0]
  projection.plan.coverage.missingSegments
}

if (projection.status !== 'ready') {
  // The materializer boundary must not accept a projection without values.
  // @ts-expect-error: terminal projections do not expose a values buffer.
  projection.values
}

const terminal: NotProjectableDistributionProjection = {
  kind: 'canonical-distribution-projection',
  version: 1,
  status: 'not-projectable',
  decision: 'recalculate',
  reason: 'exact-overflow-overlap',
  mode: 'pmf',
  displayWindow: plan.displayWindow,
  plan,
}

materializeChartJsData(readyProjection)
// @ts-expect-error: only ready projections can cross the Chart.js boundary.
materializeChartJsData(projection)

declare const checkPresentation: CheckPresentation
checkPresentation.action.plan.displayWindow.pointCount
if (checkPresentation.opposed) {
  checkPresentation.reaction?.decision
}

declare const attackPresentation: AttackDisplayPresentation
attackPresentation.combos[0]?.projection.status
attackPresentation.total.chart?.datasets[0].data

declare const scorePresentation: AttackScoreDisplayBatchPresentation
scorePresentation.combos[0]?.action.projection

declare const chart: ChartJsData
chart.datasets[0].data.byteLength

void terminal
void checkPresentation
void attackPresentation
void scorePresentation
void chart
