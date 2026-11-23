"""Country shapes under international law, with disputed areas outlined.

Natural Earth draws borders de facto (who controls an area). This module redraws them where a UN
resolution settles sovereignty (Crimea -> Ukraine, Golan Heights -> Syria, ...) and keeps the
administering country elsewhere, following `disputedAreas` in overrides.json. Every area in Natural
Earth's breakaway/disputed layer must be listed there, so each one is an explicit decision.

The map topology has two objects sharing arcs: `countries` (polygons) and `disputed` (one
MultiLineString per rule: the land edges of its areas, which the web app draws dashed instead of solid).
"""

from __future__ import annotations

import json
import subprocess
from collections import Counter
from collections.abc import Iterator
from dataclasses import dataclass
from typing import Any

import shapely
from shapely.geometry import MultiPolygon, Polygon, mapping, shape
from shapely.geometry.base import BaseGeometry
from shapely.ops import unary_union

from . import download
from .paths import CACHE_DIR, WEB_DIR

NE_VERSION = "v5.1.1"
NE_BASE = f"https://raw.githubusercontent.com/nvkelso/natural-earth-vector/{NE_VERSION}/geojson"
NE_COUNTRIES = "ne_50m_admin_0_countries"
NE_DISPUTED = "ne_50m_admin_0_breakaway_disputed_areas"
QUANTIZATION = 100_000  # as world-atlas
SNAP_DISTANCE = 0.005  # degrees: Natural Earth's disputed-areas edges are this close to country edges
WHOLE_SHARE = 0.99  # a polygon this much inside an area moves whole
SLIVER_WIDTH = 0.05  # degrees (~5 km): thinner pieces of a cut polygon are artefacts of the two layers
POLE_EDGE = -89.9  # latitude below which Natural Earth's ring points are its artificial polar edge
TOPOLOGY_SCRIPT = WEB_DIR / "scripts" / "topology.mjs"


def natural_earth(name: str) -> list[dict[str, Any]]:
    path = download.fetch(f"{NE_BASE}/{name}.geojson", CACHE_DIR / "naturalearth" / NE_VERSION / f"{name}.geojson")
    with open(path, encoding="utf-8") as f:
        return json.load(f)["features"]


@dataclass(frozen=True)
class Rule:
    name: str  # shown in notes, e.g. "Crimea"
    areas: tuple[str, ...]  # Natural Earth BRK_NAME values
    assign_to: str | None  # country the areas belong to; None keeps the administering country
    countries: tuple[str, ...]  # countries whose panel shows the note
    note: str | None
    dashed: bool  # outline the areas on the map
    outline_country: str | None  # also outline this whole country (e.g. Kosovo)


def parse_rules(overrides: dict[str, Any]) -> list[Rule]:
    rules = []
    for name, r in overrides.get("disputedAreas", {}).items():
        if name.startswith("_"):
            continue
        rules.append(Rule(
            name=name,
            areas=tuple(r.get("areas", [])),
            assign_to=r.get("assignTo"),
            countries=tuple(r.get("countries", [])),
            note=r.get("note"),
            dashed=r.get("dashed", True),
            outline_country=r.get("outlineCountry"),
        ))
    return rules


def _polygons(geom: BaseGeometry) -> list[Polygon]:
    """The polygons of geom (set operations can also return lines and points)."""
    return [p for part in getattr(geom, "geoms", [geom]) for p in getattr(part, "geoms", [part])
            if isinstance(p, Polygon) and not p.is_empty]


def _union(polys: list[Polygon]) -> BaseGeometry:
    return _merge(_polygons(unary_union(polys))) if polys else Polygon()


def _merge(polys: list[Polygon]) -> BaseGeometry:
    if not polys:
        return Polygon()
    return polys[0] if len(polys) == 1 else MultiPolygon(polys)


def snap_area(area: BaseGeometry, countries: list[BaseGeometry]) -> BaseGeometry:
    """Snap an area onto nearby country edges: the two layers' linework differs slightly."""
    near = [g.boundary for g in countries if g.intersects(area.buffer(SNAP_DISTANCE * 10))]
    snapped = shapely.make_valid(shapely.snap(area, unary_union(near), SNAP_DISTANCE))
    return _merge(_polygons(snapped))


