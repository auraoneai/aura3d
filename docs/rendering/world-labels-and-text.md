# World labels, SDF text, and mesh text

Aura3D exposes three different text surfaces. They are not interchangeable,
and diagnostics counts them separately (N4 inventory rule — a DOM count must
never masquerade as 3D proof).

- `ui.*` draws **accessible DOM UI** (screen-reader text, buttons, HUD copy).
  UI-only, never 3D proof.
- `labels.*` draws **world-anchored DOM UI**. It is accessible, scales crisply,
  and can hide or dim when its subject is occluded. It is not lit by scene
  lights and is not 3D mesh geometry. Placement is proven per route by
  placed-vs-offscreen telemetry (`collectLabelTelemetry`), computed from the
  projected set — not from counting nodes.
- SDF text draws **lit/occluded in-world quads** from a signed-distance atlas
  (`packages/rendering/src/SdfText.ts`, G1). Same uppercase alphanumeric
  catalog as `text3D`, with outline/glow/drop-shadow styling, LOD fade, and
  dim/hide occlusion handling. Pixel proof is `textPixelBacked`, which is true
  only when the atlas is uploaded AND quads were submitted this frame.
  Sampling is a deterministic bake (`rasterizeSdfTextLabelImage`: per-texel
  atlas coverage through `sampleSdfCoverage`, once per mount — not a
  per-pixel shader SDF loop); the production bridge uploads the label image
  as a native texture and submits one quad per glyph, replaying the recorded
  `text3D(backend: "sdf")` descriptor fail-closed with the extruded mesh as
  the diagnosed fallback. LOD fade and occlusion resolve per frame from the
  live camera distance and the shared scene occlusion test
  (`resolveSdfTextFrameOpacity`, surfaced as `lastOpacity`). Browser proof:
  `tests/browser/root-sdf-text-g1.spec.ts` + `tests/reports/root-sdf-text-g1.json`
  (SDF-vs-mesh delta, 0.35 dim, hide-policy unbacking, far fade to 0).
- `text3D(...)` builds **extruded triangle meshes** that share the same
  transform, depth test, PBR material, and lighting path as other root custom
  geometry. It is a small built-in glyph catalog, not a font stack.

`labels.*`, `ui.*`, and `text3D` come from `@aura3d/engine`. Do not import
`three`, `TextGeometry`, or `troika-three-text` in public routes.

Explicit 2.1 decision: NO `CSS2DRenderer` / `CSS3DRenderer` parity. Game
annotation needs are covered by world-anchored labels + SDF text; the
three-compat migration lab (`CSS2D_CSS3D_MANUAL_MAP`) documents the manual
mapping for importers. Revisit only with a named customer workload.

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
| Selectable / screen-reader text | `labels.*` / `ui.*` (DOM) | mesh or SDF text |
| Lit in-world signage with outline/glow, LOD fade | SDF text (G1) | DOM labels |
| Title card, signage, extruded logo from the built-in catalog | `text3D` | DOM labels |
| Arbitrary typeface, CJK, or paragraph layout | not shipped | any API as a substitute |

## Per-route proof (N4 contract)

The N4 gate is `placesLabels`: a route that declares labels but places none
on screen fails route-health. The gate reads `AuraDiagnostics.labels` (the
projected set) joined with scene nodes via `collectLabelTelemetry`
(`packages/engine/src/agent-api/LabelTelemetry.ts`, unit-proven), reporting
placed-vs-offscreen counts broken down by HUD / annotation / tick roles.
Collision avoidance is tuned per role: disabled for HUD, tight gap for ticks,
default gap for annotations. Engine-bridge + route-health-tool wiring is
specified as code hunks in the phase report (the bridge file is owned by a
sibling phase) — this doc describes the contract, not landed wiring.

World labels must not be relabeled as 3D text in public claims. Mesh text must
not be claimed as a general font renderer.
