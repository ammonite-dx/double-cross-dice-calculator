from __future__ import annotations

from math import comb

import numpy as np

from .constants import (
    DISTRIBUTION_SIZE,
    DX_CRITICAL_VALUES,
    DX_DICE_COUNT,
    ROUND_DIGITS,
)
from .polynomials import Distribution, add_shifted


def _binomial_tail(dice: int, required: int, probability: float) -> float:
    return sum(
        comb(dice, successes)
        * probability**successes
        * (1.0 - probability) ** (dice - successes)
        for successes in range(required, dice + 1)
    )


def _order_statistic_distribution(
    dice: int,
    rank_from_largest: int,
    critical: int,
) -> Distribution:
    """Terminal roll result before the next critical roll."""
    result = np.zeros(DISTRIBUTION_SIZE, dtype=np.float64)
    for face in range(1, critical):
        at_least_face = _binomial_tail(
            dice,
            rank_from_largest,
            (11 - face) / 10,
        )
        above_face = _binomial_tail(
            dice,
            rank_from_largest,
            (10 - face) / 10,
        )
        result[face] = at_least_face - above_face
    return result


def _round_normalized(distribution: Distribution) -> Distribution:
    rounded = np.round(np.abs(distribution), ROUND_DIGITS)
    unit = 10.0**-ROUND_DIGITS

    while abs(float(rounded.sum()) - 1.0) > unit / 2:
        errors = rounded - distribution
        if rounded.sum() > 1.0:
            index = int(np.argmax(errors))
            rounded[index] -= unit
        else:
            index = int(np.argmin(errors))
            rounded[index] += unit

    rounded[rounded == 0.0] = 0.0
    return rounded


def generate_shihai_distributions(shihai: int) -> list[list[Distribution]]:
    """Generate one ``dx/shihai-N.json`` shard."""
    rank = shihai + 1
    result = [
        [np.zeros(DISTRIBUTION_SIZE, dtype=np.float64) for _ in DX_CRITICAL_VALUES]
        for _ in range(DX_DICE_COUNT)
    ]

    for critical_index, critical in enumerate(DX_CRITICAL_VALUES):
        critical_probability = (11 - critical) / 10

        for dice in range(DX_DICE_COUNT):
            if dice <= shihai:
                result[dice][critical_index][0] = 1.0
                continue

            stage = _order_statistic_distribution(dice, rank, critical)
            for critical_dice in range(shihai + 1, dice):
                transition_probability = (
                    comb(dice, critical_dice)
                    * critical_probability**critical_dice
                    * (1.0 - critical_probability) ** (dice - critical_dice)
                )
                add_shifted(
                    stage,
                    result[critical_dice][critical_index],
                    10,
                    transition_probability,
                )

            all_critical_probability = critical_probability**dice
            distribution = np.zeros(DISTRIBUTION_SIZE, dtype=np.float64)
            repetition_probability = 1.0
            shift = 0
            while shift < DISTRIBUTION_SIZE:
                add_shifted(
                    distribution,
                    stage,
                    shift,
                    repetition_probability,
                )
                repetition_probability *= all_critical_probability
                shift += 10

            distribution[-1] = 1.0 - float(distribution[:-1].sum())
            result[dice][critical_index] = distribution

    return [
        [_round_normalized(distribution) for distribution in critical_entries]
        for critical_entries in result
    ]
