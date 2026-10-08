# TODO

このファイルは、現行の実装と今後の判断だけを記録する。完了済みの移行記録と詳細な作業日誌は [`archive/todo-history.md`](./archive/todo-history.md) に保存する。

## 現在の方針

- 公開サイトは静的SPAとして維持し、確率計算はブラウザ内のruntimeを正本とする。
- 旧来の確率JSONは [`tooling/reference-data/assets/`](../tooling/reference-data/assets/) に参照用として保持し、公開成果物へは含めない。
- `published-bucket` はproductionの計算・表示モードではなく、[`tooling/reference-data/PublishedBucketCompatibility.js`](../tooling/reference-data/PublishedBucketCompatibility.js)に置く歴史的比較・互換adapterとして維持する。
- productionの計算範囲に`calculationMax=1022`や`PUBLISHED_OVERFLOW_INDEX=1023`を置かない。これらは`tooling/reference-data/`にある歴史的な比較形式の定数としてのみ保持する。入力・表示範囲は要求されたwindowと数学的supportから計画し、resource guardで安全性を判定する。
- DXの直接APIは暗黙の既定配列長を持たず、呼び出し側が`workingLength`を明示する。通常のproduction呼び出しでは`ScoreRangePlanner`がtail certificateと要求windowから値を決める。
- DRのFFT長と出力長は、明示指定がない限り入力の有限supportから動的に導出する。Backtrackは通常D10・Dロイス《屍人》ともon-demand生成し、歴史的assetのcoverage metadataをproduction planへ持ち込まない。
- 結果契約、資源ガード、latest-wins、Worker境界、数値許容誤差を変更する場合は、先に対応するテストと文書を更新する。

## 次に行う作業

1. **実画面dogfoodingと具体的なUI修正の確認**: S05はCOMPLETE / GREEN。次の優先候補は実際のCheck／Attack／Backtrack画面を操作して、修正対象のUI課題を特定すること。RangePlanNoticeの配置、技術的なエラー文言、高度設定の文字サイズなどはdogfoodingで必要性と期待動作を確認してから扱い、グラフ中心のUIと表示連続性を維持する。S07/S08や公開準備へ自動的に着手しない。背景は[ユーザー主導のUIレビュー記録](./archive/r23-user-supervised-ui-review.md)を参照する。

## 独立レビューに基づく改修案

[リポジトリの独立レビューとコード簡素化計画](./repository-review-and-kiss-plan.md)に、B01を含む不具合5件の調査記録、KISS原則に沿った具体的な整理案、変更単位と回帰検証をまとめた。B01からB05、S01からS06は検証してCLOSED / GREENとし、S05の状態所有整理もCOMPLETE / GREENである。グラフ中心のUIと既存の計算契約・描画継続を維持する。同文書の未完了案は実装済みの変更や既存ADRの置換を意味しない。

## 保留

- 実測に基づくruntimeの性能・メモリ上限の再調整。
- Cloudflare Worker/API/MCP連携。結果契約と公開境界が安定するまで着手しない。
- 公開ライセンス、出典、公開範囲、再生成手順の整理。実画面dogfoodingと具体的なUI課題の確認後に別途優先度を決め、自動的に着手しない。
- 教科書の《支配の領域》関連章の残りをレビューする。順序統計量と正則化不完全ベータ関数の説明を追加し、再帰式が現行実装ではなく別の導出であることを明記した。残るのは学習者向けの流れ・式の説明のレビューである。

## 完了した直近の作業

