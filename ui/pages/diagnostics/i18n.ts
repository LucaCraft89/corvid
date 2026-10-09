// Tiny catalog accessor. Merge en.json into the shared catalog once Phase 1 provides it.
import en from './i18n/en.json' with { type: 'json' };

export type StringKey = keyof typeof en;
export function t(key: StringKey | (string & {})): string {
  const v = (en as Record<string, string>)[key];
  if (v === undefined) throw new Error('missing i18n key: ' + key);
  return v;
}
export const catalog = en as Record<string, string>;
