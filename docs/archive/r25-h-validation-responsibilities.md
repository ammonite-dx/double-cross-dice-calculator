# R25-H Validation Responsibility Cleanup

## 目的

R25-Hでは、入力値の検証を一つの層へ集約するのではなく、入力が通過する境界ごとに責務を整理した。UIからの入力、公開runtime API、範囲計画、計算器、Web Workerはそれぞれ異なる信頼境界を持つため、上流で検証済みであっても下流の検証を削除しない。

```text
raw UI input
  -> UI validation
  -> CalculationClientの公開境界
  -> RangePlannerの直接呼出し境界
  -> Calculatorの数値・結果境界

Worker message
  -> Worker wire protocol
  -> Calculatorの数値・結果境界
```

今回の変更は、計算結果、既存の日本語エラーメッセージ、UIの表示条件、ResourceGuard、Workerの応答形式を変更しない。目的は、同じルールを各所で別々に書くことを減らし、どの層が何を保証するかをコードから追えるようにすることである。

## ドメイン正規化

### 正本

`src/domain/InputDomain.ts`は、値を安全に表現できるかを判定する正本である。`isSafeInteger`、`isNonNegativeSafeInteger`、クリティカル値の`2..11`、残存ロイス数の`0..7`をここで定義する。これらは旧JSONの配列長や表示上限ではなく、入力値の意味とJavaScriptの安全な整数表現に関する規則である。

`isSupportedScoreFeatureCombination`は、《妖精の手》と《支配の領域》の組合せが現行計算器で扱えるかを返すpredicateである。これは値の型・範囲を検証するthrowing assertionとは別の責務であり、UIやResourcePlanが`incompatible-input`を表示するために使う。両方の値が正でも、値を正規化する段階で例外にしてしまわず、計画の拒否理由として伝える必要があるためである。

### `CalculationInputNormalization`

`src/domain/CalculationInputNormalization.ts`は、公開入力を計算器が受け取る明示的な形へ変換する。スキーマライブラリは導入せず、入力の各フィールドを小さな関数で検証して既定値を補う。

| 関数 | 正規化する値 |
| --- | --- |
| `normalizeScoreInput` | ダイス数、クリティカル値、技能値、《妖精の手》回数、《支配の領域》対象数 |
| `normalizeDifficultyInput` | `opposed`の真偽値と非負の目標値 |
| `normalizeAttackDamageInput` | 攻撃力のダイス数、固定値、`kazanari` |
| `normalizeDefenceDamageInput` | 防御側のダイス数と固定値 |
| `normalizeReactionInput` | ドッジ、イベイジョン、ガード・リアクション放棄のモード別入力 |
| `normalizeBacktrackParams` | 侵蝕率、ロイス数、Eロイス、追加ダイス、固定値、Dロイス名 |

Scoreのprimitiveな値は`normalizeScoreInput`で検証するが、`yousei > 0`と`shihai > 0`の同時指定はここでは拒否しない。組合せの対応可否は`isSupportedScoreFeatureCombination`とResourcePlanが扱うため、正常な値の入力不整合を`CalculationRangeError`として返せる。

《イベイジョン》のUI入力は「ダイス数」と「技能値」であり、計算座標ではダイスを振らない固定値へ変換する。変換後の技能値は`2 * dice + skill`であり、安全な整数範囲を超える場合は変換時点で拒否する。すでに`dice=0`、`critical=10`、特殊効果なしの計算座標へ変換された入力は、そのまま再正規化できる。これにより、UI snapshotとCalculationClientの二重の正規化が同じ結果になる。

## 各境界の責務

### UI validation

`src/shared/validation/ScoreInputRules.ts`、`DisplayRangeRules.ts`、`IntegerRules.ts`はVuetifyのruleとしてユーザーへ入力ミスを知らせる。攻撃・防御のダメージ、Checkの難易度、Backtrack各フィールドのsafe integer検証も`createSafeIntegerRules`を使い、フィールドごとのメッセージとエラー表示位置はfeatureが所有する。共有層は値の意味だけを共有する。

Scoreの互換性ruleは`isSupportedScoreFeatureCombination`を呼び出すが、UI validationを計算の唯一の防御にはしない。フォームを経由しない呼出し、将来の別UI、テスト用の直接呼出しは、次の境界で改めて検証される。

Backtrackの残存ロイス上限は`INPUT_DOMAIN.remainingLois.max`を参照する。フォームの`max`属性、rule、初期値が同じ正本を見るため、数値の直書きが複数箇所に残らない。一方、Dロイスの選択肢や入力欄の文言はBacktrack feature固有の責務として残す。

表示範囲は`isDisplayCoordinate`、`getDisplayRangePointCount`、`isDisplayMode`を共有する。CheckとAttackはこれらを使いながら、それぞれのエラーコードとsnapshotのfreeze契約を維持する。表示入力の妥当性と、実際に計算・描画できるかを判定する`DisplayRangePlanner`のresource制限は別である。

### `CalculationClient`の公開境界

`src/runtime/CalculationClient.js`は、UI以外からも呼ばれる公開runtime APIである。Check、Attack、Backtrackの入力を開始時にsnapshotして正規化し、同じ正規化済み値をRangePlannerとCalculatorへ渡す。difficultyの`opposed`もここでstrict booleanとして検証する。difficulty自体または`opposed`・`target`が省略された場合は、旧CalculationClientと同じく`opposed: false`・`target: 0`を補完する。明示された値の型と範囲は検証する。入力をコピーすることで、呼出し元が計算中に元オブジェクトを変更しても、計画・計算・cacheのキーが変わらない。

