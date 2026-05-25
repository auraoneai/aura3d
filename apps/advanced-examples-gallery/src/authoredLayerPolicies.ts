import type { GLTFRenderResources } from "@galileo3d/assets";
import { Material, type RenderState, type UniformValue } from "@galileo3d/rendering";
import type { GLTFMaterialRenderStateOverride } from "../../../packages/assets/src/GLTFRenderResources";
import type { AuthoredAssetCandidateId } from "./authoredAssets";
import type { DemoId } from "./metadata";
import type { ControlValues } from "./sceneBuilderPrimitives";
import {
  applyProductConfiguratorRuntimeMaterialControls,
  applyProductConfiguratorOriginalCarRenderableMaterialQualityCorrections,
  applyProductConfiguratorOriginalCarMaterialQualityCorrections,
  createProductConfiguratorShowcaseLayout,
  explodedProductPartOffset,
  isProductConfiguratorOriginalProductAssetId,
  productConfiguratorImportedMaterialControlPlan,
  productConfiguratorFocusOffset,
  productConfiguratorMaterialOverrideTargetCount,
  productConfiguratorOriginalCarRenderableRenderState,
  productConfiguratorOriginalCarRenderStateOverrides
} from "./productConfiguratorPolicy";

export interface AuthoredInstanceConfig {
  readonly assetId: AuthoredAssetCandidateId;
  readonly label: string;
  readonly position: readonly [number, number, number];
  readonly scale: readonly [number, number, number];
  readonly targetHeight?: number;
  readonly yawRadians?: number;
  readonly turntable?: boolean;
  readonly turntableSpeedRadiansPerSecond?: number;
  readonly animate?: boolean;
  readonly clipByControl?: Readonly<Record<string, RegExp>>;
  readonly defaultClip?: RegExp;
  readonly materialVariantControl?: string;
  readonly defaultMaterialVariant?: string;
  readonly explodeOffset?: readonly [number, number, number];
  readonly explodeParts?: boolean;
  readonly includeNodePattern?: RegExp;
  readonly excludeNodePattern?: RegExp;
  readonly excludeNodeSemanticRoles?: readonly string[];
}

interface ImportedRenderableMaterialContext {
  readonly nodeName: string;
  readonly geometryKey: string;
  readonly materialKey: string;
  readonly sourceMaterialName: string;
}

export interface AuthoredMaterialControlPlan {
  readonly assetId: string;
  readonly controlKey?: string;
  readonly selectedVariant?: string;
  readonly targetCount: number;
  readonly uniqueMaterialCount: number;
  readonly source: "GLTFRenderResources.materialVariants" | "not-applicable";
  readonly targetMaterialKeys: readonly string[];
  readonly targetSourceMaterials: readonly string[];
  readonly limitation?: string;
}

const PRODUCT_CONFIGURATOR_SHOWCASE_LAYOUT = createProductConfiguratorShowcaseLayout();

function productShowcaseConfig(assetId: AuthoredAssetCandidateId): Omit<AuthoredInstanceConfig, "assetId" | "label" | "turntable" | "explodeParts"> {
  const item = PRODUCT_CONFIGURATOR_SHOWCASE_LAYOUT.items.find((entry) => entry.assetId === assetId);
  if (!item) throw new Error(`Missing Product Configurator showcase layout slot for ${assetId}.`);
  return {
    position: item.position,
    scale: item.scale,
    targetHeight: item.targetHeight,
    yawRadians: item.yawRadians,
    turntableSpeedRadiansPerSecond: item.turntableSpeedRadiansPerSecond,
    ...(item.materialVariantControl ? { materialVariantControl: item.materialVariantControl } : {}),
    ...(item.defaultMaterialVariant ? { defaultMaterialVariant: item.defaultMaterialVariant } : {})
  };
}

