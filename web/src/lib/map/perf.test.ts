import { afterEach, describe, expect, it, vi } from 'vitest';
import { measure } from './perf.js';

describe('measure', () => {
	afterEach(() => {
		delete (globalThis as { __geolangPerf?: boolean }).__geolangPerf;
		vi.restoreAllMocks();
	});

	it('records nothing unless the page asks for it', () => {
		const spy = vi.spyOn(performance, 'measure');
		measure('map:paint', performance.now());
		expect(spy).not.toHaveBeenCalled();
	});

	it('records a measure when enabled', () => {
		(globalThis as { __geolangPerf?: boolean }).__geolangPerf = true;
		const spy = vi.spyOn(performance, 'measure');
		measure('map:paint', performance.now());
		expect(spy).toHaveBeenCalledWith(
			'map:paint',
			expect.objectContaining({ start: expect.any(Number) })
		);
	});
});
