import { THREE_COMPAT_UNSUPPORTED_THREE_IMPORTS } from "./ImportMap";

export interface ThreeCompatCompatibilityWarning {
  readonly code: string;
  readonly message: string;
}

export function createThreeCompatCompatibilityWarnings(source: string): readonly ThreeCompatCompatibilityWarning[] {
  return [
    ...(/WebGLRenderer/.test(source) ? [{ code: "renderer-adapter", message: "WebGLRenderer setup is mapped to ThreeCompatRenderer/createThreeCompatRenderer." }] : []),
    ...(/OrbitControls/.test(source) ? [{ code: "controls-adapter", message: "OrbitControls import is mapped to A3D controls." }] : []),
    ...(/GLTFLoader/.test(source) ? [{ code: "loader-adapter", message: "GLTFLoader import is mapped to ThreeCompat loader diagnostics." }] : []),
    ...createUnsupportedPostprocessWarnings(source)
  ];
}

function createUnsupportedPostprocessWarnings(source: string): readonly ThreeCompatCompatibilityWarning[] {
  const matched = THREE_COMPAT_UNSUPPORTED_THREE_IMPORTS.filter((specifier) => source.includes(specifier));
  if (matched.length === 0) return [];
  return [{
    code: "postprocessing-unsupported",
    message: `Three.js postprocessing imports are not migrated and were left unchanged: ${matched.join(", ")}. `
      + "Aura3D has no GPU render-target composer equivalent yet; the available production passes operate on CPU pixel buffers "
      + "and would silently change behaviour. Use @aura3d/engine effects.bloom() for emissive bloom, or keep the Three.js "
      + "postprocessing stack until an Aura3D composer ships."
  }];
}
