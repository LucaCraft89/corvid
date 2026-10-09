// Address-bar input classification (pure). Search engines are configurable; no Google-owned default.
export interface SearchEngine { id: string; name: string; url: string /* contains {query} */; keyword?: string }

export const DEFAULT_ENGINES: readonly SearchEngine[] = [
  { id: 'duckduckgo', name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q={query}', keyword: 'ddg' },
  { id: 'brave', name: 'Brave Search', url: 'https://search.brave.com/search?q={query}', keyword: 'brave' },
  { id: 'startpage', name: 'Startpage', url: 'https://www.startpage.com/do/search?q={query}', keyword: 'sp' },
  { id: 'ecosia', name: 'Ecosia', url: 'https://www.ecosia.org/search?q={query}', keyword: 'eco' },
  { id: 'wikipedia', name: 'Wikipedia', url: 'https://en.wikipedia.org/w/index.php?search={query}', keyword: 'w' },
];
export const DEFAULT_ENGINE_ID = 'duckduckgo'; // placeholder default: open question for the user

export type Classified =
  | { kind: 'url'; url: string }
  | { kind: 'search'; url: string; engine: string }
  | { kind: 'empty' };

const SCHEMES_OK = /^(https?|file|about|corvid|chrome-extension|data|blob|view-source):/i;
const HOSTLIKE = /^(localhost|(\d{1,3}\.){3}\d{1,3}|\[[0-9a-f:]+\]|([a-z0-9-]+\.)+[a-z]{2,})(:\d+)?(\/.*)?$/i;

export function classifyInput(raw: string, engines: readonly SearchEngine[] = DEFAULT_ENGINES, defaultId = DEFAULT_ENGINE_ID): Classified {
  const text = raw.trim();
  if (!text) return { kind: 'empty' };
  if (/^javascript:/i.test(text)) return { kind: 'search', url: searchUrl(text, engines, defaultId), engine: defaultId };
  if (SCHEMES_OK.test(text)) return { kind: 'url', url: text };
  const kw = /^(\S+)\s+(.+)$/.exec(text);
  if (kw) {
    const eng = engines.find((e) => e.keyword === kw[1]);
    if (eng) return { kind: 'search', url: eng.url.replace('{query}', encodeURIComponent(kw[2]!)), engine: eng.id };
  }
  if (!/\s/.test(text) && HOSTLIKE.test(text)) {
    const local = /^(localhost|(\d{1,3}\.){3}\d{1,3}|\[)/i.test(text);
    return { kind: 'url', url: `${local ? 'http' : 'https'}://${text}` };
  }
  return { kind: 'search', url: searchUrl(text, engines, defaultId), engine: defaultId };
}

function searchUrl(q: string, engines: readonly SearchEngine[], id: string): string {
  const e = engines.find((x) => x.id === id) ?? engines[0];
  if (!e) throw new Error('no search engines configured');
  return e.url.replace('{query}', encodeURIComponent(q));
}
