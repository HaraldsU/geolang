#!/usr/bin/env bash
# Run Playwright E2E tests inside the official Playwright image (all browsers incl. WebKit,
# identical fonts to CI so screenshot baselines match). Extra args go to `playwright test`.
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION=$(node -p "require('@playwright/test/package.json').version")
exec docker run --rm --ipc=host --init \
	--user "$(id -u):$(id -g)" -e HOME=/tmp -e CI="${CI:-}" -e E2E_PREBUILT="${E2E_PREBUILT:-}" \
	-v "$PWD:/work" -w /work \
	"mcr.microsoft.com/playwright:v${VERSION}-noble" \
	node node_modules/@playwright/test/cli.js test "$@"
