import pytest
from shapely.geometry import Point, Polygon, box, shape

from geolang import borders


def rule(name, areas=(), assign_to=None, countries=(), note=None, dashed=True, outline_country=None):
    return borders.Rule(name, tuple(areas), assign_to, tuple(countries), note, dashed, outline_country)


# Two neighbours AA | BB, and a breakaway feature CC with no country code of its own.
SHAPES = [
    ("AA", "A", box(0, 0, 10, 10)),
    ("BB", "B", box(10, 0, 20, 10)),
    (None, "C", box(30, 0, 32, 2)),
]


def by_iso(shapes):
    return {iso: g for iso, _, g in shapes}


def test_area_moves_to_its_country_and_the_old_line_dissolves():
    # x 7..10 is administered by AA but belongs to BB; its edge at x=10.001 is a hair off AA's border
    areas = {"Strip": box(7, 0, 10.001, 10), "C": box(30, 0, 32, 2)}
    rules = [rule("Strip", ["Strip"], "BB"), rule("C", ["C"], "AA", dashed=False)]
    shapes, outlines = borders.apply_rules(SHAPES, areas, rules)
    g = by_iso(shapes)
    assert g["AA"].equals(box(0, 0, 7, 10).union(box(30, 0, 32, 2)))
    assert g["BB"].geom_type == "Polygon" and g["BB"].area == pytest.approx(130)  # one shape, no sliver
    assert None not in g  # the breakaway feature was absorbed whole
    assert [name for name, _ in outlines] == ["Strip"]
    assert outlines[0][1].area == pytest.approx(30)


def test_area_without_assignment_stays_with_its_administrator():
    areas = {"Strip": box(7, 0, 10, 10), "C": box(30, 0, 32, 2)}
    rules = [rule("Strip", ["Strip"]), rule("C", ["C"], "AA", dashed=False)]
    shapes, outlines = borders.apply_rules(SHAPES, areas, rules)
    assert by_iso(shapes)["AA"].area == pytest.approx(100 + 4)
    assert outlines[0][1].area == pytest.approx(30)


def test_slivers_from_mismatched_linework_are_not_cut_off():
    # The area's coast runs up to 0.02° inland of AA's: cutting there would leave a thin strip.
    strip = Polygon([(7, 0), (7, 10), (10, 10), (10, 0), (8.5, 0.02)])
    areas = {"Strip": strip, "C": box(30, 0, 32, 2)}
    rules = [rule("Strip", ["Strip"], "BB"), rule("C", ["C"], "AA", dashed=False)]
    g = by_iso(borders.apply_rules(SHAPES, areas, rules)[0])
    assert g["BB"].area == pytest.approx(130)
    assert g["AA"].area == pytest.approx(70 + 4)


def test_whole_country_outline():
    areas = {"C": box(30, 0, 32, 2)}
    rules = [rule("C", ["C"], "AA", dashed=False), rule("B", outline_country="BB")]
    _, outlines = borders.apply_rules(SHAPES, areas, rules)
    assert outlines == [("B", box(10, 0, 20, 10))]


@pytest.mark.parametrize(
    "areas, rules, message",
    [
        ({"C": box(30, 0, 32, 2), "New": box(1, 1, 2, 2)}, [rule("C", ["C"], "AA")], "without a rule"),
        ({"C": box(30, 0, 32, 2)}, [rule("C", ["C", "Gone"], "AA")], "does not have"),
        ({"C": box(30, 0, 32, 2)}, [rule("C", ["C"], "ZZ")], "no country ZZ"),
    ],
)
def test_every_area_needs_an_explicit_valid_rule(areas, rules, message):
    with pytest.raises(ValueError, match=message):
        borders.apply_rules(SHAPES, areas, rules)


def test_notes_reach_every_listed_country():
    rules = [
        rule("Strip", ["Strip"], "BB", ["BB", "AA"], "Belongs to BB."),
        rule("Quiet", ["C"], "AA"),
        rule("Island", [], None, ["AA"], "Claimed by BB."),
    ]
    assert borders.country_disputes(rules) == {
        "BB": [{"area": "Strip", "note": "Belongs to BB."}],
        "AA": [{"area": "Strip", "note": "Belongs to BB."}, {"area": "Island", "note": "Claimed by BB."}],
    }


def test_parse_rules_skips_comments_and_defaults_to_dashed():
    rules = borders.parse_rules({"disputedAreas": {
        "_comment": "x",
        "Crimea": {"areas": ["Crimea"], "assignTo": "UA", "countries": ["UA", "RU"], "note": "n"},
        "Taiwan": {"countries": ["TW"], "dashed": False, "note": "t"},
    }})
    assert rules == [
        rule("Crimea", ["Crimea"], "UA", ["UA", "RU"], "n"),
        rule("Taiwan", [], None, ["TW"], "t", dashed=False),
    ]


def test_topology_dashes_only_land_edges_of_outlines():
    # AA now includes the strip x 7..10; its outline's edge at x=7 is inside AA, the one at x=10 is
    # the border with BB, and the rest is coastline.
    countries = [("AA", box(0, 0, 10, 10), "A"), ("BB", box(10, 0, 20, 10), "B")]
    topo = borders.map_topology(countries, [("Strip", box(7, 0, 10, 10))])
    assert [g["id"] for g in topo["objects"]["countries"]["geometries"]] == ["AA", "BB"]
    (lines,) = topo["objects"]["disputed"]["geometries"]
    assert lines["type"] == "MultiLineString" and lines["properties"] == {"name": "Strip"}
    xs = {round(x, 3) for arc in lines["arcs"] for x, _ in borders._arc_coords(topo, arc[0])}
    assert xs == {7, 10}  # the cut line and the shared border; no coastline


def test_topology_is_deterministic():
    countries = [("AA", box(0, 0, 10, 10), "A"), ("BB", box(10, 0, 20, 10), "B")]
    outlines = [("Strip", box(7, 0, 10, 10))]
    assert borders.map_topology(countries, outlines) == borders.map_topology(countries, outlines)


def test_south_pole_edge_is_removed():
    # Natural Earth closes Antarctica with a cut down the antimeridian and an edge along -90°.
    ring = [(-180, -80), (0, -70), (180, -80), (180, -90), (0, -90), (-180, -90), (-180, -80)]
    geom = borders.unclip_pole(shape({"type": "Polygon", "coordinates": [ring]}))
    assert geom["type"] == "MultiPolygon"
    assert [list(map(list, ring)) for ring in geom["coordinates"][0]] == [[[-180, -80], [0, -70], [180, -80], [-180, -80]]]


def test_snap_area_aligns_with_country_edges():
    snapped = borders.snap_area(box(7, 0, 10.004, 10), [box(0, 0, 10, 10), box(10, 0, 20, 10)])
    assert snapped.bounds[2] == pytest.approx(10)
    assert snapped.contains(Point(8, 5))


def test_ring_starting_on_the_pole_edge_stays_closed():
    ring = [(0, -90), (-180, -90), (-180, -80), (0, -70), (180, -80), (180, -90), (0, -90)]
    (out,) = borders.unclip_pole(shape({"type": "Polygon", "coordinates": [ring]}))["coordinates"][0]
    assert list(out[0]) == list(out[-1]) and len(out) == 4
