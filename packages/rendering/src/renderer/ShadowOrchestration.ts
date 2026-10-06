// PR 0b-2 carve-out (CONTRACTS.md §3.3) — verbatim move from Renderer.ts; 0 changed logic lines.
// File: packages/rendering/src/renderer/ShadowOrchestration.ts — owner lane 02.

import { CascadedShadowMaps, CascadedShadowPass, shadowCameraFitViewProjectionMatrix } from "../CascadedShadowMaps";
import type { ForwardShadowMapOptions, RenderItem } from "../ForwardPass";
import type { CollectedLight } from "../LightCollector";
import { type RenderDevice, RenderDeviceError, type RenderTarget } from "../RenderDevice";
import { type RendererShadowOptions, cameraWorldPosition } from "../Renderer";
import { Sampler } from "../Sampler";
import { ShadowMap } from "../ShadowMap";
import { ShadowPass } from "../ShadowPass";
import { TextureBinding } from "../TextureBinding";
import type { RenderSource } from "../contracts/renderSource";
import { collectItemBounds, isIterable, sceneFromSource, toMat4 } from "./RenderShared";
import { RendererHost } from "./RendererHost";
import { Bounds3 as SceneBounds3, Camera, DirectionalLight, Light, type Mat4, PerspectiveCamera, PointLight, Scene, SpotLight, type Vec3, identityMat4, multiplyMat4, orthographicMat4, perspectiveMat4 } from "@aura3d/scene";

export function collectForwardShadowMap(source: RenderSource | Iterable<RenderItem> | Scene): ForwardShadowMapOptions | undefined {
  return source instanceof Scene || isIterable(source) ? undefined : source.shadowMap;
}

export function collectRendererShadowOptions(source: RenderSource | Iterable<RenderItem> | Scene): RendererShadowOptions | undefined {
  if (source instanceof Scene || isIterable(source)) return undefined;
  if (source.shadow === true) return {};
  if (!source.shadow) return undefined;
  return source.shadow;
}

function firstShadowCastingLight(source: RenderSource | Iterable<RenderItem> | Scene, lights: readonly CollectedLight[]): Light | null {
  const explicit = lights.find((light) => light.castsShadow && light.source.visible)?.source;
  if (explicit) return explicit;
  const scene = sceneFromSource(source);
  return scene?.collectLights().find((light) => light.visible && light.castsShadow) ?? null;
}

function firstShadowCastingCollectedLight(lights: readonly CollectedLight[]): CollectedLight | undefined {
  return lights.find((light) => light.castsShadow && light.source.visible);
}

function lightDirectionFromLight(light: Light | null): Vec3 {
  if (!light) return [0, -1, -1];
  const direction = light instanceof DirectionalLight ? light.getDirection() : undefined;
  return normalizeVec3([
    Number(direction?.[0] ?? 0),
    Number(direction?.[1] ?? -1),
    Number(direction?.[2] ?? -1)
  ]);
}

function createRendererOwnedShadowMatrix(light: Light | null, items: readonly RenderItem[], collectedLight: CollectedLight | undefined): Mat4 {
  if (light instanceof SpotLight) {
    light.transform.updateWorld(undefined, true);
    const near = 0.01;
    const far = Math.max(near + 0.01, light.range);
    const projectionMatrix = perspectiveMat4(light.angle * 2, 1, near, far);
    return multiplyMat4(projectionMatrix, light.transform.inverseWorldMatrix);
  }
  return createDirectionalShadowMatrix(items, collectedLight?.direction ?? lightDirectionFromLight(light));
}

