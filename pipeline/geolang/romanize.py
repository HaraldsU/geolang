"""Romanization fallback for translations Wiktionary gives without a `roman` field."""

from __future__ import annotations

import unicodedata
from functools import lru_cache

# Scripts whose ICU romanization is wrong for the language (kanji would come out as pinyin).
_NO_FALLBACK = {"Jpan"}


@lru_cache(maxsize=1)
def _icu():
    import icu  # PyICU

    return icu.Transliterator.createInstance("Any-Latin; NFC")


def script_of(ch: str) -> str:
    import icu

    return icu.Script.getScript(ord(ch)).getShortName()


# Which ICU script codes are acceptable for a language script from CLDR.
SCRIPT_FAMILY = {
    "Hans": {"Hani"},
    "Hant": {"Hani"},
    "Jpan": {"Hani", "Hira", "Kana"},
    "Kore": {"Hang", "Hani"},
}


def dominant_scripts(text: str) -> set[str]:
    scripts: dict[str, int] = {}
    for ch in text:
        if unicodedata.category(ch)[0] != "L":
            continue
        sc = script_of(ch)
        if sc in {"Zyyy", "Zinh"}:
            continue
        scripts[sc] = scripts.get(sc, 0) + 1
    return set(scripts)


def matches_script(text: str, script: str) -> bool:
    """True if every letter of text is in the expected script (family)."""
    found = dominant_scripts(text)
    if not found:
        return False
    allowed = SCRIPT_FAMILY.get(script, {script})
    return found <= allowed


def is_latin(text: str) -> bool:
    return matches_script(text, "Latn")


def romanize(text: str, script: str) -> str | None:
    if script == "Latn":
        return text
    if script in _NO_FALLBACK and "Hani" in dominant_scripts(text):
        return None
    out = _icu().transliterate(text)
    return out if is_latin(out) else None
