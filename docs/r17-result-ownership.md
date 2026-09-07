# R17: 計算結果の所有権と差分実行

R17では、計算結果と表示用データを同じstateへ個別に保存して同期させる構造を改めた。計算入力のsnapshot、計算結果、結果を生成した範囲計画を一つのrecordとして扱い、表示範囲の変更や表示資源の拒否が計算結果の所有権を壊さないようにすることが目的である。Attackでは、変更されていないコンボを再計算せずに再利用する差分実行も導入した。

## 対象と対象外

対象はCheckとAttackのfeature state、およびAttackの実行調整である。既存のCalculationClientの計算意味論、`calculateAttackBatch`の公開API、Workerの実装、チャートの見た目は変更していない。presenterの大規模な簡素化、property descriptorの検査削除、結果オブジェクトのdeep freeze全面整理はR18以降の課題とする。

## Checkの計算record

Checkの内部stateでは、計算結果の正本を次のrecordにまとめる。

```text
CheckCalculationRecord = {
  input,
  result,
}
```

`input`はdifficultyとaction／reactionのScore入力をコピーしたsnapshotであり、表示範囲や表示モードを含めない。`result`はCalculationClientが返すScoreと統計量を保持する。入力snapshotはフォームstateと別のオブジェクトとして凍結するため、後からフォームを変更してもrecordのidentityは変わらない。

`useCheck()`が公開する`score`、`scoreStatistics`、`resultReady`は、互換性のためにrecordから導出したcomputed値である。これらを独立した正本として保存しない。

入力が変わるとrecordを直ちに`null`へ戻し、古い結果を現在の入力の結果として表示しない。一方、表示範囲や表示モードだけが変わった場合はrecordを保持する。新しい表示範囲が既存resultのcoverage内なら再計算せずprojectionだけを作り直し、coverageが不足する場合だけ再計算する。表示資源の拒否や表示生成の失敗でも、計算recordは破棄せず、表示状態とfeedbackだけを更新する。

## Attackのコンボrecord

Attackでは、各コンボの`data.calculation`が計算結果の正本である。

```text
AttackCalculationRecord = {
  input,
  result,
  rangePlan,
}
```

`input`はそのコンボのaction／reaction入力をコピーしたsnapshot、`result`はScoreとDamageおよび各統計量、`rangePlan`はその結果を生成した作業範囲と資源計画である。コンボの名前、表示・詳細の開閉、チャートの表示範囲は計算identityに含めない。recordは凍結し、入力snapshotがフォームstateとaliasしないことをconstructorで保証する。計算結果本体のownershipは既存CalculationClientの契約に従う。

コンボstateは概ね次の形を持つ。

```text
{
  params,
  calculation: AttackCalculationRecord | null,
}
```

`scorePresentation`、`damagePresentation`、`scoreReady`、`resultReady`のような表示または派生値はrecordに含めない。旧runnerを直接使う比較テストのために残る互換フィールドは、incremental production pathの正本ではない。

## Attackの合計record

複数コンボのDamageを集約した結果は、どのrecordから作られたかを順序付きsourceで識別する。

```text
AttackTotalCalculationRecord = {
  sources: [{ id, record }, ...],
  result,
}
```

コンボの追加、削除、並べ替え、計算recordの更新でsource列が変わるため、合計recordは無効になる。名前変更、表示切替、詳細の開閉だけでは無効にしない。合計の再集約に失敗しても、各コンボrecordは保持し、次回は合計だけを再試行できる。

## 差分実行の計画

`planAttackExecution()`は、要求された順序付きコンボとcommit済みrecordを比較し、各entryを`reuse`または`calculate`へ分類する。再利用条件は次の三つをすべて満たすことである。

```text
同じstable combo id
同じ計算入力snapshot
commit済みの計算recordが存在する
```

同じparamsを持つ別idのコンボへrecordを共有するcross-combo memoizationは行わない。duplicateは新しいidを持つため、新しいコンボだけを計算する。

初回にA／Bがある場合は、`calculateAttack(A)`、`calculateAttack(B)`を現在の順序で逐次実行し、完了したrecordのDamageを`calculateTotalDamage([A, B])`へ渡す。Aだけが変わった場合はAだけを再計算し、Bのrecordを同じobject referenceで再利用してから合計だけを再集約する。追加されたCはCだけを計算し、削除されたBではA／Cを計算し直さない。

この段階では新しい並列実行を導入しない。逐次実行によりResourceGuard、Workerのlifecycle、最新要求優先の順序を既存契約のまま保つ。

## atomic commitと最新要求

差分executorはstateを直接変更しない。すべてのコンボrecord、合計record、batch互換結果を組み立ててから、`commitAttackExecution()`が一度に検証・commitする。commit前に入力snapshot、コンボid、source reference、rangePlanの数、現在stateとの一致を確認するため、途中まで計算された結果が画面へ出ることはない。

入力変更や新しい表示要求で古いrequestが無効になった場合、latest-wins coordinatorがAbortまたはstale判定を行う。古いrequestが後で解決しても、現在の入力とgenerationが一致しなければcommitしない。

## 失敗時の所有権

計算段階と表示段階の失敗を分けて扱う。

| 失敗箇所 | 保持するもの | 無効にするもの | 次回の動作 |
| --- | --- | --- | --- |
| 一つのコンボ計算 | 成功済みの他コンボrecord | 失敗コンボrecord、合計、表示 | 失敗コンボだけ再計算して合計を再集約 |
| 合計Damageの集約 | すべてのコンボrecord | 合計record、base／display presentation | コンボを再計算せず合計だけ再試行 |
| base／display presentation生成 | すべての計算recordと合計record | 表示presentation | 同じ計算結果から表示だけ再生成 |
| 表示範囲のresource拒否 | 計算recordと合計record、可能ならbase presentation | 現在のdisplay presentation | 範囲を戻せばcoverage内は再計算なしで復帰 |

表示拒否中に入力が変わった場合は、変更されたコンボrecordと合計recordを失効させる。表示が回復した時点で、最新入力のコンボだけを計算し、他のrecordは条件を満たせば再利用する。

## APIと互換性

`CalculationClient.calculateAttackBatch()`は他consumer、benchmark、比較テストのために公開APIとして残す。ただしproductionの`useAttack()`はbatch APIへ依存せず、`calculateAttack()`と`calculateTotalDamage()`を使うincremental executorへ接続する。これにより公開APIを急に削除せず、featureの計算更新だけを差分化できる。

## 検証

`tests/attackIncrementalExecution.test.js`では、初回計算、変更コンボの単独再計算、追加・duplicate・削除、再利用条件、コンボ失敗、合計失敗を検証する。`tests/attackIncrementalRunner.test.js`では、失敗したコンボだけの再試行、合計だけの再試行、表示生成失敗時のrecord保持を検証する。`tests/attackFeatureController.test.js`では、production controllerの入力変更、表示範囲拡張、resource拒否からの表示復帰、Score表示拒否時のDamage保持、latest-winsを検証する。Check側は`tests/checkFeatureController.test.js`で入力変更時のrecord失効、表示拒否中の不整合防止、表示のみの再利用を検証する。

R17の完了時点で、これらのテストに加えて既存のrelease gate、typecheck、ESLint、Markdown lint、build、production smokeを実行し、結果をTODOと本書のclosure evidenceへ追記する。
