/* Moved verbatim from packages/three-compat/src/migration (PRD-15 T6.2); emitted import targets updated from the deleted @aura3d/three-compat package to @aura3d/engine. */
/**
 * Specifier-level rewrite table for the simple `migrateThreeToA3D` adapter.
 *
 * Only specifiers whose named exports exist verbatim on the target module
 * belong here: a specifier rewrite must never produce `import { X } from
 * "@aura3d/engine"` for an X the engine does not export (WS-3.4). The
 * line-oriented codemod (emit.ts) owns the richer construct-level rewrites;
 * specifiers it handles are in THREE_COMPAT_CODEMOD_IMPORTS below.
 */
export const THREE_COMPAT_THREE_IMPORT_MAP: Readonly<Record<string, string>> = {
  three: "@aura3d/engine",
  // SC-02: every controls class three/addons ships exists as a named export
  // of @aura3d/engine/controls.
  "three/addons/controls/OrbitControls.js": "@aura3d/engine/controls",
  "three/examples/jsm/controls/OrbitControls.js": "@aura3d/engine/controls",
  "three/addons/controls/MapControls.js": "@aura3d/engine/controls",
  "three/examples/jsm/controls/MapControls.js": "@aura3d/engine/controls",
  "three/addons/controls/TrackballControls.js": "@aura3d/engine/controls",
  "three/examples/jsm/controls/TrackballControls.js": "@aura3d/engine/controls",
  "three/addons/controls/ArcballControls.js": "@aura3d/engine/controls",
  "three/examples/jsm/controls/ArcballControls.js": "@aura3d/engine/controls",
  "three/addons/controls/FlyControls.js": "@aura3d/engine/controls",
  "three/examples/jsm/controls/FlyControls.js": "@aura3d/engine/controls",
  "three/addons/controls/FirstPersonControls.js": "@aura3d/engine/controls",
  "three/examples/jsm/controls/FirstPersonControls.js": "@aura3d/engine/controls",
  "three/addons/controls/PointerLockControls.js": "@aura3d/engine/controls",
  "three/examples/jsm/controls/PointerLockControls.js": "@aura3d/engine/controls",
  "three/addons/controls/DragControls.js": "@aura3d/engine/controls",
  "three/examples/jsm/controls/DragControls.js": "@aura3d/engine/controls",
  "three/addons/controls/TransformControls.js": "@aura3d/engine/controls",
  "three/examples/jsm/controls/TransformControls.js": "@aura3d/engine/controls",
  "three/addons/loaders/GLTFLoader.js": "@aura3d/engine",
  "three/examples/jsm/loaders/GLTFLoader.js": "@aura3d/engine"
};

/**
 * Specifiers the codemod (emit.ts) covers — the specifier-rewriter leaves
 * them untouched because the migration happens at the CONSTRUCT site (the
 * import gets an `a3d:` guidance comment, not a broken named import). The
 * values name the honest target so warnings can point at it.
 *
 * These were unblocked when the real GPU paths landed:
 * - UnrealBloomPass → effects.bloom (v2 post graph, AD-01)
 * - ShaderPass      → app.addPostPass({ fragment: { glsl } }) (real GPU path)
 *
 * EffectComposer/RenderPass stay "codemod" — there is no composer object to
 * import; the codemod drops the specifier and comments the guidance.
 */
export const THREE_COMPAT_CODEMOD_IMPORTS: Readonly<Record<string, string>> = {
  "three/addons/webxr/VRButton.js": "xr.button({ app, mode: \"immersive-vr\" }) (pending render path, SC-04)",
  "three/examples/jsm/webxr/VRButton.js": "xr.button({ app, mode: \"immersive-vr\" }) (pending render path, SC-04)",
  "three/addons/webxr/ARButton.js": "xr.button({ app, mode: \"immersive-ar\" }) (pending render path, SC-04)",
  "three/examples/jsm/webxr/ARButton.js": "xr.button({ app, mode: \"immersive-ar\" }) (pending render path, SC-04)",
  "three/addons/postprocessing/EffectComposer.js": "effects.* nodes / app.addPostPass",
  "three/examples/jsm/postprocessing/EffectComposer.js": "effects.* nodes / app.addPostPass",
  "three/addons/postprocessing/RenderPass.js": "implicit base render pass (createAuraApp scene+camera)",
  "three/examples/jsm/postprocessing/RenderPass.js": "implicit base render pass (createAuraApp scene+camera)",
  "three/addons/postprocessing/UnrealBloomPass.js": "effects.bloom()",
  "three/examples/jsm/postprocessing/UnrealBloomPass.js": "effects.bloom()",
  "three/addons/postprocessing/ShaderPass.js": "app.addPostPass({ fragment: { glsl } })",
  "three/examples/jsm/postprocessing/ShaderPass.js": "app.addPostPass({ fragment: { glsl } })",
  "three/addons/postprocessing/SMAAPass.js": "effects.antiAlias({}) (fxaa — no smaa mode)",
  "three/examples/jsm/postprocessing/SMAAPass.js": "effects.antiAlias({}) (fxaa — no smaa mode)",
  "three/addons/postprocessing/BokehPass.js": "effects.depthOfField()",
  "three/examples/jsm/postprocessing/BokehPass.js": "effects.depthOfField()",
  "three/addons/postprocessing/OutputPass.js": "createAuraApp({ output }) / app.setOutput",
  "three/examples/jsm/postprocessing/OutputPass.js": "createAuraApp({ output }) / app.setOutput",
  "three/addons/loaders/RGBELoader.js": "environments.hdri({ texture: assets.<key> })",
  "three/examples/jsm/loaders/RGBELoader.js": "environments.hdri({ texture: assets.<key> })",
  "three/addons/environments/RoomEnvironment.js": "environments.neutral()",
  "three/examples/jsm/environments/RoomEnvironment.js": "environments.neutral()",
  "three/addons/csm/CSM.js": "lights.directional({ shadow: { cascades } })",
  "three/examples/jsm/csm/CSM.js": "lights.directional({ shadow: { cascades } })"
};

