# R8 `src/data`責務分離

## 1. 目的と範囲

R8では、旧`src/data`に混在していたproduction probability、shared theme、reference precomputed supportを責務ごとの境界へ分離した。R9で扱うapplication／presentation／runtimeの再配置、計算アルゴリズムの変更、UI表示の変更、Cloudflare Worker／HTTP API／MCP化は対象外である。

## 2. 開始点とコミット履歴

R8全体の開始点は`42b2ff6d86f4fe2c7d3a7e55f579f19929535545`（`docs: close attack feature acceptance`）である。今回のfinal closure follow-upは`d3d53fd1a9b67dba84a36e72ce20ba63ce0edd5f`（`docs: close data responsibility separation`）から開始した。

| 単位 | SHA | 内容 |
| --- | --- | --- |
| Probability primitives | `ddb43ad325f10e8d2c7bd2b8f0975c34ce59af07` | Distribution／FFTを`src/core/probability`へ移動 |
| Chart palette | `f625e02d5c40fd41acb27c231a8987f31025acc7` | ChartPaletteを`src/shared/theme`へ移動 |
| Reference tooling | `924c81717bb4d071bab8e3889250ac58d09fb46b` | schema／repositoryを`tooling/reference-data`へ移動、責務境界テストを追加 |
| First docs closure | `d3d53fd1a9b67dba84a36e72ce20ba63ce0edd5f` | R8初回のpath・inventory・roadmap記録 |
| Final implementation | `64ccf0dc682c9ff24eaaed419138eccbcdc33615` | ESLint境界とlintText回帰テストを追加 |
| Docs closure | この文書を導入するdocs commit | 最終gate、優先度、R8 statusを記録 |

## 3. 最終責務マトリクス

| Responsibility | Canonical path | Allowed consumers |
| --- | --- | --- |
| Production probability | `src/core/probability/**` | calculation／applicationのpure core利用者、数値テスト |
| Shared theme | `src/shared/theme/**` | Check／AttackのUI・presentation利用者 |
| Reference data support | `tooling/reference-data/**` | tests、verification、比較・再生成支援 |
| Historical data path | `src/data/**` | 存在しない |

`src/data`ディレクトリ、旧5ファイル、互換re-export shimは削除した。公開schema-v2/revision-1 assetは保持しているが、production sourceからは参照しない。

## 4. 依存境界

- production `src/**`から`tooling/reference-data/**`へのimportは禁止する。
- `src/core/probability/**`はapplication、components、views、router、plugins、layouts、presentation、features、shared、reference tooling、`node:*`、Vue／Vuetify／Chart.js系packageへ依存しない。
- `src/shared/theme/**`はcalculation、core、domain、features、application、presentation、UI、reference tooling、`node:*`、Vue／Vuetify／Chart.js系packageへ依存しない。
- `src/shared/theme/**`から`src/shared/validation/**`、`src/shared/chart/**`など他のshared subsystemへの依存も禁止する。ただし同一themeディレクトリ内の相対module分割は許可する。
- reference toolingは検証支援としてproductionのpure core／domainを利用できるが、production側がreference toolingを利用する方向は許可しない。

ESLintはcoreのfeatures依存、shared themeの上位層・他shared subsystem・framework依存、reference toolingと旧`src/data`の再導入を検出する。`tests/dataResponsibilitiesArchitecture.test.js`は実ファイルのpath・import走査に加え、ESLint `lintText`でcore→features、theme→calculation、theme→shared validationの違反が実際にrejectされることを検証する。

## 5. 維持した契約

- Distributionの`OUTPUT_DISTRIBUTION_SIZE = 1024`、`WORKING_DISTRIBUTION_SIZE = 2048`、疎分布展開、shift、上側確率の挙動を維持した。
- FFTのexport、線形畳み込み、overflow最終バケット、異長入力、AbortSignal、`onFftLength`、エラー条件を維持した。`RuntimeDamageRollFFT.js`とは統合していない。
- ChartPaletteの9色と`id % 9`による選択、Check／Attackの表示色を維持した。Backtrack固有色は変更していない。
- schema-v2、revision-1、公開asset URL、確率許容差`2e-4`、DX／DR／livingdeadのvalidation、cache、DR LRU 3件、livingdead 224分布を維持した。
- CalculationClient、canonical result、RangePlanner、ResourceGuard、generator、public asset、production UIと計算意味論は変更していない。

## 6. Acceptance evidence

2026-09-03のfinal implementation treeで、次のgateを実行した。

| Gate | 結果 |
| --- | --- |
| Node | 22.23.2、`check:node` GREEN |
| Data | `data:check`／`data:verify-generator` 各32 assets、GREEN |
| Vitest | 71 files / 865 tests、GREEN |
| Generator | 18 passed / 13 deselected、GREEN |
| Simulation | 13 passed / 18 deselected、GREEN |
| Ruff | all checks passed |
| Typecheck | GREEN |
| Runtime DX | 20,000 cases、status passed、max absolute difference `1.0000000000287557e-6`、tolerance `1.000001e-6`、max total error `1.5543122344752192e-15`、non-finite 0、negative 0 |
| ESLint | GREEN |
| Markdown lint | 32 files / 0 issues |
| Build | GREEN、408 modules transformed |
| Production browser smoke | PASS、Check／Attack／Backtrackの100D、表示reject／recoveryを確認 |
| Browser network | precomputed request 0、D10 asset request 0 |
| Browser diagnostics | console warning/error 0、pageerror 0、same-origin HTTP error 0、same-origin request failure 0 |
| Diff check | `git diff --check` GREEN |

Production browser smoke後に、テスト用previewの待受ポート3000／4173が解放されていることも確認した。

## 7. 優先度と最終状態

R8の実装・検証範囲に未解決の問題はない。

```text
P0: 0
P1: 0
P2: 0
```

```text
R8: CLOSED / GREEN
Next: R9 application / presentation / runtime responsibility cleanup
```

R9では、今回固定したprobability、theme、reference toolingの境界を維持しながら、application／presentation／runtimeの責務配置を再評価する。Cloudflare Worker、HTTP API、MCPは別の将来目標として扱う。
