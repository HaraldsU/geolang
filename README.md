# geolang

**Type a word, see it in every country's language.** geolang is an interactive world map: enter
a word and each country shows how it is written in its **national official language(s)**, in
Latin script (romanized) or in the language's own script.

**Live: <https://geolang.pages.dev>**

- Search in any language or script (`hello`, `bonjour`, `hola` or `привет` all find the same concept)
- Words with several meanings (*bank*: money / river) can be switched between senses
- Latin or native script, Mercator or Equal Earth projection, light or dark theme
- Click a country for all its official languages and their forms; missing translations show **N/A**
- The URL holds the search and settings (`/?q=hello&script=native`), so any view can be shared
- Works on phones and tablets; no accounts, no cookies

## How it works

There is no backend and no translation at runtime. All data is **precomputed** from open
dictionaries and served as static files:

1. The Python **pipeline** reads the English Wiktionary translation tables (via kaikki.org) and
   Unicode CLDR, groups translations into concepts (about 146,000), romanizes them, and maps each
   country to its national official languages.
2. It writes the result as **hash-sharded JSON** (4,096 index shards + 4,096 concept shards,
   about 400 MB in total). This is why a data build has thousands of small files.
3. In the browser, a search hashes the normalised word, downloads the one small index shard it
   falls into and then one concept shard: a few KB per search instead of a 400 MB dictionary.
4. The map is drawn on a canvas (with a cached bitmap for smooth panning) under an invisible SVG
   layer for hit-testing and accessibility; labels are placed so they don't overlap.

## Accuracy

Translations come from Wiktionary, written by volunteers, and are shown as listed there without
further checking, so some may be wrong, unusual or misspelled. Select a country and use **Report
a wrong translation**: it opens a pre-filled GitHub issue here. Fixes that can't wait for
Wiktionary go in `pipeline/overrides.json`.

Editorial choices:

