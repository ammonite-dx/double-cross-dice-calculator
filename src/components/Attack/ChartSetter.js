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

export function getAttackScoreChartData (attackData, setting) {

    /*
    概要:
        一般判定のスコアチャート描画用のデータを作成する。
    input:
        attackData: {
            combos: [{
                id (number): コンボid。自然数値。
                name (string): コンボ名。
                show (boolean): インプットパネルにコンボの詳細を表示するならTrue。
                data: {
                    params: {
                        action: {
                            score: {
                                dice:
                                critical:
                                skill:
                            }
                            damage: {
                                dice:
                                value:
                            }
                        }
                        reaction: {
                            score: {
                                dice:
                                critical:
                                skill:
                            }
                            damage: {
                                dice:
                                value:
                            }
                        }
                    }
                    score: {
                        action: {
                            distribution (number[]): 攻撃側の達成値確率分布。
                            upperTailProbability (number[]): 攻撃側の達成値上側確率。
                        }
                        reaction: {
                            distribution (number[]): 防御側の達成値確率分布。
                            upperTailProbability (number[]): 防御側の達成値上側確率。
                        }
                    }
                    scoreSummary: {
                        action: {
                            expectedValue (number): 攻撃側の達成値期待値。
                            successRate (number): 攻撃の命中率。
                        }
                        reaction: {
                            expectedValue (number): 防御側の達成値期待値。
                            successRate (number): 攻撃の回避率。
                        }
                    }
                    damage: {
                        distribution (number[]): ダメージの確率分布。
                        upperTailProbability (number[]): ダメージの上側確率。
                    }
                    damageSummary: {
                        expectedValue (number): ダメージ期待値。
                    }
                }
            }]
            sum (number): 合計ダメージ。
        }
        setting: {
            min (number): 開始数。0以上999以下で、終了数よりも小さい整数。
            max (number): 終了数。0以上999以下で、開始数よりも大きい整数。
            mode (string): グラフの表示モード。'達成値がXとなる確率を表示'または'達成値がX以上となる確率を表示'のいずれか。
        }
    output:
        data: [{
            labels (number[]): 開始数から終了数までの連続した整数値を要素として持つ配列。
            datasets: {
                label (string): データ系列名。
                data (number[]): データ系列。
                backgroundColor (Color): データ系列の背景色。
                borderColor (Color): データ系列の縁色。
            } 
        }]
    */

    const labels = range(setting.min,setting.max);
    var datasets;
    if (setting.mode=='達成値がXとなる確率を表示') {
        datasets = attackData.combos.map((combo) => ({label:combo.name, data:clipData(combo.data.score.action.distribution,setting.min,setting.max), backgroundColor:getChartColor(combo.id) ,borderColor:getChartColor(combo.id)}));
    } else {
        datasets = attackData.combos.map((combo) => ({label:combo.name, data:clipData(combo.data.score.action.upperTailProbability,setting.min,setting.max), backgroundColor:getChartColor(combo.id) ,borderColor:getChartColor(combo.id)}));
    }
    return {labels:labels, datasets:datasets};

}

