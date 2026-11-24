/**
 * Timing marks for perf/pan.bench.ts and DevTools. The browser keeps every measure forever, so
 * they are only recorded when the page sets `__geolangPerf` (the benchmark does).
 */
export function measure(name: string, start: number): void {
	if ((globalThis as { __geolangPerf?: boolean }).__geolangPerf) {
		performance.measure(name, { start });
	}
}
