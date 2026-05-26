export interface PathAlias {
  readonly contextual: string;
  readonly legacy: string;
  readonly classification: "active-alias" | "archival";
  readonly reason: string;
}

export const ADVANCED_GALLERY_CONTEXTUAL_ROUTE = "/apps/advanced-examples-gallery/";
export const ADVANCED_GALLERY_LEGACY_ROUTE = "/apps/threejs-parity-advanced-examples-gallery/";

export const ADVANCED_GALLERY_CONTEXTUAL_REPORT_DIR = "tests/reports/advanced-examples-gallery";
export const ADVANCED_GALLERY_LEGACY_REPORT_DIR = "tests/reports/threejs-parity/advanced-examples-gallery";

function routeAlias(contextualSlug: string, legacySlug: string, reason: string): PathAlias {
  return {
    contextual: `/apps/${contextualSlug}/`,
    legacy: `/apps/${legacySlug}/`,
    classification: "active-alias",
    reason
  };
}

export const CONTEXTUAL_ROUTE_ALIASES: readonly PathAlias[] = [
  routeAlias("legacy-common", "foundation-common", "Contextual compatibility route for older shared app assets; the versioned URL remains available for archival consumers."),
  routeAlias("three-compat-product-studio-pro", "three-compat-product-studio-pro", "Contextual route for the product studio pro app; the versioned URL remains a compatibility alias."),
  routeAlias("three-compat-asset-studio-pro", "three-compat-asset-studio-pro", "Contextual route for the asset studio pro app; the versioned URL remains a compatibility alias."),
  routeAlias("three-compat-material-studio-pro", "three-compat-material-studio-pro", "Contextual route for the material studio pro app; the versioned URL remains a compatibility alias."),
  routeAlias("three-compat-scene-studio-pro", "three-compat-scene-studio-pro", "Contextual route for the scene studio pro app; the versioned URL remains a compatibility alias."),
  routeAlias("three-compat-animation-studio-pro", "three-compat-animation-studio-pro", "Contextual route for the animation studio pro app; the versioned URL remains a compatibility alias."),
  routeAlias("three-compat-postprocess-studio-pro", "three-compat-postprocess-studio-pro", "Contextual route for the postprocess studio pro app; the versioned URL remains a compatibility alias."),
  routeAlias("three-compat-shader-lab-pro", "three-compat-shader-lab-pro", "Contextual route for the shader lab pro app; the versioned URL remains a compatibility alias."),
  routeAlias("three-compat-threejs-migration-lab", "three-compat-threejs-migration-lab", "Contextual route for the Three.js migration lab; the versioned URL remains a compatibility alias."),
  routeAlias("three-compat-large-scene-lab", "three-compat-large-scene-lab", "Contextual route for the older Three.js compatibility large-scene lab; the versioned URL remains a compatibility alias."),
  routeAlias("three-compat-controls-lab", "three-compat-controls-lab", "Contextual route for the controls lab; the versioned URL remains a compatibility alias."),
  routeAlias("architecture-viewer", "production-architecture-viewer", "Contextual route for the production architecture viewer; the versioned URL remains a compatibility alias."),
  routeAlias("asset-inspector", "production-asset-inspector", "Contextual route for the production asset inspector; the versioned URL remains a compatibility alias."),
  routeAlias("automotive-configurator", "production-automotive-configurator", "Contextual route for the automotive configurator; the versioned URL remains a compatibility alias."),
  routeAlias("character-viewer", "production-character-viewer", "Contextual route for the character viewer; the versioned URL remains a compatibility alias."),
  routeAlias("cinematic-postprocess", "production-cinematic-postprocess", "Contextual route for cinematic postprocess proof; the versioned URL remains a compatibility alias."),
  routeAlias("large-scene-lab", "production-large-scene-lab", "Contextual route for the production large-scene lab; the versioned URL remains a compatibility alias."),
  routeAlias("material-studio", "production-material-studio", "Contextual route for the production material studio; the versioned URL remains a compatibility alias."),
  routeAlias("product-configurator", "production-product-configurator", "Contextual route for the production product configurator; the versioned URL remains a compatibility alias."),
  routeAlias("threejs-parity-lab", "production-threejs-parity-lab", "Contextual route for the Three.js parity lab; the versioned URL remains a compatibility alias."),
  routeAlias("webgpu-lab", "production-webgpu-lab", "Contextual route for the WebGPU lab; the versioned URL remains a compatibility alias."),
  routeAlias("common", "production-common", "Contextual shared app asset route for app CSS/runtime modules; the versioned URL remains a compatibility alias."),
  routeAlias("regression-animation-keyframes", "runtime-parity-animation-keyframes", "Contextual regression route for the older keyframes app; the current animation route uses the unqualified animation-keyframes slug."),
  routeAlias("example-parity-lab", "runtime-parity-example-parity-lab", "Contextual route for the example parity lab; the versioned URL remains a compatibility alias."),
  routeAlias("animation-keyframes", "current-routes-animation-keyframes", "Contextual route for current keyframe animation evidence; the versioned URL remains a compatibility alias."),
  routeAlias("flagship-viewer", "current-routes-flagship-viewer", "Contextual route for the flagship viewer; the versioned URL remains a compatibility alias."),
  routeAlias("skinning-blending", "current-routes-skinning-blending", "Contextual route for skinned clip blending evidence; the versioned URL remains a compatibility alias."),
  routeAlias("skinning-additive", "current-routes-skinning-additive", "Contextual route for additive skeletal animation evidence; the versioned URL remains a compatibility alias."),
  routeAlias("skinning-ik", "current-routes-skinning-ik", "Contextual route for IK evidence; the versioned URL remains a compatibility alias."),
  routeAlias("skinning-morph", "current-routes-skinning-morph", "Contextual route for morph target evidence; the versioned URL remains a compatibility alias."),
  routeAlias("animation-multiple", "current-routes-animation-multiple", "Contextual route for multiple animated agents; the versioned URL remains a compatibility alias."),
  routeAlias("animation-walk", "current-routes-animation-walk", "Contextual route for locomotion evidence; the versioned URL remains a compatibility alias."),
  routeAlias("decals", "current-routes-decals", "Contextual route for decal evidence; the versioned URL remains a compatibility alias."),
  routeAlias("camera", "current-routes-camera", "Contextual route for camera helper evidence; the versioned URL remains a compatibility alias."),
  routeAlias("camera-multiple-views", "current-routes-camera-multiple-views", "Contextual route for multiple camera views; the versioned URL remains a compatibility alias."),
  routeAlias("parallax-barrier", "current-routes-parallax-barrier", "Contextual route for parallax-barrier evidence; the versioned URL remains a compatibility alias."),
  routeAlias("stereo-effects", "current-routes-stereo-effects", "Contextual route for stereo camera evidence; the versioned URL remains a compatibility alias."),
  routeAlias("physics-showcase", "current-routes-physics-showcase", "Contextual route for physics route evidence; the versioned URL remains a compatibility alias."),
  routeAlias("loader-compression", "current-routes-loader-compression", "Contextual route for compression loader evidence; the versioned URL remains a compatibility alias."),
  routeAlias("loader-instancing", "current-routes-loader-instancing", "Contextual route for instancing loader evidence; the versioned URL remains a compatibility alias."),
  routeAlias("loader-material-extensions", "current-routes-loader-material-extensions", "Contextual route for material extension loader evidence; the versioned URL remains a compatibility alias."),
  routeAlias("loader-gltf-variants", "current-routes-loader-gltf-variants", "Contextual route for glTF material variants evidence; the versioned URL remains a compatibility alias."),
  routeAlias("loader-ktx2", "current-routes-loader-ktx2", "Contextual route for KTX2 loader evidence; the versioned URL remains a compatibility alias."),
  routeAlias("loader-obj", "current-routes-loader-obj", "Contextual route for OBJ loader evidence; the versioned URL remains a compatibility alias."),
  routeAlias("instancing-performance", "current-routes-instancing-performance", "Contextual route for instancing performance evidence; the versioned URL remains a compatibility alias."),
  routeAlias("texture-anisotropy", "current-routes-texture-anisotropy", "Contextual route for anisotropic texture evidence; the versioned URL remains a compatibility alias."),
  routeAlias("interactive-picking", "current-routes-interactive-picking", "Contextual route for interactive picking evidence; the versioned URL remains a compatibility alias."),
  routeAlias("controls-trackball", "current-routes-controls-trackball", "Contextual route for TrackballControls evidence; the versioned URL remains a compatibility alias."),
  routeAlias("controls-orbit", "current-routes-controls-orbit", "Contextual route for OrbitControls evidence; the versioned URL remains a compatibility alias."),
  routeAlias("controls-transform", "current-routes-controls-transform", "Contextual route for TransformControls evidence; the versioned URL remains a compatibility alias."),
  routeAlias("geometry-drawrange", "current-routes-geometry-drawrange", "Contextual route for drawRange evidence; the versioned URL remains a compatibility alias."),
  routeAlias("materials-transmission", "current-routes-materials-transmission", "Contextual route for transmission material evidence; the versioned URL remains a compatibility alias."),
  routeAlias("lights-spotlight", "current-routes-lights-spotlight", "Contextual route for spotlight evidence; the versioned URL remains a compatibility alias."),
  routeAlias("shadowmap-viewer", "current-routes-shadowmap-viewer", "Contextual route for shadow-map diagnostics; the versioned URL remains a compatibility alias."),
  routeAlias("lines-helpers", "current-routes-lines-helpers", "Contextual route for line/helper diagnostics; the versioned URL remains a compatibility alias."),
  routeAlias("webgpu-rtt", "current-routes-webgpu-rtt", "Contextual route for WebGPU render-target proof; the versioned URL remains a compatibility alias."),
  routeAlias("webgpu-materials", "current-routes-webgpu-materials", "Contextual route for WebGPU material proof; the versioned URL remains a compatibility alias."),
  routeAlias("webgpu-instance-uniform", "current-routes-webgpu-instance-uniform", "Contextual route for WebGPU instancing proof; the versioned URL remains a compatibility alias."),
  routeAlias("webgpu-compute", "current-routes-webgpu-compute", "Contextual route for WebGPU compute proof; the versioned URL remains a compatibility alias."),
  routeAlias("webxr-interactions", "current-routes-webxr-interactions", "Contextual route for WebXR interaction proof; the versioned URL remains a compatibility alias."),
  routeAlias("postprocessing-bloom", "current-routes-postprocessing-bloom", "Contextual route for bloom postprocess evidence; the versioned URL remains a compatibility alias."),
  routeAlias("postprocessing-depth-outline", "current-routes-postprocessing-depth-outline", "Contextual route for depth/outline postprocess evidence; the versioned URL remains a compatibility alias."),
  routeAlias("advanced-examples-gallery", "threejs-parity-advanced-examples-gallery", "Current public advanced gallery route moved to a contextual URL while the versioned URL remains a compatibility alias."),
  routeAlias("public-scene", "threejs-parity-public-scene", "Contextual route for the public scene demo; the versioned URL remains a compatibility alias.")
];

