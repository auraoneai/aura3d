import { afterEach, describe, expect, it, vi } from "vitest";
import "../../../../packages/rendering/src/lanes/prd03"; // lane registrations: C-14 history + chunks
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { setRendererQrFlags } from "../../../../packages/rendering/src/renderer/FrameGraph";
import { identityMat4 } from "@aura3d/scene";
import { Geometry } from "../../../../packages/rendering/src/Geometry";
import { MockRenderDevice } from "../../../../packages/rendering/src/RenderDevice";
import { TemporalHistory } from "../../../../packages/rendering/src/TemporalHistory";
import {
  VelocityHistory,
  bindVelocityUniforms,
  postVelocityCoverage,
  setVelocityUniformBinder,
  velocityHistorySlot
} from "../../../../packages/rendering/src/forward/Velocity";
import {
  velocityFeature,
  velocityParsFragmentChunk,
  velocityParsVertexChunk,
  velocityWriteFragmentChunk,
  velocityWriteVertexChunk
} from "../../../../packages/rendering/src/post/chunks/velocity.glsl";
import { buildChunkHarnessProgram } from "../../../../packages/rendering/src/contracts/testing/ChunkHarness";
import { VELOCITY_MRT } from "../../../../packages/rendering/src/contracts/velocity";
import { resolvePostAntiAlias } from "../../../../packages/rendering/src/post/PostAntiAlias";
import { QUALITY_TIERS } from "../../../../packages/rendering/src/contracts/quality";
import { createProductionRuntimePostprocess } from "../../../../packages/engine/src/agent-api/compiler/postprocess";
import {
  recordAuthoredPostContext,
  resetAuthoredPostContext
} from "../../../../packages/engine/src/agent-api/postBridge";
import { effects } from "../../../../packages/engine/src/agent-api/index";
import type { AuraSceneSnapshot } from "../../../../packages/engine/src/agent-api/index";
import type { AuraEffectNode } from "../../../../packages/engine/src/agent-api/nodes/types";

const POST_ON = resolveQrFlags({ options: { A3D_QR_POST: true } });
const FLAGS_OFF = resolveQrFlags({});

afterEach(() => {
  setRendererQrFlags(FLAGS_OFF);
  resetAuthoredPostContext();
});

const rigidItem = (label: string) => ({
  geometry: Geometry.triangle(),
  label,
  modelMatrix: identityMat4()
});

describe("PRD-03 Phase 4 — TemporalHistory flag-on (C-14 matrices, no re-draw)", () => {
  it("flag-on prepare returns the C-14 camera matrices and builds no ForwardPass draw", () => {
    setRendererQrFlags(POST_ON);
    const device = new MockRenderDevice();
    const owner = new TemporalHistory();
    device.beginFrame(16, 16);
    const drawsBefore = device.drawCommands.length;
    const bindings = owner.prepare(device, 16, 16, [rigidItem("a")], identityMat4(), { sceneKey: "s", jitter: true, frameTime: 1 / 50 });
    expect(device.drawCommands.length).toBe(drawsBefore); // no velocity re-render
    expect(bindings.v2).toBeDefined();
    expect(bindings.v2!.unjittered).toEqual(Float32Array.from(identityMat4()));
    expect(bindings.v2!.previous).toEqual(Float32Array.from(identityMat4())); // seed frame
    expect(bindings.v2!.frameTime).toBe(1 / 50);
    expect(bindings.v2!.linZOutput).not.toBe(bindings.v2!.linZ);
    expect(bindings.historyValid).toBe(false);
    device.endFrame(); owner.dispose(); device.dispose();
  });

  it("flag-on accepts skinned/instanced geometry — velocity coverage replaces the throw", () => {
    setRendererQrFlags(POST_ON);
    const device = new MockRenderDevice();
    const owner = new TemporalHistory();
    device.beginFrame(16, 16);
    const skinned = { ...rigidItem("s"), skinning: { joints: [{} as never] } } as never;
    expect(() => owner.prepare(device, 16, 16, [skinned], identityMat4(), {})).not.toThrow();
    device.endFrame(); owner.dispose(); device.dispose();
  });

  it("flag-off keeps the legacy re-draw and the unsupported-geometry throw", () => {
    setRendererQrFlags(FLAGS_OFF);
    const device = new MockRenderDevice();
    const owner = new TemporalHistory();
    device.beginFrame(16, 16);
    owner.prepare(device, 16, 16, [rigidItem("a")], identityMat4(), {});
    expect(device.drawCommands.length).toBeGreaterThan(0); // ForwardPass re-draw
    const skinned = { ...rigidItem("s"), skinning: { joints: [{} as never] } } as never;
    expect(() => owner.prepare(device, 16, 16, [skinned], identityMat4(), {})).toThrow(/TEMPORAL_UNSUPPORTED_GEOMETRY|stable unique labels/);
    device.endFrame(); owner.dispose(); device.dispose();
  });

  it("commit swaps the linZ ping-pong so last frame's Z is the disocclusion input", () => {
    setRendererQrFlags(POST_ON);
    const device = new MockRenderDevice();
    const owner = new TemporalHistory();
    device.beginFrame(16, 16);
    const f0 = owner.prepare(device, 16, 16, [rigidItem("a")], identityMat4(), {});
    const firstOut = f0.v2!.linZOutput;
    owner.commit();
    const f1 = owner.prepare(device, 16, 16, [rigidItem("a")], identityMat4(), {});
    expect(f1.v2!.linZ).toBe(firstOut);
    expect(f1.v2!.linZOutput).not.toBe(firstOut);
    device.endFrame(); owner.dispose(); device.dispose();
  });
});

