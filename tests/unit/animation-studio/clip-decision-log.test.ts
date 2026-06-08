import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * B1 — the per-beat clip-decision log. Drives the REAL `animation-performance.ts` decision producer
 * (via its standalone CLI, no Playwright/GPU) and asserts each record carries the full B1 contract:
 *   { intent, clipId, source, bonesTouched, maxRotAmplitudeRad, maxTransAmplitude, reachedGLBRuntime }
 * plus the body-bone breakdown used by the body-motion gate.
 *
 * Also asserts the scene-player source actually wires the debug overlay (AURA_DEBUG_OVERLAY=1) and
 * the reachedGLBRuntime flip, and that render-live.ts surfaces the new fields in its summary.
 */

const REPO_ROOT = resolve(__dirname, "../../..");
const TEMPLATE = resolve(REPO_ROOT, "packages/create-aura3d/templates/animation-studio");
const CLI = resolve(TEMPLATE, "scripts/clip-decision-cli.ts");

interface ClipDecision {
  intent: string;
  clipId: string;
  source: string;
  bonesTouched: number;
  maxRotAmplitudeRad: number;
  maxTransAmplitude: number;
  bodyBoneRotationRad: Record<string, number>;
  rootTranslation: number;
  reachedGLBRuntime: boolean;
}

function decisionFor(intent: string, t = 0.6): ClipDecision {
  const stdout = execFileSync("npx", ["tsx", CLI, "--intent", intent, "--t", String(t)], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  return JSON.parse(stdout.trim().split("\n").pop() ?? "{}") as ClipDecision;
}

describe("B1 — per-beat clip-decision record", () => {
  it("carries every required B1 field for a talking beat", () => {
    const d = decisionFor("talk", 0.6);
    // Contract fields the PRD enumerates.
    expect(d).toHaveProperty("intent");
    expect(d).toHaveProperty("clipId");
    expect(d).toHaveProperty("source");
    expect(d).toHaveProperty("bonesTouched");
    expect(d).toHaveProperty("maxRotAmplitudeRad");
    expect(d).toHaveProperty("maxTransAmplitude");
    expect(d).toHaveProperty("reachedGLBRuntime");
    // Populated, sensible values.
    expect(d.intent).toBe("talk");
    expect(d.clipId).toBe("talk");
    expect(["extracted", "procedural", "embedded", "idle-fallback"]).toContain(d.source);
    expect(typeof d.maxTransAmplitude).toBe("number");
    expect(typeof d.reachedGLBRuntime).toBe("boolean");
    // A talk beat moves the BODY (head/torso/arms) over the threshold — not just the mouth.
    expect(d.bonesTouched).toBeGreaterThanOrEqual(3);
    expect(d.maxRotAmplitudeRad).toBeGreaterThan(0.1);
    const bodyBones = Object.keys(d.bodyBoneRotationRad);
    expect(bodyBones.some((b) => /arm|shoulder|chest|spine|head|neck/i.test(b))).toBe(true);
  }, 60_000);

  it("produces distinct body motion per intent (walk vs talk differ)", () => {
    const talk = decisionFor("talk", 0.5);
    const walk = decisionFor("walk", 0.5);
    expect(talk.intent).toBe("talk");
    expect(walk.intent).toBe("walk");
    // Different intents touch a different set of body bones / amplitudes.
    expect(JSON.stringify(talk.bodyBoneRotationRad)).not.toBe(JSON.stringify(walk.bodyBoneRotationRad));
  }, 60_000);

  it("emits reachedGLBRuntime:false from the library producer (scene-player flips it true)", () => {
    // poseFor cannot know whether the pose reached a GLB skeleton — only the player does after apply.
    const d = decisionFor("talk", 0.6);
    expect(d.reachedGLBRuntime).toBe(false);
  }, 60_000);
});

describe("B1 — scene-player + render-live wiring (source assertions)", () => {
  const scenePlayer = readFileSync(resolve(TEMPLATE, "src/scene-player.ts"), "utf8");
  const renderLive = readFileSync(resolve(TEMPLATE, "scripts/render-live.ts"), "utf8");
  const animationPerf = readFileSync(resolve(TEMPLATE, "src/animation-performance.ts"), "utf8");

  it("ClipDecision declares maxTransAmplitude + reachedGLBRuntime", () => {
    expect(animationPerf).toMatch(/readonly maxTransAmplitude:\s*number/);
    expect(animationPerf).toMatch(/readonly reachedGLBRuntime:\s*boolean/);
  });

  it("scene-player flips reachedGLBRuntime based on the actor apply result", () => {
    expect(scenePlayer).toMatch(/reachedGLBRuntime:\s*apply\.tracksApplied\s*>\s*0/);
  });

  it("scene-player gates the debug overlay behind AURA_DEBUG_OVERLAY=1 and writes it to the proof DOM", () => {
    expect(scenePlayer).toMatch(/VITE_AURA_DEBUG_OVERLAY/);
    expect(scenePlayer).toMatch(/aura-debug-overlay/);
    // The overlay is painted into the DOM element each frame when enabled.
    expect(scenePlayer).toMatch(/debugOverlayEl\.textContent\s*=/);
  });

  it("render-live records the new fields in the clip-decision log + per-character body-motion summary", () => {
    expect(renderLive).toMatch(/readonly maxTransAmplitude:\s*number/);
    expect(renderLive).toMatch(/readonly reachedGLBRuntime:\s*boolean/);
    // The clip-decision log is written into the render summary.
    expect(renderLive).toMatch(/clipDecisionLog/);
    expect(renderLive).toMatch(/reachedGLBRuntime:/);
  });
});
