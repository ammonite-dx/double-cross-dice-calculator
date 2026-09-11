# R23 — Vuetify form source-level prototypes

## 目的と範囲

この文書は、R23で確認した3件のフォーム表示差について、productionへ採用する前のVue/Vuetify source-level prototypeと計測結果を記録する。候補sourceは一時的にbuildへ使用するが、通常の成功・失敗を問わず元のバイト列へ復元し、productionの`src/**`へ変更を残さない。

対象は次の3件である。

| ID | 対象 | 第一候補 |
| --- | --- | --- |
| UI-04A | 「高度な設定」のcheckboxと文字列の間隔 | `v-checkbox-btn`へpublic propの`inline`を明示する |
| UI-04B | Check/Attackの表示範囲fieldの縦方向geometry | 対象3フィールドだけを`density="comfortable"`へ変更する |
| UI-06 | Backtrackの「その他減少量」compound label | app-owned labelと`role="group"`を追加し、各入力名を分ける |

この作業は見た目の採否を決めるものではない。候補のcapture成功はproduct ownerのvisual approvalを代替せず、3件とも`AWAITING PRODUCT OWNER`のままとする。

## 再現条件

対象branchは`codex/canonical-default-migration`で、source prototype開始時点は`d126cb5b94d92b49588a3608a264b104e2a7c6ca`である。ハーネスとrunnerは次のコミットで追加した。

| Commit | 内容 |
| --- | --- |
| `9df2a68` | exact replacement、バイト列復元、fail-closed条件、unit testを含むsource prototype harness |
| `c16ed1f` | 一時build、source復元後のPlaywright capture、3 variantのrunner |
| `df450b7` | UI-06のベースライン／候補フェーズを分けた比較メトリクス修正 |

Nodeの既存buildを前提に、repository rootで次のコマンドを実行する。

```powershell
npm run review:r23:source-prototype -- --variant=advanced-setting-inline-source
npm run review:r23:source-prototype -- --variant=setting-form-comfortable-source
npm run review:r23:source-prototype -- --variant=backtrack-compound-label-source
```

`--scenarios=id,id`で対象scenarioを絞れる。runnerはbaseline build/captureを行った後、候補sourceをexact replacementで一時適用してbuildし、candidate `dist/`をcaptureする前にsourceを復元する。画像とJSONは`experiments/r23-ui-review/output/source-prototypes/<variant>/`へ保存される。このディレクトリはgitignoredである。

## ハーネスの安全条件

source prototype harnessは候補ごとに対象ファイルを`Buffer`として保存し、指定文字列の出現数が期待値と一致する場合だけ置換する。期待値が0件または複数件ならbuildを開始せず失敗する。

候補buildが成功した場合も、失敗した場合も、capture開始前または`finally`相当の後処理で保存済みバイト列を書き戻し、読み直したバイト列との完全一致を確認する。復元自体が失敗した場合はhard failureとして扱う。

candidateの画面は候補buildで生成した`dist/`を配信して取得するため、capture時のproduction sourceは既に復元済みである。これにより候補の見た目を確認しながら、未承認のVue変更をbranchへ残さない。`tests/r23SourcePrototypeHarness.test.js`では、IDとreplacement定義、unknown variant、出現数不一致、build失敗時の復元、成功時の復元を固定している。

## UI-04A — `inline` prop

### 候補source

次の3ファイルの「高度な設定」checkboxだけに`inline`を追加した。

```text
src/features/check/ui/ScoreForm.vue
src/features/attack/ui/AttackForm.vue
src/features/attack/ui/DefenceForm.vue
```

既存の`v-model`、`density="compact"`、`class="h-50"`、sibling textは変更していない。width、margin、flex、label slotなどのCSSやmarkupも追加していない。

### 計測結果

