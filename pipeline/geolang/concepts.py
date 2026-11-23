"""Extract sense-level concepts from English Wiktionary translation tables (kaikki.org JSONL).

A concept is one (English headword, part of speech, sense) translation table. For every national
official language we pick the single best translation, clean it for display and attach a Latin
form (Wiktionary's own romanization, else an ICU fallback).
"""

from __future__ import annotations

import gzip
import hashlib
import io
import json
from collections import Counter, defaultdict
from collections.abc import Iterable, Iterator
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from . import romanize as rom
from .text import clean_native, clean_roman, strip_markup

# Tags that make a translation unsuitable as "the" word for a language.
BAD_TAGS = {
    "archaic", "obsolete", "dated", "slang", "vulgar", "offensive", "derogatory", "rare",
    "dialectal", "literary", "humorous", "euphemistic", "pejorative", "nonstandard",
    "historical", "poetic", "childish", "obscene", "proscribed", "uncommon", "internet",
    "abbreviation", "Internet", "error-unknown-tag",
}
# Capitalised tags that are about script/orthography rather than region.
SCRIPT_TAGS = {"Cyrillic", "Latin", "Roman", "Rumi", "Jawi", "Arabic", "Traditional-Chinese",
               "Simplified-Chinese", "Hiragana", "Katakana", "Hangul", "Hanja", "Devanagari"}


@dataclass(frozen=True)
class LangSpec:
    """How to find a national language inside Wiktionary translation tables."""

    codes: frozenset[str]
    names: frozenset[str] | None = None  # None -> canonical name discovered from the data
    require_tag: str | None = None
    han_part: str | None = None  # 'trad' | 'simp' for "繁 /简" pairs
    latin_partner: str | None = None  # take latin form from this language's pick (sr <- hr)


SPECIAL: dict[str, LangSpec] = {
    "zh": LangSpec(frozenset({"zh", "cmn"}), frozenset({"Chinese Mandarin", "Mandarin"}), han_part="simp"),
    "zh-Hant": LangSpec(frozenset({"zh", "cmn"}), frozenset({"Chinese Mandarin", "Mandarin"}), han_part="trad"),
    "yue": LangSpec(frozenset({"yue", "zh"}), frozenset({"Chinese Cantonese", "Cantonese"}), han_part="trad"),
    "hak": LangSpec(frozenset({"hak", "zh"}), frozenset({"Hakka Chinese", "Hakka"}), han_part="trad"),
    "nan": LangSpec(frozenset({"nan", "nan-hbl", "zh"}), frozenset({"Chinese", "Hokkien", "Min Nan"}),
                    require_tag="Hokkien", han_part="trad"),
    "sr": LangSpec(frozenset({"sh", "sr"}), frozenset({"Serbo-Croatian", "Serbian"}), latin_partner="hr"),
    "hr": LangSpec(frozenset({"sh", "hr"}), frozenset({"Serbo-Croatian", "Croatian"})),
    "bs": LangSpec(frozenset({"sh", "bs"}), frozenset({"Serbo-Croatian", "Bosnian"})),
    "fil": LangSpec(frozenset({"fil", "tl"}), frozenset({"Filipino", "Tagalog"})),
    "tzm": LangSpec(frozenset({"tzm", "zgh"}), frozenset({"Central Atlas Tamazight", "Standard Moroccan Tamazight"})),
}


def spec_for(code: str) -> LangSpec:
    return SPECIAL.get(code) or LangSpec(frozenset({code}))


@dataclass
class Candidate:
    word: str
    roman: str | None
    rank: tuple[int, int]


@dataclass
class Concept:
    id: str
    word: str
    pos: str
    gloss: str
    translations: dict[str, tuple[str, str | None]] = field(default_factory=dict)
    qid: str | None = None
    forms: tuple[str, ...] = ()  # English inflections (dogs, went) that also find this concept

    @property
    def weight(self) -> int:
        return len(self.translations)

    def to_json(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "w": self.word,
            "p": self.pos,
            "g": self.gloss,
            "t": {k: [n, latin] for k, (n, latin) in sorted(self.translations.items())},
        }
        if self.qid:
            out["q"] = self.qid
        return out


# --- reading ---------------------------------------------------------------------------------


def iter_entries(path: Path) -> Iterator[dict[str, Any]]:
    opener = gzip.open if path.suffix == ".gz" else open
    with opener(path, "rb") as raw:  # type: ignore[operator]
        for line in io.TextIOWrapper(raw, encoding="utf-8"):
            if '"translations"' not in line:
                continue
            entry = json.loads(line)
            if entry.get("lang_code") != "en":
                continue
            # Translation tables live either on the entry or (more often) on individual senses.
            translations = list(entry.get("translations") or [])
            for sense in entry.get("senses") or []:
                qids = sense.get("wikidata") or []
                qid = qids[0] if len(qids) == 1 else None
                for t in sense.get("translations") or []:
                    translations.append({**t, "_qid": qid} if qid else t)
            if translations:
                entry["translations"] = translations
                yield entry


def discover_canonical_names(entries: Iterable[dict[str, Any]], codes: set[str], sample: int = 30000) -> dict[str, str]:
    """Most common Wiktionary language name per code (e.g. 'de' -> 'German', not 'Bavarian German')."""
    counts: dict[str, Counter[str]] = defaultdict(Counter)
    for i, entry in enumerate(entries):
        if i >= sample:
            break
        for t in entry["translations"]:
            code = t.get("code") or t.get("lang_code")
            if code in codes and t.get("lang"):
                counts[code][t["lang"]] += 1
    return {code: c.most_common(1)[0][0] for code, c in counts.items()}


