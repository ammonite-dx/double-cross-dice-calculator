# R5 Shared Input Validation

この文書は、CheckとAttackに重複していた入力validationをshared layerへ集約したR5の実装記録である。フォームの見た目、featureごとのstate ownership、計算アルゴリズム、canonical result、resource policyは変更していない。R5開始時の実装ツリーは `d2bd372`、比較対象のbehavior baselineは `2770c2c87000c7d878a5e1bd81698c4781d0bbce`である。R5本体の実装最終コミットは `df7ffdc`で、closure follow-upの実装最終コミットは `0d31e4f`である。

## 目的と設計判断

R5では、UIを一つの大きな共有componentへ統合せず、意味論だけを共有した。CheckのScoreForm、AttackのAttackForm、AttackのDefenceFormは表示条件とレイアウトが異なるため、フォームのlocal draft、表示条件、イベント形状は各featureに残している。共有した責務は、Score入力の単項規則、表示範囲のmin/max規則、非同期validationのlatest-wins gateである。

数値domainの正本は `src/domain/InputDomain.ts` とし、shared layerでcriticalや安全な整数のauthoritative constantを再定義していない。`yousei > 0` と `shihai > 0` の同時指定は、ゲームルールそのものの禁止ではなく、現在のアプリが適用順序を表現していないためのsupported-feature constraintとして、フォームの既存表示位置を保ったまま検証する。

表示範囲は非負のsafe integerかつ `min <= max` とし、`min === max` と `0..20000`をvalidation上受け付ける。固定999、1023、1200などのUI上限は追加していない。大きな範囲の計算可否は、入力validationではなく `DisplayRangePlanner` と `ResourceGuard` が判定する。

## Shared modules

共有モジュールは `src/shared/validation` に置き、Vue、Vuetify、DOM、CalculationClient、feature、calculation、data layer、Node組み込みモジュールへ依存しない。barrel exportは作らず、consumerが必要なmoduleを直接importする。

| Module | 責務 |
| --- | --- |
| `IntegerRules.ts` | required、safe integer、minimum、maximumのVuetify互換rule factory |
| `ScoreInputRules.ts` | dice、critical、skill、yousei、shihaiの単項ruleと、yousei/shihai互換性rule |
| `DisplayRangeRules.ts` | 表示範囲min/maxの相互参照rule。固定上限を持たない |
| `LatestValidationGate.ts` | `begin`、`invalidate`、`canCommit`、`dispose`による非同期結果の世代管理 |

rule factoryはメッセージを暗黙に生成せず、consumerが必要ならfieldごとの文言を指定できる。既存フォームは従来の日本語メッセージとイベント形状を維持している。

## Consumer migration

CheckのScoreForm、DfcltyForm、SettingForm、AttackのAttackForm、DefenceForm、ScoreSettingForm、DamageSettingFormをshared `LatestValidationGate`へ移行した。props同期時と高度設定OFF時にはpending validationをinvalidateし、unmount時にはdisposeする。これにより、古いasync validationが最新のvalidated snapshotを上書きすることを防ぐ。

Scoreのbase rulesはCheckとAttackで `createScoreFieldRules` を共有し、`yousei`／`shihai`のcross-field ruleはconsumerが必要なfieldへ個別に追加する。DefenceFormの既存の表示位置や、《イベイジョン》などのmode固有normalizationは変更していない。攻撃力、ガード、装甲・軽減値などのAttack固有ruleもlocalに残している。

表示設定3フォームは `createDisplayRangeRules` を使う。mode label、mode enum、snapshot生成、resource rejectionはfeature/application側の責務として維持し、共有ruleがsnapshotやplannerの代替にならないようにした。

## 構造テストと回帰テスト

`tests/sharedValidationRules.test.js`で、required、unsafe integer、負のskill、critical 2／11、critical 1／12、dice 0、yousei／shihaiの同時指定、safe integer上限、single-point range、`0..20000`を固定している。`tests/latestValidationGate.test.js`では、古いticketのcommit拒否、invalidate、dispose後のcommit拒否を確認する。

`tests/sharedValidationArchitecture.test.js`は、4つのdirect-import module、shared layerのVue／UI／calculation／data／Node非依存、`InputDomain` predicate利用、coreからsharedへの逆依存禁止を検査する。さらに、3つのScore consumerにraw rule定義が残っていないこと、3つのdisplay formに旧`isSafeCoordinate`・hand-written generationが残っていないこと、`AttackInputSnapshot.js`から旧gate exportが消えていることを固定している。

既存のCheck／Attack snapshotテストは、validated event、alias-free snapshot、mode normalization、表示request境界を維持したままshared importを検証する。production browser smokeには、Checkのcritical 2／11とinvalid critical、負のskill、《妖精の手》単独と《支配の領域》同時指定の拒否、高度設定OFF時のzeroing、Attackのcritical 2・負のskill・《妖精の手》、既存の対決・表示モード・99D・resource rejection／recoveryを含めている。

