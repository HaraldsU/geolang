"""Fallback font for rare Han characters that the self-hosted Noto fonts lack.

The web app self-hosts Google's sliced Noto Sans TC/SC/JP/KR (via Fontsource). Those slices leave out
rare ideographs (e.g. Hokkien 𡳞, U+21CDE), which then render as empty boxes on most systems. This
step finds every Han-font character in the built data that none of those files can draw and subsets
it from full-coverage OFL fonts into small woff2 files, listed in manifest.json as `fallbackFonts`.
"""

from __future__ import annotations

import json
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from fontTools import subset
from fontTools.ttLib import TTFont

from . import download
from .paths import CACHE_DIR, DATA_OUT, WEB_DIR

# One family per source weight: CSS font matching narrows by weight before unicode-range, so faces
# of different weights in one family would never combine. Keep in sync with web/src/lib/fonts.ts.
FAMILY_BOLD = "Geolang Han Fallback"
FAMILY_REGULAR = "Geolang Han Fallback Ext"
# Languages whose labels use one of these fonts get the fallback family in their font stack.
HAN_FONTS = frozenset({"Noto Sans TC", "Noto Sans SC", "Noto Sans JP", "Noto Sans KR"})
# Fontsource packages (and weight) the web app self-hosts for Han text, plus its base font.
FONTSOURCE_PACKAGES = ("noto-sans-tc", "noto-sans-sc", "noto-sans-jp", "noto-sans-kr", "noto-sans")
FONTSOURCE_WEIGHT = 600
FONTSOURCE_DIR = WEB_DIR / "node_modules" / "@fontsource"

NOTO_CJK_TAG = "Sans2.004"
PLANGOTHIC_TAG = "V2.9.5795"


@dataclass(frozen=True)
class Source:
    name: str
    url: str
    family: str
    weight: int  # the source's real weight, so browsers synthesise bold where needed
    license_url: str

    @property
    def path(self) -> Path:
        return CACHE_DIR / "fonts" / self.name / self.url.rsplit("/", 1)[1]


# In order of preference. Noto Sans CJK is the full (unsliced) version of the fonts the site uses;
# Plangothic extends the same design (Source Han Sans) to the CJK extension blocks B and later.
SOURCES = (
    Source(
        f"noto-cjk-{NOTO_CJK_TAG}",
        f"https://raw.githubusercontent.com/notofonts/noto-cjk/{NOTO_CJK_TAG}/Sans/OTF/TraditionalChinese/NotoSansCJKtc-Bold.otf",
        FAMILY_BOLD,
        700,
        f"https://raw.githubusercontent.com/notofonts/noto-cjk/{NOTO_CJK_TAG}/LICENSE",
    ),
    *(
        Source(
            f"plangothic-{PLANGOTHIC_TAG}",
            f"https://github.com/Fitzgerald-Porthmouth-Koenigsegg/Plangothic_Project/releases/download/{PLANGOTHIC_TAG}/Plangothic{part}-Regular.ttf",
            FAMILY_REGULAR,
            400,
            f"https://raw.githubusercontent.com/Fitzgerald-Porthmouth-Koenigsegg/Plangothic_Project/{PLANGOTHIC_TAG}/LICENSE-OFL.txt",
        )
        for part in ("P1", "P2")
    ),
)


def han_text_chars(version_dir: Path, languages: dict[str, dict[str, Any]]) -> set[int]:
    """Code points of all native forms written in a Han font, across the built concept shards."""
    han = {code for code, meta in languages.items() if meta.get("font") in HAN_FONTS}
    chars: set[int] = set()
    for shard in (version_dir / "concepts").glob("*.json"):
        for concept in json.loads(shard.read_text("utf-8")).values():
            for code, (native, _) in concept["t"].items():
                if code in han:
                    chars.update(map(ord, native))
    return {cp for cp in chars if cp > 0x7F and not chr(cp).isspace()}


def cmap(path: Path) -> set[int]:
    with TTFont(path, lazy=True) as font:
        return set(font.getBestCmap())


def fontsource_coverage(root: Path = FONTSOURCE_DIR) -> set[int]:
    """Code points the self-hosted Fontsource files can really draw (their CSS unicode-range overstates it)."""
    covered: set[int] = set()
    for package in FONTSOURCE_PACKAGES:
        files = sorted((root / package / "files").glob(f"*-{FONTSOURCE_WEIGHT}-normal.woff2"))
        if not files:
            raise SystemExit(f"No {package} font files in {root} (run npm ci in web/ first)")
        for f in files:
            covered |= cmap(f)
    return covered


def unicode_range(cps: Iterable[int]) -> str:
    """CSS unicode-range for a set of code points, merging consecutive runs."""
    runs: list[list[int]] = []
    for cp in sorted(cps):
        if runs and cp == runs[-1][1] + 1:
            runs[-1][1] = cp
        else:
            runs.append([cp, cp])
    return ",".join(f"U+{a:X}" if a == b else f"U+{a:X}-{b:X}" for a, b in runs)


def write_subset(src: Path, cps: set[int], dest: Path, family: str) -> None:
    """Subset src to cps as woff2, renamed: the OFL forbids reserved names on modified fonts."""
    options = subset.Options()
    options.layout_features = []
    options.name_IDs = [0, 13, 14]  # keep copyright and licence; the rest is replaced below
    options.notdef_outline = True
    with TTFont(src) as font:
        sub = subset.Subsetter(options)
        sub.populate(unicodes=cps)
        sub.subset(font)
        name = font["name"]
        for name_id, value in ((1, family), (2, "Regular"), (3, family), (4, family), (6, family.replace(" ", ""))):
            name.setName(value, name_id, 3, 1, 0x409)
        font.flavor = "woff2"
        dest.parent.mkdir(parents=True, exist_ok=True)
        font.save(dest)


def build(data_out: Path = DATA_OUT, fontsource_dir: Path = FONTSOURCE_DIR,
          sources: tuple[Source, ...] = SOURCES,
          languages_file: Path = DATA_OUT / "languages.json") -> list[dict[str, Any]]:
    """Write the fallback fonts for the current data version and list them in manifest.json."""
    manifest_path = data_out / "manifest.json"
    manifest = json.loads(manifest_path.read_text("utf-8"))
    version_dir = data_out / manifest["version"]
    languages = json.loads(languages_file.read_text("utf-8"))

    missing = han_text_chars(version_dir, languages) - fontsource_coverage(fontsource_dir)
    out_dir = version_dir / "fonts"
    for stale in (*out_dir.glob("han-fallback-*.woff2"), *out_dir.glob("LICENSE-*.txt")):
        stale.unlink()
    entries: list[dict[str, Any]] = []
    licenses: dict[str, str] = {}
    for src in sources:
        if not missing:
            break
        path = download.fetch(src.url, src.path)
        cps = missing & cmap(path)
        if not cps:
            continue
        missing -= cps
        file = f"han-fallback-{len(entries) + 1}.woff2"
        write_subset(path, cps, out_dir / file, src.family)
        entries.append({
            "file": f"fonts/{file}", "family": src.family, "weight": src.weight, "unicodeRange": unicode_range(cps),
        })
        licenses[src.name] = src.license_url

    for name, url in licenses.items():
        lic = download.fetch(url, CACHE_DIR / "fonts" / name / "LICENSE.txt")
        (out_dir / f"LICENSE-{name}.txt").write_bytes(lic.read_bytes())

    manifest["fallbackFonts"] = entries
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=1), "utf-8")
    if missing:
        print(f"No font has {len(missing)} characters: {''.join(sorted(map(chr, missing)))}")
    return entries
