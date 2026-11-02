/**
 * Conservative GU47 selective-bloom eligibility. The separate attachment
 * must be written alongside color, resolved with it, and reach bloom without
 * a spatial transformation. This never invokes producer callbacks.
 */
import { RenderDeviceError, type RenderDevice, type RenderTarget } from "../RenderDevice";
import type { RenderItem } from "../contracts/renderItem";
import type { QrFlags } from "../contracts/core";
import { captureFrameContributor, frameContributors, isEmptyStockContributor, matchesFrameContributor, stockFrameFeedOwner, type FrameContributor } from "../contracts/frameGraph";
import { registeredPostPasses, type PostPassDescriptor, type PostPipelineOptions } from "../contracts/post";
import { SCREEN_FEEL_CONTRIBUTOR } from "../post/ScreenFeelPass";
import { POST_ONLY_TIER_CONTRIBUTOR } from "../post/PostQualityTiers";
import { resolveBloomWeight } from "../postprocess/NativeBloomPyramid";
import type { RendererPostProcessOptions } from "../Renderer";
import { postV2ModulesAvailable } from "./PostprocessExecution";
import { webgl2DeviceHost } from "../webgl2/Counters";
import { WebGL2Device } from "../WebGL2Device";
import { isStockPrd02ShadowsContributor } from "../shadows/Prd02ShadowsContributor";
import { isStockPrd02ContactShadowsContributor, isStockPrd02DepthFeature } from "../passes/Prd02ContactShadowsContributor";
import { isStockPrd02ProbesContributor } from "../probes/Prd02ProbesContributor";
import { isStockPrd07Contributor } from "../vfx/contributors";
import { depthVariantFeaturesFor, isStockDepthVariantFeature } from "../contracts/shadows";
import { selectiveContributorTag } from "./FrameGraph";

const builtinPromoteMultisample = WebGL2Device.prototype.promoteSelectiveBloomMultisample;
const selectiveDeviceMethods = [
  "beginFrame", "draw", "multiDrawElementsInstanced", "createRenderTarget", "setRenderTarget",
  "getRenderTarget", "clear", "clearRenderTarget", "promoteSelectiveBloomMultisample"
] as const;
const builtinDeviceMethods = selectiveDeviceMethods.map((name) => Object.getOwnPropertyDescriptor(WebGL2Device.prototype, name)?.value);
const screenFeelFingerprint = captureFrameContributor(SCREEN_FEEL_CONTRIBUTOR);
const postTierFingerprint = captureFrameContributor(POST_ONLY_TIER_CONTRIBUTOR);

/** Only these unchanged built-in implementations have an audited contract. */
export function selectiveContributorContract(contributor: FrameContributor, device: RenderDevice): "offscreen" | "empty-output" | null {
  if (isStockPrd02ShadowsContributor(contributor) || isStockPrd02ContactShadowsContributor(contributor)) return "offscreen";
  if (isStockPrd02ProbesContributor(contributor, device) || isStockPrd07Contributor(contributor, device) ||
      isEmptyStockContributor(contributor) ||
      matchesFrameContributor(contributor, screenFeelFingerprint) ||
      matchesFrameContributor(contributor, postTierFingerprint)) return "empty-output";
  return null;
}

function plainDataRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) return false;
  return Reflect.ownKeys(value).every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && "value" in descriptor;
  });
}

function plainDataArray(value: unknown): value is readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype ||
      Reflect.ownKeys(value).length !== value.length + 1) return false;
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, index);
    if (!descriptor || !("value" in descriptor)) return false;
  }
  return true;
}

/**
 * Why the frame's source inputs cannot be trusted for a signal frame, or null.
 * Source feeds must be absent, or the unchanged paired engine bridge feeds
 * over an empty stock effect system. Reads descriptors only; no getter,
 * iterator or callback runs.
 */
