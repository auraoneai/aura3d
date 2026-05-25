import {
  Geometry,
  Material,
  PBRMaterial,
  ShaderLibrary,
  TextureBinding,
  UnlitMaterial,
  createDefaultShaderLibrary,
  computePerspectiveCameraFrame,
  type CameraFrameBounds,
  type EnvironmentLightingOptions,
  type RenderItem,
  type RenderSource
} from "/packages/rendering/src/index.js";
import { composeMat4, multiplyMat4, transformPoint, type Mat4 } from "/packages/scene/src/index.js";

export interface V6StagedScene {
  readonly source: RenderSource;
  readonly camera: {
    readonly viewProjectionMatrix: readonly number[];
    readonly viewMatrix: readonly number[];
    readonly projectionMatrix: readonly number[];
  };
}

interface V6ComposablePipeline {
  readonly source: RenderSource;
  readonly resources: {
    readonly bounds: CameraFrameBounds;
    readonly scene: {
      updateWorldTransforms(): void;
      collectRenderables(): {
        readonly node: { readonly name: string; readonly transform: { readonly worldMatrix: Mat4 } };
        readonly renderable: {
          readonly geometry: string;
          readonly material: string;
          readonly skinning?: RenderItem["skinning"];
          readonly instanceTransforms?: RenderItem["instanceTransforms"];
          readonly morphWeights: readonly number[];
        };
      }[];
    };
    readonly geometryLibrary: { get(key: string): RenderItem["geometry"] | undefined };
    readonly materialLibrary: { get(key: string): RenderItem["material"] | undefined };
    readonly morphTargetLibrary: { get(key: string): RenderItem["morphTargets"] | undefined };
  };
  readonly metadata: {
    readonly assetId: string;
  };
}

export function createV6ProductionStageScene(
  source: RenderSource,
  bounds: CameraFrameBounds,
  viewport: { readonly width: number; readonly height: number },
  options: {
    readonly yawRadians?: number;
    readonly pitchRadians?: number;
    readonly paddingRatio?: number;
    readonly floorColor?: readonly [number, number, number, number];
    readonly backdropColor?: readonly [number, number, number, number];
    readonly includeFloor?: boolean;
    readonly includeSoftboxes?: boolean;
    readonly includeBackdrop?: boolean;
    readonly environmentLighting?: EnvironmentLightingOptions;
    readonly hdrSkybox?: V6HdrSkyboxOptions;
  } = {}
): V6StagedScene {
  const stageItems = createV6ProductionStageItems(bounds, options);
  const frame = computePerspectiveCameraFrame(bounds, viewport, {
    yawRadians: options.yawRadians ?? -0.34,
    pitchRadians: options.pitchRadians ?? -0.16,
    paddingRatio: options.paddingRatio ?? 0.08,
    nearPadding: 0.25,
    farPadding: 3.5
  });
  const skyboxItems = options.hdrSkybox
    ? [createV6HdrSkyboxItem(frame.cameraPosition, Math.max(frame.far * 0.42, 8), options.hdrSkybox)]
    : [];
  return {
    source: {
      ...source,
      collectRenderItems: undefined,
      renderItems: [...skyboxItems, ...stageItems, ...(source.renderItems ? [...source.renderItems] : [])],
      cameraPolicy: "require",
      cameraFrameBounds: bounds,
      cameraPosition: frame.cameraPosition,
      frustumCulling: false
    },
    camera: {
      viewProjectionMatrix: frame.viewProjectionMatrix,
      viewMatrix: frame.viewMatrix,
      projectionMatrix: frame.projectionMatrix
    }
  };
}