function createPointShadowFaceMatrices(light: PointLight): Float32Array {
  light.transform.updateWorld(undefined, true);
  const position: Vec3 = [
    light.transform.worldMatrix[12],
    light.transform.worldMatrix[13],
    light.transform.worldMatrix[14]
  ];
  const projection = perspectiveMat4(Math.PI / 2, 1, 0.01, Math.max(0.02, light.range));
  const faces: readonly { readonly direction: Vec3; readonly up: Vec3 }[] = [
    { direction: [1, 0, 0], up: [0, -1, 0] },
    { direction: [-1, 0, 0], up: [0, -1, 0] },
    { direction: [0, 1, 0], up: [0, 0, 1] },
    { direction: [0, -1, 0], up: [0, 0, -1] },
    { direction: [0, 0, 1], up: [0, -1, 0] },
    { direction: [0, 0, -1], up: [0, -1, 0] }
  ];
  const matrices = new Float32Array(6 * 16);
  for (const [index, face] of faces.entries()) {
    const view = lookAtMatrix(position, addVec3(position, face.direction), face.up);
    matrices.set(multiplyMat4(projection, view), index * 16);
  }
  return matrices;
}

function createPointShadowFaceRects(): Float32Array {
  const rects = new Float32Array(6 * 4);
  for (let face = 0; face < 6; face += 1) {
    const column = face % 3;
    const row = Math.floor(face / 3);
    rects.set([column / 3, row / 2, 1 / 3, 1 / 2], face * 4);
  }
  return rects;
}

function readShadowFacePixels(device: RenderDevice, target: RenderTarget): Uint8Array {
  device.setRenderTarget(target);
  if (target.depthTexture && device.readDepthPixels) {
    const depth = device.readDepthPixels(0, 0, target.width, target.height);
    const pixels = new Uint8Array(target.width * target.height * 4);
    for (let index = 0; index < depth.length; index += 1) {
      const byte = Math.max(0, Math.min(255, Math.round((depth[index] ?? 1) * 255)));
      const offset = index * 4;
      pixels[offset] = byte;
      pixels[offset + 1] = byte;
      pixels[offset + 2] = byte;
      pixels[offset + 3] = 255;
    }
    return pixels;
  }
  return device.readPixels(0, 0, target.width, target.height);
}

function blitPointShadowFace(
  atlasPixels: Uint8Array,
  atlasWidth: number,
  atlasHeight: number,
  facePixels: Uint8Array,
  faceSize: number,
  faceRects: Float32Array,
  face: number
): void {
  const rectOffset = face * 4;
  const destX = Math.round((faceRects[rectOffset] ?? 0) * atlasWidth);
  const destY = Math.round((faceRects[rectOffset + 1] ?? 0) * atlasHeight);
  for (let row = 0; row < faceSize; row += 1) {
    const sourceOffset = row * faceSize * 4;
    const targetOffset = ((destY + row) * atlasWidth + destX) * 4;
    atlasPixels.set(facePixels.subarray(sourceOffset, sourceOffset + faceSize * 4), targetOffset);
  }
}

function lookAtMatrix(eye: Vec3, target: Vec3, up: Vec3): Mat4 {
  const forward = normalizeVec3(subtractVec3(target, eye));
  const right = normalizeVec3(crossVec3(forward, up));
  const correctedUp = crossVec3(right, forward);
  return [
    right[0], correctedUp[0], -forward[0], 0,
    right[1], correctedUp[1], -forward[1], 0,
    right[2], correctedUp[2], -forward[2], 0,
    -dotVec3(right, eye), -dotVec3(correctedUp, eye), dotVec3(forward, eye), 1
  ];
}

function createDirectionalShadowMatrix(items: readonly RenderItem[], lightDirection: readonly [number, number, number]): Mat4 {
  const bounds = collectShadowCoverageBounds(items);
  if (!bounds || bounds.isEmpty()) {
    return identityMat4();
  }
  const basis = directionalLightBasis(lightDirection);
  const points = boundsCorners(bounds).map((point) => projectPointToLightSpace(point, basis));
  const lightBounds = boundsFromVec3(points);
  const width = Math.max(0.01, lightBounds.max[0] - lightBounds.min[0]);
  const height = Math.max(0.01, lightBounds.max[1] - lightBounds.min[1]);
  const depth = Math.max(0.01, lightBounds.max[2] - lightBounds.min[2]);
  const padding = Math.max(width, height, depth) * 0.08 + 0.05;
  const viewMatrix = lightViewMatrix(basis);
  const projectionMatrix = orthographicMat4(
    lightBounds.min[0] - padding,
    lightBounds.max[0] + padding,
    lightBounds.min[1] - padding,
    lightBounds.max[1] + padding,
    lightBounds.min[2] - padding,
    lightBounds.max[2] + padding
  );
  return multiplyMat4(projectionMatrix, viewMatrix);
}

