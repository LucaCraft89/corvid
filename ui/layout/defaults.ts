// Default layouts: desktop-classic, desktop-vertical-tabs, compact, mobile.
// Component tags match the builtin module manifests in modules/*/module.json.
import type { Layout, Region, SlotInstance } from './model.ts';

const MODULE_OF: Record<string, string> = {
  'corvid-tabstrip': 'corvid.tabstrip',
  'corvid-toolbar': 'corvid.toolbar',
  'corvid-addressbar': 'corvid.addressbar',
  'corvid-extension-actions': 'corvid.extension-actions',
  'corvid-layout-menu': 'corvid.layoutmenu',
  'corvid-bookmarksbar': 'corvid.bookmarksbar',
  'corvid-sidepanel': 'corvid.sidepanel',
};

function slot(component: string, over: Partial<SlotInstance> = {}): SlotInstance {
  const moduleId = MODULE_OF[component];
  if (!moduleId) throw new Error(`no module for ${component}`);
  return { id: component.replace(/^corvid-/, ''), moduleId, component, visible: true, ...over };
}
const region = (slots: SlotInstance[] = [], extra: Partial<Region> = {}): Region => ({ slots, ...extra });

const MOBILE_BP = [{ maxWidth: 600, layout: 'mobile' }];

export const DESKTOP_CLASSIC: Layout = {
  version: 1,
  name: 'desktop-classic',
  regions: {
    top: region([
      slot('corvid-tabstrip', { row: 0 }),
      slot('corvid-toolbar', { row: 1 }),
      slot('corvid-addressbar', { row: 1 }),
      slot('corvid-extension-actions', { row: 1 }),
      slot('corvid-layout-menu', { row: 1 }),
      slot('corvid-bookmarksbar', { row: 2 }),
    ]),
    bottom: region(),
    left: region(),
    right: region([slot('corvid-sidepanel', { visible: false, size: { unit: 'rem', value: 22 } })]),
    floating: region(),
  },
  breakpoints: MOBILE_BP,
};

export const DESKTOP_VERTICAL_TABS: Layout = {
  version: 1,
  name: 'desktop-vertical-tabs',
  regions: {
    top: region([
      slot('corvid-toolbar', { row: 0 }),
      slot('corvid-addressbar', { row: 0 }),
      slot('corvid-extension-actions', { row: 0 }),
      slot('corvid-layout-menu', { row: 0 }),
      slot('corvid-bookmarksbar', { row: 1 }),
    ]),
    bottom: region(),
    left: region([slot('corvid-tabstrip', { size: { unit: 'rem', value: 14 } })]),
    right: region([slot('corvid-sidepanel', { visible: false, size: { unit: 'rem', value: 22 } })]),
    floating: region(),
  },
  breakpoints: MOBILE_BP,
};

export const COMPACT: Layout = {
  version: 1,
  name: 'compact',
  regions: {
    top: region([
      slot('corvid-tabstrip', { row: 0 }),
      slot('corvid-addressbar', { row: 0 }),
      slot('corvid-extension-actions', { row: 0 }),
      slot('corvid-layout-menu', { row: 0 }),
      slot('corvid-toolbar', { row: 0, visible: false }),
      slot('corvid-bookmarksbar', { row: 1, visible: false }),
    ]),
    bottom: region(),
    left: region(),
    right: region([slot('corvid-sidepanel', { visible: false, size: { unit: 'rem', value: 22 } })]),
    floating: region(),
  },
  breakpoints: MOBILE_BP,
};

/** Touch-sized, bottom-reachable toolbars. Address bar on top, controls at the bottom. */
export const MOBILE: Layout = {
  version: 1,
  name: 'mobile',
  regions: {
    top: region([slot('corvid-addressbar', { row: 0 })]),
    bottom: region([
      slot('corvid-toolbar', { row: 0 }),
      slot('corvid-tabstrip', { row: 0 }),
      slot('corvid-layout-menu', { row: 0 }),
    ]),
    left: region(),
    right: region(),
    floating: region([slot('corvid-sidepanel', { visible: false, position: { x: 0.05, y: 0.1 }, size: { unit: '%', value: 90 } })]),
  },
};

export const PRESETS: Readonly<Record<string, Layout>> = {
  'desktop-classic': DESKTOP_CLASSIC,
  'desktop-vertical-tabs': DESKTOP_VERTICAL_TABS,
  compact: COMPACT,
  mobile: MOBILE,
};
export const DEFAULT_PRESET = 'desktop-classic';

export function presetCopy(name: string): Layout {
  const p = PRESETS[name] ?? PRESETS[DEFAULT_PRESET]!;
  return structuredClone(p);
}
