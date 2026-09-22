# R29-D: Attack lifecycle convergence

## 目的

Attack の計算結果と表示結果を同じ runner 内のキャッシュで二重管理せず、入力 snapshot と state にコミットされた計算レコードをライフサイクルの正本にする。計算が成功した後の表示失敗・再試行でも、コンボ計算や合計計算を再実行せずに表示を再構築できることを目標とした。

## 変更内容

- `AttackState` に、現在のコンボ順・入力・各コンボの `AttackCalculationRecord`・`AttackTotalCalculationRecord` が完全に整合しているかを検査し、`AttackBatchResult` と range plan を再構築する `getCommittedAttackCalculationSnapshot` を追加した。
- `AttackRunner` の `lastBatchResult`、`lastRangePlans`、`lastEntries`、`activeRequest` 依存を削除した。表示更新は、計算コミット後または表示再試行時に state の committed snapshot を読み取る。
- Attack 専用の request snapshot を coordinator に渡し、entries、再利用可能な committed records、display request、score display request、表示世代、計算オプションを開始時点で固定した。実行中に変化した mutable request を参照しない。
- `CalculationRequestCoordinator` の最新要求・Abort・dispose・commit境界を直接利用し、Attack で互換 wrapper の `createLatestCalculationRunner` を使わないようにした。
- score display は `enabled`、`suppressed`、`recalculating` と独立 revision・request を持つ単一のライフサイクル状態として扱った。score-only の失敗・resource rejection・stale request は damage の committed calculation/presentation を消費しない。
- presentation failure と calculation failure の provenance を分けた。presentation-only の再試行は calculation error を消去せず、同じ committed calculation からの成功時だけ表示エラーを回復する。
- `useAttack` は runner が固定した committed records を incremental executor へ渡し、executor が mutable な Vue state を実行途中に読み直さないようにした。

## 保持した契約

コンボ単位の incremental reuse、total-only retry、partial combo failure、display/resource failure、score coverage expansion、latest-wins、Abort、dispose 後の stale promise 抑制、ID と入力 snapshot の整合性、canonical score/damage の support・overflow・resource semantics は変更していない。計算アルゴリズム、Worker、ResourceGuard の閾値、表示見た目も変更していない。

## 検証

Attack の state、incremental execution/runner、feature controller、display integration/presentation、score/damage adapter の回帰テストを実行した。最終 HEAD `11a1fbf`（`fix: tie attack presentation errors to coordinator revision`）では、Vitest 88 files / 1025 tests、typecheck、ESLint、Markdown lint、build、`verify:release`、production browser smoke、`git diff --check` がすべて成功し、作業ツリーも clean である。

## 次の作業

次は R29-E（移行期 compatibility surface の監査）である。R29-E では、今回残した互換 wrapper や型 alias を一括削除せず、production が依存する境界と historical/reference 境界を確認してから整理する。
