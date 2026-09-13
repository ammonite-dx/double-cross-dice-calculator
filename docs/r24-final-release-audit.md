# R24 Final Release Audit

## 目的と判定

R24は、R24-Aで追加したTotal Damageのresource preflightを含む現行実装をrelease candidateとして監査し、live documentationが実装と一致していることを確認するための記録である。R24-Bでは計算ロジック、UI、certificate schema、resource thresholdを変更せず、現行契約を説明する文書と履歴資料だけを更新した。

- 状態: `CLOSED / GREEN`
- Release Candidate: `GREEN`
- P0 / P1 / P2: `0 / 0 / 0`
- 最終HEAD: この文書を含むclosure commitのfull SHAは、release gate完了時の実装報告に記録する

## 対象コミット

### R24-A Total Damage resource preflight closure

- `d067e2a`: Total DamageのFFT workを共有`fftOperationCount()`へ統一し、8,000,000 operations/msと200 ms hard limitによる計画時の時間拒否を追加した。
- `d193027`: 3変換分のコスト、有限の推定時間、CPU-heavy／memory-light拒否、軽量な多数component、lease／FFT前のclient拒否を回帰テストへ追加した。
- `fef19d2`: Phase 8完了後もopenのままだった旧生成元・移行専用テストTODOを完了扱いへ更新した。

### R24-B Final Documentation & Release Closure

- `336e7fa`: READMEのDamage期待値参照先を現行certificate文書へ変更し、R23調査文書をhistorical investigationとして明示した。
- `640c21e`: PlanningMath、architecture、runtime algorithm文書をR24-A後のTotal Damage resource planningへ同期した。
- この文書と`docs/todo.md`のR24 closure記録は、後続のdocs-only closure commitに含める。

## 監査結果

### 計算・certificate契約

既存のruntime rule、独立oracle、数値監査、certificate validatorを含むテスト群が成功した。Score tail first moment、Damage expectation、Total Damageのcomponent interval propagationは現行C1B／C3A／C3B／C3C契約どおりであり、semantic uncertaintyと数値診断を混同しない。R23 precision auditは15 fixture（`bounded` 14、`exact` 1）で、安定丸め14件、追加近似候補0件だった。tail attribution auditは13 fixtureを調査し、有限上界候補4件、certificate不足9件を記録した。後者の候補値は研究用であり、production表示へ推測値として接続しない。

### Resource planningとruntime lifecycle

Total Damageはcomponent snapshot、aggregation plan、FFT／メモリ／出力長見積り、200 ms hard-limit判定、ResourceGuard lease、畳み込み、summary／certificateの順に進む。畳み込み1回はforward FFT 2回とinverse FFT 1回として数え、推定CPU時間が上限を超える場合はlease取得とFFT実行より前に`resource-limit`で拒否する。ResourceGuardはメモリ予約、active／queued request、Abort、lease解放を担当し、Attack batchのTotalも同じaggregation planを通る。

### Worker、UI、公開surface

production browser smokeでCheck、Attack、Backtrackの代表入力、表示範囲のreject／recovery、canvas描画、latest-wins、Worker境界を確認した。productionからprecomputed assetを取得せず、same-origin request failure、page error、console warning／errorは0件だった。公開schema-v2／revision-1の32 assetは検証済みであり、Reference repositoryとgeneratorはproduction計算経路から分離されている。

## R24-Aで閉じた項目

- Total Damageだけに残っていたFFT operation countの不一致を、共有`fftOperationCount()`へ統一した。
- `estimatedTimeMs = operations / 8,000,000`をplanへ公開し、200 ms hard rejectをFFT／lease前へ追加した。
- component数ではなくestimated workで判定するCPU-heavy regressionを追加した。
- Phase 8完了後もlive TODOに残っていた旧JSON・旧生成系の削除要求をhistorical／doneへ整理した。

## RC blockers

```text
none
```

現行のaccepted domainではcorrectness、安全性、certificate、runtime lifecycle、表示、resource policyがrelease gateで確認できている。R24の最終判定は`Release Candidate: GREEN`とする。

## Deferred

以下は今回のrelease blockerではない。

- 低速実機での追加性能測定: 現行accepted domainのresource policyは成立しており、追加端末の測定は性能改善を判断する独立作業とする。
- 入力上限のさらなる拡張: 現行のsafe-integerとresource hard limitを維持し、実測に基づく別レビューで判断する。
- 追加のWorker化: 現行のDXメインスレッド、DR Worker、Backtrack runtime coreの境界で受入条件を満たしているため、必要な負荷が再現した場合に再評価する。
- HTTP APIとMCP: 静的Pagesとブラウザ内計算を今回の公開構成として維持し、外部提供は計算coreの契約が安定した後の将来目標とする。

## Historical

Phase 8-2の旧生成元・schema-v1・dense JSON・legacy calculation surfaceに関する`open`記述は、後続作業で完了した当時の履歴であり、live TODOではない。削除理由と移行先は[`phase8-inventory.md`](./phase8-inventory.md)とGit履歴に残している。R23のDamage期待値調査も、現在のproduction仕様ではなくC1B以前の研究記録として[`r23-damage-expectation-investigation.md`](./r23-damage-expectation-investigation.md)に保持する。

## Fresh verification

文書更新後の最終HEADで、次の監査とrelease gateを実行する。

```powershell
npm run audit:r23:damage-precision
npm run audit:r23:damage-tail
npm run verify:release
```

期待する結果は、2本の監査が成功し、`verify:release`のNode、data asset、Vitest、generator、simulation、Ruff、typecheck、runtime DX、ESLint、Markdown lint、build、production browser smoke、diff checkがすべてGREENとなることである。最終結果、Vitest／generatorの件数、production smokeの結果、full SHA、作業ツリーの状態はこの監査に対応する実装報告へ記録する。
