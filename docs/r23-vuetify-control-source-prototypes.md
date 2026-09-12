# R23 — Vuetify form source-level prototypes

## 目的と範囲

この文書は、R23で確認した3件のフォーム表示差について、productionへ採用する前のVue/Vuetify source-level prototypeと計測結果を記録する。候補sourceは一時的にbuildへ使用するが、通常の成功・失敗を問わず元のバイト列へ復元し、productionの`src/**`へ変更を残さない。

対象は次の3件である。

| ID | 対象 | 第一候補 | 現時点の判断 |
| --- | --- | --- | --- |
| UI-04A | 「高度な設定」のcheckboxと文字列の間隔 | `v-checkbox-btn`へpublic propの`inline`を明示する | `ADOPT`（production実装待ち） |
| UI-04B | Check/Attackの表示範囲fieldの縦方向geometry | 対象3フィールドだけを`density="comfortable"`へ変更する | `ADOPT`（production実装待ち） |
| UI-06 | Backtrackの「その他減少量」compound label | app-owned labelと`role="group"`を追加し、各入力名を分ける | revision 1/2は`REVISE`、revision 3は`REJECT`、revision 4は`ADOPT` |

この作業は候補の視覚的な妥当性を検証するものであり、capture成功だけでproduction採用とはしない。UI-04AとUI-04Bはproduct ownerが`ADOPT`と判断済みだがproduction実装は未着手で、UI-06はrevision 1とrevision 2を`REVISE`、revision 3を`REJECT`、revision 4を`ADOPT`とし、浮動labelを基準にした再計測結果を記録する。

## 再現条件

対象branchは`codex/canonical-default-migration`で、今回のUI-06 revision 4開始時点は`cf1b2763e934404b09028102e71be4feb2c23cc5`である。ハーネスとrunner、revision 2の計測更新、revision 3のsource candidate、浮動label基準の再計測、revision 4のsource candidateは次のコミットで追加した。

| Commit | 内容 |
| --- | --- |
| `9df2a68` | exact replacement、バイト列復元、fail-closed条件、unit testを含むsource prototype harness |
| `c16ed1f` | 一時build、source復元後のPlaywright capture、3 variantのrunner |
| `df450b7` | UI-06のベースライン／候補フェーズを分けた比較メトリクス修正 |
| `8b14058` | UI-06 revision 2、計測階層の不整合修正、label style/位置メトリクス、hierarchy invariantの追加 |
| `bc27c44` | UI-06 revision 3、4pxから12pxへの位置調整、revision 2との差分限定テスト |
| `d1be033` | UI-06のmain label／floating labelを分離した計測とfail-closed guard |
| `50d4738` | UI-06 revision 4、revision 2からの4pxから-4pxへの位置調整、最小差分ガード |

Nodeの既存buildを前提に、repository rootで次のコマンドを実行する。

