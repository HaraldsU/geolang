import json

import pytest

from geolang import coverage
from geolang.paths import DATA_OUT


def test_check_flags_regressions():
    good = {
        "resolvedShare": 0.99,
        "languageShare": {k: 1.0 for k in coverage.MAJOR_LANGUAGE_MIN},
        "medianCountryShare": 0.97,
    }
    assert coverage.check(good) == []
    bad = {**good, "resolvedShare": 0.5, "languageShare": {**good["languageShare"], "fr": 0.1}}
    problems = coverage.check(bad)
    assert any("resolve" in p for p in problems)
    assert any(p.startswith("fr:") for p in problems)


def test_wordlist_has_1000_words():
    words = coverage.read_words(coverage.DEFAULT_WORDS)
    assert len(words) == 1000
    assert words[:3] == ["the", "of", "and"]


def _real_data_built() -> bool:
    m = DATA_OUT / "manifest.json"
    return m.exists() and json.loads(m.read_text())["concepts"] > 100_000


@pytest.mark.skipif(not _real_data_built(), reason="full dataset not built (python -m geolang translations)")
def test_full_dataset_coverage():
    rep = coverage.report(DATA_OUT, coverage.DEFAULT_WORDS)
    assert coverage.check(rep) == [], coverage.summary(rep)


@pytest.mark.skipif(not _real_data_built(), reason="full dataset not built")
def test_full_dataset_within_hosting_limits():
    m = json.loads((DATA_OUT / "manifest.json").read_text())
    files = list((DATA_OUT / m["version"]).rglob("*.json"))
    assert len(files) == m["indexShards"] + m["conceptShards"]
    assert len(files) < 19_000  # Cloudflare Pages: 20,000 files per deployment (leave room for the app)
    assert max(f.stat().st_size for f in files) < 25 * 1024 * 1024  # 25 MiB per file
