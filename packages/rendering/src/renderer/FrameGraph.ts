// C-01 seam (PR 0b) — frame contributor phase-hook dispatcher. CONTRACTS.md §C-01.
// File: packages/rendering/src/renderer/FrameGraph.ts — owner lane 01.
//
// Called from Renderer.render / Renderer.renderAsync at the phase boundaries listed
// in CONTRACTS.md ("collect" after collectRenderItemsWithDiagnostics, "shadows" after
// executeRendererShadowMap, "background" between EnvironmentBackgroundPass and
// ForwardPass, "after-opaque"/"transmission"/"transparent"/"after-transparent" after
// ForwardPass, "post-hdr" before executePostprocess, "after-output" after it).
// With zero registered contributors every entry point is a no-op: no passes are
// added, no draws happen, and the frame is pixel-identical.

import { Scene, identityMat4, type Mat4 } from "@aura3d/scene";
import type { RenderDevice, RenderTarget } from "../RenderDevice";
import type { RenderGraph } from "../RenderGraph";
import { BaseRenderPass, type RenderPassContext } from "../RenderPass";
import type { RenderItem } from "../ForwardPass";
import type { RenderSource } from "../contracts/renderSource";
import type { QrFlags } from "../contracts/core";
import { QUALITY_TIERS, type AuraQualityTierSettings } from "../contracts/quality";
import {
  frameContributors,
  type AuraFramePhase,
  type FrameCamera,
  type FrameContributorContext,
  type TransparentQueueItem
} from "../contracts/frameGraph";

const EMPTY_QR_FLAGS: QrFlags = { values: {}, on: () => false };

let defaultQrFlags: QrFlags = EMPTY_QR_FLAGS;

// T0-28: per-renderer flag seam. Flags resolve per device so two mounted
// renderers with different `a3d-qr` values cannot stampede each other —
// rasterization decision points (Renderer/ForwardPass) always read through
// the device. The module-level default remains for ambient readers
// (back-compat; engine sets it at mount alongside the scoped entry).
const qrFlagsByDevice = new WeakMap<RenderDevice, QrFlags>();

/** Engine-side wiring: set once flags resolve (createAuraApp / createGameApp). */
export function setRendererQrFlags(flags: QrFlags, device?: RenderDevice): void {
  if (device) qrFlagsByDevice.set(device, flags);
  else defaultQrFlags = flags;
}

export function rendererQrFlags(device?: RenderDevice): QrFlags {
  return (device ? qrFlagsByDevice.get(device) : undefined) ?? defaultQrFlags;
}

/** Minimal resolved-camera shape produced by Renderer.resolveCamera. */
export interface ResolvedCameraInput {
  readonly viewProjectionMatrix: Mat4;
  readonly viewMatrix?: Mat4;
  readonly camera?: unknown;
  readonly cameraPosition?: readonly [number, number, number];
}

const toF32 = (value: Float32Array | readonly number[]): Float32Array =>
  value instanceof Float32Array ? value : Float32Array.from(value);

/** Best-effort FrameCamera for the PR 0b stub; PRD 01 publishes real history later. */
export function toFrameCamera(
  resolvedCamera: ResolvedCameraInput | undefined,
  cameraViewProjection: Mat4 | undefined,
  cameraPosition: readonly [number, number, number] | undefined
): FrameCamera | null {
  if (!resolvedCamera) return null;
  const cam = resolvedCamera.camera as {
    readonly projectionMatrix?: Mat4;
    readonly near?: number;
    readonly far?: number;
    readonly projection?: "perspective" | "orthographic";
  } | undefined;
  return {
    viewMatrix: resolvedCamera.viewMatrix ? toF32(resolvedCamera.viewMatrix) : toF32(identityMat4()),
    projectionMatrix: cam?.projectionMatrix ? toF32(cam.projectionMatrix) : toF32(identityMat4()),
    viewProjectionMatrix: toF32(cameraViewProjection ?? resolvedCamera.viewProjectionMatrix),
    previousViewProjectionMatrix: null,
    near: cam?.near ?? 0.1,
    far: cam?.far ?? 1000,
    projection: cam?.projection ?? "perspective",
    position: cameraPosition ?? resolvedCamera.cameraPosition ?? [0, 0, 0]
  };
}

