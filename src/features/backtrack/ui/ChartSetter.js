function getFinalEncroachmentCategories (finalEncroachment, mode) {
    if (mode === 'single') {
        return {
            labels: ['100%〜', '71〜99%', '51〜70%', '31〜50%', '0〜30%'],
            values: finalEncroachment.single,
            backgroundColor: ['#EC1D2C', '#FE6F2F', '#F9A829', '#FAD23C', '#5EBB68'],
        }
    }
    if (mode === 'undead') {
        return {
            labels: ['120%～', '100〜119%', '71〜99%', '51〜70%', '31〜50%', '0〜30%'],
            values: finalEncroachment.single,
            backgroundColor: ['#EC1D2C', '#ED551B', '#FE6F2F', '#F9A829', '#FAD23C', '#5EBB68'],
        }
    }
    if (mode === 'double') {
        return {
            labels: ['失敗', '成功'],
            values: finalEncroachment.double,
            backgroundColor: ['#EC1D2C', '#5EBB68'],
        }
    }
    if (mode === 'second') {
        return {
            labels: ['失敗', '成功'],
            values: finalEncroachment.second,
            backgroundColor: ['#EC1D2C', '#5EBB68'],
        }
    }
    return null
}

export function getFinalEncroachmentChartData (finalEncroachment, mode) {

    /*
    概要:
        最終侵蝕率チャート描画用のデータを作成する。
    input:
        finalEncroachment: {
            single (number[]): 1倍振りの結果、最終侵蝕率が100%-,70-99%,51-70%,31-50%,-30%となる確率を記録した配列。
            double (number[]): 2倍振りの結果、最終侵蝕率が100%-,-99%となる確率を記録した配列。
            second (number[]): 2倍振り+追加振りの結果、最終侵蝕率が100%-,-99%となる確率を記録した配列。
        }
        mode (string): バックトラックの振り方。'single'なら1倍振り、'double'なら2倍振り、'second'なら2倍振り+追加振り。
    output:
        data: {
            labels (string[]): データラベル。
            datasets: {
                data (number[]): データ系列。
                backgroundColor (Color): データ系列の背景色。
            } 
        }
    */

    const categories = getFinalEncroachmentCategories(finalEncroachment, mode)
    if (categories === null) {
        return { labels: [], datasets: [] }
    }
    return {
        labels: categories.labels,
        datasets: [{
            data: categories.values,
            backgroundColor: categories.backgroundColor,
        }],
    }

}

/**
 * Return the same category values as the chart in a table-friendly shape.
 * Values are percentages, matching the historical Backtrack presentation.
 */
export function getFinalEncroachmentTableRows (finalEncroachment, mode) {
    const categories = getFinalEncroachmentCategories(finalEncroachment, mode)
    if (categories === null) {
        return []
    }
    return categories.labels.map((label, index) => ({
        label,
        probability: categories.values[index] ?? 0,
    }))

}

export function getFinalEncroachmentChartOptions (mode) {

    /*
    概要:
        最終侵蝕率チャート描画用のオプションを作成する。
    input:
        mode (string): バックトラックの振り方。'single'なら1倍振り、'double'なら2倍振り、'second'なら2倍振り+追加振り。
    output:
        options: {
            responsive (boolean): レスポンシブならtrue。
            maintainAspectRatio (boolean): アスペクト比を固定するならtrue。
            legend: {
                display (boolean): 凡例を表示するならtrue。
            }
            plugins: {
                tooltip: {
                    mode (string): 
                    callbacks: {
                        label (string): ツールチップのラベル。
                    }
                }
            }
        }
    */

    const responsive = true;
    const maintainAspectRatio = false;
    const titleText = () => {
        switch (mode) {
            case 'single':
                return '一倍振り';
            case 'undead':
                return '一倍振り（屍人・悪夢）';
            case 'double':
                return '二倍振り';
            case 'second':
                return '二倍振り+追加振り'
            default:
                break;
        }
    };
    const title = {
        display: true,
        text: titleText()
    };
    const legend = {
        display:false
    };
    const tooltip = {
        callbacks: {
            title: () => null,
            label: (tooltipItem) => {return tooltipItem.label+': '+tooltipItem.formattedValue+'%'}
        }
    };
    return {
        responsive,
        maintainAspectRatio,
        indexAxis: 'y',
        scales: {
            x: {
                min: 0,
                max: 100,
                title: { display: true, text: '確率 [%]' },
            },
            y: {
                title: { display: true, text: titleText() },
            },
        },
        plugins: { title, legend, tooltip },
    };

}

export function getFinalEncroachmentChartStyle (mdAndUp) {

    /*
    概要:
        最終侵蝕率チャート描画用のスタイルを作成する。
    input:
        mdAndUp (boolean): ウィンドウサイズがmd以上ならtrue。
    output:
        style: {
            height (string): チャートの高さ。
            position (string): 
        }
    */

    var height;
    if(mdAndUp){
        height = '300px';
    } else {
        height = '200px';
    }
    const position = 'relative';
    return {height:height, position:position};

}