組合せ非対応のScoreは、primitiveな正規化エラーではなく、既存の`CalculationRangeError`と`incompatible-input`の計画結果へ接続する。したがって、UIのメッセージを保ったまま、計算前にResourceGuardや数値計算を開始しない。

### `RangePlanner`の直接境界

`ScoreRangePlanner`、`DamageRangePlanner`、`BacktrackRangePlanner`は、CalculationClientを通らない直接呼出しも受け付ける。各plannerの薄いnormalize wrapperは、ドメイン正規化を呼び出してから作業範囲、FFT長、CPUワーク、メモリ、support、warning／rejectを計画する。plannerは入力値の検証だけでなく、計算に必要な資源がpolicy内に収まるかを判定するため、UIやclientの検証を代替しない。

### Calculatorの数値境界

`src/calculation`のCalculatorは、RangePlannerを迂回した呼出しに対しても入力型、範囲、配列長、確率、総和、support、数値誤差を検証する。これは重複ではなく、数値カーネルが壊れた入力を進めないためのdefense-in-depthである。BacktrackCalculatorもdomainの`normalizeBacktrackParams`を使って入力ルールを共有し、plan integrity、working length、生成量、supportの検証は計算器固有の責務として残す。上流で整形されたplain objectを受け取る場合も、Calculatorの不変条件を削除しない。

### Worker wire boundary

`src/runtime/RuntimeDamageRollProtocol.ts`の`normalizeRuntimeDamageRollWorkerRequest`は、Worker messageがnull、配列、primitiveではないことと、`id`が非負のsafe integerであることだけを検証する。戻り値はwire検証済みの`RuntimeDamageRollWorkerEnvelope`であり、`weights`、`kazanari`、`options`は`unknown`のまま数値カーネルへ渡す。これらの意味と計算量は、`generateMixedDamageDistribution`とruntime limitの正本へ委ねる。Worker protocolが数値ルールを複製しないため、plannerとCalculatorの上限がずれない。

Workerは、validな`id`を持つ入力のpayloadが不正なら`{ id, error }`を返す。このエラーはそのジョブだけを失敗させ、常駐Workerと後続ジョブを維持する。`id`自体が欠落・不正なメッセージは応答先を特定できないため、応答を捏造せずWorker-levelのprotocol failureとして扱う。既存のRuntimeDamageRollClientが持つWorker再生成、queue、cache、Abort、late eventの契約は変更しない。

## なぜ複数層で同じ検証を行うのか

同じ条件を複数の層で確認することは、同じ実装を無目的に複製することとは異なる。各層は異なる入力形式と失敗時の責務を持つ。

| 層 | 主な目的 | 失敗の扱い |
| --- | --- | --- |
| UI | 即時の入力フィードバック | フィールドへ日本語メッセージを表示 |
| CalculationClient | 公開APIのsnapshotと既定値 | typed errorまたは計画拒否 |
| RangePlanner | 計算範囲と資源の事前判定 | warning／`CalculationRangeError` |
| Calculator | 数値カーネルの不変条件 | 数値・入力エラーをthrow |
| Worker protocol | 応答を相関できるwire message | valid IDならジョブエラー、ID不正ならprotocol failure |

上流の検証結果を下流へ暗黙に信頼すると、将来別の呼出し経路を追加した際に検証漏れが発生する。逆に、下流がUI専用の文言やfeature stateを知ると、計算coreの再利用性が失われる。正規化関数をdomainへ置き、各境界は自分のエラー契約と資源責務だけを追加する構成がこのトレードオフを抑える。

## テストで固定した契約

- `tests/calculationInputNormalization.test.js`は、既定値、safe integer、critical 2..11、組合せpredicateから独立したScore、strict difficulty、Attack damage、Evasionのraw／canonical同値、変換overflow、Backtrack境界を検証する。
- `tests/calculationClient.test.js`と関連integration testは、client正規化後の計画・計算同値、invalid difficulty、unknown reaction mode、Evasion、Lois、互換組合せの`CalculationRangeError`を検証する。
- `tests/runtimeDamageRollProtocol.test.js`とWorker contract testは、wire messageの形、ID境界、valid IDのジョブエラー、invalid IDのprotocol failure、Worker listener継続を検証する。
- `tests/sharedValidationRules.test.js`、snapshot test、`tests/runtimeValidationResponsibilities.test.js`は、shared predicate、整数ruleの各feature利用、既存のエラーコード、freeze、featureごとのsnapshot、表示範囲のresource preflightを検証する。
- CalculatorとRangePlannerの既存テストは残し、上流の正規化追加後も計算器単独のvalidationと数値不変条件を維持する。

## 非対象と今後

R25-Hでは、計算式、確率値、表示の見た目、JSON schema、公開asset、ResourceGuardの閾値、Workerの計算方式を変更していない。検証用のlegacy／published-bucket経路を新しいproduction経路へ戻すことも行わない。

今後新しい入力経路やHTTP APIを追加する場合は、まずdomain正規化と互換性predicateを再利用し、その外側にAPI固有のserialization・認証・rate limitを置く。APIやMCPを実装する場合も、CalculationClient、RangePlanner、Calculator、Workerの下流検証を省略しない。

R25-Hの実装と文書化は、H1〜H5の順で行った。主要実装コミットは`23b08b6`、`b69f528`、`552d769`、`4411aa5`であり、follow-upとして`9354967`（互換性境界・Backtrack・Worker型）と`9b5df3f`（共有整数rule）を追加した。本ファイルとTODOの更新を最後の文書単位とする。
