/**
 * PRD-03 — C-13 real: the v2 post graph seam.
 *
 * Phase 0 delivers the slot and a *thin* real: `PostGraph.plan()` computes the
 * stage list the v2 chain will run (stage order per PRD-03 §6.1: linearize →
 * GTAO → SSR → god rays → DOF → motion blur → TAA → bloom → OutputPass →
 * grade/LUT → AA → dither), reports registered C-13 custom passes, and
 * `execute()` fails closed with `POST_GRAPH_V2_PENDING` until Phase 2 wires
 * the GPU chain. The stub keeps the legacy chain's contract: passes registered
 * through `registerPostPass` are reported under `skipped` with
 * `post-graph-v2-pending`.
 */

import { defineContractSlot, type QrFlags } from "../contracts/core";
import { registeredPostPasses, type PostGraphReport, type PostInsertAt, type PostPipelineOptions } from "../contracts/post";

export interface PostGraphFrame {
  readonly width: number;
  readonly height: number;
}

export interface PostGraphLike {
  /** "legacy" while the existing chain serves the frame; "v2" for the real graph. */
  readonly kind: "legacy" | "v2";
  /**
   * The plan the graph would execute for these options — stage names in
   * execution order, formats, and anything withheld (with a named reason).
   * Planning never touches the GPU; it is the conformance-testable surface.
   */
  plan(options: PostPipelineOptions, frame: PostGraphFrame): PostGraphReport;
  /** GPU execution. Phase 0 throws POST_GRAPH_V2_PENDING on the real graph. */
  execute?(options: PostPipelineOptions, frame: PostGraphFrame): PostGraphReport;
}

/**
 * Stage ids follow PRD-03 §6.1 S-numbers so reports line up with the
 * performance-budget table (§17). Each entry is the v2 stage that owns the
 * pipeline option.
 */
const V2_STAGE_ORDER: readonly { readonly id: string; readonly optionKey: keyof PostPipelineOptions | "linearize-depth" }[] = [
  { id: "S1-linearize-depth", optionKey: "linearize-depth" },
  { id: "S2-gtao", optionKey: "ao" },
  { id: "S4-ssr", optionKey: "ssr" },
  { id: "S5-god-rays", optionKey: "godRays" },
  { id: "S6-dof", optionKey: "dof" },
  { id: "S7-motion-blur", optionKey: "motionBlur" },
  { id: "S8-taa", optionKey: "taa" },
  { id: "S9-bloom", optionKey: "bloom" },
  { id: "S10a-output", optionKey: "toneMapping" },
  { id: "S10b-grade", optionKey: "grade" },
  { id: "S10c-lut", optionKey: "lut" },
  { id: "S11-aa", optionKey: "antiAliasing" },
  { id: "S12-dither", optionKey: "dither" }
];

/** insertAt anchor → the stage index the custom pass attaches after/before. */
const INSERT_ANCHORS: Record<PostInsertAt, { readonly after?: string; readonly before?: string }> = {
  "after-depth": { after: "S1-linearize-depth" },
  "before-taa": { before: "S8-taa" },
  "after-taa": { after: "S8-taa" },
  "before-tonemap": { before: "S10a-output" },
  "after-tonemap": { after: "S10b-grade" }
};

function optionRequested(options: PostPipelineOptions, key: keyof PostPipelineOptions | "linearize-depth"): boolean {
  if (key === "linearize-depth") {
    // Depth is linearized only when a later stage consumes scene depth.
    return Boolean(options.ao || options.ssr || options.godRays || options.dof);
  }
  if (key === "antiAliasing") return options.antiAliasing !== "off";
  if (key === "dither") return options.dither !== false;
  const value = options[key];
  return Boolean(value) && value !== false;
}

/**
 * Plans the v2 chain: every requested option maps to exactly one stage, in
 * fixed order; stages this phase does not execute land in `skipped` with a
 * named reason instead of silently disappearing (PRD-03 "no silent drops").
 */
export function planPostGraph(options: PostPipelineOptions, frame: PostGraphFrame): PostGraphReport {
  const stages: { name: string; format: string; width: number; height: number }[] = [];
  const skipped: { name: string; reason: string }[] = [];
  const requested = V2_STAGE_ORDER.filter((stage) => optionRequested(options, stage.optionKey)).map((stage) => stage.id);
  const aaStage = options.antiAliasing === "off" ? undefined : `S11-aa-${options.antiAliasing}`;
  const depthConsuming = optionRequested(options, "linearize-depth");

  const stageFormats: Record<string, string> = {
    "S1-linearize-depth": "r32f",
    "S2-gtao": "r8",
    "S4-ssr": "rgba16f",
    "S5-god-rays": "rgba16f",
    "S6-dof": "rgba16f",
    "S7-motion-blur": "rgba16f",
    "S8-taa": "rgba16f",
    "S9-bloom": "rgba16f",
    "S10a-output": "rgba8",
    "S10b-grade": "rgba8",
    "S10c-lut": "rgba8",
    "S11-aa": "rgba8",
    "S12-dither": "rgba8"
  };
  for (const id of requested) {
    const name = id === "S11-aa" && aaStage ? aaStage : id;
    skipped.push({ name, reason: "post-graph-v2-pending" });
  }
  if (depthConsuming === false) {
    skipped.push({ name: "S1-linearize-depth", reason: "no depth consumer" });
  }

  const custom = [...(options.customPasses ?? []), ...registeredPostPasses()];
  for (const pass of custom) {
    const anchor = INSERT_ANCHORS[pass.insertAt];
    skipped.push({ name: pass.id, reason: `post-graph-v2-pending insertAt=${pass.insertAt} anchor=${anchor.before ?? anchor.after ?? "unknown"}` });
  }
  void stages;
  return { stages, skipped };
}

/** C-13 stub: the legacy chain's view of the graph (nothing v2 executes). */
export class LegacyPostGraphStub implements PostGraphLike {
  readonly kind = "legacy" as const;
  plan(_options: PostPipelineOptions, _frame: PostGraphFrame): PostGraphReport {
    return {
      stages: [],
      skipped: registeredPostPasses().map((pass) => ({ name: pass.id, reason: "post-graph-v2-pending" }))
    };
  }
}

/** C-13 real (thin, Phase 0): plans the v2 chain; execute fails closed. */
export class PostGraph implements PostGraphLike {
  readonly kind = "v2" as const;
  plan(options: PostPipelineOptions, frame: PostGraphFrame): PostGraphReport {
    return planPostGraph(options, frame);
  }
  execute(_options: PostPipelineOptions, _frame: PostGraphFrame): PostGraphReport {
    throw new Error("POST_GRAPH_V2_PENDING");
  }
}

/**
 * The C-13 slot (contract id `C-13`, flag `A3D_QR_POST`). PR 0's frozen surface
 * declares no slot in `contracts/post.ts`, so lane 03 defines it here and
 * provides it from `lanes/prd03.ts`; `get(flags)` returns the real PostGraph
 * only once provided AND the flag is on — the legacy stub otherwise.
 */
export const postPipelineSlot = defineContractSlot<PostGraphLike>(
  "C-13",
  "prd03",
  "A3D_QR_POST",
  new LegacyPostGraphStub()
);

/** Resolved graph for these flags; call at mount/compile time, never per draw. */
export function resolvePostGraph(flags: QrFlags): PostGraphLike {
  return postPipelineSlot.get(flags);
}
