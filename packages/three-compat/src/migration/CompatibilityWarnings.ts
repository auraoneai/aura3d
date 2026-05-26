export interface ThreeCompatCompatibilityWarning {
  readonly code: string;
  readonly message: string;
}

export function createThreeCompatCompatibilityWarnings(source: string): readonly ThreeCompatCompatibilityWarning[] {
  return [
    ...(/WebGLRenderer/.test(source) ? [{ code: "renderer-adapter", message: "WebGLRenderer setup is mapped to ThreeCompatRenderer/createThreeCompatRenderer." }] : []),
    ...(/OrbitControls/.test(source) ? [{ code: "controls-adapter", message: "OrbitControls import is mapped to A3D controls." }] : []),
    ...(/GLTFLoader/.test(source) ? [{ code: "loader-adapter", message: "GLTFLoader import is mapped to ThreeCompat loader diagnostics." }] : [])
  ];
}
