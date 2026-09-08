import { getChartColor } from '@/shared/theme/ChartPalette';
import { toChartPercentages } from '@/shared/presentation/ChartPercentages';
import {
    createProbabilityBarChartOptions,
    createProbabilityLineChartOptions,
    createProbabilityUpperTailChartOptions,
} from '@/shared/chart/ProbabilityLineChartConfig';
import {
    createProbabilityChartProjection,
    materializeProbabilityChartProjection,
} from '@/shared/presentation';

function createProjectedSideData(side, mode, maxRenderedPoints, label, color) {
    const display = side?.display;
    const plan = side?.plan;
    if (!display || !plan) {
        return null;
    }
    const projection = createProbabilityChartProjection(display, plan, {
        mode,
        maxRenderedPoints,
    });
    return materializeProbabilityChartProjection(projection, {
        label,
        backgroundColor: color,
        borderColor: color,
    });
}

function selectChartOptions(factory, mode, xAxisTitle, tooltipTitlePrefix) {
    if (mode === 'pmf') {
        return createProbabilityBarChartOptions({
            xAxisTitle,
            tooltipTitlePrefix,
        });
    }
    if (mode === 'upper-tail') {
        return createProbabilityUpperTailChartOptions({
            xAxisTitle,
            tooltipTitlePrefix,
        });
    }
    return factory({ xAxisTitle, tooltipTitlePrefix });
}

/**
 * Adapt the action side of the Attack score presentation to the
 * existing score chart. Attack's current chart has one series per combo and
 * intentionally does not draw the reaction side; the reaction side
 * remains available in the atomic presentation for summary/future consumers.
 */
export function getAttackScoreChartData (presentation, combos, options = {}) {
    const scorePresentation = presentation?.score ?? presentation;
    if (
        scorePresentation?.status !== 'ready'
        || !Array.isArray(scorePresentation.combos)
    ) {
        return null;
    }

    const comboCount = Array.isArray(combos)
        ? combos.length
        : scorePresentation.combos.length;
    const mode = options.mode ?? scorePresentation.mode;
    const maxRenderedPoints = options.maxRenderedPoints ?? 512;
    const hasProjectionSources = scorePresentation.combos.some((combo) => (
        combo?.action?.display && combo?.action?.plan
    ));
    const useProjection = options.maxRenderedPoints !== undefined
    if (useProjection && hasProjectionSources && (mode === 'pmf' || mode === 'upper-tail')) {
        const datasets = scorePresentation.combos.map((combo, index) => {
            const attackCombo = combos?.[index];
            const id = attackCombo?.id ?? combo.id ?? index;
            const color = Number.isFinite(id)
                ? getChartColor(id)
                : getChartColor(index);
            return createProjectedSideData(
                combo.action,
                mode,
                maxRenderedPoints,
                attackCombo?.name ?? `コンボ${index + 1}`,
                color,
            )?.datasets?.[0] ?? null;
        });
        if (datasets.some((dataset) => dataset === null) || datasets.length !== comboCount) {
            return null;
        }
        const first = createProjectedSideData(
            scorePresentation.combos[0]?.action,
            mode,
            maxRenderedPoints,
            undefined,
            undefined,
        );
        return {
            chartType: first?.chartType ?? (mode === 'pmf' ? 'bar' : 'line'),
            projection: first?.projection,
            datasets,
        };
    }
    const datasets = scorePresentation.combos.map((combo, index) => {
        const action = combo?.action;
        const dataset = action?.chart?.datasets?.[0];
        if (!dataset) {
            return null;
        }
        const attackCombo = combos?.[index];
        const id = attackCombo?.id ?? combo.id ?? index;
        const color = Number.isFinite(id)
            ? getChartColor(id)
            : getChartColor(index);
        return {
            ...dataset,
            data: toChartPercentages(dataset.data),
            label: attackCombo?.name ?? `コンボ${index + 1}`,
            backgroundColor: color,
            borderColor: color,
        };
    });
    if (
        datasets.some((dataset) => dataset === null)
        || datasets.length !== comboCount
    ) {
        return null;
    }

    return {
        labels: (
            scorePresentation.combos[0]?.action
        )?.chart?.labels ?? [],
        datasets,
    };
}

