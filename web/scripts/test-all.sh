#!/usr/bin/env bash
# Run the whole test suite with independent steps side by side:
#   pipeline pytest | lint + svelte-check | Vitest | production build -> E2E on all 6 projects
# The E2E run serves the build made here instead of building again. The tests and their settings
# are the same as running each step on its own. Extra arguments go to `playwright test`.
# Prints a summary, keeps full logs, and exits non-zero if any step fails.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LOGS="${TEST_LOGS:-$(mktemp -d -t geolang-tests.XXXXXX)}"
mkdir -p "$LOGS"
rm -f "$LOGS"/*.rc # a reused TEST_LOGS must not leak an old result into the summary
START=$SECONDS

pytest_step() { cd "$ROOT/pipeline" && .venv/bin/python -m pytest -q; }
lint_step() { cd "$ROOT/web" && npm run lint; }
unit_step() { cd "$ROOT/web" && npm run test:unit; }
# E2E build: word pages from the fixture data, as in playwright.config.ts
build_step() { cd "$ROOT/web" && GEOLANG_DATA_DIR=e2e/fixtures/data npm run build; }
e2e_step() { cd "$ROOT/web" && E2E_PREBUILT=1 scripts/e2e-docker.sh --reporter=line "$@"; }

# run <name> <step> [args]: log to $LOGS/<name>.log, record "<exit code> <seconds>" in <name>.rc
run() {
	local name=$1 started=$SECONDS
	shift
	("$@") >"$LOGS/$name.log" 2>&1
	local rc=$?
	echo "$rc $((SECONDS - started))" >"$LOGS/$name.rc"
	return $rc
}

steps=(pytest lint unit build e2e)
run pytest pytest_step &
run lint lint_step &
run unit unit_step &
# E2E needs the build; if the build fails, E2E is not run
(run build build_step && run e2e e2e_step "$@") &
wait

# Summary: the step's own result line, so nothing is hidden behind a "pass"
summary() {
	local log="$LOGS/$1.log"
	case $1 in
	pytest) grep -E '[0-9]+ (passed|failed)' "$log" | tail -1 ;;
	lint) grep -E 'COMPLETED' "$log" | tail -1 | sed -E 's/^[0-9]+ COMPLETED /svelte-check: /' ;;
	unit) grep -E '^\s*Tests\s' "$log" | tail -1 ;;
	build) grep -E 'Wrote site|built in' "$log" | tail -1 ;;
	e2e) grep -E '^\s*[0-9]+ (passed|failed|flaky|skipped|did not run)' "$log" | tr -s ' \n' ' ' ;;
	esac
}
failed=0
printf '\n%-7s %-6s %5s  %s\n' step result time summary
for s in "${steps[@]}"; do
	if [ -f "$LOGS/$s.rc" ]; then
		read -r rc secs <"$LOGS/$s.rc"
		[ "$rc" = 0 ] && result=pass || { result=FAIL; failed=1; }
		line=$(summary "$s" | sed 's/^\s*//')
		# no result line (e.g. a crash): show the log's last line instead
		[ -n "$line" ] || line=$(grep -v '^\s*$' "$LOGS/$s.log" | tail -1)
		printf '%-7s %-6s %4ss  %s\n' "$s" "$result" "$secs" "$line"
	else
		printf '%-7s %-6s %5s  %s\n' "$s" "SKIP" "-" "not run (build failed or interrupted)"
		failed=1
	fi
done
echo "total $((SECONDS - START))s; logs in $LOGS"
exit $failed
