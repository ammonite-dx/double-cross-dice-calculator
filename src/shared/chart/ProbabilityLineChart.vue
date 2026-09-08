<script setup>

    import { computed, onMounted, onUnmounted, ref } from 'vue'
    import { useDisplay } from 'vuetify'
    import {
        BarElement,
        CategoryScale,
        Chart,
        Legend,
        LinearScale,
        LineElement,
        PointElement,
        Title,
        Tooltip,
    } from 'chart.js'
    import annotationPlugin from 'chartjs-plugin-annotation'
    import { Bar, Line } from 'vue-chartjs'
    import { getProbabilityLineChartStyle } from './ProbabilityLineChartConfig'
    import { getProbabilityRenderBudget } from './ProbabilityRenderBudget'

    Chart.register(
        BarElement,
        CategoryScale,
        LinearScale,
        PointElement,
        LineElement,
        Title,
        Tooltip,
        Legend,
        annotationPlugin,
    )

    const props = defineProps({
        data: {
            type: Object,
            default: null,
        },
        options: {
            type: Object,
            required: true,
        },
        project: {
            type: Function,
            default: null,
        },
        accessibleName: {
            type: String,
            default: '確率分布チャート',
        },
    })

    const { mdAndUp } = useDisplay()
    const style = computed(() => getProbabilityLineChartStyle(mdAndUp.value))
    const container = ref(null)
    const width = ref(0)
    let resizeObserver = null

    const renderedData = computed(() => {
        if (typeof props.project === 'function') {
            return props.project(getProbabilityRenderBudget(width.value))
        }
        return props.data
    })
    const chartType = computed(() => renderedData.value?.chartType ?? 'line')
    const chartComponent = computed(() => chartType.value === 'bar' ? Bar : Line)
    const chartData = computed(() => {
        if (renderedData.value === null || renderedData.value === undefined) {
            return null
        }
        const data = { ...renderedData.value }
        delete data.chartType
        delete data.projection
        return data
    })
    const projectionNotice = computed(() => {
        const projection = renderedData.value?.projection
        if (!projection?.aggregated) {
            return null
        }
        if (projection.mode === 'upper-tail') {
            return '表示範囲から代表thresholdを抽出しています。各点はその値以上となる確率です。'
        }
        return `表示範囲${projection.displayWindow.min}〜${projection.displayWindow.max}を${projection.renderedPointCount}区間に集約して表示しています。`
    })

    onMounted(() => {
        if (typeof ResizeObserver === 'undefined' || container.value === null) {
            return
        }
        resizeObserver = new ResizeObserver((entries) => {
            const nextWidth = entries[0]?.contentRect?.width
            if (Number.isFinite(nextWidth) && nextWidth > 0) {
                width.value = nextWidth
            }
        })
        resizeObserver.observe(container.value)
    })
    onUnmounted(() => resizeObserver?.disconnect())

</script>

<template>
    <div ref="container" role="img" :aria-label="props.accessibleName">
        <component :is="chartComponent" v-if="chartData !== null" :data="chartData" :options="props.options" :style="style" />
        <p v-if="projectionNotice !== null" class="text-caption text-medium-emphasis" aria-live="polite">{{ projectionNotice }}</p>
    </div>
</template>
