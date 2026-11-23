export type Iso = string;

export interface CountryInfo {
	name: string;
	languages: string[];
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
