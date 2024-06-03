import dx from './dx.json';
import dr from './dr.json';
import d10 from './d10.json';
import livingdead from './livingdead.json';
import { sumDistribution,subDistribution } from './FFT';

function getExpectedValue (distribution) {

    /*
    概要:
        与えられた確率分布の期待値を返す関数。
    input:
        distribution (number[]): i番目の要素にx=iとなる確率を持つ配列。
    output:
        result (number): xの期待値。
    */

    if (distribution) {
        var result = 0;
        for (let i = 1; i < 1024; i++) {
            result += i*distribution[i];
        }
        result = Math.round(result*10)/10;
        return result;
    } else {
        return null;
    }

}

export function range(min, max) {

    /*
    概要:
        開始数から終了数までの連続した整数値を要素として持つ配列を返す。
    input:
        min (number): 開始数。0以上で終了数より小さい整数値。
        max (number): 終了数。開始数より大きく1024以下の整数値。
    output:
        result (number[]): 開始数から終了数までの連続した整数値を要素として持つ配列。
    */

    const res = [...Array(1024).keys()];
    return res.slice(min,max+1);

}

export function getScore (params,fix=false) {

    /*
    概要:
        与えられたダイス数、クリティカル値、判定固定値の下での達成値の分布・上側確率を計算する。
    input:
        params: {
            dice (number): 判定に用いるダイス数。0以上99以下の整数値。
            critical (number): 判定のクリティカル値。2以上11以下の整数値。
            skill (number): 判定の固定値。-999以上999以下の整数値。
            yousei (number): 《妖精の手》回数。0以上9以下の整数値。
            shihai (number): 《支配の領域》対象ダイス数。0異常19以下の整数値。
        }
        fix (boolean):達成値が技能値に固定されるならtrue。デフォルト値:false。
    output:
        score: {
            distribution (number[]): i番目の要素に達成値がiとなる確率を持つ長さ1024の配列。
            upperTailProbability (number[]): i番目の要素に達成値がi以上となる確率を持つ長さ1024の配列。
        }
    */

    var distribution = Array(1024).fill(0)
    var upperTailProbability = Array(1024).fill(0)

    if (fix) {

        distribution[params.skill] = 1.0;
        for (let i=0; i<=params.skill; i++){
            upperTailProbability[i] = 1.0;
        }

    } else {

        // ダイスの出目を計算
        const diceResultInfo = dx[params.shihai][params.dice][params.critical-2];
        const diceResultLowerFill = Array(diceResultInfo.pre).fill(0);
        const diceResultUpperFill = Array(diceResultInfo.post).fill(0);
        var diceResult = diceResultLowerFill.concat(diceResultInfo.val).concat(diceResultUpperFill);
        
        // 《妖精の手》等による振り直し
        if (params.yousei>=0){
            const youseiInfo = dx[0][1][params.critical-2];
            const youseiLowerFill = Array(youseiInfo.pre).fill(0);
            const youseiUpperFill = Array(youseiInfo.post).fill(0);
            var youseiResult = youseiLowerFill.concat(youseiInfo.val).concat(youseiUpperFill);
            for (let i=0; i<params.yousei; i++) {
                // 最後のダイスの出目を10に変更
                diceResult = Array.from({length:1024}, (_,i) => i%10===0 ? diceResult.slice(Math.max(0,i-9), i+1).reduce((sum,element) => sum+element, 0.0) : 0.0);
                diceResult[1023] = 1.0 - diceResult.slice(0,1023).reduce((sum,element) => sum+element, 0);
                // クリティカル値が10以下なら振り足し
                if (params.critical<=10) {
                    diceResult = sumDistribution(diceResult, youseiResult);
                }
            }
        }

        // ファンブルの確率を計算
        const fumble = diceResult[0] + diceResult[1];
        diceResult[0] = 0;
        diceResult[1] = 0;

        if (params.skill<0) {
            // 技能値が負の場合
            const lowerProtrusion = diceResult.slice(0,-params.skill).reduce((sum,element) => sum+element, 0); //達成値が負になる確率の和を計算
            const main = diceResult.slice(-params.skill); //達成値が0,1,...,(1023+技能値)となる確率をそれぞれ計算
            const upperFill = Array(-params.skill).fill(0); //達成値が(1024+技能値)以上になる確率は0とする
            distribution = main.concat(upperFill); //達成値が0,1,...,1023となる確率をそれぞれ計算
            distribution[0] += lowerProtrusion+fumble; //達成値が0となる確率に、達成値が負になる確率とファンブル率を加算
        } else if (params.skill>0) {
            // 技能値が正の場合
            const lowerFill = Array(params.skill).fill(0); //達成値が(技能値-1)以下になる確率は0
            const main = diceResult.slice(0,1024-params.skill); //達成値が(技能値),(技能値+1),...,1023となる確率をそれぞれ計算
            const upperProtrusion = diceResult.slice(1024-params.skill).reduce((sum,element) => sum+element, 0); //達成値が1024以上になる確率の和を計算
            distribution = lowerFill.concat(main); //達成値が0,1,...,1023となる確率をそれぞれ計算
            distribution[0] += fumble; //達成値が0となる確率に、ファンブル率を加算
            distribution[1023] += upperProtrusion; //達成値が1023となる確率に、達成値が1024以上になる確率を加算
        } else {
            // 技能値が0の場合
            distribution = diceResult.slice(); //達成値が0,1,...,1023となる確率をそれぞれ計算
            distribution[0] += fumble; //達成値が0となる確率に、ファンブル率を加算
        }

        // 上側確率を計算
        upperTailProbability[0] = 1.0
        for (let i=1; i<1024; i++) {
            upperTailProbability[i] = upperTailProbability[i-1] - distribution[i-1]; //達成値が1,2,...,1023以上になる確率を計算
        }

    }

    const score = {
        distribution: distribution,
        upperTailProbability: upperTailProbability
    };

    return score;

}

