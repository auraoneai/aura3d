/**
 * `prd02.shadows` frame contributor (C-11, flag A3D_QR_LIGHTING): runs the
 * PRD-02 shadow system during the graph's "shadows" phase, publishes
 * `ShadowFrameUniforms` under `prd02.shadowFrameUniforms` on the blackboard,
 * and binds the matching `u_prd02*` parameters onto each item's material so
 * the `a3d_prd02_shadow_lookup` chunk samples this frame's maps.
 *
 * T0-26: renders only when a forward program declares the lookup chunk; when
 * the legacy forward shader is the consumer, `Prd02ShadowBridge` already
 * rendered the cascades in the renderer's shadow step and this pass only
 * publishes them.
 */

import { PointLight, SpotLight, type Light, type Vec3 } from "@aura3d/scene";
import type { CollectedLight } from "../LightCollector";
import { BaseRenderPass, type RenderPassContext } from "../RenderPass";
import type { FrameContributor, FrameContributorContext } from "../contracts/frameGraph";
import { SHADOW_BLACKBOARD_KEY } from "../contracts/shadows";
import { sceneFromSource } from "../renderer/RenderShared";
import type { Prd02ShadowFrameUniforms, Prd02ShadowSystem, ShadowSystemConfigInput, ShadowSystemLocalLight } from "./ShadowSystem";
import { bindShadowFrameUniforms, shadowBindingMaterial } from "./ShadowFrameBinding";
import { readPrd02KillSwitches } from "../passes/Prd02SubFlags";
import { prd02ShadowCasterEligible } from "./Prd02DepthShaderLibrary";
import {
  prd02LocalShadowLights,
  prd02LookupConsumerExists,
  prd02ShadowConfig,
  prd02SunDirection,
  recordPrd02FrameObservation,
  shadowSystemForDevice,
  takePrd02BridgedShadowFrame
} from "./Prd02ShadowBridge";

export { shadowSystemForDevice } from "./Prd02ShadowBridge";

/**
 * RendererShadowOptions → ShadowSystemConfigInput (PRD-02 §6.4 mapping).
 * T0-26: the compiler's `source.shadow.prd02Shadows` wins when present.
 */
export function shadowSystemConfigFromSource(ctx: FrameContributorContext): ShadowSystemConfigInput {
  return prd02ShadowConfig(ctx.source, ctx.flags, ctx.tier, ctx.camera?.far);
}

function lightWorldPosition(light: Light): Vec3 {
  light.transform.updateWorld(undefined, true);
  const w = light.transform.worldMatrix;
  return [w[12] ?? 0, w[13] ?? 0, w[14] ?? 0];
}

function spotWorldDirection(light: SpotLight): Vec3 {
  light.transform.updateWorld(undefined, true);
  const w = light.transform.worldMatrix;
  const x = -(w[8] ?? 0);
  const y = -(w[9] ?? 0);
  const z = -(w[10] ?? 1);
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}

/**
 * Visible shadow-casting lights → system inputs (deterministic slot order).
 * T0-26: reads the compiled `source.collectedLights` when present (the same
 * list the forward pass shades with); the scene graph is the fallback.
 */
export function collectShadowSystemLights(ctx: FrameContributorContext): {
  readonly sunDirection: Vec3 | null;
  readonly localLights: ShadowSystemLocalLight[];
} {
  const atlasOn = readPrd02KillSwitches(ctx.source).atlas;
  const collected = (ctx.source as { collectedLights?: Iterable<CollectedLight> }).collectedLights;
  const localLights: ShadowSystemLocalLight[] = [];
  let slot = 0;
  if (collected !== undefined) {
    // GU47 eint (EB-3): the same selection the bridge renders local tiles from.
    for (const entry of prd02LocalShadowLights(ctx.source)) localLights.push(entry.input);
  } else {
    const scene = sceneFromSource(ctx.source);
    const lights = scene?.collectLights().filter((light) => light.visible && light.castsShadow) ?? [];
    for (const light of lights) {
      if (light instanceof SpotLight) {
        localLights.push({
          shadowIndex: slot,
          kind: "spot",
          position: lightWorldPosition(light),
          direction: spotWorldDirection(light),
          range: light.range,
          outerAngleRadians: light.angle
        });
        slot += 1;
      } else if (light instanceof PointLight) {
        localLights.push({
          shadowIndex: slot,
          kind: "point",
          position: lightWorldPosition(light),
          direction: [0, -1, 0],
          range: light.range
        });
        slot += 1;
      }
    }
  }
  const sun = prd02SunDirection(ctx.source);
  // `?a3dLighting=atlas=off` → sun-only shadows (no local-light atlas tiles).
  return { sunDirection: sun ? [sun[0], sun[1], sun[2]] : null, localLights: atlasOn ? localLights : [] };
}

