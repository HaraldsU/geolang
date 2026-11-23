<script lang="ts">
	import { onMount } from 'svelte';
	import { replaceState } from '$app/navigation';
	import WorldMap from '#lib/map/WorldMap.svelte';
	import MapLabels from '#lib/map/MapLabels.svelte';
	import MapControls from '#lib/components/MapControls.svelte';
	import ScriptToggle from '#lib/components/ScriptToggle.svelte';
	import CountryPanel from '#lib/components/CountryPanel.svelte';
	import {
		createLookup,
		LookupError,
		MAX_QUERY_LENGTH,
		type Concept,
		type ConceptRef
	} from '#lib/data/lookup.js';
	import { buildCountryLabels, languageForms } from '#lib/data/country-labels.js';
	import type { Countries, Languages, ScriptMode } from '#lib/data/types.js';

	const POS_NAMES: Record<string, string> = {
		noun: 'noun',
		verb: 'verb',
		adj: 'adjective',
		adv: 'adverb',
		intj: 'interjection',
		phrase: 'phrase',
		pron: 'pronoun',
		prep: 'preposition',
		num: 'numeral',
		conj: 'conjunction',
		name: 'name'
	};

	const lookup = createLookup('/data');

	let app: HTMLDivElement | undefined = $state();
	let map: WorldMap | undefined = $state();

	let countries = $state.raw<Countries>({});
	let languages = $state.raw<Languages>({});
	let script = $state<ScriptMode>('latin');
	let query = $state('');
	let refs = $state.raw<ConceptRef[]>([]);
	let senseId = $state<string | null>(null);
	let concept = $state.raw<Concept | null>(null);
	let status = $state<'idle' | 'loading' | 'done' | 'empty' | 'error'>('idle');
	let searchedFor = $state('');
	let selected = $state<string | null>(null);
	let hovered = $state<string | null>(null);
	let hoverPos = $state({ x: 0, y: 0 });
	let ready = false;
	let searchToken = 0;
	let debounce: ReturnType<typeof setTimeout> | undefined;

	const labels = $derived(buildCountryLabels(countries, languages, concept, script));

	function panelFor(iso: string | null) {
		if (!iso || !countries[iso]) return null;
		const label = labels.get(iso);
		return {
			iso,
			name: countries[iso].name,
			forms: label?.forms ?? languageForms(countries[iso].languages, languages, concept)
		};
	}
	const selectedPanel = $derived(panelFor(selected));
	const hoverPanel = $derived(hovered && hovered !== selected ? panelFor(hovered) : null);

	async function runSearch(q: string, preferredSense: string | null = null) {
		const token = ++searchToken;
		const trimmed = q.trim();
		searchedFor = trimmed;
		if (!trimmed) {
			refs = [];
			senseId = null;
			concept = null;
			status = 'idle';
			return;
		}
		status = 'loading';
		try {
			const found = await lookup.search(trimmed);
			if (token !== searchToken) return;
			refs = found;
			if (!found.length) {
				senseId = null;
				concept = null;
				status = 'empty';
				return;
			}
			const id = found.some((r) => r.id === preferredSense) ? preferredSense! : found[0].id;
			await chooseSense(id, token);
		} catch (e) {
			if (token !== searchToken) return;
			console.warn(e instanceof LookupError ? e.message : e);
			status = 'error';
		}
	}

	async function chooseSense(id: string, token = ++searchToken) {
		senseId = id;
		status = 'loading';
		try {
			const c = await lookup.getConcept(id);
			if (token !== searchToken) return;
			concept = c;
			status = c ? 'done' : 'empty';
		} catch (e) {
			if (token !== searchToken) return;
			console.warn(e);
			status = 'error';
		}
	}

	function onInput() {
		clearTimeout(debounce);
		debounce = setTimeout(() => runSearch(query), 300);
	}

	function onSubmit(e: SubmitEvent) {
		e.preventDefault();
		clearTimeout(debounce);
		runSearch(query);
		(document.activeElement as HTMLElement | null)?.blur?.(); // close the mobile keyboard
	}

	function senseLabel(r: ConceptRef) {
		const pos = POS_NAMES[r.pos] ?? r.pos;
		return r.gloss ? `${r.word} (${pos}): ${r.gloss}` : `${r.word} (${pos})`;
	}

	// Keep the URL shareable: ?q=hello&sense=<id>&script=native
	$effect(() => {
		const params = new URLSearchParams();
		if (searchedFor) params.set('q', searchedFor);
		if (searchedFor && senseId && refs.length > 1 && senseId !== refs[0]?.id) {
			params.set('sense', senseId);
		}
		if (script !== 'latin') params.set('script', script);
		if (!ready) return;
		const qs = params.toString();
		const next = `${location.pathname}${qs ? `?${qs}` : ''}`;
		if (next !== `${location.pathname}${location.search}`) replaceState(next, {});
	});

	onMount(() => {
		const params = new URLSearchParams(location.search);
		const q = (params.get('q') ?? '').slice(0, MAX_QUERY_LENGTH);
		if (params.get('script') === 'native') script = 'native';
		query = q;
		ready = true;
		if (q) runSearch(q, params.get('sense'));

		Promise.all([
			fetch('/data/countries.json').then((r) => r.json()),
			fetch('/data/languages.json').then((r) => r.json())
		])
			.then(([c, l]) => {
				countries = c;
				languages = l;
			})
			.catch((e) => console.warn('Could not load country data', e));

		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') selected = null;
		};
		window.addEventListener('keydown', onKey);
		return () => {
			clearTimeout(debounce);
			window.removeEventListener('keydown', onKey);
		};
	});
