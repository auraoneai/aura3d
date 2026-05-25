import {
  TextureBinding,
  type EnvironmentBackgroundOptions,
  type EnvironmentBackgroundProjection,
  type EnvironmentLightingOptions,
  type RenderDeviceDiagnostics,
  type TextureDimension,
  type V6LoadedHdrEnvironment
} from "@galileo3d/rendering";

export const RENDERER_ENVIRONMENT_BACKGROUND_SOURCE = "loadV6HdrEnvironment -> Renderer.environmentBackground -> EnvironmentBackgroundPass" as const;
export const RENDERER_ENVIRONMENT_LIGHTING_SOURCE = "loadV6HdrEnvironment -> Renderer.environmentLighting -> ForwardPass.environmentCubeMapTexture" as const;

export type RendererEnvironmentBackgroundRouteId = "product-configurator" | "data-galaxy";

export interface RendererEnvironmentBackgroundDefinition {
  readonly routeId: RendererEnvironmentBackgroundRouteId;
  readonly projection: EnvironmentBackgroundProjection;
  readonly hdrUri: string;
  readonly environmentId: string;
  readonly environmentLabel: string;
  readonly lightingIntensity: number;
  readonly backgroundIntensity: number;
  readonly rotation: number;
  readonly visibleInDefaultShowcase: boolean;
  readonly visibleBackgroundUsage: "default-showcase" | "diagnostic-proof-only";
  readonly visibilityReason: string;
  readonly claimBoundary: string;
}

export interface RendererEnvironmentBackgroundEvidence {
  readonly source: typeof RENDERER_ENVIRONMENT_BACKGROUND_SOURCE;
  readonly routeId: RendererEnvironmentBackgroundRouteId;
  readonly rendererField: "source.environmentBackground";
  readonly passName: "environment-background";
  readonly projection: EnvironmentBackgroundProjection;
  readonly encoding: "linear";
  readonly outputColorSpace: "srgb";
  readonly textureDimension: TextureDimension;
  readonly textureLabel: string;
  readonly textureWidth: number;
  readonly textureHeight: number;
  readonly cubeFaceCount: number | null;
  readonly visibleInDefaultShowcase: boolean;
  readonly visibleBackgroundUsage: "default-showcase" | "diagnostic-proof-only";
  readonly visibilityReason: string;
  readonly lightingIntensity: number;
  readonly backgroundIntensity: number;
  readonly hdr: {
    readonly loader: "loadV6HdrEnvironment";
    readonly uri: string;
    readonly id: string;
    readonly label: string;
    readonly radianceWidth: number;
    readonly radianceHeight: number;
    readonly format: "rgbe-hdr";
    readonly realRadianceHdr: true;
    readonly environmentTextureFormat: string;
    readonly cubemapTextureFormat: string;
    readonly pmremMipCount: number;
  };
  readonly forwardOptions: EnvironmentBackgroundOptions;
  readonly rendererEvidence: readonly string[];
  readonly claimBoundary: string;
}

export interface RendererEnvironmentLightingEvidence {
  readonly source: typeof RENDERER_ENVIRONMENT_LIGHTING_SOURCE;
  readonly routeId: RendererEnvironmentBackgroundRouteId;
  readonly enabled: true;
  readonly rendererField: "source.environmentLighting";
  readonly forwardPassField: "ForwardPassOptions.environmentLighting";
  readonly textureDimension: "cube";
  readonly textureLabel: string;
  readonly textureWidth: number;
  readonly textureHeight: number;
  readonly cubeFaceCount: 6;
  readonly fallbackEquirectTextureDimension: "2d";
  readonly fallbackEquirectTextureLabel: string;
  readonly brdfLutTextureLabel: string;
  readonly environmentMapIntensity: number;
  readonly environmentMapSpecularIntensity: number;
  readonly environmentMapRotation: number;
  readonly environmentMapMipCount: number;
  readonly environmentMapEncoding: "linear";
  readonly nativeEnvironmentBindings: number;
  readonly uniformKeys: readonly string[];
  readonly textureBindingContract: "TextureBinding.expectedDimension=cube";
  readonly materialSchemaContract: "MaterialUniformKind.textureCube";
  readonly rendererEvidence: readonly string[];
  readonly claimBoundary: string;
}