export const CONTEXTUAL_FIXTURE_ALIASES: readonly PathAlias[] = [
  {
    contextual: "/fixtures/advanced-gallery/assets/",
    legacy: "/fixtures/advanced-gallery/assets/",
    classification: "active-alias",
    reason: "Advanced gallery authored assets use contextual fixture URLs while the old fixture path remains fetchable."
  },
  {
    contextual: "/fixtures/advanced-gallery/environments/",
    legacy: "/fixtures/advanced-gallery/environments/",
    classification: "active-alias",
    reason: "Advanced gallery environment fixtures use contextual fixture URLs while the old fixture path remains fetchable."
  },
  {
    contextual: "/fixtures/threejs-parity/assets/",
    legacy: "/fixtures/threejs-parity/assets/",
    classification: "active-alias",
    reason: "Three.js parity fixtures use capability-based URLs while the old fixture path remains fetchable."
  },
  {
    contextual: "/fixtures/asset-corpus/",
    legacy: "/fixtures/asset-corpus/",
    classification: "active-alias",
    reason: "Production asset corpus fixtures use contextual URLs while the old fixture path remains fetchable."
  },
  {
    contextual: "/fixtures/environment-corpus/",
    legacy: "/fixtures/environment-corpus/",
    classification: "active-alias",
    reason: "Production environment corpus fixtures use contextual URLs while the old fixture path remains fetchable."
  }
];

