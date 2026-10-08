/**
 * PRD-06 T4.3 — `characterHero` reference module (the wiring Q-13-3 carries
 * into the `character-hero` template): every clip the spec references exists
 * on the admitted lane hero, the validator profile is `template-hero`, and
 * the T4.2 binding's blend weights reach `animationState().activeActions`
 * (≥ 2 during the scripted speed ramp).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  bindCharacterHero,
  characterHeroAnimationSpec,
  characterHeroClips,
  characterHeroValidatorProfile
} from "../../../../benchmarks/quality-rebuild/aura3d/scenes/prd06/characterHero.js";
import { readGlbDocument, inspectAnimationClips } from "../../../../packages/aura3d-cli/src/commands/prd06/inspectAnimationClips.js";
import { createPrd06ActorAnimationApi } from "../../../../packages/engine/src/agent-api/app/actorAnimationHandle.js";
import type { AuraRuntimeNodeHandle } from "../../../../packages/engine/src/agent-api/index.js";

const LANE_HERO_GLB = resolve(__dirname, "../../../../public/aura-assets/auraClashPlayerRig.3318d671.glb");
const LANE_HERO_CLIP_MANIFEST = resolve(__dirname, "../fixtures/lane-hero-clips.json");

/** Clip names on the admitted lane hero. `public/aura-assets/*.glb` is
 * LFS-tracked and the unit lane checks out without `lfs: true`, so an LFS
 * pointer falls back to the committed manifest (same contract). */
function laneHeroClipNames(): ReadonlySet<string> {
  const buffer = readFileSync(LANE_HERO_GLB);
  if (buffer.subarray(0, 20).toString("latin1").startsWith("version https://git-lfs")) {
    const manifest = JSON.parse(readFileSync(LANE_HERO_CLIP_MANIFEST, "utf8")) as { clips: string[] };
    return new Set(manifest.clips);
  }
  const { json, bin } = readGlbDocument(buffer);
  return new Set(inspectAnimationClips(json, bin).map((clip) => clip.name));
}

/** Speed-ramping controller in the template's own `{ speed }` shape. */
function rampController(rampSeconds: number) {
  let t = 0;
  return {
    state: { speed: 0 },
    tick(dt: number) {
      t += dt;
      this.state = { speed: Math.min(4.4, (t / rampSeconds) * 4.4) };
    }
  };
}

/** Model node whose snapshot() echoes the binding characterAnimation writes. */
function modelNode(id: string): AuraRuntimeNodeHandle {
  let binding: unknown;
  const node: AuraRuntimeNodeHandle = {
    kind: "model",
    id,
    snapshot: () => ({ id, kind: "model", ...(binding !== undefined ? { animationBinding: binding } : {}) }),
    setAnimationBinding(next: unknown) {
      binding = next;
      return node;
    }
  } as unknown as AuraRuntimeNodeHandle;
  return node;
}

describe("T4.3 characterHero reference module", () => {
  it("carries the template-hero validator profile (T4.6)", () => {
    expect(characterHeroValidatorProfile).toBe("template-hero");
  });

  it("references only clips that exist on the lane hero GLB", () => {
    const clipNames = laneHeroClipNames();
    const spec = characterHeroAnimationSpec();
    const used = new Set<string>([
      ...spec.locomotion.clips.map((entry) => entry.clip),
      spec.airborne?.jumpStart,
      spec.airborne?.fall,
      spec.airborne?.land,
      ...Object.values(spec.actions ?? {}).map((action) => action.clip)
    ].filter((name): name is string => name !== undefined));
    for (const name of used) expect(clipNames.has(name), `clip "${name}"`).toBe(true);
    // §6.9 actions the rig supplies: locomotion + airborne + attack/hit/death.
    for (const required of Object.values(characterHeroClips)) {
      expect(clipNames.has(required), `map "${required}"`).toBe(true);
    }
  });

  it("blend weights reach animationState().activeActions (≥ 2 mid-ramp)", () => {
    const controller = rampController(2);
    const node = modelNode("character-hero");
    const binding = bindCharacterHero(controller, node);
    const api = createPrd06ActorAnimationApi(node);
    const dt = 1 / 60;
    let midRampActions = 0;
    for (let f = 0; f < 120; f++) {
      controller.tick(dt);
      binding.update(dt);
      if (f === 90) {
        // t = 1.5 s → speed ≈ 3.3 m/s → Walk_Loop + Sprint_Loop both active.
        midRampActions = api.animationState()?.activeActions.length ?? 0;
      }
    }
    expect(midRampActions).toBeGreaterThanOrEqual(2);
    expect(binding.snapshot().weights.length).toBeGreaterThanOrEqual(1);
    binding.dispose();
  });
});
