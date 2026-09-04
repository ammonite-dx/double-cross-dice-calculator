# R10 runtime validation simplification

R10は、trusted internal ordinary JavaScript objectsを受け取る内部境界について、過剰なreflection、prototype traversal、descriptor、accessor防御を簡素化するリファクタリングである。確率と数値の不変条件、範囲とリソースの制限、Worker境界、Abort処理、公開入力境界は維持し、R11とR12は別フェーズとして扱う。

## 基準点と実装記録

R10の開始HEADは`0264c1271047f9d0e90efe0b4a282d14e7c529f5`である。R0 behavior baselineは`2770c2c87000c7d878a5e1bd81698c4781d0bbce`である。R10の実装コミットは`ce743f07f7e656b79b5569a3d506726caae20bf0`と`89170d090068c29c4982a8aaccf0dd5dc18cfe1a`であり、Final Closure Follow-upのテスト契約縮小は`e4e53568856c65c27b31ad76b3cc7f25b988f6e9`で行った。Follow-upの開始HEADは`daec99b8da949e0258d7e4a3e61d7e562e654d1c`であり、productionの`src/**`は変更していない。

reflection簡素化の対象は次の4ファイルであり、Abortチェックの重複整理だけを`CalculationClient`にも適用した。

- `src/runtime/CanonicalAttackBatchInput.js`
- `src/features/attack/model/AttackDisplayRequestSnapshot.js`
- `src/features/check/model/CheckDisplayRequestSnapshot.js`
- `src/runtime/CheckRangePolicy.js`

## 責務マトリクス

| 責務 | Before | After |
| --- | --- | --- |
| ordinary objectの読み取り | descriptor取得、prototype chain走査、`Reflect.ownKeys`、`Object.defineProperty`による防御的検査 | own-property確認と直接読み取り、`Object.entries`はown enumerable string propertyのcloneに限定 |
| Attack batch snapshot | genericなdescriptor-based snapshotとaccessor／Proxy向けの安全変換 | scoreの5フィールド、Attack damageの明示フィールド、damage追加propertyのsnapshot、optionsの再帰cloneを明示化 |
| Display request snapshot | plain-record／prototype／descriptor検査とaccessor拒否 | own fieldを直接読み取り、safe integer、順序、point count、pmf／upper-tailを検証 |
| Check range policy | plain-record／prototype／descriptor検査とhostile accessor／reflection変換 | nested policyを通常オブジェクトと配列としてcloneし、semantic validation後にdeep freeze |
| Attack Abort境界 | score前に連続した同一`throwIfAborted`呼び出し | score前の1回とasync damage後の確認を維持 |

## 除去した検証と維持した境界

4対象モジュールから`Object.getOwnPropertyDescriptor`、`Object.getPrototypeOf`、`Reflect.ownKeys`、`Object.defineProperty`を除去した。descriptor／prototype traversal、accessor rejection、reflection failureを専用のtyped errorへ変換する防御も対象外とした。accessor／getter、custom prototype、symbols、Proxy（revokedを含む）、reflection failureの挙動はtrusted internal ordinary object契約の範囲外であり、受入・拒否・読み取り回数を保証しない。

Canonical batchの`invalid-entries`、`invalid-entry`、`invalid-id`、`duplicate-id`、`invalid-params`、`invalid-options`と`CalculationBatchInputError`、entriesのsparse／hole検証、idの`0`と`-0`の同一扱い、nested params snapshotを維持した。runtime optionsのprimitive値、function identity、`signal`、`onRangePlan`、`onFftLength`のidentity、再帰cloneとcycle対応も維持した。

safe integerとpoint count、確率分布と数値不変条件、display modeとmin／maxの順序、calculationMaxとdisplay defaults／maxPoints、maxValuesLength／maxFftLength／maxResourceBytes／maxComponents、負値拒否、resource planning、Worker protocol、Abortとlease release、公開入力のtyped validation boundaryは変更していない。

## 対象外と保護領域

UI、shared validation、計算hard boundary、public asset、Python generator、tooling/reference dataはR10の対象外である。R11の命名整理とR12のcore分割も別フェーズであり、R10では着手していない。

保護領域`src/calculation/DistributionResult.js`、`src/calculation/CanonicalDamageAggregation.js`、`src/calculation/RuntimeDamageRollCalculator.js`、`src/calculation/RuntimeDamageRollLimits.js`、`src/runtime/RuntimeDamageRollClient.js`、`src/runtime/RuntimeDamageRollWorker.js`、`src/runtime/ResourceGuard.js`、`src/shared/validation/**`、`public/**`、`generator/**`、`tooling/reference-data/**`への変更はない。

## 追加テストと実測ゲート

`tests/runtimeValidationResponsibilities.test.js`を追加し、4対象モジュールのforbidden reflection patternが0件であること、通常のplain objectによるpolicy snapshot／freezeの責務を検査した。既存のCanonical Attack batch、Attack display、Check displayテストから、accessor／custom prototype／revoked Proxyの挙動を保証する肯定テストを削除し、exotic objectの挙動を未規定として整理した。

以下はR10完了時に実測したゲート結果である。

| Gate | 実測結果 |
| --- | --- |
| `npm run check:node` | 成功 |
| `npm run data:check` | 32 assets |
| `npm run data:verify-generator` | 32 assets |
| `npm test` | 73 files / 863 tests passed |
| `npm run generator:test` | 18 passed / 13 deselected |
| `npm run generator:test:simulation` | 13 passed |
| `npm run generator:lint` | 成功 |
| `npm run typecheck` | 成功 |
| `npm run verify:runtime-dx` | 20,000 cases; max abs diff `0.0000010000000000287557`, tolerance `0.000001000001`, max total error `1.5543122344752192e-15`, non-finite `0`, negative `0` |
| `npm run lint` | 成功 |
| `npm run lint:markdown` | 35 files / 0 issues |
| `npm run build` | 408 modules transformed |
| `npm run smoke:production` | PASS; Check 1 canvas、Attack 2 canvas、Backtrack 3 canvas、schema-v2/D10 requests `0`、same-origin HTTP errors／console warnings・errors／page errors／same-origin request failures `0` |
| `git diff --check` | 成功 |

保護領域の差分は0件であり、4対象モジュールのforbidden reflection patternは0件、positive-contract auditも0件である。P0、P1、P2はすべて0件である。R10の判定は`CLOSED / GREEN`とする。今後のR11命名整理とR12 core分割は、R10完了後の別フェーズで計画・実施する。
