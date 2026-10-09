// Settings page model: manifest settings -> form sections. Hand-built settings UI is not allowed
// (skills/module-manifest); this derives everything from module.json declarations.
import type { ModuleManifest, SettingDecl } from '../../modules/manifest.ts';
import { validateSettingValue } from '../../modules/manifest.ts';

export interface Field {
  moduleId: string;
  key: string;
  control: 'switch' | 'select' | 'text' | 'number' | 'color';
  labelRef: string; // i18n:key or literal
  descriptionRef?: string;
  options?: string[];
  min?: number;
  max?: number;
  value: unknown;
}
export interface Section { moduleId: string; titleRef: string; fields: Field[] }

const CONTROL: Record<SettingDecl['type'], Field['control']> = { boolean: 'switch', enum: 'select', string: 'text', number: 'number', color: 'color' };

export function buildSections(manifests: ModuleManifest[], values: (moduleId: string, key: string) => unknown): Section[] {
  return manifests.filter((m) => m.settings?.length).map((m) => ({
    moduleId: m.id,
    titleRef: m.name,
    fields: m.settings!.map((s) => {
      const f: Field = { moduleId: m.id, key: s.key, control: CONTROL[s.type], labelRef: s.label ?? s.key, value: values(m.id, s.key) ?? s.default };
      if (s.description) f.descriptionRef = s.description;
      if (s.values) f.options = s.values;
      if (s.min !== undefined) f.min = s.min;
      if (s.max !== undefined) f.max = s.max;
      return f;
    }),
  }));
}

export type Coerced = { ok: true; value: unknown } | { ok: false; error: string };
/** Convert a raw form value to the declared type and validate. */
export function coerce(decl: SettingDecl, raw: string | boolean): Coerced {
  let v: unknown = raw;
  if (decl.type === 'number') v = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
  if (decl.type === 'boolean') v = raw === true || raw === 'true';
  const bad = validateSettingValue(decl, v);
  return bad ? { ok: false, error: bad } : { ok: true, value: v };
}

/** Settings page sub-routes (corvid://settings/<section>). `layout#reset` must always work. */
export const SECTIONS = ['general', 'appearance', 'layout', 'privacy', 'extensions', 'search', 'about'] as const;
export type SectionId = (typeof SECTIONS)[number];
export function parseSettingsRoute(pathname: string, hash: string): { section: SectionId; action?: 'reset-layout' } {
  const seg = pathname.replace(/^\/+/, '').split('/')[0] ?? '';
  const section = (SECTIONS as readonly string[]).includes(seg) ? (seg as SectionId) : 'general';
  return section === 'layout' && hash === '#reset' ? { section, action: 'reset-layout' } : { section };
}
