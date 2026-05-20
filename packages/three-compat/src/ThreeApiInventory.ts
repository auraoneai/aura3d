export type ThreeApiCategory =
  | "core"
  | "math"
  | "cameras"
  | "lights"
  | "materials"
  | "geometries"
  | "textures"
  | "loaders"
  | "controls"
  | "postprocessing"
  | "animation"
  | "helpers"
  | "renderers"
  | "webxr"
  | "examples";

export interface ThreeApiInventoryEntry {
  readonly name: string;
  readonly category: ThreeApiCategory;
  readonly source: "three" | "three/examples";
  readonly importPath: string;
}

export interface ThreeApiInventory {
  readonly threeVersion: string;
  readonly generatedFromPackage: string;
  readonly entries: readonly ThreeApiInventoryEntry[];
  readonly categories: Readonly<Record<ThreeApiCategory, number>>;
}

const categoryMatchers: readonly [ThreeApiCategory, readonly RegExp[]][] = [
  ["cameras", [/Camera$/, /^PerspectiveCamera$/, /^OrthographicCamera$/, /^CubeCamera$/]],
  ["lights", [/Light$/, /^AmbientLight$/, /^DirectionalLight$/, /^PointLight$/, /^SpotLight$/, /^HemisphereLight$/, /^RectAreaLight/]],
  ["materials", [/Material$/, /^Mesh.*Material$/, /^Line.*Material$/, /^PointsMaterial$/, /^SpriteMaterial$/, /^ShaderMaterial$/]],
  ["geometries", [/Geometry$/, /^BufferGeometry$/, /^BoxGeometry$/, /^SphereGeometry$/, /^PlaneGeometry$/, /^CylinderGeometry$/, /^Torus/]],
  ["textures", [/Texture$/, /^DataTexture$/, /^CubeTexture$/, /^CanvasTexture$/, /^VideoTexture$/, /^FramebufferTexture$/]],
  ["animation", [/Animation/, /^KeyframeTrack$/, /^Skeleton$/, /^SkinnedMesh$/, /^Bone$/, /^PropertyBinding$/, /^PropertyMixer$/]],
  ["helpers", [/Helper$/, /^AxesHelper$/, /^GridHelper$/, /^CameraHelper$/]],
  ["renderers", [/Renderer$/, /^WebGL/, /^Render/]],
  ["webxr", [/XR/, /^WebXR/]],
  ["math", [/^Vector/, /^Matrix/, /^Quaternion$/, /^Euler$/, /^Color$/, /^Box/, /^Sphere$/, /^Ray$/, /^Plane$/, /^Frustum$/, /^MathUtils$/, /^Spherical$/, /^Cylindrical$/]],
  ["core", [/^Object3D$/, /^Scene$/, /^Mesh$/, /^Group$/, /^BufferAttribute$/, /^Instanced/, /^Raycaster$/, /^Layers$/, /^Clock$/, /^EventDispatcher$/]]
] as const;

export const REQUIRED_THREE_API_CATEGORIES: readonly ThreeApiCategory[] = [
  "core",
  "math",
  "cameras",
  "lights",
  "materials",
  "geometries",
  "textures",
  "loaders",
  "controls",
  "postprocessing",
  "animation",
  "helpers",
  "renderers",
  "webxr",
  "examples"
] as const;

export const THREE_EXAMPLES_INVENTORY: readonly ThreeApiInventoryEntry[] = [
  ...exampleEntries("loaders", [
    "GLTFLoader", "DRACOLoader", "KTX2Loader", "OBJLoader", "MTLLoader", "FBXLoader", "ColladaLoader", "PLYLoader", "STLLoader",
    "SVGLoader", "RGBELoader", "EXRLoader", "HDRCubeTextureLoader", "TextureLoader", "CubeTextureLoader", "LUTCubeLoader", "TGALoader", "VOXLoader"
  ]),
  ...exampleEntries("controls", [
    "OrbitControls", "MapControls", "TrackballControls", "FlyControls", "FirstPersonControls", "PointerLockControls", "DragControls",
    "TransformControls", "ArcballControls", "DeviceOrientationControls"
  ]),
  ...exampleEntries("postprocessing", [
    "EffectComposer", "RenderPass", "ShaderPass", "UnrealBloomPass", "SSAOPass", "TAARenderPass", "SMAAPass", "FXAAShader", "BokehPass",
    "OutlinePass", "FilmPass", "AfterimagePass", "GlitchPass", "DotScreenPass", "LUTPass"
  ]),
  ...exampleEntries("webxr", [
    "VRButton",
    "ARButton",
    "XRButton",
    "XRControllerModelFactory",
    "XRHandModelFactory",
    "OculusHandModel",
    "XRPlanes",
    "WebXRManager"
  ]),
  ...exampleEntries("examples", [
    "webgl_animation_skinning_blending", "webgl_animation_keyframes", "webgl_loader_gltf", "webgl_loader_obj_mtl",
    "webgl_materials_physical_clearcoat", "webgl_materials_envmaps_hdr", "webgl_postprocessing_unreal_bloom", "webgl_postprocessing_dof",
    "webgl_instancing_performance", "webgl_interactive_raycasting_points", "webgl_geometry_terrain", "webgl_shaders_ocean",
    "webgl_points_sprites", "webgl_lines_fat", "webgl_morphtargets", "webgl_shadowmap_pcss", "webgl_lights_rectarealight",
    "webgl_clipping", "webgl_multiple_rendertargets", "webgl2_materials_texture3d", "webgl2_multisampled_renderbuffers",
    "webxr_vr_ballshooter", "webxr_ar_cones"
  ])
] as const;

export function buildThreeApiInventory(threeVersion: string, threeExportNames: readonly string[]): ThreeApiInventory {
  const entries = [
    ...[...threeExportNames].sort().map((name: string) => ({
      name,
      category: categorizeThreeExport(name),
      source: "three" as const,
      importPath: "three"
    })),
    ...THREE_EXAMPLES_INVENTORY
  ];
  const categories = Object.fromEntries(REQUIRED_THREE_API_CATEGORIES.map((category) => [
    category,
    entries.filter((entry) => entry.category === category).length
  ])) as Readonly<Record<ThreeApiCategory, number>>;
  return {
    threeVersion,
    generatedFromPackage: "three",
    entries,
    categories
  };
}

export function categorizeThreeExport(name: string): ThreeApiCategory {
  for (const [category, matchers] of categoryMatchers) {
    if (matchers.some((matcher) => matcher.test(name))) return category;
  }
  return "core";
}

function exampleEntries(category: ThreeApiCategory, names: readonly string[]): ThreeApiInventoryEntry[] {
  return names.map((name) => ({
    name,
    category,
    source: "three/examples",
    importPath: `three/examples/jsm/${category}/${name}.js`
  }));
}
