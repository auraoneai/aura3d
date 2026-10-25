# Worked example: aura3d-assets

Goal: resolve two needs with `assets resolve`, and exercise inspect and validate
on an existing typed asset.

Environment: a clean temporary project (no admitted assets), the CLI from this
repo, real open sources, `--dry-run` so nothing is written. Run 2026-10-25.

## 1. Resolve (one found, one not)

```bash
aura3d assets resolve "wooden barrel" --role prop --dry-run
aura3d assets resolve "battle-worn knight helmet" --role prop --dry-run
```

Real output, trimmed:

```text
Need: "wooden barrel" (role prop, matching "barrel")
Chosen: open-source: licence-clear match for "barrel" from mirror:kenney
  skipped project: no admitted asset matches "barrel"
Cost: 0 credits (dry run)
Open source: Barrel (kenney:mini-dungeon:barrel, CC0-1.0, 148 triangles, size unknown).

Need: "battle-worn knight helmet" (role prop, matching "helmet")
Chosen: procedural: no admitted, open-source or generated asset; build from primitives
  skipped project: no admitted asset matches "helmet"
  skipped open-source: no licence-clear, downloadable match for "helmet"
  skipped meshy: needs --allow meshy (estimate 30 credits)
No recipe for a helmet: the box below is a placeholder. For the real thing run with --allow meshy --budget 30, or admit a licensed file with `aura3d assets add`.
```

The barrel is admitted by dropping `--dry-run`. The helmet is a named subject,
so the agent does not ship the placeholder box: it asks for an approved credit
budget and reruns with `--allow meshy --budget 30`, or asks the user for a
licensed file. There is no hosted catalog to wait for.

## 2. Inspect an existing asset

```bash
aura3d assets inspect public/aura-assets/product-fixture.glb
```

Trimmed fields:

```json
{
  "ok": false,
  "bounds": [1.85, 3.005, 1.72],
  "warnings": ["orientation metadata missing; facing direction cannot be validated until GLTF extras declare aura3d.orientation.forwardAxis"],
  "materials": ["satin-cabinet", "patterned-grille", "rubber-cone", "metallic-knobs"]
}
```

## 3. Validate the shipping set with a source scan

```bash
aura3d assets validate --source
```

Trimmed fields:

```json
{
  "ok": true,
  "warnings": [
    "product: manifest bounds [1.900, 2.900, 1.100] do not match the asset file [1.850, 3.005, 1.720]. Re-add the asset through the CLI to refresh derived metadata.",
    "product: manifest is missing the scene hierarchy inspection that the asset file provides."
  ],
  "typedAssetUsages": [{ "assetId": "product", "typedAsset": "assets.product", "file": "src/main.ts", "occurrences": 1 }]
}
```

This shows why step 6 of the skill says to refresh stale manifest bounds by
re-adding the file, and why `typedAssetUsages` is the proof that the route
uses `model(assets.product)` rather than a string id.

## Evidence that would be captured remotely

After a clean candidate is admitted, CI would run the template's route-health
and screenshot specs to prove that the helmet renders readably. That handoff
goes to `aura3d-evidence-review`.