- **独立レビューS04: Attack presentation生成経路の一本化**: 通常commitで計算recordのsnapshotからbase presentationを一度だけ生成し、通常commitと表示-only更新が同じbase-to-display projectorを使うようにした。表示-only更新は既存baseを再利用し、base/display生成失敗からも数値計算を再実行せず復帰する。`AttackRunnerPresentation`/`TPresentation`と旧factory経路・不要castを削除し、score/damage独立性、coverage再計算、latest-winsを維持した。S04は2026年10月8日にCLOSED / GREENとし、詳細は[独立レビュー計画](./repository-review-and-kiss-plan.md#s04-attackの表示生成を一経路にする完了)を参照する。
- **独立レビューS05-A/B: Attack状態・feedback所有の局所整理**: presentation clearをbase+display/display-onlyの2 scopeへ集約し、feedback publicationをdamage/score lane別の小さな関数へ統一した。reactive object参照、エラーprovenance、score/damage独立性は維持し、重複clearとfield更新だけを削減。presentation retry・後発calculation error・score-only failure・dispose後の遅延結果を回帰化した。S05は2026年10月9日にCOMPLETE / GREEN。検証詳細と次のUI dogfooding候補は[独立レビュー計画](./repository-review-and-kiss-plan.md)を参照する。
- **独立レビューS06-A: Attackの操作別無効化と表示revision競合**: Coordinator revisionは数値要求の最新性、damage/score revisionは表示要求の最新性を担うことをDeferred Promiseで検証した。表示revision不一致時にも有効な数値recordはcommitし、最新display/score requestで再projectionするよう修正。score coverage拡張中のdamage表示変更はCoordinator latest-winsで古い計算を抑止し、score-only invalid/resource/error時のdamage commitを維持した。S05状態監査で未参照の`feedbackErrorProvenance.revision`を削除し、total error clearを共通invalidation helperへ統合。S06は2026年10月8日にCLOSED / GREEN、S05は2026年10月9日にCOMPLETE / GREEN。matrix対応は[独立レビュー計画](./repository-review-and-kiss-plan.md#s06-a-表示revision競合と操作別回帰matrix完了)を参照する。
- **独立レビューS02/S03: Check初期計算とsnapshot契約の整理**: `useCheck`を同期controllerにし、初期・入力更新・coverage再計算を同じcoordinator経路へ統一した。Vue mount/unmount lifecycle、初回要求一度、pending時のAbort、late plan/result抑止、初期error/rejectionから通常入力更新による復帰をテストした。coordinatorのgeneric deep cloneを削除し、shape-specificな`snapshotRequest`を型・runtime両方で必須化した。全体検証は85ファイル・1,030テスト、typecheck、ESLint、Markdown lint（114ファイル・0 issue）、build、production browser smoke、diff checkが成功した。詳細は[独立レビュー計画](./repository-review-and-kiss-plan.md)のS02/S03記録を参照する。
- **独立レビューB03/B04・S01: Check入力契約とinvalid draftの整理**: Checkの計算入力をfixed/opposed unionにし、fixed requestからreactionを除外した。固定結果にはreaction distribution/statisticsを要求せず、固定判定へscore tail予算全量を使う（commit `a1381ee`）。Check、Attack、Backtrackのフォームは`validating`/`invalid`/`valid`を通知し、旧要求を即時invalidate、invalid確定時に旧結果をclearする（commit `6c4a463`）。本番ブラウザでreaction resource rejectionからのfixed復帰、3画面のinvalid→valid復帰、既存のvalid-to-valid chartとsummary/footer continuityを確認した。全体検証は85テストファイル・1,026テスト、型検査、lint、Markdown lint、buildを通過した。
- **B04 advanced-settings follow-up**: Check、Attackの高度な設定切替でもフォームが最新ticketによる通常のvalidation lifecycleを通知し、feature側はtoggle単独でinvalid blockerを解除しない。無効な高度項目だけなら非表示化後に自動復帰し、基本項目が無効なら結果はclearのまま維持する。Attackでinvalidな未確定draftを持つコンボを畳んだ場合は、他にblockerがなく計算結果もreadyでなければ最後の有効snapshotから復帰する。詳細と実ブラウザ検証は[`repository-review-and-kiss-plan.md`](./repository-review-and-kiss-plan.md)のB04 advanced-settings follow-upを参照する。
- **独立レビューB02/B05: 表示位置とコンボ操作の修正**: Checkでは現在の表示最小値を使ってカテゴリ軸の難易度位置を変換し、範囲外・対決判定では注釈を隠す。攻撃コンボの操作ボタンに対象別のアクセシブル名と開閉状態を付け、空名は表示序数へフォールバックする。オプションテスト、本番ブラウザのcanvas画素検証、390px／デスクトップのアクセシビリティ・キーボード操作を確認した。実装commitは`a47b7b2`。詳細は[`repository-review-and-kiss-plan.md`](./repository-review-and-kiss-plan.md)のB02/B05 follow-upを参照する。
- **R30-prep: B01二項tail高速化・数値安定化と再計測**: 正の《支配の領域》で使う二項survivalを正則化不完全ベータ関数の修正Lentz連分数で評価する単一経路を維持し、補数を独立に渡す二引数連分数で巨大dice・小確率時の精度を修正した。central rank 100,000,000D、1兆D端rank、cutoff error budget、PMFの非負性とmassを検証した。Nodeとブラウザでplanner/producer、Check、通常域、edge tailを測り、対象ケースで50ms以上のLong Taskやnon-convergenceがないことを確認してB01をCLOSEDとした。詳細は[`archive/r30-prep-b01-order-statistic-tail.md`](./archive/r30-prep-b01-order-statistic-tail.md)を参照する。
- **R30-prep: summary visual continuity**: Check／Attackでreplacement計算中にready frameをUIだけで保持し、Summary cardとtableの同一DOM nodeを新しいready値への更新まで維持する。Attackのscore-only coverage再計算中も達成値期待値・命中率を維持し、loading終了後は成功・rejectionの現在状態へ切り替える。browser smokeで可視性・高さ・内容更新・recoveryを確認した。詳細は[`archive/r30-prep-summary-visual-continuity.md`](./archive/r30-prep-summary-visual-continuity.md)を参照する。
- **R30-prep: Attack reaction tailのDamage分類**: 有限なaction scoreの最大値以下にならないreaction tailを、対決時のtieはreaction側勝利となる規則に基づいてdamage 0のfailureへ分類した。比較・期待値certificateで実際に確率を持つaction bucketの最大値を共有し、曖昧なtailや許容誤差を超えるtail確率誤差は従来どおり保守的に保持する。reactionのtail uncertaintyとDamage座標supportを分離し、許容誤差内の質量差は再正規化せず未確定tailとして増幅しない。詳細は[`archive/r30-prep-attack-reaction-tail-damage.md`](./archive/r30-prep-attack-reaction-tail-damage.md)を参照する。
- **R30-prep: summary layout continuity**: Check／Attackのreplacement計算中にサマリー行の実測高さだけを一時保持し、footerの位置ずれを防いだ。サマリー値やcurrent calculation stateは保持せず、初回・error・rejection・invalidateではlayout cacheを残さない。ブラウザsmokeで遷移中の高さとfooter位置、拒否時clearを確認した。詳細は[`archive/r30-prep-summary-layout-continuity.md`](./archive/r30-prep-summary-layout-continuity.md)を参照する。
- **R30-prep: chart transition parity**: Check／Attack／Backtrackの再計算中は直前のreadyな描画frameだけを一時保持し、完了時に新結果へ置換、失敗・拒否時に消去する。計算状態やlatest-winsの契約は変更せず、Attack系列のidentityをcombo IDで安定化した。詳細とブラウザsmoke記録は[`archive/r30-prep-chart-transition-parity.md`](./archive/r30-prep-chart-transition-parity.md)を参照する。
- **R30-prep: post-TypeScript boundary cleanup**: RangePlannerの入力・戻り値を操作別型へ収束し、CalculationClientのruntime optionをallowlist化した。production TypeScriptの未使用宣言lint、古いJavaScript呼び出しの修正、DataView snapshot範囲の保持も完了した。`verify:all`による最終確認と作業記録は[`archive/r30-prep-post-typescript-boundary-cleanup.md`](./archive/r30-prep-post-typescript-boundary-cleanup.md)を参照する。
- **R30-prep: 《屍人》runtime最適化と表示丸めの安定化**: 《屍人》のmax/sum状態DPをbounded-sum DPへ置き換え、generation work・メモリ見積りを更新した。Check、Attack、Backtrackで小数1桁表示の丸めを共通化し、歴史fixture、直接列挙、845D/846D境界、表示回帰を検証した。詳細は[`archive/r30-prep-livingdead-runtime-optimization.md`](./archive/r30-prep-livingdead-runtime-optimization.md)を参照する。
- **R29-I: architecture convergence closure**: R29-A〜Hの計算・runtime・presentation・参照境界と検証責務を監査し、旧移行用語を整理した。全体ゲートが成功し、R29を`CLOSED / GREEN`とした。詳細は[`archive/r29-i-architecture-convergence-closure.md`](./archive/r29-i-architecture-convergence-closure.md)を参照する。
- **R29-H: active documentation and naming cleanup**: production presentation DTO、Attack runtime benchmark、現行用語とドキュメントを整理し、active Markdown link contractを追加した。詳細は[`archive/r29-h-active-documentation-naming-cleanup.md`](./archive/r29-h-active-documentation-naming-cleanup.md)を参照する。
