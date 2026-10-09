#!/usr/bin/env python3
"""Validate ui/layout/presets/mobile.json against ui/layout/layout.schema.json if the schema exists.
Exit 0 on pass or schema-missing (reported), 1 on failure. Structural self-checks run regardless."""
import json, os, sys

root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
preset_path = os.path.join(root, "ui/layout/presets/mobile.json")
schema_path = os.path.join(root, "ui/layout/layout.schema.json")
preset = json.load(open(preset_path))

errors = []
for bp in ("compact", "medium", "expanded"):
    v = preset.get("variants", {}).get(bp)
    if not v:
        errors.append(f"missing variant {bp}")
        continue
    comps = []
    def walk(n):
        if isinstance(n, dict):
            if "component" in n:
                comps.append(n["component"])
            for x in n.values():
                walk(x)
        elif isinstance(n, list):
            for x in n:
                walk(x)
    walk(v)
    if not any(c.startswith("corvid.address-bar") for c in comps):
        errors.append(f"{bp}: no address bar")
    if not any(c.startswith("corvid.tab") for c in comps):
        errors.append(f"{bp}: no tab access")
if "layout-reset" not in preset.get("required", []) or not preset.get("editing", {}).get("reset", {}).get("alwaysReachable"):
    errors.append("reset not guaranteed reachable")

if os.path.exists(schema_path):
    import jsonschema
    try:
        jsonschema.validate(preset, json.load(open(schema_path)))
    except jsonschema.ValidationError as e:
        errors.append(f"schema: {e.message}")
else:
    print("layout.schema.json missing: schema validation SKIPPED (structural checks only)")

for e in errors:
    print("FAIL:", e)
sys.exit(1 if errors else 0)
