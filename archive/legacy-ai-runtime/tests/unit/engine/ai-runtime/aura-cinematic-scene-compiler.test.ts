import { describe, expect, it } from "vitest";
import type { AuraSceneIR } from "../../../../packages/ai-scene/src";
import { createNeonAlleyIR } from "../../ai-scene/fixtures";
import {
  compileAuraCinematicScene,
  createAuraCameraShotRuntime,
  createAuraCharacterBlockingRuntime,
  createAuraCinematicDomOverlayFlag,
  createAuraTimelineScrubber
} from "../../../../packages/engine/src/ai-runtime";

describe("Aura cinematic scene compiler", () => {
  it("compiles AI scene IR into cinematic render items, lights, timeline, blocking, and evidence", async () => {
    const runtime = await compileAuraCinematicScene(createNeonAlleyIR() as unknown as AuraSceneIR, {
      backendPreference: "auto",
      backendAvailability: { webgl2: true, webgpu: true }
    });

    expect(runtime.kind).toBe("aura3d-cinematic-compiled-scene");
    expect(runtime.backend).toBe("webgl2");
    expect(runtime.renderItems.length).toBeGreaterThan(runtime.baseRuntime.renderItems.length);
    expect(runtime.lights.map((light) => light.role)).toEqual(expect.arrayContaining(["key", "rim", "practical"]));
    expect(runtime.timeline.cameraShots[0]?.movement).toBe("dolly-in");
    expect(runtime.timeline.scrubber.scrubTo(6).normalizedTime).toBeCloseTo(0.5);
    expect(runtime.blocking.poses.map((pose) => pose.action)).toEqual(expect.arrayContaining(["look-at"]));
    expect(runtime.evidence.validation).toMatchObject({ ok: true });
    expect(runtime.evidence.flags.filter((flag) => flag.feature === "vfx" && flag.rendererOwned).length).toBeGreaterThan(0);
    expect(runtime.evidence.domOverlayFlagCount).toBe(0);
    expect(runtime.diagnostics).toMatchObject({
      backend: "webgl2",
      renderItemCount: runtime.renderItems.length,
      rendererOwnedEvidenceCount: expect.any(Number)
    });

    const disposal = runtime.dispose();
    expect(disposal.disposed).toBe(true);
    expect(disposal.disposedCount).toBeGreaterThan(0);
  });

  it("rejects required cinematic features that are represented only by DOM overlays", async () => {
    const ir = {
      ...createNeonAlleyIR(),
      vfx: [],
      materials: createNeonAlleyIR().materials.map((material) => ({ ...material, emissive: undefined }))
    } as unknown as AuraSceneIR;

    await expect(compileAuraCinematicScene(ir, {
      requiredEvidenceFeatures: ["vfx"],
      overlayEvidenceFlags: [
        createAuraCinematicDomOverlayFlag({ id: "css-rain", feature: "vfx", label: "CSS rain" })
      ]
    })).rejects.toMatchObject({
      code: "AURA_CINEMATIC_DOM_OVERLAY_EVIDENCE_REJECTED",
      missingRendererOwnedFeatures: ["vfx"],
      overlayOnlyFeatures: ["vfx"]
    });
  });

  it("samples cinematic camera movement and exposes timeline playback controls", () => {
    const ir = createNeonAlleyIR();
    const shot = createAuraCameraShotRuntime({
      camera: {
        id: ir.cameras[0]!.id,
        stableId: ir.cameras[0]!.id,
        label: ir.cameras[0]!.id,
        kind: "perspective",
        position: ir.cameras[0]!.position,
        target: ir.cameras[0]!.target,
        focalLengthMm: 28,
        fovDegrees: 55
      },
      shot: {
        id: ir.shots[0]!.id,
        label: ir.shots[0]!.id,
        cameraId: ir.shots[0]!.cameraId,
        startSeconds: ir.shots[0]!.startSeconds,
        endSeconds: ir.shots[0]!.endSeconds,
        movement: "push-in",
        notes: "dolly hero reveal"
      }
    });
    const start = shot.sample(0);
    const end = shot.sample(12);

    expect(shot.movement).toBe("hero-reveal");
    expect(shot.reset()).toMatchObject({ timeSeconds: 0, normalizedTime: 0 });
    expect(end.position[2]).toBeLessThan(start.position[2]);
    expect(end.framingRules).toEqual(expect.arrayContaining(["low-angle", "rule-of-thirds"]));

    const scrubber = createAuraTimelineScrubber(12);
    expect(scrubber.play()).toMatchObject({ playing: true });
    expect(scrubber.tick(3)).toMatchObject({ currentSeconds: 3, normalizedTime: 0.25 });
    expect(scrubber.pause()).toMatchObject({ playing: false });
    expect(scrubber.reset()).toMatchObject({ currentSeconds: 0 });
  });

  it("supports prompt camera language variants and simple character blocking actions", () => {
    const ir = createNeonAlleyIR();
    const camera = {
      id: ir.cameras[0]!.id,
      stableId: ir.cameras[0]!.id,
      label: ir.cameras[0]!.id,
      kind: "perspective" as const,
      position: ir.cameras[0]!.position,
      target: ir.cameras[0]!.target,
      focalLengthMm: 35,
      fovDegrees: 50
    };
    const movements = [
      ["orbit", "orbit around subject", "orbit"],
      ["static", "slow pan tilt", "pan-tilt"],
      ["static", "establishing shot", "establishing"],
      ["static", "close-up portrait", "close-up"],
      ["static", "target tracking", "target-tracking"]
    ] as const;

    for (const [movement, notes, expected] of movements) {
      const runtime = createAuraCameraShotRuntime({
        camera,
        shot: { id: `shot-${expected}`, label: expected, cameraId: camera.id, startSeconds: 0, endSeconds: 4, movement, notes }
      });
      expect(runtime.movement).toBe(expected);
      expect(runtime.sample(2).framingRules).toContain("rule-of-thirds");
    }

    const blocking = createAuraCharacterBlockingRuntime({
      characters: [{
        id: "robot",
        label: "Robot",
        role: "hero",
        kind: "primitive",
        primitive: "sphere",
        transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        semanticTags: ["robot"]
      }],
      objects: [{
        id: "flower",
        label: "Flower",
        role: "prop",
        kind: "primitive",
        primitive: "sphere",
        transform: { position: [1, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        semanticTags: ["flower"]
      }],
      cues: [
        { id: "look", startSeconds: 0, endSeconds: 1, kind: "object", targetId: "flower", action: "look-at" },
        { id: "reach", startSeconds: 1, endSeconds: 2, kind: "object", targetId: "flower", action: "reach-toward" },
        { id: "turn", startSeconds: 2, endSeconds: 3, kind: "object", targetId: "flower", action: "turn-to-prop" },
        { id: "pause", startSeconds: 3, endSeconds: 4, kind: "object", targetId: "flower", action: "pause-on-discovery" }
      ]
    });

    expect(blocking.poses.map((pose) => pose.action)).toEqual(["look-at", "reach-toward", "turn-to-prop", "pause-on-discovery"]);
    expect(blocking.sample(1.5).map((pose) => pose.action)).toEqual(["reach-toward"]);
  });
});