/** Latest observed shadow frame for the C-31 `shadows` diagnostics section. */
export interface Prd02ShadowDiagnostics {
  readonly shadows: readonly {
    readonly light: string;
    readonly filter: string;
    readonly casterVariants: readonly string[];
    readonly sampled: boolean;
    /** Sun row only: cascades fitted this frame. */
    readonly cascadeCount?: number;
    /** Sun row only (SI-5): cascade indices allocated but not redrawn because no receiver can select them (PRD-2 WP-7). */
    readonly skippedCascades?: readonly number[];
  }[];
  readonly droppedFeatures: readonly string[];
}

let latestShadowDiagnostics: Prd02ShadowDiagnostics | null = null;

/** Last frame's observed shadow diagnostics (null until the first update). */
export function prd02ShadowDiagnostics(): Prd02ShadowDiagnostics | null {
  return latestShadowDiagnostics;
}

class Prd02ShadowsRenderPass extends BaseRenderPass {
  constructor(private readonly ctx: FrameContributorContext) {
    super("prd02.shadows", [], []);
  }

  execute(_context: RenderPassContext): void {
    const ctx = this.ctx;
    // T0-26: the bridge already rendered this frame's sun cascades for the
    // legacy forward shader — publish them, do not render a second time.
    const bridged = takePrd02BridgedShadowFrame(ctx.device);
    if (bridged) {
      ctx.blackboard.set(SHADOW_BLACKBOARD_KEY, bridged.uniforms);
      this.recordDiagnostics(bridged.config, bridged.system, true);
      return;
    }
    // Allocate cascades only for a forward consumer of a3d_prd02_shadow_lookup.
    if (!prd02LookupConsumerExists(ctx.items)) {
      ctx.blackboard.set(SHADOW_BLACKBOARD_KEY, null);
      latestShadowDiagnostics = { shadows: [], droppedFeatures: [] };
      return;
    }
    const config = shadowSystemConfigFromSource(ctx);
    const casters = ctx.items.filter(prd02ShadowCasterEligible);
    const { sunDirection, localLights } = collectShadowSystemLights(ctx);
    const system = shadowSystemForDevice(ctx.device, config);
    const uniforms: Prd02ShadowFrameUniforms | null = ctx.camera
      ? system.update({
          camera: ctx.camera,
          sun: sunDirection ? { direction: sunDirection } : null,
          casters,
          localLights,
          flags: ctx.flags,
          tier: ctx.tier
        })
      : null;
    ctx.blackboard.set(SHADOW_BLACKBOARD_KEY, uniforms);
    this.recordDiagnostics(config, system, uniforms !== null);
    if (!uniforms) return;
    for (const item of ctx.items) {
      if (item.receiveShadow === false || !item.material) continue;
      bindShadowFrameUniforms(shadowBindingMaterial(item.material), uniforms, config);
    }
  }

  private recordDiagnostics(config: ShadowSystemConfigInput, system: Prd02ShadowSystem, rendered: boolean): void {
    const diag = system.diagnostics();
    latestShadowDiagnostics = {
      shadows: [
        {
          light: "sun",
          filter: config.filter,
          casterVariants: diag.casterVariants,
          sampled: rendered && diag.cascadeCount > 0,
          cascadeCount: diag.cascadeCount,
          skippedCascades: [...diag.skippedCascades]
        },
        ...Array.from({ length: diag.localLights }, (_, i) => ({
          light: `local-${i}`,
          filter: config.filter,
          casterVariants: diag.casterVariants,
          sampled: rendered
        }))
      ],
      droppedFeatures: diag.droppedFeatures
    };
  }
}

export function createPrd02ShadowsContributor(): FrameContributor {
  return {
    id: "prd02.shadows",
    owner: "prd02",
    flag: "A3D_QR_LIGHTING",
    phases: ["collect", "shadows"],
    order: 0,
    collect(items, ctx) {
      // T0-26: runs before the renderer's shadow step; the bridge reads this
      // (frame camera for structural CameraLikes, lookup consumers among all
      // items, not just casters). Items pass through unchanged.
      recordPrd02FrameObservation(ctx.device, {
        camera: ctx.camera ? { viewProjectionMatrix: ctx.camera.viewProjectionMatrix, near: ctx.camera.near, far: ctx.camera.far } : null,
        lookupConsumer: prd02LookupConsumerExists(items)
      });
      return items;
    },
    passes(phase, ctx) {
      // `?a3dLighting=shadows=off` → no prd02 shadow passes (§6.5 kill switch).
      return phase === "shadows" && readPrd02KillSwitches(ctx.source).shadows
        ? [new Prd02ShadowsRenderPass(ctx)] : [];
    }
  };
}
