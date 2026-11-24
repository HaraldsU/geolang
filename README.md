# geolang

An interactive world map: type a word in any language or script and every country shows how
that word is written in its **national official language(s)**, in Latin script (romanized, the
default) or in the language's native script. Missing translations show **N/A**.

There is no backend and no runtime translation: all data is **precomputed** from open
dictionaries and served as static files.

```
geolang/
├── pipeline/   Python, run offline: CLDR → official languages; Wiktionary (+Wikidata) → concepts;
│               romanization; hash-sharded JSON output into web/static/data/
├── web/        SvelteKit static site: d3-geo SVG map, search, Latin/native toggle, responsive UI
├── shared/     test vectors that keep Python and TypeScript normalisation/hashing in sync
└── .github/    CI (pytest, lint/types/vitest, Playwright on 6 browsers/devices) and deploy
```

## Data sources

| Data | Source | Licence |
|---|---|---|
| Translations | English Wiktionary translation tables via [kaikki.org](https://kaikki.org/) | CC BY-SA 4.0 |
| Gap filling for nouns | Wikidata item labels (only senses Wiktionary links to an item) | CC0 |
| Official languages | Unicode CLDR `territoryInfo` (`official` + `de_facto_official`) + `pipeline/overrides.json` | Unicode v3 |
| Map | Natural Earth 1:50m v5.1.1 (countries + breakaway/disputed areas), borders redrawn per `disputedAreas` in `pipeline/overrides.json` | Public domain |
| Fonts | Noto (self-hosted via Fontsource); subsets of Noto Sans CJK and Plangothic for rare Han characters (`python -m geolang fonts`) | OFL |

Borders follow international law as reflected in UN resolutions (e.g. Crimea is shown in Ukraine);
where there is no settled answer (e.g. Kashmir) the administering country is kept. Every disputed area
is an explicit entry in `pipeline/overrides.json` (`disputedAreas`), outlined dashed on the map with
a note in the country panel. Only national-level official languages are used; regional ones (e.g. Catalan in Spain, Tamil in
India) are excluded. Manual corrections (e.g. South Africa's 11 national languages) live in
`pipeline/overrides.json`.

## Development

Requirements: Node 22, Python ≥ 3.12 with ICU (`libicu-dev` + `pkg-config` on Debian/Ubuntu),
Docker (optional, for WebKit tests on non-Ubuntu Linux).

```sh
# web app
cd web && npm install
npm run dev                      # http://localhost:5173

# data pipeline
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

Without the full data build the site still runs; searches just find nothing. The E2E tests use a
small fixture dataset built by the pipeline (`web/e2e/fixtures/data`): `translations --input
tests/fixtures/wiktionary-sample.jsonl --out ../web/e2e/fixtures/data --version vfixture
--index-shards 8 --concept-shards 8 --min-translations 1 --no-wikidata`, then `fonts --out
../web/e2e/fixtures/data`.

## Tests

| Suite | Command | What it covers |
|---|---|---|
| Pipeline | `cd pipeline && .venv/bin/python -m pytest` | language mapping, extraction, romanization, sharding, Wikidata, coverage |
| Unit | `cd web && npm run test:unit` | normalisation/hash parity with Python, lookup, label layout, label data |
| E2E | `cd web && npm run test:e2e` | map, responsive layout, search, toggle, N/A, URL state, fonts/RTL, CSP, a11y |
| E2E (all browsers in Docker) | `cd web && npm run test:e2e:docker` | same, incl. WebKit (Safari/iPhone/iPad) with CI-identical screenshots |
| Everything | `web/scripts/test-all.sh` | all of the above (E2E in Docker), with independent steps side by side and one shared build; prints a summary |

Playwright projects: Desktop Chrome, Firefox and Safari, Pixel 7, iPhone 14, iPad. Update the
screenshot baselines with `npm run test:e2e:docker -- --update-snapshots`.

## Deployment (Cloudflare Pages)

`.github/workflows/deploy.yml` rebuilds the data monthly (and on pushes to `main`), deploys
`web/build` to Cloudflare Pages and runs production smoke tests. One-time setup:

1. Create a Cloudflare Pages project (direct upload) and attach your domain.
2. Add repository secrets `CLOUDFLARE_API_TOKEN` (Pages: Edit) and `CLOUDFLARE_ACCOUNT_ID`.
3. Add repository variables `CLOUDFLARE_PROJECT` (project name) and `PRODUCTION_URL`.

Security: the site is static with no secrets, cookies or third-party requests. It ships a
hash-based Content-Security-Policy (no inline scripts allowed) plus the headers in
`web/static/_headers`; corpus text is always rendered as text, never as HTML.
