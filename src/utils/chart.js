// src/utils/chart.js

import { Chart, ArcElement, Tooltip, Legend, Title } from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';

// 必要なプラグインを一括登録
Chart.register(ArcElement, Tooltip, Legend, Title, ChartDataLabels);

// ----------------------------------------------------------------------
// 1. カラーパレット定義
// ----------------------------------------------------------------------

/**
 * バックトラック（侵蝕率）の結果分類色
 * ルール上の「失敗」と「成功（段階別）」に基づいた命名
 */
export const BACKTRACK_COLORS = {
    failure: '#EC1D2C',          // 失敗 (100%以上 / 不死者・悪夢なら120%以上)
    success_critical: '#ED551B', // 成功・瀕死 (100%~119% / 不死者・悪夢のみ)
    success_danger: '#FE6F2F',   // 成功・危険 (71%~99%)
    success_warning: '#F9A829',  // 成功・警戒 (51%~70%)
    success_caution: '#FAD23C',  // 成功・注意 (31%~50%)
    success_safe: '#5EBB68',     // 成功・安全 (0%~30%)
};

/**
 * 判定・攻撃などのグラフで使用する基本色
 */
export const CHART_COLORS = {
    primary: '#1976D2',   // アクション側 (ブルー)
    secondary: '#F57C00', // リアクション側（オレンジ）
    border: '#ffffff',
};

/**
 * IDに応じたチャート色を返す (コンボ別などの色分け用)
 * @param {number} id 
 */
export const getComboColor = (id) => {
    const colors = [
        '#1976D2', // Blue
        '#E91E63', // Pink
        '#9C27B0', // Purple
        '#00BCD4', // Cyan
        '#FF9800', // Orange
        '#4CAF50', // Green
    ];
    return colors[id % colors.length];
};

// ----------------------------------------------------------------------
// 2. データ加工ヘルパー
// ----------------------------------------------------------------------

/**
 * 配列のクリッピング・四捨五入を行う
 * @param {number[]} data - 描画するデータ
 * @param {number} min - 開始インデックス
 * @param {number} max - 終了インデックス
 */
export function clipData(data, min, max) {
    if (data) {
        return data.slice(min, max + 1).map((element) => Math.round(element * 1000) / 10);
    } else {
        return null;
    }
}

// ----------------------------------------------------------------------
// 3. スタイル・レイアウト生成
// ----------------------------------------------------------------------

/**
 * グラフコンテナのスタイルオブジェクトを生成する
 * @param {boolean} isDesktop - デスクトップ表示(mdAndUp)かどうか
 * @param {string} desktopHeight - デスクトップ時の高さ (default: '400px')
 * @param {string} mobileHeight - モバイル時の高さ (default: '300px')
 */
export function getChartContainerStyle(isDesktop, desktopHeight = '400px', mobileHeight = '300px') {
    return {
        height: isDesktop ? desktopHeight : mobileHeight,
        position: 'relative',
        width: '100%'
    };
}

// ----------------------------------------------------------------------
// 4. オプション生成ヘルパー
// ----------------------------------------------------------------------

/**
 * 共通の基本オプションを返す
 */
export function getBaseChartOptions() {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: false,
                labels: {
                    font: { family: '"Roboto", "Helvetica", "Arial", sans-serif' }
                }
            },
            tooltip: {
                enabled: true,
                // mode: 'index' はグラフの種類によって異なるため、ここでは指定しない
            }
        }
    };
}

/**
 * 線グラフ/棒グラフ用のXY軸設定を返す
 * @param {string} xTitle - X軸のタイトル
 * @param {string} yTitle - Y軸のタイトル
 */
export function getLinearScales(xTitle, yTitle = '確率 [%]') {
    return {
        x: {
            title: {
                display: true,
                text: xTitle
            }
        },
        y: {
            suggestedMin: 0,
            title: {
                display: true,
                text: yTitle
            }
        },
    };
}