const DEFINITIONS: Readonly<Record<RendererEnvironmentBackgroundRouteId, RendererEnvironmentBackgroundDefinition>> = {
  "product-configurator": {
    routeId: "product-configurator",
    projection: "equirect",
    hdrUri: "/fixtures/environment-corpus/hdri/studio_small_08_1k.hdr",
    environmentId: "v9-product-studio-small-08",
    environmentLabel: "Studio Small 08 HDR product lighting",
    lightingIntensity: 0.68,
    backgroundIntensity: 0.24,
    rotation: 0.18,
    visibleInDefaultShowcase: false,
    visibleBackgroundUsage: "diagnostic-proof-only",
    visibilityReason: "The Studio Small 08 HDRI is valid lighting evidence, but as an opaque visible background it washes out the product showcase and hides the authored dark studio backdrop.",
    claimBoundary: "Diagnostic equirectangular HDR background through Renderer.environmentBackground plus default HDR environment lighting. The default showcase uses this HDRI for lighting only. This does not prove EXR, physical sky, reflection probes, or full PMREM roughness parity."
  },
  "data-galaxy": {
    routeId: "data-galaxy",
    projection: "cubemap",
    hdrUri: "/fixtures/advanced-gallery/environments/hdri/data_galaxy_deep_space_1k.hdr",
    environmentId: "v9-data-galaxy-deep-space-cubemap",
    environmentLabel: "Generated Deep Space HDR cubemap lighting",
    lightingIntensity: 0.38,
    backgroundIntensity: 0.2,
    rotation: -0.18,
    visibleInDefaultShowcase: true,
    visibleBackgroundUsage: "default-showcase",
    visibilityReason: "The Data Galaxy route needs renderer-owned space lighting/background proof; the old Venice HDRI was a terrestrial diagnostic image and was visually wrong for the showcase.",
    claimBoundary: "Generated deterministic Radiance/RGBE deep-space HDR background through Renderer.environmentBackground plus default HDR environment lighting. This proves renderer-owned cubemap background binding for this route, but it does not prove dynamic cube cameras, volumetric space, reflection probes, EXR, or full PMREM roughness parity."
  }
};

export function getRendererEnvironmentBackgroundDefinition(routeId: string): RendererEnvironmentBackgroundDefinition | null {
  return Object.hasOwn(DEFINITIONS, routeId)
    ? DEFINITIONS[routeId as RendererEnvironmentBackgroundRouteId]
    : null;
}

export function createRendererEnvironmentBackgroundEvidence(
  definition: RendererEnvironmentBackgroundDefinition,
  environment: V6LoadedHdrEnvironment
): RendererEnvironmentBackgroundEvidence {
  const texture = definition.projection === "cubemap"
    ? environment.resources.environmentCubeTexture
    : environment.resources.environmentTexture;
  const bindingName = definition.projection === "cubemap"
    ? "u_environmentBackgroundCubeTexture"
    : "u_environmentBackgroundTexture";
  const cubeFaceCount = definition.projection === "cubemap"
    ? texture.cubeFaces.length
    : null;
  return {
    source: RENDERER_ENVIRONMENT_BACKGROUND_SOURCE,
    routeId: definition.routeId,
    rendererField: "source.environmentBackground",
    passName: "environment-background",
    projection: definition.projection,
    encoding: "linear",
    outputColorSpace: "srgb",
    textureDimension: texture.dimension,
    textureLabel: texture.label,
    textureWidth: texture.width,
    textureHeight: texture.height,
    cubeFaceCount,
    visibleInDefaultShowcase: definition.visibleInDefaultShowcase,
    visibleBackgroundUsage: definition.visibleBackgroundUsage,
    visibilityReason: definition.visibilityReason,
    lightingIntensity: definition.lightingIntensity,
    backgroundIntensity: definition.backgroundIntensity,
    hdr: {
      loader: "loadV6HdrEnvironment",
      uri: definition.hdrUri,
      id: environment.id,
      label: environment.label,
      radianceWidth: environment.radiance.width,
      radianceHeight: environment.radiance.height,
      format: "rgbe-hdr",
      realRadianceHdr: true,
      environmentTextureFormat: environment.resources.environmentTexture.format,
      cubemapTextureFormat: environment.resources.environmentCubeTexture.format,
      pmremMipCount: environment.pipeline.cubemapPMREM.mipCount
    },
    forwardOptions: {
      projection: definition.projection,
      texture: new TextureBinding({
        name: bindingName,
        texture,
        required: true,
        expectedColorSpace: "linear"
      }),
      encoding: "linear",
      intensity: definition.backgroundIntensity,
      rotation: definition.rotation,
      outputColorSpace: "srgb"
    },
    rendererEvidence: [
      RENDERER_ENVIRONMENT_BACKGROUND_SOURCE,
      "loadV6HdrEnvironment decoded a real Radiance/RGBE .hdr fixture into V6 renderer resources.",
      "Renderer.render receives source.environmentBackground only during explicit diagnostic proof capture when the route marks the HDRI as diagnostic-only.",
      "EnvironmentBackgroundPass renders before ForwardPass so scene geometry draws over the background."
    ],
    claimBoundary: definition.claimBoundary
  };
}

