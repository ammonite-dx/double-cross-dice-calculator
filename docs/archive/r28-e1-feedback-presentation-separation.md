# R28-E1: CalculationFeedback presentation separation

## 目的

R28-E1では、計算フィードバックの状態管理と、ユーザー向けの表示整形を別の責務として分離した。計算・入力・表示の意味論、ライフサイクル、既存の日本語表示は変更していない。

## 実装

- `src/components/RangePlanNoticeFormatter.ts`を追加し、範囲警告の理由、ResourceGuardエラー、メモリ量、overflow、回復アクションを表示用DTOへ変換する処理を集約した。
- `src/components/RangePlanNotice.vue`は`CalculationFeedback`ではなく、同じpresentation境界にある`RangePlanNoticeFormatter`を直接利用するようにした。テンプレートと表示文言は維持した。
- `src/runtime/CalculationFeedback.ts`から日本語文言、`Intl.NumberFormat`、メモリ・overflow整形、ResourceGuardの表示分類を削除し、feedback stateの生成・更新、エラー分類、初期計算、latest runner、request coordinatorの接続だけを残した。
- 表示DTOの`CalculationRangeFeedbackDisplay`をruntime typeから削除し、`RangePlanNoticeDisplay`をformatter側へ移した。runtimeからcomponent/presentationへの依存や互換再exportは追加していない。
- formatterの表示契約テストを`tests/rangePlanNoticeFormatter.test.js`へ分離し、`tests/calculationFeedback.test.js`はstale抑制、abort、error、rejected、retry、invalidateなどの状態意味論を検証する構成にした。既存のBacktrack／ResourceGuard統合テストは新formatterを参照する。

## 作業単位

R28-E1は、表示責務の分離、テスト境界の分離、TODOと本アーカイブの更新を同一作業単位として実施した。R28-E2のBacktrack chart presentation cleanupは着手していない。

## 検証

- Vitest: 87 files／1011 testsが成功した。
- `npm run typecheck`、`npm run lint`、`npm run lint:markdown`が成功した。
- `formatRangeFeedback`のruntime exportと`CalculationRangeFeedbackDisplay`のruntime typeは削除され、formatterとRangePlanNoticeだけが表示整形を参照する。
- `git diff --check`、`npm run build`、`npm run verify:browser`はコミット前の最終検証で実行する。

## 非対象と次の作業

R28-E1では、表示範囲の計画、計算結果、ResourceGuardの実装、チャート表示、`metrics.time`の追加、Backtrackのカテゴリpresentationを変更していない。次はR28-E2でBacktrack chart presentation cleanupを行い、その後に公開準備とresource policy調整へ進む。