Checkは1件、Attackは2件のmarkerを検出し、全4画面でbaselineとcandidateをcaptureした。各checkboxの開閉操作で詳細設定が表示され、再度閉じられることも確認した。browser diagnosticsは全scenarioでconsole message、page error、request failure、HTTP errorが0件だった。

代表的なgeometry差は次のとおりである。selection-controlの内部幅はdesktopで`324.66px → 28px`、mobileで`89px → 28px`となり、sibling textの左端までの距離はdesktopで`296.65px → 0px`、mobileで`61px → 0px`となった。checkbox wrapperは28px、header rowは28pxのままで、textとrowの中心差は1px以内だった。

| Scenario | 件数 | baseline gap | candidate gap | vertical center |
| --- | ---: | ---: | ---: | --- |
| Check desktop | 1 | 296.65px | 0px | `true` |
| Check mobile | 1 | 61px | 0px | `true` |
| Attack desktop | 2 | 296.65px | 0px | 2件とも`true` |
| Attack mobile | 2 | 61px | 0px | 2件とも`true` |

この結果は、現行Vuetifyで失われた`VCheckboxBtn`のinline挙動を呼び出し側のpublic propで再現できるという技術仮説を支持する。ただし公開版との視覚的一致や文字列の見え方の採否は、capture画像をproduct ownerが確認して決める。

## UI-04B — `density="comfortable"`

### 候補source

次の3ファイルで、最小値・最大値・表示モードの3フィールドだけを`density="compact"`から`density="comfortable"`へ変更した。

```text
src/features/check/ui/SettingForm.vue
src/features/attack/ui/ScoreSettingForm.vue
src/features/attack/ui/DamageSettingForm.vue
```

対象外のfield、既存のlegacy CSS、計算処理、入力値、表示範囲ロジックは変更していない。`density`以外のprivate Vuetify selectorの追加・変更も行っていない。今回の段階ではlegacy CSSを外すablationや、`.v-field__input`へ高さ・paddingを直接指定する候補は比較していない。

### 計測結果

Check/Attackのdesktopとmobileを各1画面ずつcaptureし、対象3フィールドの`.v-input`、`.v-input__control`、`.v-field`、`.v-field__field`、`.v-field__input`、underline、label、native controlのbounding boxとcomputed styleを記録した。全4scenarioでbrowser diagnosticsは0件だった。

最小値・最大値はdesktop/mobileとも高さ`32px → 40px`、表示モードは高さ40pxのまま、横幅・x座標は変わらなかった。comfortable候補では対象fieldのcomputed `padding-top`が`8px → 14px`となり、referenceに近いgeometryをpublic APIだけで得られた。`padding-bottom`は現行comfortableでも0pxであり、公開版の2pxと完全一致することまでは示していない。

| 対象 | baseline height | candidate height | baseline padding-top | candidate padding-top |
| --- | ---: | ---: | ---: | ---: |
| 最小値 | 32px | 40px | 8px | 14px |
| 最大値 | 32px | 40px | 8px | 14px |
| 表示モード | 40px | 40px | 8px | 14px |

この結果は、まず`comfortable`だけを試すという方針を支持する。しかし、bottom padding、label/valueの縦位置、既存legacy CSSの整理まで含む最終採用を意味しない。visual reviewで候補が不十分と判断された場合に限り、legacy CSS除去などを別のsource prototypeとして設計する。

## UI-06 — compound labelとsemantic group

### 候補source

`src/features/backtrack/ui/BacktrackForm.vue`だけを一時変更した。外側の`<v-col md="3" cols="6">`と、内側の`<v-col cols="6">` 2列は維持している。変更は次のとおりである。

- Vueの`useId()`でgroup labelのIDを生成する。
- 2入力をapp-ownedの`div`で囲み、`role="group"`と`:aria-labelledby`を付ける。
- 視覚label「その他減少量」をgroup内のspanとして置く。
- 各fieldに「その他減少量（ダイス）」「その他減少量（固定値）」というscreen-reader-only labelを付ける。
- Vuetify内部の`.v-field__input`や`.v-field-label`のgeometryは上書きしない。

