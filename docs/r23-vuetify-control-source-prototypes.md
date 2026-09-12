# R23 — Vuetify form source-level prototypes

## 目的と範囲

この文書は、R23で確認したフォーム表示差について、productionへ採用する前のVue/Vuetify source-level prototypeと、採用後の本番統合検証結果を記録する。候補sourceは一時的にbuildへ使用するが、通常の成功・失敗を問わず元のバイト列へ復元し、productionの`src/**`へ変更を残さない。

対象は次の4件である。

| ID | 対象 | 第一候補 | 現時点の判断 |
| --- | --- | --- | --- |
| UI-04A | 「高度な設定」のcheckboxと文字列の間隔 | `v-checkbox-btn`へpublic propの`inline`を明示する | `ADOPT`（production反映済み、統合visual確認済み） |
| UI-04B | Check/Attackの表示範囲fieldの縦方向geometry | 対象3フィールドだけを`density="comfortable"`へ変更する | `ADOPT`（production反映済み、統合visual確認済み） |
| UI-06 | Backtrackの「その他減少量」compound label | app-owned labelと`role="group"`を追加し、各入力名を分ける | revision 1/2は`REVISE`、revision 3は`REJECT`、revision 4は`ADOPT`（production反映済み、統合visual確認済み） |
| UI-08 | Attack/DefenceのD10+固定値compound input | Backtrack UI-06と同じshared label、`role="group"`、個別accessible nameを本番へ適用する | `ADOPT`（production反映済み、統合visual確認待ち） |

この作業は候補の視覚的な妥当性を検証するものであり、capture成功だけでproduction採用とはしない。UI-04A、UI-04B、UI-06 revision 4はproduct ownerが`ADOPT`と判断し、2026-09-12にproductionへ反映した。UI-06 revision 1とrevision 2は`REVISE`、revision 3は`REJECT`として履歴を保持し、revision 4は浮動labelを基準にした再計測結果と本番統合結果を記録する。

## 再現条件

対象branchは`codex/canonical-default-migration`で、今回のUI-06 revision 4開始時点は`cf1b2763e934404b09028102e71be4feb2c23cc5`である。ハーネスとrunner、revision 2の計測更新、revision 3のsource candidate、浮動label基準の再計測、revision 4のsource candidate、UI-08のsource candidateは次のコミットで追加した。

| Commit | 内容 |
| --- | --- |
| `9df2a68` | exact replacement、バイト列復元、fail-closed条件、unit testを含むsource prototype harness |
| `c16ed1f` | 一時build、source復元後のPlaywright capture、3 variantのrunner |
| `df450b7` | UI-06のベースライン／候補フェーズを分けた比較メトリクス修正 |
| `8b14058` | UI-06 revision 2、計測階層の不整合修正、label style/位置メトリクス、hierarchy invariantの追加 |
| `bc27c44` | UI-06 revision 3、4pxから12pxへの位置調整、revision 2との差分限定テスト |
| `d1be033` | UI-06のmain label／floating labelを分離した計測とfail-closed guard |
| `50d4738` | UI-06 revision 4、revision 2からの4pxから-4pxへの位置調整、最小差分ガード |
| `eaedd30` | UI-08 Attack/Defence compound D10+ source prototype、8scenarioのrunner、契約テスト |
| `dd2c573` | UI-08ガード分岐のoffset revision、desktop/mobile 2scenarioの再確認 |

UI-08のoffset revisionはproduct ownerがdesktop／mobileとも`PASS`と判断し、Attack、ドッジ、《イベイジョン》、ガード・リアクション放棄のcompound inputを`ADOPT`とした。production反映では、候補で確認したgroup semantics、個別accessible name、既存field geometry、ガード専用offsetを維持する。実装と統合captureは、判断記録とは別のcommitで行う。

Nodeの既存buildを前提に、repository rootで次のコマンドを実行する。

