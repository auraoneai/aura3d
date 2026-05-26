export interface V5CompatibilityWarning {
  readonly code: string;
  readonly message: string;
}

export function createV5CompatibilityWarnings(source: string): readonly V5CompatibilityWarning[] {
  return [
    ...(/WebGLRenderer/.test(source) ? [{ code: "renderer-adapter", message: "WebGLRenderer setup is mapped to RendererV5/createRendererV5." }] : []),
    ...(/OrbitControls/.test(source) ? [{ code: "controls-adapter", message: "OrbitControls import is mapped to A3D controls." }] : []),
    ...(/GLTFLoader/.test(source) ? [{ code: "loader-adapter", message: "GLTFLoader import is mapped to V5 loader diagnostics." }] : [])
  ];
}
