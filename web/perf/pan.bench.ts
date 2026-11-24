import { test, expect, type Page } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

/**
 * Pan benchmark: drags the map at several zoom levels, one mouse move per animation frame (as a
 * real drag delivers them), and records frame intervals, long animation frames (Chromium) and
 * the app's own `performance.measure` entries (map:paint, map:cache, labels:layout).
 * See playwright.config.ts in this folder for how to run and compare.
 */

const WORD = 'water'; // in most languages: nearly every country is tinted and labelled
const ZOOMS = [1, 2.5, 6];
const PATTERNS = ['steady', 'fling'] as const;
const SECONDS = 2.4;
const CPU_THROTTLE = 4; // Chromium only: roughly a mid-range phone
const RESULTS = new URL('./results/', import.meta.url);

type Pattern = (typeof PATTERNS)[number];

interface Stat {
	n: number;
	sum: number;
	p50: number;
	p95: number;
	max: number;
}

interface Result {
	scenario: string;
	k: number;
	frames: Stat & { droppedPct: number };
	loaf: { count: number; blockingMs: number; where: Record<string, number> };
	measures: Record<string, Stat>;
}

function stat(values: number[]): Stat {
	const v = [...values].sort((a, b) => a - b);
	const q = (p: number) => (v.length ? v[Math.min(v.length - 1, Math.floor(p * v.length))] : 0);
	const r = (x: number) => Math.round(x * 100) / 100;
	return {
		n: v.length,
		sum: r(v.reduce((s, x) => s + x, 0)),
		p50: r(q(0.5)),
		p95: r(q(0.95)),
		max: r(v.at(-1) ?? 0)
	};
}

async function zoomTo(page: Page, k: number) {
	const wheelStep = 2 ** 0.2; // d3-zoom: deltaY -100 in pixel mode
	const events = Math.round(Math.log(k) / Math.log(wheelStep));
	if (!events) return;
	await page.evaluate((events) => {
		const svg = document.querySelector('[data-testid="world-map"]')!;
		const r = svg.getBoundingClientRect();
		for (let i = 0; i < events; i++) {
			svg.dispatchEvent(
				new WheelEvent('wheel', {
					deltaY: -100,
					clientX: r.x + r.width * 0.52, // Europe and Africa: many small countries
					clientY: r.y + r.height * 0.35,
					bubbles: true,
					cancelable: true
				})
			);
		}
	}, events);
}

async function settled(page: Page) {
	await expect(page.getByTestId('world-map')).toHaveAttribute('data-moving', 'false');
	await page.waitForTimeout(600); // labels and geometry re-laid out after the gesture
}

/** Drag the map in the page for `seconds`, one move per frame; returns raw timings. */
function drag(page: Page, pattern: Pattern, seconds: number) {
	return page.evaluate(
		async ({ pattern, seconds }) => {
			const svg = document.querySelector('[data-testid="world-map"]')!;
			const r = svg.getBoundingClientRect();
			const cx = r.x + r.width / 2;
			const cy = r.y + r.height / 2;
			const amp = r.width * 0.2; // stays within the pannable area even at zoom 1
			const at = (s: number): [number, number] => {
				if (pattern === 'steady') {
					return [
						Math.sin((2 * Math.PI * s) / 1.6) * amp,
						Math.sin((2 * Math.PI * s) / 2.3) * amp * 0.4
					];
				}
				// fling: a fast 0.2 s swipe, then a pause long enough for the map to "settle"
				const phase = Math.floor(s / 0.45);
				const into = Math.min(1, (s - phase * 0.45) / 0.2);
				const dir = phase % 2 ? -1 : 1;
				return [dir * (2 * into - 1) * amp, dir * (2 * into - 1) * amp * 0.3];
			};
			const mouse = (type: string, [x, y]: [number, number], target: EventTarget) =>
				target.dispatchEvent(
					new MouseEvent(type, {
						clientX: cx + x,
						clientY: cy + y,
						bubbles: true,
						cancelable: true,
						view: window,
						button: 0
					})
				);

			performance.clearMeasures();
			const loaf: {
				duration: number;
				blockingDuration: number;
				styleAndLayoutStart: number;
				renderStart: number;
				startTime: number;
				scripts: { invoker: string; sourceFunctionName: string; duration: number }[];
			}[] = [];
			let observer: PerformanceObserver | null = null;
			try {
				observer = new PerformanceObserver((list) =>
					loaf.push(...(list.getEntries() as unknown as typeof loaf))
				);
				observer.observe({ type: 'long-animation-frame' });
			} catch {
				// not supported (Firefox, WebKit)
			}

			const frames: number[] = [];
			let last = at(0);
			mouse('mousedown', last, svg);
			await new Promise<void>((resolve) => {
				let t0: number | undefined;
				let prev = 0;
				const step = (t: number) => {
					if (t0 === undefined) t0 = t;
					else frames.push(t - prev);
					prev = t;
					const s = (t - t0) / 1000;
					if (s >= seconds) return resolve();
					const next = at(s);
					if (next[0] !== last[0] || next[1] !== last[1]) mouse('mousemove', next, window);
					last = next;
					requestAnimationFrame(step);
				};
				requestAnimationFrame(step);
			});
			mouse('mouseup', last, window);
			// entries of the last frames arrive asynchronously
			await new Promise((r) => setTimeout(r, 100));
			observer?.disconnect();

			const measures: Record<string, number[]> = {};
			for (const m of performance.getEntriesByType('measure')) {
				(measures[m.name] ??= []).push(m.duration);
			}
			// where long frames spent their time: scripts by entry point, and rendering
			const where: Record<string, number> = {};
			for (const e of loaf) {
				for (const sc of e.scripts) {
					const key = `${sc.invoker} ${sc.sourceFunctionName}`.trim();
					where[key] = (where[key] ?? 0) + sc.duration;
				}
				if (e.renderStart) {
					const render = e.startTime + e.duration - e.renderStart;
					where['(rendering: rAF, style, layout)'] =
						(where['(rendering: rAF, style, layout)'] ?? 0) + render;
				}
			}
			return {
				frames,
				where,
				loaf: loaf.map((e) => e.blockingDuration),
				measures,
				k: Number(svg.getAttribute('data-zoom'))
			};
		},
		{ pattern, seconds }
	);
}

