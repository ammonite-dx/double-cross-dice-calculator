# R24 Final Release Audit

## 目的と判定

R24は、Total Damageのresource preflightと、計算結果の意味論・数値安全性をrelease candidateとして監査するための記録である。初回のR24-B closure後、強制失敗と表示上の達成値0が対決・固定難易度で混同される問題、有限supportのScore tail moment certificateと型定義の不一致、FFT係数の重大な負値を黙って0へ潰す問題、Runtime Damageの独立オラクル不足が追加レビューで判明した。R24 Follow-up C1〜C4でこれらを修正し、以下に検証結果を記録する。

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

### R24 Follow-up C1〜C4

- `374f43a`: Scoreのmetadataとstatisticsを`forcedFailureProbability`へ改名し、表示上の0から強制失敗と通常の0を分離する`getScoreOutcomePartition()`を追加した。固定難易度、Check対決、Attack命中を同じ意味論へ接続し、既存の表示バケットは変更していない。
- `032bae1`: `ScoreTailMomentCertificate`を有限support用と解析tail用の判別unionへ分割し、実行時の有限証明書へ解析専用フィールドを要求しない型契約とTypeScriptコンパイルフィクスチャを追加した。
- `3497d40`: 共通FFT後処理で非有限係数と許容値を超える負係数をfail-closed化し、`1e-12`以内の負の丸めノイズだけを0へ補正した。`sumDistribution`、`subDistribution`、既存Damage集約の回帰を維持した。
- `01e2842`: Runtime Damageの小規模な独立総当たりオラクルをテストへ追加し、ダメージダイス0〜3、《風鳴りの爪》0〜2、混合weight、非単位質量を本番生成と比較した。

## 監査結果

### 計算・certificate契約

既存のruntime rule、独立oracle、数値監査、certificate validatorを含むテスト群が成功した。Score tail first moment、Damage expectation、Total Damageのcomponent interval propagationは現行C1B／C3A／C3B／C3C契約どおりであり、semantic uncertaintyと数値診断を混同しない。R24-C1では強制失敗を通常の達成値0から分離し、表示用の`result.values[0]`へは従来どおり両者を合算したまま、固定難易度0・対決・Attack命中の判定だけを強制失敗規則へ従わせた。R24-C2では有限supportと解析tailのcertificate型を実行時生成物に合わせた。R24-C3ではFFTの重大な負値を例外にし、R24-C4では生成器と異なる独立列挙でDRの小規模ケースを検証した。R23 precision auditは15 fixture（`bounded` 14、`exact` 1）で、安定丸め14件、追加近似候補0件だった。tail attribution auditは13 fixtureを調査し、有限上界候補4件、certificate不足9件を記録した。後者の候補値は研究用であり、production表示へ推測値として接続しない。

### Resource planningとruntime lifecycle

Total Damageはcomponent snapshot、aggregation plan、FFT／メモリ／出力長見積り、200 ms hard-limit判定、ResourceGuard lease、畳み込み、summary／certificateの順に進む。畳み込み1回はforward FFT 2回とinverse FFT 1回として数え、推定CPU時間が上限を超える場合はlease取得とFFT実行より前に`resource-limit`で拒否する。ResourceGuardはメモリ予約、active／queued request、Abort、lease解放を担当し、Attack batchのTotalも同じaggregation planを通る。

### Worker、UI、公開surface

production browser smokeでCheck、Attack、Backtrackの代表入力、表示範囲のreject／recovery、canvas描画、latest-wins、Worker境界を確認した。productionからprecomputed assetを取得せず、same-origin request failure、page error、console warning／errorは0件だった。公開schema-v2／revision-1の32 assetは検証済みであり、Reference repositoryとgeneratorはproduction計算経路から分離されている。

## R24-Aで閉じた項目