export function getScoreSummary (score,dfclty={opposed:true, target:0}) {

    /*
    概要:
        与えられた達成値分布の期待値・成功率を計算する。
    input:
        score: {
            action: {
                distribution (number[]): i番目の要素にアクション側の達成値がiとなる確率を持つ長さ1024の配列。
                upperTailProbability (number[]): i番目の要素にアクション側の達成値がi以上となる確率を持つ長さ1024の配列。
            },
            reaction: {
                distribution (number[]): i番目の要素にリアクション側の達成値がiとなる確率を持つ長さ1024の配列。
                upperTailProbability (number[]): i番目の要素にリアクション側の達成値がi以上となる確率を持つ長さ1024の配列。
            },
        }
        dfclty: {
            opposed (boolean): 対決判定か否かを表す二値変数。デフォルト値:true。
            target (number): 難易度。デフォルト値:0。
        }
    output:
        scoreSummary: {
            action: {
                expectedValue (number): アクション側の達成値期待値。小数第一位まで。
                successRate (number): アクション側の成功率。%単位で小数第一位まで。 
            }
            reaction: {
                expectedValue (number): リアクション側の達成値期待値。小数第一位まで。
                successRate (number): リアクション側の成功率。%単位で小数第一位まで。 
            }
        }
    */

    var actionExpectedValue;
    var actionSuccessRate;
    var reactionExpectedValue;
    var reactionSuccessRate;

    if (dfclty.opposed && score.action.distribution && score.action.upperTailProbability && score.reaction.distribution && score.reaction.upperTailProbability) {
        // 対決判定の場合
        actionExpectedValue = getExpectedValue(score.action.distribution); //アクション側の達成値期待値を計算
        actionSuccessRate = 0;
        for (let i=0; i<1024; i++) {
            actionSuccessRate += score.action.distribution[i] * (1-score.reaction.upperTailProbability[i]);
        }
        actionSuccessRate = Math.round(actionSuccessRate*1000)/10; // アクション側の勝率を計算
        reactionExpectedValue = getExpectedValue(score.reaction.distribution); //リアクション側の達成値期待値を計算
        reactionSuccessRate = Math.round((100-actionSuccessRate)*10)/10; //リアクション側の勝率を計算
    } else if (!dfclty.opposed && score.action.distribution && score.action.upperTailProbability) {
        // 対決判定でない場合
        actionExpectedValue = getExpectedValue(score.action.distribution); //アクション側の達成値期待値を計算
        actionSuccessRate = Math.round(score.action.upperTailProbability[dfclty.target]*1000)/10; //成功率を計算
        reactionExpectedValue = 0; //リアクション側の達成値期待値を計算
        reactionSuccessRate = 0; //リアクション側の勝率を計算
    }

    const scoreSummary = {
        action: {
            expectedValue: actionExpectedValue,
            successRate: actionSuccessRate,
        },
        reaction: {
            expectedValue: reactionExpectedValue,
            successRate: reactionSuccessRate,
        }
    };

    return scoreSummary;

}

