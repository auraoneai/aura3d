export interface ProductVisualMaterialDescriptor {
  readonly id: string;
  readonly kind: "pbr" | "unlit";
  readonly color: readonly [number, number, number, number];
  readonly metallic?: number;
  readonly roughness?: number;
  readonly clearcoat?: number;
  readonly transmission?: number;
  readonly alpha?: number;
}

export interface ProductVisualPartDescriptor {
  readonly id: string;
  readonly geometry: "cube" | "sphere" | "cylinder";
  readonly material: string;
  readonly position: readonly [number, number, number];
  readonly scale: readonly [number, number, number];
  readonly rotation?: readonly [number, number, number];
}

export interface ProductVisualEcommerceWorkflowDescriptor {
  readonly source: "origin-master-ecommerce-turntable-adapted";
  readonly sourceFiles: readonly string[];
  readonly autoRotate: true;
  readonly pauseOnInteraction: true;
  readonly lightingPresets: readonly ["studio", "soft", "inspection", "dramatic", "neutral"];
  readonly hotspots: readonly {
    readonly id: string;
    readonly group: "material" | "controls" | "comfort";
    readonly targetPart: string;
  }[];
  readonly capture: {
    readonly screenshotViews: readonly ["hero", "front", "detail", "exploded"];
    readonly screenshotFormats: readonly ["png", "jpeg", "webp"];
    readonly spinFrameCount: 72;
    readonly batchTasks: readonly ["thumbnail", "screenshot", "360-spin", "ar-export"];
    readonly arExportFormats: readonly ["glb"];
    readonly blockedExportClaims: readonly string[];
  };
}

export interface ProductVisualAssetPipelineDescriptor {
  readonly source: "shared-product-visual-descriptor";
  readonly sourceFiles: readonly [
    "tools/external-parity-product-visual-parity/productScene.ts",
    "tools/external-parity-product-visual-parity/index.ts",
    "tools/external-parity-external-engine-baselines/index.ts"
  ];
  readonly generatedDescriptorPath: "fixtures/external-engine-baselines/external-parity/product-visual-parity-scene.json";
  readonly localEngines: readonly ["aura3d", "threejs", "babylon"];
  readonly externalEngines: readonly ["unity", "unreal"];
  readonly sameDescriptorForAllEngines: true;
  readonly deterministicAssetLayout: true;
  readonly productionWorkflowEvidence: readonly [
    "material-variant-descriptor",
    "turntable-hotspots",
    "multi-view-capture-plan",
    "batch-output-plan",
    "ar-export-boundary"
  ];
  readonly commercialImportedAssetClaimed: false;
}

export interface ProductVisualParitySceneDescriptor {
  readonly schemaVersion: "external-parity-product-visual-parity-scene";
  readonly id: "external-parity-deterministic-product-visual-parity";
  readonly viewport: {
    readonly width: 720;
    readonly height: 480;
  };
  readonly camera: "orthographic-front";
  readonly lighting: "studio";
  readonly materials: readonly ProductVisualMaterialDescriptor[];
  readonly parts: readonly ProductVisualPartDescriptor[];
  readonly assetPipeline: ProductVisualAssetPipelineDescriptor;
  readonly minimumEvidence: {
    readonly productParts: 18;
    readonly materialCount: 7;
    readonly drawCalls: 18;
    readonly turntableHotspots: 3;
    readonly captureViews: 4;
    readonly batchTasks: 4;
  };
  readonly ecommerceWorkflow: ProductVisualEcommerceWorkflowDescriptor;
  readonly claimBoundary: string;
}

