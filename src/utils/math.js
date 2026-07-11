// src/utils/math.js

/**
 * 分布配列の最大サイズ（達成値の上限）
 * @constant {number}
 */
export const MAX_VALUE = 1024;

/**
 * 与えられた確率分布から期待値を計算して返します。
 * @param {number[]} distribution - i番目の要素に x=i となる確率を持つ配列
 * @returns {number|null} xの期待値（計算不可の場合はnull）
 */
export function getExpectedValue(distribution) {
    if (distribution) {
        let result = 0;
        for (let i = 1; i < MAX_VALUE; i++) {
            result += i * distribution[i];
        }
        // 小数第一位まで丸める
        result = Math.round(result * 10) / 10;
        return result;
    } else {
        return null;
    }
}

/**
 * 開始数から終了数までの連続した整数値を要素として持つ配列を返します。
 * @param {number} min - 開始数。0以上で終了数より小さい整数値。
 * @param {number} max - 終了数。開始数より大きくMAX_VALUE以下の整数値。
 * @returns {number[]} 開始数から終了数までの連続した整数値を要素として持つ配列。
 */
export function range(min, max) {
    const res = [...Array(MAX_VALUE).keys()];
    return res.slice(min, max + 1);
}