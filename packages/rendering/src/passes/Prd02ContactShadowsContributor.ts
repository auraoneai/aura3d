// PRD-02 §6.5 — `prd02.contactShadows` frame contributor (lane flag
// `A3D_QR_LIGHTING`, feature sub-flag `A3D_QR_LIGHTING_CONTACT`). Runs
// ContactShadowPass when the scene opted in (`effects.contactShadows` →
// `source.shadow.prd02Contact`), when the tier allows it (C-27 `shadow.contact`,
// Ultra only in the frozen table — Q-11-3 asks for Medium/High), or when the
// sub-flag forces it. Opt-in works at any tier except Low. Records
// `contactShadows.passExecuted` for C-31 diagnostics.
//
// Two modes, never both in one frame:
//  - feeds shading (explicit opt-in or sub-flag): phase `shadows`, before the forward pass, renders its own half
//    resolution depth, and publishes the mask to the forward store. Needs a shadow-casting directional light,
//    because the mask is marched along that sun and only the sun's visibility term samples it; without one the
//    pass does not run and a diagnostic says why.
//  - tier default (Ultra, no opt-in): phase `after-opaque` exactly as before WP-4 (scene depth, no extra depth
//    pass, nothing published), so that path costs and renders what it always did.

import { BaseRenderPass, type RenderPassContext } from "../RenderPass";
import { captureFrameContributor, matchesFrameContributor, type FrameContributorFingerprint, type FrameContributorContext, type FrameContributor } from "../contracts/frameGraph";
import { ContactShadowPass, type ContactShadowOptions, type ContactShadowPassInput, CONTACT_MASK_BLACKBOARD_KEY } from "./ContactShadowPass";
import { contactShadowMaskBelongsToView, contactShadowMaskDrawCounters, resolveContactShadowMask, setContactShadowMask, validContactShadowFrameIdentity } from "../forward/contactShadowMaskStore";
import { RenderDeviceError, type RenderDevice } from "../RenderDevice";
import { isLightVisibleInHierarchy, type CollectedLight } from "../LightCollector";
import { sceneFromSource } from "../renderer/RenderShared";
import { registerBenchmarkNonSceneContributor } from "../renderer/FrameGraph";
import { MaterialInstance } from "../MaterialInstance";
import { PortableShaderMaterial } from "../PortableShaderMaterial";
import { UnlitMaterial } from "../UnlitMaterial";
import { renderStateHasExtendedCommandFields } from "../Material";
import { PBRMaterial } from "../PBRMaterial";
import { TexturedPBRMaterial } from "../TexturedPBRMaterial";
import { InstancedPBRMaterial } from "../InstancedPBRMaterial";
import { SkinnedLitMaterial } from "../SkinnedLitMaterial";
import { blendStateIsTransparent } from "../BlendModes";
import { shaderFeaturesFor } from "../contracts/program";
import { identityMat4, multiplyMat4, type Mat4 } from "@aura3d/scene";
import { registerContactShadowShadingPass } from "../shadows/contactPassTrust";
import { forwardContactGeometrySafe, forwardContactParticipantSafe, forwardContactProvidersSafe, hasForwardDrawHooks, type RenderItem } from "../ForwardPass";
import { collectShadowSystemLights } from "../shadows/Prd02ShadowsContributor";
import { resolvePrd02ShadowCasterVariant, prd02DepthFeatures, registerPrd02DepthShader, prd02ShadowCasterEligible } from "../shadows/Prd02DepthShaderLibrary";
import { createLeanCoreShaderLibrary, type ShaderLibrary } from "../ShaderLibraryCore";
import { QUALITY_TIERS } from "../contracts/quality";
import type { AuraQualityTier } from "../contracts/quality";
import { prd02SubFlagOff, readPrd02KillSwitches, SUB_FLAG_CONTACT } from "./Prd02SubFlags";

export const CONTACT_SHADOWS_SUB_FLAG = SUB_FLAG_CONTACT;

interface ContactShadowsDiagnostics {
  readonly contactShadows: {
    readonly passExecuted: boolean;
    readonly depthSource: string;
    /**
     * Set when the scene asked for the mask but nothing can show it this frame (no shadow-casting directional
     * light, or no drawn program samples the mask). Absent when the mask is working or was not requested.
     */
    readonly unavailable?: string;
    /** Present only when `globalThis.__A3D_CONTACT_PROBE__ === true` (GPU diagnostics runs). */
    readonly probe?: Readonly<Record<string, unknown>>;
  };
}

