from __future__ import annotations

from math import comb

import numpy as np

from .constants import DISTRIBUTION_SIZE, LIVING_DEAD_DICE_COUNT
from .polynomials import (
    Distribution,
    add_shifted,
    convolution_powers,
    die_distribution,
    round_probabilities,
)


def generate_livingdead_distributions() -> list[Distribution]:
    lower_face_powers = {
        maximum: convolution_powers(
            die_distribution(range(1, maximum), 0.1),
            LIVING_DEAD_DICE_COUNT,
        )
        for maximum in range(1, 11)
    }

    result: list[Distribution] = []
    for dice in range(LIVING_DEAD_DICE_COUNT):
        distribution = np.zeros(DISTRIBUTION_SIZE, dtype=np.float64)
        if dice == 0:
            distribution[0] = 1.0
        else:
            for maximum in range(1, 11):
                powers = lower_face_powers[maximum]
                for maximum_count in range(1, dice + 1):
                    lower_count = dice - maximum_count
                    weight = comb(dice, maximum_count) * 0.1**maximum_count
                    shift = maximum * (maximum_count - 1) + 1
                    add_shifted(
                        distribution,
                        powers[lower_count],
                        shift,
                        weight,
                    )
        result.append(round_probabilities(distribution))

    return result
