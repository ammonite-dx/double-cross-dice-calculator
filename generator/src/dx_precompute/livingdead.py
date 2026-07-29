from __future__ import annotations

import numpy as np

from .constants import DISTRIBUTION_SIZE, LIVING_DEAD_DICE_COUNT
from .polynomials import (
    Distribution,
    round_normalized_probabilities,
)

_MAXIMUM_FACE = 10
_SUM_CAP = DISTRIBUTION_SIZE - 1 + _MAXIMUM_FACE - 1


def generate_livingdead_distributions() -> list[Distribution]:
    states = np.zeros(
        (_MAXIMUM_FACE + 1, _SUM_CAP + 1),
        dtype=np.float64,
    )
    states[0, 0] = 1.0

    result: list[Distribution] = []
    for dice in range(LIVING_DEAD_DICE_COUNT):
        distribution = np.zeros(DISTRIBUTION_SIZE, dtype=np.float64)
        if dice == 0:
            distribution[0] = 1.0
        else:
            for maximum in range(1, _MAXIMUM_FACE + 1):
                for total, probability in enumerate(states[maximum]):
                    if probability == 0.0:
                        continue
                    value = min(
                        DISTRIBUTION_SIZE - 1,
                        total - maximum + 1,
                    )
                    distribution[value] += probability
        result.append(round_normalized_probabilities(distribution))

        next_states = np.zeros_like(states)
        for maximum in range(_MAXIMUM_FACE + 1):
            state = states[maximum]
            for face in range(1, _MAXIMUM_FACE + 1):
                next_maximum = max(maximum, face)
                next_states[next_maximum, face:] += 0.1 * state[:-face]
                next_states[next_maximum, -1] += (
                    0.1 * float(state[-face:].sum())
                )
        states = next_states

    return result
