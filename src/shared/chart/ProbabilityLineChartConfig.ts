/**
 * Build the common Chart.js options used by probability line charts.
 * Feature-specific meaning is supplied through generic axis, tooltip, and
 * annotation values by the consumer.
 */
export function createProbabilityLineChartOptions({
    xAxisTitle,
    tooltipTitlePrefix,
    annotations,
    distributionMode = 'pmf',
}: ProbabilityLineChartInput): ProbabilityLineChartOptions {
    const isUpperTail = distributionMode === 'upper-tail'
    const plugins: Record<string, unknown> = {
        tooltip: {
            mode: 'index',
            callbacks: {
                title: (tooltipItem: TooltipItem<'line'>[]) => {
                    const title = tooltipTitlePrefix + (tooltipItem[0]?.label ?? '')
                    return isUpperTail ? title + '以上' : title
                },
                label: (tooltipItem: TooltipItem<'line'>) => {
                    return (tooltipItem.dataset.label ?? '') + ': '
                        + tooltipItem.formattedValue + '%'
                },
            },
        },
        datalabels: {
            display: false,
        },
    }

    if (annotations !== undefined) {
        plugins.annotation = { annotations }
    }

    return {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            x: { title: { display: true, text: xAxisTitle } },
            y: { suggestedMin: 0, title: { display: true, text: '確率 [%]' } },
        },
        plugins,
    }
}

export function getProbabilityLineChartStyle(mdAndUp: boolean): {
    height: string
    position: 'relative'
} {
    return {
        height: mdAndUp ? '400px' : '300px',
        position: 'relative',
    }
}
import type { ChartOptions, TooltipItem } from 'chart.js'

export type ProbabilityDistributionMode = 'pmf' | 'upper-tail'

export type ProbabilityLineChartOptions = Pick<
  ChartOptions<'line'>,
  'responsive' | 'maintainAspectRatio'
> & {
  readonly scales: Record<string, unknown>
  readonly plugins: Record<string, unknown>
}

interface ProbabilityLineChartInput {
  readonly xAxisTitle: string
  readonly tooltipTitlePrefix: string
  readonly annotations?: unknown
  readonly distributionMode?: ProbabilityDistributionMode
}
