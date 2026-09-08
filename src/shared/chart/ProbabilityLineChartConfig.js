/**
 * Build the common Chart.js options used by probability line charts.
 * Feature-specific meaning is supplied through generic axis, tooltip, and
 * annotation values by the consumer.
 */
export function createProbabilityLineChartOptions ({
    xAxisTitle,
    tooltipTitlePrefix,
    annotations,
    chartType = 'line',
    xAxisType,
} = {}) {
    const isBar = chartType === 'bar'
    const isUpperTail = chartType === 'upper-tail'
    const plugins = {
        tooltip: {
            mode: 'index',
            callbacks: {
                title: (tooltipItem) => {
                    const raw = tooltipItem[0]?.raw
                    if (isBar && raw?.min !== undefined) {
                        return raw.min === raw.max
                            ? tooltipTitlePrefix + raw.min
                            : `${tooltipTitlePrefix}${raw.min}〜${raw.max}`
                    }
                    if (isUpperTail && raw?.threshold !== undefined) {
                        return `${tooltipTitlePrefix}${raw.threshold}以上`
                    }
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

    const xScale = {
        ...(xAxisType === undefined ? {} : { type: xAxisType }),
        title: { display: true, text: xAxisTitle },
    }
    const options = {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            x: xScale,
            y: { suggestedMin: 0, title: { display: true, text: '確率 [%]' } },
        },
        plugins,
    }
    if (isUpperTail) {
        options.animation = false
        options.elements = { line: { stepped: true, tension: 0 }, point: { radius: 0, hitRadius: 8 } }
    }
    if (isBar) {
        options.animation = false
    }
    return options
}

export function createProbabilityBarChartOptions ({
    xAxisTitle,
    tooltipTitlePrefix,
    annotations,
} = {}) {
    return createProbabilityLineChartOptions({
        xAxisTitle,
        tooltipTitlePrefix,
        annotations,
        chartType: 'bar',
        xAxisType: 'linear',
    })
}

export function createProbabilityUpperTailChartOptions ({
    xAxisTitle,
    tooltipTitlePrefix,
    annotations,
} = {}) {
    return createProbabilityLineChartOptions({
        xAxisTitle,
        tooltipTitlePrefix,
        annotations,
        chartType: 'upper-tail',
        xAxisType: 'linear',
    })
}

export function getProbabilityLineChartStyle (mdAndUp) {
    return {
        height: mdAndUp ? '400px' : '300px',
        position: 'relative',
    }
}
