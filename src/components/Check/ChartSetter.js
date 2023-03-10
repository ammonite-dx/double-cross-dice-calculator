import { range } from '@/data/Calculator'
import { getChartColor } from '@/data/ColorSetter';

function clipData (data, min, max) {

    /*
    概要:
        配列のクリッピング・四捨五入を行う。
    input:
        data (number[]): 描画するデータ。長さ1024の配列。
        min (number): 開始数。
        max (number): 終了数。
    output:
        result (number[]?): 開始数から終了数まででクリッピングし、小数第一位で四捨五入した入力データ。入力がnullの時はnull。
    */

    if (data) {
        return data.slice(min,max+1).map((element) => Math.round(element*1000)/10);
    } else {
        return null;
    }

}

export function getCheckChartData (checkData, setting) {

    /*
    概要:
        一般判定のスコアチャート描画用のデータを作成する。
    input:
        checkData: {
            dfclty: {
                opposed (boolean): 対決判定ならtrue。
                target (number): 判定難易度。
            }
            score: {
                action: {
                    distribution (number[]): アクション側の達成値確率分布。
                    upperTailProbability (number[]): アクション側の達成値上側確率。
                }
                reaction: {
                    distribution (number[]): リアクション側の達成値確率分布。
                    upperTailProbability (number[]): リアクション側の達成値上側確率。
                }
            }
            summary: {
                action: {
                    expectedValue (number): アクション側の達成値期待値。 
                    successRate (number): アクション側の成功率。
                }
                reaction: {
                    expectedValue (number): リアクション側の達成値期待値。
                    successRate (number): リアクション側の成功率。
                }
            }
        }
        setting: {
            min (number): 開始数。0以上999以下で、終了数よりも小さい整数。
            max (number): 終了数。0以上999以下で、開始数よりも大きい整数。
            mode (string): グラフの表示モード。'達成値がXとなる確率を表示'または'達成値がX以上となる確率を表示'のいずれか。
        }
    output:
        data: {
            labels (number[]): 開始数から終了数までの連続した整数値を要素として持つ配列。
            datasets: {
                label (string): データ系列名。
                data (number[]): データ系列。
                backgroundColor (Color): データ系列の背景色。
                borderColor (Color): データ系列の縁色。
            } 
        }
    */

    const labels = range(setting.min,setting.max);
    var datasets;
    if (checkData.dfclty.opposed) {
        if (setting.mode=='達成値がXとなる確率を表示') {
            datasets = [
                {label:'アクション側', data:clipData(checkData.score.action.distribution,setting.min,setting.max), backgroundColor:getChartColor(0) ,borderColor:getChartColor(0)},
                {label:'リアクション側', data:clipData(checkData.score.reaction.distribution,setting.min,setting.max), backgroundColor:getChartColor(1), borderColor:getChartColor(1)},
            ];
        } else {
            datasets = [
                {label:'アクション側', data:clipData(checkData.score.action.upperTailProbability,setting.min,setting.max), backgroundColor:getChartColor(0), borderColor:getChartColor(0)},
                {label:'リアクション側', data:clipData(checkData.score.reaction.upperTailProbability,setting.min,setting.max), backgroundColor:getChartColor(1), borderColor:getChartColor(1)},
            ];
        }
    } else {
        if (setting.mode=='達成値がXとなる確率を表示') {
            datasets = [
                {label:'アクション側', data:clipData(checkData.score.action.distribution,setting.min,setting.max), backgroundColor:getChartColor(0), borderColor:getChartColor(0)},
            ];
        } else {
            datasets = [
                {label:'アクション側', data:clipData(checkData.score.action.upperTailProbability,setting.min,setting.max), backgroundColor:getChartColor(0), borderColor:getChartColor(0)},
            ];
        }
    }
    return {labels:labels, datasets:datasets};

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