export function selectiveBloomSourceDecline(source: unknown): string | null {
  if (!plainDataRecord(source)) return "frame-source:accessor";
  // Probe callbacks and assignment objects are not part of the empty stock
  // source contract, even when a malformed node would emit no capture pass.
  if (Object.keys(source).some((key) => key.startsWith("prd02.probes."))) return "frame-source:probes";
  for (const key of ["shadow", "collectedLights", "scene"] as const) {
    if (!Object.getOwnPropertyDescriptor(source, key) && key in source) return "frame-source:accessor";
  }
  const shadow = Object.getOwnPropertyDescriptor(source, "shadow")?.value;
  if (shadow != null && typeof shadow !== "boolean") {
    if (!plainDataRecord(shadow)) return "frame-source:shadow";
    for (const key of ["prd02Shadows", "prd02Contact", "prd02KillSwitches"] as const) {
      const descriptor = Object.getOwnPropertyDescriptor(shadow, key);
      if (!descriptor && key in shadow) return "frame-source:shadow";
      const value = descriptor?.value;
      if (value != null && !plainDataRecord(value)) return "frame-source:shadow";
    }
  }
  // Shadow/contact callbacks may consult the original light list during graph
  // planning and execution. Do not invoke an arbitrary iterable or accessors.
  const lights = Object.getOwnPropertyDescriptor(source, "collectedLights")?.value;
  if (lights !== undefined) {
    if (!plainDataArray(lights)) return "frame-source:lights";
    for (const light of lights) {
      if (!plainDataRecord(light)) return "frame-source:lights";
      const origin = Object.getOwnPropertyDescriptor(light, "source")?.value;
      if (origin != null) {
        if (typeof origin !== "object") return "frame-source:lights";
        const visible = Object.getOwnPropertyDescriptor(origin, "visible");
        if ((!visible && "visible" in origin) || (visible && !("value" in visible))) return "frame-source:lights";
      }
      for (const key of ["position", "direction", "color", "right", "up"] as const) {
        const vector = Object.getOwnPropertyDescriptor(light, key)?.value;
        if (vector != null && (!plainDataArray(vector) || vector.some((entry) => typeof entry !== "number"))) return "frame-source:lights";
      }
    }
  } else if (Object.getOwnPropertyDescriptor(source, "scene")?.value) {
    // Scene.collectLights and light methods may be application callbacks.
    return "frame-source:scene";
  }
  let owner: object | null = null;
  for (const kind of ["vfx", "atmosphere"] as const) {
    const descriptor = Object.getOwnPropertyDescriptor(source, kind);
    // An inherited property or accessor is not a stock source.
    if (!descriptor) {
      if (kind in source) return `frame-source:${kind}`;
      continue;
    }
    if (!("value" in descriptor)) return `frame-source:${kind}`;
    const feed = descriptor.value;
    if (feed == null) continue;
    // Non-stock feeds, and stock feeds over a non-empty effect system (live
    // emitters, sky, fog, decals, wetness...), keep ordinary bloom.
    const current = stockFrameFeedOwner(feed, kind);
    if (!current || (owner && owner !== current)) return `frame-source:${kind}`;
    owner = current;
  }
  return null;
}

/** Boolean form of `selectiveBloomSourceDecline`. */
export function selectiveBloomSourceSafe(source: unknown): boolean {
  return selectiveBloomSourceDecline(source) === null;
}

/** Optional setup must not call application-installed device wrappers. */
function selectiveDeviceIsBuiltin(device: RenderDevice): boolean {
  return Object.getPrototypeOf(device) === WebGL2Device.prototype && selectiveDeviceMethods.every((name, index) =>
    Object.getOwnPropertyDescriptor(device, name) === undefined &&
    Object.getOwnPropertyDescriptor(WebGL2Device.prototype, name)?.value === builtinDeviceMethods[index]);
}

type BloomRequest = { readonly selective?: unknown; readonly selectiveRequested?: unknown; readonly selectiveUnsupportedSource?: unknown };