const ROUTE_ASSETS: Readonly<Record<DemoId, readonly AuthoredInstanceConfig[]>> = {
  "water-lab": [
    {
      assetId: "water-cinematic-marina-blender",
      label: "authored cinematic marina environment",
      position: [0, -0.84, -0.15],
      scale: [1, 1, 1],
      targetHeight: 4.25,
      yawRadians: 0
    },
    {
      assetId: "duck",
      label: "authored floating prop",
      position: [-2.1, -0.22, -0.95],
      scale: [1, 1, 1],
      targetHeight: 0.34,
      yawRadians: 0.42
    },
    {
      assetId: "duck",
      label: "authored foreground float",
      position: [1.72, -0.22, 1.35],
      scale: [1, 1, 1],
      targetHeight: 0.3,
      yawRadians: -0.74
    }
  ],
  "ocean-observatory": [
    {
      assetId: "ocean-observatory-cinematic-blender",
      label: "authored cinematic ocean observatory",
      position: [0, -0.72, 0.35],
      scale: [1, 1, 1],
      targetHeight: 4.3,
      yawRadians: 0
    },
    {
      assetId: "compare-transmission",
      label: "authored glass material station",
      position: [3.45, -0.42, 1.35],
      scale: [1, 1, 1],
      targetHeight: 0.48,
      yawRadians: -0.32,
      excludeNodePattern: /Sphere002_1/i
    }
  ],
  "reactor-post": [
    {
      assetId: "reactor-command-center-blender",
      label: "authored reactor command-center environment",
      position: [0, -0.74, 0.05],
      scale: [1, 1, 1],
      targetHeight: 4.6,
      yawRadians: -0.08,
      excludeNodePattern: /batched white hot reactor heart/i
    },
  ],
  "smart-city": [
    {
      assetId: "smart-city-district",
      label: "authored smart-city district west",
      position: [-2.62, -0.9, 1.82],
      scale: [1, 1, 1],
      targetHeight: 1.45,
      yawRadians: 0.38
    },
    {
      assetId: "smart-city-district",
      label: "authored smart-city district east",
      position: [2.42, -0.9, -1.65],
      scale: [1, 1, 1],
      targetHeight: 1.34,
      yawRadians: -0.58
    },
    {
      assetId: "littlest-tokyo",
      label: "authored Littlest Tokyo animated district",
      position: [-0.62, -0.82, -0.08],
      scale: [1, 1, 1],
      targetHeight: 5.55,
      yawRadians: -0.34,
      animate: true,
      defaultClip: /take|animation|default/i
    }
  ],
  "data-galaxy": [],
  "product-configurator": [
    {
      assetId: "car-concept",
      label: "original texture-backed concept vehicle hero",
      ...productShowcaseConfig("car-concept"),
      turntable: true,
      explodeParts: true,
      materialVariantControl: "carVariant"
    }
  ],
  "robotics-lab": [
    {
      assetId: "robotics-training-factory-blender",
      label: "authored robotics training stage environment",
      position: [0, -0.74, 0.12],
      scale: [1, 1, 1],
      targetHeight: 2.15,
      yawRadians: 0,
      excludeNodePattern: /overhead motion-capture rail|rear diagnostics status chip|rear status chip backplate|front toe alignment marker|rear sensor datum|side calibration dash|tool nest pocket|tracked foot contact puck|rear low sensor puck|rear overhead status chip|mocap marker|floor route stripe|rear floor timeline tick|rear floor state token|rear floor physical timeline rail|rear floor scrubber parked playhead|low rubber cable trough/i
    },
    {
      assetId: "soldier",
      label: "authored textured soldier animation",
      position: [-0.58, -0.62, 0.04],
      scale: [1, 1, 1],
      targetHeight: 2.02,
      yawRadians: 3.36,
      animate: true,
      defaultClip: /walk|run|idle/i,
      clipByControl: {
        idle: /^idle$/i,
        training: /^run$/i,
        inspect: /^walk$/i,
        handoff: /^walk$/i
      }
    },
    {
      assetId: "robot-expressive",
      label: "authored expressive robot animation",
      position: [0.9, -0.62, 0.16],
      scale: [1, 1, 1],
      targetHeight: 1.48,
      yawRadians: 2.88,
      animate: true,
      defaultClip: /idle|dance|walk/i,
      clipByControl: {
        idle: /^idle$/i,
        training: /^dance$/i,
        inspect: /^wave$/i,
        handoff: /^thumbsup$/i
      }
    },
    {
      assetId: "robot-expressive",
      label: "authored secondary robot operator animation",
      position: [1.58, -0.62, 0.96],
      scale: [1, 1, 1],
      targetHeight: 1.04,
      yawRadians: 2.7,
      animate: true,
      defaultClip: /walk|run|dance|idle/i,
      clipByControl: {
        idle: /^idle$/i,
        training: /walk/i,
        inspect: /^wave$/i,
        handoff: /^thumbsup$/i
      }
    }
  ],
  "physics-playground": [
    {
      assetId: "physics-robotics-testbed-blender",
      label: "authored robotics manipulation testbed",
      position: [0, -0.7, 0.1],
      scale: [1, 1, 1],
      targetHeight: 3.35,
      yawRadians: -0.18
    }
  ],
  "fog-cathedral": [
    {
      assetId: "fog-cathedral-blender",
      label: "authored fog cathedral environment",
      position: [0, -0.86, -0.2],
      scale: [1, 1, 1],
      targetHeight: 3.8,
      yawRadians: 0
    }
  ],
  "digital-twin": [
    {
      assetId: "digital-twin-factory-blender",
      label: "authored robotics factory digital twin floor",
      position: [0, -0.66, -0.15],
      scale: [1, 1, 1],
      targetHeight: 3.2,
      yawRadians: -0.18,
      excludeNodePattern: /overhead cable loop/i
    },
    {
      assetId: "cesium-milk-truck",
      label: "authored logistics vehicle",
      position: [-3.75, -0.7, 1.55],
      scale: [1, 1, 1],
      targetHeight: 0.44,
      yawRadians: 0.95
    },
    {
      assetId: "robot-expressive",
      label: "authored factory robot actor",
      position: [3.85, -0.62, 1.64],
      scale: [1, 1, 1],
      targetHeight: 0.92,
      yawRadians: -0.62,
      animate: true,
      defaultClip: /idle|dance|walk/i
    }
  ]
};

