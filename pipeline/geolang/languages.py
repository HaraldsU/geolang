"""Build country -> national official languages mapping from Unicode CLDR.

Rules (see project plan):
* keep `official` and `de_facto_official`; drop `official_regional` and sign languages
* collapse script variants of the same language (sr_Latn -> sr), except zh_Hant which is
  kept distinct because Traditional Chinese is a different written form
* apply manual overrides from overrides.json
"""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

from . import download
from .paths import OVERRIDES_FILE, WORLD_TOPOLOGY_OUT, WORLD_TOPOLOGY_SRC

NATIONAL_STATUSES = {"official", "de_facto_official"}

# Script variants that are the same language for our purposes.
CODE_ALIASES = {
    "sr_Latn": "sr",
    "az_Cyrl": "az",
    "bs_Cyrl": "bs",
    "uz_Cyrl": "uz",
    "uz_Arab": "uz",
    "ms_Arab": "ms",
    "hak_Hant": "hak",
    "nan_Hant": "nan",
    "pa_Arab": "pa",
    "sd_Deva": "sd",
    "mn_Mong": "mn",
}

RTL_SCRIPTS = {"Arab", "Hebr", "Thaa", "Syrc", "Nkoo", "Adlm", "Mand", "Samr", "Rohg"}

# Noto family per script; the web app loads these on demand.
SCRIPT_FONTS = {
    "Latn": "Noto Sans",
    "Cyrl": "Noto Sans",
    "Grek": "Noto Sans",
    "Arab": "Noto Sans Arabic",
    "Hebr": "Noto Sans Hebrew",
    "Thaa": "Noto Sans Thaana",
    "Deva": "Noto Sans Devanagari",
    "Beng": "Noto Sans Bengali",
    "Taml": "Noto Sans Tamil",
    "Sinh": "Noto Sans Sinhala",
    "Thai": "Noto Sans Thai",
    "Laoo": "Noto Sans Lao",
    "Khmr": "Noto Sans Khmer",
    "Mymr": "Noto Sans Myanmar",
    "Tibt": "Noto Serif Tibetan",
    "Ethi": "Noto Sans Ethiopic",
    "Geor": "Noto Sans Georgian",
    "Armn": "Noto Sans Armenian",
    "Hans": "Noto Sans SC",
    "Hant": "Noto Sans TC",
    "Jpan": "Noto Sans JP",
    "Kore": "Noto Sans KR",
    "Tfng": "Noto Sans Tifinagh",
}

SIGN_LANGUAGE_SUFFIX = "sgn"


def normalize_code(code: str) -> str:
    code = CODE_ALIASES.get(code, code)
    return code.replace("_", "-")


def is_sign_language(code: str, names: dict[str, str]) -> bool:
    return code.startswith(SIGN_LANGUAGE_SUFFIX) or "sign language" in names.get(code, "").lower()


def load_overrides(path: Path = OVERRIDES_FILE) -> dict[str, Any]:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _alpha2_by_numeric(code_mappings: dict[str, Any], territory_info: dict[str, Any]) -> dict[str, str]:
    """Numeric ISO 3166 -> alpha-2, preferring current codes present in territoryInfo (TL over TP)."""
    result: dict[str, str] = {}
    for alpha2, info in code_mappings.items():
        num = info.get("_numeric")
        if not num or len(alpha2) != 2 or not alpha2.isalpha():
            continue
        if num not in result or (alpha2 in territory_info and result[num] not in territory_info):
            result[num] = alpha2
    return result


def official_languages(territory: dict[str, Any], names: dict[str, str]) -> list[str]:
    pops = territory.get("languagePopulation", {})
    ranked = []
    for code, info in pops.items():
        status = info.get("_officialStatus")
        if status not in NATIONAL_STATUSES or is_sign_language(code, names):
            continue
        ranked.append((status != "official", -float(info.get("_populationPercent", 0)), code))
    out: list[str] = []
    for _, _, code in sorted(ranked):
        norm = normalize_code(code)
        if norm not in out:
            out.append(norm)
    return out


def _population_percent(territory: dict[str, Any], code: str) -> float:
    for raw, info in territory.get("languagePopulation", {}).items():
        if normalize_code(raw) == code:
            return float(info.get("_populationPercent", 0))
    return 0.0