export function selectiveBloomRequested(post: RendererPostProcessOptions | undefined, items: readonly RenderItem[]): boolean {
  if (!post?.bloom) return false;
  const pipeline = post.pipeline as PostPipelineOptions | undefined;
  const bloom = pipeline?.bloom as BloomRequest | undefined;
  const rawBloom = typeof post.bloom === "object" ? post.bloom as unknown as BloomRequest : undefined;
  return bloom?.selectiveRequested === true || bloom?.selective === true || rawBloom?.selectiveRequested === true || rawBloom?.selective === true ||
    items.some((item) => resolveBloomWeight(item.bloomWeight) !== 1);
}

/**
 * The renderer's existing static optimizers rebuild singletons and do not
 * carry draw metadata. Transfer a weight only when no draw was merged and
 * material identity unambiguously determines every surviving item's weight.
 * Otherwise retain the untouched optimized output and decline this frame.
 */
export function transferUnmergedBloomWeights(
  input: readonly RenderItem[],
  optimized: readonly RenderItem[]
): { readonly weights?: readonly number[]; readonly requested: boolean; readonly unsafe: boolean } {
  const requested = input.some((item) => resolveBloomWeight(item.bloomWeight) !== 1);
  if (!requested) return { requested: false, unsafe: false };
  if (input.length !== optimized.length) return { requested: true, unsafe: true };
  const byMaterial = new Map<RenderItem["material"], number>();
  for (const item of input) {
    const weight = resolveBloomWeight(item.bloomWeight);
    if (byMaterial.has(item.material) && byMaterial.get(item.material) !== weight) {
      return { requested: true, unsafe: true };
    }
    byMaterial.set(item.material, weight);
  }
  if (optimized.some((item) => !byMaterial.has(item.material))) return { requested: true, unsafe: true };
  return {
    weights: optimized.map((item) => byMaterial.get(item.material)!),
    requested: true,
    unsafe: false
  };
}

export interface SelectiveBloomTarget {
  readonly target: RenderTarget;
  dispose(): void;
}

/**
 * Allocate the optional MRT without disturbing the ordinary forward target.
 * The generic feature-target factory can leak its internally allocated
 * renderbuffer if framebuffer allocation fails. For the renderbuffer case,
 * allocate that depth attachment here instead, so every failure owns and
 * releases all of its resources. Its format matches the normal single-sample
 * forward target's DEPTH_COMPONENT16; depth textures remain DEPTH_COMPONENT24.
 */