function directionalLightBasis(lightDirection: readonly [number, number, number]): {
  readonly right: Vec3;
  readonly up: Vec3;
  readonly forward: Vec3;
} {
  const forward = normalizeVec3(scaleVec3(normalizeVec3(lightDirection), -1));
  const fallbackUp: Vec3 = Math.abs(forward[1]) > 0.94 ? [0, 0, 1] : [0, 1, 0];
  const right = normalizeVec3(crossVec3(fallbackUp, forward));
  const up = normalizeVec3(crossVec3(forward, right));
  return { right, up, forward };
}

function lightViewMatrix(basis: { readonly right: Vec3; readonly up: Vec3; readonly forward: Vec3 }): Mat4 {
  return [
    basis.right[0], basis.up[0], basis.forward[0], 0,
    basis.right[1], basis.up[1], basis.forward[1], 0,
    basis.right[2], basis.up[2], basis.forward[2], 0,
    0, 0, 0, 1
  ];
}

function projectPointToLightSpace(point: Vec3, basis: { readonly right: Vec3; readonly up: Vec3; readonly forward: Vec3 }): Vec3 {
  return [dotVec3(point, basis.right), dotVec3(point, basis.up), dotVec3(point, basis.forward)];
}

function boundsCorners(bounds: SceneBounds3): readonly Vec3[] {
  return [
    [bounds.min[0], bounds.min[1], bounds.min[2]],
    [bounds.max[0], bounds.min[1], bounds.min[2]],
    [bounds.min[0], bounds.max[1], bounds.min[2]],
    [bounds.min[0], bounds.min[1], bounds.max[2]],
    [bounds.max[0], bounds.max[1], bounds.min[2]],
    [bounds.max[0], bounds.min[1], bounds.max[2]],
    [bounds.min[0], bounds.max[1], bounds.max[2]],
    [bounds.max[0], bounds.max[1], bounds.max[2]]
  ];
}

function boundsFromVec3(points: readonly Vec3[]): { readonly min: Vec3; readonly max: Vec3 } {
  const min: Vec3 = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max: Vec3 = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (const point of points) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis]!, point[axis]!);
      max[axis] = Math.max(max[axis]!, point[axis]!);
    }
  }
  return { min, max };
}

/**
 * Bounds over every render item, including those excluded from camera
 * auto-framing.
 *
 * `includeInAutoFrame` answers "should the camera frame this?", which is a
 * composition choice. It must not decide which geometry a shadow frustum covers:
 * a large ground plane or backdrop is commonly excluded from auto-framing while
 * still being the surface that receives shadows. Fitting the light frustum to the
 * auto-frame subset shrinks it to the caster alone, so the receiver falls outside
 * the shadow map and no shadow is ever visible.
 */
function collectShadowCoverageBounds(items: readonly RenderItem[]): SceneBounds3 | undefined {
  return collectItemBounds(items, false);
}

function normalizeVec3(value: readonly [number, number, number]): Vec3 {
  const length = Math.hypot(value[0], value[1], value[2]);
  if (!Number.isFinite(length) || length <= 1e-8) return [0, -1 / Math.SQRT2, -1 / Math.SQRT2];
  return [value[0] / length, value[1] / length, value[2] / length];
}

function scaleVec3(value: Vec3, amount: number): Vec3 {
  return [value[0] * amount, value[1] * amount, value[2] * amount];
}

function addVec3(left: Vec3, right: Vec3): Vec3 {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function subtractVec3(left: Vec3, right: Vec3): Vec3 {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function crossVec3(left: Vec3, right: Vec3): Vec3 {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0]
  ];
}