let latestContactDiagnostics: ContactShadowsDiagnostics = {
  contactShadows: { passExecuted: false, depthSource: "none" }
};

let latestContactDevice: WeakRef<RenderDevice> | undefined;

/** Latest C-31 contact-shadow diagnostics (engine lane reads via rendering barrel). */
export function prd02ContactShadowDiagnostics(): ContactShadowsDiagnostics {
  const probe = latestContactDiagnostics.contactShadows.probe;
  const device = latestContactDevice?.deref();
  if (device && (device.disposed || device.contextLost)) {
    return { contactShadows: { passExecuted: false, depthSource: "none", unavailable: "device-unavailable" } };
  }
  if (!probe || !device) return latestContactDiagnostics;
  // Probing runs only: add the forward pass's draw counters, read live so they cover the whole last frame.
  return {
    contactShadows: { ...latestContactDiagnostics.contactShadows, probe: { ...probe, drawCounters: { ...contactShadowMaskDrawCounters(device) } } }
  };
}

const warnedOnce = new Set<string>();
/** One console warning per distinct message per page: a scene that asks for a mask nothing can show should hear about it once. */
function warnOnce(message: string): void {
  if (warnedOnce.has(message)) return;
  warnedOnce.add(message);
  console.warn(`[prd02.contactShadows] ${message}`);
}

export const CONTACT_SHADOWS_NO_SUN_REASON = "no-shadow-casting-directional-light";
export const CONTACT_SHADOWS_NO_CONSUMER_REASON = "no-drawn-program-samples-the-mask";

/** `ctx.tier` is a settings object — recover its tier name (the ctx carries
 *  the shared QUALITY_TIERS constants; fall back to shadow-shape matching). */
function tierNameOf(ctx: FrameContributorContext): AuraQualityTier | null {
  for (const [name, settings] of Object.entries(QUALITY_TIERS) as [AuraQualityTier, typeof ctx.tier][]) {
    if (settings === ctx.tier) return name;
  }
  for (const [name, settings] of Object.entries(QUALITY_TIERS) as [AuraQualityTier, typeof ctx.tier][]) {
    if (settings.shadow === ctx.tier.shadow ||
        (settings.shadow.mapSize === ctx.tier.shadow.mapSize &&
         settings.shadow.cascades === ctx.tier.shadow.cascades &&
         settings.shadow.localShadowLights === ctx.tier.shadow.localShadowLights)) return name;
  }
  return null;
}

/** C-27 tier + opt-in + sub-flag resolution. Returns null when the pass must not run. */
export function contactShadowRequest(ctx: FrameContributorContext): ContactShadowOptions | null {
  // `A3D_QR_LIGHTING_CONTACT=off` or `?a3dLighting=contact=off` veto even
  // Ultra/`effects.contactShadows` requests (§6.5 kill switch).
  if (prd02SubFlagOff(ctx.flags, SUB_FLAG_CONTACT) || !readPrd02KillSwitches(ctx.source).contact) return null;
  const optIn = contactShadowOptIn(ctx);
  if (ctx.flags.on(CONTACT_SHADOWS_SUB_FLAG)) {
    return optIn ?? {};
  }
  if (optIn) {
    // effects.contactShadows() forces on at any tier except Low (PRD-02 §6.5).
    if (tierNameOf(ctx) === "low") return null;
    return optIn;
  }
  if (ctx.tier.shadow.contact) return {};
  return null;
}

/** The scene's `effects.contactShadows` opt-in rides `source.shadow` as an
 *  additive member (same convention as `Prd02ShadowOptions.prd02Shadows`). */
function contactShadowOptIn(ctx: FrameContributorContext): ContactShadowOptions | null {
  const shadow = ctx.source.shadow;
  if (!shadow || typeof shadow !== "object") return null;
  const opt = (shadow as { readonly prd02Contact?: ContactShadowOptions }).prd02Contact;
  return opt ?? null;
}

// One lean depth library per device (registered with the prd02 depth shader).
const contactDepthLibraries = new WeakMap<object, ShaderLibrary>();
function depthLibraryFor(device: object): ShaderLibrary {
  let lib = contactDepthLibraries.get(device);
  if (!lib) {
    lib = createLeanCoreShaderLibrary();
    registerPrd02DepthShader(lib);
    contactDepthLibraries.set(device, lib);
  }
  return lib;
}

