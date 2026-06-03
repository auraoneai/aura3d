# Asset Resolver

Version: 0.1.0

The asset resolver maps creative intent to usable Aura3D assets. It should prefer local, known assets and explicit draft artifacts before relying on future external asset-generation providers.

## Sources

Supported first-release sources:

- local GLB/GLTF fixture corpus;
- environment presets;
- material presets;
- procedural primitives;
- generated draft artifact geometry;
- user-supplied asset manifests when explicitly provided.

Future optional sources:

- external 3D asset generation APIs;
- remote asset libraries;
- DCC/export pipelines.

Future sources must remain optional. AI scene route health and CI should not require network asset generation.

## Semantic Resolution

The resolver should match asset requests by:

- semantic tags: `robot`, `vehicle`, `city`, `alley`, `forest`, `product`, `prop`, `character`, `light`, `environment`;
- style tags: `cinematic`, `industrial`, `studio`, `neon`, `soft`, `minimal`;
- scale and role: hero object, background prop, ground, sky, character, product;
- required animation or material features;
- license and source metadata where available.

## draft artifact Rules

When no real asset is available, the resolver should generate a draft artifact with:

- stable ID;
- clear display label;
- semantic tags;
- approximate size;
- material intent;
- diagnostic reason;
- provenance entry.

draft artifacts are acceptable for previs. They are not acceptable as silent substitutes for production-ready assets.

## Resolver Output

Every resolution pass should report:

- resolved assets;
- draft artifacts;
- missing assets;
- unsupported asset requirements;
- asset provenance;
- license/source metadata when known;
- material and texture readiness;
- confidence score.

## Aura3D advantage

