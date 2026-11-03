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
  (`packages/rendering/src/SdfText.ts`). Its built-in fallback uses the same
  uppercase alphanumeric catalog as `text3D`. A loaded font uses the platform
  text shaper and a bounded dynamic atlas, with outline/glow/drop-shadow styling, LOD fade, and
  dim/hide occlusion handling. Pixel proof is `textPixelBacked`, which is true
  only when the atlas is uploaded AND quads were submitted this frame.
  Sampling is a deterministic bake (`rasterizeSdfTextLabelImage`: per-texel
  atlas coverage through `sampleSdfCoverage`, once per mount — not a
  per-pixel shader SDF loop); the production bridge uploads the label image
  as a native texture and submits one quad per atlas entry, replaying the recorded
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

## Loaded fonts and shaped world text

`loadFont` accepts bytes from an asset the caller is licensed to use, together
with its family and license metadata. It validates the signature, font-table
bounds and declared decoded size before asking `FontFace` to decode it; the
metadata is an attribution supplied by the caller, not an automated license
verification. Bytes are limited to 16 MiB. The returned font handle registers
its face with the document or worker font set and must be disposed after the
last text that needs to be created with it.

```ts
import { loadFont, scene, text3D } from "@aura3d/engine";

// These bytes and metadata come from the application's admitted font asset.
async function makeCaption(bytes: Uint8Array, licenseUrl: string) {
  const font = await loadFont({
    data: bytes,
    metadata: { family: "My licensed font", license: "My license", licenseUrl }
  });
  const caption = text3D("Welcome\nمرحبا", {
    font,
    size: 0.6,
    maxWidth: 4,
    lineHeight: 0.8,
    direction: "auto",
    accessibleLabel: "Welcome"
  }).runtime({ id: "caption" });
  // Keep the handle until the app is disposed or no more updates are needed.
  return { scene: scene().add(caption), font };
}
```

Use `fallbackFonts` for an ordered list of additional loaded font handles.
Canvas shapes complete runs, including the platform's kerning, ligature,
joining and bidirectional handling; paragraphs wrap at word boundaries and
long words at grapheme boundaries. `direction` may be `auto`, `ltr`, or `rtl`.
For `auto`, each paragraph's base direction follows Unicode 16.0 first-strong
classes, skipping isolated text when choosing the surrounding direction. The
platform still supplies glyph shaping and bidirectional reordering; newer
Unicode character properties require a data update. Wrapped lines are painted
separately. A wrap across an open embedding, override, or isolate fails with
`AURA_TEXT_BIDI_WRAP_UNSUPPORTED`, and neutral or bracket resolution may
still differ from a full paragraph-wide bidi layout. A controls-only wrapped
line can trigger this rejection even where another line break could work.
`maxWidth`, `lineHeight` and `letterSpacing` use world units, and `maxLines`
and `rasterSize` bound layout. A nonzero `letterSpacing` fails explicitly when
the Canvas implementation does not expose that property. Font-backed SDF text
does not accept extrusion `depth`. Its material supports color, opacity,
roughness, metallic, emissive and texture anisotropy; custom shaders, texture
maps and other unsupported material fields raise `AURA_TEXT_MATERIAL_UNSUPPORTED`.
The browser may use its own fallback when
none of the supplied fonts covers a character; Canvas does not expose chosen
glyph IDs or a reliable missing-glyph list. `glyphCoverage` therefore says
`platform-unverified` and an empty `unsupportedCharacters` list is not proof
that every glyph came from the supplied fonts.

The root builder creates a texture snapshot when the node is built. A runtime
node can reshape new text with `app.nodes.require("caption").setText("...")`;
keep its font handles loaded until the final update. Rebuilding a label swaps
the compiled texture and geometry, then disposes the old resources. Serialized
snapshots retain their pixels but do not retain live font handles, so recreate
them with loaded fonts before calling `setText`. The bounded `GlyphAtlas` package API
also supports retained entries, dirty-region updates, LRU eviction of released
entries, and idempotent disposal. The temporary atlas used for the snapshot is
released immediately; the compiled label texture is released with its material.
The default accessible counterpart is a visually hidden DOM note containing the
original text; `accessibleLabel` overrides it and `accessibleLabel: false`
omits it. It is removed when the scene layer is disposed. `labels.*` remains
available for visible DOM annotations. These source paths have unit tests;
multilingual browser pixels and real font coverage remain Phase B acceptance.

## Shared text atlas

Built-in SDF text can explicitly request the shared glyph atlas:

```ts
const label = text3D("AURA 3D", {
  backend: "sdf",
  sdfGlyphAtlas: "shared",
  accessibleLabel: "Aura 3D"
});
```

The request is recorded in the text descriptor. The renderer may use the
shared atlas when its bounded layout and device path are available. A loaded
font can request the same option: its complete shaped, rasterized label is
stored in the atlas when its RGBA pixels are monochrome, it fits, and capacity
is available. The font still shapes whole runs, and every text change creates
a new label snapshot; individual loaded-font glyphs are not cached. Identical
shaped label pixels can reuse an atlas entry, including a released entry that
remains in the bounded cache. The cache retains at most 38 snapshots and
256 KiB of alpha pixels and compares pixels before reuse; text is still shaped
and rasterized on each update. Colored
snapshots, incompatible sampling settings, oversized labels, a full atlas, or
an unavailable device path retain the per-label SDF rendering path. Omitting
the option preserves the current default. It is valid only with the SDF
backend; an invalid value or an extruded backend is rejected. Accessible
labels retain the same defaults and overrides as other world text.

With an admitted atlas scope, both shared entries and separate-texture
fallbacks are retained until pending frames release them. When the device path
cannot admit an atlas scope, the existing per-label texture lifetime behavior
applies instead; this option does not add frame retention to that path.

For an opted-in built-in label, both the initial text and each `setText` value
are limited to 64 UTF-16 code units, before and after uppercasing. Longer text
is rejected before the label changes. This bounds the geometry needed if SDF
construction falls back to extruded text; loaded-font text keeps its own limits.

This opt-in is source-level functionality. It does not establish browser or GPU
rendering results; those remain separate acceptance work.

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

The extruded path does not load fonts or shape Unicode. Use the font-backed
SDF path above for platform-shaped text, or `labels.*` for visible accessible
annotations. Curved text and MSDF are not provided here.

Root evidence: `pnpm renderer:geometry-instancing-lod-text` and
`docs/rendering/geometry-instancing-lod-text.md`.

## What to use

| Need | Use | Do not use |
| --- | --- | --- |
| Callout, measurement, hotspot, HUD | `labels.*` | `text3D` |
| Selectable / screen-reader text | `labels.*` / `ui.*` (DOM) | mesh or SDF text |
| Lit in-world signage with outline/glow, LOD fade | SDF text (G1) | DOM labels |
| Title card, signage, extruded logo from the built-in catalog | `text3D` | DOM labels |
| Licensed typeface, platform-shaped Unicode, or wrapped layout | font-backed `text3D` SDF | built-in extruded catalog |

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

## Superiority (K1 · 2026-09-04)

- No K1 superiority claimed for SDF/world-label text: K1 measured no text
  pixels. The boundaries above stand; a text-rendering win will be claimed
  only with a same-scene capture receipt.
