import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import type { AuraAssetRef } from "@aura3d/engine";
import {
  createFighterAnimationController,
  embeddedClipFor,
  FIGHTER_ASSETS,
  FIGHTER_CLIP_MAP,
  REQUIRED_FIGHTER_CLIPS,
  THROW_CLIP_SPEED
} from "../../../apps/showcase-iron-crown/src/game/fighters";
import { assets } from "../../../apps/showcase-iron-crown/src/aura-assets";

const APP = path.resolve("apps/showcase-iron-crown");
const manifest = JSON.parse(readFileSync(path.join(APP, "aura.assets.json"), "utf8"));
const entries: Array<{ id: string; source: string; animations: string[] }> = manifest.assets;
const SHIPPED_CLIPS = [
  "Idle",
  "Walk_Fight_Forward",
  "Walk_Fight_Back",
  "Left_Jab_from_Guard",
  "Right_Uppercut_from_Guard",
  "Triple_Combo_Attack",
  "Block1",
  "Hit_Reaction",
  "Dead",
  "Regular_Jump"
];
const IC12_CLIPS = { idle: "Combat_Stance", crouch: "CrouchLookAroundBow", throw: "Over_Shoulder_Throw", win: "Victory_Fist_Pump" } as const;
/** The game holds the throw animation for 0.62 s (main.ts ATTACK_LAYER_HOLD / attack hold). */
const THROW_HOLD_S = 0.62;

describe("iron crown clip map (IC-12)", () => {
  it("maps idle, crouch, throw and win to their own clips and keeps Block1 for guard only", () => {
    for (const [state, clip] of Object.entries(IC12_CLIPS)) {
      expect(FIGHTER_CLIP_MAP[state as keyof typeof IC12_CLIPS]).toEqual({ clip });
    }
    expect(FIGHTER_CLIP_MAP.guard).toEqual({ clip: "Block1" });
    const block1States = REQUIRED_FIGHTER_CLIPS.filter((state) => FIGHTER_CLIP_MAP[state].clip === "Block1");
    expect(block1States).toEqual(["guard"]);
  });

  it("leaves dash as the only stand-in", () => {
    const standIns = REQUIRED_FIGHTER_CLIPS.filter((state) => embeddedClipFor(state).standIn);
    expect(standIns).toEqual(["dash"]);
  });

  it("every fighter GLB embeds the shipped clips in order plus the four IC-12 clips on the same skeleton", async () => {
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
    for (const key of Object.values(FIGHTER_ASSETS)) {
      const entry = entries.find((e) => e.id === key)!;
      expect(entry.animations).toEqual([...SHIPPED_CLIPS, ...Object.values(IC12_CLIPS)]);
      const doc = await io.read(path.join(APP, entry.source));
      const root = doc.getRoot();
      expect(root.listAnimations().map((a) => a.getName())).toEqual(entry.animations);
      const joints = new Set(root.listSkins()[0]!.listJoints());
      for (const name of Object.values(IC12_CLIPS)) {
        const animation = root.listAnimations().find((a) => a.getName() === name)!;
        const channels = animation.listChannels();
        expect(channels).toHaveLength(joints.size * 3);
        expect(channels.every((c) => joints.has(c.getTargetNode()!))).toBe(true);
      }
      for (const state of REQUIRED_FIGHTER_CLIPS) expect(entry.animations).toContain(FIGHTER_CLIP_MAP[state].clip);
    }
  });

  it("plays the trimmed throw clip across the throw hold", async () => {
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
    const entry = entries.find((e) => e.id === "ironcrownKenji")!;
    const doc = await io.read(path.join(APP, entry.source));
    const animation = doc.getRoot().listAnimations().find((a) => a.getName() === "Over_Shoulder_Throw")!;
    const duration = Math.max(...animation.listSamplers().map((s) => s.getInput()!.getMax([])[0]!));
    expect(duration).toBeCloseTo(2.5, 2);
    expect(duration / THROW_CLIP_SPEED).toBeGreaterThan(THROW_HOLD_S - 0.05);
    expect(duration / THROW_CLIP_SPEED).toBeLessThan(THROW_HOLD_S + 0.05);
  });

  it("the typed assets resolve every state without stand-ins except dash", () => {
    for (const key of Object.values(FIGHTER_ASSETS)) {
      const bundle = createFighterAnimationController(key, key, (assets as unknown as Record<string, AuraAssetRef<"model">>)[key]);
      expect(bundle.standIns).toEqual(['dash→"Walk_Fight_Forward"']);
      for (const clip of Object.values(IC12_CLIPS)) expect(bundle.embeddedClips.has(clip)).toBe(true);
    }
  });
});
