from __future__ import annotations

import hashlib
import json
from collections.abc import Iterable
from pathlib import Path
from typing import Any

import numpy as np

from .constants import (
    D10_DICE_COUNT,
    DATA_REVISION,
    DATASET_DISTRIBUTION_SIZES,
    KAZANARI_VALUES,
    LIVING_DEAD_DICE_COUNT,
    PROBABILITY_TOLERANCE,
    SCHEMA_VERSION,
    SHIHAI_VALUES,
)
from .d10 import generate_d10_distributions
from .dr import generate_kazanari_distributions
from .dx import generate_shihai_distributions
from .livingdead import generate_livingdead_distributions
from .polynomials import Distribution

ALL_DATASETS = ("dx", "dr", "d10", "livingdead")


def default_output_directory() -> Path:
    repository_root = Path(__file__).resolve().parents[3]
    return (
        repository_root
        / "generated-data"
        / f"schema-v{SCHEMA_VERSION}"
        / f"revision-{DATA_REVISION}"
    )


def default_reference_directory() -> Path:
    repository_root = Path(__file__).resolve().parents[3]
    return (
        repository_root
        / "public"
        / "data"
        / f"schema-v{SCHEMA_VERSION}"
        / f"revision-{DATA_REVISION}"
    )


def _validate_distribution(
    distribution: Distribution,
    context: str,
    size: int,
) -> None:
    if distribution.shape != (size,):
        raise ValueError(f"{context}: expected {size} values")
    if not np.all(np.isfinite(distribution)):
        raise ValueError(f"{context}: contains a non-finite probability")
    if np.any(distribution < 0) or np.any(distribution > 1):
        raise ValueError(f"{context}: contains a probability outside [0, 1]")

    total = float(distribution.sum())
    if abs(total - 1.0) >= PROBABILITY_TOLERANCE:
        raise ValueError(f"{context}: probability total is {total}")


def _to_sparse(
    distribution: Distribution,
    context: str,
    size: int,
) -> dict[str, Any]:
    _validate_distribution(distribution, context, size)
    nonzero = np.flatnonzero(distribution)
    if nonzero.size == 0:
        raise ValueError(f"{context}: distribution contains only zeroes")
    first = int(nonzero[0])
    last = int(nonzero[-1])
    return {
        "offset": first,
        "values": [
            int(value) if value.is_integer() else float(value)
            for value in distribution[first : last + 1]
        ],
    }


def _asset(
    dataset: str,
    shard: dict[str, int],
    index: dict[str, dict[str, int]],
    distributions: Any,
) -> dict[str, Any]:
    return {
        "schemaVersion": SCHEMA_VERSION,
        "dataRevision": DATA_REVISION,
        "dataset": dataset,
        "distributionSize": DATASET_DISTRIBUTION_SIZES[dataset],
        "shard": shard,
        "index": index,
        "distributions": distributions,
    }


def generate_assets(
    datasets: Iterable[str] = ALL_DATASETS,
    *,
    shihai_values: Iterable[int] = SHIHAI_VALUES,
    kazanari_values: Iterable[int] = KAZANARI_VALUES,
) -> dict[str, dict[str, Any]]:
    selected = tuple(dict.fromkeys(datasets))
    unknown = set(selected) - set(ALL_DATASETS)
    if unknown:
        raise ValueError(f"unknown datasets: {', '.join(sorted(unknown))}")

    assets: dict[str, dict[str, Any]] = {}
    if "dx" in selected:
        for shihai in shihai_values:
            generated = generate_shihai_distributions(shihai)
            distributions = [
                [
                    _to_sparse(
                        distribution,
                        f"dx[{shihai}][{dice}][{critical + 2}]",
                        DATASET_DISTRIBUTION_SIZES["dx"],
                    )
                    for critical, distribution in enumerate(critical_entries)
                ]
                for dice, critical_entries in enumerate(generated)
            ]
            assets[f"dx/shihai-{shihai}.json"] = _asset(
                "dx",
                {"shihai": shihai},
                {
                    "dice": {"start": 0, "count": len(generated)},
                    "critical": {"start": 2, "count": 10},
                },
                distributions,
            )

    if "dr" in selected:
        for kazanari in kazanari_values:
            generated = generate_kazanari_distributions(kazanari)
            distributions = [
                _to_sparse(
                    distribution,
                    f"dr[{kazanari}][{dice}]",
                    DATASET_DISTRIBUTION_SIZES["dr"],
                )
                for dice, distribution in enumerate(generated)
            ]
            assets[f"dr/kazanari-{kazanari}.json"] = _asset(
                "dr",
                {"kazanari": kazanari},
                {"dice": {"start": 0, "count": 203}},
                distributions,
            )

    if "d10" in selected:
        generated = generate_d10_distributions()
        assets["d10.json"] = _asset(
            "d10",
            {},
            {"dice": {"start": 0, "count": D10_DICE_COUNT}},
            [
                _to_sparse(
                    distribution,
                    f"d10[{dice}]",
                    DATASET_DISTRIBUTION_SIZES["d10"],
                )
                for dice, distribution in enumerate(generated)
            ],
        )

    if "livingdead" in selected:
        generated = generate_livingdead_distributions()
        assets["livingdead.json"] = _asset(
            "livingdead",
            {},
            {
                "dice": {
                    "start": 0,
                    "count": LIVING_DEAD_DICE_COUNT,
                }
            },
            [
                _to_sparse(
                    distribution,
                    f"livingdead[{dice}]",
                    DATASET_DISTRIBUTION_SIZES["livingdead"],
                )
                for dice, distribution in enumerate(generated)
            ],
        )

    return assets


