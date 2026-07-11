// src/logic/backtrack.js
import d10 from '@/assets/data/d10.json';
import livingdead from '@/assets/data/livingdead.json';
import { MAX_VALUE } from '@/utils/math';

/**
 * 与えられた現在侵蝕率、ロイス数、Eロイス数、その他減少量の下での最終侵蝕率の分布を計算します。
 * @param {Object} params
 * @param {number} params.encroachment - 現在侵蝕率
 * @param {number} params.lois - 残存ロイス数 (0-7)
 * @param {number} params.elois - Eロイス数 (0-99)
 * @param {number} params.dice - その他減少量(ダイス) (0-99)
 * @param {number} params.value - その他減少量(固定値) (0-999)
 * @param {string} params.dlois - バックトラックに影響するDロイス
 * @returns {Object} { single, double, second } 各振り方での分布（100%-, 70-99%, ... の確率配列）
 */
export function getFinalEncroachment(params) {

    switch (params.dlois) {

        case "戦闘用人格・生きる伝説":
            // 1倍振りの結果を計算
            var single = Array(5).fill(0);
            single[0] = Math.round(d10[params.lois+params.elois+params.dice-1].slice(0,Math.max(0,params.encroachment-params.value-99)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            single[1] = Math.round(d10[params.lois+params.elois+params.dice-1].slice(Math.max(0,params.encroachment-params.value-99),Math.max(0,params.encroachment-params.value-70)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            single[2] = Math.round(d10[params.lois+params.elois+params.dice-1].slice(Math.max(0,params.encroachment-params.value-70),Math.max(0,params.encroachment-params.value-50)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            single[3] = Math.round(d10[params.lois+params.elois+params.dice-1].slice(Math.max(0,params.encroachment-params.value-50),Math.max(0,params.encroachment-params.value-30)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            single[4] = Math.round(d10[params.lois+params.elois+params.dice-1].slice(Math.max(0,params.encroachment-params.value-30),MAX_VALUE).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            // 2倍振りの結果を計算
            var double = Array(2);
            double[0] = Math.round(d10[params.lois*2+params.elois+params.dice-1].slice(0,Math.max(0,params.encroachment-params.value-99)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            double[1] = Math.round(d10[params.lois*2+params.elois+params.dice-1].slice(Math.max(0,params.encroachment-params.value-99),MAX_VALUE).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            // 2倍振り+追加振りの結果を計算
            var second = Array(2);
            second[0] = Math.round(d10[params.lois*3+params.elois+params.dice-1].slice(0,Math.max(0,params.encroachment-params.value-99)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            second[1] = Math.round(d10[params.lois*3+params.elois+params.dice-1].slice(Math.max(0,params.encroachment-params.value-99),MAX_VALUE).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            // 結果を返す
            return {single:single, double:double, second:second};
        
        case "生還者":
            // 1倍振りの結果を計算
            var single = Array(5).fill(0);
            single[0] = Math.round(d10[params.lois+params.elois+params.dice+3].slice(0,Math.max(0,params.encroachment-params.value-99)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            single[1] = Math.round(d10[params.lois+params.elois+params.dice+3].slice(Math.max(0,params.encroachment-params.value-99),Math.max(0,params.encroachment-params.value-70)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            single[2] = Math.round(d10[params.lois+params.elois+params.dice+3].slice(Math.max(0,params.encroachment-params.value-70),Math.max(0,params.encroachment-params.value-50)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            single[3] = Math.round(d10[params.lois+params.elois+params.dice+3].slice(Math.max(0,params.encroachment-params.value-50),Math.max(0,params.encroachment-params.value-30)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            single[4] = Math.round(d10[params.lois+params.elois+params.dice+3].slice(Math.max(0,params.encroachment-params.value-30),MAX_VALUE).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            // 2倍振りの結果を計算
            var double = Array(2);
            double[0] = Math.round(d10[params.lois*2+params.elois+params.dice+3].slice(0,Math.max(0,params.encroachment-params.value-99)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            double[1] = Math.round(d10[params.lois*2+params.elois+params.dice+3].slice(Math.max(0,params.encroachment-params.value-99),MAX_VALUE).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            // 2倍振り+追加振りの結果を計算
            var second = Array(2);
            second[0] = Math.round(d10[params.lois*3+params.elois+params.dice+3].slice(0,Math.max(0,params.encroachment-params.value-99)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            second[1] = Math.round(d10[params.lois*3+params.elois+params.dice+3].slice(Math.max(0,params.encroachment-params.value-99),MAX_VALUE).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
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
            single[5] = Math.round(d10[params.lois+params.elois+params.dice].slice(Math.max(0,params.encroachment-params.value-30),MAX_VALUE).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            // 2倍振りの結果を計算
            var double = Array(2);
            double[0] = Math.round(d10[params.lois*2+params.elois+params.dice].slice(0,Math.max(0,params.encroachment-params.value-119)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            double[1] = Math.round(d10[params.lois*2+params.elois+params.dice].slice(Math.max(0,params.encroachment-params.value-119),MAX_VALUE).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            // 2倍振り+追加振りの結果を計算
            var second = Array(2);
            second[0] = Math.round(d10[params.lois*3+params.elois+params.dice].slice(0,Math.max(0,params.encroachment-params.value-119)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            second[1] = Math.round(d10[params.lois*3+params.elois+params.dice].slice(Math.max(0,params.encroachment-params.value-119),MAX_VALUE).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            // 結果を返す
            return {single:single, double:double, second:second};
        
        case "屍人":
            // 1倍振りの結果を計算
            var single = Array(5).fill(0);
            single[0] = Math.round(livingdead[params.lois+params.elois+params.dice].slice(0,Math.max(0,params.encroachment-params.value-99)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            single[1] = Math.round(livingdead[params.lois+params.elois+params.dice].slice(Math.max(0,params.encroachment-params.value-99),Math.max(0,params.encroachment-params.value-70)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            single[2] = Math.round(livingdead[params.lois+params.elois+params.dice].slice(Math.max(0,params.encroachment-params.value-70),Math.max(0,params.encroachment-params.value-50)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            single[3] = Math.round(livingdead[params.lois+params.elois+params.dice].slice(Math.max(0,params.encroachment-params.value-50),Math.max(0,params.encroachment-params.value-30)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            single[4] = Math.round(livingdead[params.lois+params.elois+params.dice].slice(Math.max(0,params.encroachment-params.value-30),MAX_VALUE).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            // 2倍振りの結果を計算
            var double = Array(2);
            double[0] = Math.round(livingdead[params.lois*2+params.elois+params.dice].slice(0,Math.max(0,params.encroachment-params.value-99)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            double[1] = Math.round(livingdead[params.lois*2+params.elois+params.dice].slice(Math.max(0,params.encroachment-params.value-99),MAX_VALUE).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            // 2倍振り+追加振りの結果を計算
            var second = Array(2);
            second[0] = Math.round(livingdead[params.lois*3+params.elois+params.dice].slice(0,Math.max(0,params.encroachment-params.value-99)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            second[1] = Math.round(livingdead[params.lois*3+params.elois+params.dice].slice(Math.max(0,params.encroachment-params.value-99),MAX_VALUE).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            // 結果を返す
            return {single:single, double:double, second:second};
        
        case "戦友(通常)":
            // 1倍振りの結果を計算
            var single = Array(5).fill(0);
            single[0] = Math.round(d10[params.lois+params.elois+params.dice+2].slice(0,Math.max(0,params.encroachment-params.value-99)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            single[1] = Math.round(d10[params.lois+params.elois+params.dice+2].slice(Math.max(0,params.encroachment-params.value-99),Math.max(0,params.encroachment-params.value-70)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            single[2] = Math.round(d10[params.lois+params.elois+params.dice+2].slice(Math.max(0,params.encroachment-params.value-70),Math.max(0,params.encroachment-params.value-50)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            single[3] = Math.round(d10[params.lois+params.elois+params.dice+2].slice(Math.max(0,params.encroachment-params.value-50),Math.max(0,params.encroachment-params.value-30)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            single[4] = Math.round(d10[params.lois+params.elois+params.dice+2].slice(Math.max(0,params.encroachment-params.value-30),MAX_VALUE).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            // 2倍振りの結果を計算
            var double = Array(2);
            double[0] = Math.round(d10[params.lois*2+params.elois+params.dice+2].slice(0,Math.max(0,params.encroachment-params.value-99)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            double[1] = Math.round(d10[params.lois*2+params.elois+params.dice+2].slice(Math.max(0,params.encroachment-params.value-99),MAX_VALUE).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            // 2倍振り+追加振りの結果を計算
            var second = Array(2);
            second[0] = Math.round(d10[params.lois*3+params.elois+params.dice+2].slice(0,Math.max(0,params.encroachment-params.value-99)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            second[1] = Math.round(d10[params.lois*3+params.elois+params.dice+2].slice(Math.max(0,params.encroachment-params.value-99),MAX_VALUE).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            // 結果を返す
            return {single:single, double:double, second:second};
        
        case "戦友(強化)":
            // 1倍振りの結果を計算
            var single = Array(5).fill(0);
            single[0] = Math.round(d10[params.lois+params.elois+params.dice+4].slice(0,Math.max(0,params.encroachment-params.value-99)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            single[1] = Math.round(d10[params.lois+params.elois+params.dice+4].slice(Math.max(0,params.encroachment-params.value-99),Math.max(0,params.encroachment-params.value-70)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            single[2] = Math.round(d10[params.lois+params.elois+params.dice+4].slice(Math.max(0,params.encroachment-params.value-70),Math.max(0,params.encroachment-params.value-50)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            single[3] = Math.round(d10[params.lois+params.elois+params.dice+4].slice(Math.max(0,params.encroachment-params.value-50),Math.max(0,params.encroachment-params.value-30)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            single[4] = Math.round(d10[params.lois+params.elois+params.dice+4].slice(Math.max(0,params.encroachment-params.value-30),MAX_VALUE).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            // 2倍振りの結果を計算
            var double = Array(2);
            double[0] = Math.round(d10[params.lois*2+params.elois+params.dice+4].slice(0,Math.max(0,params.encroachment-params.value-99)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            double[1] = Math.round(d10[params.lois*2+params.elois+params.dice+4].slice(Math.max(0,params.encroachment-params.value-99),MAX_VALUE).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            // 2倍振り+追加振りの結果を計算
            var second = Array(2);
            second[0] = Math.round(d10[params.lois*3+params.elois+params.dice+4].slice(0,Math.max(0,params.encroachment-params.value-99)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            second[1] = Math.round(d10[params.lois*3+params.elois+params.dice+4].slice(Math.max(0,params.encroachment-params.value-99),MAX_VALUE).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            // 結果を返す
            return {single:single, double:double, second:second};
        
        default:
            // 1倍振りの結果を計算
            var single = Array(5).fill(0);
            single[0] = Math.round(d10[params.lois+params.elois+params.dice].slice(0,Math.max(0,params.encroachment-params.value-99)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            single[1] = Math.round(d10[params.lois+params.elois+params.dice].slice(Math.max(0,params.encroachment-params.value-99),Math.max(0,params.encroachment-params.value-70)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            single[2] = Math.round(d10[params.lois+params.elois+params.dice].slice(Math.max(0,params.encroachment-params.value-70),Math.max(0,params.encroachment-params.value-50)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            single[3] = Math.round(d10[params.lois+params.elois+params.dice].slice(Math.max(0,params.encroachment-params.value-50),Math.max(0,params.encroachment-params.value-30)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            single[4] = Math.round(d10[params.lois+params.elois+params.dice].slice(Math.max(0,params.encroachment-params.value-30),MAX_VALUE).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            // 2倍振りの結果を計算
            var double = Array(2);
            double[0] = Math.round(d10[params.lois*2+params.elois+params.dice].slice(0,Math.max(0,params.encroachment-params.value-99)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            double[1] = Math.round(d10[params.lois*2+params.elois+params.dice].slice(Math.max(0,params.encroachment-params.value-99),MAX_VALUE).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            // 2倍振り+追加振りの結果を計算
            var second = Array(2);
            second[0] = Math.round(d10[params.lois*3+params.elois+params.dice].slice(0,Math.max(0,params.encroachment-params.value-99)).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            second[1] = Math.round(d10[params.lois*3+params.elois+params.dice].slice(Math.max(0,params.encroachment-params.value-99),MAX_VALUE).reduce((sum,element)=>{return sum+element;},0)*1000)/10;
            // 結果を返す
            return {single:single, double:double, second:second};
    }
}