export interface PathAlias {
  readonly contextual: string;
  readonly legacy: string;
  readonly classification: "active-alias" | "archival";
  readonly reason: string;
}

export const ADVANCED_GALLERY_CONTEXTUAL_ROUTE = "/apps/advanced-examples-gallery/";
export const ADVANCED_GALLERY_LEGACY_ROUTE = "/apps/v9-advanced-examples-gallery/";

export const ADVANCED_GALLERY_CONTEXTUAL_REPORT_DIR = "tests/reports/advanced-examples-gallery";
export const ADVANCED_GALLERY_LEGACY_REPORT_DIR = "tests/reports/v9/advanced-examples-gallery";

function routeAlias(contextualSlug: string, legacySlug: string, reason: string): PathAlias {
  return {
    contextual: `/apps/${contextualSlug}/`,
    legacy: `/apps/${legacySlug}/`,
    classification: "active-alias",
    reason
  };
}

export const CONTEXTUAL_ROUTE_ALIASES: readonly PathAlias[] = [
  routeAlias("legacy-common", "v3-common", "Contextual compatibility route for older shared app assets; the versioned URL remains available for archival consumers."),
  routeAlias("three-compat-product-studio-pro", "v5-product-studio-pro", "Contextual route for the product studio pro app; the versioned URL remains a compatibility alias."),
  routeAlias("three-compat-asset-studio-pro", "v5-asset-studio-pro", "Contextual route for the asset studio pro app; the versioned URL remains a compatibility alias."),
  routeAlias("three-compat-material-studio-pro", "v5-material-studio-pro", "Contextual route for the material studio pro app; the versioned URL remains a compatibility alias."),
  routeAlias("three-compat-scene-studio-pro", "v5-scene-studio-pro", "Contextual route for the scene studio pro app; the versioned URL remains a compatibility alias."),
  routeAlias("three-compat-animation-studio-pro", "v5-animation-studio-pro", "Contextual route for the animation studio pro app; the versioned URL remains a compatibility alias."),
  routeAlias("three-compat-postprocess-studio-pro", "v5-postprocess-studio-pro", "Contextual route for the postprocess studio pro app; the versioned URL remains a compatibility alias."),
  routeAlias("three-compat-shader-lab-pro", "v5-shader-lab-pro", "Contextual route for the shader lab pro app; the versioned URL remains a compatibility alias."),
  routeAlias("three-compat-threejs-migration-lab", "v5-threejs-migration-lab", "Contextual route for the Three.js migration lab; the versioned URL remains a compatibility alias."),
  routeAlias("three-compat-large-scene-lab", "v5-large-scene-lab", "Contextual route for the older Three.js compatibility large-scene lab; the versioned URL remains a compatibility alias."),
  routeAlias("three-compat-controls-lab", "v5-controls-lab", "Contextual route for the controls lab; the versioned URL remains a compatibility alias."),
  routeAlias("architecture-viewer", "v6-architecture-viewer", "Contextual route for the production architecture viewer; the versioned URL remains a compatibility alias."),
  routeAlias("asset-inspector", "v6-asset-inspector", "Contextual route for the production asset inspector; the versioned URL remains a compatibility alias."),
  routeAlias("automotive-configurator", "v6-automotive-configurator", "Contextual route for the automotive configurator; the versioned URL remains a compatibility alias."),
  routeAlias("character-viewer", "v6-character-viewer", "Contextual route for the character viewer; the versioned URL remains a compatibility alias."),
  routeAlias("cinematic-postprocess", "v6-cinematic-postprocess", "Contextual route for cinematic postprocess proof; the versioned URL remains a compatibility alias."),
  routeAlias("large-scene-lab", "v6-large-scene-lab", "Contextual route for the production large-scene lab; the versioned URL remains a compatibility alias."),
  routeAlias("material-studio", "v6-material-studio", "Contextual route for the production material studio; the versioned URL remains a compatibility alias."),
  routeAlias("product-configurator", "v6-product-configurator", "Contextual route for the production product configurator; the versioned URL remains a compatibility alias."),
  routeAlias("threejs-parity-lab", "v6-threejs-parity-lab", "Contextual route for the Three.js parity lab; the versioned URL remains a compatibility alias."),
  routeAlias("webgpu-lab", "v6-webgpu-lab", "Contextual route for the WebGPU lab; the versioned URL remains a compatibility alias."),
  routeAlias("common", "v6-common", "Contextual shared app asset route for app CSS/runtime modules; the versioned URL remains a compatibility alias."),
  routeAlias("regression-animation-keyframes", "v7-animation-keyframes", "Contextual regression route for the older keyframes app; the current animation route uses the unqualified animation-keyframes slug."),
  routeAlias("example-parity-lab", "v7-example-parity-lab", "Contextual route for the example parity lab; the versioned URL remains a compatibility alias."),
  routeAlias("animation-keyframes", "v8-animation-keyframes", "Contextual route for current keyframe animation evidence; the versioned URL remains a compatibility alias."),
  routeAlias("flagship-viewer", "v8-flagship-viewer", "Contextual route for the flagship viewer; the versioned URL remains a compatibility alias."),
  routeAlias("skinning-blending", "v8-skinning-blending", "Contextual route for skinned clip blending evidence; the versioned URL remains a compatibility alias."),
  routeAlias("skinning-additive", "v8-skinning-additive", "Contextual route for additive skeletal animation evidence; the versioned URL remains a compatibility alias."),
  routeAlias("skinning-ik", "v8-skinning-ik", "Contextual route for IK evidence; the versioned URL remains a compatibility alias."),
  routeAlias("skinning-morph", "v8-skinning-morph", "Contextual route for morph target evidence; the versioned URL remains a compatibility alias."),
  routeAlias("animation-multiple", "v8-animation-multiple", "Contextual route for multiple animated agents; the versioned URL remains a compatibility alias."),
  routeAlias("animation-walk", "v8-animation-walk", "Contextual route for locomotion evidence; the versioned URL remains a compatibility alias."),
  routeAlias("decals", "v8-decals", "Contextual route for decal evidence; the versioned URL remains a compatibility alias."),
  routeAlias("camera", "v8-camera", "Contextual route for camera helper evidence; the versioned URL remains a compatibility alias."),
  routeAlias("camera-multiple-views", "v8-camera-multiple-views", "Contextual route for multiple camera views; the versioned URL remains a compatibility alias."),
  routeAlias("parallax-barrier", "v8-parallax-barrier", "Contextual route for parallax-barrier evidence; the versioned URL remains a compatibility alias."),
  routeAlias("stereo-effects", "v8-stereo-effects", "Contextual route for stereo camera evidence; the versioned URL remains a compatibility alias."),
  routeAlias("physics-showcase", "v8-physics-showcase", "Contextual route for physics route evidence; the versioned URL remains a compatibility alias."),
  routeAlias("loader-compression", "v8-loader-compression", "Contextual route for compression loader evidence; the versioned URL remains a compatibility alias."),
  routeAlias("loader-instancing", "v8-loader-instancing", "Contextual route for instancing loader evidence; the versioned URL remains a compatibility alias."),
  routeAlias("loader-material-extensions", "v8-loader-material-extensions", "Contextual route for material extension loader evidence; the versioned URL remains a compatibility alias."),
  routeAlias("loader-gltf-variants", "v8-loader-gltf-variants", "Contextual route for glTF material variants evidence; the versioned URL remains a compatibility alias."),
  routeAlias("loader-ktx2", "v8-loader-ktx2", "Contextual route for KTX2 loader evidence; the versioned URL remains a compatibility alias."),
  routeAlias("loader-obj", "v8-loader-obj", "Contextual route for OBJ loader evidence; the versioned URL remains a compatibility alias."),
  routeAlias("instancing-performance", "v8-instancing-performance", "Contextual route for instancing performance evidence; the versioned URL remains a compatibility alias."),
  routeAlias("texture-anisotropy", "v8-texture-anisotropy", "Contextual route for anisotropic texture evidence; the versioned URL remains a compatibility alias."),
  routeAlias("interactive-picking", "v8-interactive-picking", "Contextual route for interactive picking evidence; the versioned URL remains a compatibility alias."),
  routeAlias("controls-trackball", "v8-controls-trackball", "Contextual route for TrackballControls evidence; the versioned URL remains a compatibility alias."),
  routeAlias("controls-orbit", "v8-controls-orbit", "Contextual route for OrbitControls evidence; the versioned URL remains a compatibility alias."),
  routeAlias("controls-transform", "v8-controls-transform", "Contextual route for TransformControls evidence; the versioned URL remains a compatibility alias."),
  routeAlias("geometry-drawrange", "v8-geometry-drawrange", "Contextual route for drawRange evidence; the versioned URL remains a compatibility alias."),
  routeAlias("materials-transmission", "v8-materials-transmission", "Contextual route for transmission material evidence; the versioned URL remains a compatibility alias."),
  routeAlias("lights-spotlight", "v8-lights-spotlight", "Contextual route for spotlight evidence; the versioned URL remains a compatibility alias."),
  routeAlias("shadowmap-viewer", "v8-shadowmap-viewer", "Contextual route for shadow-map diagnostics; the versioned URL remains a compatibility alias."),
  routeAlias("lines-helpers", "v8-lines-helpers", "Contextual route for line/helper diagnostics; the versioned URL remains a compatibility alias."),
  routeAlias("webgpu-rtt", "v8-webgpu-rtt", "Contextual route for WebGPU render-target proof; the versioned URL remains a compatibility alias."),
  routeAlias("webgpu-materials", "v8-webgpu-materials", "Contextual route for WebGPU material proof; the versioned URL remains a compatibility alias."),
  routeAlias("webgpu-instance-uniform", "v8-webgpu-instance-uniform", "Contextual route for WebGPU instancing proof; the versioned URL remains a compatibility alias."),
  routeAlias("webgpu-compute", "v8-webgpu-compute", "Contextual route for WebGPU compute proof; the versioned URL remains a compatibility alias."),
  routeAlias("webxr-interactions", "v8-webxr-interactions", "Contextual route for WebXR interaction proof; the versioned URL remains a compatibility alias."),
  routeAlias("postprocessing-bloom", "v8-postprocessing-bloom", "Contextual route for bloom postprocess evidence; the versioned URL remains a compatibility alias."),
  routeAlias("postprocessing-depth-outline", "v8-postprocessing-depth-outline", "Contextual route for depth/outline postprocess evidence; the versioned URL remains a compatibility alias."),
  routeAlias("advanced-examples-gallery", "v9-advanced-examples-gallery", "Current public advanced gallery route moved to a contextual URL while the versioned URL remains a compatibility alias."),
  routeAlias("public-scene", "v9-public-scene", "Contextual route for the public scene demo; the versioned URL remains a compatibility alias.")
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