/**
 * Specifiers that are deliberately excluded by the parity contract. The
 * codemod reports them as `none` rows and drops `a3d:` comments; the
 * specifier-rewriter leaves them so the build fails loudly at the import.
 *
 * AD-04: no FBX/MMD/PLY/STL/USDZ/3MF/VOX/Collada/3DS/AMF/IFC decode ships —
 * convert to GLB offline (`aura3d assets add`).
 * AD-05: no exporters — baking is an offline concern.
 */
export const THREE_COMPAT_EXCLUDED_THREE_IMPORTS: Readonly<Record<string, string>> = {
  // ── AD-04 loader exclusions ────────────────────────────────────────────
  "three/addons/loaders/FBXLoader.js": "excluded (AD-04): convert FBX to GLB offline",
  "three/examples/jsm/loaders/FBXLoader.js": "excluded (AD-04): convert FBX to GLB offline",
  "three/addons/loaders/MMDLoader.js": "excluded (AD-04): convert MMD to GLB offline",
  "three/examples/jsm/loaders/MMDLoader.js": "excluded (AD-04): convert MMD to GLB offline",
  "three/addons/loaders/PLYLoader.js": "excluded (AD-04): convert PLY to GLB offline",
  "three/examples/jsm/loaders/PLYLoader.js": "excluded (AD-04): convert PLY to GLB offline",
  "three/addons/loaders/STLLoader.js": "excluded (AD-04): convert STL to GLB offline",
  "three/examples/jsm/loaders/STLLoader.js": "excluded (AD-04): convert STL to GLB offline",
  "three/addons/loaders/USDZLoader.js": "excluded (AD-04): convert USDZ to GLB offline",
  "three/examples/jsm/loaders/USDZLoader.js": "excluded (AD-04): convert USDZ to GLB offline",
  "three/addons/loaders/3MFLoader.js": "excluded (AD-04): convert 3MF to GLB offline",
  "three/examples/jsm/loaders/3MFLoader.js": "excluded (AD-04): convert 3MF to GLB offline",
  "three/addons/loaders/VOXLoader.js": "excluded (AD-04): convert VOX to GLB offline",
  "three/examples/jsm/loaders/VOXLoader.js": "excluded (AD-04): convert VOX to GLB offline",
  "three/addons/loaders/ColladaLoader.js": "excluded (AD-04): convert Collada to GLB offline",
  "three/examples/jsm/loaders/ColladaLoader.js": "excluded (AD-04): convert Collada to GLB offline",
  "three/addons/loaders/TDSLoader.js": "excluded (AD-04): convert 3DS to GLB offline",
  "three/examples/jsm/loaders/TDSLoader.js": "excluded (AD-04): convert 3DS to GLB offline",
  "three/addons/loaders/AMFLoader.js": "excluded (AD-04): convert AMF to GLB offline",
  "three/examples/jsm/loaders/AMFLoader.js": "excluded (AD-04): convert AMF to GLB offline",
  // ── AD-05 exporter exclusions ──────────────────────────────────────────
  "three/addons/exporters/GLTFExporter.js": "excluded (AD-05): bake offline with gltf-transform/three",
  "three/examples/jsm/exporters/GLTFExporter.js": "excluded (AD-05): bake offline with gltf-transform/three",
  "three/addons/exporters/OBJExporter.js": "excluded (AD-05): bake offline",
  "three/examples/jsm/exporters/OBJExporter.js": "excluded (AD-05): bake offline",
  "three/addons/exporters/PLYExporter.js": "excluded (AD-05): bake offline",
  "three/examples/jsm/exporters/PLYExporter.js": "excluded (AD-05): bake offline",
  "three/addons/exporters/STLExporter.js": "excluded (AD-05): bake offline",
  "three/examples/jsm/exporters/STLExporter.js": "excluded (AD-05): bake offline",
  "three/addons/exporters/USDZExporter.js": "excluded (AD-05): bake offline",
  "three/examples/jsm/exporters/USDZExporter.js": "excluded (AD-05): bake offline",
  "three/addons/exporters/DRACOExporter.js": "excluded (AD-05): bake offline",
  "three/examples/jsm/exporters/DRACOExporter.js": "excluded (AD-05): bake offline",
  "three/addons/exporters/ColladaExporter.js": "excluded (AD-05): bake offline",
  "three/examples/jsm/exporters/ColladaExporter.js": "excluded (AD-05): bake offline"
};

/**
 * Three.js import specifiers this package deliberately does NOT rewrite and
 * for which no mapping exists yet — kept for backwards compatibility of
 * callers that only understand "unsupported". Post-processing specifiers
 * moved into THREE_COMPAT_CODEMOD_IMPORTS when the real GPU paths landed
 * (AD-01 bloom/DOF/AA/output, app.addPostPass for ShaderPass).
 */
export const THREE_COMPAT_UNSUPPORTED_THREE_IMPORTS: readonly string[] = [
  ...Object.keys(THREE_COMPAT_CODEMOD_IMPORTS),
  ...Object.keys(THREE_COMPAT_EXCLUDED_THREE_IMPORTS)
];
