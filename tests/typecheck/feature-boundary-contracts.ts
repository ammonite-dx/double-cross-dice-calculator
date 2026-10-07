import type { App } from 'vue'

import {
  provideCalculationClient,
  useCalculationClient,
} from '../../src/plugins/calculationClient'
import type { CalculationClient } from '../../src/runtime/CalculationClientTypes'
import type { AttackController } from '../../src/features/attack/model/AttackControllerTypes'
import type { CheckController } from '../../src/features/check/model/CheckControllerTypes'
import type { BacktrackController } from '../../src/features/backtrack/model/BacktrackControllerTypes'

declare const app: App
declare const client: CalculationClient

provideCalculationClient(app, client)
const injectedClient: CalculationClient = useCalculationClient()
void injectedClient

const incompleteClient = {
  calculateCheck: () => Promise.reject(new Error('test double')),
}
// @ts-expect-error: a partial client must not cross the typed provider boundary.
provideCalculationClient(app, incompleteClient)

declare const checkController: CheckController
checkController.onAdvancedSettingsChanged({
  side: 'action',
  enabled: false,
})
checkController.onAdvancedSettingsChanged({
  // @ts-expect-error: Check handlers accept only the two declared score sides.
  side: 'unknown',
  enabled: false,
})

declare const attackController: AttackController
attackController.onComboSideValidationState({
  id: 'action',
  side: 'action',
  state: { status: 'valid', value: attackController.combos.value[0]!.params.action },
})
// @ts-expect-error: the public combo projection must not expose internal data.
attackController.combos.value[0]!.data
// @ts-expect-error: Attack side validation keeps the side and snapshot shapes aligned.
attackController.onComboSideValidationState({
  id: 'mismatch',
  side: 'action',
  state: { status: 'valid', value: attackController.combos.value[0]!.params.reaction },
})

declare const backtrackController: BacktrackController
backtrackController.onValidationState({
  status: 'valid',
  value: { encroachment: 100 },
})
if (backtrackController.presentation.value) {
  const probability: number =
    backtrackController.presentation.value.charts.single.probabilities[0]!
  const label: string =
    backtrackController.presentation.value.charts.single.labels[0]!
  void probability
  void label
}
backtrackController.onValidationState({
  status: 'valid',
  // @ts-expect-error: Backtrack handlers accept only BacktrackParams fields.
  value: { unsupported: true },
})
