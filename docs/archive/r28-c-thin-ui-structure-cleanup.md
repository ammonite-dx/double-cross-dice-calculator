# R28-C: thin UI structure and naming cleanup

## 目的

R28-Cでは、R28-B2までに整理したproduction／reference／experimentの境界を前提に、feature UIに残っていた薄いラッパーと移行時の命名を整理した。計算式、結果契約、resource policy、Worker protocol、入力・表示の意味論は変更していない。R28-DのCSS責務整理には着手していない。

## 実装

- `src/router/index.js`から`src/views/Check.vue`、`Attack.vue`、`Backtrack.vue`を経由せず、各featureのPage componentへ直接lazy importするようにした。
- 参照が存在しなかった`src/features/{check,attack,backtrack}/index.ts`を削除した。
- `src/features/backtrack/ui/InputForm.vue`を削除し、入力フォームを`InputPanel.vue`へ直接配置した。`pa-0`のレイアウト、validated event、RangePlanNoticeの配置は維持した。
- Checkの難易度フォームを`DifficultyForm.vue`へ移し、`DifficultyInput`の型付きprops／emit、`difficulty-validated`イベント、validation gate、対決・通常判定の入力規則を維持した。`CheckInputSnapshot`と`getScoreStatistics`の内部名も`difficulty`へ統一した。
- Check、Attack、Backtrackのチャートモジュールを、`CheckChartConfig.js`、`AttackChartAdapter.js`、`BacktrackChartAdapter.js`へ変更した。既存のexport、payload、ラベル、色、表示オプションは変更していない。
- Backtrack presentationのコメントと既存テストの参照名を新しいチャートアダプタ名に合わせた。

## 作業単位

R28-Cは次の3コミットで構成する。

1. `34c2838` `refactor: remove thin feature wrappers`
2. `d97572b` `refactor: normalize check difficulty naming`
3. `51f5a1d` `refactor: rename feature chart adapters`

開始時点はR28-B2完了後の`19d7401`である。

## 検証

- Check／Backtrackの入力契約、各チャートアダプタ、既存の表示アダプタを含む対象テストを実行し、7 files／79 testsが成功した。
- `src/**`から`Dfclty`、`dfclty`、`ChartSetter`を検索して該当なしであることを確認した。
- 削除したview、feature barrel、Backtrack入力ラッパーへのテスト参照を更新した。

R28-Cの最終gateでは、`npm test`、`npm run typecheck`、`npm run lint`、`npm run lint:markdown`、`npm run build`、`npm run verify:browser`、`git diff --check`を実行する。履歴実験suiteとreference suiteはこのgateの必須対象ではない。

## 非対象と次の作業

R28-CではCSSの所有権、余白、ブレークポイント、視覚的な表示契約を変更していない。次はR28-Dでこれらを整理するが、R28-Dの実装は別レビュー後に開始する。