export interface RendererFrameHooksInput {
  readonly device: RenderDevice;
  readonly width: number;
  readonly height: number;
  readonly source: RenderSource | Scene | Iterable<RenderItem>;
  readonly camera: FrameCamera | null;
  readonly frameIndex?: number;
  readonly tier?: AuraQualityTierSettings;
}

/** C-01 blackboard key for the forward color target (R-01-1). */
export const PRD01_FORWARD_TARGET = "prd01.forwardTarget";

/** C-13 (Q-03-1): lane 03 publishes grade × auto-exposure here; OutputPass multiplies it in. */
export const PRD03_EXPOSURE = "prd03.exposure";

/** C-01 (§8.4 step 1): resolved scene-depth copy target published for after-opaque consumers. */
export const AURA_SCENE_DEPTH_COPY = "aura.scene.depth.copy";

class ContributorTransparentPass extends BaseRenderPass {
  constructor(
    private readonly queue: readonly TransparentQueueItem[],
    private readonly frame: FrameContributorContext
  ) {
    super("qr.contributor.transparents", [], ["aura.scene.color"]);
  }

  execute(_context: RenderPassContext): void {
    for (const item of this.queue) {
      item.draw(this.frame);
    }
  }
}

export class RendererFrameHooks {
  private readonly flags: QrFlags;
  private readonly blackboard = new Map<string, unknown>();
  private readonly frameIndex: number;
  private readonly timeSeconds: number;
  private readonly renderSource: RenderSource;

  constructor(private readonly input: RendererFrameHooksInput) {
    this.flags = rendererQrFlags(input.device);
    this.frameIndex = input.frameIndex ?? 0;
    this.timeSeconds = typeof performance !== "undefined" ? performance.now() / 1000 : Date.now() / 1000;
    const source = input.source;
    this.renderSource = source instanceof Scene
      ? { scene: source }
      : typeof source === "object" && Symbol.iterator in source
        ? { renderItems: source }
        : source;
  }

  private forwardTarget: RenderTarget | null = null;

  /**
   * R-01-1: the Renderer hands the forward color target in after
   * `ensureForwardColorTarget`; `ctx.sceneDepth` then exposes the real depth
   * texture and the blackboard publishes it at `"prd01.forwardTarget"`.
   */
  setForwardTarget(target: RenderTarget | null): void {
    this.forwardTarget = target;
  }

  private sceneDepthCopy: RenderTarget | null = null;

  /** Lane 01 publishes the scene-depth copy target before the after-opaque phase. */
  setSceneDepthCopy(target: RenderTarget | null): void {
    this.sceneDepthCopy = target;
    if (target) this.blackboard.set(AURA_SCENE_DEPTH_COPY, target);
  }

  /** Read a blackboard value published by a contributor (or lane 01 itself). */
  blackboardValue<T>(key: string): T | undefined {
    return this.blackboard.get(key) as T | undefined;
  }

  private context(items: readonly RenderItem[]): FrameContributorContext {
    const depthTexture = this.forwardTarget?.depthTexture ?? null;
    if (this.forwardTarget) {
      this.blackboard.set(PRD01_FORWARD_TARGET, this.forwardTarget);
    }
    return {
      device: this.input.device,
      width: this.input.width,
      height: this.input.height,
      frameIndex: this.frameIndex,
      timeSeconds: this.timeSeconds,
      camera: this.input.camera,
      source: this.renderSource,
      items,
      tier: this.input.tier ?? QUALITY_TIERS.high,
      flags: this.flags,
      sceneDepth: {
        texture: depthTexture,
        available: depthTexture !== null,
        linearize: {
          near: this.input.camera?.near ?? 0.1,
          far: this.input.camera?.far ?? 1000,
          orthographic: this.input.camera?.projection === "orthographic"
        }
      },
      blackboard: this.blackboard
    };
  }

  /** "collect" phase — contributor item-list transforms, applied in order. */
  collect(items: readonly RenderItem[]): readonly RenderItem[] {
    const contributors = frameContributors(this.flags);
    if (contributors.length === 0) return items;
    let out = items;
    for (const contributor of contributors) {
      if (!contributor.phases.includes("collect") || !contributor.collect) continue;
      const next = contributor.collect([...out], this.context(out));
      if (next) out = next;
    }
    return out;
  }

