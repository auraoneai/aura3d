# @aura3d/materials

`@aura3d/materials` owns PBR material presets, texture sets, material
validation, node materials, and material preview scene helpers for Aura3D.

## Public API

- `listThreeCompatPbrMaterials`, `findThreeCompatPbrMaterial`, and
  `THREE_COMPAT_PBR_MATERIAL_LIBRARY`: curated PBR material preset data.
- `THREE_COMPAT_REQUIRED_MATERIAL_CLASSES`: required compatibility material
  class coverage.
- `findThreeCompatTextureSet` and `THREE_COMPAT_TEXTURE_SETS`: texture set
  lookup.
- `createThreeCompatMaterialPreviewScene` and
  `createThreeCompatMaterialPreviewTile`: preview scene/tile helpers.
- `MaterialPresets` and `NodeMaterial` exports for package-level material
  helpers.

`@aura3d/materials/node` additionally exports
`summarizeThreeCompatMaterialLibrary` for filesystem-backed corpus validation,
plus `validateGameReadyMaterialLibrary` / `validateGameReadyMaterialPreset`
for the game-ready presets below.

## Game-Ready Material Library (PART C2)

Six presets in `src/GameReadyMaterialLibrary.ts`, reachable through
`listGameReadyMaterials` / `findGameReadyMaterial`. Every preset ships with a
root `@aura3d/engine` example snippet, a probe screenshot under
`tests/reports/game-ready-materials/`, and a tunables table. Probe evidence is
retained by `tests/browser/game-ready-material-probes.spec.ts` (one distinct
screenshot per preset plus `manifest.json`).

Claim boundary: parameter presets over the public material spec. The skin
entry is a wrapped-diffuse approximation and is never presented as physical
scattering.

### carPaint — clearcoat plus flake normal

Probe: `tests/reports/game-ready-materials/carPaint.png`
(beveled-cube, industrial-sunset-puresky).

```ts
import { material, primitives, scene } from "@aura3d/engine";

const paint = material.clearcoatPaint({
  color: "#c1121f",
  roughness: 0.32,
  metallic: 0.65,
  clearcoat: 1,
  clearcoatRoughness: 0.06,
  normalScale: 0.35,
  envMapIntensity: 1.4
});
scene().add(primitives.sphere({ name: "car body panel", material: paint }));
```

| Tunable | Default | Range | Effect |
| --- | --- | --- | --- |
| clearcoat | 1 | 0..1 | Top-gloss shell strength; lower to dull the finish. |
| clearcoatRoughness | 0.06 | 0..0.3 | Sharpness of clearcoat reflections. |
| flakeNormalScale | 0.35 | 0..1 | Metallic-flake sparkle intensity via the flake normal. |
| flakeDensity | 0.6 | 0..1 | Flake coverage; raise for glitter, lower for solid gloss. |
| roughness | 0.32 | 0.05..0.7 | Base-coat spread under the clearcoat shell. |
| metallic | 0.65 | 0..1 | Base-coat metalness; lower for candy/dielectric looks. |

### skinSSS-approx — wrapped diffuse plus thickness tint (approximation)

Probe: `tests/reports/game-ready-materials/skinSSS-approx.png`
(sphere, showroom-softboxes).

```ts
import { material, primitives, scene } from "@aura3d/engine";

const skin = material.pbr({
  color: "#d98c6b",
  roughness: 0.55,
  metallic: 0,
  emissive: "#fa5940",
  emissiveIntensity: 0.12,
  envMapIntensity: 0.5
});
// wrapDiffuse 0.5 softens the terminator; thicknessTint warms thin areas.
scene().add(primitives.sphere({ name: "character head", material: skin }));
```

| Tunable | Default | Range | Effect |
| --- | --- | --- | --- |
| wrapDiffuse | 0.5 | 0..1 | Light wrap around the terminator; higher looks softer. |
| thicknessTint | [0.98, 0.35, 0.25] | color | Warm tint for thin areas (ears, nose, fingers). |
| thicknessScale | 0.8 | 0..2 | Strength of the thickness tint contribution. |
| roughness | 0.55 | 0.3..0.8 | Skin sheen; lower reads oily, higher reads dry. |
| emissiveIntensity | 0.12 | 0..0.4 | Stand-in glow for transmitted warmth; keep subtle. |

### glassThin — transmission, thin-walled

Probe: `tests/reports/game-ready-materials/glassThin.png`
(thin-pane, studio-small-08).

```ts
import { material, primitives, scene } from "@aura3d/engine";

const thinGlass = material.clearGlass({
  color: "#bfe6f2",
  opacity: 0.35,
  transmission: 0.9,
  thickness: 0.02,
  roughness: 0.05
});
scene().add(primitives.box({ name: "visor pane", material: thinGlass }));
```