```powershell
npm run review:r23:source-prototype -- --variant=advanced-setting-inline-source
npm run review:r23:source-prototype -- --variant=setting-form-comfortable-source
npm run review:r23:source-prototype -- --variant=backtrack-compound-label-source
npm run review:r23:source-prototype -- --variant=backtrack-compound-label-aligned-source
npm run review:r23:source-prototype -- --variant=backtrack-compound-label-positioned-source
npm run review:r23:source-prototype -- --variant=backtrack-compound-label-floating-aligned-source
npm run review:r23:source-prototype -- --variant=attack-compound-d10-source
```

`--scenarios=id,id`で対象scenarioを絞れる。runnerはbaseline build/captureを行った後、候補sourceをexact replacementで一時適用してbuildし、candidate `dist/`をcaptureする前にsourceを復元する。画像とJSONは`experiments/r23-ui-review/output/source-prototypes/<variant>/`へ保存される。このディレクトリはgitignoredである。

## ハーネスの安全条件

source prototype harnessは候補ごとに対象ファイルを`Buffer`として保存し、指定文字列の出現数が期待値と一致する場合だけ置換する。期待値が0件または複数件ならbuildを開始せず失敗する。

候補buildが成功した場合も、失敗した場合も、capture開始前または`finally`相当の後処理で保存済みバイト列を書き戻し、読み直したバイト列との完全一致を確認する。復元自体が失敗した場合はhard failureとして扱う。

candidateの画面は候補buildで生成した`dist/`を配信して取得するため、capture時のproduction sourceは既に復元済みである。これにより候補の見た目を確認しながら、未承認のVue変更をbranchへ残さない。`tests/r23SourcePrototypeHarness.test.js`では、IDとreplacement定義、unknown variant、出現数不一致、build失敗時の復元、成功時の復元を固定している。

UI-04A、UI-04B、UI-06 revision 4をproductionへ採用した後は、対象sourceの現在形が候補作成前の形と異なるため、これらの履歴variantを現行sourceへ直接再適用することは想定しない。variant定義とcapture結果は監査用に保持し、契約テストでは宣言された履歴候補を合成して置換内容とrevision間の最小差分を検証する。本番sourceの見た目は、後述の統合captureで別途確認する。

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

### revision 4 — floating-aligned source candidate（`ADOPT`）

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

revision 4は、校正済みfloating label基準から一意に導いたsource candidateであり、product ownerのdecisionは`ADOPT`である。desktop、mobile、mobile Living Deadの3scenarioでline-box top差は0px、center差は+1px、first-row差は0px、accessibilityはPASS、browser diagnosticsは0件だった。PNGの実描画でもlabelとvalueの間隔、underlineの位置・幅に問題はなく、mobileのlabel inkはEロイス数が`y=205..214`、その他減少量が`y=204..215`、両方のvalue開始が`y=222`、underlineが`y=240`で一致した。採用理由は、文字列固有のink box差を無理に補正せずline-boxをfloating labelへ合わせられたことである。`9212fc6`でproduction UIへ接続し、revision 5や別offsetの追加は行わない。

## UI-08 — Attack/Defence compound D10+ consistency（2026-09-12）

UI-08では、AttackFormの「攻撃力」とDefenceFormの「装甲・軽減値」および「ガード・装甲・軽減値」を、Backtrack UI-06で採用したshared label + individual accessible nameの規則へ揃えられるかをsource-level prototypeで確認した。これはproduction変更ではなく、R23に追加されたconsistency/accessibilityレビュー項目である。

### Candidate source

対象sourceは次の2ファイルだけである。

```text
src/features/attack/ui/AttackForm.vue
src/features/attack/ui/DefenceForm.vue
```

AttackFormでは`useId()`で「攻撃力」groupのIDを生成し、既存の`md="3"`、`cols="12"`、nested `v-row`、内側`6 / 6`列を維持したままwrapperへ`role="group"`と`aria-labelledby`を追加した。視覚labelは「攻撃力」、個別のaccessible nameは「攻撃力（ダイス）」と「攻撃力（固定値）」とした。DefenceFormでは同じ`useId()`をドッジ・《イベイジョン》・ガード分岐で共有し、前二者のouter列（それぞれ`md="3"`／`md="4"`）とinner `6 / 6`を維持した。ガード分岐は既存のtop-level `v-row`直下の6/6列を維持し、row自体をgroupにした。候補の視覚labelには`text-caption text-medium-emphasis`を付け、top-level scoped styleでrelative position、`inset-block-start: -4px`、`inset-inline-start: 0`、z-index、pointer-eventsを指定した。Vuetify内部selectorの高さ・padding・transform、v-model、rules、suffix、column widthは変更していない。ガード分岐のoffsetは共通値を機械的に適用せず、baselineのfloating labelとの差を計測した。

