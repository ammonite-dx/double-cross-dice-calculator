import { getChartColor } from '@/shared/theme/ChartPalette';
import {
    createProbabilityBarChartOptions,
    createProbabilityLineChartOptions,
    createProbabilityUpperTailChartOptions,
} from '@/shared/chart/ProbabilityLineChartConfig';
import {
    CHECK_PRESENTATION_PROJECTION_SOURCE,
} from '../model/CheckPresentation';
import {
    createProbabilityChartProjection,
    materializeProbabilityChartProjection,
} from '@/shared/presentation';

function getProjectionData(source, mode, maxRenderedPoints, label, color) {
    if (!source?.display || !source?.plan) {
        return null;
    }
    const projection = createProbabilityChartProjection(
        source.display,
        source.plan,
        { mode, maxRenderedPoints },
    );
    const data = materializeProbabilityChartProjection(projection, {
        label,
        backgroundColor: color,
        borderColor: color,
    });
    return data === null ? null : data;
}

export function getCheckChartData(
    presentation,
    { maxRenderedPoints = 512 } = {},
) {
    if (presentation?.status !== 'ready') {
        return null;
    }
    const source = presentation[CHECK_PRESENTATION_PROJECTION_SOURCE];
    if (!source?.action) {
        return presentation.chart;
    }
    const mode = presentation.mode;
    const action = getProjectionData(
        source.action,
        mode,
        maxRenderedPoints,
        'アクション側',
        getChartColor(0),
    );
    if (action === null) {
        return null;
    }
    if (!presentation.opposed || !source.reaction) {
        return action;
    }
    const reaction = getProjectionData(
        source.reaction,
        mode,
        maxRenderedPoints,
        'リアクション側',
        getChartColor(1),
    );
    if (reaction === null) {
        return null;
    }
    return {
        chartType: action.chartType,
        projection: action.projection,
        datasets: [action.datasets[0], reaction.datasets[0]],
    };
}

export function getCheckChartOptions (dfclty) {

    /*
    概要:
        一般判定のスコアチャート描画用のオプションを作成する。
    input:
        dfclty: {
            opposed (boolean): 対決判定ならtrue。
            target (number): 判定難易度。
        }
    output:
        options: {
            responsive (boolean): レスポンシブならtrue。
            maintainAspectRatio (boolean): アスペクト比を固定するならtrue。
            scales: {
                x: {
                    title:{
                        display (boolean): x軸ラベルを表示するならtrue。
                        text (string): x軸ラベル。
                    },
                },
                y: {
                    min (number): y軸の最小値。
                    title:{
                        display (boolean): y軸ラベルを表示するならtrue。
                        text (string): y軸ラベル。
                    },
                },
            },
            plugins: {
                tooltip: {
                    mode (string): 
                    callbacks: {
                        title (string): ツールチップのタイトル。
                        label (string): ツールチップのラベル。
                    }
                }
                annotation: {
                    annotations: {
                        line1: {
                            type (string): アノテーションのタイプ。
                            scaleID (string): ラインを引く方向。
                            value (number): ラインの位置。
                            borderColor (Color): ラインの色。
                            borderWidth (number): ラインの太さ。
                            label: {
                                display (boolean): ラベルを表示するならtrue。
                                backgroundColor (Color): ラベルの背景色。
                                borderColor (Color): ラベルの縁色。
                                borderRadius (number): ラベルの角の半径
                                borderWidth (number): ラベルの縁の太さ。
                                content (string): ラベルの文字列。
                                rotation (string): ラベルの回転モード。
                            },
                        },
                    },
                },
            },
        }
    */

    let annotations = {};
    if (dfclty.opposed) {
        const optionsFactory = dfclty.mode === 'pmf'
            ? createProbabilityBarChartOptions
            : dfclty.mode === 'upper-tail'
                ? createProbabilityUpperTailChartOptions
                : createProbabilityLineChartOptions;
        return optionsFactory({
            xAxisTitle: '達成値',
            tooltipTitlePrefix: '達成値',
            annotations,
        });
    } else {
        const content = '難易度: ' + String(dfclty.target);
        annotations = {
            line1: {
                type: 'line',
                scaleID: 'x',
                value: dfclty.target,
                borderColor: getChartColor(1),
                borderWidth: 3,
                label: {
                    display: true,
                    backgroundColor: getChartColor(1),
                    borderColor: getChartColor(1),
                    borderRadius: 10,
                    borderWidth: 2,
                    content: content,
                    rotation: 0,
                },
            },
        };
        const optionsFactory = dfclty.mode === 'pmf'
            ? createProbabilityBarChartOptions
            : dfclty.mode === 'upper-tail'
                ? createProbabilityUpperTailChartOptions
                : createProbabilityLineChartOptions;
        return optionsFactory({
            xAxisTitle: '達成値',
            tooltipTitlePrefix: '達成値',
            annotations,
        });
    }

}
