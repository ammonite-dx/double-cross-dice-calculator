import { getChartColor } from '@/data/ColorSetter';

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

    const responsive = true;
    const maintainAspectRatio = false;
    const scales = {
        x: {title:{display:true, text:'達成値'}},
        y: {suggestedMin:0, title:{display:true, text:'確率 [%]'}},
    };
    const tooltip = {
        mode: 'index',
        callbacks: {
            title: (tooltipItem)=>{return '達成値'+tooltipItem[0].label},
            label: (tooltipItem)=>{return tooltipItem.dataset.label+': '+tooltipItem.formattedValue+'%'},
        },
    };
    const datalabels = {
        display: false,
    };
    var plugins = {annotation:{annotations: {}}, tooltip:tooltip, datalabels:datalabels};
    if (dfclty.opposed) {
        return {responsive:responsive, maintainAspectRatio:maintainAspectRatio, scales:scales, plugins:plugins};
    } else {
        const content = '難易度: ' + String(dfclty.target);
        plugins.annotation.annotations = {
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
        return {responsive:responsive, maintainAspectRatio:maintainAspectRatio, scales:scales, plugins:plugins};
    }

}

export function getCheckChartStyle (mdAndUp) {

    /*
    概要:
        一般判定のスコアチャート描画用のスタイルを作成する。
    input:
        smAndUp (boolean): ウィンドウサイズがsm以上ならtrue。
    output:
        style: {
            height (string): チャートの高さ。
            position (string): 
        }
    */

    var height;
    if(mdAndUp){
        height = '400px';
    } else {
        height = '300px';
    }

    const position = 'relative';

    return {height:height, position:position};

}