def build_country_languages(
    territory_info: dict[str, Any],
    code_mappings: dict[str, Any],
    topology: dict[str, Any],
    names: dict[str, str],
    overrides: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Returns (countries mapping, topology with alpha-2 ids)."""
    num2a = _alpha2_by_numeric(code_mappings, territory_info)
    pseudo = {k: v for k, v in overrides.get("pseudoTerritories", {}).items() if not k.startswith("_")}
    topo = copy.deepcopy(topology)
    countries: dict[str, Any] = {}

    for geom in topo["objects"]["countries"]["geometries"]:
        name = geom.get("properties", {}).get("name", "")
        num = geom.get("id")
        if num is not None and num in num2a:
            iso = num2a[num]
            territory = territory_info.get(iso, {})
            langs = official_languages(territory, names)
            for extra in overrides.get("add", {}).get(iso, []):
                if extra not in langs:
                    langs.append(extra)
            removed = set(overrides.get("remove", {}).get(iso, []))
            langs = [lang for lang in langs if lang not in removed]
            # keep official-first ordering, then by share of population
            langs.sort(key=lambda c: -_population_percent(territory, c))
        elif name in pseudo:
            iso = pseudo[name]["id"]
            langs = list(pseudo[name]["languages"])
        else:
            raise ValueError(f"Topology feature without mapping: id={num!r} name={name!r}")

        geom["id"] = iso
        geom["properties"] = {"name": name}
        if iso in countries:  # several features for one territory (e.g. Ashmore Is. -> AU)
            continue
        countries[iso] = {"name": name, "languages": langs}

    topo["objects"]["countries"]["geometries"] = _merge_duplicate_geometries(
        topo["objects"]["countries"]["geometries"]
    )
    return dict(sorted(countries.items())), topo


def _as_multipolygon_arcs(geom: dict[str, Any]) -> list[Any]:
    if geom["type"] == "Polygon":
        return [geom["arcs"]]
    if geom["type"] == "MultiPolygon":
        return list(geom["arcs"])
    return []


def _merge_duplicate_geometries(geoms: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Merge TopoJSON geometries sharing an id into a single MultiPolygon (first one's name wins)."""
    merged: dict[str, dict[str, Any]] = {}
    order: list[str] = []
    for g in geoms:
        gid = g["id"]
        if gid not in merged:
            merged[gid] = g
            order.append(gid)
            continue
        first = merged[gid]
        arcs = _as_multipolygon_arcs(first) + _as_multipolygon_arcs(g)
        merged[gid] = {**first, "type": "MultiPolygon", "arcs": arcs}
    return [merged[i] for i in order]


def build_language_meta(
    codes: set[str], language_data: dict[str, Any], names: dict[str, str], overrides: dict[str, Any]
) -> dict[str, Any]:
    script_override = overrides.get("languageScript", {})
    name_override = overrides.get("languageName", {})
    meta: dict[str, Any] = {}
    for code in sorted(codes):
        base, _, script = code.partition("-")
        if not script:
            script = script_override.get(code) or (language_data.get(base, {}).get("_scripts") or ["Latn"])[0]
        meta[code] = {
            "name": name_override.get(code)
            or names.get(code.replace("-", "_"))
            or names.get(code)
            or names.get(base, code),
            "script": script,
            "dir": "rtl" if script in RTL_SCRIPTS else "ltr",
            "font": SCRIPT_FONTS.get(script, "Noto Sans"),
            "latin": script == "Latn",
        }
    return meta


def load_inputs() -> dict[str, Any]:
    with open(WORLD_TOPOLOGY_SRC, encoding="utf-8") as f:
        topology = json.load(f)
    return {
        "territory_info": download.cldr_json("territoryInfo")["supplemental"]["territoryInfo"],
        "code_mappings": download.cldr_json("codeMappings")["supplemental"]["codeMappings"],
        "language_data": download.cldr_json("languageData")["supplemental"]["languageData"],
        "names": download.cldr_json("languageNames")["main"]["en"]["localeDisplayNames"]["languages"],
        "topology": topology,
        "overrides": load_overrides(),
    }


def build(inputs: dict[str, Any] | None = None) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    inp = inputs or load_inputs()
    countries, topo = build_country_languages(
        inp["territory_info"], inp["code_mappings"], inp["topology"], inp["names"], inp["overrides"]
    )
    codes = {lang for c in countries.values() for lang in c["languages"]}
    languages = build_language_meta(codes, inp["language_data"], inp["names"], inp["overrides"])
    return countries, languages, topo


def write(out_dir: Path, countries: dict[str, Any], languages: dict[str, Any], topo: dict[str, Any]) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "countries.json").write_text(json.dumps(countries, ensure_ascii=False, indent=1), "utf-8")
    (out_dir / "languages.json").write_text(json.dumps(languages, ensure_ascii=False, indent=1), "utf-8")
    WORLD_TOPOLOGY_OUT.parent.mkdir(parents=True, exist_ok=True)
    WORLD_TOPOLOGY_OUT.write_text(json.dumps(topo, separators=(",", ":")), "utf-8")
