from pathlib import Path

import pytest

from dx_precompute.assets import (
    compare_assets,
    default_output_directory,
    default_reference_directory,
    generate_assets,
)

REFERENCE_DIRECTORY = (
    Path(__file__).resolve().parents[2]
    / "public"
    / "data"
    / "schema-v1"
    / "revision-1"
)


@pytest.mark.parametrize("dataset", ["d10", "livingdead"])
def test_lightweight_generated_assets_match_current_assets(dataset: str) -> None:
    assets = generate_assets([dataset])

    assert compare_assets(assets, REFERENCE_DIRECTORY) == []


def test_default_generation_does_not_overwrite_published_assets() -> None:
    assert "generated-data" in default_output_directory().parts
    assert "public" in default_reference_directory().parts
    assert default_output_directory() != default_reference_directory()
