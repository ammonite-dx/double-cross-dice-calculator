# R29-I: Architecture Convergence Closure

## 目的

R29-A〜Hで収束させた計算コア、runtime lifecycle、presentation trust boundary、参照互換層、TypeScript、テスト、active documentationを最終監査し、productionの責務と歴史的な参照領域が分離されていることを確認する。

## 開始点とコミット

開始HEADは`fd5be203adb99c03326a3625820ec9238ec23479`（R29-H documentation closure）。R29-Iの用語修正commitは次のとおり。

- `3efba6f` — `chore: remove stale migration terminology`
- このclosure記録を含むcommitでR29-Iを閉じる。自己参照を避けるため、そのcommit hashはここへ記載しない。

## 監査結果

| 領域 | 確認結果 |
| --- | --- |
| FFT | `Radix2FFT.ts`がin-place radix-2 FFTの唯一の実装を所有し、通常のFFTとruntime DR計算が同じprimitiveを利用する。 |
| Damage aggregation | caller-owned入力をsnapshotして準備し、immutable planと準備済みexecutionを分離する。ResourceGuardのadmission後に実行し、leaseを`finally`で解放する。opaque registry、WeakMapを使ったprepared state参照、待機後のcaller配列再読込はない。 |
| Presentation | `presentDistribution`が汎用distribution resultからUI非依存display modelへの検証・投影境界である。下流は検証済みdisplay値とprojectionを再利用する。 |
| Request lifecycle | Check、Attack、Backtrackは`CalculationRequestCoordinator`を利用する。Attackの計算recordを正本として保持し、presentationをsnapshotから再構築する。presentation失敗で有効な計算recordを失わない。 |
| 互換・参照境界 | published-bucket adapterとsparse asset expansionは参照用領域に限定され、production runtimeの計算・表示経路では使われない。既定計算へのlegacy fallbackはない。 |
| TypeScript | `src/`に`.js` sourceはなく、Vue SFCのscriptとproduction TypeScript contractが型付きsourceを検査する。 |
| テスト責務 | 通常の数値・振る舞い・lifecycle検証と、専用reference・historical experiment検証が分離されている。既存のrepo/config contract testは維持し、production implementationを文字列で模倣するテストは追加していない。 |
| 命名・文書 | productionに残っていた段階依存のR2表現、canonical/defaultを示唆する説明、published-bucketへの不要な言及を責務ベースの表現へ改めた。active documentationは現行のruntime方針と一致する。 |

`src/`で`calculationMax`、`PUBLISHED_OVERFLOW_INDEX`、`published-bucket`、`scorePropagation`、`canonicalOptIn`、1022、1023を検索し、該当は0件だった。`.js` sourceも0件である。`expandSparseDistribution`は歴史的asset repositoryからのみ利用される参照helperとして保持する。`legacyDataPattern`とretired architecture layerのESLint guardは維持した。

## 対象外

- 計算式、公開result DTO、resource policy、UI表示、Worker protocol、公開asset、generator outputの変更。
- 公開準備、ライセンス・出典の判断、性能測定に基づくresource policy再調整。
- Cloudflare Worker/API/MCP化、および教科書の《支配の領域》関連章の更新。

これらはR29-Iでは判断・実装せず、次の作業単位へ残す。

## 検証

`npm run verify:all`が成功した。結果は以下のとおり。

- Node version check、Vitest 83 files / 982 tests、typecheck、ESLint、Markdown lint 105 files / 0 issues、production build 485 modules。
- Production browser smokeでCheck、Attack、Backtrack、表示範囲の回復・拒否を確認。事前計算データrequest、console warning/error、same-origin HTTP errorは0件。
- Reference verification 32 assets、reference tests 7 files / 53 tests、generator通常18 tests、simulation 13 tests、Ruffが成功。
- Runtime DX 20,000 casesが成功。最大絶対差は`9e-7`で許容値`1.000001e-6`以内、最大total errorは`1.4432899320127035e-15`、非有限値・負値は0件。
- `npm run diff:check`が成功した。archiveとTODOを更新した後にもMarkdown lint、active documentation link test、diff checkを再実行する。

R29-IはP0/P1/P2=0で`CLOSED / GREEN`とする。
