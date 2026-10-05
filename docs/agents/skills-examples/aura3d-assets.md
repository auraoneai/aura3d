# Worked example: aura3d-assets

Goal: resolve "battle-worn knight helmet" from the catalog, and exercise
inspect and validate on an existing typed asset.

Environment: a temporary copy of `packages/create-aura3d/templates/product-viewer`
(`aura.assets.json`, `public/`, `src/`), with the built CLI from this repo
invoked as `node <repo>/packages/aura3d-cli/dist/cli.js`. The temporary copy
kept the template itself unchanged.

## 1. Catalog search (reject path)

```bash
aura3d assets search "battle-worn knight helmet"
```

Real output, trimmed:

```text
No candidates found for "battle-worn knight helmet".
3 marketplace deep-link(s) - manual download (license check required).
  marketplace:cgtrader  "Search CGTrader for 'battle-worn knight helmet' (free GLB filter)"  ...
  marketplace:turbosquid  ...
  marketplace:free3d  ...
warning: aura-index: asset-index fetch failed 404 for https://aura3d-asset-index-cron.newsroom.workers.dev/search?q=...
```

The hosted index returned HTTP 404 at the time of the run (2026-09-25). Per the
skill's "Stop and report" section, the agent reports the warning verbatim,
labels helmet-dependent work `blocked`, treats the deep-links as user-handled,
and offers either a user-supplied licensed file or Meshy generation. It does
not model a helmet from primitives. `assets resolve` was not run because there
was no auto-pullable candidate.

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
