"""Build country -> national official languages mapping from Unicode CLDR.

Rules (see project plan):
* keep `official` and `de_facto_official`; drop `official_regional` and sign languages
* collapse script variants of the same language (sr_Latn -> sr), except zh_Hant which is
  kept distinct because Traditional Chinese is a different written form
* apply manual overrides from overrides.json
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from shapely.geometry import shape
from shapely.ops import unary_union

from . import borders, download
from .paths import OVERRIDES_FILE, WORLD_TOPOLOGY_OUT

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


def _feature_iso(props: dict[str, Any], num2a: dict[str, str], pseudo: dict[str, Any]) -> str | None:
    if props["NAME"] in pseudo:
        return pseudo[props["NAME"]]["id"]
    for key in ("ISO_N3", "ISO_N3_EH"):  # e.g. France and Norway only have ISO_N3_EH
        num = props.get(key)
        if num in num2a:
            return num2a[num]
    return None


def build_country_languages(
    territory_info: dict[str, Any],
    code_mappings: dict[str, Any],
    ne_countries: list[dict[str, Any]],
    ne_disputed: list[dict[str, Any]],
    names: dict[str, str],
    overrides: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Returns (countries mapping, map topology with alpha-2 ids), borders as in borders.py."""
    num2a = _alpha2_by_numeric(code_mappings, territory_info)
    pseudo = {k: v for k, v in overrides.get("pseudoTerritories", {}).items() if not k.startswith("_")}
    pseudo_langs = {v["id"]: v["languages"] for v in pseudo.values()}
    rules = borders.parse_rules(overrides)
    areas = borders.area_shapes(ne_disputed)

    shapes, outlines = borders.apply_rules(
        [(_feature_iso(f["properties"], num2a, pseudo), f["properties"]["NAME"], shape(f["geometry"]))
         for f in ne_countries],
        areas,
        rules,
    )
    unmapped = sorted(name for iso, name, _ in shapes if iso is None)
    if unmapped:
        raise ValueError(f"Map features without a country code: {unmapped}")

    geoms: dict[str, Any] = {}
    countries: dict[str, Any] = {}
    for iso, name, geom in shapes:
        if iso in geoms:  # several features for one territory (e.g. Ashmore and Cartier Is. -> AU)
            geoms[iso] = unary_union([geoms[iso], geom])
            continue
        geoms[iso] = geom
        if iso in pseudo_langs:
            langs = list(pseudo_langs[iso])
        else:
            territory = territory_info.get(iso, {})
            langs = official_languages(territory, names)
            for extra in overrides.get("add", {}).get(iso, []):
                if extra not in langs:
                    langs.append(extra)
            removed = set(overrides.get("remove", {}).get(iso, []))
            langs = [lang for lang in langs if lang not in removed]
            # keep official-first ordering, then by share of population
            langs.sort(key=lambda c: -_population_percent(territory, c))
        countries[iso] = {"name": name, "languages": langs}

    for iso, notes in borders.country_disputes(rules).items():
        if iso not in countries:
            raise ValueError(f"disputedAreas: note for unknown country {iso}")
        countries[iso]["disputes"] = notes

    topo = borders.map_topology([(iso, geoms[iso], countries[iso]["name"]) for iso in sorted(geoms)], outlines)
    return dict(sorted(countries.items())), topo


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
    return {
        "territory_info": download.cldr_json("territoryInfo")["supplemental"]["territoryInfo"],
        "code_mappings": download.cldr_json("codeMappings")["supplemental"]["codeMappings"],
        "language_data": download.cldr_json("languageData")["supplemental"]["languageData"],
        "names": download.cldr_json("languageNames")["main"]["en"]["localeDisplayNames"]["languages"],
        "ne_countries": borders.natural_earth(borders.NE_COUNTRIES),
        "ne_disputed": borders.natural_earth(borders.NE_DISPUTED),
        "overrides": load_overrides(),
    }


def build(inputs: dict[str, Any] | None = None) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    inp = inputs or load_inputs()
    countries, topo = build_country_languages(
        inp["territory_info"], inp["code_mappings"], inp["ne_countries"], inp["ne_disputed"], inp["names"],
        inp["overrides"],
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