export function getDamage (score,attack,defence) {

    /*
    概要:
        与えられた達成値分布・攻撃力・防御力の下でのダメージの分布・上側確率を計算する。
    input:
        score: {
            action: {
                distribution (number[]): i番目の要素にアクション側の達成値がiとなる確率を持つ長さ1024の配列。
                upperTailProbability (number[]): i番目の要素にアクション側の達成値がi以上となる確率を持つ長さ1024の配列。
            },
            reaction: {
                distribution (number[]): i番目の要素にリアクション側の達成値がiとなる確率を持つ長さ1024の配列。
                upperTailProbability (number[]): i番目の要素にリアクション側の達成値がi以上となる確率を持つ長さ1024の配列。
            },
        }
        attack: {
            dice (number): 攻撃力(ダイス)。0以上99以下の整数値。
            value (number): 攻撃力(固定値)。-999以上999以下の整数値。
            kazanari (number): 振り直せるダメージダイスの数。0以上9以下の整数値。
        }
        defence: {
            dice (number): 防御力(ダイス)。0以上99以下の整数値。
            value (number): 防御力(固定値)。-999以上999以下の整数値。
        }
    output:
        damage: {
            distribution (number[]): i番目の要素にダメージがiとなる確率を持つ長さ1024の配列。
            upperTailProbability (number[]): i番目の要素にダメージがi以上となる確率を持つ長さ1024の配列。
        }
    */

    const scoreActionDistribution = score.action.distribution.slice();
    const scoreReactionUpperTailProbability = score.reaction.upperTailProbability.slice();

    var distribution = Array(1024).fill(0);
    var upperTailProbability = Array(1024).fill(0);
    
    // 失敗率を計算
    var failureRate = 0;
    for (let i=0; i<1024; i++) {
        failureRate += scoreActionDistribution[i] * scoreReactionUpperTailProbability[i];
    }
    // ダメージロールの出目の分布を計算
    const dr_kazanari = dr[attack.kazanari];
    for (let i=0; i<1024; i++) {
        var sum = 0;
        const dr_kazanari_i = dr_kazanari[i]
        const attack_dice = attack.dice;
        for (let j=0; j<1024; j++) {
            sum += scoreActionDistribution[j] * (1.0-scoreReactionUpperTailProbability[j]) * dr_kazanari_i[Math.floor(j/10)+1+attack_dice];
        }
        distribution[i] = sum;
    }
    // 攻撃力固定値-防御力固定値が正の場合、このタイミングで攻撃力固定値-防御力固定値を加算
    if (attack.value-defence.value>0) {
        const lowerFill = Array(attack.value-defence.value).fill(0); //ダメージロールの出目+攻撃力ダイスの出目+攻撃力固定値-防御力固定値が(攻撃力固定値-防御力固定値-1)以下になる確率は0
        const main = distribution.slice(0,1024-attack.value+defence.value); //ダメージロールの出目+攻撃力ダイスの出目+攻撃力固定値-防御力固定値が(攻撃力固定値-防御力固定値),(攻撃力固定値-防御力固定値+1),...,1023となる確率をそれぞれ計算
        const upperProtrusion = distribution.slice(1024-attack.value+defence.value).reduce((sum,element) => sum+element, 0); //ダメージロールの出目+攻撃力ダイスの出目+攻撃力固定値-防御力固定値が1024以上になる確率の和を計算
        distribution = lowerFill.concat(main); //ダメージロールの出目+攻撃力ダイスの出目+攻撃力固定値-防御力固定値が0,1,...,1023となる確率をそれぞれ計算
        distribution[1023] += upperProtrusion; //ダメージロールの出目+攻撃力ダイスの出目+攻撃力固定値-防御力固定値が1023となる確率に、ダメージロールの出目+攻撃力ダイスの出目+攻撃力固定値-防御力固定値が1024以上になる確率を加算
    }
    // 防御力ダイスの出目の分布を減算
    if (defence.dice>0) {
        distribution = subDistribution(distribution,d10[defence.dice]);
    }
    // 攻撃力固定値-防御力固定値が負の場合、このタイミングで攻撃力固定値-防御力固定値を加算
    if (attack.value-defence.value<0) {
        const lowerProtrusion = distribution.slice(0,-attack.value+defence.value).reduce((sum,element) => sum+element, 0); //ダメージロールの出目+攻撃力ダイスの出目-防御力ダイスの出目+攻撃力固定値-防御力固定値が負になる確率の和を計算
        const main = distribution.slice(-attack.value+defence.value); //ダメージロールの出目+攻撃力ダイスの出目-防御力ダイスの出目+攻撃力固定値-防御力固定値が0,1,...,(1023+攻撃力固定値-防御力固定値)となる確率をそれぞれ計算
        const upperFill = Array(-attack.value+defence.value).fill(0); //ダメージロールの出目+攻撃力ダイスの出目-防御力ダイスの出目+攻撃力固定値-防御力固定値が(1024+攻撃力固定値-防御力固定値)以上になる確率は0とする
        distribution = main.concat(upperFill); //ダメージロールの出目+攻撃力ダイスの出目-防御力ダイスの出目+攻撃力固定値-防御力固定値が0,1,...,1023となる確率をそれぞれ計算
        distribution[0] += lowerProtrusion; //ダメージロールの出目+攻撃力ダイスの出目-防御力ダイスの出目+攻撃力固定値-防御力固定値が0となる確率に、ダメージロールの出目+攻撃力ダイスの出目-防御力ダイスの出目+攻撃力固定値-防御力固定値が負になる確率を加算
    }
    // 攻撃に失敗したらダメージは0
    distribution[0] += failureRate;
    // 上側確率を計算
    upperTailProbability[0] = 1.0
    for (let i=1; i<1024; i++) {
        upperTailProbability[i] = upperTailProbability[i-1] - distribution[i-1]; //達成値が1,2,...,1023以上になる確率を計算
    }

    const damage = {
        distribution: distribution,
        upperTailProbability: upperTailProbability,
    };
    return damage;

}

