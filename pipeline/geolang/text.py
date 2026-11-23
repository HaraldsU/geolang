"""Text helpers shared by the pipeline. `norm`, `fold` and `fnv1a` MUST stay in sync with
web/src/lib/data/text.ts (verified by the shared vectors in tests/vectors/text.json)."""

from __future__ import annotations

import re
import unicodedata

_WS = re.compile(r"\s+")
_EDGE_PUNCT = re.compile(r"^[\s!?¿¡.,;:'\"«»“”„()\[\]-]+|[\s!?¿¡.,;:'\"«»“”„()\[\]-]+$")
_LATIN_DIACRITICS = re.compile("[̀-ͯ]")


def norm(s: str) -> str:
    """Lookup key: NFC, lower-case, collapse whitespace, trim surrounding punctuation."""
    s = unicodedata.normalize("NFC", s).lower()
    s = _WS.sub(" ", s)
    return _EDGE_PUNCT.sub("", s)


def fold(s: str) -> str:
    """Accent-insensitive variant of an already normalised key (Latin/Greek/Cyrillic marks only)."""
    d = unicodedata.normalize("NFD", s)
    return unicodedata.normalize("NFC", _LATIN_DIACRITICS.sub("", d))


def fnv1a(s: str) -> int:
    """32-bit FNV-1a over UTF-8 bytes."""
    h = 0x811C9DC5
    for b in s.encode("utf-8"):
        h ^= b
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h


def bucket(key: str, n: int) -> int:
    return fnv1a(key) % n


# --- display clean-up ------------------------------------------------------------------------

_CYRILLIC_VOWELS = set("аеиоуыэюяіїєѣѵАЕИОУЫЭЮЯІЇЄѢѴ")
_LATIN_VOWELS = set("aeiouAEIOU")
_STRESS_MARKS = {"̀", "́"}
# Serbo-Croatian tone marks: grave, acute, macron, double grave, inverted breve, (tilde)
_SH_TONE_MARKS = {"̀", "́", "̄", "̏", "̑", "̃"}
_ARABIC_HARAKAT = re.compile("[ً-ٰٟۖ-ۭ]")
_HEBREW_POINTS = re.compile("[֑-ׇֽֿׁׂׅׄ]")
_MARKUP = re.compile(r"<[^>]*>|\[\[|\]\]|\{\{|\}\}|'''|''")


def _strip_marks_after(s: str, marks: set[str], bases: set[str]) -> str:
    d = unicodedata.normalize("NFD", s)
    out: list[str] = []
    base = ""
    for ch in d:
        if unicodedata.combining(ch):
            if ch in marks and base in bases:
                continue
        else:
            base = ch
        out.append(ch)
    return unicodedata.normalize("NFC", "".join(out))


def strip_markup(s: str) -> str:
    s = _MARKUP.sub("", s).replace("<", "").replace(">", "")
    return _WS.sub(" ", s).strip()


def clean_native(word: str, lang: str, script: str) -> str:
    """Remove dictionary-only marks (stress, vowel points, tones) that normal text does not use."""
    s = strip_markup(word)
    if script == "Cyrl":
        bases = _CYRILLIC_VOWELS | ({"р", "Р"} if lang == "sr" else set())
        marks = _SH_TONE_MARKS if lang == "sr" else _STRESS_MARKS
        s = _strip_marks_after(s, marks, bases)
    elif lang in {"hr", "bs"}:
        s = _strip_marks_after(s, _SH_TONE_MARKS, _LATIN_VOWELS | {"r", "R"})
    elif script == "Arab":
        s = _ARABIC_HARAKAT.sub("", s)
    elif script == "Hebr":
        s = _HEBREW_POINTS.sub("", s)
    return unicodedata.normalize("NFC", s)


def clean_roman(roman: str, script: str) -> str:
    s = strip_markup(roman)
    if script == "Cyrl":  # stress accents in transliterations of Russian etc.
        s = _strip_marks_after(s, _STRESS_MARKS, _LATIN_VOWELS | set("yY"))
    return s
