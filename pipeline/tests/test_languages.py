import copy

import pytest
from shapely.geometry import Point, shape

from geolang import borders, languages


def test_every_map_country_has_a_language(built):
    no_lang_allowed = set(built["countries"]) & set(
        languages.load_overrides()["noLanguage"]
    )
    missing = [
        f"{iso} ({c['name']})"
        for iso, c in built["countries"].items()
        if not c["languages"] and iso not in no_lang_allowed
    ]
    assert not missing, f"Countries without an official language: {missing}"


def test_topology_ids_match_countries(built):
    id_list = [g["id"] for g in built["topology"]["objects"]["countries"]["geometries"]]
    ids = set(id_list)
    assert len(id_list) == len(ids), "duplicate ids in topology"
    assert ids == set(built["countries"])
    assert len(ids) >= 200


def test_known_countries(built):
    c = {iso: v["languages"] for iso, v in built["countries"].items()}
    assert c["FR"] == ["fr"]
    assert c["RU"] == ["ru"]
    assert c["US"] == ["en"]  # de facto official
    assert c["JP"] == ["ja"]
    assert set(c["BE"]) == {"nl", "fr", "de"}
    assert set(c["CH"]) == {"de", "fr", "it"}
    assert len(c["ZA"]) == 11  # override: all national official languages


def test_regional_languages_excluded(built):
    c = {iso: v["languages"] for iso, v in built["countries"].items()}
    assert "ca" not in c["ES"]
    assert {"hi", "en"} <= set(c["IN"])
    assert "ta" not in c["IN"]
    assert "cy" not in c["GB"]
    assert "tt" not in c["RU"]


def test_script_variants_collapsed(built):
    c = {iso: v["languages"] for iso, v in built["countries"].items()}
    assert c["RS"] == ["sr"]
    assert c["AZ"] == ["az"]
    assert "zh-Hant" in c["TW"]
    all_codes = {lang for v in c.values() for lang in v}
    assert not any("_" in code for code in all_codes)
    assert "sr-Latn" not in all_codes and "no" not in c["NO"]


def test_no_sign_languages(built):
    for code, meta in built["languages"].items():
        assert "sign" not in meta["name"].lower(), code
        assert not code.startswith("sgn")


def test_language_metadata(built):
    langs = built["languages"]
    used = {lang for v in built["countries"].values() for lang in v["languages"]}
    assert used == set(langs)
    for code, meta in langs.items():
        assert meta["script"] and len(meta["script"]) == 4, code
        assert meta["dir"] in {"ltr", "rtl"}, code
        assert meta["font"], code
    assert langs["ar"]["dir"] == "rtl"
    assert langs["he"]["dir"] == "rtl"
    assert langs["ru"]["dir"] == "ltr" and langs["ru"]["script"] == "Cyrl"
    assert langs["fr"]["latin"] is True and langs["ru"]["latin"] is False


def test_override_changes_output(lang_inputs):
    inputs = copy.deepcopy(lang_inputs)
    inputs["overrides"]["add"]["FR"] = ["br"]
    inputs["overrides"]["remove"]["BE"] = ["de"]
    countries, langs, _ = languages.build(inputs)
    assert countries["FR"]["languages"] == ["fr", "br"]
    assert "de" not in countries["BE"]["languages"]
    assert "br" in langs


def _country_at(built, lon, lat):
    """ISO code of the map country containing a point, decoded from the built topology."""
    topo = built["topology"]

    def ring(ids):
        pts = []
        for i in ids:
            coords = borders._arc_coords(topo, i if i >= 0 else ~i)
            pts += (coords if i >= 0 else coords[::-1])[(1 if pts else 0):]
        return pts

    for g in topo["objects"]["countries"]["geometries"]:
        polys = [g["arcs"]] if g["type"] == "Polygon" else g["arcs"]
        for poly in polys:
            geom = shape({"type": "Polygon", "coordinates": [ring(r) for r in poly]})
            if geom.contains(Point(lon, lat)):
                return g["id"]
    return None


def test_borders_follow_international_law(built):
    assert _country_at(built, 34.1, 44.95) == "UA"  # Simferopol, Crimea
    assert _country_at(built, 33.52, 44.6) == "UA"  # Sevastopol
    assert _country_at(built, 35.75, 33.0) == "SY"  # Golan Heights
    assert _country_at(built, -13.2, 27.15) == "EH"  # Laayoune, Western Sahara
    assert _country_at(built, 33.32, 35.33) == "CY"  # Kyrenia, Northern Cyprus
    assert _country_at(built, 44.06, 9.56) == "SO"  # Hargeisa, Somaliland
    assert _country_at(built, 41.0, 43.0) == "GE"  # Sukhumi, Abkhazia
    # no settled answer: the administering country
    assert _country_at(built, 74.8, 34.08) == "IN"  # Srinagar
    assert _country_at(built, 74.3, 35.9) == "PK"  # Gilgit
    assert _country_at(built, 79.5, 35.2) == "CN"  # Aksai Chin
    assert _country_at(built, 21.17, 42.67) == "XK"  # Pristina
    assert not {"XN", "XS", "XG"} & set(built["countries"])


def test_disputed_areas_are_outlined_and_explained(built):
    lines = {g["properties"]["name"]: g for g in built["topology"]["objects"]["disputed"]["geometries"]}
    assert {"Crimea", "Golan Heights", "Western Sahara", "Kashmir", "Kosovo"} <= set(lines)
    assert "Artsakh" not in lines and "Occupied regions" not in lines  # dashed: false
    assert all(g["type"] == "MultiLineString" and g["arcs"] for g in lines.values())

    notes = {iso: [d["area"] for d in c.get("disputes", [])] for iso, c in built["countries"].items()}
    assert "Crimea" in notes["UA"] and "Crimea" in notes["RU"]
    assert "Kashmir" in notes["IN"] and "Kashmir" in notes["PK"] and "Kashmir" in notes["CN"]
    assert notes["TW"] == ["Taiwan"]
    assert notes["FR"] == ["Lawa Headwaters"]
    assert "disputes" not in built["countries"]["DE"]


def test_every_disputed_area_has_a_rule(lang_inputs):
    inputs = copy.deepcopy(lang_inputs)
    del inputs["overrides"]["disputedAreas"]["Crimea"]
    with pytest.raises(ValueError, match="Crimea"):
        languages.build(inputs)


def test_build_is_deterministic(lang_inputs, built):
    _, _, topo = languages.build(copy.deepcopy(lang_inputs))
    assert topo == built["topology"]
