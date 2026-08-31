#!/usr/bin/env python3
"""Build the curated target catalogue used by Bussole's Random button."""

from __future__ import annotations

import argparse
import json
import math
import re
import urllib.parse
import urllib.request
from pathlib import Path


WIKIDATA_ENDPOINT = "https://query.wikidata.org/sparql"
WIKIPEDIA_ENDPOINT = "https://en.wikipedia.org/w/api.php"
USER_AGENT = "Bussole target catalogue builder/1.0 (mattesta.github.io/bussole)"

CAPITALS_QUERY = """
SELECT ?entity ?entityLabel ?iso ?capital ?capitalLabel ?coord WHERE {
  ?entity wdt:P297 ?iso; wdt:P36 ?capital.
  ?capital wdt:P625 ?coord.
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} ORDER BY ?iso ?capitalLabel
"""

CITIES_QUERY = """
SELECT DISTINCT ?city ?cityLabel ?countryLabel ?coord ?population ?sitelinks WHERE {
  VALUES ?class { wd:Q515 wd:Q1549591 wd:Q200250 wd:Q174844 wd:Q1637706 }
  ?city wdt:P31 ?class; wdt:P625 ?coord; wdt:P1082 ?population;
        wikibase:sitelinks ?sitelinks.
  OPTIONAL { ?city wdt:P17 ?country. }
  FILTER(?population >= 200000)
  FILTER(?sitelinks >= 30)
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} ORDER BY DESC(?sitelinks) LIMIT 1000
"""

LANDMARKS_QUERY = """
SELECT ?site ?siteLabel ?countryLabel ?coord ?sitelinks WHERE {
  ?site wdt:P1435 wd:Q9259; wdt:P625 ?coord; wikibase:sitelinks ?sitelinks.
  OPTIONAL { ?site wdt:P17 ?country. }
  FILTER(?sitelinks >= 15)
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} ORDER BY DESC(?sitelinks) LIMIT 800
"""

# Famous sights and natural features that are not reliably represented by the
# UNESCO query. Wikipedia supplies both coordinates and a Wikidata identifier,
# allowing deterministic de-duplication against the other sources.
EXTRA_LANDMARKS = {
    "Eiffel Tower": "France",
    "Louvre": "France",
    "Arc de Triomphe": "France",
    "Sacré-Cœur, Paris": "France",
    "Moulin Rouge": "France",
    "London Eye": "United Kingdom",
    "Big Ben": "United Kingdom",
    "Tower Bridge": "United Kingdom",
    "Buckingham Palace": "United Kingdom",
    "Stonehenge": "United Kingdom",
    "Trevi Fountain": "Italy",
    "Leaning Tower of Pisa": "Italy",
    "Milan Cathedral": "Italy",
    "St Mark's Basilica": "Italy",
    "Mount Vesuvius": "Italy",
    "Mount Etna": "Italy",
    "Sagrada Família": "Spain",
    "Park Güell": "Spain",
    "Brandenburg Gate": "Germany",
    "Neuschwanstein Castle": "Germany",
    "Atomium": "Belgium",
    "Little Mermaid (statue)": "Denmark",
    "Charles Bridge": "Czechia",
    "Hungarian Parliament Building": "Hungary",
    "Hallstatt": "Austria",
    "Matterhorn": "Switzerland",
    "Mount Olympus": "Greece",
    "Blue Mosque, Istanbul": "Türkiye",
    "Burj Khalifa": "United Arab Emirates",
    "Palm Jumeirah": "United Arab Emirates",
    "Sheikh Zayed Grand Mosque": "United Arab Emirates",
    "Kaaba": "Saudi Arabia",
    "Petra": "Jordan",
    "Dead Sea": "Israel / Jordan",
    "Mount Everest": "Nepal / China",
    "K2": "Pakistan / China",
    "Mount Kilimanjaro": "Tanzania",
    "Table Mountain": "South Africa",
    "Cape of Good Hope": "South Africa",
    "Victoria Falls": "Zambia / Zimbabwe",
    "Serengeti National Park": "Tanzania",
    "Sossusvlei": "Namibia",
    "Pyramids of Giza": "Egypt",
    "Taj Mahal": "India",
    "Lotus Temple": "India",
    "Gateway of India": "India",
    "Marina Bay Sands": "Singapore",
    "Gardens by the Bay": "Singapore",
    "Petronas Towers": "Malaysia",
    "Angkor Wat": "Cambodia",
    "Wat Arun": "Thailand",
    "Hạ Long Bay": "Vietnam",
    "Great Wall of China": "China",
    "Forbidden City": "China",
    "Terracotta Army": "China",
    "Shanghai Tower": "China",
    "Victoria Peak": "Hong Kong",
    "Taipei 101": "Taiwan",
    "Mount Fuji": "Japan",
    "Tokyo Tower": "Japan",
    "Tokyo Skytree": "Japan",
    "Fushimi Inari-taisha": "Japan",
    "N Seoul Tower": "South Korea",
    "Borobudur": "Indonesia",
    "Komodo National Park": "Indonesia",
    "Chocolate Hills": "Philippines",
    "Sydney Opera House": "Australia",
    "Sydney Harbour Bridge": "Australia",
    "Uluru": "Australia",
    "Great Barrier Reef": "Australia",
    "Sky Tower (Auckland)": "New Zealand",
    "Milford Sound": "New Zealand",
    "Statue of Liberty": "United States",
    "Empire State Building": "United States",
    "Times Square": "United States",
    "Central Park": "United States",
    "Golden Gate Bridge": "United States",
    "Hollywood Sign": "United States",
    "Mount Rushmore": "United States",
    "Grand Canyon": "United States",
    "Yellowstone National Park": "United States",
    "Yosemite National Park": "United States",
    "Space Needle": "United States",
    "Gateway Arch": "United States",
    "Niagara Falls": "Canada / United States",
    "CN Tower": "Canada",
    "Chichén Itzá": "Mexico",
    "Panama Canal": "Panama",
    "Christ the Redeemer (statue)": "Brazil",
    "Sugarloaf Mountain": "Brazil",
    "Iguazu Falls": "Argentina / Brazil",
    "Machu Picchu": "Peru",
    "Salar de Uyuni": "Bolivia",
    "Lake Titicaca": "Bolivia / Peru",
    "Moai": "Chile",
    "Angel Falls": "Venezuela",
    "Galápagos Islands": "Ecuador",
    "Aconcagua": "Argentina",
    "Cape Horn": "Chile",
    "North Cape (Norway)": "Norway",
    "Lake Baikal": "Russia",
}


