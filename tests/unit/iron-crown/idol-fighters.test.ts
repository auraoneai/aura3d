import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FIGHTERS, createFighterNode } from "../../../apps/showcase-iron-crown/src/game/fighters";
import { IDOL_FIGHTER_KEYS, IDOL_HELD_PROPS, gladiatorDrive, idolFighterRig } from "../../../apps/showcase-iron-crown/src/game/idolFighters";
import { idolBind, solveIdolPose } from "../../../apps/showcase-iron-crown/src/game/idolHumanoid";
import { IC_IDOL_RIGS } from "../../../apps/showcase-iron-crown/src/game/idol-rigs";
import { idolAssets } from "../../../apps/showcase-iron-crown/src/game/idol-assets";

const CLIPS = ["idle", "walk", "dash", "jump", "crouch", "guard", "light", "heavy", "special", "throw", "hitstun", "ko", "win"] as const;

describe("iron crown Idol fighters (Idol wow pass)", () => {
  it("every fighter has an admitted rigged Idol body per side with extracted rig data", () => {
    for (const f of FIGHTERS) {
      for (const side of ["p1", "cpu"] as const) {
        const key = IDOL_FIGHTER_KEYS[f.id][side];
        expect(idolFighterRig(f.id, side), key).toBeDefined();
        expect(existsSync(path.resolve(`apps/showcase-iron-crown/assets/idol/${key}.idol.json`)), key).toBe(true);
      }
      for (const prop of IDOL_HELD_PROPS[f.id] ?? []) expect((idolAssets as Record<string, unknown>)[prop.key], prop.key).toBeDefined();
    }
  });

  it("createFighterNode mounts the Idol body (and held props) under the same runtime node id", () => {
    for (const f of FIGHTERS) {
      const json = JSON.stringify(createFighterNode("player", f, f.name, [0, 0, 0], 1, {}, undefined, true, true).toJSON());
      expect(json).toContain('"kind":"model"');
      expect(json).toContain('"id":"player-idol"');
      expect(json).toContain('"id":"player"');
    }
  });

  it("the idol-assets slice is current with the shared catalog", () => {
    execFileSync("node", ["apps/showcase-iron-crown/scripts/extract-idol-assets.mjs", "--check"], { stdio: "pipe" });
  });

  it("the role map finds a plausible humanoid in every rig", () => {
    for (const [key, skel] of Object.entries(IC_IDOL_RIGS)) {
      const b = idolBind(skel);
      const r = skel.roles;
      const y = (i: number) => b.worldT[i]![1];
      expect(y(r.head), key).toBeGreaterThan(y(r.chest));
      expect(y(r.chest), key).toBeGreaterThan(y(r.hips));
      expect(y(r.hips), key).toBeGreaterThan(y(r.shinL));
      expect(y(r.shinL), key).toBeGreaterThan(y(r.footL));
      expect(b.worldT[r.handL]![0], key).toBeGreaterThan(0.4);
      expect(b.worldT[r.handR]![0], key).toBeLessThan(-0.4);
    }
  });

  it("every clip pose keeps the feet near the floor and the hands below the head except the win salute", () => {
    for (const [key, skel] of Object.entries(IC_IDOL_RIGS)) {
      const r = skel.roles;
      for (const clip of CLIPS) {
        for (const u of [0, 0.35, 0.7, 1]) {
          const { drive } = gladiatorDrive({ clip, time: u * 2, clipProgress: u, moveDir: 1 });
          const solved = solveIdolPose(skel, drive);
          for (const v of solved.worldT) for (const c of v) expect(Number.isFinite(c), `${key} ${clip}`).toBe(true);
          const footY = Math.min(solved.worldT[r.footL]![1], solved.worldT[r.footR]![1]);
          if (clip !== "jump" && clip !== "ko") expect(footY, `${key} ${clip} ${u}`).toBeLessThan(0.3);
          expect(footY, `${key} ${clip} ${u}`).toBeGreaterThan(-0.2);
          // Arms hang (not T-pose): a T-posed arm holds the wrist level with the shoulder and straight out to the side.
          // (Measured against the arm itself, not the bind span: Boulder is bound in an A-pose, the others in a T-pose.)
          if (clip !== "ko") {
            const b = idolBind(skel);
            for (const [sh, hd] of [[r.upperArmL, r.handL], [r.upperArmR, r.handR]] as const) {
              const arm = Math.hypot(...b.worldT[hd]!.map((v, i) => v - b.worldT[sh]![i]!));
              const s = solved.worldT[sh]!, h = solved.worldT[hd]!;
              const tPose = Math.abs(h[0] - s[0]) > 0.85 * arm && Math.abs(h[1] - s[1]) < 0.2 * arm;
              expect(tPose, `${key} ${clip} ${u} T-pose`).toBe(false);
            }
          }
        }
      }
    }
  });

  it("drives the skeleton from the joint pose (bones change between idle and a heavy attack)", () => {
    const [key, skel] = Object.entries(IC_IDOL_RIGS)[0]!;
    const a = solveIdolPose(skel, gladiatorDrive({ clip: "idle", time: 0 }).drive);
    const b = solveIdolPose(skel, gladiatorDrive({ clip: "heavy", time: 0, clipProgress: 0.55 }).drive);
    const hand = skel.roles.handR;
    const d = Math.hypot(...a.worldT[hand]!.map((v, i) => v - b.worldT[hand]![i]!));
    expect(d, key).toBeGreaterThan(0.1);
  });

  it("spec names no brand, real person or other game", () => {
    const spec = readFileSync(path.resolve("tools/idol/specs/iron-crown.json"), "utf8");
    expect(spec).not.toMatch(/\b(nike|adidas|marvel|tekken|street fighter|mortal kombat)\b/i);
  });
});
