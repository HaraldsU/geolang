import copy

from geolang import languages


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
