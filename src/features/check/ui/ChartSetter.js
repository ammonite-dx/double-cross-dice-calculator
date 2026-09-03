import { getChartColor } from '@/data/ColorSetter';
import { createProbabilityLineChartOptions } from '@/shared/chart/ProbabilityLineChartConfig';

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
        return createProbabilityLineChartOptions({
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
        return createProbabilityLineChartOptions({
            xAxisTitle: '達成値',
            tooltipTitlePrefix: '達成値',
            annotations,
        });
    }

}
