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
import type { FrameContributorContext, FrameContributor } from "../contracts/frameGraph";
import { ContactShadowPass, type ContactShadowOptions, type ContactShadowPassInput, CONTACT_MASK_BLACKBOARD_KEY } from "./ContactShadowPass";
import { contactShadowMask, contactShadowMaskDrawCounters, setContactShadowMask } from "../forward/contactShadowMaskStore";
import { MaterialInstance } from "../MaterialInstance";
import type { RenderItem } from "../ForwardPass";
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

let latestContactDevice: object | undefined;

/** Latest C-31 contact-shadow diagnostics (engine lane reads via rendering barrel). */
export function prd02ContactShadowDiagnostics(): ContactShadowsDiagnostics {
  const probe = latestContactDiagnostics.contactShadows.probe;
  if (!probe || !latestContactDevice) return latestContactDiagnostics;
  // Probing runs only: add the forward pass's draw counters, read live so they cover the whole last frame.
  return {
    contactShadows: { ...latestContactDiagnostics.contactShadows, probe: { ...probe, drawCounters: { ...contactShadowMaskDrawCounters(latestContactDevice) } } }
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
function contactDepthEligible(item: RenderItem): boolean {
  if (item.castShadow !== false) return prd02ShadowCasterEligible(item);
  const material = item.material;
  const base = material instanceof MaterialInstance ? material.baseMaterial : material;
  return base?.renderState.blend !== true;
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

// One pass per device: the mask and depth targets are allocated lazily by the pass, so a pass per
// frame would leak two render targets every frame.
const contactPasses = new WeakMap<object, ContactShadowPass>();

/** `shading`: phase `shadows`, own depth, published to forward. `tier-default`: phase `after-opaque`, scene depth, not published. */
type ContactMode = "shading" | "tier-default";

class Prd02ContactShadowsRenderPass extends BaseRenderPass {
  private readonly pass: ContactShadowPass;
  private readonly sunTowardLight: readonly number[];
  private readonly casterCount: number;

  constructor(
    private readonly ctx: FrameContributorContext,
    private readonly request: ContactShadowOptions,
    private readonly mode: ContactMode,
    sunDirection: readonly [number, number, number] | null
  ) {
    super("prd02.contactShadows", [], []);
    const shading = mode === "shading";
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
            viewProjectionMatrix: ctx.camera.viewProjectionMatrix,
            near: ctx.camera.near,
            far: ctx.camera.far,
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
      casters: shading ? ctx.items.filter(contactDepthEligible) : ctx.items.filter(prd02ShadowCasterEligible),
      depthPassOptions: {
        shaderLibrary: depthLibraryFor(ctx.device),
        variantResolver: (item: RenderItem) =>
          resolvePrd02ShadowCasterVariant(item, ctx.flags, ctx.tier, prd02DepthFeatures()),
        depthVariantFeatures: prd02DepthFeatures()
      },
      options: request
    } satisfies ContactShadowPassInput;
    let pass = contactPasses.get(ctx.device);
    if (pass) pass.configure(input);
    else {
      pass = new ContactShadowPass(input);
      contactPasses.set(ctx.device, pass);
    }
    this.pass = pass;
    this.sunTowardLight = input.sunDirection;
    this.casterCount = input.casters.length;
  }

  execute(context: RenderPassContext): void {
    this.pass.execute(context);
    const mask = this.pass.maskTexture();
    this.ctx.blackboard.set(CONTACT_MASK_BLACKBOARD_KEY, mask);
    latestContactDevice = this.ctx.device;
    let unavailable: string | undefined;
    if (this.mode === "shading") {
      // The forward counters still hold the PREVIOUS frame's draws here (they reset on publish): a mask that
      // was published but that no drawn program sampled means the effect is silently doing nothing.
      const last = contactShadowMaskDrawCounters(this.ctx.device);
      if (contactShadowMask(this.ctx.device) !== undefined && last.calls > 0 && last.maskedDraws === 0) {
        unavailable = CONTACT_SHADOWS_NO_CONSUMER_REASON;
        warnOnce("effects.contactShadows() has no visible effect: no drawn program samples the mask. The mask darkens the shadow-casting sun's light on materials that receive shadows; textured-PBR materials with glTF extension textures (clearcoat, transmission and similar) do not sample it.");
      }
      // Publish only a mask that was actually marched against real depth; the empty fallback mask
      // (all ones) is harmless but binding it would cost a texture fetch per fragment for nothing.
      const intensity = this.request.intensity ?? 1;
      const position = this.ctx.camera?.position ?? [0, 0, 0];
      setContactShadowMask(
        this.ctx.device,
        mask && this.pass.passExecuted() && intensity > 0
          ? { texture: mask, width: context.width, height: context.height, strength: intensity, cameraPosition: [position[0], position[1], position[2]] }
          : undefined
      );
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

/** Records that the scene asked for the mask but this frame cannot produce one, and says so once. */
function recordUnavailable(ctx: FrameContributorContext, reason: string, detail: string): void {
  latestContactDevice = ctx.device;
  latestContactDiagnostics = { contactShadows: { passExecuted: false, depthSource: "none", unavailable: reason } };
  warnOnce(detail);
}

export function createPrd02ContactShadowsContributor(): FrameContributor {
  prd02DepthFeatures();
  return {
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
          return [];
        }
        // The mask is marched along the shadow-casting sun and only that light's visibility samples it. With no
        // such light there is no direction to march and no consumer, so do not guess one.
        const { sunDirection } = collectShadowSystemLights(ctx);
        if (!sunDirection) {
          setContactShadowMask(ctx.device, undefined);
          recordUnavailable(
            ctx,
            CONTACT_SHADOWS_NO_SUN_REASON,
            "effects.contactShadows() has no visible effect: the scene has no shadow-casting directional light. The mask darkens the sun's light only; add a directional light with shadow: true."
          );
          return [];
        }
        return [new Prd02ContactShadowsRenderPass(ctx, request, "shading", sunDirection)];
      }
      if (phase !== "after-opaque") return [];
      if (!request || !ctx.camera || feedsShading) return [];
      const { sunDirection } = collectShadowSystemLights(ctx);
      return [new Prd02ContactShadowsRenderPass(ctx, request, "tier-default", sunDirection)];
    }
  };
}