  /** Graph-attached phases — contributor passes appended to the render graph. */
  addPasses(graph: RenderGraph, phase: AuraFramePhase, items: readonly RenderItem[]): void {
    const contributors = frameContributors(this.flags);
    if (contributors.length === 0) return;
    const ctx = this.context(items);
    for (const contributor of contributors) {
      if (!contributor.phases.includes(phase)) continue;
      for (const pass of contributor.passes?.(phase, ctx) ?? []) {
        assertPhaseSpace(phase, pass, contributor);
        graph.addPass(pass);
      }
      if (phase === "transparent") {
        const queue = contributor.transparentItems?.(ctx);
        if (queue && queue.length > 0) {
          graph.addPass(new ContributorTransparentPass(queue, ctx));
        }
      }
    }
  }

  /**
   * "transparent" phase queue: contributor `TransparentQueueItem`s plus the
   * context they draw with, so the Renderer can interleave them with forward
   * transparents by `sortDepth` (§8.4 step 1) instead of drawing them in a
   * block after the pass. Empty when no contributor emits queue items.
   */
  transparentQueues(items: readonly RenderItem[]): { readonly ctx: FrameContributorContext; readonly queues: readonly TransparentQueueItem[] } {
    const ctx = this.context(items);
    const queues: TransparentQueueItem[] = [];
    for (const contributor of frameContributors(this.flags)) {
      if (!contributor.phases.includes("transparent")) continue;
      const queue = contributor.transparentItems?.(ctx);
      if (queue) queues.push(...queue);
    }
    return { ctx, queues };
  }

  /** Contributor `passes("transparent")` only — queue items are handled by transparentQueues(). */
  addTransparentContributorPasses(graph: RenderGraph, items: readonly RenderItem[]): void {
    const contributors = frameContributors(this.flags);
    if (contributors.length === 0) return;
    const ctx = this.context(items);
    for (const contributor of contributors) {
      if (!contributor.phases.includes("transparent")) continue;
      for (const pass of contributor.passes?.("transparent", ctx) ?? []) {
        graph.addPass(pass);
      }
    }
  }

  /** Direct phases executed outside the graph (post-hdr, after-output). */
  runPhase(phase: AuraFramePhase, items: readonly RenderItem[], enabled = true): void {
    const contributors = frameContributors(this.flags);
    if (contributors.length === 0) return;
    const ctx = this.context(items);
    const passContext: RenderPassContext = { device: this.input.device, width: this.input.width, height: this.input.height };
    for (const contributor of contributors) {
      if (!contributor.phases.includes(phase)) continue;
      if (!enabled) {
        if (typeof console !== "undefined") console.warn(`FRAME_PHASE_SKIPPED:${phase}:${contributor.id}`);
        continue;
      }
      for (const pass of contributor.passes?.(phase, ctx) ?? []) {
        assertPhaseSpace(phase, pass, contributor);
        pass.execute(passContext);
      }
    }
  }

  async runPhaseAsync(phase: AuraFramePhase, items: readonly RenderItem[], enabled = true): Promise<void> {
    const contributors = frameContributors(this.flags);
    if (contributors.length === 0) return;
    const ctx = this.context(items);
    const passContext: RenderPassContext = { device: this.input.device, width: this.input.width, height: this.input.height };
    for (const contributor of contributors) {
      if (!contributor.phases.includes(phase)) continue;
      if (!enabled) {
        if (typeof console !== "undefined") console.warn(`FRAME_PHASE_SKIPPED:${phase}:${contributor.id}`);
        continue;
      }
      for (const pass of contributor.passes?.(phase, ctx) ?? []) {
        assertPhaseSpace(phase, pass, contributor);
        if (pass.executeAsync) {
          await pass.executeAsync(passContext);
        } else {
          pass.execute(passContext);
        }
      }
    }
  }
}

/**
 * §8.4 step 4 (lane 01's half of C-13): a contributor pass in `post-hdr` that
 * declares display space is rejected — everything upstream of OutputPass is
 * linear scene-referred.
 */
function assertPhaseSpace(phase: AuraFramePhase, pass: { readonly name: string; readonly space?: "linear-hdr" | "display" }, contributor: { readonly id: string }): void {
  if (phase === "post-hdr" && pass.space === "display") {
    throw new Error(`FRAME_PHASE_SPACE_MISMATCH:${phase}:${contributor.id}:${pass.name}`);
  }
}

export function createRendererFrameHooks(input: RendererFrameHooksInput): RendererFrameHooks {
  return new RendererFrameHooks(input);
}