export function createV6ComposedProductionStageScene(
  pipelines: readonly V6ComposablePipeline[],
  viewport: { readonly width: number; readonly height: number },
  options: {
    readonly yawRadians?: number;
    readonly pitchRadians?: number;
    readonly paddingRatio?: number;
    readonly floorColor?: readonly [number, number, number, number];
    readonly backdropColor?: readonly [number, number, number, number];
    readonly includeFloor?: boolean;
    readonly includeSoftboxes?: boolean;
    readonly includeBackdrop?: boolean;
    readonly environmentLighting?: RenderSource["environmentLighting"];
    readonly postprocess?: RenderSource["postprocess"];
    readonly hdrSkybox?: V6HdrSkyboxOptions;
  } = {}
): V6StagedScene & { readonly frameBounds: CameraFrameBounds } {
  if (pipelines.length === 0) {
    throw new Error("V6 composed production scene requires at least one imported asset pipeline.");
  }
  const placements = createAssetPlacements(pipelines.map((pipeline) => pipeline.resources.bounds));
  const items: RenderItem[] = [];
  const transformedBounds: CameraFrameBounds[] = [];
  for (let index = 0; index < pipelines.length; index += 1) {
    const pipeline = pipelines[index]!;
    const placement = placements[index]!;
    transformedBounds.push(transformBounds(pipeline.resources.bounds, placement));
    pipeline.resources.scene.updateWorldTransforms();
    for (const { node, renderable } of pipeline.resources.scene.collectRenderables()) {
      const geometry = pipeline.resources.geometryLibrary.get(renderable.geometry);
      const material = pipeline.resources.materialLibrary.get(renderable.material);
      if (!geometry || !material) continue;
      const morphTargets = pipeline.resources.morphTargetLibrary.get(renderable.geometry);
      items.push({
        geometry,
        material,
        label: `${pipeline.metadata.assetId}:${node.name}`,
        modelMatrix: multiplyMat4(placement, node.transform.worldMatrix),
        ...(renderable.skinning ? { skinning: renderable.skinning } : {}),
        ...(renderable.instanceTransforms ? { instanceTransforms: renderable.instanceTransforms } : {}),
        ...(morphTargets && renderable.morphWeights.length > 0 ? { morphTargets, morphWeights: renderable.morphWeights } : {})
      });
    }
  }
  const frameBounds = unionBounds(transformedBounds);
  const base = pipelines[0]!.source;
  const staged = createV6ProductionStageScene({
    ...base,
    scene: undefined,
    collectRenderItems: undefined,
    renderItems: items,
    ...(options.environmentLighting !== undefined ? { environmentLighting: options.environmentLighting } : {}),
    ...(options.postprocess !== undefined ? { postprocess: options.postprocess } : {})
  }, frameBounds, viewport, options);
  return { ...staged, frameBounds };
}

export function createV6ProductionStageItems(
  bounds: CameraFrameBounds,
  options: {
    readonly floorColor?: readonly [number, number, number, number];
    readonly backdropColor?: readonly [number, number, number, number];
    readonly includeFloor?: boolean;
    readonly includeSoftboxes?: boolean;
    readonly includeBackdrop?: boolean;
    readonly environmentLighting?: EnvironmentLightingOptions;
  } = {}
): readonly RenderItem[] {
  const width = Math.max(0.2, bounds.max[0] - bounds.min[0]);
  const height = Math.max(0.2, bounds.max[1] - bounds.min[1]);
  const depth = Math.max(0.2, bounds.max[2] - bounds.min[2]);
  const radius = Math.max(width, height, depth, 1);
  const centerX = (bounds.min[0] + bounds.max[0]) / 2;
  const centerY = (bounds.min[1] + bounds.max[1]) / 2;
  const centerZ = (bounds.min[2] + bounds.max[2]) / 2;
  const floorY = bounds.min[1] - radius * 0.055;
  const cube = Geometry.litCube(1);
  const floor = createV6StageFloorMaterial(options);
  const backdrop = new UnlitMaterial({
    color: [...(options.backdropColor ?? [0.18, 0.2, 0.22, 1])] as [number, number, number, number]
  });
  const items: RenderItem[] = [];
  if (options.includeFloor !== false) {
    items.push({
      geometry: cube,
      material: floor,
      label: "production-runtime-production-floor",
      includeInAutoFrame: false,
      modelMatrix: composeMat4([centerX, floorY, centerZ + radius * 0.08], [0, 0, 0, 1], [radius * 2.8, radius * 0.035, radius * 2.4])
    });
  }
  if (options.includeBackdrop !== false) {
    items.push({
      geometry: cube,
      material: backdrop,
      label: "production-runtime-production-backdrop",
      includeInAutoFrame: false,
      modelMatrix: composeMat4([centerX, centerY + radius * 0.48, bounds.min[2] - radius * 0.34], [0, 0, 0, 1], [radius * 2.8, radius * 1.75, radius * 0.035])
    });
  }
  if (options.includeSoftboxes !== false) {
    const warm = new UnlitMaterial({ color: [1, 0.88, 0.68, 0.55] });
    const cool = new UnlitMaterial({ color: [0.48, 0.66, 1, 0.42] });
    items.push(
      {
        geometry: cube,
        material: warm,
        label: "production-runtime-production-warm-softbox",
        includeInAutoFrame: false,
        modelMatrix: composeMat4([centerX - radius * 0.92, centerY + radius * 0.58, centerZ + radius * 0.48], [0, 0, 0, 1], [radius * 0.045, radius * 0.64, radius * 0.48])
      },
      {
        geometry: cube,
        material: cool,
        label: "production-runtime-production-cool-softbox",
        includeInAutoFrame: false,
        modelMatrix: composeMat4([centerX + radius * 0.9, centerY + radius * 0.38, centerZ - radius * 0.02], [0, 0, 0, 1], [radius * 0.04, radius * 0.52, radius * 0.42])
      }
    );
  }
  return items;
}