def request_json(url: str) -> dict:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=120) as response:
        return json.load(response)


def sparql(query: str) -> dict:
    params = urllib.parse.urlencode({"query": query, "format": "json"})
    return request_json(f"{WIKIDATA_ENDPOINT}?{params}")


def read_or_fetch(path: str | None, query: str) -> dict:
    if path:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    return sparql(query)


def qid(value: str) -> str:
    return value.rsplit("/", 1)[-1]


def coordinates(wkt: str) -> tuple[float, float]:
    match = re.fullmatch(r"Point\(([-.0-9]+) ([-.0-9]+)\)", wkt)
    if not match:
        raise ValueError(f"Unsupported coordinate: {wkt}")
    return float(match.group(2)), float(match.group(1))


def safe_label(value: str, fallback: str) -> str:
    return fallback if re.fullmatch(r"Q\d+", value) else value


def target(source_id: str, name: str, country: str, category: str,
           lat: float, lon: float, weight: int) -> dict:
    return {
        "id": source_id.lower(),
        "name": name,
        "country": country,
        "category": category,
        "lat": round(lat, 6),
        "lon": round(lon, 6),
        "weight": weight,
    }


def wikipedia_landmarks() -> list[dict]:
    titles = list(EXTRA_LANDMARKS)
    results = []
    for offset in range(0, len(titles), 40):
        batch = titles[offset:offset + 40]
        params = urllib.parse.urlencode({
            "action": "query",
            "prop": "coordinates|pageprops",
            "ppprop": "wikibase_item",
            "titles": "|".join(batch),
            "format": "json",
            "formatversion": 2,
            "redirects": 1,
        })
        data = request_json(f"{WIKIPEDIA_ENDPOINT}?{params}")
        normalized = {entry["to"]: entry["from"] for entry in data.get("query", {}).get("redirects", [])}
        for page in data["query"]["pages"]:
            if page.get("missing") or not page.get("coordinates"):
                continue
            title = normalized.get(page["title"], page["title"])
            country = EXTRA_LANDMARKS.get(title, EXTRA_LANDMARKS.get(page["title"], ""))
            point = page["coordinates"][0]
            source_id = page.get("pageprops", {}).get("wikibase_item", f"wp-{page['pageid']}")
            results.append(target(source_id, page["title"], country, "landmark",
                                  point["lat"], point["lon"], 5))
    return results