/**
 * Depth for the mask is rendered by the pass itself (half resolution, camera space) because the
 * mask must exist BEFORE the forward pass samples it; the C-01 scene-depth copy only exists
 * after the opaque pass. Every opaque item writes depth, including receivers authored with
 * `castShadow: false` (floors): the march needs the receiver surface, not just the casters.
 */
function contactDepthItems(items: readonly RenderItem[]): RenderItem[] {
  // A shadow proxy is allowed for light-space shadow maps, but camera depth
  // needs the actual visible geometry. Never feed the proxy to this pass.
  return items.filter(item => item.instanceTransforms === undefined || item.instanceTransforms.length > 0)
    .map(item => item.shadowGeometry === undefined ? item : { ...item, shadowGeometry: undefined });
}

/** Refuse an entire mask if any visible surface could change its depth. The
 * mask is shared by every receiver, so skipping a problematic item alone is
 * insufficient. Run immediately before depth submission, after clearing any
 * earlier publication, and re-check on every frame. */
function validateContactDepthItems(ctx: FrameContributorContext): readonly RenderItem[] {
  const strict = ctx.flags.on("A3D_QR_STRICT");
  const fail = (item: RenderItem, reason: string): never => {
    throw new RenderDeviceError(`Contact shadow camera depth cannot represent ${reason}`, "CONTACT_SHADOW_DEPTH_UNSUPPORTED", { label: item.label, reason });
  };
  const identity = identityMat4();
  if (hasForwardDrawHooks()) {
    throw new RenderDeviceError("Contact shadow camera depth cannot be used with forward draw hooks", "CONTACT_SHADOW_DEPTH_UNSUPPORTED", { reason: "forward draw hooks" });
  }
  if (!forwardContactProvidersSafe(ctx.flags)) {
    throw new RenderDeviceError("Contact shadow camera depth requires verified forward shader providers", "CONTACT_SHADOW_DEPTH_UNSUPPORTED", { reason: "forward shader providers" });
  }
  const identityMatrix = (matrix: ArrayLike<number>) => matrix.length === 16 && Array.from(matrix).every((value, i) => value === identity[i]);
  const sameMatrix = (a: ArrayLike<number>, b: ArrayLike<number>) => a.length === 16 && Array.from(a).every((value, i) => Number.isFinite(value) && Math.abs(value - b[i]!) <= 1e-5 * Math.max(1, Math.abs(b[i]!)));
  const features = shaderFeaturesFor(ctx.flags);
  // Strict keeps the all-or-nothing contract. Otherwise a participant whose camera depth the mask cannot reproduce
  // (skinned, morphed, wind-deformed, alpha-tested, blended, custom shader) is left out of the mask depth and receives
  // the mask of the surface behind it, instead of removing the contact shadow from the whole scene.
  const included: RenderItem[] = [];
  const excluded = new Map<string, number>();
  for (const item of ctx.items) {
    // A per-draw callback aborts every forward draw while a mask is published, so it cannot be left out.
    if (item.onBeforeRender) fail(item, "a draw callback that may change the scene");
    try { checkItem(item); included.push(item); }
    catch (error) {
      if (strict || !(error instanceof RenderDeviceError) || error.code !== "CONTACT_SHADOW_DEPTH_UNSUPPORTED") throw error;
      const reason = String((error.details as { reason?: unknown } | undefined)?.reason ?? "unsupported participant");
      excluded.set(reason, (excluded.get(reason) ?? 0) + 1);
    }
  }
  if (excluded.size > 0) {
    warnOnce(`CONTACT_SHADOW_PARTIAL: ${[...excluded].map(([reason, count]) => `${count} participant(s) with ${reason}`).join(", ")} are outside the contact shadow depth and receive the mask of the surface behind them.`);
  }
  return included;
  function checkItem(item: RenderItem): void {
    if (!forwardContactGeometrySafe(item, ctx.flags)) fail(item, "an unverified material or geometry participant");
    if (item.instanceTransforms !== undefined && item.instanceTransforms.length === 0) return;
    const material = item.material;
    const base = material instanceof MaterialInstance ? material.baseMaterial : material;
    if (base instanceof PortableShaderMaterial) fail(item, "an unverified custom or graph material participant");
    if (!forwardContactParticipantSafe(item, ctx.flags)) fail(item, "an unverified material or geometry participant");
    if (item.geometry.topology !== "triangles") fail(item, "non-triangle coverage");
    if (item.geometryMatrix && !identityMatrix(item.geometryMatrix)) fail(item, "a geometry transform");
    if (item.instanceAttributes?.length || (item.instanceCount !== undefined && item.instanceCount > 1 && !item.instanceTransforms)) fail(item, "custom instance attributes");
    if (item.skinning || item.morphTargets?.length || item.morphWeights?.length) fail(item, "skinning or morph deformation");
    if ((item.lodFade !== undefined && Math.abs(item.lodFade) < 0.999) || (item.cameraFade !== undefined && item.cameraFade < 0.999)) fail(item, "dithered coverage");
    if (item.modelViewProjectionMatrix && ctx.camera) {
      const model = (item.modelMatrix ?? identity) as Mat4;
      const cameraMvp = multiplyMat4(ctx.camera.viewProjectionMatrix as unknown as Mat4, model);
      const rasterMvp = multiplyMat4((ctx.rasterViewProjectionMatrix ?? ctx.camera.viewProjectionMatrix) as unknown as Mat4, model);
      if (!sameMatrix(item.modelViewProjectionMatrix, cameraMvp) && !sameMatrix(item.modelViewProjectionMatrix, rasterMvp)) fail(item, "an independent model-view-projection matrix");
    }
    if (base) {
      const state = base.renderState;
      if (blendStateIsTransparent(state) || !state.depthTest || !state.depthWrite || (state.depthCompareV2 ?? state.depthCompare) !== "less-equal"
        || state.alphaToCoverage === true || state.polygonOffset != null || state.stencil != null || state.scissor != null || renderStateHasExtendedCommandFields(state)) fail(item, "a material depth or blend state");
      const cutoff = material!.getParameter("u_alphaCutoff");
      if (typeof cutoff === "number" && cutoff > 0) fail(item, "alpha-tested coverage");
      if (material!.getParameter("u_spriteMode") === 1 || material!.getParameter("u_roundPoints") === 1) fail(item, "sprite or point coverage");
      if (![UnlitMaterial.prototype, PBRMaterial.prototype, TexturedPBRMaterial.prototype, InstancedPBRMaterial.prototype, SkinnedLitMaterial.prototype].includes(Object.getPrototypeOf(base))) {
        fail(item, "an unknown material shader");
      }
    }
    const clipped = item as RenderItem & { readonly globalClipping?: { readonly enabled?: boolean; readonly disposed?: boolean; readonly planes?: readonly unknown[] }; readonly materialClipping?: { readonly enabled?: boolean; readonly disposed?: boolean; readonly planes?: readonly unknown[] } };
    const materialClip = (base as typeof base & { readonly clipping?: typeof clipped.materialClipping })?.clipping;
    if ([clipped.globalClipping, clipped.materialClipping ?? materialClip].some(group => group && group.enabled !== false && !group.disposed && (group.planes?.length ?? 0) > 0)) fail(item, "clipping coverage");
    for (const feature of features) {
      if (!feature.hooks.some(hook => hook === "vertex:deform" || hook === "vertex:world" || hook === "vertex:end" || hook === "fragment:alpha")) continue;
      if (feature.select({ item, pass: "forward", tier: ctx.tier, flags: ctx.flags, frameContext: ctx }) !== undefined) fail(item, `shader feature ${feature.id}`);
    }
  }
}

