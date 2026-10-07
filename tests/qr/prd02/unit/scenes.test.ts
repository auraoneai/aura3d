/**
 * Lane prd02 scene admission test (PRD-02 §15): the registry row invariants.
 */
import { describe, expect, it } from "vitest";
import { scenes } from "../../../../benchmarks/quality-rebuild/scenes/prd02";
import { prd02SceneIds, prd02Specs } from "../../../../benchmarks/quality-rebuild/scenes/prd02/specs";
import { analyticMasks } from "../../../../benchmarks/quality-rebuild/scenes/prd02/masks";
import { applyBrokenControl } from "../../../../benchmarks/quality-rebuild/scenes/prd02/controls";
import { sceneSpecs } from "../../../../benchmarks/quality-rebuild/shared/scenes";
import type { SceneSpec } from "../../../../benchmarks/quality-rebuild/shared/types";

const COPIED: Readonly<Record<string, string>> = {
  "prd02-06-metal-roughness-sweep": "06-metal-roughness-sweep",
  "prd02-09-outdoor-environment": "09-outdoor-environment",
  "prd02-10-indoor-environment": "10-indoor-environment",
  "prd02-11-multiple-lights": "11-multiple-lights",
  "prd02-12-shadows": "12-shadows",
  "prd02-13-ibl-only": "13-ibl-only",
  "prd02-15-animation-skinning": "15-animation-skinning",
  "prd02-17-large-environment": "17-large-environment",
  "prd02-18-game-scene": "18-game-scene"
};

const FIXTURES = [
  "prd02-16b-instancing-shadowed",
  "prd02-no-lights",
  "prd02-reflection-probe",
  "prd02-red-wall-bounce",
  "prd02-contact-cube",
  "prd02-caster-fixtures",
  "prd02-csm-poles",
  "prd02-softbox",
  "prd02-wet-floor"
] as const;

describe("prd02 scene registry", () => {
  it("registers every spec with a unique prd02- id", () => {
    expect(scenes.length).toBe(prd02SceneIds.length);
    const ids = scenes.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id.startsWith("prd02-")).toBe(true);
  });

  it("every spec declares owner, qrFlags, and at least one mask", () => {
    for (const id of prd02SceneIds) {
      const spec = prd02Specs[id as keyof typeof prd02Specs];
      expect(spec.owner, id).toBe("prd02");
      expect(spec.qrFlags, id).toContain("lighting");
      expect((spec.masks ?? []).length, id).toBeGreaterThan(0);
      expect(spec.primaryCriterion, id).toBeTruthy();
    }
  });

  it("every spec declares at least one broken control", () => {
    for (const id of prd02SceneIds) {
      expect((prd02Specs[id as keyof typeof prd02Specs].brokenControls ?? []).length, id).toBeGreaterThan(0);
    }
  });

  it("covers every fixture id the PRD names", () => {
    for (const id of FIXTURES) expect(prd02SceneIds).toContain(id);
  });

  it("copies keep the base scene's objects, lights, camera and resolution", () => {
    for (const [laneId, baseId] of Object.entries(COPIED)) {
      const lane = prd02Specs[laneId as keyof typeof prd02Specs];
      const base = sceneSpecs[baseId as keyof typeof sceneSpecs] as SceneSpec;
      expect(lane.objects, laneId).toEqual(base.objects);
      expect(lane.lights, laneId).toEqual(base.lights);
      expect(lane.camera, laneId).toEqual(base.camera);
      expect(lane.resolution, laneId).toEqual(base.resolution);
      expect(lane.background, laneId).toEqual(base.background);
    }
  });

  it("16b flips instanced casters on while keeping the transform list", () => {
    const spec = prd02Specs["prd02-16b-instancing-shadowed"];
    const instanced = spec.objects.find((o) => o.kind === "instanced");
    expect(instanced?.castShadow).toBe(true);
    if (instanced?.kind === "instanced") expect(instanced.transforms.length).toBe(10_000);
  });

  it("caster fixtures cover skinned, batched, instanced and alpha shapes", () => {
    const spec = prd02Specs["prd02-caster-fixtures"];
    const kinds = spec.objects.map((o) => o.kind);
    expect(kinds).toContain("model");
    expect(kinds.filter((k) => k === "instanced").length).toBe(2);
    const leaf = spec.objects.find((o) => "name" in o && o.name === "alpha leaf card");
    expect(leaf && "material" in leaf && leaf.material.opacity).toBeLessThan(1);
  });

  it("analyticMasks produces non-empty masks for every declared MaskId", () => {
    const size = { width: 320, height: 180 };
    for (const id of prd02SceneIds) {
      const spec = prd02Specs[id as keyof typeof prd02Specs];
      const masks = analyticMasks(spec, size);
      for (const name of spec.masks ?? []) {
        if (name === "shadow-receiver") continue; // needs the control render
        const mask = masks[name as keyof typeof masks];
        expect(mask, `${id}:${name}`).toBeDefined();
        if (mask) expect(mask.some((v) => v > 0), `${id}:${name} non-empty`).toBe(true);
      }
    }
  });

  it("applyBrokenControl('no-shadows') strips every shadow request", () => {
    const spec = prd02Specs["prd02-12-shadows"];
    const controlled = applyBrokenControl(spec, "no-shadows");
    expect(controlled.shadows).toBeUndefined();
    expect(controlled.csm).toBeUndefined();
    for (const light of controlled.lights) {
      if ("castShadow" in light) expect(light.castShadow).toBe(false);
    }
    expect(applyBrokenControl(spec, "no-ibl").environment).toBeUndefined();
    expect(() => applyBrokenControl(spec, "bogus")).toThrow();
  });
});