</script>

<svelte:head>
	<title>geolang</title>
</svelte:head>

<div class="app" bind:this={app}>
	<header class="nav" data-testid="navbar">
		<a class="brand" href="/" aria-label="geolang home">geo<span>lang</span></a>
		<form class="search" role="search" onsubmit={onSubmit}>
			<label for="q" class="visually-hidden">Word to translate</label>
			<input
				id="q"
				type="search"
				placeholder="Type a word, e.g. hello"
				autocomplete="off"
				autocapitalize="off"
				spellcheck="false"
				enterkeyhint="search"
				maxlength={MAX_QUERY_LENGTH}
				bind:value={query}
				oninput={onInput}
				data-testid="search-input"
			/>
		</form>
		<div class="script-slot">
			<ScriptToggle bind:value={script} />
		</div>
	</header>

	<main class="stage">
		<WorldMap
			bind:this={map}
			bind:selected
			onhover={(iso, e) => {
				hovered = iso;
				if (e) hoverPos = { x: e.clientX, y: e.clientY };
			}}
		>
			{#snippet overlay(ctx)}
				<MapLabels {ctx} {labels} />
			{/snippet}
		</WorldMap>

		<div class="status-slot" aria-live="polite">
			{#if status === 'loading'}
				<div class="status" data-testid="status" data-status="loading">Searching…</div>
			{:else if status === 'empty'}
				<div class="status" data-testid="status" data-status="empty">
					No translations found for “{searchedFor}”.
				</div>
			{:else if status === 'error'}
				<div class="status error" data-testid="status" data-status="error">
					Couldn’t load translations.
					<button type="button" onclick={() => runSearch(query)}>Retry</button>
				</div>
			{:else if status === 'done' && concept}
				<div class="status" data-testid="status" data-status="done">
					{#if refs.length > 1}
						<label class="visually-hidden" for="sense">Meaning</label>
						<select
							id="sense"
							data-testid="sense-picker"
							value={senseId}
							onchange={(e) => chooseSense((e.currentTarget as HTMLSelectElement).value)}
						>
							{#each refs as r (r.id)}
								<option value={r.id}>{senseLabel(r)}</option>
							{/each}
						</select>
					{:else}
						<span class="sense" data-testid="sense-label">{senseLabel(refs[0])}</span>
					{/if}
				</div>
			{/if}
		</div>

		{#if selectedPanel}
			<div class="panel-slot">
				<CountryPanel
					{...selectedPanel}
					mode={script}
					hasConcept={!!concept}
					variant="panel"
					onclose={() => (selected = null)}
				/>
			</div>
		{/if}

		{#if hoverPanel}
			<div
				class="tooltip-slot"
				style:left={`${hoverPos.x + 16}px`}
				style:top={`${hoverPos.y + 16}px`}
			>
				<CountryPanel {...hoverPanel} mode={script} hasConcept={!!concept} variant="tooltip" />
			</div>
		{/if}

		<div class="controls-slot">
			<MapControls
				onzoomin={() => map?.zoomBy(1.6)}
				onzoomout={() => map?.zoomBy(1 / 1.6)}
				onreset={() => map?.resetZoom()}
				fullscreenTarget={() => app}
			/>
		</div>
	</main>

	<footer class="credits">
		<a href="/about">About &amp; sources</a>
	</footer>
</div>

<style>
	.app {
		position: relative;
		display: flex;
		flex-direction: column;
		height: 100vh;
		height: 100dvh;
		background: var(--bg);
	}
	.nav {
		flex: 0 0 auto;
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: center;
		gap: 16px;
		min-height: var(--nav-h);
		padding: 8px max(16px, env(safe-area-inset-right)) 8px max(16px, env(safe-area-inset-left));
		padding-top: max(8px, env(safe-area-inset-top));
		background: var(--surface);
		border-bottom: 1px solid var(--border);
		z-index: 2;
	}
	.brand {
		font-weight: 800;
		font-size: 1.35rem;
		letter-spacing: -0.02em;
		color: var(--text);
		text-decoration: none;
	}
	.brand span {
		color: var(--accent);
	}
	.search {
		max-width: 560px;
		width: 100%;
		justify-self: center;
	}
	.search input {
		width: 100%;
		height: 44px;
		padding: 0 16px;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: var(--surface-2);
		font-size: 1rem;
	}
	.search input:focus {
		outline: none;
		border-color: var(--accent);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 30%, transparent);
	}
	.stage {
		position: relative;
		flex: 1 1 auto;
		min-height: 0;
	}
	.status-slot {
		position: absolute;
		top: 12px;
		left: 50%;
		transform: translateX(-50%);
		width: max-content;
		max-width: calc(100% - 32px);
		z-index: 1;
	}
	.status {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 14px;
		min-height: 40px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 999px;
		box-shadow: var(--shadow);
		font-size: 0.9rem;
	}
	.status.error {
		border-color: #d14343;
	}
	.status button {
		min-height: 32px;
		padding: 0 12px;
		border: 1px solid var(--border);
		border-radius: 999px;
		background: var(--surface-2);
		cursor: pointer;
	}
	.status select {
		max-width: min(70vw, 520px);
		min-height: 32px;
		border: 0;
		background: transparent;
		font-size: 0.9rem;
		text-overflow: ellipsis;
		cursor: pointer;
	}
	.sense {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.panel-slot {
		position: absolute;
		top: 64px;
		left: max(12px, env(safe-area-inset-left));
		z-index: 2;
	}
	.tooltip-slot {
		position: fixed;
		z-index: 4;
		pointer-events: none;
	}
	.controls-slot {
		position: absolute;
		right: max(12px, env(safe-area-inset-right));
		bottom: max(16px, env(safe-area-inset-bottom));
		z-index: 1;
	}
	.credits {
		position: absolute;
		left: max(12px, env(safe-area-inset-left));
		bottom: max(8px, env(safe-area-inset-bottom));
		font-size: 0.75rem;
		z-index: 1;
	}
	.credits a {
		color: var(--text-muted);
		background: color-mix(in srgb, var(--surface) 80%, transparent);
		padding: 2px 6px;
		border-radius: 6px;
	}

	@media (max-width: 767px) {
		.nav {
			grid-template-columns: auto minmax(0, 1fr);
			gap: 10px;
		}
		.brand {
			font-size: 1.15rem;
		}
		.search input {
			font-size: 16px; /* prevents iOS zoom-on-focus */
		}
		.script-slot {
			position: fixed;
			left: max(12px, env(safe-area-inset-left));
			bottom: max(16px, env(safe-area-inset-bottom));
			z-index: 3;
			box-shadow: var(--shadow);
			border-radius: 999px;
		}
		.status-slot {
			top: 8px;
		}
		.status select {
			max-width: calc(100vw - 72px);
		}
		/* bottom sheet */
		.panel-slot {
			position: fixed;
			top: auto;
			left: 0;
			right: 0;
			bottom: 0;
			z-index: 5;
		}
		.panel-slot :global(.panel) {
			max-width: none;
			width: 100%;
			border-radius: 16px 16px 0 0;
			padding-bottom: max(16px, env(safe-area-inset-bottom));
			max-height: 50dvh;
			overflow-y: auto;
		}
		.credits {
			left: auto;
			right: 68px;
			bottom: max(16px, env(safe-area-inset-bottom));
		}
	}
</style>