/** Match the first visible casting sun selected by prd02SunDirection, retaining its identity. */
function contactSourceLight(ctx: FrameContributorContext): object | null {
  const scene = sceneFromSource(ctx.source);
  const collected = (ctx.source as { readonly collectedLights?: Iterable<CollectedLight> }).collectedLights;
  if (collected !== undefined) {
    for (const light of collected) {
      if (light.kind === "directional" && light.castsShadow && isLightVisibleInHierarchy(light.source, scene?.root)) return light.source ?? null;
    }
    return null;
  }
  return scene?.collectLights().find(light => isLightVisibleInHierarchy(light, scene.root) && light.castsShadow && light.kind === "directional") ?? null;
}

/**
 * Orthographic cameras do not always say so: the frame camera's `projection` defaults to "perspective" when the scene
 * camera has no such field (OrthographicCamera has none), which on the first GPU orthographic run left the mask at all
 * ones. The combined view-projection settles it: an orthographic matrix leaves clip w at exactly 1 (fourth row 0,0,0,1;
 * column-major elements 3, 7, 11, 15), a perspective one does not.
 */
export function isOrthographicFrameCamera(camera: { readonly projection: string; readonly viewProjectionMatrix: ArrayLike<number> }): boolean {
  if (camera.projection === "orthographic") return true;
  const m = camera.viewProjectionMatrix;
  if (m.length < 16) return false;
  const eps = 1e-6;
  return Math.abs(m[3]!) < eps && Math.abs(m[7]!) < eps && Math.abs(m[11]!) < eps && Math.abs(m[15]! - 1) < eps;
}

