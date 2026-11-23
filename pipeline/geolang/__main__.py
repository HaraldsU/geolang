"""CLI: python -m geolang <command>"""

from __future__ import annotations

import argparse
import datetime as dt
import itertools
import json
import time
from pathlib import Path

from . import concepts, coverage, fonts, languages, shards, wikidata
from .paths import CACHE_DIR, DATA_OUT

KAIKKI_EN = CACHE_DIR / "kaikki" / "English.jsonl.gz"


def cmd_languages() -> None:
    countries, langs, topo = languages.build()
    languages.write(DATA_OUT, countries, langs, topo)
    print(f"{len(countries)} territories, {len(langs)} languages -> {DATA_OUT}")


def cmd_translations(args: argparse.Namespace) -> None:
    langs = json.loads((DATA_OUT / "languages.json").read_text("utf-8"))
    codes = {c for code in langs for c in concepts.spec_for(code).codes}
    src = Path(args.input)
    canonical = concepts.discover_canonical_names(concepts.iter_entries(src), codes)
    labels = None
    if not args.no_wikidata:
        qids = concepts.collect_qids(concepts.iter_entries(src))
        labels = wikidata.load_labels(qids, langs)
        print(f"Wikidata labels for {len(labels)} items")
    entries = concepts.iter_entries(src)
    if args.limit:
        entries = itertools.islice(entries, args.limit)
    version = args.version or "v" + dt.date.today().strftime("%Y%m%d")
    t0 = time.time()
    out = Path(args.out) if args.out else DATA_OUT
    stats = shards.write_shards(
        concepts.extract(
            entries, langs, canonical, min_translations=args.min_translations, wikidata_labels=labels
        ),
        out,
        version,
        args.index_shards,
        args.concept_shards,
        meta={"source": "English Wiktionary via kaikki.org (CC BY-SA 4.0)", "built": dt.date.today().isoformat()},
    )
    print(
        f"{stats.concepts} concepts, {stats.keys} keys, {stats.files} files, "
        f"{stats.total_bytes / 1e6:.1f} MB total, largest {stats.max_file_bytes / 1e3:.0f} kB "
        f"({time.time() - t0:.0f}s) -> {out / version}"
    )


def cmd_coverage(args: argparse.Namespace) -> None:
    report = coverage.report(DATA_OUT, Path(args.words))
    out = DATA_OUT.parent.parent.parent / "pipeline" / ".cache" / "coverage.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=1), "utf-8")
    print(coverage.summary(report))
    problems = coverage.check(report)
    if problems:
        raise SystemExit("Coverage check failed:\n  " + "\n  ".join(problems))


def cmd_fonts(args: argparse.Namespace) -> None:
    entries = fonts.build(Path(args.out) if args.out else DATA_OUT)
    sizes = ", ".join(f"{e['file']} ({e['unicodeRange'].count(',') + 1} ranges)" for e in entries)
    print(f"{len(entries)} fallback font files: {sizes or 'none needed'}")


def main() -> None:
    parser = argparse.ArgumentParser(prog="geolang")
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("languages", help="Build countries.json, languages.json and the map topology")
    tr = sub.add_parser("translations", help="Build sharded concept/index data from Wiktionary")
    tr.add_argument("--input", default=str(KAIKKI_EN))
    tr.add_argument("--limit", type=int, default=0, help="only process the first N entries")
    tr.add_argument("--version", default="")
    tr.add_argument("--out", default="", help="output directory (default: web/static/data)")
    tr.add_argument("--index-shards", type=int, default=4096)
    tr.add_argument("--concept-shards", type=int, default=4096)
    tr.add_argument("--min-translations", type=int, default=3)
    tr.add_argument("--no-wikidata", action="store_true", help="skip Wikidata label enrichment")
    cov = sub.add_parser("coverage", help="Report translation coverage for common words")
    cov.add_argument("--words", default=str(coverage.DEFAULT_WORDS))
    fo = sub.add_parser("fonts", help="Build fallback fonts for Han characters the web fonts lack")
    fo.add_argument("--out", default="", help="data directory with manifest.json (default: web/static/data)")
    args = parser.parse_args()

    if args.cmd == "languages":
        cmd_languages()
    elif args.cmd == "translations":
        cmd_translations(args)
    elif args.cmd == "fonts":
        cmd_fonts(args)
    elif args.cmd == "coverage":
        cmd_coverage(args)


if __name__ == "__main__":
    main()
