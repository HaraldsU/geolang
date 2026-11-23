import json
from pathlib import Path

import pytest
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

from geolang import download, fonts

COMMON = 0x6C34  # 水: in the self-hosted web fonts
RARE = 0x21CDE  # 𡳞: missing from them (the Hokkien "dick" bug)
RARER = 0x2A736  # 𪜶: only in the second source


def make_font(path: Path, cps: list[int], flavor: str | None = None) -> Path:
    names = [".notdef"] + [f"uni{cp:X}" for cp in cps]
    fb = FontBuilder(1000, isTTF=True)
    fb.setupGlyphOrder(names)
    fb.setupCharacterMap({cp: f"uni{cp:X}" for cp in cps})
    pen = TTGlyphPen(None)
    pen.moveTo((100, 0))
    pen.lineTo((100, 700))
    pen.lineTo((800, 700))
    pen.closePath()
    box = pen.glyph()
    fb.setupGlyf({n: box for n in names})
    fb.setupHorizontalMetrics({n: (1000, 100) for n in names})
    fb.setupHorizontalHeader(ascent=880, descent=-120)
    fb.setupNameTable({"familyName": "Source Test", "styleName": "Regular"})
    fb.setupOS2()
    fb.setupPost()
    fb.font.flavor = flavor
    path.parent.mkdir(parents=True, exist_ok=True)
    fb.save(str(path))
    return path


@pytest.fixture
def site(tmp_path, monkeypatch):
    data = tmp_path / "data"
    (data / "v1" / "concepts").mkdir(parents=True)
    (data / "manifest.json").write_text(json.dumps({"version": "v1"}))
    (data / "languages.json").write_text(json.dumps({
        "nan": {"font": "Noto Sans TC"}, "en": {"font": "Noto Sans"},
    }))
    concept = {"t": {
        "nan": [f"{chr(RARE)}{chr(COMMON)}{chr(RARER)}", "lān"],
        "en": [chr(0x21CDF), None],  # not a Han-font language: ignored
    }}
    (data / "v1" / "concepts" / "0.json").write_text(json.dumps({"c1": concept}, ensure_ascii=False))

    fontsource = tmp_path / "fontsource"
    for package in fonts.FONTSOURCE_PACKAGES:
        make_font(fontsource / package / "files" / f"{package}-0-600-normal.woff2", [COMMON], flavor="woff2")

    first = make_font(tmp_path / "src" / "first.ttf", [COMMON, RARE])
    second = make_font(tmp_path / "src" / "second.ttf", [RARE, RARER])
    licence = tmp_path / "src" / "OFL.txt"
    licence.write_text("SIL Open Font License")
    local = {"https://x/first.ttf": first, "https://x/second.ttf": second, "https://x/OFL.txt": licence}
    monkeypatch.setattr(download, "fetch", lambda url, _dest: local[url])
    sources = (
        fonts.Source("a", "https://x/first.ttf", "Fam A", 700, "https://x/OFL.txt"),
        fonts.Source("b", "https://x/second.ttf", "Fam B", 400, "https://x/OFL.txt"),
    )
    return data, fontsource, sources


def test_builds_subsets_for_missing_characters_only(site):
    data, fontsource, sources = site
    entries = fonts.build(data, fontsource, sources, data / "languages.json")

    assert entries == [
        {"file": "fonts/han-fallback-1.woff2", "family": "Fam A", "weight": 700, "unicodeRange": "U+21CDE"},
        {"file": "fonts/han-fallback-2.woff2", "family": "Fam B", "weight": 400, "unicodeRange": "U+2A736"},
    ]
    assert json.loads((data / "manifest.json").read_text())["fallbackFonts"] == entries

    first = TTFont(data / "v1" / "fonts" / "han-fallback-1.woff2")
    assert first.flavor == "woff2"
    assert set(first.getBestCmap()) == {RARE}
    # renamed: the OFL forbids a modified font to keep its reserved name
    assert first["name"].getDebugName(1) == "Fam A"
    assert "Source Test" not in {r.toUnicode() for r in first["name"].names}
    assert (data / "v1" / "fonts" / "LICENSE-a.txt").read_text() == "SIL Open Font License"


def test_nothing_to_do_when_web_fonts_cover_everything(site):
    data, fontsource, sources = site
    fonts.build(data, fontsource, sources, data / "languages.json")  # a previous run left files behind
    (data / "v1" / "concepts" / "0.json").write_text(json.dumps({"c1": {"t": {"nan": [chr(COMMON), None]}}}))
    assert fonts.build(data, fontsource, sources, data / "languages.json") == []
    assert json.loads((data / "manifest.json").read_text())["fallbackFonts"] == []
    assert list((data / "v1" / "fonts").iterdir()) == []


def test_unicode_range_merges_runs():
    assert fonts.unicode_range([0x4E01, 0x4E00, 0x4E02, 0x21CDE]) == "U+4E00-4E02,U+21CDE"
    assert fonts.unicode_range([]) == ""