/** `shading`: phase `shadows`, own depth, published to forward. `tier-default`: phase `after-opaque`, scene depth, not published. */
type ContactMode = "shading" | "tier-default";
interface ContactPassCache {
  readonly passes: WeakMap<object, ContactShadowPass>;
  readonly refs: Set<WeakRef<ContactShadowPass>>;
}

// Camera-depth shading accepts only rigid opaque participants. Its variant
// key encodes instancing directly; registered shadow-feature callbacks are
// unnecessary and could mutate a different participant during depth draws.
const SHADING_DEPTH_FEATURES = Object.freeze([]) as ReturnType<typeof prd02DepthFeatures>;

class Prd02ContactShadowsRenderPass extends BaseRenderPass {
  private readonly pass: ContactShadowPass;
  private readonly input: ContactShadowPassInput;
  private readonly sunTowardLight: readonly number[];
  private readonly casterCount: number;

  constructor(
    private readonly ctx: FrameContributorContext,
    private readonly request: ContactShadowOptions,
    private readonly mode: ContactMode,
    sunDirection: readonly [number, number, number] | null,
    private readonly sourceLight: object | null,
    cache: ContactPassCache
  ) {
    super("prd02.contactShadows", [], mode === "shading" ? [CONTACT_MASK_BLACKBOARD_KEY] : []);
    if (mode === "shading") registerContactShadowShadingPass(this, Prd02ContactShadowsRenderPass.prototype, originalShadingPassExecute);
    const shading = mode === "shading";
    const depthFeatures = shading ? SHADING_DEPTH_FEATURES : prd02DepthFeatures();
    // `CollectedLight.direction` is the direction the light travels; the march wants the direction
    // TOWARD the light (the forward shaders use `lightDirection = -direction` the same way).
    const input = {
      sunDirection: sunDirection ? ([-sunDirection[0], -sunDirection[1], -sunDirection[2]] as const) : ([0, 1, 0] as const),
      camera: ctx.camera
        ? {
            viewMatrix: ctx.camera.viewMatrix,
            projectionMatrix: ctx.camera.projectionMatrix,
            // The frame camera's separate view/projection can be identity (the production renderer resolves
            // cameras that expose only a combined matrix), so the march works from the combined one.
            // Renderer updates this shared f32 matrix in place after temporal
            // jitter is chosen, before the graph executes.
            viewProjectionMatrix: ctx.rasterViewProjectionMatrix ?? ctx.camera.viewProjectionMatrix,
            near: ctx.camera.near,
            far: ctx.camera.far,
            ...(ctx.camera.depth ? { depth: ctx.camera.depth } : {}),
            orthographic: isOrthographicFrameCamera(ctx.camera)
          }
        : {
            viewMatrix: new Float32Array(16).fill(0),
            projectionMatrix: new Float32Array(16).fill(0),
            near: 0.1,
            far: 100
          },
      // Shading mode: forward has not run yet in the `shadows` phase, so the pass renders its own depth.
      // Tier-default mode: the C-01 scene depth copy exists after the opaque pass, as before WP-4.
      ...(shading ? {} : { sceneDepth: ctx.sceneDepth }),
      // Shading participants are checked at execute time before inspecting or copying any item.
      casters: shading ? [] : ctx.items.filter(prd02ShadowCasterEligible),
      depthPassOptions: {
        shaderLibrary: depthLibraryFor(ctx.device),
        checkedSubmission: ctx.device.kind === "webgpu",
        timeSeconds: ctx.timeSeconds,
        ...(ctx.camera ? { cameraPosition: ctx.camera.position } : {}),
        ...(ctx.camera?.depth ? { depthConvention: ctx.camera.depth } : {}),
        // A logarithmic camera prepass encodes against the frame view and range.
        ...(ctx.camera?.depth?.mode === "logarithmic" ? { depthViewMatrix: ctx.camera.viewMatrix, depthRange: { near: ctx.camera.near, far: ctx.camera.far } } : {}),
        variantResolver: (item: RenderItem) =>
          resolvePrd02ShadowCasterVariant(item, ctx.flags, ctx.tier, depthFeatures),
        depthVariantFeatures: depthFeatures
      },
      options: request
    } satisfies ContactShadowPassInput;
    let pass = cache.passes.get(ctx.device);
    if (!pass) {
      pass = new ContactShadowPass(input);
      cache.passes.set(ctx.device, pass);
      // The lane is registered globally. Do not retain dead devices merely so
      // an explicitly disposed contributor can release its remaining passes.
      for (const ref of cache.refs) if (!ref.deref()) cache.refs.delete(ref);
      cache.refs.add(new WeakRef(pass));
    }
    this.pass = pass;
    this.input = input;
    this.sunTowardLight = input.sunDirection;
    this.casterCount = shading ? ctx.items.length : input.casters.length;
  }