function dotVec3(left: Vec3, right: Vec3): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

export class RendererShadowOrchestrator {
  constructor(readonly host: RendererHost) {}

  /** Allocates the shared shadow depth target once, reallocating only when the size changes. */
  private ensureShadowDepthTarget(size: number): RenderTarget {
    const existing = this.host.shadowDepthTarget;
    if (existing && !existing.disposed && existing.width === size && existing.height === size) return existing;
    existing?.dispose();
    const target = this.host.device.createRenderTarget({
      width: size,
      height: size,
      label: "renderer-shadow-depth-color",
      format: "rgba8",
      depth: this.host.device.info.capabilities?.includes("depth-textures") ? "texture" : true
    });
    this.host.shadowDepthTarget = target;
    return target;
  }

  executeRendererShadowMap(options: {
    readonly shadowOptions: RendererShadowOptions | undefined;
    readonly source: RenderSource | Iterable<RenderItem> | Scene;
    readonly items: readonly RenderItem[];
    readonly lights: readonly CollectedLight[];
    readonly ownedTargets: RenderTarget[];
    readonly ownedShadowPasses: Array<{ dispose(): void }>;
    readonly camera?: Camera;
  }): ForwardShadowMapOptions | undefined {
    if (!options.shadowOptions || options.shadowOptions.enabled === false) {
      return undefined;
    }
    if (!this.host.device.info.capabilities?.includes("render-targets")) {
      throw new RenderDeviceError("Renderer-owned shadows require render targets", "SHADOW_RENDER_TARGET_UNSUPPORTED", {
        backend: this.host.device.kind
      });
    }
    const light = options.shadowOptions.light ?? firstShadowCastingLight(options.source, options.lights);
    if (light instanceof PointLight) {
      return this.executeRendererPointShadowMap({
        shadowOptions: options.shadowOptions,
        items: options.items,
        ownedTargets: options.ownedTargets,
        ownedShadowPasses: options.ownedShadowPasses,
        light
      });
    }
    if (light && !(light instanceof DirectionalLight) && !(light instanceof SpotLight)) {
      throw new RenderDeviceError("Renderer-owned shadow maps require directional, spot, or point lights.", "SHADOW_LIGHT_TYPE_UNSUPPORTED", {
        lightName: light.name,
        lightType: light.constructor.name
      });
    }
    if (
      light instanceof DirectionalLight
      && options.camera instanceof PerspectiveCamera
      && (options.shadowOptions.cascadeCount ?? 1) > 1
    ) {
      return this.executeRendererCascadedShadowMap({
        shadowOptions: options.shadowOptions,
        items: options.items,
        ownedShadowPasses: options.ownedShadowPasses,
        light,
        camera: options.camera
      });
    }
    const lightMatrix = options.shadowOptions.lightMatrix
      ? toMat4(options.shadowOptions.lightMatrix, "shadow.lightMatrix")
      : createRendererOwnedShadowMatrix(light, options.items, firstShadowCastingCollectedLight(options.lights));
    const shadowMap = new ShadowMap({
      size: options.shadowOptions.size,
      bias: options.shadowOptions.bias,
      filter: options.shadowOptions.filter,
      pcfRadius: options.shadowOptions.pcfRadius,
      pcfSamples: options.shadowOptions.pcfSamples,
      pcfDistribution: options.shadowOptions.pcfDistribution,
      label: options.shadowOptions.label ?? "renderer-shadow-map"
    });
    const shadowPass = new ShadowPass({
      light,
      casters: options.items,
      shadowMap,
      viewProjectionMatrix: lightMatrix,
      shaderLibrary: this.host.shaderLibrary,
      renderTarget: this.ensureShadowDepthTarget(shadowMap.size)
    });
    options.ownedShadowPasses.push(shadowPass);
    const result = shadowPass.execute({ device: this.host.device, width: this.host.width, height: this.host.height });
    if (!result.rendered) {
      if (result.reason === "no-light" || result.reason === "light-disabled" || result.reason === "not-shadow-casting") {
        throw new RenderDeviceError("Renderer-owned shadows require an enabled shadow-casting light.", "SHADOW_LIGHT_REQUIRED", {
          reason: result.reason
        });
      }
      return undefined;
    }
    return shadowPass.getForwardShadowMap({
      lightMatrix,
      strength: options.shadowOptions.strength,
      slopeBias: options.shadowOptions.slopeBias,
      texelSize: options.shadowOptions.texelSize,
      bias: options.shadowOptions.bias,
      filterKernel: options.shadowOptions.filterKernel
    }) ?? undefined;
  }

