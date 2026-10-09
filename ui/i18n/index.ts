// Single i18n catalog for all Corvid UI strings (AGENTS.md rule 7).
// Catalog files: ui/i18n/<locale>.json, flat key -> message. Placeholders: {name}.
// Plurals: "key" with "key.one"/"key.other" variants selected by Intl.PluralRules via count param.
import en from './en.json' with { type: 'json' };

export type Catalog = Record<string, string>;
const catalogs: Record<string, Catalog> = { en: en as Catalog };
let locale = 'en';
let missingHandler: (key: string) => void = () => {};

export function setLocale(l: string): void {
  locale = catalogs[l] ? l : 'en';
}
export function registerCatalog(l: string, c: Catalog): void {
  catalogs[l] = c;
}
export function onMissing(h: (key: string) => void): void {
  missingHandler = h;
}

export function t(key: string, params?: Record<string, string | number>): string {
  let msg: string | undefined;
  if (params && typeof params['count'] === 'number') {
    const form = new Intl.PluralRules(locale).select(params['count']);
    msg = catalogs[locale]?.[`${key}.${form}`] ?? catalogs['en']?.[`${key}.${form}`];
  }
  msg ??= catalogs[locale]?.[key] ?? catalogs['en']?.[key];
  if (msg === undefined) {
    missingHandler(key);
    return key;
  }
  return params ? msg.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m)) : msg;
}

/** Resolve "i18n:key" references used in manifests; other strings pass through. */
export function resolveRef(s: string): string {
  return s.startsWith('i18n:') ? t(s.slice(5)) : s;
}

export function hasKey(key: string): boolean {
  return key in (catalogs['en'] ?? {});
}