export interface V6HdrSkyboxOptions {
  readonly texture: TextureBinding;
  readonly rotation?: number;
  readonly exposure?: number;
}

const V6_HDR_SKYBOX_SHADER_NAME = "production-runtime/hdr-skybox";
const V6_HDR_SKYBOX_SHADER_MARKER = "@production-runtime-shader:hdr-skybox-v1";

export function createV6HeroShaderLibrary(): ShaderLibrary {
  const library = createDefaultShaderLibrary();
  library.register({
    name: V6_HDR_SKYBOX_SHADER_NAME,
    marker: V6_HDR_SKYBOX_SHADER_MARKER,
    vertex: `#version 300 es
// ${V6_HDR_SKYBOX_SHADER_MARKER}
precision highp float;
layout(location = 0) in vec3 a_position;
uniform mat4 u_modelViewProjection;
out vec3 v_direction;
void main() {
  v_direction = normalize(a_position);
  gl_Position = u_modelViewProjection * vec4(a_position, 1.0);
}
`,
    fragment: `#version 300 es
// ${V6_HDR_SKYBOX_SHADER_MARKER}
precision highp float;
uniform sampler2D u_environmentMapTexture;
uniform float u_environmentSkyboxRotation;
uniform float u_environmentSkyboxExposure;
in vec3 v_direction;
out vec4 outColor;

const float PI = 3.141592653589793;

vec2 productionRuntimeEquirectUv(vec3 direction, float rotation) {
  vec3 d = normalize(direction);
  float u = atan(d.z, d.x) / (2.0 * PI) + 0.5 + rotation;
  float v = acos(clamp(d.y, -1.0, 1.0)) / PI;
  return vec2(fract(u), clamp(v, 0.0, 1.0));
}

vec3 productionRuntimeFilmic(vec3 color) {
  color = max(color, vec3(0.0));
  return clamp((color * (2.51 * color + 0.03)) / (color * (2.43 * color + 0.59) + 0.14), vec3(0.0), vec3(1.0));
}

vec3 productionRuntimeLinearToSrgb(vec3 color) {
  vec3 lo = color * 12.92;
  vec3 hi = 1.055 * pow(max(color, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
  return mix(lo, hi, step(vec3(0.0031308), color));
}

void main() {
  vec3 hdr = texture(u_environmentMapTexture, productionRuntimeEquirectUv(v_direction, u_environmentSkyboxRotation)).rgb * u_environmentSkyboxExposure;
  vec3 mapped = productionRuntimeLinearToSrgb(productionRuntimeFilmic(hdr));
  outColor = vec4(mapped, 1.0);
}
`
  });
  return library;
}