- Total Damageだけに残っていたFFT operation countの不一致を、共有`fftOperationCount()`へ統一した。
- `estimatedTimeMs = operations / 8,000,000`をplanへ公開し、200 ms hard rejectをFFT／lease前へ追加した。
- component数ではなくestimated workで判定するCPU-heavy regressionを追加した。
- Phase 8完了後もlive TODOに残っていた旧JSON・旧生成系の削除要求をhistorical／doneへ整理した。

## R24 Follow-upで閉じた項目

- 表示上同じ0となる強制失敗と通常の達成値0を、`forcedFailureProbability`と疎な通常バケットへ分離した。強制失敗するアクションは対決に勝たず、強制失敗するリアクションには通常アクションが勝ち、通常同士の同値はリアクション勝利とする。固定難易度0では通常の0を成功、強制失敗を失敗として扱う。
- Score tail moment certificateの判別unionを導入し、有限supportの実行時証明書へ解析専用の寄与内訳を付加しない。
- FFTの逆変換係数を有限性・負値閾値つきで検査し、重大な負値を計算失敗として伝播する。
- Runtime Damageについて、kazanariの出目規則をテスト側で直接列挙する独立オラクルを追加し、既存asset比較を補強した。

## RC blockers

```text
none
```

現行のaccepted domainではcorrectness、安全性、certificate、runtime lifecycle、表示、resource policyがrelease gateで確認できている。R24 Follow-up C1〜C4の修正後、下記のfresh full gateがすべて成功したため、R24の最終判定を`Release Candidate: GREEN`とする。

## Deferred

以下は今回のrelease blockerではない。

- 低速実機での追加性能測定: 現行accepted domainのresource policyは成立しており、追加端末の測定は性能改善を判断する独立作業とする。
- 入力上限のさらなる拡張: 現行のsafe-integerとresource hard limitを維持し、実測に基づく別レビューで判断する。
- 追加のWorker化: 現行のDXメインスレッド、DR Worker、Backtrack runtime coreの境界で受入条件を満たしているため、必要な負荷が再現した場合に再評価する。
- HTTP APIとMCP: 静的Pagesとブラウザ内計算を今回の公開構成として維持し、外部提供は計算coreの契約が安定した後の将来目標とする。

## Historical

Phase 8-2の旧生成元・schema-v1・dense JSON・legacy calculation surfaceに関する`open`記述は、後続作業で完了した当時の履歴であり、live TODOではない。削除理由と移行先は[`phase8-inventory.md`](./phase8-inventory.md)とGit履歴に残している。R23のDamage期待値調査も、現在のproduction仕様ではなくC1B以前の研究記録として[`r23-damage-expectation-investigation.md`](./r23-damage-expectation-investigation.md)に保持する。

## Fresh verification

R24 Follow-up C1〜C4とC5文書更新の作業ツリーで、2026-09-14に次の監査とrelease gateを実行した。

```powershell
npm run audit:r23:damage-precision
npm run audit:r23:damage-tail
npm run verify:release
```

結果は次のとおりである。

- `audit:r23:damage-precision`: 15 fixture（`bounded` 14、`exact` 1、安定丸め14、追加近似候補0）で成功した。
- `audit:r23:damage-tail`: 13 fixtureのtail attribution監査が成功した（有限上界候補4、certificate不足9）。
- `verify:release`: Node 22.23.2、schema-v2／revision-1の32 asset、Vitest 103 files / 1071 tests、generator 18件、simulation 13件、Ruff、typecheck、ESLint、Markdown lint 62 files / 0 issues、runtime DX 20,000ケース、build 424 modules、production browser smoke、`git diff --check`がすべてGREENだった。
- `production browser smoke`: Check／Attack／Backtrack、表示範囲のreject／recovery、latest-wins、canvas描画、precomputed request 0件、page／console／same-origin error 0件を確認した。

この実装報告に、closure commitの最終HEAD full SHAと、コミット後の作業ツリーがcleanであることを記録する。
