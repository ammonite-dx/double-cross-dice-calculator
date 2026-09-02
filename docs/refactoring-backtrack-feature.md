# Backtrack feature化

この文書は、Backtrack画面をfeature-firstの構成へ移したR3の実装記録である。計算アルゴリズム、入力値の意味、確率の丸め、グラフのカテゴリ境界は変更せず、責務の所在と依存方向だけを整理した。開始時点は `85e1ab6`（2026-09-02、R2後のcanonical-default-migration）であり、R0のbehavior baseline `2770c2c87000c7d878a5e1bd81698c4781d0bbce`との比較基準も維持する。

## 目標

Backtrackのroute viewを、画面の組み立てだけを担当する薄いentry pointにする。入力の初期値、validated snapshot、非同期計算、latest-wins、abort、feedback、unmount時のdisposeはroute-scoped composableへ集約し、計算結果をChartSetter向けの表示データへ変換する処理とUI部品を同じfeatureの中に置く。

最終的な呼び出し関係は次の通りである。

```text
/backtrack router
  ↓
src/views/Backtrack.vue
  ↓
src/features/backtrack/ui/BacktrackPage.vue
  ├─→ src/features/backtrack/ui/InputPanel.vue
  ├─→ src/features/backtrack/ui/FinalEncroachmentChartPanel.vue
  └─→ src/features/backtrack/model/useBacktrack.ts
          ├─→ BacktrackInputSnapshot
          ├─→ BacktrackCalculationRunner
          └─→ CalculationClient
```

`useBacktrack`は計算clientを引数で受け取る。featureはグローバルなclient実装へ固定されず、アプリケーションbootstrapから注入されたclientとテスト用stubを同じ契約で利用できる。Composableの公開値は `params`、`finalEncroachment`、`resultReady`、`rangeFeedback`、`onValidated`だけであり、runnerとclientはUIへ公開しない。

## ファイル移動

| 旧パス | R3後のパス | 責務 |
| --- | --- | --- |
| `src/application/BacktrackInputSnapshot.ts` | `src/features/backtrack/model/BacktrackInputSnapshot.ts` | validated form inputのdetached snapshot |
| `src/application/BacktrackCalculationRunner.js` | `src/features/backtrack/model/BacktrackCalculationRunner.js` | Backtrack request laneとcanonical presentationの接続 |
| `src/presentation/BacktrackCanonicalPresentation.js` | `src/features/backtrack/model/BacktrackCanonicalPresentation.js` | finite canonical resultから既存chart payloadへの変換 |
| `src/components/Backtrack/BacktrackForm.vue` | `src/features/backtrack/ui/BacktrackForm.vue` | 非同期validation付き入力フォーム |
| `src/components/Backtrack/InputForm.vue` | `src/features/backtrack/ui/InputForm.vue` | フォームのvalidated event中継 |
| `src/components/Backtrack/InputPanel.vue` | `src/features/backtrack/ui/InputPanel.vue` | 入力カードとrange feedbackの表示 |
| `src/components/Backtrack/FinalEncroachmentChart.vue` | `src/features/backtrack/ui/FinalEncroachmentChart.vue` | 1つのdoughnut chart描画 |
| `src/components/Backtrack/FinalEncroachmentChartPanel.vue` | `src/features/backtrack/ui/FinalEncroachmentChartPanel.vue` | 3種類のバックトラック結果の配置 |
| `src/components/Backtrack/ChartSetter.js` | `src/features/backtrack/ui/ChartSetter.js` | Chart.js用データ・option・style生成 |

旧パスのcompatibility re-exportは追加していない。 `src/presentation/index.js`からBacktrack専用symbolも削除し、production codeとtestの参照をfeature pathへ更新した。 `src/features/backtrack/index.ts`はfeatureのUI entry pointである `BacktrackPage`だけを公開し、model内部のsymbolを外部へ再公開しない。

## UIとmodelの境界

`InputPanel`は旧来の複合 `backtrackData`を受け取らず、`params`と`rangeFeedback`を別々に受け取る。`InputForm`と`BacktrackForm`は `params`だけを受け取り、フォームのlocal draftを変更し、検証成功時に `validated` eventを発行する。親stateを直接変更する代入は行わない。`FinalEncroachmentChartPanel`は `dlois`と `finalEncroachment`だけを受け取り、計算状態やfeedbackを知らない。feature UI内に `backtrackData`という複合stateは残していない。