export function authoredRouteAssetConfigs(demoId: DemoId): readonly AuthoredInstanceConfig[] {
  return ROUTE_ASSETS[demoId] ?? [];
}

export function authoredAssetMaterialRenderStateOverrides(assetId: AuthoredAssetCandidateId): readonly GLTFMaterialRenderStateOverride[] | undefined {
  return isProductConfiguratorOriginalProductAssetId(assetId)
    ? productConfiguratorOriginalCarRenderStateOverrides()
    : undefined;
}

export function applyAuthoredAssetMaterialCorrections(
  assetId: AuthoredAssetCandidateId,
  materialVariant: string | undefined,
  materialLibrary: ReadonlyMap<string, Material>
): void {
  void materialVariant;
  if (isProductConfiguratorOriginalProductAssetId(assetId)) {
    applyProductConfiguratorOriginalCarMaterialQualityCorrections(materialLibrary);
  }

  if (assetId === "data-galaxy-core-blender") {
    for (const [key, material] of materialLibrary) {
      const name = `${key} ${material.name}`;
      if (/black ceramic data housing|deep graphite observatory deck/i.test(name)) {
        material.setParameter("u_baseColor", [0.012, 0.025, 0.045, 1]);
        material.setParameter("u_roughness", 0.72);
        material.setParameter("u_specularFactor", 0.08);
        material.setParameter("u_environmentSpecularIntensity", 0.08);
      }
      if (/brushed dark titanium/i.test(name)) {
        material.setParameter("u_baseColor", [0.06, 0.085, 0.11, 1]);
        material.setParameter("u_roughness", 0.58);
        material.setParameter("u_specularFactor", 0.14);
        material.setParameter("u_environmentSpecularIntensity", 0.12);
      }
      if (/translucent .* glass/i.test(name)) {
        material.setParameter("u_transmissionFactor", 0);
        material.setParameter("u_transmissionFallbackEnergy", 0);
        material.setParameter("u_roughness", 0.46);
        material.setParameter("u_specularFactor", 0.08);
        material.setParameter("u_environmentSpecularIntensity", 0.08);
      }
    }
  }

  if (assetId === "reactor-command-center-blender") {
    for (const [key, material] of materialLibrary) {
      const name = `${key} ${material.name}`;
      if (/cyan reactor emissive|contained reactor focal glow|amber reactor emissive|violet power conduit emissive/i.test(name)) {
        material.setParameter("u_emissiveStrength", 0.62);
        material.setParameter("u_roughness", 0.42);
        material.setParameter("u_specularFactor", 0.14);
      }
      if (/transparent reactor energy shell|amber transparent holo glass|soft blue diagnostic panel/i.test(name)) {
        material.setParameter("u_emissiveStrength", 0.36);
        material.setParameter("u_transmissionFactor", 0);
        material.setParameter("u_transmissionFallbackEnergy", 0);
        material.setParameter("u_roughness", 0.5);
        material.setParameter("u_specularFactor", 0.08);
      }
      if (/dark reactor wall alloy|black anodized machinery|brushed titanium rails/i.test(name)) {
        material.setParameter("u_roughness", 0.56);
        material.setParameter("u_specularFactor", 0.18);
        material.setParameter("u_environmentSpecularIntensity", 0.28);
      }
    }
  }
}

