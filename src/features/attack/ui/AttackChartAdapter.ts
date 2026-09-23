import { getChartColor } from '@/shared/theme/ChartPalette';
import { toChartPercentages } from '@/shared/presentation/ChartPercentages';
import { createProbabilityLineChartOptions } from '@/shared/chart/ProbabilityLineChartConfig';
import type { ProbabilityLineChartOptions } from '@/shared/chart/ProbabilityLineChartConfig'
import type { ChartData, ChartDataset } from 'chart.js'
import type { DisplayMode } from '@/domain/CalculationInputs'
import type {
    AttackDisplayPresentation,
    AttackScoreDisplayPresentation,
} from '../model/AttackPresentationTypes'
import type { AttackCombo } from '../model/AttackComboState'
import type { ChartJsDataset } from '@/shared/presentation/DistributionProjectionTypes'

type ComboLabel = Pick<AttackCombo, 'id' | 'name'>
type ProbabilityChartData = ChartData<'line', number[], number>

function toPercentageData(dataset: ChartJsDataset): number[] {
    return toChartPercentages(dataset.data) ?? []
}

/**
 * Adapt the action side of the Attack score presentation to the
 * existing score chart. Attack's current chart has one series per combo and
 * intentionally does not draw the reaction side; the reaction side
 * remains available in the atomic presentation for summary/future consumers.
 */
export function getAttackScoreChartData (
    presentation: AttackDisplayPresentation | AttackScoreDisplayPresentation | null,
    combos?: readonly ComboLabel[],
): ProbabilityChartData | null {
    const scorePresentation = presentation && 'score' in presentation
        ? presentation.score
        : presentation;
    if (
        !scorePresentation
        || !('combos' in scorePresentation)
        || scorePresentation.status !== 'ready'
    ) {
        return null;
    }

    const comboCount = Array.isArray(combos)
        ? combos.length
        : scorePresentation.combos.length;
    const candidates = scorePresentation.combos.map((combo, index) => {
        const action = combo?.action;
        const dataset = action?.chart?.datasets?.[0];
        if (!dataset) {
            return null;
        }
        const attackCombo = combos?.[index];
        const id = attackCombo?.id ?? combo?.id ?? index;
        const color = getIndexedChartColor(id, index)
        return {
            data: toPercentageData(dataset),
            label: attackCombo?.name ?? `コンボ${index + 1}`,
            backgroundColor: color,
            borderColor: color,
        };
    });
    if (
        candidates.some((dataset) => dataset === null)
        || candidates.length !== comboCount
    ) {
        return null;
    }

    const datasets: ChartDataset<'line', number[]>[] = candidates
        .filter((dataset): dataset is NonNullable<typeof dataset> => dataset !== null)
        .map((dataset) => ({ ...dataset }))
    const firstChart = scorePresentation.combos[0]?.action.chart
    return {
        labels: Array.from(firstChart?.labels ?? []),
        datasets,
    };
}

export function getAttackScoreChartOptions (
    { mode }: { mode?: DisplayMode } = {},
): ProbabilityLineChartOptions {

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
        distributionMode: mode,
    });

}

function getIndexedChartColor (id: string | number | undefined, index: number): string {
    return typeof id === 'number' && Number.isFinite(id) ? getChartColor(id) : getChartColor(index);
}

/**
 * Combine the independently planned combo/total chart views into
 * the dataset shape consumed by the existing DamageChart component. This
 * boundary converts probability data into the percentage array expected by
 * the existing damage chart without mutating the source data.
 */
export function getAttackDamageChartData (
    presentation: AttackDisplayPresentation | null,
    combos?: readonly ComboLabel[],
): ProbabilityChartData | null {
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
    const candidates = presentation.combos.map((side, index) => {
        const dataset = side?.chart?.datasets?.[0];
        if (!dataset) {
            return null;
        }
        const combo = combos?.[index];
        const id = combo?.id ?? side.id;
        return {
            data: toPercentageData(dataset),
            label: combo?.name ?? `コンボ${index + 1}`,
            backgroundColor: getIndexedChartColor(id, index),
            borderColor: getIndexedChartColor(id, index),
        };
    });
    if (candidates.some((dataset) => dataset === null)) {
        return null;
    }

    const datasets: ChartDataset<'line', number[]>[] = candidates
        .filter((dataset): dataset is NonNullable<typeof dataset> => dataset !== null)
        .map((dataset) => ({ ...dataset }))
    if (comboCount > 1) {
        const totalDataset = presentation.total.chart.datasets?.[0];
        if (!totalDataset) {
            return null;
        }
        datasets.push({
            data: toPercentageData(totalDataset),
            label: '合計',
            backgroundColor: 'secondary',
            borderColor: 'secondary',
        });
    }

    return {
        labels: Array.from(presentation.total.chart.labels ?? []),
        datasets,
    };
}

export function getAttackDamageChartOptions (
    { mode }: { mode?: DisplayMode } = {},
): ProbabilityLineChartOptions {

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
        distributionMode: mode,
    });

}
