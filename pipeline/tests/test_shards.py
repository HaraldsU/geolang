import hashlib
import json
from pathlib import Path

from geolang import shards
from geolang.concepts import Concept
from geolang.text import bucket, fold, norm


def sample():
    return [
        Concept("a1", "hello", "intj", "greeting",
                {"en": ("hello", None), "fr": ("bonjour", None), "ru": ("привет", "privet")}),
        Concept("b2", "bank", "noun", "institution", {"en": ("bank", None), "fr": ("banque", None)}),
        Concept("c3", "bank", "noun", "edge of river or lake", {"en": ("bank", None), "fr": ("rive", None)}),
        Concept("d4", "good morning", "intj", "greeting",
                {"en": ("good morning", None), "fr": ("bonjour", None), "de": ("guten Morgen", None)}),
    ]


def load_index(out: Path, version: str, n: int, key: str):
    data = json.loads((out / version / "index" / f"{bucket(key, n)}.json").read_text("utf-8"))
    return data.get(key, [])


def tree_hash(root: Path) -> str:
    h = hashlib.sha256()
    for p in sorted(root.rglob("*")):
        if p.is_file():
            h.update(str(p.relative_to(root)).encode())
            h.update(p.read_bytes())
    return h.hexdigest()


def test_index_maps_all_forms_to_same_concept(tmp_path):
    shards.write_shards(sample(), tmp_path, "v1", 16, 8)
    for key in ["hello", "bonjour", "привет", "privet"]:
        ids = [r[0] for r in load_index(tmp_path, "v1", 16, norm(key))]
        assert "a1" in ids, key


def test_index_order_prefers_headword_then_weight(tmp_path):
    shards.write_shards(sample(), tmp_path, "v1", 16, 8)
    refs = load_index(tmp_path, "v1", 16, "bonjour")
    assert {r[0] for r in refs} == {"a1", "d4"}
    refs = load_index(tmp_path, "v1", 16, "bank")
    assert [r[0] for r in refs] == ["b2", "c3"]  # equal weight -> stable id order
    assert refs[0][1:4] == ["bank", "noun", "institution"]


def test_folded_keys(tmp_path):
    concepts = [Concept("e5", "cafe", "noun", "coffee shop", {"en": ("cafe", None), "fr": ("café", None)})]
    shards.write_shards(concepts, tmp_path, "v1", 16, 8)
    assert load_index(tmp_path, "v1", 16, "café")
    assert load_index(tmp_path, "v1", 16, fold("café"))


def test_concept_shards_and_manifest(tmp_path):
    stats = shards.write_shards(sample(), tmp_path, "v1", 16, 8, meta={"source": "test"})
    manifest = json.loads((tmp_path / "manifest.json").read_text())
    assert manifest == {"version": "v1", "indexShards": 16, "conceptShards": 8, "concepts": 4, "source": "test"}
    data = json.loads((tmp_path / "v1" / "concepts" / f"{bucket('a1', 8)}.json").read_text("utf-8"))
    assert data["a1"]["t"]["ru"] == ["привет", "privet"]
    assert data["a1"]["t"]["fr"] == ["bonjour", None]
    assert len(list((tmp_path / "v1" / "index").iterdir())) == 16  # empty shards are written too
    assert len(list((tmp_path / "v1" / "concepts").iterdir())) == 8
    assert stats.files == 24


def test_deterministic_output(tmp_path):
    shards.write_shards(sample(), tmp_path / "a", "v1", 16, 8)
    shards.write_shards(list(reversed(sample())), tmp_path / "b", "v1", 16, 8)
    assert tree_hash(tmp_path / "a") == tree_hash(tmp_path / "b")


def test_old_versions_removed(tmp_path):
    shards.write_shards(sample(), tmp_path, "v1", 4, 4)
    shards.write_shards(sample(), tmp_path, "v2", 4, 4)
    assert not (tmp_path / "v1").exists()
    assert (tmp_path / "v2").exists()


def test_inflected_forms_are_indexed(tmp_path):
    c = Concept("g1", "go", "verb", "to move", {"en": ("go", None), "fr": ("aller", None)}, forms=("went", "goes"))
    shards.write_shards([c], tmp_path, "v1", 16, 8)
    for key in ["go", "went", "goes", "aller"]:
        assert [r[0] for r in load_index(tmp_path, "v1", 16, key)] == ["g1"], key
