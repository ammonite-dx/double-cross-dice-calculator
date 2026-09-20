<script setup lang="ts">
import { onUnmounted, reactive, ref, watch } from 'vue'
import type { DifficultyInput } from '@/domain/CalculationInputs'
import { createLatestValidationGate } from '@/shared/validation/LatestValidationGate'
import { createSafeIntegerRules } from '@/shared/validation/IntegerRules'

interface ValidatableForm {
  validate?: () => Promise<{ valid: boolean }>
}

const props = defineProps<{
  difficulty: DifficultyInput
}>()

const emit = defineEmits<{
  validated: [difficulty: DifficultyInput]
}>()

const form = ref<ValidatableForm | null>(null)
const currentDifficulty = reactive<DifficultyInput>({
  opposed: props.difficulty.opposed,
  target: props.difficulty.target,
})
const validationGate = createLatestValidationGate()
const targetRule = createSafeIntegerRules({
  requiredMessage: '難易度を入力して下さい。',
  integerMessage: '難易度は数値として下さい。',
  min: 0,
  minMessage: '難易度は0以上として下さい。',
})

watch(
  () => [props.difficulty.opposed, props.difficulty.target] as const,
  ([opposed, target]) => {
    validationGate.invalidate()
    currentDifficulty.opposed = opposed
    currentDifficulty.target = target
  },
)

watch(currentDifficulty, async () => {
  const ticket = validationGate.begin()
  const draft: DifficultyInput = { ...currentDifficulty }
  const validResult = await form.value?.validate?.()
  if (!validationGate.canCommit(ticket)) {
    return
  }
  if (validResult?.valid) {
    emit('validated', draft)
  }
})

onUnmounted(() => validationGate.dispose())
</script>

<template>
  <v-form ref="form" class="pa-1">
    <v-row dense class="pt-2 ma-0">
      <v-col md="4" cols="6" class="pb-2">
        <v-text-field
          v-if="currentDifficulty.opposed"
          label="難易度"
          model-value="対決"
          readonly
          variant="underlined"
          hide-details="auto"
          density="compact"
          class="text-md-body-1 text-caption pa-0"
        />
        <v-text-field
          v-else
          label="難易度"
          type="number"
          min="0"
          v-model.number="currentDifficulty.target"
          :rules="targetRule"
          variant="underlined"
          hide-details="auto"
          density="compact"
          class="text-md-body-1 text-caption pa-0"
        />
      </v-col>
      <v-col md="4" cols="6" class="pb-2">
        <v-switch
          color="#404040"
          v-model="currentDifficulty.opposed"
          label="対決判定"
          hide-details="auto"
          density="compact"
          class="pa-0 ma-0 text-md-body-1 text-caption"
        />
      </v-col>
    </v-row>
  </v-form>
</template>
