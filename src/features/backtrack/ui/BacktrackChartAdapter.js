export function getBacktrackChartData(chart) {
  return {
    labels: chart.labels,
    datasets: [{
      data: chart.probabilities,
      backgroundColor: chart.backgroundColors,
    }],
  }
}

export function getBacktrackChartOptions(chart, smAndUp) {
  const title = {
    display: true,
    text: chart.title,
  }
  const legend = {
    display: false,
  }
  const tooltip = {
    callbacks: {
      title: () => undefined,
      label: (tooltipItem) => `${tooltipItem.label}: ${tooltipItem.formattedValue}%`,
    },
  }
  const datalabels = {
    color: 'white',
    labels: {
      title: {
        font: {
          size: smAndUp ? 12 : 8,
          weight: /** @type {'bold'} */ ('bold'),
        },
      },
    },
    textAlign: /** @type {'center'} */ ('center'),
    formatter: (value, context) => {
      const label = context.chart.data.labels[context.dataIndex]
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

export function getBacktrackChartStyle(mdAndUp) {
  return {
    height: mdAndUp ? '300px' : '200px',
    position: 'relative',
  }
}
