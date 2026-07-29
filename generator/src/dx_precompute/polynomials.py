from __future__ import annotations

from collections.abc import Iterable

import numpy as np
from numpy.typing import NDArray

from .constants import DISTRIBUTION_SIZE, ROUND_DIGITS

Distribution = NDArray[np.float64]


def die_distribution(
    faces: Iterable[int],
    probability: float,
    *,
    size: int = DISTRIBUTION_SIZE,
) -> Distribution:
    distribution = np.zeros(size, dtype=np.float64)
    for face in faces:
        distribution[face] = probability
    return distribution


def convolution_powers(
    one_die: Distribution,
    count: int,
    *,
    size: int = DISTRIBUTION_SIZE,
) -> list[Distribution]:
    """Return truncated distributions for zero through ``count - 1`` dice."""
    powers = [np.zeros(size, dtype=np.float64) for _ in range(count)]
    powers[0][0] = 1.0

    nonzero = np.flatnonzero(one_die)
    weighted_faces = [(int(face), float(one_die[face])) for face in nonzero]
    for dice in range(1, count):
        previous = powers[dice - 1]
        current = powers[dice]
        for face, probability in weighted_faces:
            current[face:] += probability * previous[:-face]

    return powers


def add_shifted(
    target: Distribution,
    source: Distribution,
    shift: int,
    weight: float = 1.0,
) -> None:
    if shift >= target.size or weight == 0.0:
        return
    available = target.size - shift
    target[shift:] += weight * source[:available]


def subtract_shifted(
    target: Distribution,
    source: Distribution,
    shift: int,
    weight: float = 1.0,
) -> None:
    add_shifted(target, source, shift, -weight)


def round_probabilities(distribution: Distribution) -> Distribution:
    rounded = np.round(np.abs(distribution), ROUND_DIGITS)
    rounded[rounded == 0.0] = 0.0
    return rounded