def _sliver(geom: BaseGeometry) -> bool:
    """Thinner on average than SLIVER_WIDTH (mean width of a long strip ~ 2 * area / perimeter)."""
    return geom.length == 0 or 2 * geom.area / geom.length < SLIVER_WIDTH


def split(geom: BaseGeometry, area: BaseGeometry) -> tuple[BaseGeometry, BaseGeometry]:
    """(inside, outside) of geom cut by area. Polygons almost wholly on one side move whole, and
    slivers left by the cut join the other side, so the cut only follows real borders."""
    inside: list[Polygon] = []
    outside: list[Polygon] = []
    for part in _polygons(geom):
        if not part.intersects(area):
            outside.append(part)
            continue
        if part.intersection(area).area >= WHOLE_SHARE * part.area:
            inside.append(part)
        elif _sliver(part.intersection(area)):
            outside.append(part)
        else:
            ins = _polygons(part.intersection(area))
            out = _polygons(part.difference(area))
            inside += [p for p in ins if not _sliver(p)] + [p for p in out if _sliver(p)]
            outside += [p for p in out if not _sliver(p)] + [p for p in ins if _sliver(p)]
    return _union(inside), _union(outside)


Shape = tuple[str | None, str, BaseGeometry]  # (iso or None if not mapped, Natural Earth name, geometry)


def apply_rules(
    shapes: list[Shape], areas: dict[str, BaseGeometry], rules: list[Rule]
) -> tuple[list[Shape], list[tuple[str, BaseGeometry]]]:
    """Move the areas of rules with `assignTo` into that country (features left empty are dropped).
    Returns the shapes and the outlines (rule name, geometry) to draw dashed. Countries are cut
    along each outline, so outlines and countries share their edges exactly."""
    listed = {a for r in rules for a in r.areas}
    unlisted = sorted(set(areas) - listed)
    if unlisted:
        raise ValueError(f"Disputed areas without a rule in overrides.json disputedAreas: {unlisted}")
    unknown = sorted(listed - set(areas))
    if unknown:
        raise ValueError(f"disputedAreas lists areas Natural Earth does not have: {unknown}")

    shapes = list(shapes)
    snapped = {name: snap_area(a, [g for _, _, g in shapes]) for name, a in sorted(areas.items())}
    for rule in rules:
        if not rule.assign_to:
            continue
        target = next((i for i, (iso, _, _) in enumerate(shapes) if iso == rule.assign_to), None)
        if target is None:
            raise ValueError(f"disputedAreas[{rule.name!r}]: no country {rule.assign_to}")
        for area in (snapped[a] for a in rule.areas):
            moved = []
            for i, (iso, name, g) in enumerate(shapes):
                if i != target and g.intersects(area):
                    inside, outside = split(g, area)
                    moved += _polygons(inside)
                    shapes[i] = (iso, name, outside)
            iso, name, g = shapes[target]
            shapes[target] = (iso, name, _union(_polygons(g) + moved))
    shapes = [s for s in shapes if not s[2].is_empty]

    outlines: list[tuple[str, BaseGeometry]] = []
    for rule in rules:
        if not rule.dashed:
            continue
        for area in (snapped[a] for a in rule.areas):
            pieces = []
            for i, (iso, name, g) in enumerate(shapes):
                if g.intersects(area):
                    inside, outside = split(g, area)
                    if not inside.is_empty:
                        pieces += _polygons(inside)
                        shapes[i] = (iso, name, _union(_polygons(inside) + _polygons(outside)))
            if pieces:
                outlines.append((rule.name, _union(pieces)))
        if rule.outline_country:
            geoms = [g for iso, _, g in shapes if iso == rule.outline_country]
            if not geoms:
                raise ValueError(f"disputedAreas[{rule.name!r}]: no country {rule.outline_country}")
            outlines += [(rule.name, g) for g in geoms]
    return shapes, outlines


def country_disputes(rules: list[Rule]) -> dict[str, list[dict[str, str]]]:
    """Notes per country: [{"area": ..., "note": ...}], in rule order."""
    out: dict[str, list[dict[str, str]]] = {}
    for rule in rules:
        if rule.note:
            for iso in rule.countries:
                out.setdefault(iso, []).append({"area": rule.name, "note": rule.note})
    return out


