# R28-D: display-form style ownership

## 目的

R28-Dでは、表示範囲フォームのCSSを各フォームが明示的に所有する構造へ整理した。Checkの`SettingForm`とAttackの`ScoreSettingForm`にあったnon-scoped CSSを共有stylesheetへ移し、Attackの`DamageSettingForm`も同じstylesheetを明示的にimportするようにした。フォームロジック、表示範囲の入力・検証契約、計算結果、チャート表示は変更していない。

## 実装

- `src/styles/display-range-form.css`を追加し、`.display-range-form`配下へ`.v-select__selection`、`.v-select__selection-text`、`.v-field__input`の既存表示値を限定した。
- `src/features/check/ui/SettingForm.vue`、`src/features/attack/ui/ScoreSettingForm.vue`、`src/features/attack/ui/DamageSettingForm.vue`から共有stylesheetを明示的にimportし、各`v-form`へ`display-range-form` classを付与した。
- CheckとAttack Scoreに残っていたglobal `<style>`を削除した。Damage formは従来からlocal styleを持たず、Score formのstyle読み込みに暗黙依存していたため、明示importだけを追加した。
- `scripts/production-browser-smoke.mjs`へcomputed style検証を追加した。Checkは1フォーム、Attackは2フォームをdesktopと390x844のmobile viewportで確認し、margin、flex wrap、font size、alignment、field heightを検証した。
- `.v-select__selection-text`はVuetifyのflex selection wrapperの子要素であるため、CSS上の`inline-flex`宣言がcomputed styleでは`flex`へblockifyされる。browser smokeではこのcomputed値に加えて、CSSOM上の明示宣言が`inline-flex`であることも確認している。

## 作業単位

R28-Dは次の2コミットで完了した。

1. `61044b1` `refactor: scope display range form styles`
2. 本文書とTODO更新のdocs commit

開始時点はR28-C完了後の`a9b1131`である。

## 検証

- Vitest: 86 files／1008 testsが成功した。
- `npm run typecheck`、`npm run lint`、`npm run lint:markdown`、`npm run build`、`git diff --check`が成功した。
- `npm run verify:browser`が成功した。
- production browser smokeでCheck／Attack／Backtrack、動的表示範囲、latest-wins回復、事前計算assetへのリクエスト0件を確認した。
- 追加したdesktop style smokeでCheck 1フォーム、Attack 2フォームを確認した。
- 追加したmobile style smoke（390x844）でCheck 1フォーム、Attack 2フォームを確認した。
- browser console warning/error、同一originのHTTP error、request failureは0件だった。
- 最終検証後の作業ツリーはcleanである。

## 非対象と次の作業

R28-Dではgeneric `DisplayRangeForm` component、3フォームのTypeScript化、表示デザイン変更、CSS全体の再設計を行っていない。次はR28-E1で`CalculationFeedback`のpresentation分離を別レビュー後に開始する。R28-E2、公開準備、resource policy調整はその後に続ける。
