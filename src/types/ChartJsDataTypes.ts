/** A Chart.js dataset projection emitted by shared presentation adapters. */
export interface ChartJsDataset {
  readonly data: Float64Array
  readonly parsing: true
  readonly label?: string
  readonly backgroundColor?: unknown
  readonly borderColor?: unknown
}

/** The small Chart.js DTO consumed only at the rendering boundary. */
export interface ChartJsData {
  readonly datasets: readonly ChartJsDataset[]
  readonly labels?: readonly number[]
}