def feature_collection(items: list[tuple[str | None, BaseGeometry, str]]) -> dict[str, Any]:
    """GeoJSON from (id or None, geometry, name) triples."""
    feats = []
    for fid, geom, name in items:
        polar = geom.bounds[1] <= POLE_EDGE
        f: dict[str, Any] = {
            "type": "Feature", "properties": {"name": name}, "geometry": unclip_pole(geom) if polar else mapping(geom),
        }
        if fid is not None:
            f["id"] = fid
        feats.append(f)
    return {"type": "FeatureCollection", "features": feats}


def topology(objects: dict[str, dict[str, Any]]) -> dict[str, Any]:
    """TopoJSON with shared arcs across objects, built by topojson-server (needs web/node_modules)."""
    result = subprocess.run(
        ["node", str(TOPOLOGY_SCRIPT)],
        input=json.dumps({"objects": objects, "quantization": QUANTIZATION}),
        capture_output=True, text=True, check=True, cwd=WEB_DIR,
    )
    return json.loads(result.stdout)


def area_shapes(features: list[dict[str, Any]]) -> dict[str, BaseGeometry]:
    return {f["properties"]["BRK_NAME"]: shape(f["geometry"]) for f in features}


def _arc_ids(geom: dict[str, Any]) -> Iterator[int]:
    def walk(x: Any) -> Iterator[int]:
        if isinstance(x, int):
            yield x if x >= 0 else ~x
        else:
            for y in x:
                yield from walk(y)
    return walk(geom.get("arcs", []))


def _arc_coords(topo: dict[str, Any], arc: int) -> list[tuple[float, float]]:
    (sx, sy), (tx, ty) = topo["transform"]["scale"], topo["transform"]["translate"]
    x = y = 0
    out = []
    for dx, dy in topo["arcs"][arc]:
        x, y = x + dx, y + dy
        out.append((x * sx + tx, y * sy + ty))
    return out


def unclip_pole(geom: BaseGeometry) -> dict[str, Any]:
    """GeoJSON geometry without the edge along the South Pole that Natural Earth adds to Antarctica.

    Planar data closes the ring around the pole with a cut down the antimeridian and a line along
    -90°. d3-geo works on the sphere: the coastline ring alone already encloses the pole, and the
    artificial edge makes Mercator fill the whole world instead of Antarctica."""
    data = mapping(geom)
    polys = data["coordinates"] if data["type"] == "MultiPolygon" else [data["coordinates"]]
    out = [[_closed([c for c in ring if c[1] > POLE_EDGE]) for ring in poly] for poly in polys]
    return {"type": "MultiPolygon", "coordinates": out}


def _closed(ring: list[Any]) -> list[Any]:
    return ring if not ring or ring[0] == ring[-1] else [*ring, ring[0]]


def map_topology(countries: list[tuple[str, BaseGeometry, str]], outlines: list[tuple[str, BaseGeometry]]) -> dict[str, Any]:
    """TopoJSON of the countries plus, per rule, the arcs of its outline that are land borders."""
    topo = topology({
        "countries": feature_collection(countries),
        "outlines": feature_collection([(None, g, name) for name, g in outlines]),
    })
    use = Counter(a for g in topo["objects"]["countries"]["geometries"] for a in _arc_ids(g))
    coast = unary_union([g for _, g, _ in countries]).boundary
    lines: dict[str, set[int]] = {}
    for g in topo["objects"].pop("outlines")["geometries"]:
        for arc in _arc_ids(g):
            # 1: a coastline. 0: inside one country (or an edge that missed the coast: skip those)
            if use[arc] == 1 or (use[arc] == 0 and _along(coast, _arc_coords(topo, arc))):
                continue
            lines.setdefault(g["properties"]["name"], set()).add(arc)
    topo["objects"]["disputed"] = {
        "type": "GeometryCollection",
        "geometries": [
            {"type": "MultiLineString", "arcs": [[a] for a in sorted(arcs)], "properties": {"name": name}}
            for name, arcs in lines.items()
        ],
    }
    return topo


def _along(line: BaseGeometry, coords: list[tuple[float, float]]) -> bool:
    """Does the polyline through coords stay within SNAP_DISTANCE of line?"""
    points = shapely.segmentize(shapely.LineString(coords), SNAP_DISTANCE).coords
    return all(line.distance(shapely.Point(c)) <= SNAP_DISTANCE for c in points)
