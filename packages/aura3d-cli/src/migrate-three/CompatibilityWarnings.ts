import { THREE_COMPAT_CODEMOD_IMPORTS, THREE_COMPAT_EXCLUDED_THREE_IMPORTS } from "./ImportMap";
import { createR3fMigrationWarnings } from "./R3fMigration";

export interface ThreeCompatCompatibilityWarning {
  readonly code: string;
  readonly message: string;
}

export function createThreeCompatCompatibilityWarnings(source: string): readonly ThreeCompatCompatibilityWarning[] {
  return [
    ...(/WebGLRenderer|WebGPURenderer/.test(source) ? [{ code: "renderer-adapter", message: "WebGLRenderer/WebGPURenderer setup maps to createAuraApp (WebGL2 today; WebGPU is flagged, see renderer-warning)." }] : []),
    ...(/OrbitControls|MapControls|TrackballControls|ArcballControls|FlyControls|FirstPersonControls|PointerLockControls|DragControls|TransformControls/.test(source)
      ? [{ code: "controls-adapter", message: "controls classes exist as named exports of @aura3d/engine/controls; they drive an Aura camera-like, not a three renderer." }]
      : []),
    ...(/GLTFLoader/.test(source) ? [{ code: "loader-adapter", message: "loader.load(url) becomes model(assets.<typedKey>) — register the GLB via `aura3d assets add`." }] : []),
    ...createCodemodPostprocessWarnings(source),
    ...createExcludedImportWarnings(source),
    ...createWebgpuOnlyWarnings(source),
    ...createR3fMigrationWarnings(source)
  ];
}

/**
 * Post-processing specifiers the codemod covers via a real GPU path (AD-01
 * effects.* nodes, app.addPostPass). The specifier-rewriter leaves them so
 * the import line isn't turned into a broken named import; the warning
 * points at the honest target.
 */
function createCodemodPostprocessWarnings(source: string): readonly ThreeCompatCompatibilityWarning[] {
  const matched = Object.entries(THREE_COMPAT_CODEMOD_IMPORTS).filter(([specifier]) => source.includes(specifier));
  if (matched.length === 0) return [];
  return [{
    code: "postprocessing-codemod",
    message: "three postprocessing imports are construct-mapped by `aura3d migrate three`, not specifier-rewritten: "
      + matched.map(([spec, target]) => `${spec} → ${target}`).join("; ")
      + ". Run the codemod; the emitted code drops these imports and emits the equivalent effects.* / app.addPostPass calls."
  }];
}

/** AD-04 loaders and AD-05 exporters: excluded by contract, never aliased. */
function createExcludedImportWarnings(source: string): readonly ThreeCompatCompatibilityWarning[] {
  const matched = Object.entries(THREE_COMPAT_EXCLUDED_THREE_IMPORTS).filter(([specifier]) => source.includes(specifier));
  if (matched.length === 0) return [];
  return [{
    code: "excluded-import",
    message: "these three imports are excluded by the parity contract and are never migrated: "
      + matched.map(([spec, note]) => `${spec} (${note})`).join("; ")
  }];
}

/** WebGPU-only surfaces — flagged, not on the live WebGL2 path. */
function createWebgpuOnlyWarnings(source: string): readonly ThreeCompatCompatibilityWarning[] {
  const warnings: ThreeCompatCompatibilityWarning[] = [];
  if (/\bthree\/webgpu\b|WebGPURenderer|NodeMaterial/.test(source)) {
    warnings.push({
      code: "webgpu-flagged",
      message: "createAuraApp mounts WebGL2 on the live path; a WebGPU backend needs Renderer.create({ backend: \"webgpu\" }) behind A3D_QR_WEBGPU. NodeMaterial/TSL constructs are pending (SH-01) — rewrite them as material.custom GLSL when it lands (lane L1)."
    });
  }
  // SH-04: GPU computation / compute shaders wait on the WebGPU backend.
  if (/GPUComputationRenderer|computeShader|\.compute\(/.test(source)) {
    warnings.push({
      code: "compute-webgpu-only",
      message: "SH-04: GPU compute (GPUComputationRenderer-style) is WebGPU-only and pending — no public compute.* on the WebGL2 path (AD-11 exclusion)."
    });
  }
  // WGSL sources only run on the WebGPU backend; the live path needs GLSL.
  if (/\bwgsl\b|@module\s+wgsl|three\/tsl/.test(source)) {
    warnings.push({
      code: "wgsl-webgpu-only",
      message: "WGSL shaders only execute on the flagged WebGPU backend; the live WebGL2 path requires GLSL — material.custom / app.addPostPass take { glsl } with an optional WGSL sibling."
    });
  }
  return warnings;
}
