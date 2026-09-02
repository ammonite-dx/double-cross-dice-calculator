# TypeScript移行方針

この文書は、R1で導入したTypeScriptの型検査基盤と、JavaScriptとTypeScriptを混在させる期間の運用規約を記録する。対象はアプリケーションの保守と段階的なリファクタリングであり、計算結果や公開データの仕様を変更するものではない。

## 基本方針

既存のJavaScriptはそのまま実行できる状態を保ち、新しく追加する型付き境界と、後続の変更で触れる小さなframework-independent moduleから段階的にTypeScriptへ移行する。一度に全コンポーネントや計算coreを書き換えず、各コミットで既存のbehavior gateを維持する。

新規TypeScriptはstrictを前提とする。既存JavaScriptを型検査対象へ一括移行することは避け、allowJsは有効、checkJsは無効とする。依存パッケージの宣言ファイルに起因する既知のエラーはskipLibCheckで隔離し、アプリケーション自身の型検査を無効化するためには使わない。

## TypeScript設定

型検査は次のコマンドを正規のlocal gateとする。

```powershell
npm run typecheck
```

tsconfig.jsonはViteのbrowser applicationに合わせてmoduleResolutionをBundlerとし、Viteで使う@ aliasをpathsにも定義する。noEmit、isolatedModules、ES2022 targetを使用し、生成物はViteに任せる。

型専用の依存はruntime dependencyへ追加しない。TypeScriptから型だけを参照するときはimport typeを使い、runtime importと明確に分離する。

## Module resolution

production applicationのsourceはVite/Rolldownを正規の実行環境とする。既存のextensionless importを全体へ機械的に.js付きへ変更しない。これにより、今後のdirectory移動やTypeScript化で不要な大規模差分を作らない。

Nodeから計算coreを直接検証するtoolingは、production sourceを変更せず、対象entryをRolldownでbundleしてからNodeで実行する。npm run verify:runtime-dxはこの専用runnerを使い、native Node ESMのextensionless resolution制約を検証結果へ持ち込まない。

```text
browser application: Vite/Rolldown → source modules
Node verifier: source entry → Rolldown bundle → Node execution
```

deprecatedなspecifier-resolution flagや、production source全体のimport書き換えは採用しない。

## 型を置く境界

R1では、次のような外部境界を優先して型で表現する。

| 境界 | 型定義 | runtime validation |
| --- | --- | --- |
| 入力domain | InputDomain、CalculationInputs | 維持する |
| Check/Backtrack snapshot | CheckInputSnapshot、BacktrackInputSnapshot | formとcoreで維持する |
| 計算client | CalculationClientTypes | application boundaryで維持する |
| 確率分布 | DistributionResultTypes | DistributionResult.jsで維持する |
| DX provider | DxProviderTypes | positional adapterを維持する |
| DR Worker | RuntimeDamageRollProtocol | postMessage受信側で維持する |

型はnumberであることだけを保証し、criticalの範囲やダイス数の非負性など、入力値の意味は既存のassert関数と各計算coreのruntime validationで検査する。型を追加したことを理由にvalidationを削除したり、untrustedなWorker messageを信頼したりしない。

## 逃げ道の扱い

新規TypeScriptではany、as any、@ts-ignore、@ts-nocheckを原則として使わない。frameworkやDOMの既知の型不足に対する限定的な型assertionが必要な場合は、変換が安全である理由を近くのコメントまたは設計文書へ記録する。複雑な値を型付けできない場合は、anyではなくunknownからtype guardで絞る。

R1では、Vue componentの全面的なlang="ts"化、計算coreの一括変換、feature-firstへのdirectory再編、props mutationの解消、Canonicalという命名の変更は行わない。これらは後続phaseでbehavior contractを固定したうえで扱う。

## 検証とCI

R1のtargeted gateは次のとおりである。

```powershell
npm run typecheck
npm run verify:runtime-dx
npm run lint
npm run build
git diff --check
```

TypeScriptの型境界を変更したときは、既存のVitest回帰テストも実行する。full gateでは、precomputed data検証、Vitest、generator検証、typecheck、ESLint、Markdown lint、production build、browser smokeを順に実行する。

R1で追加した型は、型の存在だけでなく、既存のCheck、Attack、Backtrack、Worker、resource rejection、AbortSignal、latest-winsのbehaviorを壊していないことを確認する。

## 今後の移行

次のphaseでは、R1で定義した境界型を使って依存方向を固定し、Backtrack、Check、入力validation、Chart、Attack stateの順に責務を整理する。既存JavaScriptの型移行範囲を広げる場合も、型検査の厳格化とruntime validationの変更を同じコミットへ混在させない。
