---
name: module-manifest
description: Define or change a Corvid browser module (feature unit with manifest, slots, settings, permissions, lifecycle). Use when adding any browser feature or the public UI-mod API.
---

# module-manifest

## Concept
Every browser feature is a module in `modules/<id>/` with a `module.json`. Built-in modules and user-installed UI mods use the same manifest format; built-ins just ship in the build.

## module.json (v0 fields)
```json
{
  "id": "corvid.tabstrip",
  "version": "0.1.0",
  "apiVersion": 0,
  "name": "i18n:module.tabstrip.name",
  "kind": "builtin | ui-mod",
  "slots": [{"slot": "window.top", "component": "corvid-tabstrip", "movable": true, "resizable": true}],
  "settings": [{"key": "tabstrip.position", "type": "enum", "values": ["top","left","right","bottom"], "default": "top"}],
  "permissions": ["tabs.read", "tabs.manage"],
  "requires": ["corvid.layout"],
  "entry": "dist/index.js"
}
```

## Steps
1. Add `modules/<id>/module.json` and source under `modules/<id>/src/`.
2. Declare only the permissions needed. Permissions are enforced by the module host (Mojo capability per permission); ui-mods run sandboxed in a WebUI frame with no raw Chromium access.
3. Slots come from `layout-engine`; a module may fill, wrap, or replace a slot only if the slot allows it.
4. Settings declared in the manifest appear automatically in the Corvid settings page; do not hand-build settings UI.
5. Lifecycle hooks: `onLoad`, `onUnload`, `onSettingsChanged`; unload must free everything (verify with the diagnostics memory view when available).
6. Version the API: bump `apiVersion` on breaking changes and keep one previous version working for one release.
7. Schema lives in `modules/schema/module.schema.json`; CI validates every manifest.

## Done when
- Manifest validates, module loads and unloads cleanly, settings appear, permissions enforced (negative test included).
