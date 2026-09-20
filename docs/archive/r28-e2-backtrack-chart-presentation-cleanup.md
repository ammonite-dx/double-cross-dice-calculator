# R28-E2: Backtrack chart presentation cleanup

## 目的

R28-E2では、Backtrackの計算結果をチャートへ渡すpresentationを、計算モデルが完成させる責務として整理した。UIはDロイスや表示モードを解釈せず、モデルが決めたカテゴリ、ラベル、色、タイトル、アクセシブル名をそのまま描画する。

カテゴリ境界、確率値、丸め、符号付きの最終侵蝕率座標、チャートの見た目は変更していない。

## 実装

- `BacktrackPresentation.js`を`BacktrackPresentation.ts`へ移行し、presentation versionを2へ更新した。返却形状は`{ version, kind, charts: { single, double, second } }`とし、各chartは`key`、`labels`、`probabilities`、`backgroundColors`、任意の`title`、`accessibleName`を持つ。
- 通常時と《屍人・悪夢》の一倍振りについて、既存のカテゴリ境界・ラベル・色をモデルで確定した。二倍振りと二倍振り+追加振りのタイトル・アクセシブル名もモデル側で保持する。《屍人・悪夢》の一倍振りは既存表示に視覚的タイトルがないため、`title`を持たない。
- presentation生成時のカテゴリ集約後丸め、有限supportとoverflowの検証、確率配列とチャートmetadataのdeep freezeを維持した。
- `BacktrackController`、`useBacktrack`、runner、Backtrack page、チャートパネルのstateを`finalEncroachment`から`presentation`へ統一した。計算完了時はpresentation全体を一度にcommitし、abort・range rejection・計算エラー・dispose時には旧表示を残さず`null`へ戻す。
- `FinalEncroachmentChartPanel.vue`は3つのchartをpresentationから直接渡す。`FinalEncroachmentChart.vue`と`BacktrackChartAdapter.js`はchart metadataだけを受け取り、`dlois`や`mode`からラベル・色・タイトルを再構成しない。
- 旧`BacktrackChartData`型、`finalEncroachment` payload、mode別の旧チャートadapter exportを削除した。計算コアにおける`finalEncroachment`は座標名として残している。

## 作業単位

R28-E2は、presentation modelの型付き移行、UI／adapterの責務縮小、ライフサイクルstateの統一、回帰テスト、型境界、TODOと本アーカイブの更新を一つの作業単位として実施した。R28-F以降のrepository cleanupや公開準備には着手していない。

## 検証

- `npm test`: 88 files／1016 testsが成功した。
- `npm run typecheck`、`npm run lint`、`npm run lint:markdown`（96 files／0 issues）、`npm run build`が成功した。production buildは457 modulesを変換した。
- `npm run verify:browser`が成功した。Check、Attack、Backtrackのon-demand計算、表示範囲のreject／recovery、mobile styleを検証し、Backtrackは3 canvases、precomputed requests 0、console warnings/errors 0、same-origin HTTP errors 0だった。
- Backtrack presentationのカテゴリ境界、metadata、immutability、adapter mapping、runnerのabort／error／retry lifecycle、runtime rule validationを回帰テストで検証する。
- `git diff --check`を実行し、コミット後の作業ツリーがcleanであることを確認する。

## 非対象と次の作業

R28-E2では、Backtrackの計算式、入力範囲、resource policy、チャートの表示範囲、外部API／Worker／MCP、歴史的reference assetを変更していない。次はR28-Fでrepository cleanup closure auditを行い、その後に公開準備とresource policy調整へ進む。