# --- selection -------------------------------------------------------------------------------


def _split_han(word: str, part: str | None) -> str:
    if part and "/" in word:
        pieces = [p.strip() for p in word.split("/") if p.strip()]
        if pieces:
            return pieces[0] if part == "trad" else pieces[-1]
    return word


def _rank(t: dict[str, Any], spec: LangSpec) -> tuple[int, int] | None:
    tags = set(t.get("tags", [])) | set(t.get("raw_tags", []))
    if tags & BAD_TAGS:
        return None
    if spec.require_tag and spec.require_tag not in tags:
        return None
    if not spec.require_tag and tags & {"Hokkien", "Dungan", "Hakka", "Cantonese", "Teochew"}:
        return None
    regional = any(tag[:1].isupper() and tag not in SCRIPT_TAGS and tag != spec.require_tag for tag in tags)
    qualified = bool(t.get("english") or t.get("note") or t.get("translation"))
    colloquial = bool(tags & {"colloquial", "informal"})
    return (2 * regional + qualified, int(colloquial))


def pick_translations(
    translations: list[dict[str, Any]],
    languages: dict[str, dict[str, Any]],
    canonical: dict[str, str],
) -> dict[str, tuple[str, str | None]]:
    """Best (native, latin) per official language for one translation table."""
    best: dict[str, Candidate] = {}
    for code, meta in languages.items():
        spec = spec_for(code)
        names = spec.names or ({canonical[code]} if code in canonical else set())
        script = meta["script"]
        chosen: Candidate | None = None
        for order, t in enumerate(translations):
            tcode = t.get("code") or t.get("lang_code")
            if tcode not in spec.codes or t.get("lang") not in names:
                continue
            word = strip_markup(t.get("word") or "")
            if not word or len(word) > 48 or any(ch.isdigit() or ch in "([" for ch in word):
                continue
            rank = _rank(t, spec)
            if rank is None:
                continue
            word = clean_native(_split_han(word, spec.han_part), code, script)
            if not word or not rom.matches_script(word, script):
                continue
            roman = t.get("roman")
            if roman and ", " in roman and not any(sep in word for sep in ",，、"):
                roman = roman.split(", ")[0]  # several readings listed: keep the first
            cand = Candidate(word, clean_roman(roman, script) if roman else None, (rank[0], rank[1] * 1000 + order))
            if chosen is None or cand.rank < chosen.rank:
                chosen = cand
        if chosen:
            best[code] = chosen

    out: dict[str, tuple[str, str | None]] = {}
    for code, cand in best.items():
        script = languages[code]["script"]
        if script == "Latn":
            out[code] = (cand.word, None)
            continue
        latin = cand.roman if cand.roman and rom.is_latin(cand.roman) else None
        partner = spec_for(code).latin_partner
        if latin is None and partner and partner in best:
            latin = best[partner].word
        if latin is None:
            latin = rom.romanize(cand.word, script)
        out[code] = (cand.word, latin)
    return out


def sense_qid(items: list[dict[str, Any]]) -> str | None:
    qids = {t["_qid"] for t in items if t.get("_qid")}
    return qids.pop() if len(qids) == 1 else None


def collect_qids(entries: Iterable[dict[str, Any]]) -> set[str]:
    return {t["_qid"] for e in entries for t in e["translations"] if t.get("_qid")}


INFLECTION_TAGS = {
    "plural", "singular", "past", "present", "participle", "third-person", "comparative",
    "superlative", "gerund", "progressive", "simple", "indicative", "first-person", "second-person",
}


def inflected_forms(entry: dict[str, Any]) -> tuple[str, ...]:
    head = entry.get("word", "")
    out: list[str] = []
    for f in entry.get("forms") or []:
        form = strip_markup(f.get("form") or "")
        tags = set(f.get("tags") or [])
        if form and form != head and tags and tags <= INFLECTION_TAGS and form not in out:
            out.append(form)
    return tuple(out)


def concept_id(key: str) -> str:
    return hashlib.sha1(key.encode("utf-8")).hexdigest()[:10]


def extract(
    entries: Iterable[dict[str, Any]],
    languages: dict[str, dict[str, Any]],
    canonical: dict[str, str],
    min_translations: int = 1,
    wikidata_labels: dict[str, dict[str, str]] | None = None,
) -> Iterator[Concept]:
    from .wikidata import translations_from_labels

    seen: Counter[str] = Counter()
    for entry in entries:
        head = strip_markup(entry.get("word", ""))
        pos = entry.get("pos", "")
        forms = inflected_forms(entry)
        groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for t in entry["translations"]:
            groups[strip_markup(t.get("sense") or "")].append(t)
        for sense, items in groups.items():
            if sense.lower().startswith("translations to be checked"):
                continue  # unverified tables
            picked = pick_translations(items, languages, canonical)
            qid = sense_qid(items)
            if qid and wikidata_labels and qid in wikidata_labels:
                for code, label_forms in translations_from_labels(wikidata_labels[qid], languages).items():
                    picked.setdefault(code, label_forms)  # Wiktionary always wins
            if len(picked) < min_translations:
                continue
            key = f"{head}|{pos}|{sense}"
            seen[key] += 1
            cid = concept_id(key if seen[key] == 1 else f"{key}#{seen[key]}")
            if "en" in languages:
                picked.setdefault("en", (head, None))
            yield Concept(cid, head, pos, sense, picked, qid, forms)