export function applyAuthoredAssetRuntimeMaterialControls(
  assetId: AuthoredAssetCandidateId,
  resources: GLTFRenderResources,
  controls: ControlValues
): void {
  applyProductConfiguratorRuntimeMaterialControls(assetId, resources, controls);
}

export function authoredAssetMaterialOverrideTargetCount(assetId: AuthoredAssetCandidateId, resources: GLTFRenderResources): number {
  return assetId === "product-configurator-studio-blender"
    ? productConfiguratorMaterialOverrideTargetCount(resources)
    : 0;
}

export function authoredImportedMaterialControlPlan(
  assetId: AuthoredAssetCandidateId,
  resources: GLTFRenderResources,
  options: {
    readonly controlKey?: string;
    readonly selectedVariant?: string;
  } = {}
): AuthoredMaterialControlPlan {
  if (!isProductConfiguratorOriginalProductAssetId(assetId)) {
    return {
      assetId,
      ...(options.controlKey ? { controlKey: options.controlKey } : {}),
      ...(options.selectedVariant ? { selectedVariant: options.selectedVariant } : {}),
      targetCount: 0,
      uniqueMaterialCount: 0,
      source: "not-applicable",
      targetMaterialKeys: [],
      targetSourceMaterials: []
    };
  }
  return productConfiguratorImportedMaterialControlPlan(assetId, resources, options);
}

export function authoredMaterialForImportedRenderable(
  materialInstanceCache: Map<string, Material>,
  assetId: AuthoredAssetCandidateId,
  sourceMaterial: Material,
  context: ImportedRenderableMaterialContext
): Material {
  if (!isProductConfiguratorOriginalProductAssetId(assetId)) return sourceMaterial;
  const cacheKey = `${context.materialKey}::${context.geometryKey}::${context.nodeName}`;
  const cached = materialInstanceCache.get(cacheKey);
  if (cached) return cached;

  const renderState = productConfiguratorOriginalCarRenderableRenderState(sourceMaterial.renderState, context);
  const material = cloneMaterialForRenderable(sourceMaterial, `${sourceMaterial.name}:${context.nodeName}`, renderState);
  applyProductConfiguratorOriginalCarRenderableMaterialQualityCorrections(material, context);
  materialInstanceCache.set(cacheKey, material);
  return material;
}

export function authoredAssetExplodeOffset(
  assetId: AuthoredAssetCandidateId,
  nodeNameOrPath: string | readonly string[]
): readonly [number, number, number] {
  return explodedProductPartOffset(assetId, nodeNameOrPath);
}

export function authoredAssetFocusOffset(
  assetId: AuthoredAssetCandidateId,
  nodeName: string,
  controls: ControlValues
): readonly [number, number, number] {
  return productConfiguratorFocusOffset(assetId, nodeName, controls);
}

function cloneMaterialForRenderable(source: Material, name: string, renderState: RenderState): Material {
  const parameters: Record<string, UniformValue> = {};
  for (const [key, value] of source.getParameters()) {
    parameters[key] = value;
  }
  return new Material({
    name,
    shaderKey: source.shaderKey,
    ...(source.shaderVariant ? { shaderVariant: source.shaderVariant } : {}),
    renderState,
    parameters,
    requiredAttributes: source.requiredAttributes,
    requiredUniforms: source.requiredUniforms,
    uniformSchema: source.uniformSchema
  });
}