function studioMicroPanelParts(): ProductVisualPartDescriptor[] {
  const parts: ProductVisualPartDescriptor[] = [];
  for (let index = 0; index < 28; index += 1) {
    const x = -0.92 + index * 0.068;
    parts.push({
      id: `studio-back-micro-vertical-${index}`,
      geometry: "cube",
      material: index % 5 === 0 ? "label" : index % 3 === 0 ? "dark" : "trim",
      position: [x, 0.08 + Math.sin(index * 1.9) * 0.05, 0.245],
      scale: [0.011, 0.52 + (index % 4) * 0.08, 0.01],
    });
  }
  for (let index = 0; index < 22; index += 1) {
    const y = -0.58 + index * 0.056;
    parts.push({
      id: `studio-back-micro-horizontal-${index}`,
      geometry: "cube",
      material: index % 6 === 0 ? "label" : index % 4 === 0 ? "dark" : "trim",
      position: [Math.sin(index * 0.7) * 0.08, y, 0.235],
      scale: [1.52 - (index % 3) * 0.18, 0.01, 0.01],
    });
  }
  for (let index = 0; index < 48; index += 1) {
    const x = -0.92 + (index % 12) * 0.17;
    const y = -0.92 + Math.floor(index / 12) * 0.055;
    parts.push({
      id: `studio-floor-micro-slat-${index}`,
      geometry: "cube",
      material: index % 5 === 0 ? "label" : index % 2 === 0 ? "trim" : "dark",
      position: [x, y, 0.205],
      scale: [0.1 + (index % 3) * 0.035, 0.009, 0.01],
    });
  }
  for (let index = 0; index < 16; index += 1) {
    const side = index % 2 === 0 ? -1 : 1;
    parts.push({
      id: `studio-softbox-pinstripe-${index}`,
      geometry: "cube",
      material: index % 3 === 0 ? "glow" : "trim",
      position: [side * 0.82, -0.14 + Math.floor(index / 2) * 0.08, 0.235],
      scale: [0.105, 0.004, 0.01],
    });
  }
  for (let index = 0; index < 72; index += 1) {
    const column = index % 12;
    const row = Math.floor(index / 12);
    const material = ["backdrop-b", "trim", "backdrop-c", "dark", "label", "glow"][index % 6]!;
    parts.push({
      id: `studio-background-mosaic-${index}`,
      geometry: "cube",
      material,
      position: [-1.06 + column * 0.19, -0.42 + row * 0.18, 0.225],
      scale: [0.075 + (index % 3) * 0.018, 0.018 + (index % 4) * 0.006, 0.01],
      rotation: [0, 0, ((index % 5) - 2) * 0.035],
    });
  }
  for (let index = 0; index < 192; index += 1) {
    const column = index % 16;
    const row = Math.floor(index / 16);
    const material = ["backdrop-a", "backdrop-b", "backdrop-c", "backdrop-d", "backdrop-e", "backdrop-f"][index % 6]!;
    parts.push({
      id: `studio-full-frame-background-tile-${index}`,
      geometry: "cube",
      material,
      position: [-1.42 + column * 0.19, -0.98 + row * 0.18, 0.215],
      scale: [0.082, 0.078, 0.008],
    });
  }
  return parts;
}

