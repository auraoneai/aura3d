# Production model loader (`defineModelAssets`)

> three.js loads whatever path string you give it. `defineModelAssets` gives each model a typed ref, a `sha256` and a license string, and fails at definition time on a bad hash or URL. In production, a model the bridge cannot trust does not draw.

Every game that ships GLBs used to hand-write the same module: a same-origin URL, a `sha256`, a license string, a manifest object and an `?models=0` switch for a procedural fallback. The production bridge silently drops any model it cannot trust, so a wrong hash or URL drew nothing. `defineModelAssets` does that work once and fails at definition time.

```ts
import { defineModelAssets, model, primitives, scene } from "@aura3d/engine";

const assets = defineModelAssets(
  {
    hero:  { url: new URL("./assets/hero.glb", import.meta.url).pathname,  sha256: "9f2c…64 hex…", animations: ["run", "idle"], sizeBytes: 4_600_000 },
    tree:  { url: new URL("./assets/tree.glb", import.meta.url).pathname,  sha256: "sha256-1ab4…", bounds: [2, 5, 2] }
  },
  { license: "Own text prompt, generated 2026-10-23" }
);

scene({
  children: [
    assets.node("hero", { name: "hero", position: [0, 0, 0] }, () => primitives.capsule({ size: [0.8, 1.6, 0.8] })),
    assets.node("tree", { position: [4, 0, 2] }, () => primitives.cylinder({ size: [0.6, 3, 0.6] }))
  ]
});
```

## What it checks

| Input | Result |
| --- | --- |
| `sha256` not 64 hex characters (a `sha256-` prefix is accepted) | `invalid-model-assets`, names the asset |
| URL on another origin without `sourcePath` under `public/aura-assets/` | `invalid-model-assets` (the bridge would refuse it and draw nothing) |
| absolute URL on the page's own origin | normalised to a pathname so it is treated as bundled |
| relative URL and `baseUrl` | joined; absolute paths left alone |
| unknown id passed to `assets.node(...)` | `invalid-model-assets`, lists known ids |

`assets.refs.<id>` are ordinary typed asset refs: use them with `model(...)`, `instances.model(...)` and `cloneSkinned(...)`. Repeated `model()` nodes of one asset share decoded textures (4.1.0).

## Procedural fallback is an option, not a URL hack

`assets.enabled` is `false` when the page URL carries `?models=0` (also `false`, `off`, `no`). Change the parameter with `queryParam: "gltf"`, ignore the URL with `queryParam: null`, or force it with `enabled: false` / `enabled: () => flags.lowEnd`. When disabled, `assets.node(id, options, fallback)` returns `fallback()`; with no fallback the model is returned hidden so scene code never branches. `modelsEnabledFromUrl(param?, href?)` is exported for code that needs the same rule.

## Related engine-gap fixes in the same release

- `handle.setUniform(name, value)` on a model node without a custom material is now a once-per-uniform `MODEL_SETUNIFORM_NOOP` warning instead of a throw (give the model `material: material.custom(spec)` to drive uniforms). On a non-model node it still validates.
- `scene({ children, background, camera, timeline, diagnostics })` builds what it says. Before, the argument was ignored and the scene came back empty; unknown keys now throw `invalid-scene-options`.
- Example and app entry modules no longer need the `__AURA_PORT_MODULES__` workaround. The root `package.json` `sideEffects` allowlist now covers `./examples/**`, `./apps/**` and `./templates/**`, so a plain `import "../../../examples/<game>/main"` survives production tree-shaking (`tests/unit/parity/side-effects-allowlist.test.ts` runs a real Vite build with a control).
