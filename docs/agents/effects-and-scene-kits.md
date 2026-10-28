# Effects and scene kits: what each one does, with an example that compiles

Every `ts` block on this page is typechecked against the public API by `tools/docs-codeblocks` (check `docs-effects-scene-kit-snippets-compile`). The pixel evidence for each item is a receipt under `evidence/receipts/<name>/<version>.json`, written by `tests/browser/effects-receipts.spec.ts` and `tests/browser/scenekits-receipts.spec.ts` on the remote runner (software WebGL2, so these show that the pixels change as described, not how fast a GPU draws them). A receipt records frame hashes, mean luma and non-black ratio. Claim labels are in [claims-and-boundaries.md](claims-and-boundaries.md).

## Effects

Add an effect to a scene with `.add(effects.x({ ... }))`. The receipt for each effect compares a frame with the effect on against the same scene with it off.

### Ambient occlusion

`effects.ambientOcclusion` runs the `ssao` pass. Receipt `effects-ambient-occlusion`: the pass executed and the frame darkened where surfaces meet.

```ts
import { effects, lights, material, primitives, scene } from "@aura3d/engine";

export const withAmbientOcclusion = scene()
  .add(primitives.plane({ name: "floor", material: material.pbr({ color: "#9aa2ae" }) }).scale([9, 1, 9]))
  .add(primitives.box({ name: "crate", material: material.pbr({ color: "#dfe6f2" }) }).position(0, 0.5, 0))
  .add(lights.directional({ name: "key", position: [2.6, 4.2, 2.4], intensity: 2 }))
  .add(effects.ambientOcclusion({ name: "ao", intensity: 0.85, radius: 0.6 }));
```

### Colour grade

`effects.colorGrade` executes `contrast` and `saturation`. Receipt `effects-color-grade`: saturation 0 removes chroma, and contrast 1.7 widens the luma spread. Other grade fields are recorded and warned about, not silently accepted.

```ts
import { effects, lights, material, primitives, scene } from "@aura3d/engine";

export const graded = scene()
  .add(primitives.box({ name: "block", material: material.pbr({ color: "#d9534f" }) }).position(0, 0.5, 0))
  .add(lights.directional({ name: "key", position: [2.6, 4.2, 2.4], intensity: 2 }))
  .add(effects.colorGrade({ name: "grade", saturation: 0.4, contrast: 1.3 }));
```

### Vignette

Receipt `effects-vignette`: the corners darken and the centre keeps its value. `smoothness` is the falloff exponent: 2 keeps the centre bright, below 1 darkens the whole frame.

```ts
import { effects, lights, material, primitives, scene } from "@aura3d/engine";

export const vignetted = scene()
  .add(primitives.box({ name: "block", material: material.pbr({ color: "#dfe6f2" }) }).position(0, 0.5, 0))
  .add(lights.directional({ name: "key", position: [2.6, 4.2, 2.4], intensity: 2 }))
  .add(effects.vignette({ name: "vignette", intensity: 0.5, smoothness: 2, roundness: 1 }));
```

### Depth of field

Receipt `effects-depth-of-field`: edge energy drops away from the focus distance. `focus` is a linear-distance fraction (0 is near, 1 is far).

```ts
import { effects, lights, material, primitives, scene } from "@aura3d/engine";

export const shallowFocus = scene()
  .add(primitives.box({ name: "near", material: material.pbr({ color: "#dfe6f2" }) }).position(0, 0.5, 0))
  .add(primitives.box({ name: "far", material: material.pbr({ color: "#d9534f" }) }).position(-1.6, 0.4, -3.2))
  .add(lights.directional({ name: "key", position: [2.6, 4.2, 2.4], intensity: 2 }))
  .add(effects.depthOfField({ name: "dof", focus: 0.02, aperture: 1, maxBlur: 8 }));
```

### Contact shadows (SSAO-backed approximation)

`effects.contactShadows` is lowered to the screen-space ambient occlusion pass at reduced strength. On the receipt room it lowers mean luma by about 1.2 but changes no pixel past the receipt threshold, so it has no current receipt (the 4.3.7 one compared against an untonemapped baseline and is withdrawn; see `evidence/receipts/README.md`). It is not a dedicated contact-shadow pass and the shadow mask the options describe is not read by shading. Do not publish it as contact shadows or as a visible effect.

```ts
import { effects, lights, material, primitives, scene } from "@aura3d/engine";

export const grounded = scene()
  .add(primitives.plane({ name: "floor", material: material.pbr({ color: "#9aa2ae" }) }).scale([9, 1, 9]))
  .add(primitives.box({ name: "crate", material: material.pbr({ color: "#dfe6f2" }) }).position(0, 0.5, 0))
  .add(lights.directional({ name: "key", position: [2.6, 4.2, 2.4], intensity: 2 }))
  .add(effects.contactShadows({ intensity: 1, length: 0.5 }));
```

## Scene kits

A scene kit is a ready scene plus its own diagnostics. Mount one with `createAuraApp(selector, kit.toAppOptions())`. A kit built on its defaults must report no problems (`tests/unit/agent-api/scenekit-default-diagnostics.test.ts`), and each receipt shows two frames, one at start and one 90 frames later, so animated kits are proven to move. The kits supply scene content; the art direction, game rules and assets of your own product are still yours.

```ts
import { createAuraApp, sceneKits } from "@aura3d/engine";

const kit = sceneKits.materialLab();
export const app = createAuraApp("#stage", kit.toAppOptions());
export const problems = kit.diagnostics.problems;
```

```ts
import { createAuraApp, sceneKits } from "@aura3d/engine";

const kit = sceneKits.physicsPlayground();
export const app = createAuraApp("#stage", kit.toAppOptions());
```

```ts
import { createAuraApp, sceneKits } from "@aura3d/engine";

const kit = sceneKits.particleFountain();
export const app = createAuraApp("#stage", kit.toAppOptions());
```

```ts
import { createAuraApp, sceneKits } from "@aura3d/engine";

const kit = sceneKits.solarSystem();
export const app = createAuraApp("#stage", kit.toAppOptions());
```

```ts
import { createAuraApp, sceneKits } from "@aura3d/engine";

const kit = sceneKits.neonTunnel();
export const app = createAuraApp("#stage", kit.toAppOptions());
```

```ts
import { createAuraApp, sceneKits } from "@aura3d/engine";

const kit = sceneKits.dataViz();
export const app = createAuraApp("#stage", kit.toAppOptions());
```

```ts
import { createAuraApp, sceneKits } from "@aura3d/engine";

const kit = sceneKits.miniGolf();
export const app = createAuraApp("#stage", kit.toAppOptions());
```

```ts
import { createAuraApp, sceneKits } from "@aura3d/engine";

const kit = sceneKits.cityBlock();
export const app = createAuraApp("#stage", kit.toAppOptions());
```

```ts
import { createAuraApp, sceneKits } from "@aura3d/engine";

const kit = sceneKits.humanoidWalk();
export const app = createAuraApp("#stage", kit.toAppOptions());
```

`productViewer` takes a typed model asset from your own `src/aura-assets.ts` (`assets resolve` writes it), so the example takes the asset as a parameter:

```ts
import { createAuraApp, sceneKits } from "@aura3d/engine";

type ViewerAsset = Parameters<typeof sceneKits.productViewer>[0];

export function mountViewer(asset: ViewerAsset) {
  return createAuraApp("#stage", sceneKits.productViewer(asset).toAppOptions());
}
```