export function getDamageSummary (damage) {

    /*
    概要:
        与えられたダメージ分布の期待値を計算する。
    input:
        damage: {
            distribution (number[]): i番目の要素にダメージがiとなる確率を持つ長さ1024の配列。
            upperTailProbability (number[]): i番目の要素にダメージがi以上となる確率を持つ長さ1024の配列。
        }
    output:
        damageSummary: {
            expectedValue (number): ダメージ期待値。小数第一位まで。
        }
    */

    const expectedValue = getExpectedValue(damage.distribution); //ダメージ期待値を計算
    const damageSummary = {expectedValue: expectedValue};

    return damageSummary;

}

export function getTotalDamage (combos) {

    /*
    概要:
        ダメージ合計の分布を計算する。
    input:
        combos: [{
            id (number): コンボのid。
            name (string): コンボ名。
            show (boolean): コンボの詳細を表示するならtrue。
            data: {
                score: {
                    action: {
                        distribution (number[]): i番目の要素に攻撃側の達成値がiとなる確率を持つ長さ1024の配列。
                        upperTailProbability (number[]): i番目の要素に防御側の達成値がi以上となる確率を持つ長さ1024の配列。
                    }
                    reaction: {
                        distribution (number[]): i番目の要素に防御側の達成値がiとなる確率を持つ長さ1024の配列。
                        upperTailProbability (number[]): i番目の要素に防御側の達成値がiとなる確率を持つ長さ1024の配列。
                    }
                }
                scoreSummary: {
                    action: {
                        expectedValue (number): 攻撃側の達成値期待値。
                        successRate (number): 攻撃側の成功率。
                    }
                    reaction: {
                        expectedValue (number): 防御側の達成値期待値。
                        successRate (number): 防御側の成功率。
                    }
                }
                damage: {
                    distribution (number[]): i番目の要素にダメージがiとなる確率を持つ長さ1024の配列。
                    upperTailProbability (number[]): i番目の要素にダメージがi以上となる確率を持つ長さ1024の配列。
                }
                damageSummary: {
                    expectedValue (number): ダメージ期待値。
                }
            }
        }]
    output:
        totalDamage: {
            distribution (number[]): i番目の要素に合計ダメージがiとなる確率を持つ長さ1024の配列。
            upperTailProbability (number[]): i番目の要素に合計ダメージがi以上となる確率を持つ長さ1024の配列。
        }
    */

    var distribution = Array(1024).fill(0);
    distribution[0] = 1.0;
    combos.forEach((value) => {
        if(value.data.damage.distribution!==null){
            distribution = sumDistribution(distribution,value.data.damage.distribution);
        }
    });

    var upperTailProbability = Array(1024).fill(0);
    upperTailProbability[0] = 1.0;
    for (let i=1; i<1024; i++) {
        upperTailProbability[i] = upperTailProbability[i-1] - distribution[i-1]; //総ダメージが1,2,...,1023以上になる確率を計算
    }

    return {distribution:distribution, upperTailProbability:upperTailProbability};

}

