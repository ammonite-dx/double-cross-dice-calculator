<template>
    <v-card class="mb-4">
        <v-card-title><v-icon>mdi-account-details-outline</v-icon> 利用例</v-card-title>
        <v-divider class="mx-2" />
        <v-card-text class="pa-6 mx-2 text-md-body-1 text-caption">
            <v-row>
                <v-col md="6" cols="12" class="pa-0">
                    <v-list density="compact">
                        <v-subheader>PCデータの作成に</v-subheader>
                        <v-list-item><v-icon>mdi-chevron-right</v-icon>攻撃で与えられるダメージを見積もる</v-list-item>
                        <v-list-item><v-icon>mdi-chevron-right</v-icon>ダイスと技能、どちらを伸ばすか決める</v-list-item>
                    </v-list>
                </v-col>
                <v-col md="6" cols="12" class="pa-0">
                    <v-list density="compact">
                        <v-subheader>エネミーデータの作成に</v-subheader>
                        <v-list-item><v-icon>mdi-chevron-right</v-icon>PCの総ダメージからエネミーのHPを決める</v-list-item>
                        <v-list-item><v-icon>mdi-chevron-right</v-icon>PCのガード値からエネミーの攻撃力を決める</v-list-item>
                    </v-list>
                </v-col>
                <v-col md="6" cols="12" class="pa-0">
                    <v-list density="compact">
                        <v-subheader>セッション中の行動決定に</v-subheader>
                        <v-list-item><v-icon>mdi-chevron-right</v-icon>タイタス昇華の用途を決める</v-list-item>
                        <v-list-item><v-icon>mdi-chevron-right</v-icon>バックトラックのダイスの振り方を決める</v-list-item>
                    </v-list>
                </v-col>
                <v-col md="6" cols="12" class="pa-0">
                    <v-list density="compact">
                        <v-subheader>セッション後の振り返りに</v-subheader>
                        <v-list-item><v-icon>mdi-chevron-right</v-icon>良かった出目の発生確率を調べる</v-list-item>
                        <v-list-item><v-icon>mdi-chevron-right</v-icon>悪かった出目の発生確率を調べる</v-list-item>
                    </v-list>
                </v-col>
            </v-row>
        </v-card-text>
    </v-card>
</template>