# R23 Damage期待値のtail attribution調査

この文書は、R23-Bで指定したDamage期待値の技術調査を記録する。productionのformatter、計算core、Worker、公開assetは変更せず、現在のcanonical full-tail結果に含まれる証明書から有限な期待値上界を構成できるかを調べる。

## 調査範囲

最初のsafe sliceを、`kazanari = 0`、防御ダイス0、攻撃と防御の固定値差が非負、`shihai = 0`、`yousei = 0`、action Scoreに`scoreExpectationCertificate`がある通常攻撃に限定した。その他の入力は同じ監査へ含めるが、条件を満たさない場合は有限上界を推測しない。

```powershell
npm run audit:r23:damage-tail
```

結果はgitignoredな`experiments/r23-damage-summary-precision/output/tail-attribution.json`へ保存される。各fixtureについて、入力、Score action/reactionの明示first momentとsupport・overflow、Score tail certificate、Score期待値certificate、Damageの期待値・明示first moment・support・overflow、`scoreTailProbabilityUpperBound`、`scoreTailErrorBound`、`projectionUncertainty`を記録する。

## 公開版3.1相当の再現

公開版の初期Attack画面に対応する`public-v3-1-default`をfixtureとして固定した。actionとreactionはいずれも1D10・クリティカル値10・技能値0、攻撃と防御のダメージダイスおよび固定値は0である。

| 項目 | 値 |
| --- | --- |
| 公開版の表示 | `3.1` |
| 現行Damage expectedValue.kind | `lower-bound` |
| 現行Damage lower bound | `3.080808080565` |
| 現行通常表示 | `—` |
| Damage support | `infinite` |
| Damage overflow | `upper-bound`、`lowerBound = 0` |
| Damage overflow probability上限 | `4.44089209850063e-16` |
| Damage error bound | `2e-8` |

下限を小数1桁へ丸めると3.1になるが、現行の表示契約はlower-boundだけの値を一点の期待値として表示しない。そのため、公開版の3.1と同じ表示には、tailの未表現寄与を含む有限な上界が必要である。

## Score側で利用できる証明書

公開版fixtureのaction Scoreは、明示first momentが`6.011111111111`で、Score期待値certificateが`[6.011100861111112, 6.011121361111112]`を与える。Scoreのsupportは`infinite`であり、1023以上のexact overflowは確率がおよそ`8e-103`、certificateの数値error boundは`1e-8`である。reaction Scoreにも同じ形式のcertificateがある。

Damage側では、Score tailの位置不明確率上限が約`2.0000000444e-8`として保持される。これはScoreのtail確率だけでなく、Score tailと数値誤差をDamage座標へ安全に配置できない不確かさを含む。したがって、genericな`getCertifiedExpectedValue`はDamage supportが無限である限り、明示first momentをlower-boundとして返す。

## 有限上界の候補

safe sliceでは、Scoreを`S`、攻撃の固定値差を`v`、攻撃側の追加ダメージダイス数を`a`とすると、ゲーム内のダメージダイス数は

\[
N(S) = \left\lfloor \frac{S}{10} \right\rfloor + 1 + a
\]

となる。`kazanari = 0`の10面ダイス1個の期待値は5.5であり、`S \ge 0`なら`floor(S / 10) <= S / 10`である。また、命中確率は1を超えないため、reactionとのtailの結合を厳密に評価せず上側から包むと、次の候補上界が得られる。

\[
E[\mathrm{damage}]
\le v + 5.5\left(\frac{E[S]}{10} + 1 + a\right)
\]

Damage resultの明示first momentを下限、action Score期待値certificateのupper boundを式へ代入した値を上限候補とした。この上限はreaction tailを実際の命中条件へ割り当てず、命中確率を常に1とするため安全側だが、表示用にはかなり粗い。

## 測定結果

safe sliceに該当した4件は、いずれも現行Damage expected valueが`lower-bound`であり、研究用の有限上限候補だけを構成できた。

| fixture | Damage lower bound | 候補 upper bound | 区間幅 |
| --- | ---: | ---: | ---: |
| `public-v3-1-default` | 3.080808080565 | 8.806116748611 | 5.725308668046 |
| `one-damage-die` | 13.131483077864 | 16.879269064838 | 3.747785986974 |
| `several-damage-dice` | 55.627233077885 | 59.379269064838 | 3.752035986953 |
| `positive-fixed-difference` | 40.56952957621 | 49.664532179197 | 9.095002602987 |

公開版fixtureでは候補区間の丸め結果が一致せず、3.1を安全に表示できる精度には達しない。残りのfixtureは、`kazanari`、防御ダイス、固定値差、またはScore期待値certificateの条件がsafe sliceから外れるため、レポートの`candidateBound.status`を`insufficient-certificate`とした。

## 判断と次の段階

`finite-candidate-only`は、限定条件の下で有限値を推定する数式が得られたことを表す研究用ステータスであり、productionのDamage expected value certificateではない。Damage producerの公開契約へ接続するには、Score期待値だけでなく、damage-dice count、action/reactionの命中条件、tailの位置不確かさを同時に包む証明と専用metadataが必要である。

区間の中点、下限、published-bucketの診断値を一点の期待値へ変換することはしない。R23-Bではproduction変更を行わず、より狭い有限区間を導ける分割方法とcertificate契約の設計をR23-C候補として残す。
