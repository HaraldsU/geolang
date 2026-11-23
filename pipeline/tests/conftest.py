import pytest

from geolang import languages


@pytest.fixture(scope="session")
def lang_inputs():
    return languages.load_inputs()


@pytest.fixture(scope="session")
def built(lang_inputs):
    countries, langs, topo = languages.build(lang_inputs)
    return {"countries": countries, "languages": langs, "topology": topo}
