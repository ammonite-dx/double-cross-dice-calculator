<script setup>
    import { mdiAccountDetailsOutline,mdiChevronRight } from '@mdi/js'
</script>

<template>
    <v-card class="ma-0">
        <v-card-title><v-icon :icon="mdiAccountDetailsOutline"/> 利用例</v-card-title>
        <v-divider class="mx-2" />
        <v-card-text class="pa-6 ma-0 text-md-body-1 text-caption">
            <v-row>
                <v-col md="6" cols="12" class="pa-0">
                    <v-list density="compact">
                        <v-list-subheader>PCデータの作成に</v-list-subheader>
                        <v-list-item><v-icon :icon="mdiChevronRight"/>攻撃で与えられるダメージを見積もる</v-list-item>
                        <v-list-item><v-icon :icon="mdiChevronRight"/>ダイスと技能、どちらを伸ばすか決める</v-list-item>
                    </v-list>
                </v-col>
                <v-col md="6" cols="12" class="pa-0">
                    <v-list density="compact">
                        <v-list-subheader>エネミーデータの作成に</v-list-subheader>
                        <v-list-item><v-icon :icon="mdiChevronRight"/>PCの総ダメージからエネミーのHPを決める</v-list-item>
                        <v-list-item><v-icon :icon="mdiChevronRight"/>PCのガード値からエネミーの攻撃力を決める</v-list-item>
                    </v-list>
                </v-col>
                <v-col md="6" cols="12" class="pa-0">
                    <v-list density="compact">
                        <v-list-subheader>セッション中の行動決定に</v-list-subheader>
                        <v-list-item><v-icon :icon="mdiChevronRight"/>タイタス昇華の用途を決める</v-list-item>
                        <v-list-item><v-icon :icon="mdiChevronRight"/>バックトラックのダイスの振り方を決める</v-list-item>
                    </v-list>
                </v-col>
                <v-col md="6" cols="12" class="pa-0">
                    <v-list density="compact">
                        <v-list-subheader>セッション後の振り返りに</v-list-subheader>
                        <v-list-item><v-icon :icon="mdiChevronRight"/>良かった出目の発生確率を調べる</v-list-item>
                        <v-list-item><v-icon :icon="mdiChevronRight"/>悪かった出目の発生確率を調べる</v-list-item>
                    </v-list>
                </v-col>
            </v-row>
        </v-card-text>
    </v-card>
</template>