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
    aggregate_overflow: bool = False,
) -> list[Distribution]:
    """Return distributions for zero through ``count - 1`` dice."""
    powers = [np.zeros(size, dtype=np.float64) for _ in range(count)]
    powers[0][0] = 1.0

    nonzero = np.flatnonzero(one_die)
    weighted_faces = [(int(face), float(one_die[face])) for face in nonzero]
    for dice in range(1, count):
        previous = powers[dice - 1]
        current = powers[dice]
        for face, probability in weighted_faces:
            current[face:] += probability * previous[:-face]
            if aggregate_overflow:
                current[-1] += probability * float(previous[-face:].sum())

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


def aggregate_overflow(
    distribution: Distribution,
    size: int = DISTRIBUTION_SIZE,
) -> Distribution:
    """Aggregate values at or above the final index into one bucket."""
    if distribution.size < size:
        raise ValueError(
            f"cannot aggregate {distribution.size} values into {size} buckets"
        )

    aggregated = np.zeros(size, dtype=np.float64)
    aggregated[:-1] = distribution[: size - 1]
    aggregated[-1] = float(distribution[size - 1 :].sum())
    return aggregated


def round_probabilities(distribution: Distribution) -> Distribution:
    rounded = np.round(np.abs(distribution), ROUND_DIGITS)
    rounded[rounded == 0.0] = 0.0
    return rounded


def round_normalized_probabilities(
    distribution: Distribution,
) -> Distribution:
    rounded = round_probabilities(distribution)
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
