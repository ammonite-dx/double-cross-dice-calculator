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

    var labels;
    var datasets;
    if (mode=='single') {
        labels = ["100%〜","71〜99%","51〜70%","31〜50%","0〜30%"];
        datasets = [{data:finalEncroachment.single, backgroundColor:['#EC1D2C','#FE6F2F','#F9A829','#FAD23C','#5EBB68']}];
    } else if (mode=='double') {
        labels = ["失敗","成功"];
        datasets = [{data:finalEncroachment.double, backgroundColor:['#EC1D2C','#5EBB68']}];
    } else if (mode=='second') {
        labels = ["失敗","成功"];
        datasets = [{data:finalEncroachment.second, backgroundColor:['#EC1D2C','#5EBB68']}];
    }
    const data = {labels:labels, datasets:datasets}
    return data;

}

export function getFinalEncroachmentChartOptions (mode,smAndUp) {

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
    const datalabelsTitleFontSize = () => {
        if (smAndUp) {
            return 12;
        } else {
            return 6;
        }
    };
    const datalabels = {
        color: "white",
        labels: {
            title: {
                font: {
                    size: datalabelsTitleFontSize(),
                    weight: 'bold',
                }
            }
        },
        textAlign: 'center',
        formatter: (value, context) => {
            const label = context.chart.data.labels[context.dataIndex];
            if(value>=10){
                return `${label}\n${value}%`;
            }else{
                return '';
            }
        }
    }
    const plugins = {title:title, legend:legend, tooltip:tooltip, datalabels:datalabels};
    return {responsive:responsive, maintainAspectRatio:maintainAspectRatio, plugins:plugins};

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