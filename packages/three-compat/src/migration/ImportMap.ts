export const THREE_COMPAT_THREE_IMPORT_MAP: Readonly<Record<string, string>> = {
  three: "@aura3d/three-compat",
  "three/addons/controls/OrbitControls.js": "@aura3d/three-compat/controls",
  "three/examples/jsm/controls/OrbitControls.js": "@aura3d/three-compat/controls",
  "three/addons/loaders/GLTFLoader.js": "@aura3d/three-compat/loaders",
  "three/examples/jsm/loaders/GLTFLoader.js": "@aura3d/three-compat/loaders"
};

/**
 * Three.js import specifiers this package deliberately does NOT rewrite.
 *
 * WS-3.4 deleted the threejs-compatibility postprocess tree because its passes
 * reported success without touching a GPU. The remaining production passes
 * (packages/rendering/src/production-runtime/postprocess) operate on CPU
 * Uint8Array pixel buffers, not on GPU render targets, so they are not a
 * behavioural substitute for Three.js EffectComposer. Aliasing the subpath to
 * them would convert working Three.js code into non-working Aura3D code and
 * report success — the exact failure WS-3.4 removed.
 *
 * Per R7, a migration surface must not preserve broken semantics to claim
 * coverage. These specifiers are reported as unsupported and left untouched so
 * the developer sees a real compile error at the import site rather than a
 * silent behavioural regression at runtime.
 */
export const THREE_COMPAT_UNSUPPORTED_THREE_IMPORTS: readonly string[] = [
  "three/addons/postprocessing/EffectComposer.js",
  "three/examples/jsm/postprocessing/EffectComposer.js",
  "three/addons/postprocessing/RenderPass.js",
  "three/examples/jsm/postprocessing/RenderPass.js",
  "three/addons/postprocessing/UnrealBloomPass.js",
  "three/examples/jsm/postprocessing/UnrealBloomPass.js",
  "three/addons/postprocessing/ShaderPass.js",
  "three/examples/jsm/postprocessing/ShaderPass.js"
];