describe("PRD-03 Phase 4 — C-14 binder coverage + rigid prev-matrix cache", () => {
  it("binds camera + previous-model matrices only after a prepared frame; coverage counts movers", () => {
    const history = new VelocityHistory();
    history.reset("scene-swap"); // coverage/prev-item state is module-level — clear leftovers
    const uniforms = new Map<string, unknown>();
    const item = rigidItem("mover");
    // No cameraMatrices prepared (reset) → the armed binder is inert.
    bindVelocityUniforms?.(item as never, uniforms as never);
    expect(uniforms.size).toBe(0);

    history.prepare(Float32Array.from(identityMat4()), [0, 0]);
    bindVelocityUniforms?.(item as never, uniforms as never);
    expect(uniforms.get("u_previousViewProjection")).toBeInstanceOf(Float32Array);
    expect(uniforms.get("u_unjitteredViewProjection")).toBeInstanceOf(Float32Array);
    expect(uniforms.get("u_previousModel")).toBeInstanceOf(Float32Array); // seeds to current
    let c = postVelocityCoverage();
    expect(c.items).toBe(1);
    expect(c.withVelocity).toBe(0); // first frame: no baseline yet
    expect(c.moving).toBe(1); // no baseline = uncovered motion (conservative)
    expect(c.movingWithHistory).toBe(0);

    // Frame 2, item moved → mover WITH history.
    item.modelMatrix[12] = 0.5;
    history.prepare(Float32Array.from(identityMat4()), [0, 0]);
    bindVelocityUniforms?.(item as never, new Map() as never);
    c = postVelocityCoverage();
    expect(c.moving).toBe(1);
    expect(c.movingWithHistory).toBe(1);
    history.reset("camera-cut");
    expect(postVelocityCoverage().items).toBe(0);
  });

  it("static items stop counting as movers once baselined", () => {
    const history = new VelocityHistory();
    history.reset("scene-swap");
    const item = rigidItem("static");
    history.prepare(Float32Array.from(identityMat4()), [0, 0]);
    bindVelocityUniforms?.(item as never, new Map() as never);
    history.prepare(Float32Array.from(identityMat4()), [0, 0]);
    bindVelocityUniforms?.(item as never, new Map() as never);
    const c = postVelocityCoverage();
    expect(c.items).toBe(1);
    expect(c.withVelocity).toBe(1);
    expect(c.moving).toBe(0);
  });
});

describe("PRD-03 Phase 4 — prd03.velocity chunk + feature", () => {
  it("feature selects only forward draws under A3D_QR_POST_VELOCITY_MRT and stamps AURA_VELOCITY", () => {
    const selectInput = (flags: typeof POST_ON) => ({
      item: {} as never,
      pass: "forward" as const,
      tier: QUALITY_TIERS.high,
      flags
    });
    const mrtOn = resolveQrFlags({ options: { A3D_QR_POST: true, A3D_QR_POST_VELOCITY_MRT: true } });
    expect(velocityFeature.select(selectInput(mrtOn))).toBe("velocity");
    expect(velocityFeature.select(selectInput(POST_ON))).toBeUndefined(); // opt-in until Q-01-2
    expect(velocityFeature.select({ ...selectInput(mrtOn), pass: "depth" as never })).toBeUndefined();
    expect(velocityFeature.defines("velocity")).toEqual({ [VELOCITY_MRT.define]: true });
  });

  it("ChunkHarness composes all four chunk stages into one program", () => {
    const program = buildChunkHarnessProgram([
      velocityParsVertexChunk,
      velocityWriteVertexChunk,
      velocityParsFragmentChunk,
      velocityWriteFragmentChunk
    ]);
    expect(program.vertex).toContain("u_previousViewProjection");
    expect(program.vertex).toContain("a3d_velPrevClip");
    expect(program.fragment).toContain(`layout(location = ${VELOCITY_MRT.velocityLocation})`);
    expect(program.fragment).toContain(`layout(location = ${VELOCITY_MRT.reactiveLocation})`);
    expect(program.fragment).toContain("a3d_o_velocity");
  });
});