class V6HdrSkyboxMaterial extends Material {
  constructor(options: V6HdrSkyboxOptions) {
    super({
      name: "production-runtime-hdr-skybox",
      shaderKey: V6_HDR_SKYBOX_SHADER_NAME,
      renderState: {
        depthTest: false,
        depthWrite: false,
        cullMode: "front"
      },
      parameters: {
        u_modelViewProjection: identityMatrix(),
        u_environmentMapTexture: options.texture,
        u_environmentSkyboxRotation: options.rotation ?? 0,
        u_environmentSkyboxExposure: options.exposure ?? 1
      },
      requiredAttributes: ["a_position"],
      uniformSchema: [
        { name: "u_modelViewProjection", kind: "mat4" },
        { name: "u_environmentMapTexture", kind: "texture2d" },
        { name: "u_environmentSkyboxRotation", kind: "float" },
        { name: "u_environmentSkyboxExposure", kind: "float" }
      ]
    });
  }
}

function createV6HdrSkyboxItem(
  cameraPosition: readonly [number, number, number],
  radius: number,
  options: V6HdrSkyboxOptions
): RenderItem {
  return {
    geometry: Geometry.uvSphere(1, 96, 48),
    material: new V6HdrSkyboxMaterial(options),
    label: "production-runtime-visible-hdr-skybox",
    includeInAutoFrame: false,
    modelMatrix: composeMat4(cameraPosition, [0, 0, 0, 1], [radius, radius, radius])
  };
}

export function createV6PbrReferenceItems(
  bounds: CameraFrameBounds,
  environmentLighting: EnvironmentLightingOptions
): readonly RenderItem[] {
  const width = Math.max(0.2, bounds.max[0] - bounds.min[0]);
  const height = Math.max(0.2, bounds.max[1] - bounds.min[1]);
  const depth = Math.max(0.2, bounds.max[2] - bounds.min[2]);
  const radius = Math.max(width, height, depth, 1);
  const centerX = (bounds.min[0] + bounds.max[0]) / 2;
  const floorY = bounds.min[1] - radius * 0.01;
  const foregroundZ = bounds.max[2] + radius * 0.08;
  const sphere = Geometry.uvSphere(radius * 0.085, 72, 36);
  const materials = [
    new PBRMaterial({
      name: "production-runtime-brushed-metal-reference",
      baseColor: [0.86, 0.82, 0.74, 1],
      metallic: 1,
      roughness: 0.18,
      clearcoatFactor: 0.18,
      clearcoatRoughnessFactor: 0.08
    }),
    new PBRMaterial({
      name: "production-runtime-gloss-clearcoat-reference",
      baseColor: [0.08, 0.13, 0.2, 1],
      metallic: 0,
      roughness: 0.08,
      clearcoatFactor: 1,
      clearcoatRoughnessFactor: 0.03,
      specularFactor: 1
    }),
    new PBRMaterial({
      name: "production-runtime-sheen-fabric-reference",
      baseColor: [0.55, 0.1, 0.08, 1],
      metallic: 0,
      roughness: 0.58,
      sheenColorFactor: [0.9, 0.35, 0.22],
      sheenRoughnessFactor: 0.32
    }),
    new PBRMaterial({
      name: "production-runtime-rough-ceramic-reference",
      baseColor: [0.82, 0.86, 0.88, 1],
      metallic: 0,
      roughness: 0.82,
      specularFactor: 0.42
    }),
    new PBRMaterial({
      name: "production-runtime-polished-black-reference",
      baseColor: [0.004, 0.005, 0.006, 1],
      metallic: 1,
      roughness: 0.04,
      clearcoatFactor: 0.55,
      clearcoatRoughnessFactor: 0.02
    })
  ];
  const spacing = radius * 0.2;
  return materials.map((material, index) => ({
    geometry: sphere,
    material,
    label: material.name,
    includeInAutoFrame: false,
    modelMatrix: composeMat4([
      centerX + (index - 1) * spacing,
      floorY + radius * 0.09,
      foregroundZ
    ], [0, 0, 0, 1], [1, 1, 1])
  }));
}

