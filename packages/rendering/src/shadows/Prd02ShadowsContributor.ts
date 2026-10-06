/**
 * `prd02.shadows` frame contributor (C-11, flag A3D_QR_LIGHTING): runs the
 * PRD-02 shadow system during the graph's "shadows" phase, publishes
 * `ShadowFrameUniforms` under `prd02.shadowFrameUniforms` on the blackboard,
 * and binds the matching `u_prd02*` parameters onto each item's material so
 * the `a3d_prd02_shadow_lookup` chunk samples this frame's maps.
 */

import { DirectionalLight, PointLight, SpotLight, type Light, type Vec3 } from "@aura3d/scene";
import { BaseRenderPass, type RenderPassContext } from "../RenderPass";
import type { RenderDevice } from "../RenderDevice";
import type { FrameContributor, FrameContributorContext } from "../contracts/frameGraph";
import { SHADOW_BLACKBOARD_KEY } from "../contracts/shadows";
import { collectRendererShadowOptions } from "../renderer/ShadowOrchestration";
import { sceneFromSource } from "../renderer/RenderShared";
import { Prd02ShadowSystem, type Prd02ShadowFrameUniforms, type ShadowSystemConfigInput, type ShadowSystemLocalLight } from "./ShadowSystem";
import { bindShadowFrameUniforms, shadowBindingMaterial } from "./ShadowFrameBinding";

const DEFAULT_NORMAL_BIAS_TEXELS = 1.5;

/** RendererShadowOptions → ShadowSystemConfigInput (PRD-02 §6.4 mapping). */
export function shadowSystemConfigFromSource(ctx: FrameContributorContext): ShadowSystemConfigInput {
  const options = collectRendererShadowOptions(ctx.source);
  const tierShadow = ctx.tier.shadow;
  const cascades = (options?.cascadeCount ?? tierShadow.cascades) as 1 | 2 | 3 | 4;
  // RendererShadowOptions.filter is "none" | "pcf" (legacy); "pcf" → the
  // flag-path filtered compare pipeline, "none" → a single hard tap.
  const filter: ShadowSystemConfigInput["filter"] = options?.filter === "none" ? "hard" : "pcf";
  return {
    enabled: options?.enabled !== false,
    mapSize: options?.size ?? tierShadow.mapSize,
    cascades,
    maxDistance: ctx.camera?.far ?? 200,
    splitLambda: options?.cascadeLambda ?? 0.6,
    filter,
    strength: options?.strength ?? 1,
    bias: options?.bias ?? 0,
    normalBias: DEFAULT_NORMAL_BIAS_TEXELS
  };
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

/** Visible shadow-casting lights → system inputs (deterministic slot order). */
export function collectShadowSystemLights(ctx: FrameContributorContext): {
  readonly sunDirection: Vec3 | null;
  readonly localLights: ShadowSystemLocalLight[];
} {
  const scene = sceneFromSource(ctx.source);
  const lights = scene?.collectLights().filter((light) => light.visible && light.castsShadow) ?? [];
  const sun = lights.find((light) => light.kind === "directional") ?? null;
  const localLights: ShadowSystemLocalLight[] = [];
  let slot = 0;
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
  let sunDirection: Vec3 | null = null;
  if (sun instanceof DirectionalLight) {
    sunDirection = sun.getDirection();
    const length = Math.hypot(sunDirection[0], sunDirection[1], sunDirection[2]) || 1;
    sunDirection = [sunDirection[0] / length, sunDirection[1] / length, sunDirection[2] / length];
  }
  return { sunDirection, localLights };
}

/**
 * One `Prd02ShadowSystem` per device, shared across passes; recreated when the
 * resolved config changes (map size / cascades / filter).
 */
const shadowSystems = new WeakMap<RenderDevice, { config: ShadowSystemConfigInput; system: Prd02ShadowSystem }>();

export function shadowSystemForDevice(device: RenderDevice, config: ShadowSystemConfigInput): Prd02ShadowSystem {
  const existing = shadowSystems.get(device);
  if (existing && JSON.stringify(existing.config) === JSON.stringify(config)) return existing.system;
  existing?.system.dispose();
  const system = new Prd02ShadowSystem(device, config);
  shadowSystems.set(device, { config, system });
  return system;
}

/** Latest observed shadow frame for the C-31 `shadows` diagnostics section. */
export interface Prd02ShadowDiagnostics {
  readonly shadows: readonly {
    readonly light: string;
    readonly filter: string;
    readonly casterVariants: readonly string[];
    readonly sampled: boolean;
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
    const config = shadowSystemConfigFromSource(ctx);
    const casters = ctx.items.filter((item) => item.castShadow !== false);
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
    const diag = system.diagnostics();
    latestShadowDiagnostics = {
      shadows: [
        {
          light: "sun",
          filter: config.filter,
          casterVariants: diag.casterVariants,
          sampled: uniforms !== null && diag.cascadeCount > 0
        },
        ...Array.from({ length: diag.localLights }, (_, i) => ({
          light: `local-${i}`,
          filter: config.filter,
          casterVariants: diag.casterVariants,
          sampled: uniforms !== null
        }))
      ],
      droppedFeatures: diag.droppedFeatures
    };
    if (!uniforms) return;
    for (const item of ctx.items) {
      if (item.receiveShadow === false || !item.material) continue;
      bindShadowFrameUniforms(shadowBindingMaterial(item.material), uniforms, config);
    }
  }
}

export function createPrd02ShadowsContributor(): FrameContributor {
  return {
    id: "prd02.shadows",
    owner: "prd02",
    flag: "A3D_QR_LIGHTING",
    phases: ["shadows"],
    order: 0,
    passes(phase, ctx) {
      return phase === "shadows" ? [new Prd02ShadowsRenderPass(ctx)] : [];
    }
  };
}