export const productVisualParityScene: ProductVisualParitySceneDescriptor = {
  schemaVersion: "external-parity-product-visual-parity-scene",
  id: "external-parity-deterministic-product-visual-parity",
  viewport: {
    width: 720,
    height: 480,
  },
  camera: "orthographic-front",
  lighting: "studio",
  materials: [
    { id: "body", kind: "pbr", color: [0.18, 0.24, 0.28, 1], metallic: 0.42, roughness: 0.28, clearcoat: 0.36 },
    { id: "accent", kind: "pbr", color: [0.9, 0.48, 0.2, 1], metallic: 0.68, roughness: 0.22, clearcoat: 0.28 },
    { id: "glass", kind: "pbr", color: [0.45, 0.72, 0.82, 0.82], metallic: 0.02, roughness: 0.08, transmission: 0.22, alpha: 0.74 },
    { id: "dark", kind: "pbr", color: [0.018, 0.02, 0.024, 1], metallic: 0.04, roughness: 0.62 },
    { id: "glow", kind: "unlit", color: [0.24, 0.84, 1, 1] },
    { id: "trim", kind: "unlit", color: [0.72, 0.76, 0.74, 1] },
    { id: "label", kind: "unlit", color: [1, 0.86, 0.24, 1] },
    { id: "backdrop-a", kind: "unlit", color: [0.5, 0.57, 0.6, 1] },
    { id: "backdrop-b", kind: "unlit", color: [0.4, 0.48, 0.54, 1] },
    { id: "backdrop-c", kind: "unlit", color: [0.66, 0.68, 0.64, 1] },
    { id: "backdrop-d", kind: "unlit", color: [0.22, 0.31, 0.36, 1] },
    { id: "backdrop-e", kind: "unlit", color: [0.78, 0.72, 0.54, 1] },
    { id: "backdrop-f", kind: "unlit", color: [0.32, 0.39, 0.46, 1] },
  ],
  parts: [
    { id: "studio-backdrop", geometry: "cube", material: "backdrop-a", position: [0, 0.08, 0.42], scale: [3.25, 2.34, 0.02] },
    { id: "studio-left-gradient-panel", geometry: "cube", material: "backdrop-b", position: [-1.02, 0.08, 0.4], scale: [0.66, 2.22, 0.018] },
    { id: "studio-right-warm-panel", geometry: "cube", material: "backdrop-c", position: [1.02, 0.08, 0.4], scale: [0.66, 2.22, 0.018] },
    { id: "studio-top-soft-shadow", geometry: "cube", material: "backdrop-b", position: [0, 0.82, 0.39], scale: [2.72, 0.24, 0.018] },
    { id: "studio-left-panel-seam", geometry: "cube", material: "dark", position: [-0.42, 0.08, 0.28], scale: [0.012, 1.48, 0.012] },
    { id: "studio-right-panel-seam", geometry: "cube", material: "dark", position: [0.42, 0.08, 0.28], scale: [0.012, 1.48, 0.012] },
    { id: "studio-top-panel-seam", geometry: "cube", material: "dark", position: [0, 0.56, 0.28], scale: [1.72, 0.012, 0.012] },
    { id: "studio-back-panel-shelf", geometry: "cube", material: "trim", position: [0, -0.08, 0.29], scale: [1.48, 0.018, 0.012] },
    { id: "studio-floor", geometry: "cube", material: "backdrop-b", position: [0, -0.78, 0.36], scale: [3.18, 0.62, 0.02] },
    { id: "studio-left-softbox", geometry: "cube", material: "backdrop-c", position: [-1.18, 0.16, 0.32], scale: [0.13, 0.92, 0.018] },
    { id: "studio-right-softbox", geometry: "cube", material: "backdrop-c", position: [1.18, 0.16, 0.32], scale: [0.13, 0.92, 0.018] },
    { id: "studio-horizon-trim", geometry: "cube", material: "trim", position: [0, -0.36, 0.31], scale: [2.72, 0.025, 0.018] },
    { id: "studio-floor-front-lip", geometry: "cube", material: "trim", position: [0, -0.96, 0.25], scale: [2.84, 0.04, 0.018] },
    { id: "studio-floor-left-groove", geometry: "cube", material: "dark", position: [-0.48, -0.88, 0.24], scale: [0.5, 0.018, 0.012] },
    { id: "studio-floor-right-groove", geometry: "cube", material: "dark", position: [0.48, -0.88, 0.24], scale: [0.5, 0.018, 0.012] },
    { id: "studio-floor-slat-1", geometry: "cube", material: "backdrop-c", position: [-0.68, -0.71, 0.24], scale: [0.34, 0.018, 0.012] },
    { id: "studio-floor-slat-2", geometry: "cube", material: "backdrop-c", position: [0, -0.69, 0.24], scale: [0.42, 0.018, 0.012] },
    { id: "studio-floor-slat-3", geometry: "cube", material: "backdrop-c", position: [0.68, -0.71, 0.24], scale: [0.34, 0.018, 0.012] },
    { id: "studio-back-panel-rib-1", geometry: "cube", material: "dark", position: [-0.84, 0.5, 0.265], scale: [0.012, 0.22, 0.012] },
    { id: "studio-back-panel-rib-2", geometry: "cube", material: "dark", position: [-0.72, 0.5, 0.265], scale: [0.012, 0.22, 0.012] },
    { id: "studio-back-panel-rib-3", geometry: "cube", material: "dark", position: [-0.6, 0.5, 0.265], scale: [0.012, 0.22, 0.012] },
    { id: "studio-back-panel-rib-4", geometry: "cube", material: "dark", position: [0.6, 0.5, 0.265], scale: [0.012, 0.22, 0.012] },
    { id: "studio-back-panel-rib-5", geometry: "cube", material: "dark", position: [0.72, 0.5, 0.265], scale: [0.012, 0.22, 0.012] },
    { id: "studio-back-panel-rib-6", geometry: "cube", material: "dark", position: [0.84, 0.5, 0.265], scale: [0.012, 0.22, 0.012] },
    ...studioMicroPanelParts(),
    { id: "studio-left-softbox-louver-1", geometry: "cube", material: "trim", position: [-0.82, 0.36, 0.255], scale: [0.11, 0.01, 0.012] },
    { id: "studio-left-softbox-louver-2", geometry: "cube", material: "trim", position: [-0.82, 0.22, 0.255], scale: [0.11, 0.01, 0.012] },
    { id: "studio-left-softbox-louver-3", geometry: "cube", material: "trim", position: [-0.82, 0.08, 0.255], scale: [0.11, 0.01, 0.012] },
    { id: "studio-right-softbox-louver-1", geometry: "cube", material: "trim", position: [0.82, 0.36, 0.255], scale: [0.11, 0.01, 0.012] },
    { id: "studio-right-softbox-louver-2", geometry: "cube", material: "trim", position: [0.82, 0.22, 0.255], scale: [0.11, 0.01, 0.012] },
    { id: "studio-right-softbox-louver-3", geometry: "cube", material: "trim", position: [0.82, 0.08, 0.255], scale: [0.11, 0.01, 0.012] },
    { id: "studio-plinth-front-slot-1", geometry: "cube", material: "dark", position: [-0.42, -0.835, -0.12], scale: [0.12, 0.012, 0.012] },
    { id: "studio-plinth-front-slot-2", geometry: "cube", material: "dark", position: [-0.14, -0.835, -0.12], scale: [0.12, 0.012, 0.012] },
    { id: "studio-plinth-front-slot-3", geometry: "cube", material: "dark", position: [0.14, -0.835, -0.12], scale: [0.12, 0.012, 0.012] },
    { id: "studio-plinth-front-slot-4", geometry: "cube", material: "dark", position: [0.42, -0.835, -0.12], scale: [0.12, 0.012, 0.012] },
    { id: "floor-shadow", geometry: "sphere", material: "dark", position: [0, -0.72, -0.08], scale: [1.08, 0.12, 0.035] },
    { id: "display-plinth", geometry: "cube", material: "trim", position: [0, -0.82, -0.02], scale: [1.36, 0.08, 0.12] },
    { id: "left-yoke", geometry: "cube", material: "trim", position: [-0.48, -0.08, -0.1], scale: [0.08, 0.68, 0.08], rotation: [0, 0, -0.04] },
    { id: "right-yoke", geometry: "cube", material: "trim", position: [0.48, -0.08, -0.1], scale: [0.08, 0.68, 0.08], rotation: [0, 0, 0.04] },
    { id: "left-cup-shell", geometry: "sphere", material: "body", position: [-0.5, -0.37, -0.16], scale: [0.3, 0.42, 0.12] },
    { id: "right-cup-shell", geometry: "sphere", material: "body", position: [0.5, -0.37, -0.16], scale: [0.3, 0.42, 0.12] },
    { id: "left-cup-ring", geometry: "sphere", material: "accent", position: [-0.5, -0.36, -0.25], scale: [0.2, 0.3, 0.055] },
    { id: "right-cup-ring", geometry: "sphere", material: "accent", position: [0.5, -0.36, -0.25], scale: [0.2, 0.3, 0.055] },
    { id: "left-cushion", geometry: "sphere", material: "dark", position: [-0.5, -0.36, -0.32], scale: [0.14, 0.22, 0.035] },
    { id: "right-cushion", geometry: "sphere", material: "dark", position: [0.5, -0.36, -0.32], scale: [0.14, 0.22, 0.035] },
    { id: "left-driver-mesh", geometry: "sphere", material: "glass", position: [-0.5, -0.36, -0.36], scale: [0.1, 0.16, 0.025] },
    { id: "right-driver-mesh", geometry: "sphere", material: "glass", position: [0.5, -0.36, -0.36], scale: [0.1, 0.16, 0.025] },
    { id: "left-driver-slot-1", geometry: "cube", material: "trim", position: [-0.5, -0.43, -0.39], scale: [0.12, 0.012, 0.012] },
    { id: "left-driver-slot-2", geometry: "cube", material: "trim", position: [-0.5, -0.36, -0.39], scale: [0.14, 0.012, 0.012] },
    { id: "left-driver-slot-3", geometry: "cube", material: "trim", position: [-0.5, -0.29, -0.39], scale: [0.12, 0.012, 0.012] },
    { id: "left-driver-slot-4", geometry: "cube", material: "trim", position: [-0.57, -0.36, -0.395], scale: [0.012, 0.18, 0.012] },
    { id: "left-driver-slot-5", geometry: "cube", material: "trim", position: [-0.43, -0.36, -0.395], scale: [0.012, 0.18, 0.012] },
    { id: "right-driver-slot-1", geometry: "cube", material: "trim", position: [0.5, -0.43, -0.39], scale: [0.12, 0.012, 0.012] },
    { id: "right-driver-slot-2", geometry: "cube", material: "trim", position: [0.5, -0.36, -0.39], scale: [0.14, 0.012, 0.012] },
    { id: "right-driver-slot-3", geometry: "cube", material: "trim", position: [0.5, -0.29, -0.39], scale: [0.12, 0.012, 0.012] },
    { id: "right-driver-slot-4", geometry: "cube", material: "trim", position: [0.43, -0.36, -0.395], scale: [0.012, 0.18, 0.012] },
    { id: "right-driver-slot-5", geometry: "cube", material: "trim", position: [0.57, -0.36, -0.395], scale: [0.012, 0.18, 0.012] },
    { id: "headband-center", geometry: "cube", material: "body", position: [0, 0.47, -0.18], scale: [0.46, 0.1, 0.1] },
    { id: "headband-left-1", geometry: "cube", material: "body", position: [-0.25, 0.39, -0.18], scale: [0.28, 0.09, 0.1], rotation: [0, 0, -0.28] },
    { id: "headband-left-2", geometry: "cube", material: "body", position: [-0.43, 0.2, -0.18], scale: [0.34, 0.085, 0.1], rotation: [0, 0, -0.76] },
    { id: "headband-right-1", geometry: "cube", material: "body", position: [0.25, 0.39, -0.18], scale: [0.28, 0.09, 0.1], rotation: [0, 0, 0.28] },
    { id: "headband-right-2", geometry: "cube", material: "body", position: [0.43, 0.2, -0.18], scale: [0.34, 0.085, 0.1], rotation: [0, 0, 0.76] },
    { id: "headband-inner-pad", geometry: "cube", material: "dark", position: [0, 0.36, -0.28], scale: [0.46, 0.06, 0.04] },
    { id: "headband-stitch-left", geometry: "cube", material: "trim", position: [-0.18, 0.405, -0.36], scale: [0.1, 0.012, 0.012] },
    { id: "headband-stitch-center", geometry: "cube", material: "trim", position: [0, 0.415, -0.36], scale: [0.12, 0.012, 0.012] },
    { id: "headband-stitch-right", geometry: "cube", material: "trim", position: [0.18, 0.405, -0.36], scale: [0.1, 0.012, 0.012] },
    { id: "headband-stitch-micro-left-1", geometry: "cube", material: "dark", position: [-0.32, 0.325, -0.385], scale: [0.012, 0.09, 0.01] },
    { id: "headband-stitch-micro-left-2", geometry: "cube", material: "dark", position: [-0.24, 0.365, -0.385], scale: [0.012, 0.085, 0.01] },
    { id: "headband-stitch-micro-left-3", geometry: "cube", material: "dark", position: [-0.13, 0.395, -0.385], scale: [0.012, 0.075, 0.01] },
    { id: "headband-stitch-micro-right-1", geometry: "cube", material: "dark", position: [0.13, 0.395, -0.385], scale: [0.012, 0.075, 0.01] },
    { id: "headband-stitch-micro-right-2", geometry: "cube", material: "dark", position: [0.24, 0.365, -0.385], scale: [0.012, 0.085, 0.01] },
    { id: "headband-stitch-micro-right-3", geometry: "cube", material: "dark", position: [0.32, 0.325, -0.385], scale: [0.012, 0.09, 0.01] },
    { id: "left-hinge-pin", geometry: "cylinder", material: "accent", position: [-0.48, 0.02, -0.3], scale: [0.055, 0.12, 0.055], rotation: [Math.PI / 2, 0, 0] },
    { id: "right-hinge-pin", geometry: "cylinder", material: "accent", position: [0.48, 0.02, -0.3], scale: [0.055, 0.12, 0.055], rotation: [Math.PI / 2, 0, 0] },
    { id: "left-cup-grille-fine-1", geometry: "cube", material: "dark", position: [-0.5, -0.455, -0.415], scale: [0.16, 0.008, 0.01] },
    { id: "left-cup-grille-fine-2", geometry: "cube", material: "dark", position: [-0.5, -0.405, -0.415], scale: [0.18, 0.008, 0.01] },
    { id: "left-cup-grille-fine-3", geometry: "cube", material: "dark", position: [-0.5, -0.355, -0.415], scale: [0.2, 0.008, 0.01] },
    { id: "left-cup-grille-fine-4", geometry: "cube", material: "dark", position: [-0.5, -0.305, -0.415], scale: [0.18, 0.008, 0.01] },
    { id: "left-cup-grille-fine-5", geometry: "cube", material: "dark", position: [-0.5, -0.255, -0.415], scale: [0.16, 0.008, 0.01] },
    { id: "right-cup-grille-fine-1", geometry: "cube", material: "dark", position: [0.5, -0.455, -0.415], scale: [0.16, 0.008, 0.01] },
    { id: "right-cup-grille-fine-2", geometry: "cube", material: "dark", position: [0.5, -0.405, -0.415], scale: [0.18, 0.008, 0.01] },
    { id: "right-cup-grille-fine-3", geometry: "cube", material: "dark", position: [0.5, -0.355, -0.415], scale: [0.2, 0.008, 0.01] },
    { id: "right-cup-grille-fine-4", geometry: "cube", material: "dark", position: [0.5, -0.305, -0.415], scale: [0.18, 0.008, 0.01] },
    { id: "right-cup-grille-fine-5", geometry: "cube", material: "dark", position: [0.5, -0.255, -0.415], scale: [0.16, 0.008, 0.01] },
    { id: "left-control-chip", geometry: "cube", material: "glow", position: [-0.66, -0.28, -0.33], scale: [0.05, 0.16, 0.035] },
    { id: "right-control-chip", geometry: "cube", material: "glow", position: [0.66, -0.28, -0.33], scale: [0.05, 0.16, 0.035] },
    { id: "left-control-status-dot-1", geometry: "cube", material: "label", position: [-0.66, -0.36, -0.38], scale: [0.028, 0.012, 0.012] },
    { id: "left-control-status-dot-2", geometry: "cube", material: "label", position: [-0.66, -0.29, -0.38], scale: [0.028, 0.012, 0.012] },
    { id: "left-control-status-dot-3", geometry: "cube", material: "label", position: [-0.66, -0.22, -0.38], scale: [0.028, 0.012, 0.012] },
    { id: "right-control-status-dot-1", geometry: "cube", material: "label", position: [0.66, -0.36, -0.38], scale: [0.028, 0.012, 0.012] },
    { id: "right-control-status-dot-2", geometry: "cube", material: "label", position: [0.66, -0.29, -0.38], scale: [0.028, 0.012, 0.012] },
    { id: "right-control-status-dot-3", geometry: "cube", material: "label", position: [0.66, -0.22, -0.38], scale: [0.028, 0.012, 0.012] },
    { id: "brand-plate", geometry: "cube", material: "label", position: [0, 0.34, -0.36], scale: [0.3, 0.035, 0.025] },
    { id: "brand-plate-letterbar-1", geometry: "cube", material: "dark", position: [-0.09, 0.34, -0.395], scale: [0.018, 0.026, 0.01] },
    { id: "brand-plate-letterbar-2", geometry: "cube", material: "dark", position: [-0.02, 0.34, -0.395], scale: [0.018, 0.026, 0.01] },
    { id: "brand-plate-letterbar-3", geometry: "cube", material: "dark", position: [0.05, 0.34, -0.395], scale: [0.018, 0.026, 0.01] },
    { id: "brand-plate-letterbar-4", geometry: "cube", material: "dark", position: [0.12, 0.34, -0.395], scale: [0.018, 0.026, 0.01] },
    { id: "left-highlight", geometry: "cube", material: "trim", position: [-0.59, -0.15, -0.36], scale: [0.035, 0.24, 0.018] },
    { id: "right-highlight", geometry: "cube", material: "trim", position: [0.59, -0.15, -0.36], scale: [0.035, 0.24, 0.018] },
    { id: "softbox-reflection", geometry: "cube", material: "glass", position: [0.2, 0.08, -0.42], scale: [0.42, 0.045, 0.018], rotation: [0, 0, 0.08] },
  ],
  assetPipeline: {
    source: "shared-product-visual-descriptor",
    sourceFiles: [
      "tools/external-parity-product-visual-parity/productScene.ts",
      "tools/external-parity-product-visual-parity/index.ts",
      "tools/external-parity-external-engine-baselines/index.ts",
    ],
    generatedDescriptorPath: "fixtures/external-engine-baselines/external-parity/product-visual-parity-scene.json",
    localEngines: ["aura3d", "threejs", "babylon"],
    externalEngines: ["unity", "unreal"],
    sameDescriptorForAllEngines: true,
    deterministicAssetLayout: true,
    productionWorkflowEvidence: [
      "material-variant-descriptor",
      "turntable-hotspots",
      "multi-view-capture-plan",
      "batch-output-plan",
      "ar-export-boundary",
    ],
    commercialImportedAssetClaimed: false,
  },
  minimumEvidence: {
    productParts: 18,
    materialCount: 7,
    drawCalls: 18,
    turntableHotspots: 3,
    captureViews: 4,
    batchTasks: 4,
  },
  ecommerceWorkflow: {
    source: "origin-master-ecommerce-turntable-adapted",
    sourceFiles: [
      "master:src/ecommerce/turntable/TurntableController.ts",
      "master:src/ecommerce/turntable/HotspotManager.ts",
      "master:src/ecommerce/turntable/LightingPresetManager.ts",
      "master:src/ecommerce/turntable/CaptureManager.ts",
      "master:src/ecommerce/turntable/BatchProcessor.ts",
      "master:src/ecommerce/turntable/ARExporter.ts",
    ],
    autoRotate: true,
    pauseOnInteraction: true,
    lightingPresets: ["studio", "soft", "inspection", "dramatic", "neutral"],
    hotspots: [
      { id: "material-finish", group: "material", targetPart: "left-cup-shell" },
      { id: "comfort-band", group: "comfort", targetPart: "headband-inner-pad" },
      { id: "control-module", group: "controls", targetPart: "right-control-chip" },
    ],
    capture: {
      screenshotViews: ["hero", "front", "detail", "exploded"],
      screenshotFormats: ["png", "jpeg", "webp"],
      spinFrameCount: 72,
      batchTasks: ["thumbnail", "screenshot", "360-spin", "ar-export"],
      arExportFormats: ["glb"],
      blockedExportClaims: [
        "native-USDZ-export",
        "browser-video-recording-pipeline",
        "AR-Quick-Look-and-Scene-Viewer-platform-parity",
        "ecommerce-PIM-or-commerce-platform-integration",
      ],
    },
  },
  claimBoundary: "This descriptor defines the deterministic same-layout over-ear headphone product asset pipeline and bounded ecommerce workflow evidence for Aura3D, Three.js, Babylon.js, and future Unity/Unreal baseline renders. It is not a commercial imported product asset, native AR export pipeline, video capture pipeline, or PIM integration.",
};