| Tunable | Default | Range | Effect |
| --- | --- | --- | --- |
| transmission | 0.9 | 0..1 | See-through strength; lower for smoked glass. |
| thickness | 0.02 | 0..0.1 | Refraction volume; keep near zero for thin panes. |
| roughness | 0.05 | 0..0.4 | Raise for frosted or dirty glass. |
| ior | 1.5 | 1..2.5 | Index of refraction for edge bending. |
| opacity | 0.35 | 0..1 | Blend fallback where transmission is unavailable. |

### brushedMetal — anisotropy

Probe: `tests/reports/game-ready-materials/brushedMetal.png`
(beveled-cube, showroom-softboxes).

```ts
import { material, primitives, scene } from "@aura3d/engine";

const brushed = material.pbr({
  color: "#b8bcc2",
  roughness: 0.38,
  metallic: 1,
  anisotropy: 0.85,
  anisotropyRotation: 1.5708,
  envMapIntensity: 1.3
});
scene().add(primitives.box({ name: "brushed housing", material: brushed }));
```

| Tunable | Default | Range | Effect |
| --- | --- | --- | --- |
| anisotropy | 0.85 | 0..1 | Highlight stretch along the brush direction. |
| anisotropyRotation | 1.5708 | 0..6.2832 | Brush direction in radians. |
| roughness | 0.38 | 0.1..0.7 | Brush coarseness; higher blurs the streak. |
| brushScale | 42 | 8..128 | Procedural brush texture tiling density. |
| envMapIntensity | 1.3 | 0..3 | Reflection punch under studio lighting. |

### foliage — alpha-cutout plus translucency

Probe: `tests/reports/game-ready-materials/foliage.png`
(card, showroom-softboxes).

```ts
import { material, primitives, scene } from "@aura3d/engine";

const leaf = material.pbr({
  color: "#40732e",
  roughness: 0.85,
  metallic: 0,
  emissive: "#8ccc4d",
  emissiveIntensity: 0.25,
  opacity: 1
});
// Apply alphaMode mask with alphaCutoff 0.5 on the card texture,
// and translucency 0.6 toward the sun color for backlight.
scene().add(primitives.plane({ name: "leaf card", material: leaf }));
```

| Tunable | Default | Range | Effect |
| --- | --- | --- | --- |
| alphaCutoff | 0.5 | 0..1 | Cutout threshold; lower keeps soft edges, higher trims them. |
| translucency | 0.6 | 0..1 | Backlight lift when the sun is behind the leaves. |
| translucencyColor | [0.55, 0.8, 0.3] | color | Tint of transmitted backlight. |
| roughness | 0.85 | 0.5..1 | Leaf matte response; rarely below 0.5 outdoors. |
| side | double | front \| double | Cards need double-sided rendering. |

### concreteAsphalt — roughness variation

Probe: `tests/reports/game-ready-materials/concreteAsphalt.png`
(sphere, showroom-softboxes).

```ts
import { material, primitives, scene } from "@aura3d/engine";

const asphalt = material.pbr({
  color: "#525458",
  roughness: 0.85,
  metallic: 0,
  normalScale: 0.9,
  envMapIntensity: 0.35
});
// roughnessVariation 0.25 modulates roughness per aggregate patch.
scene().add(primitives.plane({ name: "road surface", material: asphalt }));
```

| Tunable | Default | Range | Effect |
| --- | --- | --- | --- |
| roughnessVariation | 0.25 | 0..0.5 | Patch-to-patch roughness breakup; higher looks weathered. |
| roughness | 0.85 | 0.6..1 | Mean roughness; rarely below 0.6 for ground. |
| normalScale | 0.9 | 0..1.5 | Aggregate bump strength. |
| aggregateScale | 18 | 4..64 | Aggregate grain tiling density. |
| envMapIntensity | 0.35 | 0..1 | Keep low so ground stays matte under studio light. |

## Route adoption

- `packages/create-aura3d/templates/product-viewer/src/main.ts`: the plinth
  wears the `carPaint` shell and the floor carries the `glassThin`
  color/roughness values as a display deck.
- `packages/create-aura3d/templates/racing-starter/src/main.ts`: a static
  paint-and-glass gantry wears full `carPaint` values
  (`clearcoatPaint` + flake `normalScale`) and `glassThin` values
  (`glass` with thin-walled transmission).

## Package Boundary

This package provides material metadata and helper APIs. Public claims about
full PBR parity, texture fidelity, postprocess, or production material quality
need renderer tests and browser pixel evidence for the exact route or runtime
path being described.

The root entry is browser-pure. Filesystem-backed corpus validation is available
only from `@aura3d/materials/node`.