視覚labelの位置だけは候補が所有するtop-levelの`<style scoped>` blockで指定し、groupを`position: relative`、labelを上端へ配置する。style blockは`<template>`の外側へ置き、既存の入力fieldの内部CSSを直接変更する方式ではない。

### 計測結果

通常mobile、通常mobileでDロイス「不死者・悪夢」を選択した状態、通常desktopの3scenarioでbaselineとcandidateをcaptureした。baselineにはsemantic groupがないため、アクセシビリティ検証はcandidateだけに適用した。candidateでは全scenarioでgroupがちょうど1件、group名が「その他減少量」、spinbuttonがちょうど2件となり、2つのaccessible nameがそれぞれ期待値と一致した。browser diagnosticsは全scenarioで0件だった。

candidateのouter group幅はmobile 151px、desktop 290pxであり、source上の`cols=6`／`md=3`に対応する。nested rowもmobile 151px、desktop 290pxで、2つのfieldは各71.5px／141pxの6/6配置を維持した。visual labelのbounding boxはmobileで`x=199`、`y=205`、`74.41×15.98px`、desktopで`x=934`、`y=165`、`75×15.98px`だった。Eロイス数fieldはmobileで`x=48`、`y=209`、`143×32px`、desktopで`x=644`、`y=169`、`282×32px`であり、candidateの入力fieldはmobileで`y=209`、desktopで`y=169`から始まった。labelの重なり、周辺fieldとの距離、画面全体の自然さは画像によるproduct reviewで判断する。

| Scenario | candidate group | spinbutton names | outer width | nested fields |
| --- | ---: | --- | ---: | --- |
| Backtrack mobile | 1 | 2件、完全一致 | 151px | 71.5px + 71.5px |
| Backtrack mobile（不死者・悪夢） | 1 | 2件、完全一致 | 151px | 71.5px + 71.5px |
| Backtrack desktop | 1 | 2件、完全一致 | 290px | 141px + 141px |

formのfirst-row heightは、mobile ordinaryとmobile「不死者・悪夢」でbaseline `40px`、candidate `92px`、差分`+52px`だった。desktopではbaseline `40px`、candidate `52px`、差分`+12px`だった。この差分はgroup labelを追加した候補の実測値であり、行高を維持できたという主張ではない。

この候補は、既存のcompound labelを無理に兄弟fieldへまたがらせず、視覚上のgroupとアクセシビリティ上のgroupを同じ構造で表現する技術案である。入力名を分けたことで、ダイスと固定値を支援技術から個別に操作できることも確認できた。top-level SFC style blockへの修正後も、候補のvisual labelとrow heightは上記の実測値となった。視覚labelの位置やrow高の増加は、product ownerが採否を判断する。

## 総合判定と次の作業

3 variantはすべてbaseline/candidateのbuildとcaptureに成功し、候補build後のsource復元、unit test、`src/**`の恒久差分なしを確認した。候補は技術的な検証を通過したが、productionへの採用状態は次のとおりである。

| ID | 技術結果 | Production status |
| --- | --- | --- |
| UI-04A | `inline`だけでcontrol幅とsibling gapを縮小できた | `AWAITING PRODUCT OWNER` |
| UI-04B | `comfortable`でfield高さと上paddingをreferenceへ近づけられた | `AWAITING PRODUCT OWNER` |
| UI-06 | group semanticsと2つの個別accessible nameを実装できた | `AWAITING PRODUCT OWNER` |

product ownerが`ADOPT`を選んだ候補だけを、別のproduction実装単位として取り込む。`REVISE`の場合は不足しているvisual条件を明記して次のsource prototypeを設計し、`REJECT`の場合は候補を実験履歴として残す。今回のcommitにはproduction UI、計算core、runtime、Worker、公開asset、generator、依存バージョンの変更を含めない。
