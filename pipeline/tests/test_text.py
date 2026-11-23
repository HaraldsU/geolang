import json
from pathlib import Path

import pytest

from geolang.text import clean_native, clean_roman, fnv1a, fold, norm

VECTORS = json.loads((Path(__file__).parents[2] / "shared" / "text-vectors.json").read_text("utf-8"))["vectors"]


@pytest.mark.parametrize("v", VECTORS, ids=[v["input"] or "<empty>" for v in VECTORS])
def test_shared_vectors(v):
    n = norm(v["input"])
    assert n == v["norm"]
    assert fold(n) == v["fold"]
    assert fnv1a(n) == v["fnv1a"]
    assert fnv1a(n) % 1024 == v["bucket1024"]


def test_fnv1a_known_value():
    assert fnv1a("") == 0x811C9DC5
    assert fnv1a("hello") == 0x4F9F2CAB


def test_clean_native_strips_dictionary_marks():
    assert clean_native("приве́т", "ru", "Cyrl") == "привет"
    assert clean_native("ёлка", "ru", "Cyrl") == "ёлка"  # ё is a real letter
    assert clean_native("ѓубре", "mk", "Cyrl") == "ѓубре"  # acute on consonant is a real letter
    assert clean_native("здра̏во", "sr", "Cyrl") == "здраво"
    assert clean_native("zdrȁvo", "hr", "Latn") == "zdravo"
    assert clean_native("ćȃo", "hr", "Latn") == "ćao"  # ć keeps its acute
    assert clean_native("مَرْحَبًا", "ar", "Arab") == "مرحبا"
    assert clean_native("שָׁלוֹם", "he", "Hebr") == "שלום"
    assert clean_native("café", "fr", "Latn") == "café"


def test_clean_native_removes_markup():
    assert clean_native("<b>mot</b>", "fr", "Latn") == "mot"
    assert clean_native("[[Wort]]", "de", "Latn") == "Wort"
    out = clean_native("<img src=x onerror=alert(1)>", "es", "Latn")
    assert "<" not in out and ">" not in out


def test_clean_roman():
    assert clean_roman("privét", "Cyrl") == "privet"
    assert clean_roman("nǐ hǎo", "Hans") == "nǐ hǎo"
