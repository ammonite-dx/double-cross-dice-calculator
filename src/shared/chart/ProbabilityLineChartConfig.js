/**
 * Build the common Chart.js options used by probability line charts.
 * Feature-specific meaning is supplied through generic axis, tooltip, and
 * annotation values by the consumer.
 */
export function createProbabilityLineChartOptions ({
    xAxisTitle,
    tooltipTitlePrefix,
    annotations,
} = {}) {
    const plugins = {
        tooltip: {
            mode: 'index',
            callbacks: {
                title: (tooltipItem) => {
                    return tooltipTitlePrefix + tooltipItem[0].label
                },
                label: (tooltipItem) => {
                    return tooltipItem.dataset.label + ': '
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

export function getProbabilityLineChartStyle (mdAndUp) {
    return {
        height: mdAndUp ? '400px' : '300px',
        position: 'relative',
    }
}
