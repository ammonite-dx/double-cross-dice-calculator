const tableauClassic9 = [
  '#1E77B4', '#FF7F0E', '#D72827', '#9468BD', '#8B564B',
  '#E378C1', '#7F7F7F', '#BCBD20', '#13BECE',
]

export function getChartColor(id: number | string): string {

    /*
    概要:
        チャートデータ描画用の色を返す。
    input:
        id (number)
    output:
        color (Color)
    */

    return tableauClassic9[Number(id) % 9]

}
