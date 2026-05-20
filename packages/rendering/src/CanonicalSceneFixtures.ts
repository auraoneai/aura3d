import { Geometry } from "./Geometry";
import { PBRMaterial } from "./PBRMaterial";
import { createProductTurntableRenderKit, type ProductTurntableRenderKit, type ProductTurntableRenderKitOptions } from "./ProductTurntableFixtures";
import type { RenderItem } from "./ForwardPass";

export interface CanonicalProductSceneFixture {
  readonly id: "engine-readiness-canonical-product-scene";
  readonly sourceFixture: "createProductTurntableRenderKit";
  readonly publicSetupLineBudget: 30;
  readonly featureChecklist: readonly string[];
  readonly blockedClaims: readonly string[];
}

export interface CanonicalProductSceneRenderKit extends ProductTurntableRenderKit {
  readonly canonical: CanonicalProductSceneFixture;
}

export function createCanonicalProductSceneRenderKit(
  options: ProductTurntableRenderKitOptions = {}
): CanonicalProductSceneRenderKit {
  const kit = createProductTurntableRenderKit({
    elapsedSeconds: 2.25,
    lightingPreset: "studio",
    ...options
  });
  const alphaLensGeometry = Geometry.texturedCube(1);
  const alphaLensMaterial = new PBRMaterial({
    name: "canonical-transparent-control-lens",
    baseColor: [0.58, 0.92, 1, 0.36],
    metallic: 0,
    roughness: 0.06,
    emissiveColor: [0.02, 0.14, 0.18],
    emissiveStrength: 0.35,
    renderState: {
      blend: true,
      depthWrite: false,
      cullMode: "none"
    }
  });
  const renderItems = kit.renderItems as RenderItem[];
  renderItems.push({
    label: "canonical-transparent-control-lens",
    geometry: alphaLensGeometry,
    material: alphaLensMaterial,
    modelMatrix: modelMatrix(0.82, 0.04, 0.31, 0.24, 0.42, 0.018)
  });

  const baseDispose = kit.dispose;
  return {
    ...kit,
    canonical: {
      id: "engine-readiness-canonical-product-scene",
      sourceFixture: "createProductTurntableRenderKit",
      publicSetupLineBudget: 30,
      featureChecklist: [
        "pbr-materials",
        "textured-materials",
        "metallic-roughness-variation",
        "normal-map",
        "emissive",
        "alpha-blend",
        "environment-lighting",
        "directional-shadow",
        "auto-frame-camera",
        "hdr-render-target",
        "tone-mapping",
        "color-grade",
        "bloom",
        "fxaa"
      ],
      blockedClaims: [
        "Unity replacement",
        "Unreal replacement",
        "broad Three.js replacement",
        "Babylon.js replacement",
        "full glTF parity",
        "full WebGPU parity",
        "production game engine"
      ]
    },
    dispose: () => {
      alphaLensGeometry.dispose();
      baseDispose();
    }
  };
}

function modelMatrix(tx: number, ty: number, tz: number, sx: number, sy: number, sz: number): Float32Array {
  return new Float32Array([
    sx, 0, 0, 0,
    0, sy, 0, 0,
    0, 0, sz, 0,
    tx, ty, tz, 1
  ]);
}