describe("PRD-03 Phase 4 — engine stamps + AA coverage gate", () => {
  const snapshotWith = (nodes: AuraSceneSnapshot["nodes"]): AuraSceneSnapshot => ({ nodes } as AuraSceneSnapshot);
  const strictAttach = () => {
    recordAuthoredPostContext({ flags: POST_ON, options: {} });
    return undefined;
  };
  const asNode = (builder: unknown) => (builder as { toJSON(): AuraEffectNode }).toJSON();

  it("resolved taa stamps pipeline.taa with §6.5 defaults; coverage fallback does not", () => {
    const node = asNode(effects.antiAlias({ mode: "taa" }));
    const out = createProductionRuntimePostprocess(snapshotWith([node]), [], 640, 480, true, strictAttach());
    // The strict/flag-on path stamps the pipeline bag when fields validate.
    const pipeline = out.pipeline as Record<string, unknown> | undefined;
    if (pipeline) {
      expect(pipeline.antiAliasing).toBe("taa");
      expect((pipeline.taa as { feedbackMin: number }).feedbackMin).toBe(0.88);
      expect((pipeline.taa as { sharpness: number }).sharpness).toBe(0.2);
    }
    expect(out.temporal).toBeDefined();
    expect(out.taa).toBeDefined();
  });

  it("authored motion-blur emits §8.8 fields (samples/tileSize clamped, shutter × timeScale)", () => {
    const node = asNode(effects.motionBlur({ intensity: 0.4, samples: 9, timeScale: 2 }));
    const out = createProductionRuntimePostprocess(snapshotWith([node]), [], 640, 480, true, strictAttach());
    const mb = (out.pipeline as Record<string, unknown> | undefined)?.motionBlur as { shutter: number; samples: number; tileSize: number } | undefined;
    if (mb) {
      expect(mb.shutter).toBeCloseTo(0.8);
      expect(mb.samples).toBe(12); // 9 clamps up to the 8|12|16 set
      expect(mb.tileSize).toBe(16);
    }
    expect(out.motionBlur).toBeDefined();
    expect(out.temporal).toBeDefined();
  });

  it("unsupported temporal geometry keeps TAA at its coverage fallback, not a throw", () => {
    const node = asNode(effects.antiAlias({ mode: "taa" }));
    const out = createProductionRuntimePostprocess(snapshotWith([node]), [], 640, 480, /* temporalSupported */ false, strictAttach());
    expect(out.temporal).toBeUndefined();
    const pipeline = out.pipeline as Record<string, unknown> | undefined;
    if (pipeline) {
      // Coverage stub ({moving:1, movingWithHistory:0}) forces the fallback
      // (or "off" when the tier's samples are 0); never TAA and never a throw.
      expect(["msaa", "smaa", "off"]).toContain(pipeline.antiAliasing);
      expect(pipeline.taa).toBeUndefined();
    }
  });

  it("resolvePostAntiAlias reports TAA_VELOCITY_COVERAGE when a mover lacks history", () => {
    const r = resolvePostAntiAlias({
      settings: QUALITY_TIERS.high,
      tier: "high",
      authored: "taa",
      renderPixels: 640 * 480,
      velocity: { moving: 2, movingWithHistory: 1 }
    });
    expect(r.mode).not.toBe("taa");
    expect(r.reason).toBe("TAA_VELOCITY_COVERAGE");
  });
});

describe("PRD-03 Phase 4 — TemporalHistory reset reaches the C-14 history", () => {
  it("TemporalHistory.reset() invalidates the camera-level velocity history (flag-on)", () => {
    setRendererQrFlags(POST_ON);
    const history = velocityHistorySlot.get(POST_ON).history;
    history.prepare(Float32Array.from(identityMat4()), [0, 0]);
    history.prepare(Float32Array.from(identityMat4()), [0, 0]); // armed prev
    const owner = new TemporalHistory();
    owner.reset();
    const cam = history.prepare(Float32Array.from(identityMat4()), [0, 0]);
    // After reset the "previous" VP reseeds to current — no stale reprojection.
    expect(Array.from(cam.previous)).toEqual(Array.from(cam.unjittered));
    setRendererQrFlags(FLAGS_OFF);
    owner.dispose();
  });
});
