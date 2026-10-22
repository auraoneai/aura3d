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
const animationSubpath = "@aura3d/engine/animation";
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
  { construct: "Bone", target: "model", emit: "comment", engineImport: "model", mapping: "approximate", note: "bones ride inside the GLB skeleton — model(assets.<key>) plus AnimationController; cloneSkinned (characters.clone) is public (SA-04)." },
  { construct: "Skeleton", target: "model", emit: "comment", engineImport: "model", mapping: "approximate", note: "skeletons ride inside the GLB asset — model(assets.<key>); cloneSkinned (characters.clone) is public (SA-04)." },
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
  { construct: "BufferGeometry", target: "geometry.dynamic", emit: "comment", engineImport: "geometry", mapping: "approximate", note: "geometry.dynamic(spec) is public (SG-05) — typed-array attributes validate up front and handle.setGeometry/updateAttribute rewrite live buffers in place." },
  { construct: "ConeGeometry", target: "primitives.cone", emit: "comment", engineImport: "primitives", mapping: "approximate", note: "primitives.cone is public (SG-03) — params carry radius/height/radialSegments/heightSegments/openEnded (+ thetaStart/thetaLength)." },
  { construct: "CircleGeometry", target: "primitives.circle", emit: "comment", engineImport: "primitives", mapping: "approximate", note: "primitives.circle is public (SG-03) — params carry radius/segments/thetaStart/thetaLength." },
  { construct: "RingGeometry", target: "primitives.ring", emit: "comment", engineImport: "primitives", mapping: "approximate", note: "primitives.ring is public (SG-03) — params carry innerRadius/outerRadius/thetaSegments." },
  { construct: "TubeGeometry", target: "primitives.tube", emit: "comment", engineImport: "primitives", mapping: "approximate", note: "primitives.tube is public (SG-03) — params.path takes an @aura3d/engine/math Curve or point list; params carry radius/tubularSegments/closed." },
  { construct: "LatheGeometry", target: "primitives.lathe", emit: "comment", engineImport: "primitives", mapping: "approximate", note: "primitives.lathe is public (SG-03) — params carry points/segments/phiStart/phiLength." },
  { construct: "ExtrudeGeometry", target: "primitives.extrude", emit: "comment", engineImport: "primitives", mapping: "approximate", note: "primitives.extrude is public (SG-03) — params carry depth/steps/bevel*/extrudePath over an @aura3d/engine/math Shape." },
  { construct: "ShapeGeometry", target: "primitives.shape", emit: "comment", engineImport: "primitives", mapping: "approximate", note: "primitives.shape is public (SG-03) — consumes an @aura3d/engine/math Shape (with holes)." },
  { construct: "TorusKnotGeometry", target: "primitives.torusKnot", emit: "comment", engineImport: "primitives", mapping: "approximate", note: "primitives.torusKnot is public (SG-03) — params carry radius/tube/tubularSegments/radialSegments/p/q." },
  { construct: "PolyhedronGeometry", target: "primitives.polyhedron", emit: "comment", engineImport: "primitives", mapping: "approximate", note: "primitives.polyhedron({ params: { variant, radius, detail } }) is public (SG-03) — variant covers tetrahedron/octahedron/icosahedron/dodecahedron." },
  { construct: "IcosahedronGeometry", target: "primitives.polyhedron", emit: "comment", engineImport: "primitives", mapping: "approximate", note: "primitives.polyhedron({ params: { variant: \"icosahedron\", detail } }) is public (SG-03)." },
  { construct: "TetrahedronGeometry", target: "primitives.polyhedron", emit: "comment", engineImport: "primitives", mapping: "approximate", note: "primitives.polyhedron({ params: { variant: \"tetrahedron\", detail } }) is public (SG-03)." },
  { construct: "OctahedronGeometry", target: "primitives.polyhedron", emit: "comment", engineImport: "primitives", mapping: "approximate", note: "primitives.polyhedron({ params: { variant: \"octahedron\", detail } }) is public (SG-03)." },
  { construct: "DodecahedronGeometry", target: "primitives.polyhedron", emit: "comment", engineImport: "primitives", mapping: "approximate", note: "primitives.polyhedron({ params: { variant: \"dodecahedron\", detail } }) is public (SG-03)." },
  { construct: "RoundedBoxGeometry", target: "primitives.roundedBox", emit: "comment", engineImport: "primitives", mapping: "approximate", note: "primitives.roundedBox is public (SG-03/AD-07) — params carry radius/segments." },
  { construct: "EdgesGeometry", target: "geometry.edges", emit: "comment", engineImport: "geometry", mapping: "approximate", note: "geometry.edges(src, thresholdAngle) is public (SG-04) — emits a lines-topology spec of sharp-edge segments." },
  { construct: "WireframeGeometry", target: "geometry.wireframe", emit: "comment", engineImport: "geometry", mapping: "approximate", note: "geometry.wireframe(src) is public (SG-04) — every triangle edge once, in traversal order, lines topology." },
  { construct: "TextGeometry", target: "text3D", emit: "comment", engineImport: "text3D", mapping: "approximate", note: "three's font-extruded TextGeometry maps to the text3D node (SDF text catalog) — the font is an authored catalog, not a parsed typeface." },
  { construct: "FontLoader", target: "text3D", emit: "comment", mapping: "none", note: "no font loader: text3D uses a baked SDF catalog; three typeface.json fonts are not consumed." },
  { construct: "FontLoader.load", target: "text3D", mapping: "none", note: "no font loader: text3D uses a baked SDF catalog." },

  // ── Materials ────────────────────────────────────────────────────────
  { construct: "MeshStandardMaterial", target: "material.pbr", engineImport: "material", mapping: "approximate", note: "color/metalness/roughness map to material.pbr options; envMapIntensity semantics differ." },
  { construct: "MeshPhysicalMaterial", target: "material.physical", engineImport: "material", mapping: "approximate", note: "clearcoat, transmission and sheen survive as material.physical options (engine material-physical layer bounds them)." },
  { construct: "MeshBasicMaterial", target: "material.pbr", engineImport: "material", mapping: "approximate", note: "unlit three materials map to material.pbr({ unlit: true }) on the AuraMaterialSpec." },
  { construct: "MeshLambertMaterial", target: "material.pbr", engineImport: "material", mapping: "approximate", note: "diffuse-only Lambert collapses into material.pbr with high roughness and zero metalness." },
  { construct: "MeshPhongMaterial", target: "material.pbr", engineImport: "material", mapping: "approximate", note: "Phong specular has no direct slot; shininess/specular highlights approximate onto material.pbr({ clearcoat })." },
  { construct: "MeshNormalMaterial", target: "", mapping: "none", note: "no normal-debug material on the public surface; the closest target is material.custom (SH-02)." },
  { construct: "MeshDepthMaterial", target: "", mapping: "none", note: "no depth-preview material on the public surface; the closest target is material.custom (SH-02)." },
  { construct: "MeshDistanceMaterial", target: "", mapping: "none", note: "no point-light depth material on the public surface." },
  { construct: "MeshMatcapMaterial", target: "", mapping: "none", note: "no matcap material on the public surface; a matcap can ride material.custom (SH-02)." },
  { construct: "MeshToonMaterial", target: "", mapping: "none", note: "no toon-step material on the public surface; toon shading is a material.custom candidate (SH-02)." },
  { construct: "ShadowMaterial", target: "", mapping: "none", note: "no shadow-only material on the public surface." },
  { construct: "ShaderMaterial", target: "material.custom", emit: "comment", engineImport: "material", mapping: "approximate", note: "material.custom({ glsl: { vertex?, fragment }, wgsl?, uniforms, defines, transparent, side, blending }) is public (SH-02) — GLSL is required (WebGL2 is the live backend); wgsl runs only on the WebGPU backend." },
  { construct: "RawShaderMaterial", target: "material.custom", emit: "comment", engineImport: "material", mapping: "approximate", note: "material.custom({ glsl, uniforms, defines }) is public (SH-02); raw vs. built-in-uniform binding is part of the spec." },
  { construct: "NodeMaterial", target: "material.custom", emit: "comment", mapping: "pending", note: "TSL node materials have no public Aura3D equivalent — TSL is probe-evidenced absent from live games (SH-01); a hand-ported material.custom({ glsl }) rewrite is available NOW (SH-02)." },
  { construct: "LineBasicMaterial", target: "lines", emit: "comment", mapping: "approximate", note: "line color/width fold into lines.line/segments options (SG-06); dashes and pixel widths need lines.fat." },
  { construct: "LineDashedMaterial", target: "lines.fat", emit: "comment", mapping: "approximate", note: "dashed lines map to lines.fat({ dashed, dashSize, gapSize, width }) (SG-06/AD-08)." },
  { construct: "PointsMaterial", target: "points", emit: "comment", mapping: "approximate", note: "point size/sizeAttenuation/map/alphaTest/transparent fold into the points node (SG-07)." },
  { construct: "SpriteMaterial", target: "sprites", emit: "comment", mapping: "approximate", note: "sprite map/center/rotation/sizeAttenuation fold into sprites.sprite (SG-08)." },

  // ── Lights ───────────────────────────────────────────────────────────
  { construct: "DirectionalLight", target: "lights.directional", engineImport: "lights", mapping: "approximate", note: "color/intensity map; position becomes a spec option and shadow becomes a boolean flag." },
  { construct: "PointLight", target: "lights.point", engineImport: "lights", mapping: "approximate", note: "color/intensity/distance map to lights.point options." },
  { construct: "SpotLight", target: "lights.spot", engineImport: "lights", mapping: "approximate", note: "angle/penumbra/decay/distance map to lights.spot options." },
  { construct: "AmbientLight", target: "lights.ambient", engineImport: "lights", mapping: "approximate", note: "color/intensity map to lights.ambient options." },
  { construct: "HemisphereLight", target: "lights.ambient", engineImport: "lights", mapping: "approximate", note: "sky/ground two-tone shading approximates to ambient until the lights.hemisphere contract lands; keep the pair of tints in the TODO comment." },
  { construct: "RectAreaLight", target: "lights.rectArea", emit: "comment", engineImport: "lights", mapping: "approximate", note: "lights.rectArea is public (AD-16) — an alias over lights.rect (width/height, position/target, twoSided)." },
  { construct: "LightProbe", target: "lights.lightProbe", emit: "comment", mapping: "pending", note: "reserved for lights.lightProbe — not yet public; the SH9 math ships as SphericalHarmonics3 on @aura3d/engine/math." },
  { construct: "AmbientLightProbe", target: "lights.lightProbe", emit: "comment", mapping: "pending", note: "reserved for lights.lightProbe — not yet public; ambient SH approximates to lights.hemisphere today." },
  { construct: "HemisphereLightProbe", target: "lights.lightProbe", emit: "comment", mapping: "pending", note: "reserved for lights.lightProbe — not yet public; sky/ground tint approximates to lights.hemisphere today." },
  { construct: "CSM", target: "lights.directional", emit: "comment", engineImport: "lights", mapping: "approximate", note: "three/addons CSM collapses into lights.directional({ shadow: { cascades: 1-4|\"auto\", maxDistance, splitLambda } }) — CascadedShadowMaps is wired in ShadowOrchestration (AD-12)." },

  // ── Loaders and assets ───────────────────────────────────────────────
  { construct: "GLTFLoader", target: "", mapping: "none", note: "loader objects disappear — the load call becomes model(assets.<typedKey>); see the .load row." },
  { construct: "GLTFLoader.load", target: "model", engineImport: "model", mapping: "approximate", note: "loader.load(url) becomes model(assets.<typedKey>) — register the GLB via `aura3d assets add` and reference the generated asset key." },
  { construct: "RGBELoader", target: "", mapping: "none", note: "loader objects disappear — RGBELoader+PMREMGenerator collapses into environments.hdri; see the .load row." },
  { construct: "RGBELoader.load", target: "environments.hdri", engineImport: "environments", mapping: "approximate", note: "RGBELoader + PMREMGenerator collapses into environments.hdri({ texture: assets.<hdrKey> }); register the .hdr via `aura3d assets add`." },
  { construct: "TextureLoader", target: "texture.load", emit: "comment", engineImport: "texture", mapping: "approximate", note: "texture.load(url, opts) is public (ST-07) — async decode to TextureHandle over @aura3d/assets; .exr URLs route to rgba16f/rgba32f; progress/error events ride createAuraApp({ onAssetProgress, onAssetError })." },
  { construct: "TextureLoader.load", target: "assets", engineImport: "assets", mapping: "approximate", note: "TextureLoader.load(url) maps to a typed aura-assets texture ref (assets.<key>) plus material options." },
  { construct: "CubeTextureLoader", target: "texture.cube", emit: "comment", engineImport: "texture", mapping: "approximate", note: "texture.cube(faces) is public (ST-01) — six faces in px,nx,py,ny,pz,nz order." },
  { construct: "CubeTextureLoader.load", target: "texture.cube", engineImport: "texture", mapping: "approximate", note: "a CubeTextureLoader.load(urls) call maps to texture.cube(faces) — decode the six face images (texture.load or ImageBitmapLoader) then pass them in px,nx,py,ny,pz,nz order." },
  { construct: "EXRLoader", target: "environments.hdri", emit: "comment", engineImport: "environments", mapping: "approximate", note: "EXR decode is public (AD-03): `aura3d assets add` accepts .exr and texture.load routes .exr URLs to rgba16f/rgba32f textures — feed environments.hdri({ texture: assets.<key> })." },
  { construct: "EXRLoader.load", target: "environments.hdri", engineImport: "environments", mapping: "approximate", note: "EXRLoader.load(url) collapses into environments.hdri({ texture: assets.<exrKey> }) — register the .exr via `aura3d assets add`; the raw decode lives on @aura3d/engine/assets (EXRLoader/parseEXR)." },
  { construct: "AudioLoader", target: "AudioLoader", emit: "comment", engineImport: "AudioLoader", engineImportFrom: assetsSubpath, mapping: "approximate", note: "@aura3d/engine/assets exports AudioLoader — it is an AssetManager loader whose ctor requires an AudioDecodeContext, not a standalone .load(url, onLoad); decode to AudioBuffer then wrap in AudioClip." },
  { construct: "AudioLoader.load", target: "assets", engineImport: "assets", mapping: "approximate", note: "audio decodes via AudioLoader over AssetManager (typed assets.<key>) or fetch + AudioContext.decodeAudioData into AudioClip (AU-04)." },
  { construct: "FileLoader", target: "FileLoader", emit: "comment", engineImport: "FileLoader", engineImportFrom: assetsSubpath, mapping: "approximate", note: "@aura3d/engine/assets exports FileLoader (ST-04) — a three-parity class (responseType/mimeType/withCredentials/requestHeader/path)." },
  { construct: "FileLoader.load", target: "FileLoader", engineImport: "FileLoader", engineImportFrom: assetsSubpath, mapping: "approximate", note: "FileLoader.load(url, onLoad?, onProgress?, onError?) is a real async fetch (ST-04) — three's signature, decoded per responseType." },
  { construct: "ImageBitmapLoader", target: "ImageBitmapLoader", emit: "comment", engineImport: "ImageBitmapLoader", engineImportFrom: assetsSubpath, mapping: "approximate", note: "@aura3d/engine/assets exports ImageBitmapLoader (ST-04) — ctor takes ImageBitmapLoaderOptions, not a LoadingManager." },
  { construct: "ImageBitmapLoader.load", target: "ImageBitmapLoader", engineImport: "ImageBitmapLoader", engineImportFrom: assetsSubpath, mapping: "approximate", note: "ImageBitmapLoader.load(url, onLoad?, onProgress?, onError?) resolves an ImageBitmap (ST-04)." },
  { construct: "DataTextureLoader", target: "DataTextureLoader", emit: "comment", engineImport: "DataTextureLoader", engineImportFrom: assetsSubpath, mapping: "approximate", note: "@aura3d/engine/assets exports DataTextureLoader (ST-04) — typed-array texture payloads decoded over FileLoader." },
  { construct: "DataTextureLoader.load", target: "DataTextureLoader", engineImport: "DataTextureLoader", engineImportFrom: assetsSubpath, mapping: "approximate", note: "DataTextureLoader.load(url, onLoad?, onProgress?, onError?) resolves a DataTexture-like payload (ST-04)." },
  { construct: "LoadingManager", target: "createAuraApp", emit: "comment", engineImport: "createAuraApp", mapping: "approximate", note: "loading progress/error plumbing is public (ST-06): createAuraApp({ onAssetProgress, onAssetError }) over the shared asset manager." },
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
  { construct: "AudioListener", target: "AudioListener", emit: "new", engineImport: "AudioListener", engineImportFrom: audioSubpath, mapping: "approximate", note: "@aura3d/engine/audio AudioListener exists but does not yet drive ctx.listener (AU-01); listenerSync drives the pose." },
  { construct: "PositionalAudio", target: "PositionalEmitter", emit: "comment", engineImport: "PositionalEmitter", engineImportFrom: audioSubpath, mapping: "approximate", note: "@aura3d/engine/audio PositionalEmitter exists — its ctor takes a PositionalEmitterOptions object (source/position/attenuation/doppler), not a three listener arg; AU-02 caveat: a double-attenuation issue remains before cone/distanceModel are trustworthy." },

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
  { construct: "ShaderPass", target: "app.addPostPass", emit: "comment", mapping: "approximate", note: "a GLSL ShaderPass maps to app.addPostPass({ name, insertAt, fragment: { glsl }, uniforms }) — real GPU path today (A3D_QR_POST default-on); an effects.shaderPass scene node is not yet public (SH-03)." },
  { construct: "MaskPass", target: "", mapping: "none", note: "no stencil/mask pass on the public post graph." },
  { construct: "ClearMaskPass", target: "", mapping: "none", note: "no stencil/mask pass on the public post graph." },
  { construct: "TexturePass", target: "", mapping: "none", note: "no texture-swap pass; composite overlays are DOM or a custom pass (app.addPostPass)." },
  { construct: "SavePass", target: "", mapping: "none", note: "no ping-pong save pass on the public post graph." },
  { construct: "CopyPass", target: "", mapping: "none", note: "buffer copies are internal to the post graph." },
  { construct: "DotScreenPass", target: "", mapping: "none", note: "no halftone pass on the public post graph; a halftone is a custom pass candidate (app.addPostPass GLSL)." },
  { construct: "HalftonePass", target: "", mapping: "none", note: "no halftone pass on the public post graph; a halftone is a custom pass candidate (app.addPostPass GLSL)." },
  { construct: "GlitchPass", target: "", mapping: "none", note: "no glitch pass on the public post graph; a glitch is a custom pass candidate (app.addPostPass GLSL)." },
  { construct: "AfterimagePass", target: "", mapping: "none", note: "no afterimage/trail pass on the public post graph." },
  { construct: "Reflector", target: "surfaces.mirror", emit: "comment", engineImport: "surfaces", mapping: "approximate", note: "surfaces.mirror({ size, resolution, tint, position }) is public (AD-15) — a live planar-reflection surface." },
  { construct: "GPUComputationRenderer", target: "", mapping: "none", note: "excluded (AD-11): GPU compute waits on SH-04 — public compute.* is WebGPU-only and pending A3D_QR_WEBGPU." },

  // ── Environment / PMREM (SH-07, AD-12) ───────────────────────────────
  { construct: "PMREMGenerator", target: "environments.capture", emit: "comment", engineImport: "environments", mapping: "approximate", note: "PMREMGenerator+fromScene collapses into environments.capture({ resolution, update, include }); fromEquirectangular+RGBELoader collapses into environments.hdri (SH-07, closed)." },
  { construct: "RoomEnvironment", target: "environments.neutral", engineImport: "environments", mapping: "approximate", note: "three's generated RoomEnvironment probe maps to environments.neutral() (code-generated room probe, background off by default)." },

  // ── Fog / atmosphere ─────────────────────────────────────────────────
  { construct: "Fog", target: "effects.fog", engineImport: "effects", mapping: "approximate", note: "three's linear Fog(color, near, far) maps to effects.fog({ color }) — Aura fog is density/height based; retune near/far into density." },
  { construct: "FogExp2", target: "effects.depthFog", engineImport: "effects", mapping: "approximate", note: "exp2 fog maps to effects.depthFog({ color, density }) or effects.fog with exp2 mode." },

  // ── Instancing / batching ────────────────────────────────────────────
  { construct: "InstancedMesh", target: "instances.box", engineImport: "instances", mapping: "approximate", note: "InstancedMesh maps to instances.<shape matching the geometry>({ transforms }); the per-instance setMatrixAt/setColorAt handle ships as instances.mesh (SG-01)." },
  { construct: "BatchedMesh", target: "batched.mesh", emit: "comment", engineImport: "batched", mapping: "approximate", note: "batched.mesh({ maxInstances, maxVertices, geometries }) is public (SG-02) — addGeometry packs each input; setMatrixAt/setColorAt write the dense store." },
  { construct: "InstancedBufferGeometry", target: "instances", emit: "comment", engineImport: "instances", mapping: "approximate", note: "instances.mesh exposes live per-instance writes (SG-01) — instanceMatrix/instanceColor buffer views + setMatrixAt/setColorAt on the real GPU path; arbitrary custom instanced attributes still have no slot." },

  // ── Lines / points / sprites ─────────────────────────────────────────
  { construct: "Line", target: "lines.line", emit: "comment", engineImport: "lines", mapping: "approximate", note: "lines.line({ positions }) is public (SG-06) — a polyline node; per-point colors and material options ride the spec." },
  { construct: "LineLoop", target: "lines.loop", emit: "comment", engineImport: "lines", mapping: "approximate", note: "lines.loop({ positions }) is public (SG-06) — a closed polyline node." },
  { construct: "LineSegments", target: "lines.segments", emit: "comment", engineImport: "lines", mapping: "approximate", note: "lines.segments({ positions }) is public (SG-06) — segment pairs; fat/dashed variants via lines.fat (AD-08)." },
  { construct: "Points", target: "points", emit: "comment", engineImport: "points", mapping: "approximate", note: "points({ positions, colors?, size, sizeAttenuation, map, alphaTest, transparent }) is public (SG-07)." },
  { construct: "Sprite", target: "sprites", emit: "comment", engineImport: "sprites", mapping: "approximate", note: "sprites.sprite({ map, center, rotation, sizeAttenuation, color }) is public (SG-08) — a camera-facing billboard." },

  // ── Math (SM) ────────────────────────────────────────────────────────
  { construct: "Vector2", target: "Vector2", emit: "new", engineImport: "Vector2", engineImportFrom: mathSubpath, mapping: "approximate", note: "@aura3d/engine/math Vector2 exists; method set is thinner than three's." },
  { construct: "Vector3", target: "[x, y, z]", mapping: "approximate", note: "Vector3 maps to AuraVec3 tuples in node specs; the Vector3 class also exists on @aura3d/engine/math when you need methods." },
  { construct: "Vector4", target: "Vector4", emit: "new", engineImport: "Vector4", engineImportFrom: mathSubpath, mapping: "approximate", note: "@aura3d/engine/math Vector4 exists; method set is thinner than three's." },
  { construct: "Quaternion", target: "Quaternion", emit: "new", engineImport: "Quaternion", engineImportFrom: mathSubpath, mapping: "approximate", note: "@aura3d/engine/math Quaternion exists; node specs accept quaternions via the quaternion field." },
  { construct: "Euler", target: "rotation", mapping: "approximate", note: "Euler('XYZ') order maps to rotation: [x, y, z] on the node builder; non-XYZ orders need quaternion composition — flagged in TODO." },
  { construct: "Matrix3", target: "Matrix3", emit: "new", engineImport: "Matrix3", engineImportFrom: mathSubpath, mapping: "approximate", note: "@aura3d/engine/math Matrix3 exists — getNormalMatrix/invert/transpose ship (SM-01); node transforms take TRS tuples instead of matrices." },
  { construct: "Matrix4", target: "Matrix4", emit: "new", engineImport: "Matrix4", engineImportFrom: mathSubpath, mapping: "approximate", note: "@aura3d/engine/math Matrix4 exists; node transforms take TRS tuples instead of matrices." },
  { construct: "Box3", target: "Box3", emit: "new", engineImport: "Box3", engineImportFrom: mathSubpath, mapping: "approximate", note: "@aura3d/engine/math Box3 exists — expandBy*/intersects*/contains*/getBoundingSphere ship (SM-01); three's setFromObject-style APIs surface as expandByObject over bounds providers." },
  { construct: "Sphere", target: "Sphere", emit: "new", engineImport: "Sphere", engineImportFrom: mathSubpath, mapping: "approximate", note: "@aura3d/engine/math Sphere exists — contains/intersects/union/getBoundingBox ship (SM-01)." },
  { construct: "Plane", target: "Plane", emit: "new", engineImport: "Plane", engineImportFrom: mathSubpath, mapping: "approximate", note: "@aura3d/engine/math Plane exists — distanceTo*/projectPoint/intersect* ship (SM-01); misses return undefined rather than null." },
  { construct: "Ray", target: "Ray", emit: "new", engineImport: "Ray", engineImportFrom: mathSubpath, mapping: "approximate", note: "@aura3d/engine/math Ray exists — intersectSphere/intersectPlane/intersectBox/intersectTriangle + distanceTo* ship (SM-01); misses return undefined rather than null." },
  { construct: "Frustum", target: "Frustum", emit: "new", engineImport: "Frustum", engineImportFrom: mathSubpath, mapping: "approximate", note: "@aura3d/engine/math Frustum exists — containsPoint/intersectsSphere/intersectsBox/intersectsBoundingSphere ship (SM-01)." },
  { construct: "Color", target: "#rrggbb", mapping: "approximate", note: "THREE.Color maps to hex strings or [r,g,b] arrays in material/light options." },
  { construct: "Spherical", target: "Spherical", emit: "comment", engineImportFrom: mathSubpath, engineImport: "Spherical", mapping: "exact", note: "@aura3d/engine/math exports Spherical — radius/phi/theta with setFromCartesianCoords/makeSafe (SM-01)." },
  { construct: "Cylindrical", target: "Cylindrical", emit: "comment", engineImportFrom: mathSubpath, engineImport: "Cylindrical", mapping: "exact", note: "@aura3d/engine/math exports Cylindrical — radius/theta/y with setFromCartesianCoords (SM-01)." },
  { construct: "Line3", target: "Line3", emit: "comment", engineImportFrom: mathSubpath, engineImport: "Line3", mapping: "exact", note: "@aura3d/engine/math exports Line3 — start/end with closestPointToPoint/delta/at (SM-01)." },
  { construct: "Triangle", target: "Triangle", emit: "comment", engineImportFrom: mathSubpath, engineImport: "Triangle", mapping: "exact", note: "@aura3d/engine/math exports Triangle — a/b/c with getArea/getBarycoord/getNormal/intersectsBox (SM-01)." },
  { construct: "MathUtils", target: "MathUtils", emit: "comment", engineImportFrom: mathSubpath, engineImport: "MathUtils", mapping: "exact", note: "@aura3d/engine/math exports the MathUtils namespace — degToRad/damp/mapLinear/seededRandom/generateUUID/… (SM-04)." },
  { construct: "SphericalHarmonics3", target: "SphericalHarmonics3", emit: "comment", engineImportFrom: mathSubpath, engineImport: "SphericalHarmonics3", mapping: "exact", note: "@aura3d/engine/math exports SphericalHarmonics3 — getBasisAt/getIrradianceAt/lerp over the 9 coefficients (SM-04)." },
  { construct: "Octree", target: "Octree", emit: "comment", engineImportFrom: mathSubpath, engineImport: "Octree", mapping: "exact", note: "@aura3d/engine/math exports Octree — fromTriangles plus capsuleIntersect/sphereIntersect/rayIntersect sweeps (AD-14)." },
  { construct: "ConvexGeometry", target: "ConvexHull", emit: "comment", engineImportFrom: mathSubpath, engineImport: "ConvexHull", mapping: "approximate", note: "ConvexHull ships on @aura3d/engine/math (AD-07) — setFromPoints computes the hull; wrap the result in geometry.custom for a renderable node." },

  // ── Curves (SM-02) ───────────────────────────────────────────────────
  { construct: "CatmullRomCurve3", target: "CatmullRomCurve3", emit: "comment", engineImportFrom: mathSubpath, engineImport: "CatmullRomCurve3", mapping: "exact", note: "@aura3d/engine/math exports CatmullRomCurve3 — a 1:1 port (points, closed, curveType, tension); L3 delivered the curve family via the math barrel — there is no engine-root curve.* namespace." },
  { construct: "CubicBezierCurve3", target: "CubicBezierCurve3", emit: "comment", engineImportFrom: mathSubpath, engineImport: "CubicBezierCurve3", mapping: "exact", note: "@aura3d/engine/math exports CubicBezierCurve3 (v0, v1, v2, v3) — a 1:1 port (SM-02)." },
  { construct: "CubicBezierCurve", target: "CubicBezierCurve", emit: "comment", engineImportFrom: mathSubpath, engineImport: "CubicBezierCurve", mapping: "exact", note: "@aura3d/engine/math exports CubicBezierCurve (v0..v3 Vector2s) — a 1:1 port (SM-02)." },
  { construct: "QuadraticBezierCurve3", target: "QuadraticBezierCurve3", emit: "comment", engineImportFrom: mathSubpath, engineImport: "QuadraticBezierCurve3", mapping: "exact", note: "@aura3d/engine/math exports QuadraticBezierCurve3 (v0, v1, v2) — a 1:1 port (SM-02)." },
  { construct: "QuadraticBezierCurve", target: "QuadraticBezierCurve", emit: "comment", engineImportFrom: mathSubpath, engineImport: "QuadraticBezierCurve", mapping: "exact", note: "@aura3d/engine/math exports QuadraticBezierCurve (v0..v2 Vector2s) — a 1:1 port (SM-02)." },
  { construct: "LineCurve3", target: "LineCurve3", emit: "comment", engineImportFrom: mathSubpath, engineImport: "LineCurve3", mapping: "exact", note: "@aura3d/engine/math exports LineCurve3 (v1, v2) — a 1:1 port (SM-02)." },
  { construct: "LineCurve", target: "LineCurve", emit: "comment", engineImportFrom: mathSubpath, engineImport: "LineCurve", mapping: "exact", note: "@aura3d/engine/math exports LineCurve (v1, v2 Vector2s) — a 1:1 port (SM-02)." },
  { construct: "SplineCurve", target: "SplineCurve", emit: "comment", engineImportFrom: mathSubpath, engineImport: "SplineCurve", mapping: "exact", note: "@aura3d/engine/math exports SplineCurve (points) — a 1:1 port (SM-02)." },
  { construct: "EllipseCurve", target: "EllipseCurve", emit: "comment", engineImportFrom: mathSubpath, engineImport: "EllipseCurve", mapping: "exact", note: "@aura3d/engine/math exports EllipseCurve (aX, aY, xRadius, yRadius, aStartAngle, aEndAngle, aClockwise, aRotation) — a 1:1 port (SM-02)." },
  { construct: "ArcCurve", target: "ArcCurve", emit: "comment", engineImportFrom: mathSubpath, engineImport: "ArcCurve", mapping: "exact", note: "@aura3d/engine/math exports ArcCurve (aX, aY, aRadius, aStartAngle, aEndAngle, aClockwise) — a 1:1 port (SM-02)." },
  { construct: "CurvePath", target: "CurvePath", emit: "comment", engineImportFrom: mathSubpath, engineImport: "CurvePath", mapping: "exact", note: "@aura3d/engine/math exports CurvePath — chained curves with shared arc-length getPoint/getLength (SM-02)." },
  { construct: "Path", target: "Path", emit: "comment", engineImportFrom: mathSubpath, engineImport: "Path", mapping: "exact", note: "@aura3d/engine/math exports Path — moveTo/lineTo/quadraticCurveTo/bezierCurveTo/splineThru/arc/absarc/ellipse/absellipse (SM-02); consumed by primitives.shape/extrude." },
  { construct: "Shape", target: "Shape", emit: "comment", engineImportFrom: mathSubpath, engineImport: "Shape", mapping: "exact", note: "@aura3d/engine/math exports Shape — Path with holes + extractPoints (SM-02); consumed by primitives.shape/extrude." },

  // ── Runtime / cameras / render targets ───────────────────────────────
  { construct: "Clock", target: "Clock", emit: "comment", engineImport: "Clock", mapping: "exact", note: "Clock is public at the engine root (SR-06) — a three-parity port: getDelta/getElapsedTime/start/stop/running/elapsedTime/autoStart over the frame loop." },
  { construct: "Raycaster", target: "raycast", emit: "comment", engineImport: "raycast", mapping: "approximate", note: "raycast({ origin, direction } | { camera, ndc }, { targets, nodes, layers, near, far, firstHitOnly }) is public (SR-03) — raycastFirst returns the nearest hit; AABB targets today, mesh-exact via raycastMesh." },
  { construct: "Layers", target: "layers", emit: "comment", mapping: "pending", note: "reserved for a layers namespace — node specs take `layers` bitmasks, runtime handles expose AuraLayerMask (set/enable/disable/toggle/test), and raycast filters on layers (SR-04); the camera-side layer mask is not yet public." },
  { construct: "WebGLRenderTarget", target: "RenderTarget", emit: "comment", mapping: "approximate", note: "RenderTarget + renderer.render({ target }) are public (SH-06) on @aura3d/engine/renderer — device.createRenderTarget(descriptor) allocates (dimension/layers/depth/samples options)." },
  { construct: "WebGLCubeRenderTarget", target: "RenderTarget", emit: "comment", mapping: "approximate", note: "cube targets are public (SH-06): RenderTargetDescriptor dimension \"cube\" + Renderer.renderProbeFace — feeds cameras.cube envMap captures." },
  { construct: "WebGL3DRenderTarget", target: "RenderTarget", emit: "comment", mapping: "approximate", note: "volumetric targets ride RenderTargetDescriptor dimension \"2d-array\" + layers (SH-06); a distinct TEXTURE_3D dimension is not public." },
  { construct: "WebGLArrayRenderTarget", target: "RenderTarget", emit: "comment", mapping: "approximate", note: "2D-array targets are public (SH-06): RenderTargetDescriptor dimension \"2d-array\" + layers on @aura3d/engine/renderer." },
  { construct: "CubeCamera", target: "cameras.cube", emit: "comment", engineImport: "cameras", mapping: "approximate", note: "cameras.cube({ resolution, near, far, updateEvery, position }) is public (SC-01) — renders through Renderer.renderProbeFace; consume via material.*({ envMap: { cubeCamera: name } })." },
  { construct: "ArrayCamera", target: "cameras.array", emit: "comment", mapping: "pending", note: "reserved for cameras.array — multi-viewport array cameras are not yet public (needs viewport/scissor)." },
  { construct: "StereoCamera", target: "cameras.stereo", emit: "comment", mapping: "pending", note: "reserved for cameras.stereo — stereo cameras are not yet public (needs viewport/scissor)." },

  // ── Helpers (SC-03) ──────────────────────────────────────────────────
  { construct: "AxesHelper", target: "helpers.axes", emit: "comment", engineImport: "helpers", mapping: "approximate", note: "helpers.axes({ size }) is public (SC-03) — every glyph is a real line-segment node." },
  { construct: "GridHelper", target: "helpers.grid", emit: "comment", engineImport: "helpers", mapping: "approximate", note: "helpers.grid({ size, divisions, colorCenterLine, colorGrid }) is public (SC-03)." },
  { construct: "PolarGridHelper", target: "helpers.polarGrid", emit: "comment", engineImport: "helpers", mapping: "approximate", note: "helpers.polarGrid is public (SC-03) — a polar line-segment grid node." },
  { construct: "BoxHelper", target: "helpers.box", emit: "comment", engineImport: "helpers", mapping: "approximate", note: "helpers.box is public (SC-03) — an object-bounds wireframe box." },
  { construct: "Box3Helper", target: "helpers.box3", emit: "comment", engineImport: "helpers", mapping: "approximate", note: "helpers.box3 is public (SC-03) — a Box3 wireframe node." },
  { construct: "CameraHelper", target: "helpers.camera", emit: "comment", engineImport: "helpers", mapping: "approximate", note: "helpers.camera is public (SC-03) — a camera-frustum glyph node." },
  { construct: "DirectionalLightHelper", target: "helpers.directionalLight", emit: "comment", engineImport: "helpers", mapping: "approximate", note: "helpers.directionalLight is public (SC-03) — light direction glyph node." },
  { construct: "HemisphereLightHelper", target: "helpers.light", emit: "comment", mapping: "pending", note: "reserved for helpers.light — not yet public; SC-03 shipped axes/grid/polarGrid/box/box3/arrow/camera/directionalLight/spotLight/pointLight/skeleton." },
  { construct: "PointLightHelper", target: "helpers.pointLight", emit: "comment", engineImport: "helpers", mapping: "approximate", note: "helpers.pointLight is public (SC-03) — point-light glyph node." },
  { construct: "SpotLightHelper", target: "helpers.spotLight", emit: "comment", engineImport: "helpers", mapping: "approximate", note: "helpers.spotLight is public (SC-03) — spot cone glyph node." },
  { construct: "SkeletonHelper", target: "helpers.skeleton", emit: "comment", engineImport: "helpers", mapping: "approximate", note: "helpers.skeleton is public (SC-03) — bone-wire glyph node." },
  { construct: "ArrowHelper", target: "helpers.arrow", emit: "comment", engineImport: "helpers", mapping: "approximate", note: "helpers.arrow is public (SC-03) — direction arrow glyph node." },
  { construct: "PlaneHelper", target: "helpers.plane", emit: "comment", mapping: "pending", note: "reserved for helpers.plane — not yet public; SC-03 shipped axes/grid/polarGrid/box/box3/arrow/camera/directionalLight/spotLight/pointLight/skeleton." },

  // ── Animation ────────────────────────────────────────────────────────
  { construct: "AnimationMixer", target: "AnimationController", emit: "comment", engineImport: "AnimationController", mapping: "approximate", note: "the mixer folds into AnimationController over the model asset; crossfade/retarget survive as controller methods (SA-01 mostly closed)." },
  { construct: "AnimationObjectGroup", target: "AnimationObjectGroup", emit: "comment", engineImport: "AnimationObjectGroup", engineImportFrom: animationSubpath, mapping: "approximate", note: "AnimationObjectGroup is public on @aura3d/engine/animation (SA-02) — same add/remove/uncache semantics as three." },
  { construct: "AnimationUtils", target: "AnimationUtils", emit: "comment", engineImport: "AnimationUtils", engineImportFrom: animationSubpath, mapping: "approximate", note: "AnimationUtils is public on @aura3d/engine/animation (SA-06) — subclip/optimize/merge/makeClipAdditive and helpers." },
  { construct: "KeyframeTrack", target: "AnimationTrack", emit: "comment", engineImport: "AnimationTrack", engineImportFrom: animationSubpath, mapping: "approximate", note: "three's KeyframeTrack base maps to AnimationTrack on @aura3d/engine/animation (SM-03); concrete tracks are the same-name factories below." },
  { construct: "NumberKeyframeTrack", target: "NumberKeyframeTrack", emit: "comment", engineImport: "NumberKeyframeTrack", engineImportFrom: animationSubpath, mapping: "approximate", note: "NumberKeyframeTrack is public on @aura3d/engine/animation (SM-03) — a same-name factory (target, times, values, interpolation) returning AnimationTrack<number>; drop the `new`." },
  { construct: "VectorKeyframeTrack", target: "VectorKeyframeTrack", emit: "comment", engineImport: "VectorKeyframeTrack", engineImportFrom: animationSubpath, mapping: "approximate", note: "VectorKeyframeTrack is public on @aura3d/engine/animation (SM-03) — a same-name factory returning AnimationTrack<Vec3>; drop the `new`." },
  { construct: "ColorKeyframeTrack", target: "ColorKeyframeTrack", emit: "comment", engineImport: "ColorKeyframeTrack", engineImportFrom: animationSubpath, mapping: "approximate", note: "ColorKeyframeTrack is public on @aura3d/engine/animation (SM-03) — a same-name factory returning AnimationTrack<Vec3>; drop the `new`." },
  { construct: "QuaternionKeyframeTrack", target: "QuaternionKeyframeTrack", emit: "comment", engineImport: "QuaternionKeyframeTrack", engineImportFrom: animationSubpath, mapping: "approximate", note: "QuaternionKeyframeTrack is public on @aura3d/engine/animation (SM-03) — a same-name factory returning AnimationTrack<Quat>; drop the `new`." },
  { construct: "BooleanKeyframeTrack", target: "BooleanKeyframeTrack", emit: "comment", engineImport: "BooleanKeyframeTrack", engineImportFrom: animationSubpath, mapping: "approximate", note: "BooleanKeyframeTrack is public on @aura3d/engine/animation (SM-03) — a same-name factory returning AnimationTrack<boolean>; drop the `new`." },
  { construct: "StringKeyframeTrack", target: "StringKeyframeTrack", emit: "comment", engineImport: "StringKeyframeTrack", engineImportFrom: animationSubpath, mapping: "approximate", note: "StringKeyframeTrack is public on @aura3d/engine/animation (SM-03) — a same-name factory returning AnimationTrack<string>; drop the `new`." },

];

const byConstruct = new Map<string, ThreeMapping>(THREE_TO_A3D_MAPPINGS.map((m) => [m.construct, m]));

export function threeMappingFor(construct: string): ThreeMapping | undefined {
  return byConstruct.get(construct);
}
