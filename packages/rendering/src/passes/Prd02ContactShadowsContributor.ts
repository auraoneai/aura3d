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
import { ContactShadowPass, type ContactShadowOptions, CONTACT_MASK_BLACKBOARD_KEY } from "./ContactShadowPass";
import { collectShadowSystemLights } from "../shadows/Prd02ShadowsContributor";
import { resolvePrd02ShadowCasterVariant, prd02DepthFeatures, registerPrd02DepthShader } from "../shadows/Prd02DepthShaderLibrary";
import { createLeanCoreShaderLibrary, type ShaderLibrary } from "../ShaderLibraryCore";
import { QUALITY_TIERS } from "../contracts/quality";
import type { AuraQualityTier } from "../contracts/quality";
import { prd02SubFlagOff, readPrd02KillSwitches, SUB_FLAG_CONTACT } from "./Prd02SubFlags";

export const CONTACT_SHADOWS_SUB_FLAG = SUB_FLAG_CONTACT;

interface ContactShadowsDiagnostics {
  readonly contactShadows: { readonly passExecuted: boolean; readonly depthSource: string };
}

let latestContactDiagnostics: ContactShadowsDiagnostics = {
  contactShadows: { passExecuted: false, depthSource: "none" }
};

/** Latest C-31 contact-shadow diagnostics (engine lane reads via rendering barrel). */
export function prd02ContactShadowDiagnostics(): ContactShadowsDiagnostics {
  return latestContactDiagnostics;
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

class Prd02ContactShadowsRenderPass extends BaseRenderPass {
  private readonly pass: ContactShadowPass;

  constructor(private readonly ctx: FrameContributorContext, request: ContactShadowOptions) {
    super("prd02.contactShadows", [], []);
    const { sunDirection } = collectShadowSystemLights(ctx);
    this.pass = new ContactShadowPass({
      sunDirection: sunDirection ?? [0, -1, 0],
      camera: ctx.camera ?? {
        viewMatrix: new Float32Array(16).fill(0),
        projectionMatrix: new Float32Array(16).fill(0),
        near: 0.1,
        far: 100
      },
      sceneDepth: ctx.sceneDepth,
      casters: ctx.items.filter((item) => item.castShadow !== false),
      depthPassOptions: {
        shaderLibrary: depthLibraryFor(ctx.device),
        variantResolver: (item) =>
          resolvePrd02ShadowCasterVariant(item, ctx.flags, ctx.tier, prd02DepthFeatures()),
        depthVariantFeatures: prd02DepthFeatures()
      },
      options: request
    });
  }

  execute(context: RenderPassContext): void {
    this.pass.execute(context);
    this.ctx.blackboard.set(CONTACT_MASK_BLACKBOARD_KEY, this.pass.maskTexture());
    latestContactDiagnostics = {
      contactShadows: {
        passExecuted: this.pass.passExecuted(),
        depthSource: this.pass.depthSource()
      }
    };
  }
}

export function createPrd02ContactShadowsContributor(): FrameContributor {
  prd02DepthFeatures();
  return {
    id: "prd02.contactShadows",
    owner: "prd02",
    flag: "A3D_QR_LIGHTING",
    phases: ["after-opaque"],
    passes: (phase, ctx) => {
      if (phase !== "after-opaque") return [];
      const request = contactShadowRequest(ctx);
      if (!request || !ctx.camera) return [];
      return [new Prd02ContactShadowsRenderPass(ctx, request)];
    }
  };
}