export function getAttackScoreChartOptions ({ mode } = {}) {

    /*
    概要:
        攻撃判定のスコアチャート描画用のオプションを作成する。
    input: None
    output:
        options: Chart.js options.
    */

    return selectChartOptions(
        createProbabilityLineChartOptions,
        mode,
        '達成値',
        '達成値',
    );

}

function getIndexedChartColor (id, index) {
    return Number.isFinite(id) ? getChartColor(id) : getChartColor(index);
}

/**
 * Combine the independently planned combo/total chart views into
 * the dataset shape consumed by the existing DamageChart component. This
 * boundary converts probability data into the percentage array expected by
 * the existing damage chart without mutating the source data.
 */
export function getAttackDamageChartData (presentation, combos, options = {}) {
    if (
        presentation?.status !== 'ready'
        || !Array.isArray(presentation.combos)
        || !presentation.total?.chart
    ) {
        return null;
    }

    const comboCount = Array.isArray(combos)
        ? combos.length
        : presentation.combos.length;
    const mode = options.mode ?? presentation.mode;
    const maxRenderedPoints = options.maxRenderedPoints ?? 512;
    const hasProjectionSources = presentation.combos.some((combo) => (
        combo?.display && combo?.plan
    ));
    const useProjection = options.maxRenderedPoints !== undefined
    if (useProjection && hasProjectionSources && (mode === 'pmf' || mode === 'upper-tail')) {
        const datasets = presentation.combos.map((side, index) => {
            const combo = combos?.[index];
            const id = combo?.id ?? side.id;
            return createProjectedSideData(
                side,
                mode,
                maxRenderedPoints,
                combo?.name ?? `コンボ${index + 1}`,
                getIndexedChartColor(id, index),
            )?.datasets?.[0] ?? null;
        });
        if (datasets.some((dataset) => dataset === null)) {
            return null;
        }
        if (comboCount > 1) {
            const total = createProjectedSideData(
                presentation.total,
                mode,
                maxRenderedPoints,
                '合計',
                'secondary',
            );
            if (!total) {
                return null;
            }
            datasets.push(total.datasets[0]);
        }
        const first = createProjectedSideData(
            presentation.combos[0],
            mode,
            maxRenderedPoints,
            undefined,
            undefined,
        );
        return {
            chartType: first?.chartType ?? (mode === 'pmf' ? 'bar' : 'line'),
            projection: first?.projection,
            datasets,
        };
    }
    const datasets = presentation.combos.map((side, index) => {
        const dataset = side?.chart?.datasets?.[0];
        if (!dataset) {
            return null;
        }
        const combo = combos?.[index];
        const id = combo?.id ?? side.id;
        return {
            ...dataset,
            data: toChartPercentages(dataset.data),
            label: combo?.name ?? `コンボ${index + 1}`,
            backgroundColor: getIndexedChartColor(id, index),
            borderColor: getIndexedChartColor(id, index),
        };
    });
    if (datasets.some((dataset) => dataset === null)) {
        return null;
    }

    if (comboCount > 1) {
        const totalDataset = presentation.total.chart.datasets?.[0];
        if (!totalDataset) {
            return null;
        }
        datasets.push({
            ...totalDataset,
            data: toChartPercentages(totalDataset.data),
            label: '合計',
            backgroundColor: 'secondary',
            borderColor: 'secondary',
        });
    }

    return {
        labels: presentation.total.chart.labels,
        datasets,
    };
}

export function getAttackDamageChartOptions ({ mode } = {}) {

    /*
    概要:
        攻撃判定のダメージチャート描画用のオプションを作成する。
    input: None
    output:
        options: Chart.js options.
    */

    return selectChartOptions(
        createProbabilityLineChartOptions,
        mode,
        'ダメージ',
        'ダメージ',
    );

}
