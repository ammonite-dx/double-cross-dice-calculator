# R7 Attack feature化

この文書は、Attack画面のstate ownership、combo操作、入力イベント、feature配置を整理したR7の実装記録である。計算アルゴリズム、canonical resultの意味、latest-winsやAbortの契約、チャートとサマリーの表示は変更していない。R7開始時の基準は `c8b44f8`（R6 Shared Probability Chart Infrastructureのclosure）、比較対象のbehavior baselineは `2770c2c87000c7d878a5e1bd81698c4781d0bbce`である。

## 目的と対象

R7では、`src/views/Attack.vue`に集中していた入力state、combo操作、canonical計算の起動、表示範囲のpreflight、feedback、presentation、lifecycleをAttack featureへ移した。UI部品が親owned reactive objectを直接変更する経路をなくし、入力フォームからcontrollerへvalidated eventを渡す単方向の流れに整理した。

最終的な呼び出し関係は次の通りである。

```text
/attack router
  ↓
src/views/Attack.vue
  ↓
src/features/attack/ui/AttackPage.vue
  ↓
src/features/attack/model/useAttack.ts
  ↓
既存のapplication Attack boundary
  ├─ AttackCanonicalRunner
  ├─ AttackCanonicalState
  ├─ AttackCanonicalPresentation
  ├─ AttackCanonicalDisplayFeedback
  ├─ AttackDisplayRequestSnapshot
  ├─ AttackInputSnapshot
  └─ CalculationClient
```

`src/application`のAttack moduleとruntime共通責務はR7では移動していない。applicationとpresentationのfeature/runtime責務整理は後続R9の判断対象である。

## controllerとcombo state

`src/features/attack/model/AttackComboState.ts`が初期入力、初期combo、新規combo、複製を生成する。actionとreactionの既定値、表示名、表示フラグ、高度な設定の開閉状態は移動前と同じである。`showDetails`はactionとreactionをbooleanで保持し、UIにVueのmutable wrapperを公開しない。

各comboの内部dataは、入力paramsとcanonical result stateを分離して保持する。新規comboと複製comboでは必ず `createCanonicalComboDataState()` から空のcanonical stateを生成するため、複製元のScore、Damage、Summary、Presentation、RangePlan、ready状態をコピーしない。複製するのは入力paramsとUI stateだけであり、入力paramsもdetached snapshotとして保持する。

combo idは `useAttack` のcontrollerが `nextComboId` として所有する。初期combo idの最大値より大きい値から発行し、add、duplicate、remove後も一度発行したidをcontrollerの寿命中に再利用しない。これにより、非同期計算中の古いcomboと新しいcomboをidで混同しない。

## 入力イベントと計算の発火

`useAttack`はcomboのstate mutationと計算要求を一箇所で処理する。UIは次のイベントだけを発行し、controllerが対象comboを検索して変更を適用する。

| イベント | controllerの処理 | canonical再計算 |
| --- | --- | --- |
| `addCombo` | 既定値のcomboを追加 | 開始する |
| `duplicateCombo(id)` | 入力とUI stateだけをdetached copyして追加 | 開始する |
| `removeCombo(id)` | 対象comboを削除する | 開始する |
| `onComboNameChanged` | 名前だけを更新する | 開始しない |
| `onComboVisibilityChanged` | 表示フラグだけを更新する | 開始しない |
| `onComboDetailsChanged` | actionまたはreactionの開閉状態を更新する | 開始しない |
| `onComboSideValidated` | validated snapshotをparamsへ適用する | 開始する |
| `onDamageDisplayValidated` | Damage表示requestを更新する | 必要に応じて再利用または再計算する |
| `onScoreDisplayValidated` | Score表示requestを更新する | 必要に応じて再利用または再計算する |

`onComboSideValidated`のsideは`action`または`reaction`だけを受け付け、未知のsideや存在しないcombo idではstateを変更しない。validated snapshotを受け取ったcontrollerだけが、既存の `replaceAttackSideSnapshot` を呼び出す。フォームからapplication stateやcanonical stateを直接変更する経路はない。

入力変更の検知はdeep watchではなく、controllerの明示的なhandlerから行う。したがって、名前変更や表示の開閉だけで計算を発火せず、同一イベントから二重計算を開始しない。計算要求は従来どおり `AttackCanonicalRunner` と `CalculationClient` のlatest-wins、Abort、stale commit rejection、atomic batch commitを通過する。

## UIの単方向化

Attack固有の15 moduleを `src/features/attack/ui/` へ移動し、旧 `src/components/Attack/` directoryとcompatibility re-exportを削除した。`src/features/attack/index.ts`はrouteから利用する `AttackPage` だけを公開する。

`AttackForm`と`DefenceForm`は、既存のlocal draft、非同期validation、`LatestValidationGate`、validated event、show-details eventの境界を維持する。`ComboForm`はparams、combo color、showDetailsをpropsとして受け取り、side-validatedとshow-detailsをemitするだけである。`InputForm`と`InputPanel`はcomboの生成、複製、削除、paramsの差し替えを行わず、controller向けイベントを転送する。