export function createSelectiveBloomTarget(
  device: RenderDevice,
  width: number,
  height: number,
  format: "rgba16f" | "rgba32f",
  depthTexture: boolean,
  sampleCount: number
): SelectiveBloomTarget | null {
  const host = webgl2DeviceHost(device);
  if (!host || !selectiveDeviceIsBuiltin(device)) return null;
  const gl = host.gl;
  const previousDraw = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
  const previousRead = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
  const previousRenderbuffer = gl.getParameter(gl.RENDERBUFFER_BINDING) as WebGLRenderbuffer | null;
  const previousActive = gl.getParameter(gl.ACTIVE_TEXTURE) as GLenum;
  gl.activeTexture(gl.TEXTURE0);
  const previousTexture = gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture | null;
  gl.activeTexture(previousActive);

  let target: RenderTarget | undefined;
  let ownedDepth: WebGLRenderbuffer | null = null;
  let committed = false;
  try {
    target = device.createRenderTarget({
      width, height, format, sampleCount: 1, label: "renderer-selective-bloom",
      depth: depthTexture ? "texture" : false,
      colorAttachments: [{ format }, { format }]
    });
    const framebuffer = (target as RenderTarget & { readonly framebuffer?: WebGLFramebuffer }).framebuffer;
    if (!framebuffer || target.sampleCount !== 1 || target.colorTextures?.[0] !== target.colorTexture ||
        target.colorTextures?.[1]?.format !== format || (depthTexture && !target.depthTexture)) return null;
    if (sampleCount > 1) {
      if (Object.getPrototypeOf(device) !== WebGL2Device.prototype ||
          Object.getOwnPropertyDescriptor(device, "promoteSelectiveBloomMultisample") !== undefined ||
          WebGL2Device.prototype.promoteSelectiveBloomMultisample !== builtinPromoteMultisample ||
          !builtinPromoteMultisample.call(device, target, sampleCount) || target.sampleCount !== sampleCount) return null;
    } else if (!depthTexture) {
      ownedDepth = gl.createRenderbuffer();
      if (!ownedDepth) return null;
      gl.bindRenderbuffer(gl.RENDERBUFFER, ownedDepth);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, ownedDepth);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) return null;
    }
    const ready = target;
    const depth = ownedDepth;
    let disposed = false;
    committed = true;
    return {
      target: ready,
      dispose: () => {
        if (disposed) return;
        disposed = true;
        ready.dispose();
        if (depth) gl.deleteRenderbuffer(depth);
      }
    };
  } catch (error) {
    if (error instanceof RenderDeviceError &&
        ["FRAMEBUFFER_INVALID", "INVALID_RENDER_TARGET_SAMPLE_COUNT", "WEBGL_ALLOCATION_FAILED"].includes(error.code)) return null;
    throw error;
  } finally {
    if (!committed) {
      target?.dispose();
      if (ownedDepth) gl.deleteRenderbuffer(ownedDepth);
    }
    // The device factory uses raw GL too; restore split read/draw bindings and
    // unit zero even on early allocation failure, then invalidate cached state.
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, previousDraw);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, previousRead);
    gl.bindRenderbuffer(gl.RENDERBUFFER, previousRenderbuffer);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, previousTexture);
    gl.activeTexture(previousActive);
    host.stateCache.invalidate();
  }
}

/**
 * Switch the signal attachment's draw buffer on the selective target's draw framebuffer. The target is reused across frames, and
 * WebGL2 validates every draw's fragment outputs against the enabled draw buffers: a program without a signal output drawing into
 * an enabled second buffer is INVALID_OPERATION. So both buffers are on while a frame clears and while every draw writes the
 * signal, and attachment 1 is off for a frame that declines (late, or the first draw that cannot write it).
 */
export function setSelectiveSignalDrawBuffer(device: RenderDevice, target: RenderTarget, enabled: boolean): void {
  const host = webgl2DeviceHost(device);
  const framebuffer = (target as RenderTarget & { readonly drawFramebuffer?: WebGLFramebuffer }).drawFramebuffer;
  if (!host || !framebuffer || !selectiveDeviceIsBuiltin(device)) return;
  const gl = host.gl;
  const previous = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
  gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, framebuffer);
  gl.drawBuffers([gl.COLOR_ATTACHMENT0, enabled ? gl.COLOR_ATTACHMENT1 : gl.NONE]);
  gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, previous);
  host.stateCache.invalidate();
}

/**
 * The first post pass that always runs ahead of bloom and so blocks the separate signal, or undefined. A pass that carries an
 * `enabled` predicate is conditional (the underwater distortion runs only below a water surface) and cannot be evaluated here
 * without running the frame; the executor (`LegacyPost` `signal-source-transformed`) declines any frame on which an enabled
 * early pass replaced the source target, so only unconditional early passes block the preflight.
 */
export function unconditionalEarlyPass(passes: readonly PostPassDescriptor[]): PostPassDescriptor | undefined {
  return passes.find((pass) => typeof pass.enabled !== "function" && pass.insertAt !== "before-tonemap" && pass.insertAt !== "after-tonemap");
}