### Source prototype runner

variantは`attack-compound-d10-source`であり、`eaedd30`で追加した。source runnerはvariantのscenario entryとして既存IDとinline scenario objectの両方を解決し、inline定義にも既存のscenario validationを適用する。既存multi-combo scenarioで必要な「コンボを追加」クリック、candidateで変更された攻撃力（ダイス）accessible nameへの入力、固定値側の入力をsource runner内で扱う。production capture runnerと`scenarios.js`の恒久的なscenario setは変更していない。

### Scenarioとcapture

全8scenarioでbaselineとcandidateをcaptureした。singleとmulti-comboは既存scenarioを再利用し、mode切替を含む4scenarioはsource prototype専用inline定義とした。

| 種別 | Desktop | Mobile |
| --- | --- | --- |
| Attack single | `attack-desktop-single`（`05-attack-desktop-single.png`） | `attack-mobile-single`（`06-attack-mobile-single.png`） |
| Attack multi-combo | `attack-desktop-multi-combo`（`07-attack-desktop-multi-combo.png`） | `attack-mobile-multi-combo`（`08-attack-mobile-multi-combo.png`） |
| 《イベイジョン》 | `attack-desktop-evasion-compound`（`12-attack-desktop-evasion-compound.png`） | `attack-mobile-evasion-compound`（`13-attack-mobile-evasion-compound.png`） |
| ガード・リアクション放棄 | `attack-desktop-guard-compound`（`14-attack-desktop-guard-compound.png`） | `attack-mobile-guard-compound`（`15-attack-mobile-guard-compound.png`） |

全scenarioでbaseline/candidateのbuildとcaptureが成功し、console warning/error、page error、same-origin request failure、HTTP errorは0件だった。multi-comboでは2件のAttackForm／DefenceFormに対してgroup数と各spinbutton数が一致し、shared label IDの空値・重複はなかった。candidateの入力操作も成功し、既存の`currentParams.damage.dice`と`currentParams.damage.value`への伝搬を壊していない。

### Geometryとaccessibility metrics

candidateの各groupで、指定したshared labelと個別spinbutton accessible nameを検証した。Attackおよびドッジ／《イベイジョン》のcandidate labelはbaselineのnative floating labelと同じx座標・top座標となった（文字列幅の差は「攻撃力」`+0.86px`、「装甲・軽減値」`+1.72px`）。ガード分岐ではdirect rowのgrid左端を基準にしたため、baseline floating labelとの差はx`-4px`、top`-8px`となった。この差は候補の構造的失敗とは扱わず、guard専用offsetを決めるvisual reviewの診断値として記録する。

全8scenarioで、各fieldのx/y/width/height、underlineのx/y/width、row heightのcandidate-baseline差は0pxだった。Attack／ドッジ／《イベイジョン》のgroup wrapperだけはnested `v-row`の負マージンを含まないため、wrapperの外枠がbaseline rowよりx`+4px`、width`-8px`となるが、fieldとrowのgeometryは変わっていない。guardのtop-level rowも高さ48pxを維持した。labelのpixel差は自動acceptance条件にせず、field幅、row高さ、折返しなどのstructural regressionだけをfail-closedで検出する。

### Candidate status before production integration

candidate buildのcapture前に、対象2ファイルは実行前のバイト列へ完全復元した。productionの`src/**`、計算core、runtime、公開asset、production browser smoke、共有componentは変更していない。画像と`report.json`はgitignore対象であり、commitしない。