function createV6StageFloorMaterial(options: {
  readonly floorColor?: readonly [number, number, number, number];
  readonly environmentLighting?: EnvironmentLightingOptions;
}): PBRMaterial | UnlitMaterial {
  if (!options.environmentLighting) {
    return new UnlitMaterial({
      color: [...(options.floorColor ?? [0.34, 0.36, 0.37, 1])] as [number, number, number, number]
    });
  }
  return new PBRMaterial({
    name: "production-runtime-reflective-stage-floor",
    baseColor: [...(options.floorColor ?? [0.035, 0.038, 0.043, 1])] as [number, number, number, number],
    metallic: 0,
    roughness: 0.72,
    specularFactor: 0.28,
    clearcoatFactor: 0.05,
    clearcoatRoughnessFactor: 0.42
  });
}

function identityMatrix(): Float32Array {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ]);
}

function createAssetPlacements(boundsList: readonly CameraFrameBounds[]): readonly Mat4[] {
  if (boundsList.length <= 1) return [identityPlacement()];
  const spacing = boundsList.length === 2 ? 1.52 : 1.28;
  const center = (boundsList.length - 1) / 2;
  return boundsList.map((bounds, index) => {
    const height = Math.max(0.001, bounds.max[1] - bounds.min[1]);
    const depth = Math.max(0.001, bounds.max[2] - bounds.min[2]);
    const targetHeight = index === 0 ? 1.52 : 1.22;
    const scale = targetHeight / height;
    const assetCenter: [number, number, number] = [
      (bounds.min[0] + bounds.max[0]) / 2,
      (bounds.min[1] + bounds.max[1]) / 2,
      (bounds.min[2] + bounds.max[2]) / 2
    ];
    const offset: [number, number, number] = [
      (index - center) * spacing,
      0,
      index === 0 ? 0 : Math.min(0.32, depth * scale * 0.2)
    ];
    return multiplyMat4(
      composeMat4(offset, [0, 0, 0, 1], [scale, scale, scale]),
      composeMat4([-assetCenter[0], -assetCenter[1], -assetCenter[2]], [0, 0, 0, 1], [1, 1, 1])
    );
  });
}

function identityPlacement(): Mat4 {
  return composeMat4([0, 0, 0], [0, 0, 0, 1], [1, 1, 1]);
}

function transformBounds(bounds: CameraFrameBounds, matrix: Mat4): CameraFrameBounds {
  const corners: readonly [number, number, number][] = [
    [bounds.min[0], bounds.min[1], bounds.min[2]],
    [bounds.max[0], bounds.min[1], bounds.min[2]],
    [bounds.min[0], bounds.max[1], bounds.min[2]],
    [bounds.max[0], bounds.max[1], bounds.min[2]],
    [bounds.min[0], bounds.min[1], bounds.max[2]],
    [bounds.max[0], bounds.min[1], bounds.max[2]],
    [bounds.min[0], bounds.max[1], bounds.max[2]],
    [bounds.max[0], bounds.max[1], bounds.max[2]]
  ];
  const transformed = corners.map((corner) => transformPoint(matrix, corner));
  return {
    min: [
      Math.min(...transformed.map((point) => point[0])),
      Math.min(...transformed.map((point) => point[1])),
      Math.min(...transformed.map((point) => point[2]))
    ],
    max: [
      Math.max(...transformed.map((point) => point[0])),
      Math.max(...transformed.map((point) => point[1])),
      Math.max(...transformed.map((point) => point[2]))
    ]
  };
}

function unionBounds(boundsList: readonly CameraFrameBounds[]): CameraFrameBounds {
  return {
    min: [
      Math.min(...boundsList.map((bounds) => bounds.min[0])),
      Math.min(...boundsList.map((bounds) => bounds.min[1])),
      Math.min(...boundsList.map((bounds) => bounds.min[2]))
    ],
    max: [
      Math.max(...boundsList.map((bounds) => bounds.max[0])),
      Math.max(...boundsList.map((bounds) => bounds.max[1])),
      Math.max(...boundsList.map((bounds) => bounds.max[2]))
    ]
  };
}
