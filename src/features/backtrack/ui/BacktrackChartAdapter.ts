import type {
  ChartData,
  ChartOptions,
  TooltipCallbacks,
  TooltipItem,
} from 'chart.js'
import type { Context } from 'chartjs-plugin-datalabels'
import type { BacktrackChartPresentation } from '../model/BacktrackPresentation'

export function getBacktrackChartData(
  chart: BacktrackChartPresentation,
): ChartData<'doughnut', number[], string> {
  // Chart.js declares mutable arrays, while the presentation owns immutable
  // arrays. The adapter exposes them as a read-only view and does not mutate.
  return {
    labels: chart.labels as string[],
    datasets: [{
      data: chart.probabilities as number[],
      backgroundColor: chart.backgroundColors as string[],
    }],
  }
}

export function getBacktrackChartOptions(
  chart: BacktrackChartPresentation,
  smAndUp: boolean,
): ChartOptions<'doughnut'> {
  const title = {
    display: true,
    text: chart.title,
  }
  const legend = {
    display: false,
  }
  const titleCallback = (() => null) as unknown as TooltipCallbacks<'doughnut'>['title']
  const tooltip = {
    callbacks: {
      title: titleCallback,
      label: (tooltipItem: TooltipItem<'doughnut'>) => `${tooltipItem.label}: ${tooltipItem.formattedValue}%`,
    },
  }
  const datalabels = {
    color: 'white',
    labels: {
      title: {
        font: {
          size: smAndUp ? 12 : 8,
          weight: 'bold' as const,
        },
      },
    },
    textAlign: 'center' as const,
    formatter: (value: number, context: Context) => {
      const label = context.chart.data.labels?.[context.dataIndex] ?? ''
      return value >= 10 ? `${label}\n${value}%` : ''
    },
  }

  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      title,
      legend,
      tooltip,
      datalabels,
    },
  }
}

export function getBacktrackChartStyle(mdAndUp: boolean): {
  height: string
  position: 'relative'
} {
  return {
    height: mdAndUp ? '300px' : '200px',
    position: 'relative',
  }
}