def build(args: argparse.Namespace) -> list[dict]:
    capital_rows = read_or_fetch(args.capitals_json, CAPITALS_QUERY)["results"]["bindings"]
    city_rows = read_or_fetch(args.cities_json, CITIES_QUERY)["results"]["bindings"]
    landmark_rows = read_or_fetch(args.landmarks_json, LANDMARKS_QUERY)["results"]["bindings"]

    catalogue: list[dict] = []
    used_qids: set[str] = set()

    # Exclude dissolved states while retaining current remote dependencies and
    # territories. The Kingdom-level Netherlands record duplicates the country.
    seen_capitals: set[tuple[str, float, float]] = set()
    seen_capital_ids: set[str] = set()
    for row in capital_rows:
        entity_qid = qid(row["entity"]["value"])
        if row["iso"]["value"] in {"AN", "DD", "YU"} or entity_qid == "Q29999":
            continue
        capital_qid = qid(row["capital"]["value"])
        pair_id = f"{capital_qid}-{entity_qid}"
        if pair_id in seen_capital_ids:
            continue
        seen_capital_ids.add(pair_id)
        lat, lon = coordinates(row["coord"]["value"])
        name = safe_label(row["capitalLabel"]["value"], "St. John's")
        signature = (name, round(lat, 6), round(lon, 6))
        if signature in seen_capitals:
            continue
        seen_capitals.add(signature)
        country = row["entityLabel"]["value"]
        catalogue.append(target(pair_id, name, country, "capital", lat, lon, 3))
        used_qids.add(capital_qid)

    seen_cities: set[str] = set()
    for row in city_rows:
        city_qid = qid(row["city"]["value"])
        if city_qid in used_qids or city_qid in seen_cities:
            continue
        seen_cities.add(city_qid)
        rank = len(seen_cities)
        if rank > 220:
            break
        lat, lon = coordinates(row["coord"]["value"])
        sitelinks = int(row["sitelinks"]["value"])
        weight = 6 if rank <= 40 else 4 if rank <= 100 else 2 if rank <= 160 else 1
        catalogue.append(target(
            city_qid,
            row["cityLabel"]["value"],
            row.get("countryLabel", {}).get("value", ""),
            "city", lat, lon, weight,
        ))
        used_qids.add(city_qid)

    seen_landmarks: set[str] = set()
    for row in landmark_rows:
        site_qid = qid(row["site"]["value"])
        if site_qid in used_qids or site_qid in seen_landmarks:
            continue
        seen_landmarks.add(site_qid)
        rank = len(seen_landmarks)
        if rank > 350:
            break
        lat, lon = coordinates(row["coord"]["value"])
        weight = 4 if rank <= 75 else 3 if rank <= 175 else 2 if rank <= 275 else 1
        catalogue.append(target(
            site_qid,
            row["siteLabel"]["value"],
            row.get("countryLabel", {}).get("value", ""),
            "landmark", lat, lon, weight,
        ))
        used_qids.add(site_qid)

    for item in wikipedia_landmarks():
        raw_qid = item["id"].upper()
        if raw_qid in used_qids:
            continue
        catalogue.append(item)
        used_qids.add(raw_qid)

    catalogue.sort(key=lambda item: (item["category"], item["name"].casefold(), item["id"]))
    return catalogue


def validate(catalogue: list[dict]) -> None:
    ids = set()
    for item in catalogue:
        assert item["id"] not in ids, f"Duplicate id: {item['id']}"
        ids.add(item["id"])
        assert item["category"] in {"capital", "city", "landmark"}
        assert item["name"] and item["country"]
        assert math.isfinite(item["lat"]) and -90 <= item["lat"] <= 90
        assert math.isfinite(item["lon"]) and -180 <= item["lon"] <= 180
        assert 1 <= item["weight"] <= 6

    assert any(item["name"] == "Adamstown" and "Pitcairn" in item["country"] for item in catalogue)
    counts = {category: sum(item["category"] == category for item in catalogue)
              for category in ("capital", "city", "landmark")}
    assert counts["capital"] >= 240, counts
    assert counts["city"] >= 180, counts
    assert counts["landmark"] >= 300, counts


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--capitals-json")
    parser.add_argument("--cities-json")
    parser.add_argument("--landmarks-json")
    parser.add_argument("--output", default="targets.js")
    args = parser.parse_args()

    catalogue = build(args)
    validate(catalogue)
    counts = {category: sum(item["category"] == category for item in catalogue)
              for category in ("capital", "city", "landmark")}
    banner = (
        "// Generated by scripts/build_targets.py from Wikidata and English Wikipedia.\n"
        f"// {len(catalogue)} targets: {counts['capital']} capitals, "
        f"{counts['city']} famous cities, {counts['landmark']} landmarks.\n"
        "window.BUSSOLE_TARGETS = "
    )
    Path(args.output).write_text(
        banner + json.dumps(catalogue, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )
    print(json.dumps({"total": len(catalogue), **counts}, indent=2))


if __name__ == "__main__":
    main()
