import json
from pathlib import Path

import numpy as np
import pytest

from dx_precompute.assets import (
    _expand_sparse,
    default_output_directory,
    default_reference_directory,
    generate_assets,
)

REFERENCE_DIRECTORY = (
    Path(__file__).resolve().parents[2]
    / "public"
    / "data"
    / "schema-v2"
    / "revision-1"
)


@pytest.mark.parametrize("dataset", ["d10", "livingdead"])
def test_lightweight_generated_assets_match_current_assets(dataset: str) -> None:
    generated = generate_assets([dataset])[f"{dataset}.json"]
    reference = json.loads(
        (REFERENCE_DIRECTORY / f"{dataset}.json").read_text(encoding="utf-8")
    )

    assert len(generated["distributions"]) == len(reference["distributions"])
    for actual, expected in zip(
        generated["distributions"],
        reference["distributions"],
        strict=True,
    ):
        np.testing.assert_allclose(
            _expand_sparse(actual, generated["distributionSize"]),
            _expand_sparse(expected, reference["distributionSize"]),
            atol=1e-6 + 1e-12,
            rtol=0,
        )


def test_default_generation_does_not_overwrite_published_assets() -> None:
    assert "generated-data" in default_output_directory().parts
    assert "public" in default_reference_directory().parts
    assert "schema-v2" in default_output_directory().parts
    assert "schema-v2" in default_reference_directory().parts
    assert "revision-1" in default_output_directory().parts
    assert "revision-1" in default_reference_directory().parts
    assert default_output_directory() != default_reference_directory()
