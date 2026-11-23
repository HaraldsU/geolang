export type Iso = string;

/** A disputed area involving a country, with how the map shows it (see pipeline/overrides.json). */
export interface Dispute {
	area: string;
	note: string;
}

export interface CountryInfo {
	name: string;
	languages: string[];
	disputes?: Dispute[];
}

export interface LanguageInfo {
	name: string;
	script: string;
	dir: 'ltr' | 'rtl';
	font: string;
	latin: boolean;
}

export type Countries = Record<Iso, CountryInfo>;
export type Languages = Record<string, LanguageInfo>;

export type ScriptMode = 'latin' | 'native';