  execute(context: RenderPassContext): void {
    latestContactDevice = new WeakRef(this.ctx.device);
    let unavailable: string | undefined;
    if (this.mode === "shading") {
      // The forward counters still hold the PREVIOUS frame's draws here (they reset on publish): a mask that
      // was published but that no drawn program sampled means the effect is silently doing nothing.
      const last = contactShadowMaskDrawCounters(this.ctx.device);
      if (contactShadowMaskBelongsToView(this.ctx) && last.calls > 0 && last.maskedDraws === 0) {
        unavailable = CONTACT_SHADOWS_NO_CONSUMER_REASON;
        warnOnce("effects.contactShadows() has no visible effect: no drawn program samples the mask. The mask darkens the shadow-casting sun's light on materials that receive shadows; textured-PBR materials with glTF extension textures (clearcoat, transmission and similar) do not sample it.");
      }
      setContactShadowMask(this.ctx.device, undefined);
    }
    this.ctx.blackboard.delete(CONTACT_MASK_BLACKBOARD_KEY);
    try {
      if (context.device !== this.ctx.device || context.width !== this.ctx.width || context.height !== this.ctx.height) {
        throw new RenderDeviceError("Contact shadow pass frame context does not match its target", "CONTACT_SHADOW_FRAME_MISMATCH");
      }
      if (this.mode === "shading" && !validContactShadowFrameIdentity(this.ctx)) {
        throw new RenderDeviceError("Contact shadows require a renderer, view and frame identity", "CONTACT_SHADOW_FRAME_IDENTITY_REQUIRED");
      }
      if (this.mode === "shading" && this.ctx.rasterViewportIsFull !== true) {
        throw new RenderDeviceError("Contact shadows require a verified full raster viewport", "CONTACT_SHADOW_VIEWPORT_UNSUPPORTED");
      }
      if (this.mode === "shading" && !this.sourceLight) {
        throw new RenderDeviceError("Contact shadows require an identifiable directional light", "CONTACT_SHADOW_LIGHT_IDENTITY_REQUIRED");
      }
      let depthItems: readonly RenderItem[] = this.ctx.items;
      if (this.mode === "shading") {
        const strict = this.ctx.flags.on("A3D_QR_STRICT");
        // The renderer already decided this frame's graph cannot carry a verified mask: publish nothing.
        const degraded = this.ctx.blackboard.get(CONTACT_SHADOW_DEGRADED_KEY);
        if (!strict && typeof degraded === "string") {
          recordUnavailable(this.ctx, `degraded:${degraded}`, `CONTACT_SHADOW_DEGRADED: ${degraded}. The contact shadow mask is skipped; the scene still draws.`);
          return;
        }
        try { depthItems = validateContactDepthItems(this.ctx); }
        catch (error) {
          if (strict || !(error instanceof RenderDeviceError) || error.code !== "CONTACT_SHADOW_DEPTH_UNSUPPORTED") throw error;
          // A participant the mask's camera depth cannot represent: degrade to no mask for the frame instead of failing the mount.
          recordUnavailable(this.ctx, "degraded:depth-participants", `CONTACT_SHADOW_DEGRADED: ${error.message}. The contact shadow mask is skipped; the scene still draws.`);
          return;
        }
      }
      // The reusable pass may have been referenced by another queued graph;
      // select this particular graph's camera and items immediately before use.
      this.pass.configure(this.mode === "shading" ? {
        ...this.input,
        casters: contactDepthItems(depthItems),
        depthPassOptions: { ...this.input.depthPassOptions, timeSeconds: this.ctx.timeSeconds, cameraPosition: this.ctx.camera!.position }
      } : this.input);
      this.pass.execute(context);
      const mask = this.pass.maskTexture();
      this.ctx.blackboard.set(CONTACT_MASK_BLACKBOARD_KEY, mask);
      // The white fallback is useful for diagnostics but was not marched and is
      // never published to shading. A checked successful draw is required.
      if (this.mode === "shading" && mask && this.pass.passExecuted()) {
        const intensity = this.request.intensity ?? 1;
        const position = this.ctx.camera?.position ?? [0, 0, 0];
        if (intensity > 0) {
          setContactShadowMask(this.ctx.device,
            { texture: mask, width: context.width, height: context.height, strength: intensity, cameraPosition: [position[0], position[1], position[2]], sourceLight: this.sourceLight! },
            this.ctx, this.pass.maskTarget() ?? undefined);
          if (!resolveContactShadowMask({ device: context.device, width: context.width, height: context.height, frame: this.ctx })) {
            throw new RenderDeviceError("Contact shadow mask could not be published for this frame", "CONTACT_SHADOW_PUBLICATION_FAILED");
          }
        }
      }
    } catch (error) {
      setContactShadowMask(this.ctx.device, undefined);
      this.ctx.blackboard.delete(CONTACT_MASK_BLACKBOARD_KEY);
      latestContactDiagnostics = { contactShadows: { passExecuted: false, depthSource: this.pass.depthSource(), unavailable: "producer-failed" } };
      throw error;
    }
    const probing = (globalThis as { __A3D_CONTACT_PROBE__?: boolean }).__A3D_CONTACT_PROBE__ === true;
    latestContactDiagnostics = {
      contactShadows: {
        passExecuted: this.pass.passExecuted(),
        depthSource: this.pass.depthSource(),
        ...(unavailable ? { unavailable } : {}),
        ...(probing ? { probe: this.collectProbe(context) } : {})
      }
    };
  }

