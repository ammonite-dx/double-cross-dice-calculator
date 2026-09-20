# R28-A: Mechanical repository cleanup

## 目的

公開準備前のrepository cleanupとして、計算式・確率結果・result contract・runtime semanticsを変更せず、曖昧なmodule resolution、不要な設定、明白な歴史的残骸をproduction surfaceから除去した。R28はreview gateごとに停止する方針であり、今回はGate 1だけを実施した。

## 実装

- `src/features/attack/ui/SummaryTable.js`を`SummaryTableHelpers.js`へ変更し、Vue componentとhelperのbasename collisionを解消した。helperのformatterと検索処理、表示内容は変更していない。
- `vite.config.js`からcustom `resolve.extensions`を削除し、Vite既定のmodule resolutionへ戻した。Vue SFCのimportとrouter lazy importは既存どおり明示的な`.vue`を使用している。
- 内容が見出しだけだった`AGENTS.md`を削除した。repository内に参照はなかった。
- `jsconfig.json`を削除し、`tsconfig.json`へ`src`と`tests`のJavaScriptをconfigured projectとして追加した。`allowJs: true`と`checkJs: false`、既存のstrictnessは維持した。
- 空の`src/styles/settings.scss`とVuetifyの`styles.configFile`を削除した。SCSSは他に存在せず、直接devDependencyだった`sass`も削除した。lockfileにはVuetifyのoptional peer解決に必要なmetadataが残る。
- `App.vue`の二重slash、Webpack専用の`webpackChunkName` commentを修正し、`.gitattributes`へ`*.ts text eol=lf`を追加した。
- branch-wideに利用箇所がないことを確認したうえで、`define: { 'process.env': {} }`、`.browserslistrc`、未使用の`src/assets/ammonite.png`を削除した。`@` alias、利用中の`logo.svg`、`wrangler.toml`のdeployment semanticsは維持した。
- `docs/independent-design-review-2026-09-19.md`を本文を変更せず`docs/archive/`へ移動した。repository内リンクはなかった。

## 不変条件

計算式、probability/result、tail／certificate／overflow semantics、ResourceGuard policy値、latest-wins、Worker wire protocol、numerical tolerance、`canonical-*` discriminantは変更していない。依存パッケージのversion upgradeやrepository全体のformatも行っていない。

## 検証

- `npm run verify:core`: 成功。Vitestは104 files／1112 tests、typecheck、ESLint、build（459 modules）、`diff:check`が成功した。
- `npm run lint:markdown`: 89 files／0 issues。
- `npm run verify:browser`: production browser smoke成功。Check、Attack、Backtrack、表示範囲の拒否・復帰、precomputed request 0、console warning／error 0、same-origin HTTP error 0を確認した。
- `git diff --check`: 成功。

R28-Aではreference／generator／full-tail benchmarkは実行対象外とした。Gate 1の完了後はここで停止し、次はレビュー通過後にR28-Bへ進む。

## 次の作業

R28-Bでは、ESLintとVitestのarchitecture enforcementの責務を整理する。production sourceのBrowser／Worker／Node globalsを明示し、runtime／featureのsemantic invariantを維持したまま、単なるimport文字列の重複検査を整理する。