def serialize_asset(asset: dict[str, Any]) -> bytes:
    return (
        json.dumps(
            asset,
            ensure_ascii=False,
            allow_nan=False,
            separators=(",", ":"),
        )
        + "\n"
    ).encode()


def write_assets(
    assets: dict[str, dict[str, Any]],
    output_directory: Path,
    *,
    write_manifest: bool,
) -> None:
    output_directory.mkdir(parents=True, exist_ok=True)
    serialized: dict[str, bytes] = {}

    for filename, asset in assets.items():
        content = serialize_asset(asset)
        output_path = (output_directory / filename).resolve()
        if output_directory.resolve() not in output_path.parents:
            raise ValueError(f"refusing to write outside output directory: {filename}")
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(content)
        serialized[filename] = content

    if write_manifest:
        manifest = {
            "schemaVersion": SCHEMA_VERSION,
            "dataRevision": DATA_REVISION,
            "distributionSizes": DATASET_DISTRIBUTION_SIZES,
            "files": {
                filename: {
                    "bytes": len(content),
                    "sha256": hashlib.sha256(content).hexdigest(),
                }
                for filename, content in sorted(serialized.items())
            },
        }
        (output_directory / "manifest.json").write_bytes(serialize_asset(manifest))


def _collect_sparse(asset: dict[str, Any]) -> list[dict[str, Any]]:
    distributions: list[dict[str, Any]] = []

    def visit(value: Any) -> None:
        if isinstance(value, dict) and set(value) == {"offset", "values"}:
            distributions.append(value)
        elif isinstance(value, list):
            for item in value:
                visit(item)

    visit(asset["distributions"])
    return distributions


def _expand_sparse(
    distribution: dict[str, Any],
    size: int,
) -> Distribution:
    expanded = np.zeros(size, dtype=np.float64)
    offset = int(distribution["offset"])
    values = np.asarray(distribution["values"], dtype=np.float64)
    expanded[offset : offset + values.size] = values
    return expanded


def compare_assets(
    assets: dict[str, dict[str, Any]],
    reference_directory: Path,
    *,
    tolerance: float = 1e-6,
) -> list[str]:
    issues: list[str] = []
    for filename, generated in assets.items():
        reference_path = reference_directory / filename
        if not reference_path.exists():
            issues.append(f"{filename}: reference file is missing")
            continue

        reference = json.loads(reference_path.read_text(encoding="utf-8"))
        if generated["dataset"] != reference.get("dataset"):
            issues.append(f"{filename}: dataset metadata differs")
            continue
        if generated["distributionSize"] != reference.get("distributionSize"):
            issues.append(f"{filename}: distribution size differs")
            continue

        distribution_size = generated["distributionSize"]

        actual_distributions = _collect_sparse(generated)
        expected_distributions = _collect_sparse(reference)
        if len(actual_distributions) != len(expected_distributions):
            issues.append(
                f"{filename}: distribution count differs "
                f"({len(actual_distributions)} != {len(expected_distributions)})"
            )
            continue

        difference = max(
            (
                float(
                    np.max(
                        np.abs(
                            _expand_sparse(actual, distribution_size)
                            - _expand_sparse(expected, distribution_size)
                        ),
                        initial=0,
                    )
                )
                for actual, expected in zip(
                    actual_distributions,
                    expected_distributions,
                    strict=True,
                )
            ),
            default=0,
        )
        if difference > tolerance + 1e-12:
            issues.append(
                f"{filename}: maximum probability difference is {difference:g}"
            )

    return issues