  private collectProbe(context: RenderPassContext): Readonly<Record<string, unknown>> {
    const camera = this.ctx.camera;
    return {
      ...this.pass.probe(context.device),
      publishedToShading: this.mode === "shading",
      request: this.request,
      sunTowardLight: this.sunTowardLight,
      frameSize: [context.width, context.height],
      camera: camera
        ? { view: Array.from(camera.viewMatrix), projection: Array.from(camera.projectionMatrix), viewProjection: Array.from(camera.viewProjectionMatrix), near: camera.near, far: camera.far }
        : null,
      casterCount: this.casterCount
    };
  }
}

const CONTACT_SHADOW_DEGRADED_KEY = "prd02.contactShadowDegraded";

const originalShadingPassExecute = Prd02ContactShadowsRenderPass.prototype.execute;

/** Records that the scene asked for the mask but this frame cannot produce one, and says so once. */
function recordUnavailable(ctx: FrameContributorContext, reason: string, detail: string): void {
  latestContactDevice = new WeakRef(ctx.device);
  latestContactDiagnostics = { contactShadows: { passExecuted: false, depthSource: "none", unavailable: reason } };
  warnOnce(detail);
}

const selectiveContributors = new WeakMap<FrameContributor, FrameContributorFingerprint>();
const stockDepthFeatures = new WeakMap<object, { descriptors: PropertyDescriptorMap; arrays: Map<string, readonly unknown[]> }>();

/** Snapshot the lane's built-ins at factory registration, before frame use. */
function captureStockDepthFeatures(): void {
  for (const feature of prd02DepthFeatures()) {
    if (stockDepthFeatures.has(feature)) continue;
    const descriptors = Object.getOwnPropertyDescriptors(feature);
    const arrays = new Map<string, readonly unknown[]>();
    for (const key of ["passes", "chunks", "hooks"] as const) {
      const value = descriptors[key]?.value;
      if (Array.isArray(value)) arrays.set(key, [...value]);
    }
    stockDepthFeatures.set(feature, { descriptors, arrays });
  }
}

