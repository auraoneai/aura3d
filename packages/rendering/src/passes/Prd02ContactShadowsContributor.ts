// PRD-02 §6.5 — `prd02.contactShadows` frame contributor (phase
// `after-opaque`, lane flag `A3D_QR_LIGHTING`, feature sub-flag
// `A3D_QR_LIGHTING_CONTACT`). Runs ContactShadowPass when the scene opted in
// (`effects.contactShadows` → `source.shadow.prd02Contact`), when the tier
// allows it (C-27 `shadow.contact`, Ultra only in the frozen table — Q-11-3
// asks for Medium/High), or when the sub-flag forces it. Opt-in works at any
// tier except Low. Publishes the mask on the blackboard for the shading side
// and records `contactShadows.passExecuted` for C-31 diagnostics.

import { BaseRenderPass, type RenderPassContext } from "../RenderPass";
import type { FrameContributorContext, FrameContributor } from "../contracts/frameGraph";
import { ContactShadowPass, type ContactShadowOptions, type ContactShadowPassInput, CONTACT_MASK_BLACKBOARD_KEY } from "./ContactShadowPass";
import { contactShadowMaskDrawCounters, setContactShadowMask } from "../forward/contactShadowMaskStore";
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
    /** Present only when `globalThis.__A3D_CONTACT_PROBE__ === true` (GPU diagnostics runs). */
    readonly probe?: Readonly<Record<string, unknown>>;
  };
}

let latestContactDiagnostics: ContactShadowsDiagnostics = {
  contactShadows: { passExecuted: false, depthSource: "none" }
};

/** Latest C-31 contact-shadow diagnostics (engine lane reads via rendering barrel). */
export function prd02ContactShadowDiagnostics(): ContactShadowsDiagnostics {
  const probe = latestContactDiagnostics.contactShadows.probe;
  if (!probe) return latestContactDiagnostics;
  // Probing runs only: add the forward pass's draw counters, read live so they cover the whole last frame.
  return {
    contactShadows: { ...latestContactDiagnostics.contactShadows, probe: { ...probe, drawCounters: { ...contactShadowMaskDrawCounters() } } }
  };
}

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

// One pass per device: the mask and depth targets are allocated lazily by the pass, so a pass per
// frame would leak two render targets every frame.
const contactPasses = new WeakMap<object, ContactShadowPass>();

class Prd02ContactShadowsRenderPass extends BaseRenderPass {
  private readonly pass: ContactShadowPass;
  private readonly sunTowardLight: readonly number[];
  private readonly casterCount: number;

  constructor(private readonly ctx: FrameContributorContext, private readonly request: ContactShadowOptions, private readonly publishToShading: boolean) {
    super("prd02.contactShadows", [], []);
    const { sunDirection } = collectShadowSystemLights(ctx);
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
            orthographic: ctx.camera.projection === "orthographic"
          }
        : {
            viewMatrix: new Float32Array(16).fill(0),
            projectionMatrix: new Float32Array(16).fill(0),
            near: 0.1,
            far: 100
          },
      // No sceneDepth: forward has not run yet in the `shadows` phase, so the pass renders its own.
      casters: ctx.items.filter(contactDepthEligible),
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
    // Publish only a mask that was actually marched against real depth; the empty fallback mask
    // (all ones) is harmless but binding it would cost a texture fetch per fragment for nothing.
    const intensity = this.request.intensity ?? 1;
    // Tier-default (Ultra) requests keep their existing look: only an explicit
    // `effects.contactShadows()` opt-in or the sub-flag feeds the mask to shading.
    setContactShadowMask(this.publishToShading && mask && this.pass.passExecuted() && intensity > 0
      ? { texture: mask, width: context.width, height: context.height, strength: intensity }
      : undefined);
    const probing = (globalThis as { __A3D_CONTACT_PROBE__?: boolean }).__A3D_CONTACT_PROBE__ === true;
    latestContactDiagnostics = {
      contactShadows: {
        passExecuted: this.pass.passExecuted(),
        depthSource: this.pass.depthSource(),
        ...(probing ? { probe: this.collectProbe(context) } : {})
      }
    };
  }

  private collectProbe(context: RenderPassContext): Readonly<Record<string, unknown>> {
    const camera = this.ctx.camera;
    return {
      ...this.pass.probe(context.device),
      publishedToShading: this.publishToShading,
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

export function createPrd02ContactShadowsContributor(): FrameContributor {
  prd02DepthFeatures();
  return {
    id: "prd02.contactShadows",
    owner: "prd02",
    flag: "A3D_QR_LIGHTING",
    // `shadows` runs before the forward pass is queued, so the mask exists when forward shading
    // samples it (u_contactShadowMask). It used to run `after-opaque`, where nothing could read it.
    phases: ["shadows"],
    passes: (phase, ctx) => {
      if (phase !== "shadows") return [];
      const request = contactShadowRequest(ctx);
      if (!request || !ctx.camera) {
        setContactShadowMask(undefined);
        return [];
      }
      const publish = contactShadowOptIn(ctx) !== null || ctx.flags.on(CONTACT_SHADOWS_SUB_FLAG);
      if (!publish) setContactShadowMask(undefined);
      return [new Prd02ContactShadowsRenderPass(ctx, request, publish)];
    }
  };
}
