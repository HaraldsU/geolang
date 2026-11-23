from pathlib import Path

PIPELINE_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = PIPELINE_DIR.parent
CACHE_DIR = PIPELINE_DIR / ".cache"
WEB_DIR = REPO_DIR / "web"
WEB_STATIC = WEB_DIR / "static"
DATA_OUT = WEB_STATIC / "data"
WORLD_TOPOLOGY_SRC = WEB_DIR / "node_modules" / "world-atlas" / "countries-50m.json"
WORLD_TOPOLOGY_OUT = WEB_STATIC / "world" / "countries-50m.json"
OVERRIDES_FILE = PIPELINE_DIR / "overrides.json"
