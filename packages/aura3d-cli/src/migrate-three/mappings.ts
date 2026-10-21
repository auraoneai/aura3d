/**
 * PRD-15 T6.1 — the Three.js → @aura3d/engine mapping table.
 *
 * Each entry covers one construct the migrator rewrites. "exact" means the
 * target factory is a drop-in; "approximate" means semantics survive but
 * options or framing differ; "none" rows are reported with a TODO comment
 * and no rewrite.
 *
 * threejs-parity (docs/workflows/threejs-parity-gaps.md, lane L10):
 * "pending" rows name a real landing target that is reserved or frozen but
 * not yet public — the construct is left in place with a
 * `// TODO(a3d-migrate): parityPending …` comment naming the planned API and
 * owning lane. A row graduates from "pending" to "approximate|exact" only
 * when the target is exported and backed by a real GPU path (WS-3.4).
 */

export interface ThreeMapping {
  /** Construct key as produced by parse (e.g. "BoxGeometry", "GLTFLoader.load"). */
  readonly construct: string;
  /** Aura3D factory/class the construct maps to ("" for none). */
  readonly target: string;
  /** Engine namespace member the emitted code imports (for the rewritten import line). */
  readonly engineImport?: string;
  /**
   * Module the `engineImport` resolves from. Defaults to `@aura3d/engine`;
   * subpaths such as `@aura3d/engine/controls` or `@aura3d/engine/math` are
   * emitted as additional import statements.
   */
  readonly engineImportFrom?: string;
  /**
   * Emission style:
   * - `"call"` (default): emit `${target}()` (or the EMIT_ARGS form when the
   *   args map honestly).
   * - `"new"`: emit `new ${target}(...)` — the target is a class.
   * - `"comment"`: emit a TODO comment only; the target is configuration or a
   *   surface member, not a call site.
   */
  readonly emit?: "call" | "new" | "comment";
  readonly mapping: "exact" | "approximate" | "none" | "pending";
  readonly note: string;
}

const controlsSubpath = "@aura3d/engine/controls";
const mathSubpath = "@aura3d/engine/math";
const assetsSubpath = "@aura3d/engine/assets";
const audioSubpath = "@aura3d/engine/audio";

