import json

from geolang import concepts, wikidata
from geolang.paths import DATA_OUT

LANGS = json.loads((DATA_OUT / "languages.json").read_text("utf-8"))


def test_labels_fill_only_missing_languages():
    entries = [
        {
            "word": "raven",
            "pos": "noun",
            "lang_code": "en",
            "forms": [{"form": "ravens", "tags": ["plural"]}],
            "translations": [
                {"lang": "French", "code": "fr", "sense": "bird", "word": "grand corbeau", "_qid": "Q8335"},
                {"lang": "German", "code": "de", "sense": "bird", "word": "Kolkrabe", "_qid": "Q8335"},
            ],
        }
    ]
    labels = {
        "Q8335": {
            "fr": "corbeau",  # must NOT override Wiktionary
            "es": "cuervo",
            "ru": "ворон",
            "ja": "ワタリガラス",
            "it": "Corvus corax",  # equals the scientific name -> skipped
            "mul": "Corvus corax",
            "pl": "kruk (ptak)",  # disambiguation suffix -> skipped
        }
    }
    canonical = {"fr": "French", "de": "German"}
    (c,) = list(concepts.extract(entries, LANGS, canonical, wikidata_labels=labels))
    t = c.translations
    assert c.qid == "Q8335"
    assert t["fr"] == ("grand corbeau", None)
    assert t["es"] == ("cuervo", None)
    assert t["ru"] == ("ворон", "voron")
    assert t["ja"][0] == "ワタリガラス" and t["ja"][1]
    assert "it" not in t and "pl" not in t
    assert c.to_json()["q"] == "Q8335"
    assert c.forms == ("ravens",)  # enrichment must not clobber the inflected forms


def test_sense_with_conflicting_qids_is_not_enriched():
    items = [{"_qid": "Q1"}, {"_qid": "Q2"}]
    assert concepts.sense_qid(items) is None
    assert concepts.sense_qid([{"_qid": "Q1"}, {}]) == "Q1"


def test_wikidata_language_codes():
    assert wikidata.wd_lang("zh") == "zh-hans"
    assert wikidata.wd_lang("zh-Hant") == "zh-hant"
    assert wikidata.wd_lang("sr") == "sr-ec"
    assert wikidata.wd_lang("fr") == "fr"


def test_load_labels_batches_and_caches(tmp_path):
    calls = []

    def fake(ids, langs):
        calls.append(list(ids))
        assert "mul" in langs and "zh-hans" in langs
        return {q: {"en": q.lower()} for q in ids}

    cache = tmp_path / "labels.jsonl"
    qids = {f"Q{i}" for i in range(120)}
    got = wikidata.load_labels(qids, ["en", "zh"], fetcher=fake, cache_file=cache, delay=0)
    assert len(got) == 120 and got["Q7"] == {"en": "q7"}
    assert [len(c) for c in calls] == [50, 50, 20]
    again = wikidata.load_labels(qids | {"Q999"}, ["en", "zh"], fetcher=fake, cache_file=cache, delay=0)
    assert calls[-1] == ["Q999"]  # only the new id is fetched
    assert len(again) == 121


class _Resp:
    def __init__(self, payload):
        self.payload = payload

    def __enter__(self):
        import io

        return io.BytesIO(json.dumps(self.payload).encode())

    def __exit__(self, *a):
        return False


def test_fetch_batch_retries_maxlag_then_fails(monkeypatch):
    calls = []

    def fake_urlopen(req, timeout):
        calls.append(req)
        return _Resp({"error": {"code": "maxlag", "info": "lagged"}})

    monkeypatch.setattr(wikidata.urllib.request, "urlopen", fake_urlopen)
    monkeypatch.setattr(wikidata.time, "sleep", lambda s: None)
    import pytest

    with pytest.raises(RuntimeError, match="maxlag"):
        wikidata.fetch_batch(["Q1"], ["en"])
    assert len(calls) == 8


def test_fetch_batch_parses_labels(monkeypatch):
    payload = {"entities": {"Q1": {"labels": {"fr": {"language": "fr", "value": "univers"}}}}}
    monkeypatch.setattr(wikidata.urllib.request, "urlopen", lambda req, timeout: _Resp(payload))
    assert wikidata.fetch_batch(["Q1"], ["fr"]) == {"Q1": {"fr": "univers"}}


def test_failed_batch_is_not_cached(tmp_path):
    def boom(ids, langs):
        raise RuntimeError("Wikidata API error")

    import pytest

    cache = tmp_path / "labels.jsonl"
    with pytest.raises(RuntimeError):
        wikidata.load_labels({"Q1"}, ["fr"], fetcher=boom, cache_file=cache, delay=0)
    assert not cache.exists() or cache.read_text() == ""
