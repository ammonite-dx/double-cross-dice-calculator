import { getChartColor } from '@/data/ColorSetter';
import { toChartPercentages } from '@/presentation/ChartPercentages';
import { createProbabilityLineChartOptions } from '@/shared/chart/ProbabilityLineChartConfig';

/**
 * Adapt the action side of the canonical Attack score presentation to the
 * existing score chart. Attack's current chart has one series per combo and
 * intentionally does not draw the reaction side; the reaction canonical side
 * remains available in the atomic presentation for summary/future consumers.
 */
export function getCanonicalAttackScoreChartData (presentation, combos) {
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

export function getAttackScoreChartOptions () {

    /*
    概要:
        攻撃判定のスコアチャート描画用のオプションを作成する。
    input: None
    output:
        options: Chart.js options.
    */

    return createProbabilityLineChartOptions({
        xAxisTitle: '達成値',
        tooltipTitlePrefix: '達成値',
    });

}

function getCanonicalChartColor (id, index) {
    return Number.isFinite(id) ? getChartColor(id) : getChartColor(index);
}

/**
 * Combine the independently planned canonical combo/total chart views into
 * the dataset shape consumed by the existing DamageChart component. This
 * boundary converts canonical probability data into the percentage array
 * expected by the existing damage chart without mutating the canonical data.
 */
export function getCanonicalAttackDamageChartData (presentation, combos) {
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
            backgroundColor: getCanonicalChartColor(id, index),
            borderColor: getCanonicalChartColor(id, index),
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

export function getAttackDamageChartOptions () {

    /*
    概要:
        攻撃判定のダメージチャート描画用のオプションを作成する。
    input: None
    output:
        options: Chart.js options.
    */

    return createProbabilityLineChartOptions({
        xAxisTitle: 'ダメージ',
        tooltipTitlePrefix: 'ダメージ',
    });

}