UI-08はsource prototypeと技術検証を完了し、offset revisionのvisual reviewでproduct ownerの`ADOPT`承認を得た。production反映は後述の独立commitで行い、`CompoundD10Field.vue`などの共通component化は行わない。

### UI-08 guard offset revision（2026-09-12）

初回candidateのvisual reviewでは、Attack「攻撃力」、Defenceのドッジ「装甲・軽減値」、《イベイジョン》「装甲・軽減値」はdesktop／mobileとも`PASS`だった。一方、ガード・リアクション放棄のdirect-rowだけは、shared labelがbaselineのnative floating labelよりx`-4px`、top`-8px`となっており、mobile・desktopの両方で視認できる差として`REVISE`とした。

revision variant `attack-compound-d10-guard-offset-source`（`dd2c573`）では、初回candidateの構造を維持したまま、DefenceFormのguard modifierへ`inset-inline-start: 4px`、`inset-block-start: 4px`を追加した。AttackFormとDefenceFormのgroup semantics、個別accessible name、v-model、rules、suffix、6 / 6列、row heightは変更していない。

初回候補でPASSだった6scenarioは再実行せず、`attack-desktop-guard-compound`と`attack-mobile-guard-compound`の2scenarioをbaseline／candidateでcaptureした。両scenarioでbuildとcaptureが成功し、console warning/error、page error、same-origin request failure、HTTP errorは0件だった。group数、spinbutton名、shared label IDの一意性、入力操作は成功した。

revision candidateのガードlabelはbaseline floating labelとx／topが一致した。fieldのx／y／width／height、underlineのx／y／width、row heightのcandidate-baseline差はdesktop／mobileとも0pxで、structural validationも空だった。candidateのlabel幅・line-box高さによるpixel差は自動acceptance条件にせず、今回のvisual reviewで確認する診断値として保持する。

candidate capture前のsource復元は成功し、productionの`src/**`、production runner、計算core、runtime、公開asset、共有componentは変更していない。画像と`report.json`はgitignore対象であり、commitしない。revisionはproduct ownerの`ADOPT`承認を得て、後述のproduction実装へ接続した。R23全体は`IN REVIEW`のままとする。

## 総合判定と次の作業

対象variantは採用前にbaseline/candidateのbuildとcaptureに成功し、候補build後のsource復元、unit test、`src/**`の恒久差分なしを確認した。production統合後は、現行sourceと一致しない履歴variantを直接再実行せず、統合captureとrelease gateで本番経路を検証する。productionへの採用状態は次のとおりである。

| ID | 技術結果 | Production status |
| --- | --- | --- |
| UI-04A | `inline`だけでcontrol幅とsibling gapを縮小できた | `ADOPT`（production反映済み、統合visual確認済み） |
| UI-04B | `comfortable`でfield高さと上paddingをreferenceへ近づけられた | `ADOPT`（production反映済み、統合visual確認済み） |
| UI-06 | revision 1/2のgroup semanticsを維持し、revision 3で誤ったmain label基準を試し、revision 4でfloating label基準へ補正した | revision 1/2は`REVISE`、revision 3は`REJECT`、revision 4は`ADOPT`（production反映済み、統合visual確認済み） |
| UI-08 | 初回候補でAttack／ドッジ／《イベイジョン》は`PASS`、ガードは`REVISE`。offset revisionでガードのlabel位置を再計測した | `ADOPT`（production反映済み、統合visual確認待ち） |

product ownerが`ADOPT`を選んだ候補だけを、別のproduction実装単位として取り込む。`REVISE`の場合は不足しているvisual条件を明記して次のsource prototypeを設計し、`REJECT`の場合は候補を実験履歴として残す。production統合では、UI-01、UI-04A、UI-04B、UI-06、UI-07、UI-08を個別commitへ分け、計算core、runtime、Worker、公開asset、generator、依存バージョンは変更していない。

## Production integration（2026-09-12）

product ownerが採用した6件を、次の順でproductionへ反映した。各UI変更は個別にrevertできる単位とし、UI-06／UI-08の判断記録を先に置いた。