  private executeRendererCascadedShadowMap(options: {
    readonly shadowOptions: RendererShadowOptions;
    readonly items: readonly RenderItem[];
    readonly ownedShadowPasses: Array<{ dispose(): void }>;
    readonly light: DirectionalLight;
    readonly camera: PerspectiveCamera;
  }): ForwardShadowMapOptions | undefined {
    const cascadeCount = options.shadowOptions.cascadeCount ?? 4;
    if (!Number.isInteger(cascadeCount) || cascadeCount < 2 || cascadeCount > 4) {
      throw new RenderDeviceError("Renderer cascadeCount must be an integer in [2, 4].", "SHADOW_CASCADE_CONTRACT", { cascadeCount });
    }
    options.camera.transform.updateWorld(undefined, true);
    const position = cameraWorldPosition(options.camera);
    const world = options.camera.transform.worldMatrix;
    const target: Vec3 = [
      position[0] - (world[8] ?? 0),
      position[1] - (world[9] ?? 0),
      position[2] - (world[10] ?? 1)
    ];
    const cascades = new CascadedShadowMaps({
      cascadeCount,
      near: options.camera.near,
      far: options.camera.far,
      lambda: options.shadowOptions.cascadeLambda ?? 0.6,
      size: options.shadowOptions.size,
      bias: options.shadowOptions.bias,
      filter: options.shadowOptions.filter,
      pcfRadius: options.shadowOptions.pcfRadius,
      pcfSamples: options.shadowOptions.pcfSamples,
      label: options.shadowOptions.label ?? "renderer-csm"
    });
    const fits = cascades.computeStableCameraFits({
      camera: {
        position,
        target,
        fovYRadians: options.camera.fovYRadians,
        aspect: options.camera.aspect
      },
      lightDirection: options.light.getDirection(),
      casters: [],
      receivers: [],
      padding: options.shadowOptions.cascadePadding ?? 0.25,
      stabilize: options.shadowOptions.stabilize !== false
    });
    const lightMatrices = fits.map(shadowCameraFitViewProjectionMatrix);
    const cascadePass = new CascadedShadowPass({
      light: options.light,
      casters: options.items,
      cascades,
      viewProjectionMatrices: lightMatrices,
      shaderLibrary: this.host.shaderLibrary
    });
    const result = cascadePass.execute({ device: this.host.device, width: this.host.width, height: this.host.height });
    options.ownedShadowPasses.push(cascadePass);
    if (!result.rendered) return undefined;
    const maps = cascadePass.getForwardShadowMaps({
      lightMatrices,
      strength: options.shadowOptions.strength,
      slopeBias: options.shadowOptions.slopeBias,
      texelSize: options.shadowOptions.texelSize,
      bias: options.shadowOptions.bias,
      filterKernel: options.shadowOptions.filterKernel
    });
    const first = maps[0];
    if (!first || maps.length !== result.cascades.length) return undefined;
    return {
      ...first,
      cascades: result.cascades.map((cascade, index) => ({
        index: cascade.index,
        near: cascade.split.near,
        far: cascade.split.far,
        shadowMap: maps[index]!
      }))
    };
  }