export function getFinalEncroachment (params) {

    /*
    概要:
        与えられた現在侵蝕率、ロイス数、Eロイス数、その他減少量の下での最終侵蝕率の分布を計算する。
    input:
        params: {
            encroachment (number): 現在侵蝕率。整数値。
            lois (number): 残存ロイス数。0以上7以下の整数値。
            elois (number): Eロイス数。0以上99以下の整数値。
            dice (number): その他減少量(ダイス)。0以上99以下の整数値。
            value (number): その他減少量(固定値)。0以上999以下の整数。
            dlois (string): バックトラックに影響するDロイス。['なし', '戦闘用人格・生きる伝説', '生還者', '不死者・悪夢', '屍人', '戦友(通常)', '戦友(強化)']のいずれか。
        }
    output:
        finalEncroachment: {
            single (number[]): 1倍振りの結果、最終侵蝕率が100%-,70-99%,51-70%,31-50%,-30%となる確率を記録した配列。%単位で小数第一位まで。
            double (number[]): 2倍振りの結果、最終侵蝕率が100%-,-99%となる確率を記録した配列。%単位で小数第一位まで。
            second (number[]): 2倍振り+追加振りの結果、最終侵蝕率が100%-,-99%となる確率を記録した配列。%単位で小数第一位まで。
        }
    */

    switch (params.dlois) {

        case "戦闘用人格・生きる伝説":
            // 1倍振りの結果を計算
            var single = Array(5).fill(0);
            single[0] = Math.round(d10[params.lois+params.elois+params.dice-1].slice(0,Math.max(0,params.encroachment-params.value-99)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            single[1] = Math.round(d10[params.lois+params.elois+params.dice-1].slice(Math.max(0,params.encroachment-params.value-99),Math.max(0,params.encroachment-params.value-70)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            single[2] = Math.round(d10[params.lois+params.elois+params.dice-1].slice(Math.max(0,params.encroachment-params.value-70),Math.max(0,params.encroachment-params.value-50)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            single[3] = Math.round(d10[params.lois+params.elois+params.dice-1].slice(Math.max(0,params.encroachment-params.value-50),Math.max(0,params.encroachment-params.value-30)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            single[4] = Math.round(d10[params.lois+params.elois+params.dice-1].slice(Math.max(0,params.encroachment-params.value-30),1024).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            // 2倍振りの結果を計算
            var double = Array(2);
            double[0] = Math.round(d10[params.lois*2+params.elois+params.dice-1].slice(0,Math.max(0,params.encroachment-params.value-99)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            double[1] = Math.round(d10[params.lois*2+params.elois+params.dice-1].slice(Math.max(0,params.encroachment-params.value-99),1024).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            // 2倍振り+追加振りの結果を計算
            var second = Array(2);
            second[0] = Math.round(d10[params.lois*3+params.elois+params.dice-1].slice(0,Math.max(0,params.encroachment-params.value-99)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            second[1] = Math.round(d10[params.lois*3+params.elois+params.dice-1].slice(Math.max(0,params.encroachment-params.value-99),1024).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            // 結果を返す
            return {single:single, double:double, second:second};
        
        case "生還者":
            // 1倍振りの結果を計算
            var single = Array(5).fill(0);
            single[0] = Math.round(d10[params.lois+params.elois+params.dice+3].slice(0,Math.max(0,params.encroachment-params.value-99)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            single[1] = Math.round(d10[params.lois+params.elois+params.dice+3].slice(Math.max(0,params.encroachment-params.value-99),Math.max(0,params.encroachment-params.value-70)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            single[2] = Math.round(d10[params.lois+params.elois+params.dice+3].slice(Math.max(0,params.encroachment-params.value-70),Math.max(0,params.encroachment-params.value-50)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            single[3] = Math.round(d10[params.lois+params.elois+params.dice+3].slice(Math.max(0,params.encroachment-params.value-50),Math.max(0,params.encroachment-params.value-30)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            single[4] = Math.round(d10[params.lois+params.elois+params.dice+3].slice(Math.max(0,params.encroachment-params.value-30),1024).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            // 2倍振りの結果を計算
            var double = Array(2);
            double[0] = Math.round(d10[params.lois*2+params.elois+params.dice+3].slice(0,Math.max(0,params.encroachment-params.value-99)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            double[1] = Math.round(d10[params.lois*2+params.elois+params.dice+3].slice(Math.max(0,params.encroachment-params.value-99),1024).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            // 2倍振り+追加振りの結果を計算
            var second = Array(2);
            second[0] = Math.round(d10[params.lois*3+params.elois+params.dice+3].slice(0,Math.max(0,params.encroachment-params.value-99)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            second[1] = Math.round(d10[params.lois*3+params.elois+params.dice+3].slice(Math.max(0,params.encroachment-params.value-99),1024).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            // 結果を返す
            return {single:single, double:double, second:second};
        
        case "不死者・悪夢":
            // 1倍振りの結果を計算
            var single = Array(5).fill(0);
            single[0] = Math.round(d10[params.lois+params.elois+params.dice].slice(0,Math.max(0,params.encroachment-params.value-119)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            single[1] = Math.round(d10[params.lois+params.elois+params.dice].slice(Math.max(0,params.encroachment-params.value-119),Math.max(0,params.encroachment-params.value-100)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            single[2] = Math.round(d10[params.lois+params.elois+params.dice].slice(Math.max(0,params.encroachment-params.value-99),Math.max(0,params.encroachment-params.value-70)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            single[3] = Math.round(d10[params.lois+params.elois+params.dice].slice(Math.max(0,params.encroachment-params.value-70),Math.max(0,params.encroachment-params.value-50)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            single[4] = Math.round(d10[params.lois+params.elois+params.dice].slice(Math.max(0,params.encroachment-params.value-50),Math.max(0,params.encroachment-params.value-30)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            single[5] = Math.round(d10[params.lois+params.elois+params.dice].slice(Math.max(0,params.encroachment-params.value-30),1024).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            // 2倍振りの結果を計算
            var double = Array(2);
            double[0] = Math.round(d10[params.lois*2+params.elois+params.dice].slice(0,Math.max(0,params.encroachment-params.value-119)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            double[1] = Math.round(d10[params.lois*2+params.elois+params.dice].slice(Math.max(0,params.encroachment-params.value-119),1024).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            // 2倍振り+追加振りの結果を計算
            var second = Array(2);
            second[0] = Math.round(d10[params.lois*3+params.elois+params.dice].slice(0,Math.max(0,params.encroachment-params.value-119)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            second[1] = Math.round(d10[params.lois*3+params.elois+params.dice].slice(Math.max(0,params.encroachment-params.value-119),1024).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            // 結果を返す
            return {single:single, double:double, second:second};
        
        case "屍人":
            // 1倍振りの結果を計算
            var single = Array(5).fill(0);
            single[0] = Math.round(livingdead[params.lois+params.elois+params.dice].slice(0,Math.max(0,params.encroachment-params.value-99)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            single[1] = Math.round(livingdead[params.lois+params.elois+params.dice].slice(Math.max(0,params.encroachment-params.value-99),Math.max(0,params.encroachment-params.value-70)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            single[2] = Math.round(livingdead[params.lois+params.elois+params.dice].slice(Math.max(0,params.encroachment-params.value-70),Math.max(0,params.encroachment-params.value-50)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            single[3] = Math.round(livingdead[params.lois+params.elois+params.dice].slice(Math.max(0,params.encroachment-params.value-50),Math.max(0,params.encroachment-params.value-30)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            single[4] = Math.round(livingdead[params.lois+params.elois+params.dice].slice(Math.max(0,params.encroachment-params.value-30),1024).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            // 2倍振りの結果を計算
            var double = Array(2);
            double[0] = Math.round(livingdead[params.lois*2+params.elois+params.dice].slice(0,Math.max(0,params.encroachment-params.value-99)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            double[1] = Math.round(livingdead[params.lois*2+params.elois+params.dice].slice(Math.max(0,params.encroachment-params.value-99),1024).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            // 2倍振り+追加振りの結果を計算
            var second = Array(2);
            second[0] = Math.round(livingdead[params.lois*3+params.elois+params.dice].slice(0,Math.max(0,params.encroachment-params.value-99)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            second[1] = Math.round(livingdead[params.lois*3+params.elois+params.dice].slice(Math.max(0,params.encroachment-params.value-99),1024).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            // 結果を返す
            return {single:single, double:double, second:second};
        
        case "戦友(通常)":
            // 1倍振りの結果を計算
            var single = Array(5).fill(0);
            single[0] = Math.round(d10[params.lois+params.elois+params.dice+2].slice(0,Math.max(0,params.encroachment-params.value-99)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            single[1] = Math.round(d10[params.lois+params.elois+params.dice+2].slice(Math.max(0,params.encroachment-params.value-99),Math.max(0,params.encroachment-params.value-70)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            single[2] = Math.round(d10[params.lois+params.elois+params.dice+2].slice(Math.max(0,params.encroachment-params.value-70),Math.max(0,params.encroachment-params.value-50)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            single[3] = Math.round(d10[params.lois+params.elois+params.dice+2].slice(Math.max(0,params.encroachment-params.value-50),Math.max(0,params.encroachment-params.value-30)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            single[4] = Math.round(d10[params.lois+params.elois+params.dice+2].slice(Math.max(0,params.encroachment-params.value-30),1024).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            // 2倍振りの結果を計算
            var double = Array(2);
            double[0] = Math.round(d10[params.lois*2+params.elois+params.dice+2].slice(0,Math.max(0,params.encroachment-params.value-99)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            double[1] = Math.round(d10[params.lois*2+params.elois+params.dice+2].slice(Math.max(0,params.encroachment-params.value-99),1024).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            // 2倍振り+追加振りの結果を計算
            var second = Array(2);
            second[0] = Math.round(d10[params.lois*3+params.elois+params.dice+2].slice(0,Math.max(0,params.encroachment-params.value-99)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            second[1] = Math.round(d10[params.lois*3+params.elois+params.dice+2].slice(Math.max(0,params.encroachment-params.value-99),1024).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            // 結果を返す
            return {single:single, double:double, second:second};
        
        case "戦友(強化)":
            // 1倍振りの結果を計算
            var single = Array(5).fill(0);
            single[0] = Math.round(d10[params.lois+params.elois+params.dice+4].slice(0,Math.max(0,params.encroachment-params.value-99)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            single[1] = Math.round(d10[params.lois+params.elois+params.dice+4].slice(Math.max(0,params.encroachment-params.value-99),Math.max(0,params.encroachment-params.value-70)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            single[2] = Math.round(d10[params.lois+params.elois+params.dice+4].slice(Math.max(0,params.encroachment-params.value-70),Math.max(0,params.encroachment-params.value-50)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            single[3] = Math.round(d10[params.lois+params.elois+params.dice+4].slice(Math.max(0,params.encroachment-params.value-50),Math.max(0,params.encroachment-params.value-30)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            single[4] = Math.round(d10[params.lois+params.elois+params.dice+4].slice(Math.max(0,params.encroachment-params.value-30),1024).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            // 2倍振りの結果を計算
            var double = Array(2);
            double[0] = Math.round(d10[params.lois*2+params.elois+params.dice+4].slice(0,Math.max(0,params.encroachment-params.value-99)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            double[1] = Math.round(d10[params.lois*2+params.elois+params.dice+4].slice(Math.max(0,params.encroachment-params.value-99),1024).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            // 2倍振り+追加振りの結果を計算
            var second = Array(2);
            second[0] = Math.round(d10[params.lois*3+params.elois+params.dice+4].slice(0,Math.max(0,params.encroachment-params.value-99)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            second[1] = Math.round(d10[params.lois*3+params.elois+params.dice+4].slice(Math.max(0,params.encroachment-params.value-99),1024).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            // 結果を返す
            return {single:single, double:double, second:second};
        
        default:
            // 1倍振りの結果を計算
            var single = Array(5).fill(0);
            single[0] = Math.round(d10[params.lois+params.elois+params.dice].slice(0,Math.max(0,params.encroachment-params.value-99)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            single[1] = Math.round(d10[params.lois+params.elois+params.dice].slice(Math.max(0,params.encroachment-params.value-99),Math.max(0,params.encroachment-params.value-70)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            single[2] = Math.round(d10[params.lois+params.elois+params.dice].slice(Math.max(0,params.encroachment-params.value-70),Math.max(0,params.encroachment-params.value-50)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            single[3] = Math.round(d10[params.lois+params.elois+params.dice].slice(Math.max(0,params.encroachment-params.value-50),Math.max(0,params.encroachment-params.value-30)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            single[4] = Math.round(d10[params.lois+params.elois+params.dice].slice(Math.max(0,params.encroachment-params.value-30),1024).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            // 2倍振りの結果を計算
            var double = Array(2);
            double[0] = Math.round(d10[params.lois*2+params.elois+params.dice].slice(0,Math.max(0,params.encroachment-params.value-99)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            double[1] = Math.round(d10[params.lois*2+params.elois+params.dice].slice(Math.max(0,params.encroachment-params.value-99),1024).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            // 2倍振り+追加振りの結果を計算
            var second = Array(2);
            second[0] = Math.round(d10[params.lois*3+params.elois+params.dice].slice(0,Math.max(0,params.encroachment-params.value-99)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            second[1] = Math.round(d10[params.lois*3+params.elois+params.dice].slice(Math.max(0,params.encroachment-params.value-99),1024).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            // 結果を返す
            return {single:single, double:double, second:second};
    }
}