/** Returns a reason, never runs custom passes or contributors to discover it. */
export function selectiveBloomDecline(
  device: RenderDevice,
  post: RendererPostProcessOptions,
  target: RenderTarget,
  flags: QrFlags,
  hasBackground: boolean,
  v2Decline: string | null,
  source: unknown
): string | null {
  if (device.kind !== "webgl2" || !device.clearRenderTarget || v2Decline !== null || !postV2ModulesAvailable()) return "backend-or-v2-unavailable";
  if (!selectiveDeviceIsBuiltin(device)) return "custom-device";
  const host = webgl2DeviceHost(device);
  if (!host) return "backend-or-v2-unavailable";
  const mask = host.gl.getParameter(host.gl.COLOR_WRITEMASK) as boolean[] | null;
  const viewport = host.gl.getParameter(host.gl.VIEWPORT) as Int32Array | null;
  if (!mask || mask.length !== 4 || !Array.from(mask).every(Boolean) || host.gl.isEnabled(host.gl.SCISSOR_TEST) ||
      !viewport || viewport.length !== 4 || viewport[0] !== 0 || viewport[1] !== 0 ||
      viewport[2] !== target.width || viewport[3] !== target.height) return "partial-clear-or-viewport";
  if (typeof target.sampleCount !== "number" || !Number.isInteger(target.sampleCount) || target.sampleCount < 1) return "invalid-sample-count";
  if (target.colorTexture.format !== "rgba16f" && target.colorTexture.format !== "rgba32f") return "hdr-required";
  if (hasBackground) return "background";
  const contributors = frameContributors(flags);
  const unaudited = contributors.find((c) => !selectiveContributorContract(c, device));
  if (unaudited) return `frame-contributor:${selectiveContributorTag(unaudited)}`;
  if (contributors.some((c) => isStockPrd02ShadowsContributor(c) || isStockPrd02ContactShadowsContributor(c)) &&
      depthVariantFeaturesFor(flags).some((feature) =>
        !isStockPrd02DepthFeature(feature) && !isStockDepthVariantFeature(feature))) return "depth-feature";
  const sourceReason = selectiveBloomSourceDecline(source);
  if (sourceReason) return sourceReason;
  const p = post.pipeline as PostPipelineOptions | undefined;
  if (!p || typeof p !== "object" || !p.bloom || typeof p.bloom !== "object" || Array.isArray(p.bloom)) return "material-source";
  if ((p.bloom as BloomRequest).selectiveUnsupportedSource === true ||
      (typeof post.bloom === "object" && (post.bloom as unknown as BloomRequest).selectiveUnsupportedSource === true)) return "material-source";
  // Public callers cannot assert that arbitrary alpha or texture data is a
  // renderer-owned signal. Only our frame-local activation may stamp this.
  if ((p.bloom as BloomRequest).selective === true ||
      (typeof post.bloom === "object" && (post.bloom as unknown as BloomRequest).selective === true)) return "external-signal-unsupported";
  // These run on the HDR target before the fused bloom present (the v2 S10
  // grade included: runV2HdrStages draws it before returning), so the colour
  // bloom reads would no longer match the forward-written signal.
  const preBloom: readonly (readonly [string, unknown])[] = [
    ["ao", p.ao], ["ssr", p.ssr], ["god-rays", p.godRays], ["taa", p.taa || p.antiAliasing === "taa"], ["dof", p.dof],
    ["motion-blur", p.motionBlur], ["chromatic-aberration", p.chromaticAberration], ["grade", p.grade], ["auto-exposure", p.autoExposure],
    ["temporal", post.temporal || post.taa], ["depth-of-field", post.depthOfField], ["motion-blur", post.motionBlur], ["ssao", post.ssao],
    ["ssr", post.ssr], ["volumetric-light", post.volumetricLight], ["contact-shadow", post.contactShadow],
    ["chromatic-aberration", post.chromaticAberration], ["color-grade", post.colorGrade]
  ];
  const stage = preBloom.find(([, active]) => Boolean(active));
  if (stage) return `pre-bloom-stage:${stage[0]}`;
  // On the v2 HDR route before-tonemap is explicitly deferred until after
  // bloom. Earlier anchors transform color without a signal contract.
  const early = unconditionalEarlyPass([...registeredPostPasses(), ...(p.customPasses ?? [])]);
  if (early) return `pre-bloom-custom-pass:${typeof early.insertAt === "string" ? early.insertAt : "unknown"}`;
  return null;
}