```powershell
npm run review:r23:source-prototype -- --variant=advanced-setting-inline-source
npm run review:r23:source-prototype -- --variant=setting-form-comfortable-source
npm run review:r23:source-prototype -- --variant=backtrack-compound-label-source
npm run review:r23:source-prototype -- --variant=backtrack-compound-label-aligned-source
npm run review:r23:source-prototype -- --variant=backtrack-compound-label-positioned-source
npm run review:r23:source-prototype -- --variant=backtrack-compound-label-floating-aligned-source
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

### revision 1 — historical candidate（`REVISE`）

`src/features/backtrack/ui/BacktrackForm.vue`だけを一時変更し、外側の`<v-col md="3" cols="6">`と内側の`<v-col cols="6">` 2列を維持した。Vueの`useId()`でgroup labelのIDを生成し、2入力をapp-ownedの`<div>`で囲んで`role="group"`と`:aria-labelledby`を付け、視覚label「その他減少量」と個別のscreen-reader-only labelを追加した。Vuetify内部の`.v-field__input`や`.v-field-label`は変更せず、top-levelの`<style scoped>`でgroupをrelative、labelをabsoluteにした。

revision 1はsemantic構造とaccessible nameの要件を満たし、labelのclipも解消した。一方、視覚labelが隣接するEロイス数labelより暗く、上方にずれて見えるため、product ownerの判断は`REVISE`となった。revision 1のsource variant `backtrack-compound-label-source`とcapture結果は、この判断を含む履歴として変更せずに残す。

revision 1の計測で記録したfirst-row heightのmobile `baseline 40px → candidate 92px（+52px）`、desktop `baseline 40px → candidate 52px（+12px）`は、baselineでnested inner row、candidateでtop-level rowを測っており、比較階層が異なっていた。この2つの差分は行高回帰の証拠として無効であり、履歴上の誤った計測値として明示的に訂正する。行高の判断には、次のrevision 2で同じtop-level rowを計測した値を使う。

### revision 2 — aligned source candidate

variant `backtrack-compound-label-aligned-source`は、revision 1のsemantic構造、外側`cols=6`／desktop`md=3`、内側`6 / 6`、2つの個別accessible nameをそのまま維持する。変更は視覚labelの見た目と位置だけに限定した。

- 視覚labelへ`text-caption text-medium-emphasis`を付け、Vuetifyのutility typographyを使う。
- top-levelの`<style scoped>`でlabelの`inset-block-start`だけを`4px`にする。
- `font-size`、`line-height`、`.v-field__input`、内部label、row、fieldのgeometryを候補CSSで上書きしない。

candidateのsourceはbuild後、Playwright captureの前にバイト列単位で復元した。productionの`src/**`、計算、公開assetには接続していない。

### revision 2の計測結果

`backtrack-mobile`、`backtrack-mobile-livingdead`、`backtrack-desktop`の3scenarioでbaselineとcandidateを実行した。両フェーズで`outerColumn`、nested `innerRow`、top-level `firstRow`、Eロイス数fieldを取得し、`firstRowContainsNeighborElois=true`を検証した。candidateではgroupが1件、group名が「その他減少量」、spinbuttonが2件となり、2つのaccessible nameが完全一致した。今回のrunnerはEロイス数field内の可視main labelとfloating labelを分けて取得し、両者の件数とテキスト、floating classをfail closedで検証した。browser diagnosticsは全scenarioで0件だった。

旧runnerはdocument全体からテキストが「Eロイス数」と一致する最初の`<label>`を選んでいたため、対象field内の可視floating labelではなく、`visibility: hidden`のmain labelを比較対象にしていた。旧レポートのlabel top差`-8px`、center差`-10px`はこのselector bugによる値である。視覚labelの位置を評価する基準としては不適切なので、これらの旧値は`INVALID FOR VISUAL ALIGNMENT`と明記し、今回のfloating label基準の値へ置き換える。

| Scenario | outer column | nested fields | first-row height（baseline → candidate） | custom top − floating top | custom center − floating center | custom top − main top | custom center − main center |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: |
| Backtrack mobile | 151px | 71.5px + 71.5px | 92px → 92px（差0px） | +8px | +9px | -8px | -10px |
| Backtrack mobile（不死者・悪夢） | 151px | 71.5px + 71.5px | 92px → 92px（差0px） | +8px | +9px | -8px | -10px |
| Backtrack desktop | 290px | 141px + 141px | 52px → 52px（差0px） | +8px | +9px | -8px | -10px |

candidateのgroup自体はmobileで`x=199`、`width=143px`、desktopで`x=934`、`width=282px`となり、外側columnの内側4pxを反映する。visual labelのbounding boxはmobileで`x=199`、`y=209`、`74.41×20px`、desktopで`x=934`、`y=169`、`74.41×20px`だった。Eロイス数fieldのfloating labelはmobileで`x=48`、`y=201`、`55.98×18px`、desktopで`x=644`、`y=161`、`55.98×18px`であり、main labelはmobileで`x=48`、`y=217`、`74.64×24px`、desktopで`x=644`、`y=177`、`74.64×24px`だった。

candidate visual labelのcomputed styleは`font-size: 12px`、`line-height: 20.004px`、`color: rgba(0, 0, 0, 0.6)`、`opacity: 1`、`letter-spacing: 0.4px`である。floating labelは`12px / 18px`、`color: rgba(0, 0, 0, 0.87)`、`opacity: 0.6`、`letter-spacing: 0.1125px`、`transform: matrix(1, 0, 0, 1, 0, -16)`であり、main labelは`16px / 24px`、`color: rgba(0, 0, 0, 0.87)`、`opacity: 0.6`、`letter-spacing: 0.15px`、`visibility: hidden`、`aria-hidden=true`だった。utility classによるvisual labelの色と透明度は反映されたが、文字サイズと行高はfloating labelと異なるため、最終的な視覚一致はcapture画像で確認する。

revision 2のproduct-owner decisionは`REVISE`である。semantic compound-group structure、accessible names、outer `cols=6`、inner `6 / 6`、`text-caption`、`text-medium-emphasis`、field geometryは維持する。colorとemphasisは`PASS`、typographyは現状で許容とし、visual labelのvertical positionだけを`REVISE`とした。なお、視覚labelをmain labelへ合わせることを意味する旧`-8px / -10px`ではなく、floating labelとの差`+8px / +9px`を視覚位置の診断値として採用する。

### revision 3 — positioned source candidate（`REJECT`）

variant `backtrack-compound-label-positioned-source`は、revision 2のsemantic structure、accessible name、`text-caption text-medium-emphasis`、outer `cols=6`／desktop`md=3`、inner `6 / 6`、top-level scoped styleをそのまま再利用する。source上の変更は、visual labelの`inset-block-start: 4px;`を`inset-block-start: 12px;`へ置き換えることだけである。`font-size`、`line-height`、`color`、`opacity`、`letter-spacing`、field・row・columnのgeometry、内部Vuetify selectorは変更していない。

revision 2とrevision 3の変換済み`BacktrackForm.vue`は、上記の`inset-block-start`文字列を置き換えた場合にbyte-levelで一致することをunit testで固定した。candidate build後、Playwright captureの前にproduction sourceを元のバイト列へ復元し、productionの`src/**`、計算、公開assetには接続していない。

### revision 3の計測結果

`backtrack-mobile`、`backtrack-mobile-livingdead`、`backtrack-desktop`の3scenarioでbaselineとcandidateを実行した。両フェーズで`firstRowContainsNeighborElois=true`、`outerColumn`、nested `innerRow`、`firstRow`、Eロイス数fieldを検証し、candidateではgroup名と2つのspinbutton accessible nameも完全一致した。今回のrunnerはEロイス数field内の可視main labelとfloating labelを分けて取得し、両者の件数とテキスト、floating classをfail closedで検証した。browser diagnosticsは全scenarioで0件だった。

| Scenario | first-row height（baseline → candidate） | custom top − floating top | custom center − floating center | custom top − main top | custom center − main center | accessibility |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| Backtrack mobile | 92px → 92px（差0px） | +16px | +17px | 0px | -2px | PASS |
| Backtrack mobile（不死者・悪夢） | 92px → 92px（差0px） | +16px | +17px | 0px | -2px | PASS |
| Backtrack desktop | 52px → 52px（差0px） | +16px | +17px | 0px | -2px | PASS |

revision 3のvisual label bounding boxはmobileで`x=199`、`y=217`、`74.41×20px`、desktopで`x=934`、`y=177`、`74.41×20px`である。Eロイス数fieldのfloating labelはmobileで`x=48`、`y=201`、`55.98×18px`、desktopで`x=644`、`y=161`、`55.98×18px`であり、main labelはmobileで`x=48`、`y=217`、`74.64×24px`、desktopで`x=644`、`y=177`、`74.64×24px`だった。したがって、main labelとの差`0px / -2px`は一致して見えるが、floating labelとの差`+16px / +17px`が実際の可視labelとの位置関係を表す。computed styleはrevision 2から変更なく、visual labelは`font-size: 12px`、`line-height: 20.004px`、`color: rgba(0, 0, 0, 0.6)`、`opacity: 1`、`letter-spacing: 0.4px`である。floating labelは`12px / 18px`、`color: rgba(0, 0, 0, 0.87)`、`opacity: 0.6`、`letter-spacing: 0.1125px`、`transform: matrix(1, 0, 0, 1, 0, -16)`であり、main labelは`16px / 24px`、`color: rgba(0, 0, 0, 0.87)`、`opacity: 0.6`、`letter-spacing: 0.15px`、`visibility: hidden`、`aria-hidden=true`だった。

visual review用のcandidate画像は、`experiments/r23-ui-review/output/source-prototypes/backtrack-compound-label-positioned-source/candidate/09-backtrack-desktop.png`、`experiments/r23-ui-review/output/source-prototypes/backtrack-compound-label-positioned-source/candidate/10-backtrack-mobile.png`、`experiments/r23-ui-review/output/source-prototypes/backtrack-compound-label-positioned-source/candidate/11-backtrack-mobile-livingdead.png`である。画像と`report.json`はgitignore対象であり、commitしない。

product ownerのrevision 3 decisionは`REJECT`である。mobileではvisual labelをmain labelに合わせた結果、入力値の行へ入り込んで見えるため、視覚的には採用できない。従来のrevision 2の`-8px / -10px`およびrevision 3の`0px / -2px`は、いずれもmain labelを基準にした値であり、visual alignmentの根拠としては無効である。revision 3は実験履歴として残し、その計測時点では次のoffsetを決めず、後続のfloating label校正結果からrevision 4を別途導出した。

### revision 4 — floating-aligned source candidate（`AWAITING PRODUCT OWNER`）

revision 4はrevision 3からではなく、校正済みのrevision 2から派生させた。revision 2の`inset-block-start: 4px`ではvisual labelとfloating labelのtop差が全scenarioで`+8px`だったため、同じ座標系で`4px - 8px = -4px`と導出し、`inset-block-start: -4px`を1候補だけ検証する。center差はlabelの高さがvisual側約20px、floating側約18pxであるため、topを一致させても約`+1px`残ると予測し、先回りした補正は行わない。

variant `backtrack-compound-label-floating-aligned-source`は、revision 2のsemantic structure、`role="group"`、accessible names、Vuetify utility typography、outer `cols=6`／desktop`md=3`、inner `6 / 6`、top-level scoped styleを完全に維持する。source上の恒久的な変更はなく、実験時の置換は`inset-block-start: 4px;`から`inset-block-start: -4px;`だけである。`font-size`、`line-height`、`color`、`opacity`、`letter-spacing`、transform、field・row・column geometry、内部Vuetify selectorは変更していない。

revision 2とrevision 4の変換済み`BacktrackForm.vue`は、revision 2のsourceで上記の1箇所だけを置換した結果がrevision 4とbyte-levelで一致することをunit testで固定した。SFCのtop-level style invariantとutility typography invariantもrevision 4へ適用し、candidate build後のPlaywright capture前にproduction sourceを元のバイト列へ復元した。

### revision 4の計測結果

`backtrack-mobile`、`backtrack-mobile-livingdead`、`backtrack-desktop`の3scenarioでbaselineとcandidateを実行した。field、main label、floating labelは各1件で、両labelのテキストは「Eロイス数」、floating classも一致した。`firstRowContainsNeighborElois=true`、group名、2つのspinbutton accessible nameを検証し、browser diagnosticsは全scenarioで0件だった。

| Scenario | first-row height（baseline → candidate） | custom top − floating top | custom center − floating center | custom top − main top | custom center − main center | accessibility |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| Backtrack mobile | 92px → 92px（差0px） | 0px | +1px | -16px | -18px | PASS |
| Backtrack mobile（不死者・悪夢） | 92px → 92px（差0px） | 0px | +1px | -16px | -18px | PASS |
| Backtrack desktop | 52px → 52px（差0px） | 0px | +1px | -16px | -18px | PASS |

candidate visual labelのbounding boxはmobileで`x=199`、`y=201`、`74.41×20px`、desktopで`x=934`、`y=161`、`74.41×20px`であり、floating labelのtopと一致した。main labelはmobileで`y=217`、desktopで`y=177`なので、main labelとの差は診断用にのみ記録する。visual labelのcomputed styleはrevision 2と同じ`12px / 20.004px`、`color: rgba(0, 0, 0, 0.6)`、`opacity: 1`、`letter-spacing: 0.4px`であり、floating labelは`12px / 18px`、`color: rgba(0, 0, 0, 0.87)`、`opacity: 0.6`、`letter-spacing: 0.1125px`、`transform: matrix(1, 0, 0, 1, 0, -16)`、main labelは`16px / 24px`、`color: rgba(0, 0, 0, 0.87)`、`opacity: 0.6`、`letter-spacing: 0.15px`、`visibility: hidden`、`aria-hidden=true`で、いずれもrevision 2から変わっていない。

visual review用のcandidate画像は、`experiments/r23-ui-review/output/source-prototypes/backtrack-compound-label-floating-aligned-source/candidate/09-backtrack-desktop.png`、`experiments/r23-ui-review/output/source-prototypes/backtrack-compound-label-floating-aligned-source/candidate/10-backtrack-mobile.png`、`experiments/r23-ui-review/output/source-prototypes/backtrack-compound-label-floating-aligned-source/candidate/11-backtrack-mobile-livingdead.png`である。画像と`report.json`はgitignore対象であり、commitしない。

revision 4は、校正済みfloating label基準から一意に導いたsource candidateであり、product ownerのdecisionは`ADOPT`である。desktop、mobile、mobile Living Deadの3scenarioでline-box top差は0px、center差は+1px、first-row差は0px、accessibilityはPASS、browser diagnosticsは0件だった。PNGの実描画でもlabelとvalueの間隔、underlineの位置・幅に問題はなく、mobileのlabel inkはEロイス数が`y=205..214`、その他減少量が`y=204..215`、両方のvalue開始が`y=222`、underlineが`y=240`で一致した。採用理由は、文字列固有のink box差を無理に補正せずline-boxをfloating labelへ合わせられたことである。production UIへの接続は次のproduction実装単位で行い、revision 5や別offsetの追加は行わない。

## 総合判定と次の作業

対象variantはすべてbaseline/candidateのbuildとcaptureに成功し、候補build後のsource復元、unit test、`src/**`の恒久差分なしを確認した。候補は技術的な検証を通過したが、productionへの採用状態は次のとおりである。

| ID | 技術結果 | Production status |
| --- | --- | --- |
| UI-04A | `inline`だけでcontrol幅とsibling gapを縮小できた | `ADOPT`（production実装待ち） |
| UI-04B | `comfortable`でfield高さと上paddingをreferenceへ近づけられた | `ADOPT`（production実装待ち） |
| UI-06 | revision 1/2のgroup semanticsを維持し、revision 3で誤ったmain label基準を試し、revision 4でfloating label基準へ補正した | revision 1/2は`REVISE`、revision 3は`REJECT`、revision 4は`ADOPT`（production実装待ち） |

product ownerが`ADOPT`を選んだ候補だけを、別のproduction実装単位として取り込む。`REVISE`の場合は不足しているvisual条件を明記して次のsource prototypeを設計し、`REJECT`の場合は候補を実験履歴として残す。今回のcommitにはproduction UI、計算core、runtime、Worker、公開asset、generator、依存バージョンの変更を含めない。
