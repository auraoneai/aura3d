import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applyRootMotion,
  extractRootMotion,
  measureRootMotionLoopClosure,
  type AnimationClip
} from "@aura3d/animation";
import { GLTFLoader, LoadContext } from "../../../packages/assets/src";

/**
 * E2 box 4 (real-clip half): the zero-slide metric runs on REAL certified clips through
 * the REAL glTF loader — not synthetic tracks. The certified locomotion roster walks in
 * place (Kenney `walk` root bob ±2.5cm, no horizontal travel; robot WALK likewise), so
 * "zero slide" here means the loop wraps with (near-)zero velocity discontinuity and no
 * mid-loop pops. Take 001 is a 32.9s showcase timeline whose COM track only animates in
 * the last 1.1s; it is characterized, not gated as a walk loop.
 */
async function loadClips(file: string): Promise<readonly AnimationClip[]> {
  const bytes = readFileSync(file);
  const url = `data:model/gltf-binary;base64,${bytes.toString("base64")}`;
  const asset = await new GLTFLoader().load({ url, type: "gltf" }, new LoadContext());
  return asset.animations;
}

function requireClip(clips: readonly AnimationClip[], name: string): AnimationClip {
  const clip = clips.find((candidate) => candidate.name === name);
  if (!clip) throw new Error(`Clip "${name}" not found (have: ${clips.map((c) => c.name).join(", ")})`);
  return clip;
}

describe("root motion on real certified clips", () => {
  it("Kenney walk loops with (near-)zero slide on its root track", async () => {
    const clips = await loadClips("public/aura-assets/showcaseKenneyOobiPlatformerHero.3f821141.glb");
    const walk = requireClip(clips, "walk");
    expect(walk.duration).toBeCloseTo(0.67, 1);
    const rootTrack = walk.tracks.find((track) => track.target === "root.translation");
    expect(rootTrack?.valueType).toBe("vector3");

    const report = measureRootMotionLoopClosure(walk, "root.translation");
    // eslint-disable-next-line no-console
    console.log("kenney-walk-root-motion", JSON.stringify(report));
    // In-place walk: the root bobs but travels nowhere — zero slide means zero travel.
    expect(report.cycleDelta).toEqual([0, 0, 0]);
    expect(report.cycleDistance).toBeLessThan(1e-6);
    // No mid-loop pops: a 5cm teleport inside one 1/60 segment would spike past 3 u/s.
    expect(report.maxVelocityDeviation).toBeLessThan(1);
    // Documented authoring seam (not slide): the LINEAR-interpolated Y bob returns to 0
    // with opposite end slopes (±0.36 u/s), so the scalar seam discontinuity reads 0.73
    // while horizontal seam motion — the actual slide axis — is exactly 0. Regression
    // bound only; lowering it means re-authoring the clip, not tuning the metric.
    expect(report.loopClosureError).toBeLessThan(1.5);

    // Authoritative extraction + application round-trip on the same real track.
    const sample = extractRootMotion(walk, { target: "root.translation", fromTime: 0, toTime: walk.duration });
    expect(sample.delta).toHaveLength(3);
    const moved = applyRootMotion({ position: [0, 0, 0] }, sample);
    expect(moved.position[0]).toBeCloseTo(sample.delta[0], 10);
    expect(moved.position[1]).toBeCloseTo(sample.delta[1], 10);
    expect(moved.position[2]).toBeCloseTo(sample.delta[2], 10);
  });

  it("characterizes Take 001 COM motion over the full showcase timeline", async () => {
    const clips = await loadClips("public/aura-assets/showcaseWalkAnimatedGirl.93872fc2.glb");
    const take = requireClip(clips, "Take 001");
    // Take 001 is a 32.9s showcase timeline, not a walk loop: the COM translation track
    // only carries keys in the last 1.1s (a ±2cm sway + 1.8cm bob), so full-timeline
    // closure is an authoring property of the timeline, not a walk-loop gate.
    expect(take.duration).toBeCloseTo(32.9, 0);
    const comTrack = take.tracks.find((track) => track.target === "Bip01_01.translation");
    expect(comTrack?.valueType).toBe("vector3");

    const report = measureRootMotionLoopClosure(take, "Bip01_01.translation");
    // eslint-disable-next-line no-console
    console.log("take001-com-root-motion", JSON.stringify(report));
    expect(Number.isFinite(report.cycleDistance)).toBe(true);
    expect(Number.isFinite(report.loopClosureError)).toBe(true);
    expect(Number.isFinite(report.maxVelocityDeviation)).toBe(true);
  });
});