export function getAttackScoreChartOptions () {

    /*
    概要:
        攻撃判定のスコアチャート描画用のオプションを作成する。
    input: None
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
            }
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
    }
    var plugins = {tooltip:tooltip, datalabels:datalabels};
    return {responsive:responsive, maintainAspectRatio:maintainAspectRatio, scales:scales, plugins:plugins};

}

export function getAttackScoreChartStyle (mdAndUp) {

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

export function getAttackDamageChartData (attackData, setting) {

    /*
    概要:
        攻撃判定のダメージチャート描画用のデータを作成する。
    input:
        attackData: {
            combos: [{
                id (number): コンボid。自然数値。
                name (string): コンボ名。
                show (boolean): インプットパネルにコンボの詳細を表示するならTrue。
                data: {
                    params: {
                        action: {
                            score: {
                                dice:
                                critical:
                                skill:
                            }
                            damage: {
                                dice:
                                value:
                            }
                        }
                        reaction: {
                            score: {
                                dice:
                                critical:
                                skill:
                            }
                            damage: {
                                dice:
                                value:
                            }
                        }
                    }
                    score: {
                        action: {
                            distribution (number[]): 攻撃側の達成値確率分布。
                            upperTailProbability (number[]): 攻撃側の達成値上側確率。
                        }
                        reaction: {
                            distribution (number[]): 防御側の達成値確率分布。
                            upperTailProbability (number[]): 防御側の達成値上側確率。
                        }
                    }
                    scoreSummary: {
                        action: {
                            expectedValue (number): 攻撃側の達成値期待値。
                            successRate (number): 攻撃の命中率。
                        }
                        reaction: {
                            expectedValue (number): 防御側の達成値期待値。
                            successRate (number): 攻撃の回避率。
                        }
                    }
                    damage: {
                        distribution (number[]): ダメージの確率分布。
                        upperTailProbability (number[]): ダメージの上側確率。
                    }
                    damageSummary: {
                        expectedValue (number): ダメージ期待値。
                    }
                }
            }]
            sum (number): 合計ダメージ。
        }
        setting: {
            min (number): 開始数。0以上999以下で、終了数よりも小さい整数。
            max (number): 終了数。0以上999以下で、開始数よりも大きい整数。
            mode (string): グラフの表示モード。'達成値がXとなる確率を表示'または'達成値がX以上となる確率を表示'のいずれか。
        }
    output:
        data: [{
            labels (number[]): 開始数から終了数までの連続した整数値を要素として持つ配列。
            datasets: {
                label (string): データ系列名。
                data (number[]): データ系列。
                backgroundColor (Color): データ系列の背景色。
                borderColor (Color): データ系列の縁色。
            } 
        }]
    */

    const labels = range(setting.min,setting.max);
    var datasets;
    if (setting.mode=='ダメージがXとなる確率を表示') {
        datasets = attackData.combos.map((combo) => ({label:combo.name, data:clipData(combo.data.damage.distribution,setting.min,setting.max), backgroundColor:getChartColor(combo.id) ,borderColor:getChartColor(combo.id)}));
        if (attackData.combos.length>1) {
            datasets.push({label:'合計', data:clipData(attackData.totalDamage.distribution,setting.min,setting.max), backgroundColor:"secondary" ,borderColor:"secondary"});
        }
    } else {
        datasets = attackData.combos.map((combo) => ({label:combo.name, data:clipData(combo.data.damage.upperTailProbability,setting.min,setting.max), backgroundColor:getChartColor(combo.id) ,borderColor:getChartColor(combo.id)}));
        if (attackData.combos.length>1) {
            datasets.push({label:'合計', data:clipData(attackData.totalDamage.upperTailProbability,setting.min,setting.max), backgroundColor:"secondary" ,borderColor:"secondary"});
        }
    }
    return {labels:labels, datasets:datasets};

}

export function getAttackDamageChartOptions () {

    /*
    概要:
        攻撃判定のダメージチャート描画用のオプションを作成する。
    input: None
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
            }
        }
    */

    const responsive = true;
    const maintainAspectRatio = false;
    const scales = {
        x: {title:{display:true, text:'ダメージ'}},
        y: {suggestedMin:0, title:{display:true, text:'確率 [%]'}},
    };
    const tooltip = {
        mode: 'index',
        callbacks: {
            title: (tooltipItem)=>{return 'ダメージ'+tooltipItem[0].label},
            label: (tooltipItem)=>{return tooltipItem.dataset.label+': '+tooltipItem.formattedValue+'%'},
        },
    };
    const datalabels = {
        display: false,
    }
    var plugins = {tooltip:tooltip, datalabels:datalabels};
    return {responsive:responsive, maintainAspectRatio:maintainAspectRatio, scales:scales, plugins:plugins};

}

export function getAttackDamageChartStyle (mdAndUp) {

    /*
    概要:
        攻撃判定のダメージチャート描画用のスタイルを作成する。
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