- **Languages:** only national-level official languages (CLDR `official` + `de_facto_official`).
  Regional ones (e.g. Catalan in Spain, Tamil in India) are left out. Corrections (e.g. South
  Africa's 11 national languages) live in `pipeline/overrides.json`.
- **Borders** follow international law as reflected in UN resolutions (e.g. Crimea is shown in
  Ukraine). Where there is no settled answer (e.g. Kashmir) the administering country is kept.
  Every disputed area is an explicit `disputedAreas` entry in `pipeline/overrides.json`, drawn
  dashed on the map with a note in the country panel.

## Data sources and licences

| Data | Source | Licence |
|---|---|---|
| Translations | English Wiktionary translation tables via [kaikki.org](https://kaikki.org/) (wiktextract) | CC BY-SA 4.0 |
| Gap filling for nouns | Wikidata item labels (only senses Wiktionary links to an item) | CC0 |
| Official languages | Unicode CLDR `territoryInfo` + `pipeline/overrides.json` | Unicode License v3 |
| Map | Natural Earth 1:50m v5.1.1 (countries + breakaway/disputed areas) | Public domain |
| Fonts | Noto (self-hosted via Fontsource); subsets of Noto Sans CJK and Plangothic for rare Han characters | SIL OFL 1.1 |

The **code** is under the [MIT License](LICENSE). The generated **translation data** (and the
small fixture dataset in `web/e2e/fixtures/data`) is derived from Wiktionary and stays under
**CC BY-SA 4.0**; reuse it with attribution and under the same licence.

## Project layout

```
geolang/
├── pipeline/   Python, run offline: CLDR → official languages; Wiktionary (+Wikidata) → concepts;
│               romanization; sharded JSON output into web/static/data/; fallback fonts; coverage
├── web/        SvelteKit static site (Svelte 5, d3-geo): map, search, labels, country panel
│   ├── e2e/    Playwright tests (+ screenshot baselines and a small fixture dataset)
│   └── perf/   pan benchmark (`npm run bench:pan`), not part of CI
├── shared/     test vectors that keep Python and TypeScript normalisation/hashing in sync
└── .github/    CI (pytest, lint/types/Vitest, Playwright on 6 browsers/devices) and deploy
```

Generated and downloaded files (`web/static/data/v*/`, `web/build/`, `pipeline/.cache/`,
`node_modules/`, virtualenvs) are gitignored; the repository itself is about 150 files.

## Development

Requirements: Node 22, Python ≥ 3.12 with ICU (`libicu-dev` + `pkg-config` on Debian/Ubuntu),
Docker (optional, for WebKit tests on non-Ubuntu Linux).

```sh
# web app
cd web && npm install
npm run dev                      # http://localhost:5173
```

Without the translation data the site still runs, but searches find nothing. To build the data
(about 15 minutes and 1 GB of downloads):

```sh
cd pipeline
python -m venv .venv && .venv/bin/pip install -e '.[dev]'
.venv/bin/python -m geolang languages      # countries.json, languages.json, map topology (needs web/node_modules)
curl -L -o .cache/kaikki/English.jsonl.gz --create-dirs \
  https://kaikki.org/dictionary/English/kaikki.org-dictionary-English.jsonl.gz
.venv/bin/python -m geolang translations   # ~3 min + Wikidata label fetch (cached)
#   Wikidata rate-limits anonymous clients; set GEOLANG_CONTACT=<url or e-mail> to identify yourself
.venv/bin/python -m geolang fonts          # fallback font for rare Han characters (needs web/node_modules)
.venv/bin/python -m geolang coverage       # coverage report for the 1,000 most common words
```

The E2E tests use a small fixture dataset built by the pipeline (`web/e2e/fixtures/data`):
`translations --input tests/fixtures/wiktionary-sample.jsonl --out ../web/e2e/fixtures/data
--version vfixture --index-shards 8 --concept-shards 8 --min-translations 1 --no-wikidata`, then
`fonts --out ../web/e2e/fixtures/data`.

## Tests

| Suite | Command | What it covers |
|---|---|---|
| Pipeline | `cd pipeline && .venv/bin/python -m pytest` | language mapping, extraction, romanization, sharding, Wikidata, coverage |
| Unit | `cd web && npm run test:unit` | normalisation/hash parity with Python, lookup, label layout, map geometry and caching |
| E2E | `cd web && npm run test:e2e` | map, panning, responsive layout, search, toggles, N/A, URL state, fonts/RTL, CSP, a11y |
| E2E (all browsers in Docker) | `cd web && npm run test:e2e:docker` | same, incl. WebKit (Safari/iPhone/iPad) with CI-identical screenshots |
| Everything | `web/scripts/test-all.sh` | all of the above (E2E in Docker), with one shared build; prints a summary |

Playwright projects: Desktop Chrome, Firefox and Safari, Pixel 7, iPhone 14, iPad. Update the
screenshot baselines with `npm run test:e2e:docker -- --update-snapshots`.

## Privacy and security

The site is static, with no accounts, cookies or secrets: searches are answered from static data
files whose names don't reveal the word. Visits are counted with
[Cloudflare Web Analytics](https://www.cloudflare.com/web-analytics/) (cookieless, anonymous page
views, enabled in the Pages dashboard, not in this repo), the only third party the site talks to.
A page view includes the page address, which holds the current search (`?q=…`), so searched
words can appear in those statistics. It ships a hash-based
Content-Security-Policy (no unhashed inline scripts, no other third-party hosts) plus the
headers in `web/static/_headers`, and dictionary text is always rendered as text, never as HTML.

## Contributing

Issues and pull requests are welcome, especially reports of wrong translations or missing
official languages. Please run the relevant tests (see [Tests](#tests)) before opening a pull
request; CI runs all of them on every push.

## Licence

Code: [MIT](LICENSE). Translation data: CC BY-SA 4.0 (Wiktionary). Map: public domain (Natural
Earth). Fonts: SIL OFL 1.1.