UIからは `props.xxx.yyy = ...`、`push`、`splice`、`v-model="combo.name"`、`replaceAttackSideSnapshot` の直接呼び出しを撤去した。名前は `:model-value` と更新イベントで扱い、表示フラグと詳細表示もcontrollerへイベントとして返す。UIに公開するcomboはid、name、show、showDetails、paramsだけを含み、canonical resultや内部ready状態を含む広い `attackData` propは使用しない。

## Page、chart、summaryの境界

`src/views/Attack.vue`は `AttackPage` を配置するだけの薄いroute adapterになった。CalculationClientのinject、controllerの生成、入力・表示イベントの接続、InputPanel、RangePlanNotice、ScoreChartPanel、DamageChartPanel、SummaryPanelのcompositionは `src/features/attack/ui/AttackPage.vue` が担当する。

`AttackPage`が受け取ったCalculationClientは `useAttack({ calculationClient })` へ渡され、feature modelはdefault singletonを直接importしない。controllerは初期canonical計算を開始し、unmount時にrunnerをdisposeしてcanonical stateをclearする。runner、snapshot、display planner、feedbackの実装は既存application boundaryをそのまま利用する。

ScoreとDamageのchartは、必要な表示結果を `presentation` から受け取り、comboのid、名前、順序だけを `combos` から参照する。chart自身はdisplay requestを受け取らず、PanelがSettingFormへ表示requestを渡す。SummaryPanelとSummaryTableも `combos`、canonical presentation、Score presentationを別々に受け取り、combo名、達成値期待値、命中率、ダメージ期待値、合計ダメージ期待値の既存表示契約を維持する。

R6で導入したshared `ProbabilityLineChart`、0.1%表示丸め、Score／Damageの軸名、comboの色と順序、合計dataset、responsive styleは変更していない。Backtrackのchart、Check feature、CalculationClient、AttackCanonicalRunner、RangePlanner、ResourceGuard、計算core、公開asset、generator、API、MCPもR7の対象外である。

## テストと依存境界

`tests/attackFeatureController.test.js`は、初期state、monotonic id、add／duplicate／remove、detached input、validated snapshot、名前・表示・詳細変更時の無計算、未知id／sideの無変更、latest coordinator、disposeを固定する。`tests/attackFeatureArchitecture.test.js`は、feature tree、薄いroute、CalculationClient注入、旧directory不在、広い `attackData` prop不在、UIのnested mutation不在、event contract、modelのdefault singleton／UI逆依存不在、明示的なTypeScript escape hatch不在を検査する。

既存のAttack canonical contract、snapshot、display request、chart adapter、summary、shared chart、shared validationのテストは新しいfeature pathへ移行した。これにより、構造変更を行っても計算結果と表示の回帰テストは従来の独立した境界で継続する。

## 実装コミット

| Commit | 内容 |
| --- | --- |
| `51c5c47` | AttackComboState、useAttack、AttackPageを追加し、route viewからcontrollerとcanonical orchestrationを抽出 |
| `32e2118` | Attack UIをfeature directoryへ移動し、props mutationと広いattackData contractを撤去して単方向イベントへ移行 |

## 最終検証

R7実装後、production sourceとfeature構造に対するfull project gateを実行した。docs-only closure前の実装HEADで、次の結果を得ている。

| Gate | 実測結果 |
| --- | --- |
| Node | 22.23.2、`check:node` GREEN |
| Vitest | 69 files / 848 tests、GREEN |
| data | 32 assets verified、GREEN |
| generator | 18 passed / 13 deselected、GREEN |
| simulation | 13 passed / 18 deselected、GREEN |
| Ruff | GREEN |
| typecheck | GREEN |
| ESLint | GREEN |
| Markdown lint | 31 files / 0 issues |
| runtime DX verification | 20,000 cases、status passed、full enumeration `30633.9835 ms`、max difference `0.0000010000000000287557`、tolerance `0.000001000001`、max total error `1.5543122344752192e-15`、non-finite 0、negative 0 |
| build | GREEN |
| production browser smoke | GREEN |
| asset requests | precomputed request 0、D10 request 0 |
| browser diagnostics | console warning/error 0、pageerror 0、same-origin HTTP error 0、same-origin request failure 0 |
| diff check | `git diff --check` GREEN |

production browser smokeでは、Checkの100D、Attackの防御0／1／100D、Backtrackの100DとEロイス入力を含む既存受入を再確認し、各routeのcanvas、計算結果commit、resource rejectionからの復帰、同一originの通信、browser diagnosticsを確認した。作業中に起動したproduction previewの待受portは検証後に解放している。

R7の実装、構造テスト、full project gate、production browser acceptanceはすべてGREENである。R7は `CLOSED / GREEN` と判定する。次の候補は `src/data/` のprobability math、theme、reference data責務を分離するR8であり、applicationとpresentationのfeature/runtime境界整理はR9で扱う。
