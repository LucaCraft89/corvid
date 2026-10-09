// Module manifest types + validation (JSON schema + semantic rules).
import { Ajv } from 'ajv';
import schema from '../../modules/schema/module.schema.json' with { type: 'json' };
import type { Permission } from './permissions.ts';
import { PERMISSION_INFO } from './permissions.ts';

export const SUPPORTED_API_VERSIONS: readonly number[] = [0];

export type SlotName = 'window.top' | 'window.bottom' | 'window.left' | 'window.right' | 'window.floating';
export interface SlotDecl {
  slot: SlotName;
  component: string;
  title?: string;
  role?: 'tabs' | 'addressbar' | 'layout-menu';
  movable?: boolean;
  resizable?: boolean;
  hideable?: boolean;
  allowedSlots?: SlotName[];
  minSize?: number;
  maxSize?: number;
  defaultSize?: number;
  mode?: 'fill' | 'wrap' | 'replace';
}
export interface SettingDecl {
  key: string;
  type: 'boolean' | 'enum' | 'string' | 'number' | 'color';
  default: unknown;
  label?: string;
  description?: string;
  values?: string[];
  min?: number;
  max?: number;
}
export interface ModuleManifest {
  id: string;
  version: string;
  apiVersion: number;
  name: string;
  description?: string;
  kind: 'builtin' | 'ui-mod';
  author?: string;
  license?: string;
  slots?: SlotDecl[];
  settings?: SettingDecl[];
  permissions?: Permission[];
  optionalPermissions?: Permission[];
  requires?: string[];
  entry?: string;
}

export type ValidationResult = { ok: true; manifest: ModuleManifest } | { ok: false; errors: string[] };

const ajv = new Ajv({ allErrors: true, strict: true });
const validateSchema = ajv.compile(schema);

export function validateSettingValue(s: SettingDecl, v: unknown): string | undefined {
  switch (s.type) {
    case 'boolean': return typeof v === 'boolean' ? undefined : 'expected boolean';
    case 'string': return typeof v === 'string' ? undefined : 'expected string';
    case 'color': return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? undefined : 'expected #rrggbb';
    case 'enum': return typeof v === 'string' && (s.values ?? []).includes(v) ? undefined : `expected one of ${(s.values ?? []).join(',')}`;
    case 'number':
      if (typeof v !== 'number' || !Number.isFinite(v)) return 'expected finite number';
      if (s.min !== undefined && v < s.min) return `below min ${s.min}`;
      if (s.max !== undefined && v > s.max) return `above max ${s.max}`;
      return undefined;
  }
}

export function validateManifest(raw: unknown): ValidationResult {
  if (!validateSchema(raw)) {
    return { ok: false, errors: (validateSchema.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message ?? 'invalid'}`) };
  }
  const m = raw as unknown as ModuleManifest;
  const errors: string[] = [];

  if (!SUPPORTED_API_VERSIONS.includes(m.apiVersion)) errors.push(`/apiVersion ${m.apiVersion} not supported (supported: ${SUPPORTED_API_VERSIONS.join(',')})`);
  if (m.kind === 'builtin' && !m.id.startsWith('corvid.')) errors.push('/id builtin modules must use the corvid. namespace');
  if (m.kind === 'ui-mod' && m.id.startsWith('corvid.')) errors.push('/id the corvid. namespace is reserved for builtin modules');
  if (m.requires?.includes(m.id)) errors.push('/requires a module cannot require itself');

  const req = new Set(m.permissions ?? []);
  for (const p of m.optionalPermissions ?? []) if (req.has(p)) errors.push(`/optionalPermissions ${p} is also required`);
  if (m.kind === 'ui-mod') {
    for (const p of [...(m.permissions ?? []), ...(m.optionalPermissions ?? [])]) {
      if (PERMISSION_INFO[p].builtinOnly) errors.push(`/permissions ${p} is reserved for builtin modules`);
    }
    if (m.entry === undefined) errors.push('/entry ui-mod must declare an entry script');
  }

  const comps = new Set<string>();
  (m.slots ?? []).forEach((s, i) => {
    const at = `/slots/${i}`;
    if (comps.has(s.component)) errors.push(`${at} duplicate component ${s.component}`);
    comps.add(s.component);
    if (s.allowedSlots && !s.allowedSlots.includes(s.slot)) errors.push(`${at} default slot ${s.slot} is not in allowedSlots`);
    if (s.minSize !== undefined && s.maxSize !== undefined && s.minSize > s.maxSize) errors.push(`${at} minSize > maxSize`);
    if (s.defaultSize !== undefined && ((s.minSize !== undefined && s.defaultSize < s.minSize) || (s.maxSize !== undefined && s.defaultSize > s.maxSize))) errors.push(`${at} defaultSize outside min/max`);
    if (m.kind === 'ui-mod' && s.role) errors.push(`${at} role is reserved for builtin modules`);
    if (m.kind === 'ui-mod' && s.mode === 'replace') errors.push(`${at} mode "replace" is reserved for builtin modules`);
    if (s.movable === false && s.allowedSlots && s.allowedSlots.length > 1) errors.push(`${at} non-movable slot lists multiple allowedSlots`);
  });

  const keys = new Set<string>();
  (m.settings ?? []).forEach((s, i) => {
    const at = `/settings/${i}`;
    if (keys.has(s.key)) errors.push(`${at} duplicate key ${s.key}`);
    keys.add(s.key);
    const bad = validateSettingValue(s, s.default);
    if (bad) errors.push(`${at} default for ${s.key}: ${bad}`);
    if (s.type !== 'enum' && s.values) errors.push(`${at} values only valid for enum`);
    if (s.type !== 'number' && (s.min !== undefined || s.max !== undefined)) errors.push(`${at} min/max only valid for number`);
    if (m.kind === 'ui-mod' && !s.key.startsWith(moduleSettingPrefix(m.id))) {
      errors.push(`${at} ui-mod setting keys must start with "${moduleSettingPrefix(m.id)}"`);
    }
  });

  return errors.length ? { ok: false, errors } : { ok: true, manifest: m };
}

/** ui-mods own the camelCase of their id's last segment: example.sample-panel -> samplePanel. */
export function moduleSettingPrefix(id: string): string {
  const last = id.split('.').slice(1).join('-');
  return last.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase()) + '.';
}