export function createRendererEnvironmentLightingEvidence(
  definition: RendererEnvironmentBackgroundDefinition,
  environment: V6LoadedHdrEnvironment,
  diagnostics: RenderDeviceDiagnostics,
  activeLighting: EnvironmentLightingOptions = environment.lighting
): RendererEnvironmentLightingEvidence {
  const cubeBinding = environment.lighting.environmentCubeMapTexture;
  const equirectBinding = environment.lighting.environmentMapTexture;
  const brdfBinding = environment.lighting.environmentBrdfLutTexture;
  const cubeTexture = cubeBinding?.texture;
  const equirectTexture = equirectBinding?.texture;
  const brdfTexture = brdfBinding?.texture;
  if (!cubeTexture || cubeTexture.dimension !== "cube" || cubeTexture.cubeFaces.length !== 6) {
    throw new Error(`Renderer environment lighting evidence requires a six-face cube texture for ${definition.routeId}.`);
  }
  if (!equirectTexture || equirectTexture.dimension !== "2d") {
    throw new Error(`Renderer environment lighting evidence requires a 2D fallback/equirect texture for ${definition.routeId}.`);
  }
  if (!brdfTexture) {
    throw new Error(`Renderer environment lighting evidence requires a BRDF LUT texture for ${definition.routeId}.`);
  }
  return {
    source: RENDERER_ENVIRONMENT_LIGHTING_SOURCE,
    routeId: definition.routeId,
    enabled: true,
    rendererField: "source.environmentLighting",
    forwardPassField: "ForwardPassOptions.environmentLighting",
    textureDimension: "cube",
    textureLabel: cubeTexture.label,
    textureWidth: cubeTexture.width,
    textureHeight: cubeTexture.height,
    cubeFaceCount: 6,
    fallbackEquirectTextureDimension: "2d",
    fallbackEquirectTextureLabel: equirectTexture.label,
    brdfLutTextureLabel: brdfTexture.label,
    environmentMapIntensity: activeLighting.environmentMapIntensity ?? environment.lighting.environmentMapIntensity ?? 0,
    environmentMapSpecularIntensity: activeLighting.environmentMapSpecularIntensity ?? environment.lighting.environmentMapSpecularIntensity ?? 0,
    environmentMapRotation: activeLighting.environmentMapRotation ?? environment.lighting.environmentMapRotation ?? 0,
    environmentMapMipCount: activeLighting.environmentMapMipCount ?? environment.lighting.environmentMapMipCount ?? cubeTexture.cubeFaces[0]?.mipLevels.length ?? 1,
    environmentMapEncoding: "linear",
    nativeEnvironmentBindings: diagnostics.nativeEnvironmentBindings ?? 0,
    uniformKeys: [
      "u_environmentMapTexture",
      "u_environmentCubeMapTexture",
      "u_environmentMapTextureEnabled",
      "u_environmentCubeMapTextureEnabled",
      "u_environmentMapTextureIntensity",
      "u_environmentMapTextureSpecularIntensity",
      "u_environmentMapTextureRotation",
      "u_environmentMapTextureMipCount",
      "u_environmentMapTextureEncoding",
      "u_environmentBrdfLutTexture",
      "u_environmentBrdfLutEnabled"
    ],
    textureBindingContract: "TextureBinding.expectedDimension=cube",
    materialSchemaContract: "MaterialUniformKind.textureCube",
    rendererEvidence: [
      RENDERER_ENVIRONMENT_LIGHTING_SOURCE,
      "loadV6HdrEnvironment returns V6 renderer EnvironmentLightingOptions with environmentCubeMapTexture.",
      "Renderer.render receives source.environmentLighting for this route.",
      "ForwardPass accepts cube-only sampled environment lighting and binds u_environmentCubeMapTexture for reflected/specular environment response.",
      "TextureBinding validates cube texture dimensions before renderer binding."
    ],
    claimBoundary: "This proves static cube PMREM/sampled environment lighting is bound into the renderer path for this route. It does not prove live cube cameras, planar mirrors, SSR parity, scene-space refraction, or Three.js PMREM visual parity."
  };
}