## 実装コミット

| Commit | 内容 |
| --- | --- |
| `fa2cada` | shared validation modules、依存境界、rule unit testを追加 |
| `ba96f72` | async latest-validation gateをsharedへ移動し全フォームを移行 |
| `abcf2d9` | Check／AttackのScore入力規則をshared factoryへ移行 |
| `567199b` | Check／Attackの表示範囲規則をshared factoryへ移行 |
| `c6b1d70` | 重複・逆依存・旧gateを検査する構造テストを追加 |
| `df7ffdc` | shared validationのproduction browser acceptanceを拡張 |
| `8e60602` | shared validationから`data/**`と`node:*`への依存を禁止 |
| `0d31e4f` | `IntegerRules`のsafe-integer predicateを`InputDomain`へ統一 |

`df7ffdc`まではR5本体の実装であり、`8e60602`と`0d31e4f`でレビュー追補を完了した。この文書の更新は別のdocs-only commitとして追跡する。

## 最終検証

R5実装ツリーでレビュー指定のproject gateを再実行した。過去の件数をコピーせず、今回の実測値を記録している。

| Gate | 実測結果 |
| --- | --- |
| Node | 22.23.2、`check:node` GREEN |
| Vitest | 65 files / 826 tests、GREEN |
| data | `data:check`／`data:verify-generator` 各32 assets、GREEN |
| generator | 18 passed / 13 deselected、GREEN |
| simulation | 13 passed / 18 deselected、GREEN |
| Ruff | GREEN |
| typecheck | GREEN |
| runtime DX verification | 20,000 cases、status passed、full enumeration `31134.1226 ms`、max difference `0.0000010000000000287557`、tolerance `0.000001000001`、max total error `1.5543122344752192e-15`、non-finite 0、negative 0 |
| ESLint | GREEN |
| Markdown lint | 30 files / 0 issues |
| build | GREEN |
| production browser smoke | GREEN |
| asset requests | schema-v2/revision-1 precomputed request 0、D10 request 0 |
| browser diagnostics | console warning/error 0、pageerror 0、same-origin HTTP error 0、same-origin request failure 0 |
| diff check | `git diff --check` GREEN |

production browser smokeは、Checkの初期計算、対決ON／OFF、PMF／upper-tail、`99D/critical=2`、`0..20000`拒否、`0..100`復帰、Attackの100D境界、Backtrackの100D境界を実行した。validation固有の追加ケースを含め、すべてprecomputed request 0、D10 request 0、browser warning/error 0で完了した。resource rejection中は表示canvasを消去し、有効範囲へ戻すと表示を復旧する。

## R5 closure follow-up

R5レビューで確認された残件は、shared validationの依存境界とsafe-integer predicateの二点だった。productionの入力意味論やフォームの表示は変更せず、architecture gateと正本参照だけを補強した。

FU1では、`src/shared/validation`から許可する内部依存を`src/domain/**`と同じshared layerに限定した。`data/**`、`calculation/**`、`application/**`、`features/**`、UI／presentation／router／plugins／layouts、`node:*`はESLintと構造テストで禁止し、`src/calculation/**`と`src/domain/**`からsharedへの逆依存禁止も維持している。実装は `8e60602`である。

FU2では、`IntegerRules.ts`の局所的な`Number.isSafeInteger`判定を削除し、`InputDomain.isSafeInteger`をimportして利用するようにした。required、safe integer、min/maxのrule順序とメッセージ、負のskillやsafe integer上限の契約は変更していない。実装と正本参照の回帰検査は `0d31e4f`である。

shared validationの依存契約は、`domain/**`と同じshared layerだけを許可し、`data/**`、`calculation/**`、`application/**`、`features/**`、UI、presentation、router／plugins／layouts、`node:*`を禁止する。safe-integer判定の正本は `InputDomain.isSafeInteger`であり、`IntegerRules`を含むshared validationはこれを再利用する。

FU1／FU2後のfull project gateはすべてGREENで、R5はP0・P1・P2を各0件として `CLOSED / GREEN` と判定する。

## 非対象と後続

R5ではAttack featureization、Chart.js共通化、CalculationClient、RangePlanner、DisplayRangePlanner、ResourceGuard、計算core、表示の0.1%契約、public schema-v2 assets、Pinia、API、MCPを変更していない。フォームのlayoutとfeature state ownershipも維持している。UI componentのさらなる共通化は、Attack featureization後に重複が有意かを確認してから判断する。

R5の実装、構造テスト、full gate、production browser acceptanceはすべてGREENである。P0、P1、P2はいずれも0件とし、R5は `CLOSED / GREEN` と判定する。次の候補は、ロードマップに従ったChart.js共通化（R6）またはAttack featureization（R7）の設計検討であり、着手順は別途判断する。
