"""Cached downloads of upstream data sources."""

from __future__ import annotations

import json
import os
import shutil
import urllib.request
from pathlib import Path
from typing import Any

from .paths import CACHE_DIR

CLDR_VERSION = "49.0.0"
CLDR_BASE = f"https://raw.githubusercontent.com/unicode-org/cldr-json/{CLDR_VERSION}/cldr-json"

CLDR_FILES = {
    "territoryInfo": f"{CLDR_BASE}/cldr-core/supplemental/territoryInfo.json",
    "languageData": f"{CLDR_BASE}/cldr-core/supplemental/languageData.json",
    "codeMappings": f"{CLDR_BASE}/cldr-core/supplemental/codeMappings.json",
    "languageNames": f"{CLDR_BASE}/cldr-localenames-full/main/en/languages.json",
}

# Wikimedia asks API clients to identify themselves; set GEOLANG_CONTACT (a URL or e-mail) to get
# less aggressive rate limiting from Wikidata.
USER_AGENT = f"geolang-pipeline/0.1 ({os.environ.get('GEOLANG_CONTACT', 'offline data build')})"


def fetch(url: str, dest: Path) -> Path:
    """Download url to dest unless it already exists."""
    if dest.exists() and dest.stat().st_size > 0:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=120) as resp, open(tmp, "wb") as out:
        shutil.copyfileobj(resp, out)
    tmp.replace(dest)
    return dest


def cldr_json(name: str) -> dict[str, Any]:
    path = fetch(CLDR_FILES[name], CACHE_DIR / "cldr" / CLDR_VERSION / f"{name}.json")
    with open(path, encoding="utf-8") as f:
        return json.load(f)