  private executeRendererPointShadowMap(options: {
    readonly shadowOptions: RendererShadowOptions;
    readonly items: readonly RenderItem[];
    readonly ownedTargets: RenderTarget[];
    readonly ownedShadowPasses: Array<{ dispose(): void }>;
    readonly light: PointLight;
  }): ForwardShadowMapOptions | undefined {
    if (!this.host.device.writeRenderTargetPixels) {
      throw new RenderDeviceError("Renderer-owned point shadows require render-target pixel upload for the point-light atlas.", "POINT_SHADOW_ATLAS_UPLOAD_UNSUPPORTED", {
        backend: this.host.device.kind
      });
    }
    options.light.transform.updateWorld(undefined, true);
    const size = options.shadowOptions.size ?? 512;
    const faceMatrices = createPointShadowFaceMatrices(options.light);
    const faceRects = createPointShadowFaceRects();
    const shadowMapOptions = {
      size,
      bias: options.shadowOptions.bias,
      filter: options.shadowOptions.filter,
      pcfRadius: options.shadowOptions.pcfRadius,
      pcfSamples: options.shadowOptions.pcfSamples,
      pcfDistribution: options.shadowOptions.pcfDistribution
    };
    const atlasPixels = new Uint8Array(size * 3 * size * 2 * 4);
    for (let face = 0; face < 6; face += 1) {
      const faceMatrix = faceMatrices.slice(face * 16, face * 16 + 16);
      const shadowPass = new ShadowPass({
        light: options.light,
        casters: options.items,
        shadowMap: new ShadowMap({ ...shadowMapOptions, label: `${options.shadowOptions.label ?? "renderer-point-shadow"}-face-${face}` }),
        viewProjectionMatrix: faceMatrix,
        shaderLibrary: this.host.shaderLibrary
      });
      options.ownedShadowPasses.push(shadowPass);
      const result = shadowPass.execute({ device: this.host.device, width: this.host.width, height: this.host.height });
      if (!result.rendered) {
        return undefined;
      }
      const target = shadowPass.getRenderTarget();
      if (!target) {
        throw new RenderDeviceError("Renderer-owned point shadow face did not expose a render target.", "POINT_SHADOW_FACE_TARGET_MISSING", { face });
      }
      const facePixels = readShadowFacePixels(this.host.device, target);
      blitPointShadowFace(atlasPixels, size * 3, size * 2, facePixels, size, faceRects, face);
    }
    const atlasTarget = this.host.device.createRenderTarget({
      width: size * 3,
      height: size * 2,
      label: `${options.shadowOptions.label ?? "renderer-point-shadow"}-atlas`,
      format: "rgba8",
      depth: false
    });
    options.ownedTargets.push(atlasTarget);
    this.host.device.writeRenderTargetPixels(atlasTarget, atlasPixels);
    const texture = new TextureBinding({
      name: "u_pointShadowMapTexture",
      texture: atlasTarget.colorTexture,
      sampler: new Sampler({ minFilter: "nearest", magFilter: "nearest", addressU: "clamp-to-edge", addressV: "clamp-to-edge" }),
      required: true
    });
    return {
      texture: new TextureBinding({
        name: "u_shadowMapTexture",
        texture: atlasTarget.colorTexture,
        sampler: new Sampler({ minFilter: "nearest", magFilter: "nearest", addressU: "clamp-to-edge", addressV: "clamp-to-edge" }),
        required: true
      }),
      lightMatrix: identityMat4(),
      strength: options.shadowOptions.strength,
      slopeBias: options.shadowOptions.slopeBias,
      texelSize: options.shadowOptions.texelSize,
      bias: options.shadowOptions.bias,
      filterKernel: options.shadowOptions.filterKernel,
      pointLight: {
        texture,
        lightPosition: [options.light.transform.worldMatrix[12], options.light.transform.worldMatrix[13], options.light.transform.worldMatrix[14]],
        range: options.light.range,
        faceMatrices,
        faceRects,
        strength: options.shadowOptions.strength,
        slopeBias: options.shadowOptions.slopeBias,
        texelSize: [1 / Math.max(1, size * 3), 1 / Math.max(1, size * 2)],
        bias: options.shadowOptions.bias,
        filterKernel: options.shadowOptions.filterKernel
      }
    };
  }
}