export const THREE_TO_A3D_MAPPINGS: readonly ThreeMapping[] = [
  // ── Core scene/renderer ──────────────────────────────────────────────
  { construct: "Scene", target: "scene", engineImport: "scene", mapping: "approximate", note: "THREE.Scene graph root maps to scene({ nodes }); node add/remove calls migrate to nodes[] entries." },
  { construct: "PerspectiveCamera", target: "camera.perspective", engineImport: "camera", mapping: "approximate", note: "fov/near/far map 1:1; the aspect arg derives from the viewport; position/target move into camera spec options instead of set/lookAt calls." },
  { construct: "OrthographicCamera", target: "camera.orthographic", engineImport: "camera", mapping: "approximate", note: "left/right/top/bottom collapse to orthographicSize = (top - bottom) / 2; near/far map 1:1." },
  { construct: "Mesh", target: "primitives", engineImport: "primitives", note: "Mesh is not a standalone object: emit the matching primitives.* or model() node and carry material over.", mapping: "approximate" },
  { construct: "Group", target: "group", engineImport: "group", mapping: "approximate", note: "THREE.Group maps to a group node; children move into the group's nodes[] list." },
  { construct: "Object3D", target: "group", engineImport: "group", mapping: "approximate", note: "A bare Object3D is a transform parent — the Aura3D equivalent is a group node." },
  { construct: "SkinnedMesh", target: "model", emit: "comment", engineImport: "model", mapping: "approximate", note: "Skinned meshes arrive as GLB assets: model(assets.<typedKey>) plus AnimationController for clips; no constructor port." },
  { construct: "Bone", target: "model", emit: "comment", mapping: "pending", note: "Bones ride inside the GLB skeleton; cloneSkinned (characters.clone) lands with lane L8 (SA-04)." },
  { construct: "Skeleton", target: "model", emit: "comment", mapping: "pending", note: "Skeletons ride inside the GLB asset; cloneSkinned (characters.clone) lands with lane L8 (SA-04)." },
  { construct: "LOD", target: "distanceLod", engineImport: "distanceLod", mapping: "approximate", note: "THREE.LOD levels map to distanceLod / groups lod levels; arbitrary-group LOD children are an L7 refinement (SG-11)." },
  { construct: "WebGLRenderer", target: "createAuraApp", engineImport: "createAuraApp", mapping: "approximate", note: "WebGLRenderer + render loop maps to createAuraApp({ scene }) lifecycle; setSize/animation loops fold into the app spec." },
  { construct: "WebGPURenderer", target: "createAuraApp", engineImport: "createAuraApp", mapping: "approximate", note: "WebGPURenderer maps to createAuraApp too — apps mount WebGL2 today; a WebGPU-only pipeline needs Renderer.create({ backend: \"webgpu\" }) (@aura3d/engine/renderer). NodeMaterial/TSL constructs are pending (SH-01)." },

  // ── Geometry ─────────────────────────────────────────────────────────
  { construct: "BoxGeometry", target: "primitives.box", engineImport: "primitives", mapping: "approximate", note: "width/height/depth args map to primitives.box({ size: [w, h, d] }); segment counts map to params." },
  { construct: "SphereGeometry", target: "primitives.sphere", engineImport: "primitives", mapping: "approximate", note: "Aura spheres are unit diameter 1 — radius maps to size: r * 2; segment counts map to params." },
  { construct: "CylinderGeometry", target: "primitives.cylinder", engineImport: "primitives", mapping: "approximate", note: "Aura cylinders are unit (radius .5, height 1): radiusBottom maps to size 2*rB and radiusTop becomes params.radiusTop = rT / (2*rB)." },
  { construct: "PlaneGeometry", target: "primitives.plane", engineImport: "primitives", mapping: "approximate", note: "three's PlaneGeometry faces +Z (XY); Aura's plane lies in XZ — rotate the node -90° about X for an XY wall." },
  { construct: "TorusGeometry", target: "primitives.torus", engineImport: "primitives", mapping: "approximate", note: "Aura torus is unit ring radius 0.43/tube 0.045 — size = R / 0.43 and params.tube = t / (R / 0.43)." },
  { construct: "CapsuleGeometry", target: "primitives.capsule", engineImport: "primitives", mapping: "approximate", note: "Aura capsules are unit: radius maps to size 2*r on x/z and size (length + 2*r) on y (three's length = mid-section)." },
  { construct: "BufferGeometry", target: "geometry.dynamic", emit: "comment", engineImport: "geometry", mapping: "pending", note: "geometry.dynamic(spec) with typed-array attributes lands with lane L2 (SG-05); today only number-array custom geometry is public." },
  { construct: "ConeGeometry", target: "primitives.cone", emit: "comment", engineImport: "primitives", mapping: "pending", note: "primitives.cone lands with lane L2 (SG-03) under A3D_PARITY_GEOMETRY; the kind exists in the frozen union." },
  { construct: "CircleGeometry", target: "primitives.circle", emit: "comment", engineImport: "primitives", mapping: "pending", note: "primitives.circle lands with lane L2 (SG-03)." },
  { construct: "RingGeometry", target: "primitives.ring", emit: "comment", engineImport: "primitives", mapping: "pending", note: "primitives.ring lands with lane L2 (SG-03)." },
  { construct: "TubeGeometry", target: "primitives.tube", emit: "comment", engineImport: "primitives", mapping: "pending", note: "primitives.tube consumes the frozen Curve interface (M/Curves.ts); lands with lane L2 (SG-03) once L3 curves merge." },
  { construct: "LatheGeometry", target: "primitives.lathe", emit: "comment", engineImport: "primitives", mapping: "pending", note: "primitives.lathe lands with lane L2 (SG-03)." },
  { construct: "ExtrudeGeometry", target: "primitives.extrude", emit: "comment", engineImport: "primitives", mapping: "pending", note: "primitives.extrude (depth/steps/bevel*/extrudePath) lands with lane L2 (SG-03); needs the frozen Shape/Path interface." },
  { construct: "ShapeGeometry", target: "primitives.shape", emit: "comment", engineImport: "primitives", mapping: "pending", note: "primitives.shape lands with lane L2 (SG-03) once L3's Shape/ShapeUtils merge." },
  { construct: "TorusKnotGeometry", target: "primitives.torusKnot", emit: "comment", engineImport: "primitives", mapping: "pending", note: "primitives.torusKnot lands with lane L2 (SG-03)." },
  { construct: "PolyhedronGeometry", target: "primitives.polyhedron", emit: "comment", engineImport: "primitives", mapping: "pending", note: "primitives.polyhedron({ variant }) covers tetra/octa/icosa/dodeca; lands with lane L2 (SG-03)." },
  { construct: "IcosahedronGeometry", target: "primitives.polyhedron", emit: "comment", engineImport: "primitives", mapping: "pending", note: "primitives.polyhedron({ variant: \"icosahedron\", detail }) lands with lane L2 (SG-03)." },
  { construct: "TetrahedronGeometry", target: "primitives.polyhedron", emit: "comment", engineImport: "primitives", mapping: "pending", note: "primitives.polyhedron({ variant: \"tetrahedron\", detail }) lands with lane L2 (SG-03)." },
  { construct: "OctahedronGeometry", target: "primitives.polyhedron", emit: "comment", engineImport: "primitives", mapping: "pending", note: "primitives.polyhedron({ variant: \"octahedron\", detail }) lands with lane L2 (SG-03)." },
  { construct: "DodecahedronGeometry", target: "primitives.polyhedron", emit: "comment", engineImport: "primitives", mapping: "pending", note: "primitives.polyhedron({ variant: \"dodecahedron\", detail }) lands with lane L2 (SG-03)." },
  { construct: "RoundedBoxGeometry", target: "primitives.roundedBox", emit: "comment", engineImport: "primitives", mapping: "pending", note: "primitives.roundedBox lands with lane L2 (SG-03/AD-07)." },
  { construct: "EdgesGeometry", target: "geometry.edges", emit: "comment", engineImport: "geometry", mapping: "pending", note: "geometry.edges(src, thresholdAngle) lands with lane L2 (SG-04); emits line-segment topology." },
  { construct: "WireframeGeometry", target: "geometry.wireframe", emit: "comment", engineImport: "geometry", mapping: "pending", note: "geometry.wireframe(src) lands with lane L2 (SG-04)." },
  { construct: "TextGeometry", target: "text3D", emit: "comment", engineImport: "text3D", mapping: "approximate", note: "three's font-extruded TextGeometry maps to the text3D node (SDF text catalog) — the font is an authored catalog, not a parsed typeface." },
  { construct: "FontLoader", target: "text3D", emit: "comment", mapping: "none", note: "no font loader: text3D uses a baked SDF catalog; three typeface.json fonts are not consumed." },
  { construct: "FontLoader.load", target: "text3D", mapping: "none", note: "no font loader: text3D uses a baked SDF catalog." },

  // ── Materials ────────────────────────────────────────────────────────
  { construct: "MeshStandardMaterial", target: "material.pbr", engineImport: "material", mapping: "approximate", note: "color/metalness/roughness map to material.pbr options; envMapIntensity semantics differ." },
  { construct: "MeshPhysicalMaterial", target: "material.physical", engineImport: "material", mapping: "approximate", note: "clearcoat, transmission and sheen survive as material.physical options (engine material-physical layer bounds them)." },
  { construct: "MeshBasicMaterial", target: "material.pbr", engineImport: "material", mapping: "approximate", note: "unlit three materials map to material.pbr({ unlit: true }) on the AuraMaterialSpec." },
  { construct: "MeshLambertMaterial", target: "material.pbr", engineImport: "material", mapping: "approximate", note: "diffuse-only Lambert collapses into material.pbr with high roughness and zero metalness." },
  { construct: "MeshPhongMaterial", target: "material.pbr", engineImport: "material", mapping: "approximate", note: "Phong specular has no direct slot; shininess/specular highlights approximate onto material.pbr({ clearcoat })." },
  { construct: "MeshNormalMaterial", target: "", mapping: "none", note: "no normal-debug material on the public surface; the closest target is material.custom (pending lane L1, SH-02)." },
  { construct: "MeshDepthMaterial", target: "", mapping: "none", note: "no depth-preview material on the public surface; the closest target is material.custom (pending lane L1, SH-02)." },
  { construct: "MeshDistanceMaterial", target: "", mapping: "none", note: "no point-light depth material on the public surface." },
  { construct: "MeshMatcapMaterial", target: "", mapping: "none", note: "no matcap material on the public surface; a matcap can ride material.custom once it lands (pending lane L1, SH-02)." },
  { construct: "MeshToonMaterial", target: "", mapping: "none", note: "no toon-step material on the public surface; toon shading is a material.custom candidate (pending lane L1, SH-02)." },
  { construct: "ShadowMaterial", target: "", mapping: "none", note: "no shadow-only material on the public surface." },
  { construct: "ShaderMaterial", target: "material.custom", emit: "comment", engineImport: "material", mapping: "pending", note: "material.custom({ glsl: { fragment }, wgsl?, uniforms }) is frozen (AuraCustomMaterialSpec) and lands with lane L1 (SH-02); GLSL is required — WebGL2 is the live backend." },
  { construct: "RawShaderMaterial", target: "material.custom", emit: "comment", engineImport: "material", mapping: "pending", note: "material.custom({ glsl, uniforms }) lands with lane L1 (SH-02); raw vs. built-in-uniform binding is part of the spec." },
  { construct: "NodeMaterial", target: "material.custom", emit: "comment", mapping: "pending", note: "TSL node materials wait on the probe-gated TSL subset (SH-01, lane L1-11) or rewrite as material.custom GLSL (SH-02)." },
  { construct: "LineBasicMaterial", target: "lines", emit: "comment", mapping: "pending", note: "line materials fold into lines.line/segments options (color, width); lands with lane L6 (SG-06)." },
  { construct: "LineDashedMaterial", target: "lines.fat", emit: "comment", mapping: "pending", note: "dashed lines map to lines.fat({ dashed, dashSize, gapSize }); lands with lane L6 (SG-06/AD-08)." },
  { construct: "PointsMaterial", target: "points", emit: "comment", mapping: "pending", note: "point size/attenuation/map/alphaTest fold into the points node; lands with lane L6 (SG-07)." },
  { construct: "SpriteMaterial", target: "sprites", emit: "comment", mapping: "pending", note: "sprite map/center/rotation fold into the sprites node; lands with lane L6 (SG-08)." },

  // ── Lights ───────────────────────────────────────────────────────────
  { construct: "DirectionalLight", target: "lights.directional", engineImport: "lights", mapping: "approximate", note: "color/intensity map; position becomes a spec option and shadow becomes a boolean flag." },
  { construct: "PointLight", target: "lights.point", engineImport: "lights", mapping: "approximate", note: "color/intensity/distance map to lights.point options." },
  { construct: "SpotLight", target: "lights.spot", engineImport: "lights", mapping: "approximate", note: "angle/penumbra/decay/distance map to lights.spot options." },
  { construct: "AmbientLight", target: "lights.ambient", engineImport: "lights", mapping: "approximate", note: "color/intensity map to lights.ambient options." },
  { construct: "HemisphereLight", target: "lights.ambient", engineImport: "lights", mapping: "approximate", note: "sky/ground two-tone shading approximates to ambient until the lights.hemisphere contract lands; keep the pair of tints in the TODO comment." },
  { construct: "RectAreaLight", target: "lights.rectArea", emit: "comment", engineImport: "lights", mapping: "pending", note: "RectAreaLight lands with lane L7 (AD-16, P2) over S/RectAreaLight.ts + LTC tables." },
  { construct: "LightProbe", target: "lights.lightProbe", emit: "comment", mapping: "pending", note: "SH9 LightProbe lands with lane L7 (AD-16, P2) from the SH9 irradiance internals." },
  { construct: "AmbientLightProbe", target: "lights.lightProbe", emit: "comment", mapping: "pending", note: "SH9 LightProbe lands with lane L7 (AD-16, P2)." },
  { construct: "HemisphereLightProbe", target: "lights.lightProbe", emit: "comment", mapping: "pending", note: "SH9 LightProbe lands with lane L7 (AD-16, P2)." },
  { construct: "CSM", target: "lights.directional", emit: "comment", engineImport: "lights", mapping: "approximate", note: "three/addons CSM collapses into lights.directional({ shadow: { cascades: 1-4|\"auto\", maxDistance, splitLambda } }) — CascadedShadowMaps is wired in ShadowOrchestration (AD-12)." },

  // ── Loaders and assets ───────────────────────────────────────────────
  { construct: "GLTFLoader", target: "", mapping: "none", note: "loader objects disappear — the load call becomes model(assets.<typedKey>); see the .load row." },
  { construct: "GLTFLoader.load", target: "model", engineImport: "model", mapping: "approximate", note: "loader.load(url) becomes model(assets.<typedKey>) — register the GLB via `aura3d assets add` and reference the generated asset key." },
  { construct: "RGBELoader", target: "", mapping: "none", note: "loader objects disappear — RGBELoader+PMREMGenerator collapses into environments.hdri; see the .load row." },
  { construct: "RGBELoader.load", target: "environments.hdri", engineImport: "environments", mapping: "approximate", note: "RGBELoader + PMREMGenerator collapses into environments.hdri({ texture: assets.<hdrKey> }); register the .hdr via `aura3d assets add`." },
  { construct: "TextureLoader", target: "texture.load", emit: "comment", mapping: "pending", note: "texture.load(url, opts) lands with lane L4 (ST-07) over the native AS/TextureLoader; today the diagnostic stub returns nothing." },
  { construct: "TextureLoader.load", target: "assets", engineImport: "assets", mapping: "approximate", note: "TextureLoader.load(url) maps to a typed aura-assets texture ref (assets.<key>) plus material options." },
  { construct: "CubeTextureLoader", target: "texture.cube", emit: "comment", mapping: "pending", note: "texture.cube(faces) lands with lane L4 (ST-01)." },
  { construct: "CubeTextureLoader.load", target: "texture.cube", mapping: "pending", note: "texture.cube(faces) lands with lane L4 (ST-01)." },
  { construct: "EXRLoader", target: "environments.hdri", emit: "comment", mapping: "pending", note: "EXR decode lands with lane L4 (AD-03); today R/EnvironmentPlatform rejects .exr." },
  { construct: "EXRLoader.load", target: "environments.hdri", mapping: "pending", note: "EXR decode lands with lane L4 (AD-03); HDR already works via environments.hdri." },
  { construct: "AudioLoader", target: "AudioLoader", emit: "comment", engineImport: "AudioLoader", engineImportFrom: assetsSubpath, mapping: "approximate", note: "@aura3d/engine/assets exports AudioLoader — it is an AssetManager loader whose ctor requires an AudioDecodeContext, not a standalone .load(url, onLoad); decode to AudioBuffer then wrap in AudioClip." },
  { construct: "AudioLoader.load", target: "assets", engineImport: "assets", mapping: "approximate", note: "audio decodes via AudioLoader over AssetManager (typed assets.<key>) or fetch + AudioContext.decodeAudioData into AudioClip (AU-04)." },
  { construct: "FileLoader", target: "FileLoader", emit: "comment", mapping: "pending", note: "FileLoader lands with lane L4 (ST-04, P2)." },
  { construct: "FileLoader.load", target: "FileLoader", mapping: "pending", note: "FileLoader lands with lane L4 (ST-04, P2)." },
  { construct: "ImageBitmapLoader", target: "ImageBitmapLoader", emit: "comment", mapping: "pending", note: "ImageBitmapLoader lands with lane L4 (ST-04, P2)." },
  { construct: "ImageBitmapLoader.load", target: "ImageBitmapLoader", mapping: "pending", note: "ImageBitmapLoader lands with lane L4 (ST-04, P2)." },
  { construct: "DataTextureLoader", target: "DataTextureLoader", emit: "comment", mapping: "pending", note: "DataTextureLoader lands with lane L4 (ST-04, P2)." },
  { construct: "DataTextureLoader.load", target: "DataTextureLoader", mapping: "pending", note: "DataTextureLoader lands with lane L4 (ST-04, P2)." },
  { construct: "LoadingManager", target: "createAuraApp", emit: "comment", mapping: "pending", note: "createAuraApp({ onAssetProgress, onAssetError }) over AssetManager lands with lane L4 (ST-06, P2)." },
  // AD-04 deliberate exclusions: convert offline to GLB (`aura3d assets add`).
  { construct: "FBXLoader", target: "", mapping: "none", note: "excluded (AD-04): convert FBX to GLB offline; no FBX decode ships." },
  { construct: "FBXLoader.load", target: "", mapping: "none", note: "excluded (AD-04): convert FBX to GLB offline." },
  { construct: "MMDLoader", target: "", mapping: "none", note: "excluded (AD-04): convert MMD assets to GLB offline." },
  { construct: "MMDLoader.load", target: "", mapping: "none", note: "excluded (AD-04): convert MMD assets to GLB offline." },
  { construct: "PLYLoader", target: "", mapping: "none", note: "excluded (AD-04): convert PLY to GLB offline." },
  { construct: "PLYLoader.load", target: "", mapping: "none", note: "excluded (AD-04): convert PLY to GLB offline." },
  { construct: "STLLoader", target: "", mapping: "none", note: "excluded (AD-04): convert STL to GLB offline." },
  { construct: "STLLoader.load", target: "", mapping: "none", note: "excluded (AD-04): convert STL to GLB offline." },
  { construct: "USDZLoader", target: "", mapping: "none", note: "excluded (AD-04): convert USDZ to GLB offline." },
  { construct: "USDZLoader.load", target: "", mapping: "none", note: "excluded (AD-04): convert USDZ to GLB offline." },
  { construct: "ThreeMFLoader", target: "", mapping: "none", note: "excluded (AD-04): convert 3MF to GLB offline." },
  { construct: "ThreeMFLoader.load", target: "", mapping: "none", note: "excluded (AD-04): convert 3MF to GLB offline." },
  { construct: "VOXLoader", target: "", mapping: "none", note: "excluded (AD-04): convert VOX to GLB offline." },
  { construct: "VOXLoader.load", target: "", mapping: "none", note: "excluded (AD-04): convert VOX to GLB offline." },
  { construct: "ColladaLoader", target: "", mapping: "none", note: "excluded (AD-04): convert Collada to GLB offline." },
  { construct: "ColladaLoader.load", target: "", mapping: "none", note: "excluded (AD-04): convert Collada to GLB offline." },
  { construct: "TDSLoader", target: "", mapping: "none", note: "excluded (AD-04): convert 3DS to GLB offline." },
  { construct: "AMFLoader", target: "", mapping: "none", note: "excluded (AD-04): convert AMF to GLB offline." },
  { construct: "IFCLoader", target: "", mapping: "none", note: "excluded (AD-04): convert IFC to GLB offline." },
  // AD-05 deliberate exclusions: bake offline.
  { construct: "GLTFExporter", target: "", mapping: "none", note: "excluded (AD-05): exporters are an offline concern; bake with gltf-transform/three in a build step." },
  { construct: "OBJExporter", target: "", mapping: "none", note: "excluded (AD-05): bake offline." },
  { construct: "PLYExporter", target: "", mapping: "none", note: "excluded (AD-05): bake offline." },
  { construct: "STLExporter", target: "", mapping: "none", note: "excluded (AD-05): bake offline." },
  { construct: "USDZExporter", target: "", mapping: "none", note: "excluded (AD-05): bake offline." },
  { construct: "DRACOExporter", target: "", mapping: "none", note: "excluded (AD-05): bake offline." },
  { construct: "ColladaExporter", target: "", mapping: "none", note: "excluded (AD-05): bake offline." },

  // ── Controls (three addons → @aura3d/engine/controls, SC-02) ─────────
  { construct: "OrbitControls", target: "camera.orbit", engineImport: "camera", mapping: "approximate", note: "OrbitControls target/damping maps to camera.orbit({ target, distance, fov }); the OrbitControls class also exists on @aura3d/engine/controls for a native-camera drive." },
  { construct: "MapControls", target: "MapControls", emit: "new", engineImport: "MapControls", engineImportFrom: controlsSubpath, mapping: "approximate", note: "@aura3d/engine/controls exports MapControls; it drives an Aura camera-like rather than a three renderer." },
  { construct: "TrackballControls", target: "TrackballControls", emit: "new", engineImport: "TrackballControls", engineImportFrom: controlsSubpath, mapping: "approximate", note: "@aura3d/engine/controls exports TrackballControls; camera/dom wiring differs (Aura camera-like)." },
  { construct: "ArcballControls", target: "ArcballControls", emit: "new", engineImport: "ArcballControls", engineImportFrom: controlsSubpath, mapping: "approximate", note: "@aura3d/engine/controls exports ArcballControls; camera/dom wiring differs." },
  { construct: "FlyControls", target: "FlyControls", emit: "new", engineImport: "FlyControls", engineImportFrom: controlsSubpath, mapping: "approximate", note: "@aura3d/engine/controls exports FlyControls; update(dt) is driven by the app frame, not wall-clock." },
  { construct: "FirstPersonControls", target: "FirstPersonControls", emit: "new", engineImport: "FirstPersonControls", engineImportFrom: controlsSubpath, mapping: "approximate", note: "@aura3d/engine/controls exports FirstPersonControls; a PointerLockControlsEngine/FirstPersonControlsEngine variant also exists." },
  { construct: "PointerLockControls", target: "PointerLockControls", emit: "new", engineImport: "PointerLockControls", engineImportFrom: controlsSubpath, mapping: "approximate", note: "@aura3d/engine/controls exports PointerLockControls; look direction feeds an Aura camera-like." },
  { construct: "DragControls", target: "DragControls", emit: "new", engineImport: "DragControls", engineImportFrom: controlsSubpath, mapping: "approximate", note: "@aura3d/engine/controls exports DragControls but marks DRAG_CONTROLS_DEPRECATION — prefer InteractionControls/picking for object drags." },
  { construct: "TransformControls", target: "TransformControls", emit: "new", engineImport: "TransformControls", engineImportFrom: controlsSubpath, mapping: "approximate", note: "@aura3d/engine/controls exports TransformControls (gizmo); handles attach to Aura objects, not a three scene." },

  // ── Audio (AU) ───────────────────────────────────────────────────────
  { construct: "Audio", target: "AudioSource", emit: "comment", engineImport: "AudioSource", engineImportFrom: audioSubpath, mapping: "approximate", note: "@aura3d/engine/audio AudioSource plays an AudioBuffer through an AudioBus — its ctor takes { clip, loop, context }, not a three listener; positional behaviour moves to PositionalEmitter." },
  { construct: "AudioListener", target: "AudioListener", emit: "new", engineImport: "AudioListener", engineImportFrom: audioSubpath, mapping: "approximate", note: "@aura3d/engine/audio AudioListener exists but does not yet drive ctx.listener (AU-01, lane L9); listenerSync drives the pose." },
  { construct: "PositionalAudio", target: "PositionalEmitter", emit: "comment", engineImport: "PositionalEmitter", engineImportFrom: audioSubpath, mapping: "approximate", note: "@aura3d/engine/audio PositionalEmitter exists — its ctor takes a PositionalEmitterOptions object (source/position/attenuation/doppler), not a three listener arg; AU-02 caveat: the double-attenuation fix lands in lane L9 before cone/distanceModel." },

  // ── Post / effects (AD-01) ───────────────────────────────────────────
  { construct: "EffectComposer", target: "effects", emit: "comment", engineImport: "effects", mapping: "approximate", note: "no composer object: the scene renders through the v2 post graph — express passes as effects.* scene nodes or app.addPostPass for custom GLSL." },
  { construct: "RenderPass", target: "scene", emit: "comment", mapping: "approximate", note: "the base render pass is implicit — carry its scene+camera into createAuraApp({ scene, camera }); no pass object is needed." },
  { construct: "UnrealBloomPass", target: "effects.bloom", engineImport: "effects", mapping: "approximate", note: "resolution is graph-owned; strength/radius/threshold map to effects.bloom({ intensity, radius, threshold })." },
  { construct: "BloomPass", target: "effects.bloom", engineImport: "effects", mapping: "approximate", note: "three's legacy BloomPass approximates to effects.bloom." },
  { construct: "SMAAPass", target: "effects.antiAlias", engineImport: "effects", mapping: "approximate", note: "SMAA has no native mode — effects.antiAlias({}) uses fxaa (\"taa\"/\"off\" are the other live modes); smaa is not implemented on the WebGL2 path." },
  { construct: "TAARenderPass", target: "effects.antiAlias", engineImport: "effects", mapping: "approximate", note: "TAA is an antiAlias mode: effects.antiAlias({ mode: \"taa\" }) — opaque rigid triangles only carry velocity." },
  { construct: "SSAARenderPass", target: "effects.antiAlias", engineImport: "effects", mapping: "approximate", note: "supersample AA has no post mode — MSAA lives at the framebuffer (createAuraApp antialias: \"msaa\"); post modes are fxaa/taa." },
  { construct: "BokehPass", target: "effects.depthOfField", engineImport: "effects", mapping: "approximate", note: "Bokeh focus/aperture/maxblur map to effects.depthOfField({ focus, aperture, maxBlur }); focus is a linear-distance fraction, not a physical f-stop." },
  { construct: "SSAOPass", target: "effects.ambientOcclusion", engineImport: "effects", mapping: "approximate", note: "SSAO maps to effects.ambientOcclusion." },
  { construct: "SAOPass", target: "effects.ambientOcclusion", engineImport: "effects", mapping: "approximate", note: "SAO maps to effects.ambientOcclusion." },
  { construct: "GTAOPass", target: "effects.ambientOcclusion", engineImport: "effects", mapping: "approximate", note: "GTAO maps to effects.ambientOcclusion." },
  { construct: "SSRPass", target: "effects.screenSpaceReflections", engineImport: "effects", mapping: "approximate", note: "SSR maps to effects.screenSpaceReflections." },
  { construct: "OutlinePass", target: "effects.outline", engineImport: "effects", mapping: "approximate", note: "OutlinePass maps to effects.outline({ color, width, threshold })." },
  { construct: "FilmPass", target: "effects.filmGrain", engineImport: "effects", mapping: "approximate", note: "film grain + scanlines approximate to effects.filmGrain({ size, intensity, luminanceResponse })." },
  { construct: "LUTPass", target: "effects.colorGrade", engineImport: "effects", mapping: "approximate", note: "LUT color grading maps to effects.colorGrade({ lut }) (3D LUT texture slot)." },
  { construct: "OutputPass", target: "output", emit: "comment", mapping: "approximate", note: "the output stage (tone mapping + sRGB) is built into the pipeline — set it via createAuraApp({ output: { toneMapping, exposure, dither } }) or app.setOutput." },
  { construct: "AdaptiveToneMappingPass", target: "output", emit: "comment", mapping: "approximate", note: "adaptive tone mapping maps to output options autoExposure ({ minEv, maxEv, speedUp, speedDown }) on createAuraApp/app.setOutput." },
  { construct: "ShaderPass", target: "app.addPostPass", emit: "comment", mapping: "approximate", note: "a GLSL ShaderPass maps to app.addPostPass({ name, insertAt, fragment: { glsl }, uniforms }) — real GPU path today (A3D_QR_POST default-on); the effects.shaderPass scene node lands with lane L1 (SH-03)." },
  { construct: "MaskPass", target: "", mapping: "none", note: "no stencil/mask pass on the public post graph." },
  { construct: "ClearMaskPass", target: "", mapping: "none", note: "no stencil/mask pass on the public post graph." },
  { construct: "TexturePass", target: "", mapping: "none", note: "no texture-swap pass; composite overlays are DOM or a custom pass (app.addPostPass)." },
  { construct: "SavePass", target: "", mapping: "none", note: "no ping-pong save pass on the public post graph." },
  { construct: "CopyPass", target: "", mapping: "none", note: "buffer copies are internal to the post graph." },
  { construct: "DotScreenPass", target: "", mapping: "none", note: "no halftone pass on the public post graph; a halftone is a custom pass candidate (app.addPostPass GLSL)." },
  { construct: "HalftonePass", target: "", mapping: "none", note: "no halftone pass on the public post graph; a halftone is a custom pass candidate (app.addPostPass GLSL)." },
  { construct: "GlitchPass", target: "", mapping: "none", note: "no glitch pass on the public post graph; a glitch is a custom pass candidate (app.addPostPass GLSL)." },
  { construct: "AfterimagePass", target: "", mapping: "none", note: "no afterimage/trail pass on the public post graph." },
  { construct: "Reflector", target: "surfaces.mirror", emit: "comment", mapping: "pending", note: "surfaces.mirror({ size, resolution, tint }) lands with lane L7 (AD-15) over R/PlanarReflection." },
  { construct: "GPUComputationRenderer", target: "", mapping: "none", note: "excluded (AD-11): GPU compute waits on SH-04 — public compute.* is WebGPU-only and pending A3D_QR_WEBGPU." },

  // ── Environment / PMREM (SH-07, AD-12) ───────────────────────────────
  { construct: "PMREMGenerator", target: "environments.capture", emit: "comment", engineImport: "environments", mapping: "approximate", note: "PMREMGenerator+fromScene collapses into environments.capture({ resolution, update, include }); fromEquirectangular+RGBELoader collapses into environments.hdri (SH-07, closed)." },
  { construct: "RoomEnvironment", target: "environments.neutral", engineImport: "environments", mapping: "approximate", note: "three's generated RoomEnvironment probe maps to environments.neutral() (code-generated room probe, background off by default)." },

  // ── Fog / atmosphere ─────────────────────────────────────────────────
  { construct: "Fog", target: "effects.fog", engineImport: "effects", mapping: "approximate", note: "three's linear Fog(color, near, far) maps to effects.fog({ color }) — Aura fog is density/height based; retune near/far into density." },
  { construct: "FogExp2", target: "effects.depthFog", engineImport: "effects", mapping: "approximate", note: "exp2 fog maps to effects.depthFog({ color, density }) or effects.fog with exp2 mode." },

  // ── Instancing / batching ────────────────────────────────────────────
  { construct: "InstancedMesh", target: "instances.box", engineImport: "instances", mapping: "approximate", note: "InstancedMesh maps to instances.<shape matching the geometry>({ transforms }); per-instance setMatrixAt handle lands as instances.mesh with lane L5 (SG-01)." },
  { construct: "BatchedMesh", target: "batched.mesh", emit: "comment", mapping: "pending", note: "batched.mesh({ maxInstances, maxVertices }) lands with lane L5 (SG-02); multi-draw detection is part of L5-03." },
  { construct: "InstancedBufferGeometry", target: "instances", emit: "comment", mapping: "pending", note: "per-instance attributes land with lane L5 (SG-01) on the GPU instance-buffer write path." },

  // ── Lines / points / sprites ─────────────────────────────────────────
  { construct: "Line", target: "lines.line", emit: "comment", mapping: "pending", note: "lines.line({ points }) lands with lane L6 (SG-06)." },
  { construct: "LineLoop", target: "lines.loop", emit: "comment", mapping: "pending", note: "lines.loop lands with lane L6 (SG-06)." },
  { construct: "LineSegments", target: "lines.segments", emit: "comment", mapping: "pending", note: "lines.segments lands with lane L6 (SG-06); fat/dashed via lines.fat (AD-08)." },
  { construct: "Points", target: "points", emit: "comment", mapping: "pending", note: "points({ positions, size, sizeAttenuation, map, alphaTest }) lands with lane L6 (SG-07)." },
  { construct: "Sprite", target: "sprites", emit: "comment", mapping: "pending", note: "sprite({ map, center, rotation, sizeAttenuation }) lands with lane L6 (SG-08)." },

  // ── Math (SM) ────────────────────────────────────────────────────────
  { construct: "Vector2", target: "Vector2", emit: "new", engineImport: "Vector2", engineImportFrom: mathSubpath, mapping: "approximate", note: "@aura3d/engine/math Vector2 exists; method set is thinner than three's." },
  { construct: "Vector3", target: "[x, y, z]", mapping: "approximate", note: "Vector3 maps to AuraVec3 tuples in node specs; the Vector3 class also exists on @aura3d/engine/math when you need methods." },
  { construct: "Vector4", target: "Vector4", emit: "new", engineImport: "Vector4", engineImportFrom: mathSubpath, mapping: "approximate", note: "@aura3d/engine/math Vector4 exists; method set is thinner than three's." },
  { construct: "Quaternion", target: "Quaternion", emit: "new", engineImport: "Quaternion", engineImportFrom: mathSubpath, mapping: "approximate", note: "@aura3d/engine/math Quaternion exists; node specs accept quaternions via the quaternion field." },
  { construct: "Euler", target: "rotation", mapping: "approximate", note: "Euler('XYZ') order maps to rotation: [x, y, z] on the node builder; non-XYZ orders need quaternion composition — flagged in TODO." },
  { construct: "Matrix3", target: "Matrix3", emit: "new", engineImport: "Matrix3", engineImportFrom: mathSubpath, mapping: "approximate", note: "@aura3d/engine/math Matrix3 exists; getNormalMatrix lands with lane L3 (SM-01)." },
  { construct: "Matrix4", target: "Matrix4", emit: "new", engineImport: "Matrix4", engineImportFrom: mathSubpath, mapping: "approximate", note: "@aura3d/engine/math Matrix4 exists; node transforms take TRS tuples instead of matrices." },
  { construct: "Box3", target: "Box3", emit: "new", engineImport: "Box3", engineImportFrom: mathSubpath, mapping: "approximate", note: "@aura3d/engine/math Box3 exists; the rest of three's method set lands with lane L3 (SM-01)." },
  { construct: "Sphere", target: "Sphere", emit: "new", engineImport: "Sphere", engineImportFrom: mathSubpath, mapping: "approximate", note: "@aura3d/engine/math Sphere exists; method parity lands with lane L3 (SM-01)." },
  { construct: "Plane", target: "Plane", emit: "new", engineImport: "Plane", engineImportFrom: mathSubpath, mapping: "approximate", note: "@aura3d/engine/math Plane exists; method parity lands with lane L3 (SM-01)." },
  { construct: "Ray", target: "Ray", emit: "new", engineImport: "Ray", engineImportFrom: mathSubpath, mapping: "approximate", note: "@aura3d/engine/math Ray exists; intersect* helpers land with lane L3 (SM-01)." },
  { construct: "Frustum", target: "Frustum", emit: "new", engineImport: "Frustum", engineImportFrom: mathSubpath, mapping: "approximate", note: "@aura3d/engine/math Frustum exists; method parity lands with lane L3 (SM-01)." },
  { construct: "Color", target: "#rrggbb", mapping: "approximate", note: "THREE.Color maps to hex strings or [r,g,b] arrays in material/light options." },
  { construct: "Spherical", target: "Spherical", emit: "comment", engineImportFrom: mathSubpath, engineImport: "Spherical", mapping: "pending", note: "Spherical lands with lane L3 (SM-01)." },
  { construct: "Cylindrical", target: "Cylindrical", emit: "comment", engineImportFrom: mathSubpath, engineImport: "Cylindrical", mapping: "pending", note: "Cylindrical lands with lane L3 (SM-01)." },
  { construct: "Line3", target: "Line3", emit: "comment", engineImportFrom: mathSubpath, engineImport: "Line3", mapping: "pending", note: "Line3 lands with lane L3 (SM-01)." },
  { construct: "Triangle", target: "Triangle", emit: "comment", engineImportFrom: mathSubpath, engineImport: "Triangle", mapping: "pending", note: "Triangle lands with lane L3 (SM-01)." },
  { construct: "MathUtils", target: "MathUtils", emit: "comment", engineImportFrom: mathSubpath, engineImport: "MathUtils", mapping: "pending", note: "MathUtils (degToRad/damp/mapLinear/seededRandom/…) lands with lane L3 (SM-04)." },
  { construct: "SphericalHarmonics3", target: "SphericalHarmonics3", emit: "comment", engineImportFrom: mathSubpath, engineImport: "SphericalHarmonics3", mapping: "pending", note: "public SphericalHarmonics3 lands with lane L3 (SM-04); the SH9 internals already exist." },
  { construct: "Octree", target: "Octree", emit: "comment", engineImportFrom: mathSubpath, engineImport: "Octree", mapping: "pending", note: "Octree (capsule/sphere/ray sweeps) lands with lane L3 (AD-14)." },
  { construct: "ConvexGeometry", target: "geometry", emit: "comment", engineImport: "geometry", mapping: "pending", note: "convex hull geometry lands with lane L2 over the L3 ConvexHull (AD-07)." },

  // ── Curves (SM-02) ───────────────────────────────────────────────────
  { construct: "CatmullRomCurve3", target: "curve.catmullRom", emit: "comment", mapping: "pending", note: "curve.catmullRom({ points, closed, curveType }) lands with lane L3 (SM-02); the frozen Curve<V> interface is in @aura3d/engine/math." },
  { construct: "CubicBezierCurve3", target: "curve.cubicBezier", emit: "comment", mapping: "pending", note: "cubic bezier curves land with lane L3 (SM-02)." },
  { construct: "CubicBezierCurve", target: "curve.cubicBezier2D", emit: "comment", mapping: "pending", note: "2D cubic bezier lands with lane L3 (SM-02)." },
  { construct: "QuadraticBezierCurve3", target: "curve.quadraticBezier", emit: "comment", mapping: "pending", note: "quadratic bezier curves land with lane L3 (SM-02)." },
  { construct: "QuadraticBezierCurve", target: "curve.quadraticBezier2D", emit: "comment", mapping: "pending", note: "2D quadratic bezier lands with lane L3 (SM-02)." },
  { construct: "LineCurve3", target: "curve.line", emit: "comment", mapping: "pending", note: "curve.line lands with lane L3 (SM-02)." },
  { construct: "LineCurve", target: "curve.line2D", emit: "comment", mapping: "pending", note: "2D line curves land with lane L3 (SM-02)." },
  { construct: "SplineCurve", target: "curve.spline", emit: "comment", mapping: "pending", note: "spline curves land with lane L3 (SM-02)." },
  { construct: "EllipseCurve", target: "curve.ellipse", emit: "comment", mapping: "pending", note: "ellipse/arc curves land with lane L3 (SM-02)." },
  { construct: "ArcCurve", target: "curve.arc", emit: "comment", mapping: "pending", note: "arc curves land with lane L3 (SM-02)." },
  { construct: "CurvePath", target: "curve.path", emit: "comment", mapping: "pending", note: "CurvePath lands with lane L3 (SM-02)." },
  { construct: "Path", target: "curve.path", emit: "comment", mapping: "pending", note: "Path (moveTo/lineTo/bezierCurveTo/…) lands with lane L3 (SM-02); consumed by primitives.shape/extrude (L2)." },
  { construct: "Shape", target: "curve.shape", emit: "comment", mapping: "pending", note: "Shape (with holes) lands with lane L3 (SM-02); consumed by primitives.shape/extrude (L2)." },

  // ── Runtime / cameras / render targets ───────────────────────────────
  { construct: "Clock", target: "createAuraApp({ onFrame })", emit: "comment", mapping: "approximate", note: "THREE.Clock/getDelta folds into the frame callback's dt argument; a Clock class over the frame loop lands with lane L7 (SR-01)." },
  { construct: "Raycaster", target: "raycast", emit: "comment", mapping: "pending", note: "public raycast({ origin, direction } | { camera, ndc }, options) lands with lane L7 (SR-03); the internals exist in SceneQueries." },
  { construct: "Layers", target: "layers", emit: "comment", mapping: "pending", note: "camera layer masks + node layers fields are frozen; the camera-side mask lands with lane L7 (SR-04)." },
  { construct: "WebGLRenderTarget", target: "RenderTarget", emit: "comment", mapping: "pending", note: "public RenderTarget + renderer.render({ target }) lands with lane L7 (SH-06); the type is reserved on @aura3d/engine/renderer." },
  { construct: "WebGLCubeRenderTarget", target: "RenderTarget", emit: "comment", mapping: "pending", note: "cube render targets land with lane L7 (SH-06) and feed cameras.cube (SC-01)." },
  { construct: "WebGL3DRenderTarget", target: "RenderTarget", emit: "comment", mapping: "pending", note: "3D/array render targets are P2 on lane L7 (SH-06)." },
  { construct: "WebGLArrayRenderTarget", target: "RenderTarget", emit: "comment", mapping: "pending", note: "2D-array render targets land with lane L7 (SH-06)." },
  { construct: "CubeCamera", target: "cameras.cube", emit: "comment", mapping: "pending", note: "cameras.cube({ resolution, near, far }) lands with lane L7 (SC-01) over Renderer.renderProbeFace." },
  { construct: "ArrayCamera", target: "cameras.array", emit: "comment", mapping: "pending", note: "multi-viewport array cameras are P2 on lane L7 (SC-01) — needs viewport/scissor." },
  { construct: "StereoCamera", target: "cameras.stereo", emit: "comment", mapping: "pending", note: "stereo cameras are P2 on lane L7 (SC-01) — needs viewport/scissor." },

  // ── Helpers (SC-03) ──────────────────────────────────────────────────
  { construct: "AxesHelper", target: "helpers.axes", emit: "comment", mapping: "pending", note: "helpers.axes lands with lane L6 (SC-03, P2) over lines.*." },
  { construct: "GridHelper", target: "helpers.grid", emit: "comment", mapping: "pending", note: "helpers.grid lands with lane L6 (SC-03, P2)." },
  { construct: "PolarGridHelper", target: "helpers.polarGrid", emit: "comment", mapping: "pending", note: "helpers.polarGrid lands with lane L6 (SC-03, P2)." },
  { construct: "BoxHelper", target: "helpers.box", emit: "comment", mapping: "pending", note: "helpers.box lands with lane L6 (SC-03, P2)." },
  { construct: "Box3Helper", target: "helpers.box3", emit: "comment", mapping: "pending", note: "helpers.box3 lands with lane L6 (SC-03, P2)." },
  { construct: "CameraHelper", target: "helpers.camera", emit: "comment", mapping: "pending", note: "helpers.camera lands with lane L6 (SC-03, P2)." },
  { construct: "DirectionalLightHelper", target: "helpers.directionalLight", emit: "comment", mapping: "pending", note: "helpers.directionalLight lands with lane L6 (SC-03, P2)." },
  { construct: "HemisphereLightHelper", target: "helpers.light", emit: "comment", mapping: "pending", note: "helper variants land with lane L6 (SC-03, P2)." },
  { construct: "PointLightHelper", target: "helpers.pointLight", emit: "comment", mapping: "pending", note: "helpers.pointLight lands with lane L6 (SC-03, P2)." },
  { construct: "SpotLightHelper", target: "helpers.spotLight", emit: "comment", mapping: "pending", note: "helpers.spotLight lands with lane L6 (SC-03, P2)." },
  { construct: "SkeletonHelper", target: "helpers.skeleton", emit: "comment", mapping: "pending", note: "helpers.skeleton lands with lane L6 (SC-03, P2)." },
  { construct: "ArrowHelper", target: "helpers.arrow", emit: "comment", mapping: "pending", note: "helpers.arrow lands with lane L6 (SC-03, P2)." },
  { construct: "PlaneHelper", target: "helpers.plane", emit: "comment", mapping: "pending", note: "helpers.plane lands with lane L6 (SC-03, P2)." },

  // ── Animation ────────────────────────────────────────────────────────
  { construct: "AnimationMixer", target: "AnimationController", emit: "comment", engineImport: "AnimationController", mapping: "approximate", note: "the mixer folds into AnimationController over the model asset; crossfade/retarget survive as controller methods (SA-01 mostly closed)." },
  { construct: "AnimationObjectGroup", target: "AnimationObjectGroup", emit: "comment", mapping: "pending", note: "AnimationObjectGroup lands with lane L8 (SA-02, P2)." },
  { construct: "AnimationUtils", target: "AnimationUtils", emit: "comment", mapping: "pending", note: "subclip/optimize/merge/makeClipAdditive land with lane L8 (SA-06, P2)." },
  { construct: "KeyframeTrack", target: "KeyframeTrack", emit: "comment", mapping: "pending", note: "typed track factories land with lane L8 (SM-03); AN/AnimationTrack exists internally." },
  { construct: "NumberKeyframeTrack", target: "KeyframeTrack", emit: "comment", mapping: "pending", note: "typed track factories land with lane L8 (SM-03)." },
  { construct: "VectorKeyframeTrack", target: "KeyframeTrack", emit: "comment", mapping: "pending", note: "typed track factories land with lane L8 (SM-03)." },
  { construct: "ColorKeyframeTrack", target: "KeyframeTrack", emit: "comment", mapping: "pending", note: "colour tracks land with lane L8 (SM-03)." },
  { construct: "QuaternionKeyframeTrack", target: "KeyframeTrack", emit: "comment", mapping: "pending", note: "typed track factories land with lane L8 (SM-03)." },
  { construct: "BooleanKeyframeTrack", target: "KeyframeTrack", emit: "comment", mapping: "pending", note: "typed track factories land with lane L8 (SM-03)." },
  { construct: "StringKeyframeTrack", target: "KeyframeTrack", emit: "comment", mapping: "pending", note: "typed track factories land with lane L8 (SM-03)." },

];

const byConstruct = new Map<string, ThreeMapping>(THREE_TO_A3D_MAPPINGS.map((m) => [m.construct, m]));

export function threeMappingFor(construct: string): ThreeMapping | undefined {
  return byConstruct.get(construct);
}