export const CONTEXTUAL_REPORT_ALIASES: readonly PathAlias[] = [
  {
    contextual: ADVANCED_GALLERY_CONTEXTUAL_REPORT_DIR,
    legacy: ADVANCED_GALLERY_LEGACY_REPORT_DIR,
    classification: "active-alias",
    reason: "Advanced gallery report readers prefer the contextual evidence directory and fall back to the historical directory for old report sets."
  }
];

export function rewriteContextualPath(path: string, aliases: readonly PathAlias[]): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const match = aliases.find((alias) => {
    const contextualWithoutTrailingSlash = alias.contextual.replace(/\/$/, "");
    return normalized === alias.contextual
      || normalized === contextualWithoutTrailingSlash
      || normalized.startsWith(alias.contextual);
  });
  if (!match) return path;
  const contextualWithoutTrailingSlash = match.contextual.replace(/\/$/, "");
  const rewritten = normalized === contextualWithoutTrailingSlash
    ? match.legacy.replace(/\/$/, "")
    : `${match.legacy}${normalized.slice(match.contextual.length)}`;
  return path.startsWith("/") ? rewritten : rewritten.replace(/^\//, "");
}

export function rewriteLegacyPath(path: string, aliases: readonly PathAlias[]): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const match = aliases.find((alias) => {
    const legacyWithoutTrailingSlash = alias.legacy.replace(/\/$/, "");
    return normalized === alias.legacy
      || normalized === legacyWithoutTrailingSlash
      || normalized.startsWith(alias.legacy);
  });
  if (!match) return path;
  const legacyWithoutTrailingSlash = match.legacy.replace(/\/$/, "");
  const rewritten = normalized === legacyWithoutTrailingSlash
    ? match.contextual.replace(/\/$/, "")
    : `${match.contextual}${normalized.slice(match.legacy.length)}`;
  return path.startsWith("/") ? rewritten : rewritten.replace(/^\//, "");
}

export function legacyPathForContextualPath(path: string): string {
  return rewriteContextualPath(path, [
    ...CONTEXTUAL_ROUTE_ALIASES,
    ...CONTEXTUAL_FIXTURE_ALIASES,
    ...CONTEXTUAL_REPORT_ALIASES
  ]);
}

export function contextualPathForLegacyPath(path: string): string {
  return rewriteLegacyPath(path, [
    ...CONTEXTUAL_ROUTE_ALIASES,
    ...CONTEXTUAL_FIXTURE_ALIASES,
    ...CONTEXTUAL_REPORT_ALIASES
  ]);
}
