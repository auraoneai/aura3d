# Cinematic Asset Library

The cinematic previs cinematic asset library maps scene intent to visible runtime content. It lets common prompts produce asset-backed realtime previs instead of draft artifact-only diagrams.

## Manifest Role

Each cinematic route and template should include or reference an asset manifest. The manifest is the contract between provider intent, asset resolution, diagnostics, quality gates, and export bundles.

Required manifest fields:

```json
{
  "schema": "aura3d-cinematic-asset-manifest/0.1",
  "library": "cinematic-prompt-to-scene",
  "assets": [
    {
      "id": "wet-alley-set",
      "role": "environment",
      "kind": "procedural-set",
      "path": "procedural://wet-alley-set",
      "tags": ["alley", "wet-pavement", "neon", "cinematic"],
      "quality": "hero"
    }
  ]
}
```

Recommended roles:

- `character`;
- `hero-prop`;
- `environment`;
- `set-dressing`;
- `material`;
- `light`;
- `vfx`;
- `camera-rig`;
- `audio-cue`, when the export includes editorial context.

## Resolution Rules

Asset resolution should be deterministic:

1. Match explicit asset IDs from the scene IR.
2. Match semantic tags such as `alley`, `robot`, `flower`, `rain`, `neon`, `wet-pavement`, or `fog`.
3. Prefer `hero` quality assets for hero roles.
4. Use local or procedural assets before remote assets in no-key demos.
5. Emit a draft artifact diagnostic if no suitable asset exists.

The public cinematic previs fixture should not rely on unresolved hero draft artifacts. Missing background set dressing can be acceptable only when diagnostics and quality gates make the roadmap item visible.

## Procedural Assets

Procedural assets are valid when they are rendered as real scene content and are listed in provenance. Examples:

- wet pavement planes with reflection approximation;
- fog volumes or depth haze;
- rain particles;
- glow cards and practical lights;
- simple environment facades;
- camera rails and shot markers.

Procedural does not mean "untracked." Include `procedural://` manifest paths, generation parameters, and quality role metadata so exports can explain how the scene was built.

## draft artifact Policy

Allowed:

- explicit greybox objects in internal mock routes;
- visible draft artifacts tagged as `draft artifact`;
- fallback geometry listed in diagnostics and exports.

Not allowed for public cinematic previs cinematic proof:

- silent hero draft artifacts;
- DOM-only hero objects;
- CSS-only rain, fog, glow, or flower effects used as the visual proof;
- claims that draft artifact scenes are production assets.

## Template Asset Manifests

The `cinematic-prompt-to-scene` and `live-provider-scene-proxy` templates include local manifests so they run without downloads or API keys. Their assets are intentionally procedural starter assets, but they still declare roles, tags, quality level, and provenance so quality gates and export bundles can reason about the scene.
