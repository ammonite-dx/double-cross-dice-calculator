# R28-B2: historical experiment test isolation and command cleanup

## 目的

R28-B2では、productionの回帰を保証するテストと、過去の設計判断・測定・prototypeを再現するテストを分離した。R28はreview gateごとに停止する方針であり、今回はB2までを実施してR28-Cには着手していない。

## 実装

- `r19WorkerArchitecture.test.js`、`r20ConservativeRenderingContract.test.js`、`r22NumericalPerformance.test.js`、`r23*`のUI／prototype／damage監査テスト計11件を`tests/experiments/`へ移した。
- `vitest.config.js`では`tests/experiments/**`を通常の対象から除外し、`vitest.experiments.config.js`と`npm run test:experiments`で履歴suiteを明示的に実行できるようにした。履歴suiteのimportは移動後の階層に合わせて更新した。
- 現行のbenchmark commandからR22、Phase 2-H、runtime-drという移行時の接頭辞を外し、`benchmark:numerical`、`benchmark:attack-worker`、`benchmark:attack-resource`、`benchmark:damage-roll`、`verify:damage-roll-*`という目的ベースの名前へ整理した。通常の`test`、`test:reference`、generator、audit、smoke、verify commandは維持した。
- 現行の`experiments/README.md`、R22、Phase 2-H、runtime-dr READMEとcommand contract testを新しい名前へ更新した。`docs/archive/**`の過去記録は当時の再現性を保つため変更していない。
- canonical Attackの履歴benchmarkが現在のruntime契約で実行できるよう、stale probeへincremental executionとdisplay presentationを接続し、静的D10 asset fetchを要求しない検証へ更新した。R22数値benchmarkは現行の`DamageStatistics.ts`／`ScoreStatistics.ts`の配置とcanonical full-tail plannerへ追従させた。

## テスト分離後の実行対象

| Suite | 実行対象 | R28-B2での実測 |
| --- | --- | ---: |
| 通常 | production regression | 86 files／1008 tests |
| experiments | 歴史的な測定・prototype・architecture再現 | 11 files／65 tests |
| reference | 公開assetと旧形式の照合 | 7 files／53 tests |

履歴suiteは通常のproduction regression gateに含めず、必要なときだけ`npm run test:experiments`で実行する。reference suiteはproduction契約と異なるため、従来どおり`npm run test:reference`で明示する。

## ベンチマーク検証

- `npm run benchmark:numerical:node`はNode.js 22.23.2で全fixtureを測定し、全fixtureが`measured`、結果digestが一致した。
- `npm run benchmark:numerical:browser:short`はChromeで完了し、page error、console error、結果digestの不一致はなかった。短縮測定はrepeatability判定に必要な3回を行わないため、`no-repeatable-trigger-observed`は短縮実行時の暫定値である。
- `npm run benchmark:attack-resource:short`はChrome desktopとCPU 4xの両方で11ケース、cancel、stale commit、Worker境界を検証し、`valid: true`となった。canonical経路では静的D10 asset fetchは0件である。
- `npm run benchmark:attack-worker:short`はChrome CPU 4xのレポート自体は`valid: true`となったが、この環境ではFirefox／WebKitの実行ファイル起動が`spawn EPERM`で失敗するため、cross-engine command全体の終了コードは0にならない。ブラウザの導入・権限を変更する作業はB2の範囲外とした。

これらのベンチマークは測定・監査用であり、生成した結果JSONは履歴baselineを上書きしない。実行環境で利用できないブラウザやAPIは、成功扱いにせずレポートの制約として記録する。

## 検証

- `npm test`: 86 files／1008 testsが成功した。
- `npm run test:experiments`: 11 files／65 testsが成功した。
- `npm run test:reference`: 7 files／53 testsが成功した。
- `npm run typecheck`、`npm run lint`、`npm run lint:markdown`、`npm run build`、`npm run verify:core`: 成功した。
- `git diff --check`: 成功した。

## 非対象と次の作業

R28-B2ではproductionの計算式、結果契約、UI表示、入力範囲、reference asset、generatorの生成内容は変更していない。historical experimentの実装をproductionへ戻すことも行っていない。次はR28-CのThin UI structure / naming cleanupを別レビューで確認してから開始する。