`Backtrack.vue`にはBacktrackPageのimportとtemplateだけを置いた。CalculationClientのinject、reactive state、snapshot生成、runner実行、lifecycle hook、エラー処理はすべてBacktrackPageまたは `useBacktrack`へ移した。routerの `/backtrack`エントリは変更していない。

## 計算契約の維持

`BacktrackCalculationRunner`は既存の `CalculationClient.calculateBacktrackCanonical`だけを呼び出す。legacy APIへのfallbackは行わず、canonical error、range rejection、ResourceGuard rejection、abort、stale result、dispose後の遅延commitでは旧チャートを表示しない。計算が成功したときだけ `createBacktrackCanonicalPresentation`がcanonical resultを検証し、 `finalEncroachment`をstateへcommitする。

`BacktrackCanonicalPresentation`の数値処理は移動前と同じである。singleは標準の `100/71/51/31`、悪夢の `120/100/71/51/31`を境界とし、doubleとsecondは標準の `100`、悪夢の `120`を失敗境界とする。確率はカテゴリへ合計してから `Math.round(probability * 1000) / 10`で0.1%単位へ丸める。canonical resultは3キー、finite support、明示supportの末尾一致、 `overflow: null`を引き続き要求する。

## 依存境界の強制

`eslint.config.js`のUI制限対象へ `src/features/*/ui/**/*.{js,ts,vue}`を追加した。feature UIからcalculation primitive、 `Distribution`、`FFT`、reference repository、published-data schemaを直接importすることはできない。計算はCalculationClient境界を通る。

feature model向けには、views、components、router、plugins、layoutsへの逆依存と、feature UIへの依存を禁止した。reference repositoryとpublished-data schemaも禁止している。一方、modelからapplicationのCalculationClient境界、CalculationFeedback、domain、calculation、同一featureのmodelを利用することは、現行runtime/application層を段階的に整理するまで許可する。この規則は相対importと `@/` aliasの両方を検査する。

`tests/backtrackFeatureArchitecture.test.js`は、薄いroute view、BacktrackPageからuseBacktrackへの接続、旧ファイルパスの撤去、狭いUI props、router entry pointを検査する。依存方向そのものは `npm run lint`を正規gateとする。

## 実装コミット

| Commit | 内容 |
| --- | --- |
| `771398f` | Backtrackのsnapshot、runner、canonical presentationをfeature modelへ移動し、presentation barrelとテスト参照を更新 |
| `3cf8329` | Backtrack UIをfeature uiへ移動し、propsを分離し、 `useBacktrack`と薄いroute viewを導入 |
| `e4f4e4b` | feature UI/modelの依存境界とアーキテクチャテストを追加 |

## 検証

実装時点で次の検証に成功している。

- `npm run typecheck`
- `npm run lint`
- `npm test -- tests/backtrackFeatureArchitecture.test.js tests/backtrackCanonical.test.js tests/backtrackCanonicalClient.test.js tests/backtrackCanonicalIntegration.test.js tests/backtrackCanonicalPresentation.test.js tests/backtrackInputSnapshot.test.js tests/backtrackRouter.test.js`（7 files / 65 tests）
- `npm run build`
- `git diff --check`

全体回帰、generator検証、runtime-dx検証、production browser smokeは、R3の全変更を含む状態で最終gateとして再実行する。ブラウザでのBacktrack手動受入では、既存の表示カテゴリ、Dロイス「不死者・悪夢」、入力変更時の再計算、計算中のrange feedbackを確認し、開発サーバーやテストプロセスを残さない。

## 既知の境界と後続課題

R3ではCalculationClientやcoreを `runtime/`や `core/`へ再配置していない。applicationとcoreの境界はR2のまま維持し、Backtrack固有の責務だけを先にfeatureへ移した。ChartSetterの他featureとの共通化、generic presentationのshared化、旧legacy core・asset・generatorの整理は、canonical migrationの後続phaseでsymbol単位に判断する。
