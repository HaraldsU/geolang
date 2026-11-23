import json
from pathlib import Path

import pytest

from geolang import concepts, romanize
from geolang.paths import DATA_OUT

FIXTURE = Path(__file__).parent / "fixtures" / "wiktionary-sample.jsonl"


@pytest.fixture(scope="module")
def langs():
    return json.loads((DATA_OUT / "languages.json").read_text("utf-8"))


@pytest.fixture(scope="module")
def extracted(langs):
    codes = {c for code in langs for c in concepts.spec_for(code).codes}
    canonical = concepts.discover_canonical_names(concepts.iter_entries(FIXTURE), codes)
    return list(concepts.extract(concepts.iter_entries(FIXTURE), langs, canonical, min_translations=1))


def find(extracted, word, gloss):
    return next(c for c in extracted if c.word == word and c.gloss == gloss)


def test_hello_greeting(extracted):
    c = find(extracted, "hello", "greeting")
    t = c.translations
    assert t["fr"] == ("bonjour", None)
    assert t["de"][0] == "hallo"
    assert t["en"] == ("hello", None)
    ru_native, ru_latin = t["ru"]
    assert ru_native in {"привет", "здравствуйте"}
    assert ru_latin in {"privet", "zdravstvujte"}
    assert "́" not in ru_native + ru_latin
    assert t["zh"] == ("你好", "nǐ hǎo")
    assert t["sr"] == ("здраво", "zdravo")  # latin from the paired Serbo-Croatian Latin entry
    assert t["hr"][0] == "zdravo"
    assert t["ja"][1] and romanize.is_latin(t["ja"][1])


def test_only_official_languages(extracted, langs):
    for c in extracted:
        assert set(c.translations) <= set(langs), c.word
    # Basque, Welsh, Swiss German are not national official languages in our mapping
    hello = find(extracted, "hello", "greeting")
    assert not {"eu", "cy", "gsw", "ta-IN"} & set(hello.translations)


def test_regional_variants_skipped(extracted):
    hello = find(extracted, "hello", "greeting")
    assert hello.translations["de"][0] != "grüezi"  # Alemannic
    assert hello.translations["zh"][0] != "ни хо"  # Dungan


def test_bank_senses_are_separate(extracted):
    banks = [c for c in extracted if c.word == "bank"]
    glosses = {c.gloss for c in banks}
    assert {"institution", "edge of river or lake"} <= glosses
    assert len({c.id for c in banks}) == len(banks)
    assert find(extracted, "bank", "institution").translations["fr"][0] == "banque"
    assert find(extracted, "bank", "edge of river or lake").translations["fr"][0] == "rive"


def test_chinese_traditional_and_simplified(extracted):
    bank = find(extracted, "bank", "institution")
    assert bank.translations["zh"][0] == "银行"
    assert bank.translations["zh-Hant"][0] == "銀行"


def test_latin_forms(extracted, langs):
    for c in extracted:
        for code, (native, latin) in c.translations.items():
            if langs[code]["latin"]:
                assert latin is None, (code, native)
                assert romanize.is_latin(native), (code, native)
            elif latin is not None:
                assert romanize.is_latin(latin), (code, latin)


def test_romanization_fallback():
    assert romanize.romanize("привет", "Cyrl") == "privet"
    assert romanize.romanize("你好", "Hans") == "nǐ hǎo"
    assert romanize.romanize("γεια", "Grek")
    assert romanize.romanize("水", "Jpan") is None  # kanji: ICU would produce Chinese readings


def test_no_markup_or_bad_tags(extracted):
    c = find(extracted, "testword", "test")
    assert c.translations["fr"][0] == "motessai"
    assert c.translations["de"][0] == "Testwort"  # obsolete 'altwort' skipped
    for native, latin in c.translations.values():
        assert "<" not in native and ">" not in native
    for c in extracted:
        for native, latin in c.translations.values():
            assert not any(ch in native for ch in "<>"), native


def test_stable_ids(langs, extracted):
    codes = {c for code in langs for c in concepts.spec_for(code).codes}
    canonical = concepts.discover_canonical_names(concepts.iter_entries(FIXTURE), codes)
    again = list(concepts.extract(concepts.iter_entries(FIXTURE), langs, canonical, min_translations=1))
    assert [c.id for c in again] == [c.id for c in extracted]


def test_inflected_forms():
    entry = {
        "word": "dog",
        "forms": [
            {"form": "dogs", "tags": ["plural"]},
            {"form": "dawg", "tags": ["alternative", "dialectal"]},
            {"form": "dogge", "tags": ["alternative", "obsolete"]},
            {"form": "<b>x</b>"},
        ],
    }
    assert concepts.inflected_forms(entry) == ("dogs",)
    go = {"word": "go", "forms": [{"form": "went", "tags": ["past"]}, {"form": "gone", "tags": ["participle", "past"]}]}
    assert concepts.inflected_forms(go) == ("went", "gone")


HAN_LANGS = {code: {"script": "Hant"} for code in ("nan", "yue", "hak", "zh-Hant")}


def _pick(*translations):
    return concepts.pick_translations(list(translations), HAN_LANGS, {})


def test_bogus_min_nan_roman_is_dropped():
    t = {"lang": "Chinese", "code": "nan-hbl", "tags": ["Hokkien"], "word": "𡳞鳥 /𡳞鸟", "roman": "zh-min-nan"}
    assert _pick(t)["nan"] == ("𡳞鳥", None)


def test_no_mandarin_pinyin_for_other_chinese_languages():
    picked = _pick(
        {"lang": "Chinese", "code": "nan-hbl", "tags": ["Hokkien"], "word": "水"},
        {"lang": "Cantonese", "code": "yue", "word": "水"},
        {"lang": "Hakka", "code": "hak", "word": "水"},
        {"lang": "Mandarin", "code": "cmn", "word": "水"},
    )
    assert picked["nan"] == ("水", None)
    assert picked["yue"] == ("水", None)
    assert picked["hak"] == ("水", None)
    assert picked["zh-Hant"] == ("水", "shuǐ")  # Mandarin still gets ICU pinyin


def test_real_min_nan_roman_is_kept():
    t = {"lang": "Chinese", "code": "nan-hbl", "tags": ["Hokkien"], "word": "水", "roman": "tsuí"}
    assert _pick(t)["nan"] == ("水", "tsuí")


def test_hokkien_rare_character_without_bogus_roman(extracted):
    c = find(extracted, "dick", "penis")
    assert c.translations["nan"] == ("𡳞鳥", None)  # kaikki's roman is "zh-min-nan"
    assert c.translations["zh-Hant"] == ("雞巴", "jība")