export function isStockPrd02DepthFeature(feature: object): boolean {
  const snapshot = stockDepthFeatures.get(feature);
  if (!snapshot || Object.getPrototypeOf(feature) !== Object.prototype) return false;
  const current = Object.getOwnPropertyDescriptors(feature);
  const keys = Reflect.ownKeys(snapshot.descriptors);
  if (Reflect.ownKeys(current).length !== keys.length) return false;
  for (const key of keys) {
    const a = Reflect.get(current, key) as PropertyDescriptor | undefined;
    const b = Reflect.get(snapshot.descriptors, key) as PropertyDescriptor | undefined;
    if (!a || !b || a.value !== b.value || a.get !== undefined || a.set !== undefined ||
        a.writable !== b.writable || a.configurable !== b.configurable || a.enumerable !== b.enumerable) return false;
  }
  for (const [key, expected] of snapshot.arrays) {
    const actual = current[key]?.value;
    if (!Array.isArray(actual) || Object.getPrototypeOf(actual) !== Array.prototype ||
        actual.length !== expected.length || Reflect.ownKeys(actual).length !== expected.length + 1 ||
        !expected.every((value, index) => Object.getOwnPropertyDescriptor(actual, index)?.value === value)) return false;
  }
  return true;
}

export function isStockPrd02ContactShadowsContributor(contributor: FrameContributor): boolean {
  const fingerprint = selectiveContributors.get(contributor);
  return fingerprint !== undefined && matchesFrameContributor(contributor, fingerprint);
}

export function createPrd02ContactShadowsContributor(): FrameContributor {
  prd02DepthFeatures();
  captureStockDepthFeatures();
  // One reusable pass per device for this contributor, released on disposal or loss.
  let cache: ContactPassCache = { passes: new WeakMap(), refs: new Set() };
  const contributor: FrameContributor = {
    id: "prd02.contactShadows",
    owner: "prd02",
    flag: "A3D_QR_LIGHTING",
    // Feeding shading runs in `shadows`, before the forward pass is queued, so the mask exists when forward
    // shading samples it (u_contactShadowMask). The tier-default path keeps its pre-WP-4 `after-opaque` slot.
    phases: ["shadows", "after-opaque"],
    passes: (phase, ctx) => {
      const request = contactShadowRequest(ctx);
      const feedsShading = contactShadowOptIn(ctx) !== null || ctx.flags.on(CONTACT_SHADOWS_SUB_FLAG);
      if (phase === "shadows") {
        // A frame that does not build a mask clears the previous one; the shading branch publishes in execute()
        // and leaves the previous frame's mask and draw counters in place until then, so it can check them.
        if (!request || !ctx.camera || !feedsShading) {
          setContactShadowMask(ctx.device, undefined);
          ctx.blackboard.delete(CONTACT_MASK_BLACKBOARD_KEY);
          return [];
        }
        // The mask is marched along the shadow-casting sun and only that light's visibility samples it. With no
        // such light there is no direction to march and no consumer, so do not guess one.
        const { sunDirection } = collectShadowSystemLights(ctx);
        if (!sunDirection) {
          setContactShadowMask(ctx.device, undefined);
          ctx.blackboard.delete(CONTACT_MASK_BLACKBOARD_KEY);
          recordUnavailable(
            ctx,
            CONTACT_SHADOWS_NO_SUN_REASON,
            "effects.contactShadows() has no visible effect: the scene has no shadow-casting directional light. The mask darkens the sun's light only; add a directional light with shadow: true."
          );
          return [];
        }
        return [new Prd02ContactShadowsRenderPass(ctx, request, "shading", sunDirection, contactSourceLight(ctx), cache)];
      }
      if (phase !== "after-opaque") return [];
      if (!request || !ctx.camera || feedsShading) return [];
      const { sunDirection } = collectShadowSystemLights(ctx);
      return [new Prd02ContactShadowsRenderPass(ctx, request, "tier-default", sunDirection, null, cache)];
    },
    dispose: () => {
      const failures: unknown[] = [];
      for (const ref of cache.refs) {
        try { ref.deref()?.dispose(); } catch (error) { failures.push(error); }
      }
      cache.refs.clear();
      cache = { passes: new WeakMap(), refs: new Set() };
      if (failures.length) throw new AggregateError(failures, "Contact shadow contributor disposal failed");
    }
  };
  // The shadows hook can only render depth and visibility to its own targets;
  // it restores the caller's target even on failure and never writes scene color.
  registerBenchmarkNonSceneContributor(contributor, ["shadows"]);
  selectiveContributors.set(contributor, captureFrameContributor(contributor));
  return contributor;
}
