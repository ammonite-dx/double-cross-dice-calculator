from __future__ import annotations

from .constants import D10_DICE_COUNT
from .polynomials import (
    Distribution,
    convolution_powers,
    die_distribution,
    round_normalized_probabilities,
)


def generate_d10_distributions() -> list[Distribution]:
    one_die = die_distribution(range(1, 11), 0.1)
    return [
        round_normalized_probabilities(distribution)
        for distribution in convolution_powers(
            one_die,
            D10_DICE_COUNT,
            aggregate_overflow=True,
        )
    ]
