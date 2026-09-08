# R20 conservative rendering experiment

R20の保守的な描画レビューで使う、現行のLine chart専用ベンチマークです。productionの確率計算や表示投影は呼び出さず、共有の`createProbabilityLineChartOptions`が作るLine、tooltip、アニメーション、点マーカーをブラウザで測定します。

## 測定対象

- 論理座標数: 100、1,000、4,096、16,384、20,000
- 系列数: 1、2、4
- marker variant: 現行既定値、半径2、半径1、半径0
- viewport: 390×844、1280×900
- ブラウザ条件: Chrome通常、Chrome CPU 4x

20,000点は現行のresource policy外の探索ケースであり、入力範囲を拡張する根拠にはしません。marker variantは実験内だけで比較し、production設定へ自動反映しません。

## 記録する値

各ケースで初回生成時間、`chart.update()`呼び出し時間、アニメーション完了の有無と観測時間、Long Task、requestAnimationFrameの最大遅延、描画点数、ページ／コンソールエラーを記録します。benchmarkの計測用callbackは設定しますが、Lineの種類、色、線幅、データ、チャートサイズ、系列数は変更しません。

## 実行

通常条件とCPU 4x条件を分けて実行します。

```powershell
npm run benchmark:r20:conservative-rendering
npm run benchmark:r20:conservative-rendering -- --cpu-4x
```

短縮実行では反復数とアニメーション観測時間を減らします。

通常実行は初回描画と更新をそれぞれ最大1,100 ms観測し、Chart.jsの標準的なアニメーション完了を確認します。短縮実行は両方を100 msにします。

```powershell
npm run benchmark:r20:conservative-rendering:short
```

ケース、系列数、markerを絞る場合は、カンマ区切りの引数を指定できます。例えば次のコマンドは、アニメーション完了まで観測する代表ケースだけを実行します。

```powershell
npm run benchmark:r20:conservative-rendering -- --cases=100,4096,16384,20000 --datasets=1,4 --markers=baseline,radius-1
```

結果は標準出力のJSONとして保存できます。環境依存の測定値をrelease gateの固定閾値にはしません。結果の採否と、markerや表示範囲を変更するかどうかは[`docs/r20-conservative-graph-review.md`](../../docs/r20-conservative-graph-review.md)へ記録します。