| Commit | 内容 |
| --- | --- |
| `e757218` | UI-06 revision 4の`ADOPT`判断を記録 |
| `39671ef` | Backtrack mobile Doughnut datalabelを`6px`から`8px`へ変更（desktopは`12px`を維持） |
| `b51edc4` | Check／Attackの「高度な設定」checkboxへ`inline`を明示 |
| `86cbc84` | Check／Attackの最小値・最大値・表示モードを`density="comfortable"`へ変更 |
| `9212fc6` | Backtrackのcompound label revision 4（group semantics、個別accessible name、`inset-block-start: -4px`）を反映 |
| `973bf2a` | `MainArea`をnormal-flowのcolumn flex shellへ変更し、短いページでfooterを下端へ配置 |
| `7ca714d` | UI-08 offset revisionの`ADOPT`判断を記録 |
| `fbd19bd` | Attack／Defenceのcompound D10入力をgroup semanticsと個別accessible nameへ統一 |
| `6726dfc` | UI-08のproduction smoke／capture toolingを15scenarioへ拡張 |

production統合後の検証基盤の追随は、`c43cb17`（本番CSS単体の短ページfooter検証variant）、`cd41315`（short page／drawer／long Attackを含む統合footer検証）、`b39cf75`（採用後も履歴source prototypeの契約を維持）、`e189c0b`（分離後のBacktrack accessible nameをproduction smokeへ反映）で行った。

### Integrated capture

通常のproduction captureは[`experiments/r23-ui-review/output/report.json`](../experiments/r23-ui-review/output/report.json)へ出力した。Check（desktop／mobile／upper tail）、Attack（desktop／mobile、single／multi-combo、ドッジ／《イベイジョン》／ガード・リアクション放棄）、Backtrack（desktop／mobile／Living Dead）の15scenarioがすべて`captured`となり、console warning/error、page error、same-origin request failure、HTTP errorは全scenarioで0件だった。Attackの初期ドッジ、モード切替後の《イベイジョン》、ガード、multi-comboでは、shared group名、個別spinbutton名、`aria-labelledby` IDの一意性を検証した。画像とJSONはgitignore対象であり、commitしていない。

footerは、本番CSSを追加注入しない[`experiments/r23-ui-review/output/prototypes/footer-production-integrated/report.json`](../experiments/r23-ui-review/output/prototypes/footer-production-integrated/report.json)で確認した。短いCheckページとdrawer開状態ではfooterのviewport bottom gapがともに`0px`、footerのpositionは`relative`、`.main-area`はcolumn flexだった。drawerの中心点はdrawer自身にあり、footerより前面に表示された。長いAttack mobileではfooterがcontent wrapperの直後（content bottom=`1873px`、footer top=`1873px`）に通常flowで配置され、viewport外へ続くページでも重なりはなかった。3scenarioのbrowser diagnosticsは0件だった。

### Release gate

`npm run verify:release`をproduction source変更後に実行し、次をすべて確認した。

- `data:check`: schema-v2/revision-1の32 assets
- Vitest: 98 files／991 tests
- generator: 通常18件、simulation 13件、Ruff clean
- typecheck、ESLint、Markdown lint（57 files／0 issues）
- runtime DX: 20,000 cases、non-finite／negative 0、最大差は設定許容内
- production build: 423 modules
- production browser smoke: PASS、canvas・asset request・browser diagnostics・compound input accessibilityの契約を満たす
- `git diff --check`: PASS

今回のproduction変更で、`src/calculation/**`、`src/runtime/**`、generator、公開asset、依存バージョン、Worker protocolは変更していない。UI-04C、UI-05、Damage expectation、R23-C、Cloudflare Worker／API／MCPはこの統合に含めない。

UI-01、UI-04A、UI-04B、UI-06、UI-07のproduction統合visual confirmationはproduct ownerが確認済みである。UI-08もoffset revisionのdesktop／mobile captureをproduct ownerが確認し、`ADOPT`と判断した。production source、smoke、15scenario capture、release gateは完了したが、統合後のUI-08 visual confirmationは未実施であるため、production statusは`AWAITING PRODUCT OWNER`、R23の状態は`IN REVIEW`のままとする。
