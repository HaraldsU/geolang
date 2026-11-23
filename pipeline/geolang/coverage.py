"""Coverage report: how many common English words resolve, and how well each language is covered."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from .paths import PIPELINE_DIR
from .text import bucket, fold, norm

DEFAULT_WORDS = PIPELINE_DIR / "wordlists" / "top-1000-en.txt"

MIN_RESOLVED = 0.95
# Minimum share of resolved common words that must have a translation in these languages.
MAJOR_LANGUAGE_MIN = {
    "es": 0.85, "fr": 0.85, "de": 0.85, "pt": 0.8, "ru": 0.85, "zh": 0.8,
    "ja": 0.75, "ar": 0.75, "hi": 0.6, "en": 0.99,
}
MIN_COUNTRY_SHARE = 0.9  # share of countries showing something for the median common word


def read_words(path: Path) -> list[str]:
    return [w.strip() for w in path.read_text("utf-8").splitlines() if w.strip() and not w.startswith("#")]


def report(data_dir: Path, words_file: Path) -> dict[str, Any]:
    manifest = json.loads((data_dir / "manifest.json").read_text("utf-8"))
    countries = json.loads((data_dir / "countries.json").read_text("utf-8"))
    vdir = data_dir / manifest["version"]

    @lru_cache(maxsize=None)
    def shard(kind: str, n: int) -> dict[str, Any]:
        return json.loads((vdir / kind / f"{n}.json").read_text("utf-8"))

    def search(word: str) -> list[Any]:
        key = norm(word)
        for k in dict.fromkeys((key, fold(key))):
            refs = shard("index", bucket(k, manifest["indexShards"])).get(k)
            if refs:
                return refs
        return []

    words = read_words(words_file)
    per_lang: dict[str, int] = {}
    country_shares: list[float] = []
    unresolved: list[str] = []
    for w in words:
        refs = search(w)
        if not refs:
            unresolved.append(w)
            continue
        cid = refs[0][0]
        concept = shard("concepts", bucket(cid, manifest["conceptShards"]))[cid]
        langs = set(concept["t"])
        for lang in langs:
            per_lang[lang] = per_lang.get(lang, 0) + 1
        with_lang = [c for c in countries.values() if c["languages"]]
        shown = sum(1 for c in with_lang if langs & set(c["languages"]))
        country_shares.append(shown / len(with_lang))

    resolved = len(words) - len(unresolved)
    country_shares.sort()
    return {
        "version": manifest["version"],
        "words": len(words),
        "resolved": resolved,
        "resolvedShare": resolved / len(words) if words else 0,
        "unresolved": unresolved,
        "languageShare": {k: v / resolved for k, v in sorted(per_lang.items())} if resolved else {},
        "medianCountryShare": country_shares[len(country_shares) // 2] if country_shares else 0,
    }


def check(rep: dict[str, Any]) -> list[str]:
    problems = []
    if rep["resolvedShare"] < MIN_RESOLVED:
        problems.append(f"only {rep['resolvedShare']:.1%} of common words resolve (min {MIN_RESOLVED:.0%})")
    for lang, minimum in MAJOR_LANGUAGE_MIN.items():
        share = rep["languageShare"].get(lang, 0)
        if share < minimum:
            problems.append(f"{lang}: {share:.1%} coverage (min {minimum:.0%})")
    if rep["medianCountryShare"] < MIN_COUNTRY_SHARE:
        problems.append(f"median word shown in only {rep['medianCountryShare']:.1%} of countries")
    return problems


def summary(rep: dict[str, Any]) -> str:
    shares = rep["languageShare"]
    worst = sorted(shares.items(), key=lambda kv: kv[1])[:8]
    major = ", ".join(f"{k} {shares.get(k, 0):.0%}" for k in MAJOR_LANGUAGE_MIN)
    return (
        f"{rep['resolved']}/{rep['words']} common words resolve ({rep['resolvedShare']:.1%}); "
        f"median word shown in {rep['medianCountryShare']:.0%} of countries\n"
        f"major languages: {major}\n"
        f"least covered: {', '.join(f'{k} {v:.0%}' for k, v in worst)}\n"
        f"unresolved sample: {', '.join(rep['unresolved'][:15])}"
    )
