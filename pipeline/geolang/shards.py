"""Write concepts + search index as hash-sharded static JSON files.

Layout (all under data/<version>/):
  index/<n>.json     { key: [[conceptId, headword, pos, gloss, weight], ...] }
  concepts/<n>.json  { conceptId: {w, p, g, t: {lang: [native, latin|null]}} }
and data/manifest.json pointing at the current version.
"""

from __future__ import annotations

import json
import shutil
import tempfile
from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .concepts import Concept
from .text import bucket, fold, norm

MAX_REFS_PER_KEY = 12
TEMP_BUCKETS = 64


@dataclass
class ShardStats:
    concepts: int = 0
    keys: int = 0
    files: int = 0
    max_file_bytes: int = 0
    total_bytes: int = 0


def index_keys(concept: Concept) -> set[str]:
    words = {concept.word, *concept.forms}
    for native, latin in concept.translations.values():
        words.add(native)
        if latin:
            words.add(latin)
    keys: set[str] = set()
    for w in words:
        k = norm(w)
        if k:
            keys.add(k)
            keys.add(fold(k))
    return keys


def _dump(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def write_shards(
    concepts: Iterable[Concept],
    out_dir: Path,
    version: str,
    index_shards: int,
    concept_shards: int,
    meta: dict[str, Any] | None = None,
) -> ShardStats:
    """Stream concepts to temp files, then group them into deterministic shard files."""
    stats = ShardStats()
    vdir = out_dir / version
    if vdir.exists():
        shutil.rmtree(vdir)
    (vdir / "index").mkdir(parents=True)
    (vdir / "concepts").mkdir(parents=True)

    def finish(path: Path) -> None:
        size = path.stat().st_size
        stats.files += 1
        stats.total_bytes += size
        stats.max_file_bytes = max(stats.max_file_bytes, size)

    with tempfile.TemporaryDirectory(prefix="geolang-shards-") as tmp:
        tmpdir = Path(tmp)
        idx_tmp = [open(tmpdir / f"i{i}.tsv", "w", encoding="utf-8") for i in range(TEMP_BUCKETS)]
        con_tmp = [open(tmpdir / f"c{i}.jsonl", "w", encoding="utf-8") for i in range(TEMP_BUCKETS)]
        try:
            for c in concepts:
                stats.concepts += 1
                cs = bucket(c.id, concept_shards)
                con_tmp[cs % TEMP_BUCKETS].write(f"{cs}\t{c.id}\t{_dump(c.to_json())}\n")
                ref = _dump([c.id, c.word, c.pos, c.gloss, c.weight])
                for key in index_keys(c):
                    ks = bucket(key, index_shards)
                    idx_tmp[ks % TEMP_BUCKETS].write(f"{ks}\t{key}\t{ref}\n")
        finally:
            for f in idx_tmp + con_tmp:
                f.close()

        for i in range(TEMP_BUCKETS):
            shards: dict[int, dict[str, Any]] = defaultdict(dict)
            with open(tmpdir / f"c{i}.jsonl", encoding="utf-8") as f:
                for line in f:
                    shard, cid, payload = line.rstrip("\n").split("\t", 2)
                    shards[int(shard)][cid] = json.loads(payload)
            for shard, data in shards.items():
                p = vdir / "concepts" / f"{shard}.json"
                p.write_text(_dump(data), "utf-8")
                finish(p)

            refs: dict[int, dict[str, list[Any]]] = defaultdict(lambda: defaultdict(list))
            with open(tmpdir / f"i{i}.tsv", encoding="utf-8") as f:
                for line in f:
                    shard, key, ref = line.rstrip("\n").split("\t", 2)
                    refs[int(shard)][key].append(json.loads(ref))
            for shard, keys in refs.items():
                ordered: dict[str, list[Any]] = {}
                for key, lst in keys.items():
                    # exact English headword first, then most widely translated, then id for stability
                    lst.sort(key=lambda r: (norm(r[1]) != key and fold(norm(r[1])) != key, -r[4], r[0]))
                    dedup: list[Any] = []
                    seen: set[str] = set()
                    for r in lst:
                        if r[0] not in seen:
                            seen.add(r[0])
                            dedup.append(r)
                    ordered[key] = dedup[:MAX_REFS_PER_KEY]
                stats.keys += len(ordered)
                p = vdir / "index" / f"{shard}.json"
                p.write_text(_dump(ordered), "utf-8")
                finish(p)

    for kind, n in (("index", index_shards), ("concepts", concept_shards)):
        for i in range(n):
            p = vdir / kind / f"{i}.json"
            if not p.exists():
                p.write_text("{}", "utf-8")
                finish(p)

    for old in out_dir.iterdir():  # keep only the current data version
        if old.is_dir() and old.name.startswith("v") and old.name != version:
            shutil.rmtree(old)

    manifest = {
        "version": version,
        "indexShards": index_shards,
        "conceptShards": concept_shards,
        "concepts": stats.concepts,
        **(meta or {}),
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), "utf-8")
    return stats
