# World labels and mesh text

Aura3D exposes two different text surfaces. They are not interchangeable.

- `labels.*` draws **world-anchored DOM UI**. It is accessible, scales crisply,
  and can hide or dim when its subject is occluded. It is not lit by scene
  lights and is not 3D mesh geometry.
- `text3D(...)` builds **extruded triangle meshes** that share the same
  transform, depth test, PBR material, and lighting path as other root custom
  geometry. It is a small built-in glyph catalog, not a font stack.

Both come from `@aura3d/engine`. Do not import `three`, `TextGeometry`, or
`troika-three-text` in public routes.

## World labels

```ts
import { createAuraApp, labels, lights, primitives, scene } from "@aura3d/engine";

createAuraApp("#app", {
  scene: scene()
    .add(lights.studio())
    .add(primitives.box({ position: [0, 0.5, 0] }))
    .add(labels.billboard("Subject", {
      position: [0, 1.4, 0],
      occlusionAware: true,
      occlusionPolicy: "dim"
    }))
    .add(labels.anchor("Metal", "chrome swatch", {
      position: [-1.4, 0.4, 0.4],
      collisionAvoidance: true
    }))
    .add(labels.axisTick("0", { position: [0, 0.05, 0] }))
    .add(labels.callout("Hotspot", "subject", { position: [1.2, 1.1, 0] }))
});
```

Factories in `packages/engine/src/agent-api/index.ts`:

| Factory | Role | Defaults that matter |
| --- | --- | --- |
| `labels.billboard(text, options?)` | World-facing annotation | `occlusionAware: true`, `collisionAvoidance: true` |
| `labels.anchor(text, target, options?)` | Named target + label | same occlusion and collision defaults |
| `labels.axisTick(text, options?)` | Small scale/tick label | same occlusion and collision defaults |
| `labels.callout(text, target, options?)` | Leader line to a target | `leader: true`, `collisionAvoidance: true` |
| `labels.hud(text, options?)` | Screen-anchored HUD copy | `screenAnchor` defaults to `"top-left"` |

`WorldLabelRenderer` projects each label with the scene view-projection matrix
into a DOM overlay (`pointer-events: none`, `role="note"`). Collision avoidance
repositions overlapping boxes. That layer is UI, not rendered mesh text.

### Occlusion

`occlusionAware` is a real option. When it is true (the default on billboard,
anchor, and axis-tick), the renderer tests whether the **annotated subject** is
hidden by other scene bounds. The test is a world-space segment-versus-box
check from the camera eye to the label's leader/anchor, not a WebGL2 depth
buffer read. The subject's own bounds are skipped so a label cannot occlude
itself.

`occlusionPolicy` is `"dim"` (default) or `"hide"`:

- `"dim"` keeps the label readable but lowers opacity.
- `"hide"` removes it from the overlay.

```ts
labels.billboard("Behind the wall", {
  occlusionAware: true,
  occlusionPolicy: "hide"
});

labels.billboard("Always visible", { occlusionAware: false });
```

Proof: `tests/unit/agent-api/label-occlusion.test.ts` and
`tests/browser/label-occlusion.spec.ts`.

## Mesh text (`text3D`)

```ts
import { createAuraApp, material, scene, text3D } from "@aura3d/engine";

createAuraApp("#app", {
  scene: scene().add(text3D("AURA3D-2.0", {
    size: 0.72,
    depth: 0.22,
    letterSpacing: 0.1,
    position: [-2.2, 0.15, 0],
    material: material.pbr({ color: "#f7c84b", metallic: 0.35, roughness: 0.28 })
  }))
});
```

`text3D` uppercases the string and extrudes a 5×7 bitmap glyph into indexed
triangles (`method: "extruded-bitmap-glyph-mesh"`). Options in
`AuraText3DOptions`:

- `size` — glyph height (must be positive; default `1`)
- `depth` — extrusion depth (must be positive; default `size * 0.16`)
- `letterSpacing` — extra gap between glyphs (must be non-negative; default
  `size * 0.14`)

Supported glyphs: uppercase `A–Z`, digits `0–9`, space, `-`, and `.`.
Unsupported characters are recorded on the node as `unsupportedCharacters` and
skipped. An empty string, or a string with no supported glyphs, throws.

This is not font loading, Unicode shaping, kerning, SDF/MSDF, curved text, or
troika-three-text parity. For accessible annotations, use `labels.*`.

Root evidence: `pnpm renderer:geometry-instancing-lod-text` and
`docs/rendering/geometry-instancing-lod-text.md`.

## What to use

| Need | Use | Do not use |
| --- | --- | --- |
| Callout, measurement, hotspot, HUD | `labels.*` | `text3D` |
| Selectable / screen-reader text | `labels.*` (DOM) | mesh text |
| Title card, signage, extruded logo from the built-in catalog | `text3D` | DOM labels |
| Arbitrary typeface, CJK, or paragraph layout | not shipped | either API as a substitute |

World labels must not be relabeled as 3D text in public claims. Mesh text must
not be claimed as a general font renderer.
