# Material values (glTF metallic-roughness)

Typical values for surfaces that must read as what they are. Run
`npx @aura3d/cli@latest assets inspect <file.glb> --pbr` on every imported or
generated model and correct each material against this table before shipping
(lessons A11 to A13). Ranges, not targets: stay inside them, then judge on a
real GPU under the shipping look.

| Material | metallic | roughness | clearcoat | clearcoatRoughness | specular | normal map | Built-in |
|---|---|---|---|---|---|---|---|
| Car paint (solid) | 0 | 0.35 to 0.45 | 1.0 | 0.03 to 0.08 | 1.0 | none or very weak; no clearcoat normal | `material.clearcoatPaint`, `material.lacquer` |
| Metallic flake paint | 0.3 to 0.5 | 0.4 | 1.0 | 0.05 | 1.0 | none or very weak | `material.carPaint` (defaults to metallic 0.65; pass `metallic: 0.4`) |
| Chrome | 1 | 0.03 to 0.08 | - | - | 1.0 | none | `material.chrome` |
| Machined or polished alloy wheel | 1 | 0.15 to 0.25 | - | - | 1.0 | weak | `material.metal({ roughness: 0.2 })` |
| Brushed metal | 1 | 0.3 to 0.45, plus `anisotropy` | - | - | 1.0 | weak | `material.brushedMetal` |
| Glass | 0 | 0.02 to 0.1, `transmission` or low `opacity` | - | - | 1.0 | none | `material.glass` |
| Tyre rubber | 0 | 0.8 to 0.9 | - | - | 1.0 | tread detail is fine | `material.rubber` |
| Matte plastic | 0 | 0.6 to 0.8 | - | - | 1.0 | fine | `material.pbr` |
| Gloss plastic | 0 | 0.2 to 0.35 | - | - | 1.0 | weak, PNG | `material.pbr` |
| Skin | 0 | 0.45 to 0.6 (subsurface where available) | - | - | 1.0 | pores fine, PNG | `material.pbr` |
| Fabric | 0 | 0.8 to 1.0, `sheen` | - | - | 1.0 | weave fine | `material.fabric` |

Field names. glTF: `pbrMetallicRoughness.metallicFactor` / `roughnessFactor`,
`KHR_materials_clearcoat` (`clearcoatFactor`, `clearcoatRoughnessFactor`),
`KHR_materials_specular` (`specularFactor`), `normalTexture.scale`. Engine
(`material.pbr` / `material.physical` and the presets): `metallic`,
`roughness`, `clearcoat`, `clearcoatRoughness`, `specularIntensity`,
`normalScale`, `anisotropy`, `transmission`, `opacity`, `sheen`. A typed GLB's
`materialOverrides` take `metallic`, `roughness`, `clearcoat`,
`clearcoatRoughness`, `color`, `opacity`, `transmission`, `sheen` (no
`normalScale` or specular: change those in the GLB).

Never fix unwanted sheen by lowering specular or removing the clearcoat (A13).
Fix the cause: wrong metalness becomes dielectric paint, a noisy normal map
gets a lower `normalScale` (start near 0.3) or comes off the paint, a JPEG
normal map becomes PNG. Leave specular at 1.0 unless the material is physically
unusual.

## On a typed GLB at runtime (`materialOverrides`)

Target the material names `assets inspect --pbr` lists:

```ts
import { model } from "@aura3d/engine";
import { assets } from "./aura-assets";

const coupe = model(assets.coupe, {
  targetMaxDimension: 4.6,
  materialOverrides: [
    { target: "paint", metallic: 0, roughness: 0.4, clearcoat: 1, clearcoatRoughness: 0.05 },
    { target: "chrome", metallic: 1, roughness: 0.05 },
    { target: /wheel|rim/i, metallic: 1, roughness: 0.2 },
    { target: "glass", metallic: 0, roughness: 0.05, opacity: 0.3 },
    { target: /tyre|tire|rubber/i, metallic: 0, roughness: 0.85 }
  ]
});
```

## In the GLB itself (glTF-Transform)

Bakes the same values, plus the ones `materialOverrides` cannot set
(`normalTexture.scale`, `KHR_materials_specular`):

```js
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, KHRMaterialsClearcoat, KHRMaterialsSpecular } from "@gltf-transform/extensions";

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read("coupe.glb");
const clearcoat = doc.createExtension(KHRMaterialsClearcoat);
const specular = doc.createExtension(KHRMaterialsSpecular);
for (const mat of doc.getRoot().listMaterials()) {
  if (mat.getName() !== "paint") continue;
  mat.setMetallicFactor(0).setRoughnessFactor(0.4).setMetallicRoughnessTexture(null);
  mat.setNormalScale(0.3); // or mat.setNormalTexture(null) where the panel should be smooth
  mat.setExtension("KHR_materials_clearcoat", clearcoat.createClearcoat().setClearcoatFactor(1).setClearcoatRoughnessFactor(0.05));
  mat.setExtension("KHR_materials_specular", specular.createSpecular().setSpecularFactor(1));
}
await io.write("coupe.fixed.glb", doc);
```

Then `assets inspect coupe.fixed.glb --pbr` again: the `PBR_*` warnings for
those materials should be gone.
