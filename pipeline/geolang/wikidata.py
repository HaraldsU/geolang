"""Fill translation gaps for noun concepts from Wikidata item labels (CC0).

Only senses that Wiktionary itself links to a Wikidata item are used, and Wiktionary
translations always win: labels only fill languages that have no translation yet.
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable, Iterable
from pathlib import Path
from typing import Any

from . import romanize as rom
from .download import USER_AGENT
from .paths import CACHE_DIR
from .text import clean_native

API = "https://www.wikidata.org/w/api.php"
BATCH = 50
CACHE_FILE = CACHE_DIR / "wikidata" / "labels.jsonl"

# Our language code -> Wikidata label language code
WD_LANG = {"zh": "zh-hans", "zh-Hant": "zh-hant", "sr": "sr-ec", "fil": "tl"}
# Labels identical to these are scientific/universal names, not translations.
UNIVERSAL = ("mul", "la")

Labels = dict[str, dict[str, str]]  # qid -> {wikidata lang: label}
Fetcher = Callable[[list[str], list[str]], Labels]


def wd_lang(code: str) -> str:
    return WD_LANG.get(code, code)


def fetch_batch(ids: list[str], langs: list[str]) -> Labels:
    data = urllib.parse.urlencode(
        {
            "action": "wbgetentities",
            "ids": "|".join(ids),
            "props": "labels",  # all languages: the API caps `languages` at 50 values
            "format": "json",
            "maxlag": "30",  # read-only queries; back off only when replicas are badly lagged
        }
    ).encode()
    req = urllib.request.Request(API, data=data, headers={"User-Agent": USER_AGENT})
    body: dict[str, Any] = {}
    for attempt in range(8):
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                body = json.load(resp)
        except urllib.error.HTTPError as e:
            if e.code not in (429, 503) or attempt == 7:
                raise
            retry_after = e.headers.get("Retry-After", "")
            time.sleep(int(retry_after) if retry_after.isdigit() else 30 * (attempt + 1))
            continue
        if body.get("error", {}).get("code") == "maxlag":
            time.sleep(10 * (attempt + 1))
            continue
        break
    if "error" in body or "entities" not in body:
        # never cache a failed response as "no labels"
        raise RuntimeError(f"Wikidata API error: {body.get('error', body)!r:.300}")
    out: Labels = {}
    for qid, ent in body.get("entities", {}).items():
        wanted = set(langs)
        out[qid] = {lang: v["value"] for lang, v in ent.get("labels", {}).items() if lang in wanted}
    return out


def load_labels(
    qids: Iterable[str],
    codes: Iterable[str],
    fetcher: Fetcher = fetch_batch,
    cache_file: Path = CACHE_FILE,
    delay: float = 3.0,
) -> Labels:
    """Labels for all qids, fetched politely in batches and cached on disk."""
    langs = sorted({wd_lang(c) for c in codes} | set(UNIVERSAL))
    cache: Labels = {}
    if cache_file.exists():
        with open(cache_file, encoding="utf-8") as f:
            for line in f:
                rec = json.loads(line)
                cache[rec["id"]] = rec["labels"]
    missing = sorted(set(qids) - set(cache))
    if missing:
        cache_file.parent.mkdir(parents=True, exist_ok=True)
        with open(cache_file, "a", encoding="utf-8") as f:
            for i in range(0, len(missing), BATCH):
                batch = missing[i : i + BATCH]
                got = fetcher(batch, langs)
                for qid in batch:
                    cache[qid] = got.get(qid, {})
                    f.write(json.dumps({"id": qid, "labels": cache[qid]}, ensure_ascii=False) + "\n")
                if delay and i + BATCH < len(missing):
                    time.sleep(delay)
    return {q: cache[q] for q in set(qids) if q in cache}


def translations_from_labels(
    labels: dict[str, str], languages: dict[str, dict[str, Any]]
) -> dict[str, tuple[str, str | None]]:
    universal = {labels[u].casefold() for u in UNIVERSAL if u in labels}
    out: dict[str, tuple[str, str | None]] = {}
    for code, meta in languages.items():
        raw = labels.get(wd_lang(code))
        if not raw or len(raw) > 48 or "(" in raw or raw.casefold() in universal:
            continue
        script = meta["script"]
        native = clean_native(raw, code, script)
        if not native or not rom.matches_script(native, script):
            continue
        out[code] = (native, None if script == "Latn" else rom.romanize(native, script))
    return out
