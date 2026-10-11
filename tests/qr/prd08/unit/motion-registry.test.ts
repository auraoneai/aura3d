/**
 * `motion-registry.test.ts` — S9: the six `prd08-motion-*` scenes are ACTIVE
 * in the C-30 registry (both adapters on disk, every required field present),
 * not quarantined; the staging module and `prd08 motion-report` behave.
 */
import { describe, expect, it } from "vitest";
import { getRegisteredScene, ACTIVE_SCENE_IDS, laneAdapterModulePath, adapterModules } from "../../../../benchmarks/quality-rebuild/shared/registry";
import { scenes } from "../../../../benchmarks/quality-rebuild/motion/scenes";
import {
  colliderBoxes,
  insideAnyCollider,
  motionMetrics,
  motionSchedule,
  motionSubject,
  sample
} from "../../../../benchmarks/quality-rebuild/motion/stage";
import { MOTION_SCENE_IDS, buildMotionReport, renderMotionMarkdown } from "../../../../packages/aura3d-cli/src/commands/prd08/motionReport";

describe("S9 motion scene registry activation (C-30)", () => {
  it("all six prd08-motion-* ids are active, not quarantined", () => {
    expect(scenes.map((s) => s.id)).toEqual([...MOTION_SCENE_IDS]);
    for (const id of MOTION_SCENE_IDS) {
      const entry = getRegisteredScene(id);
      expect(entry, id).toBeDefined();
      expect(entry?.quarantineReason, id).toBeUndefined();
      expect(entry?.status, id).toBe("active");
      expect(entry?.admittedAsReference, id).toBe(true);
      expect(ACTIVE_SCENE_IDS).toContain(id);
    }
  });

  it("both engine adapters resolve in main.ts's glob space", () => {
    const modules = adapterModules();
    for (const id of MOTION_SCENE_IDS) {
      for (const engine of ["aura3d", "three"] as const) {
        const path = laneAdapterModulePath(engine, id);
        expect(path, `${engine} ${id}`).toBe(`./${engine}/scenes/prd08/${id.slice("prd08-".length)}.ts`);
        expect(`../${path!.slice(2)}` in modules, `${engine} adapter for ${id}`).toBe(true);
      }
    }
  });
});

describe("S9 motion staging", () => {
  it("strip schedule ends on the capture frame with 12 ascending tiles", () => {
    const s = motionSchedule("chase", 1.25, { frames: 12, intervalMs: 66 });
    expect(s.stripSteps).toHaveLength(12);
    expect(s.stripSteps.at(-1)).toBe(s.steps);
    for (let i = 1; i < 12; i += 1) expect(s.stripSteps[i]!).toBeGreaterThan(s.stripSteps[i - 1]!);
    expect(motionSchedule("pacing", 1.25, { frames: 12, intervalMs: 66 }).dt).toBeCloseTo(1 / 120, 9);
  });

  it("collider boxes come from the script and sit on the ground", () => {
    const boxes = colliderBoxes();
    expect(boxes).toHaveLength(7);
    for (const b of boxes) expect(b.min[1]).toBe(0);
    expect(insideAnyCollider([boxes[0]!.center[0], 1, boxes[0]!.center[2]], boxes)).toBe(true);
    expect(insideAnyCollider([0, 1, 0], boxes)).toBe(false);
  });

  it("collision subject trails the arm off-axis; flight carries bank", () => {
    const c = motionSubject("collision", 2.4);
    expect(Math.abs(c.forward[2])).toBeGreaterThan(0.3);
    const f = motionSubject("flight", 1.0);
    expect(Number.isFinite(f.bank)).toBe(true);
  });

  it("metrics flag uneven presents (subject step CV) and inside-collider eyes", () => {
    const boxes = colliderBoxes();
    const even = Array.from({ length: 20 }, (_, i) => sample(i / 120, [i * 0.1, 0.5, 0], [0, 2, 8], [0, 0, 0], 50, 0, 0));
    const uneven = Array.from({ length: 20 }, (_, i) => sample(i / 120, [Math.floor(i / 2) * 0.2, 0.5, 0], [0, 2, 8], [0, 0, 0], 50, 0, 0));
    expect(motionMetrics(even, 1 / 120).subjectStepCv).toBeLessThan(0.01);
    expect(motionMetrics(uneven, 1 / 120).subjectStepCv).toBeGreaterThan(0.9);
    const inside = [sample(0, [0, 0.5, 0], [boxes[0]!.center[0], 1, boxes[0]!.center[2]], [0, 0, 0], 50, 0, 0)];
    expect(motionMetrics(inside, 1 / 60, boxes).insideColliderSteps).toBe(1);
  });
});

describe("aura3d prd08 motion-report", () => {
  const metrics = { samples: 75, maxEyeStep: 0.2, meanEyeSpeed: 6, hitchRatio: 0.1, fovRange: [55, 64] as const, rollRangeDeg: [0, 0] as const, eyeToSubject: { min: 4, mean: 5, max: 6 }, insideColliderSteps: 0, energyPeak: 0, energyEnd: 0, subjectStepCv: 0.1 };
  const engineResult = (engine: string, cameraLive = true) => ({
    status: "ready",
    payload: { extra: { motion: { driver: "chase", rig: `${engine}-rig`, cameraLive, dt: 1 / 60, metrics, strip: { frames: 12, lumaVariance: Array(12).fill(40), dataUrl: "data:image/png;base64,AAAA" } } } }
  });
  const full = { environment: { gpu: { renderer: "ANGLE (Apple, Metal)" }, githubRunId: "1" }, scenes: MOTION_SCENE_IDS.map((scene) => ({ scene, engines: { aura3d: engineResult("aura3d"), three: engineResult("three") } })) };

  it("passes on complete evidence and renders every scene", () => {
    const result = buildMotionReport(full);
    expect(result.failures).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.rows).toHaveLength(12);
    const md = renderMotionMarkdown(result);
    for (const id of MOTION_SCENE_IDS) expect(md).toContain(`## ${id}`);
    expect(md).toContain("admittedAsReference");
  });

  it("fails closed on a missing scene, a non-ready capture, a stub camera or a short strip", () => {
    const broken = {
      ...full,
      scenes: [
        ...full.scenes.slice(1, 4),
        { scene: MOTION_SCENE_IDS[4], engines: { aura3d: { ...engineResult("aura3d"), status: "no-draw" }, three: engineResult("three") } },
        { scene: MOTION_SCENE_IDS[5], engines: { aura3d: engineResult("aura3d", false), three: { status: "ready", payload: { extra: { motion: { ...engineResult("three").payload.extra.motion, strip: { frames: 3, lumaVariance: [1, 40, 40], dataUrl: "" } } } } } } }
      ]
    };
    const result = buildMotionReport(broken);
    expect(result.ok).toBe(false);
    const text = result.failures.join("\n");
    expect(text).toContain(`${MOTION_SCENE_IDS[0]}: not in report.json`);
    expect(text).toContain(`${MOTION_SCENE_IDS[4]}/aura3d: status no-draw`);
    expect(text).toContain(`${MOTION_SCENE_IDS[5]}/aura3d: app.camera is the stub`);
    expect(text).toContain(`${MOTION_SCENE_IDS[5]}/three: strip has 3/12 tiles`);
    expect(text).toContain(`${MOTION_SCENE_IDS[5]}/three: 1 blank strip tile(s)`);
  });
});