function pad(s: string | number, n: number) {
	return String(s).padStart(n);
}

function report(project: string, results: Result[], base: Result[] | null) {
	const names = [...new Set(results.flatMap((r) => Object.keys(r.measures)))].sort();
	const was = (r: Result, pick: (r: Result) => number) => {
		const b = base?.find((x) => x.scenario === r.scenario);
		return b ? `${pick(b)}→` : '';
	};
	const lines = [
		`\n${project}`,
		[
			'scenario'.padEnd(14),
			pad('frame p50', 12),
			pad('p95', 14),
			pad('max', 14),
			pad('dropped%', 12),
			pad('LoAF ms', 14),
			...names.map((n) => pad(`${n} Σms (n)`, 26))
		].join(' ')
	];
	for (const r of results) {
		lines.push(
			[
				r.scenario.padEnd(14),
				pad(was(r, (x) => x.frames.p50) + r.frames.p50, 12),
				pad(was(r, (x) => x.frames.p95) + r.frames.p95, 14),
				pad(was(r, (x) => x.frames.max) + r.frames.max, 14),
				pad(was(r, (x) => x.frames.droppedPct) + r.frames.droppedPct, 12),
				pad(was(r, (x) => x.loaf.blockingMs) + r.loaf.blockingMs, 14),
				...names.map((n) => {
					const m = r.measures[n];
					const b = base?.find((x) => x.scenario === r.scenario)?.measures[n];
					const now = m ? `${Math.round(m.sum)} (${m.n})` : '-';
					return pad(b ? `${Math.round(b.sum)} (${b.n})→${now}` : now, 26);
				})
			].join(' ')
		);
	}
	for (const r of results) {
		if (Object.keys(r.loaf.where).length) {
			lines.push(`  long frames in ${r.scenario}: ${JSON.stringify(r.loaf.where)}`);
		}
	}
	console.log(lines.join('\n'));
}

test('pan', async ({ page, browserName }, info) => {
	const results: Result[] = [];
	await page.addInitScript(() => ((window as { __geolangPerf?: boolean }).__geolangPerf = true));
	for (const zoom of ZOOMS) {
		await page.goto('/');
		await expect(page.getByTestId('world-map')).toHaveAttribute('data-ready', 'true');
		const input = page.getByTestId('search-input');
		await input.fill(WORD);
		await input.press('Enter');
		await expect(page.getByTestId('status')).toHaveAttribute('data-status', 'done', {
			timeout: 30_000
		});
		await zoomTo(page, zoom);
		await settled(page);

		const cdp = browserName === 'chromium' ? await page.context().newCDPSession(page) : null;
		for (const pattern of PATTERNS) {
			await cdp?.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE });
			const raw = await drag(page, pattern, SECONDS);
			await cdp?.send('Emulation.setCPUThrottlingRate', { rate: 1 });
			await settled(page);
			const frames = stat(raw.frames);
			results.push({
				scenario: `k=${zoom} ${pattern}`,
				k: raw.k,
				frames: {
					...frames,
					droppedPct: Math.round((raw.frames.filter((f) => f > 25).length / frames.n) * 1000) / 10
				},
				loaf: {
					count: raw.loaf.length,
					blockingMs: Math.round(raw.loaf.reduce((s, x) => s + x, 0)),
					where: Object.fromEntries(
						Object.entries(raw.where)
							.sort((a, b) => b[1] - a[1])
							.slice(0, 5)
							.map(([k, v]) => [k, Math.round(v)])
					)
				},
				measures: Object.fromEntries(Object.entries(raw.measures).map(([n, v]) => [n, stat(v)]))
			});
		}
		await cdp?.detach();
	}

	const label = process.env.BENCH_LABEL ?? new Date().toISOString().replace(/[:.]/g, '-');
	await mkdir(RESULTS, { recursive: true });
	const file = new URL(`${label}-${info.project.name}.json`, RESULTS);
	await writeFile(file, JSON.stringify({ project: info.project.name, results }, null, '\t'));

	let base: Result[] | null = null;
	if (process.env.BENCH_COMPARE) {
		const compare = new URL(`${process.env.BENCH_COMPARE}-${info.project.name}.json`, RESULTS);
		base = JSON.parse(await readFile(compare, 'utf8')).results;
	}
	report(info.project.name, results, base);
	console.log(`saved ${file.pathname}`);
});
