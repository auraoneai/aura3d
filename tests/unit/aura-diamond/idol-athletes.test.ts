import { describe, expect, it } from "vitest";
import { computeBaseballBoneMatrices, computeBaseballRolePose, roleForBaseballActorId } from "../../../apps/showcase-aura-diamond-3d/src/art/proceduralModels";
import { idolForwardKinematics } from "../../../apps/showcase-aura-diamond-3d/src/idol/athlete";
import { IDOL_ATHLETE_BINDS } from "../../../apps/showcase-aura-diamond-3d/src/idol/bind.generated";
import {
  IDOL_ATHLETE_KEYS,
  gameFrameFromMats,
  headgearKind,
  idolAthletesEnabled,
  idolHeadgearFit,
  idolHeadgearWorld,
  idolKeyForActor,
  idolPoseForActor,
  preparedIdolRig
} from "../../../apps/showcase-aura-diamond-3d/src/idol/drive";

const dist = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
const ACTORS = ["pitcher", "f-c", "f-1b", "f-2b", "f-ss", "f-3b", "f-lf", "f-cf", "f-rf", "batter", "runner-0", "runner-1", "runner-2", "coach-1b", "coach-3b"];
const CLIPS = ["Crouch_Idle_Loop", "Idle_Loop", "Walk_Loop", "Sprint_Loop", "Telegraph", "Release", "Contest"];

describe("Aura Diamond Idol athletes (rigged GLB driven by the game rig)", () => {
  it("has a bind table with a full humanoid role map for every athlete GLB", () => {
    for (const key of IDOL_ATHLETE_KEYS) {
      const bind = IDOL_ATHLETE_BINDS[key]!;
      expect(bind, key).toBeDefined();
      const names = new Set(bind.joints.map((j) => j.name));
      const r = bind.roles;
      for (const n of [r.hips, r.head, ...r.spine, r.armL.upper, r.armL.fore, r.armL.hand, r.armR.upper, r.armR.fore, r.armR.hand, r.legL.thigh, r.legL.shin, r.legL.foot, r.legR.thigh, r.legR.shin, r.legR.foot]) {
        expect(names.has(n), `${key} ${n}`).toBe(true);
      }
      // left is +X (the game rig's convention), the head is on top, the feet at the bottom
      const P = (n: string) => bind.joints.find((j) => j.name === n)!.pos;
      expect(P(r.armL.hand)[0]!).toBeGreaterThan(0.4);
      expect(P(r.armR.hand)[0]!).toBeLessThan(-0.4);
      expect(P(r.head)[1]!).toBeGreaterThan(1.4);
      expect(P(r.legL.foot)[1]!).toBeLessThan(0.2);
      expect(bind.height).toBeGreaterThan(1.8);
      expect(bind.height).toBeLessThan(1.95);
    }
  });

  it("assigns home whites to the fielders, gear to the catcher, road greys to the batting side; on unless ?idol=0", () => {
    expect(idolKeyForActor("f-c")).toBe("diaIdolCatcher");
    for (const id of ["batter", "runner-0", "coach-1b"]) expect(idolKeyForActor(id)).toBe("diaIdolBatterA");
    for (const id of ["pitcher", "f-ss", "f-cf"]) expect(idolKeyForActor(id)).toMatch(/^diaIdolFielder[AB]$/);
    expect(idolAthletesEnabled("")).toBe(true);
    expect(idolAthletesEnabled("?idol=0")).toBe(false);
  });

  it("puts the Idol palms on the game palms (bat grip, gloves, mitt) and keeps the soles grounded in every role pose", () => {
    for (const id of ACTORS) {
      const key = idolKeyForActor(id);
      const rig = preparedIdolRig(key);
      for (const clip of CLIPS) {
        for (const t of [0, 0.37, 0.81]) {
          const mats = computeBaseballBoneMatrices(computeBaseballRolePose(roleForBaseballActorId(id), clip, t, 0.3, 1));
          const game = gameFrameFromMats(mats);
          const pose = idolPoseForActor(key, mats);
          const label = `${id} ${clip} t=${t}`;
          expect(dist(pose.palmL, game.palmL), `${label} palm L`).toBeLessThan(0.03);
          expect(dist(pose.palmR, game.palmR), `${label} palm R`).toBeLessThan(0.03);
          // the local transforms reproduce the solve (what the engine's skeleton evaluates)
          const fk = idolForwardKinematics(rig, pose.bones);
          const r = rig.bind.roles;
          const footL = fk.get(r.legL.foot)!.pos;
          const ankleTarget = [game.pos.LeftFoot[0], game.pos.LeftFoot[1] + rig.ankleOffsetL[1], game.pos.LeftFoot[2] + rig.ankleOffsetL[2]];
          expect(dist(footL, ankleTarget), `${label} ankle L`).toBeLessThan(0.03);
          for (const b of Object.values(pose.bones)) {
            for (const v of [b.position.x, b.position.y, b.position.z, b.rotation.x, b.rotation.y, b.rotation.z, b.rotation.w]) expect(Number.isFinite(v)).toBe(true);
          }
        }
      }
    }
  });

  it("stands the bind pose on the ground with the hands at the game's hanging-arm palms", () => {
    for (const key of IDOL_ATHLETE_KEYS) {
      const rig = preparedIdolRig(key);
      const mats = computeBaseballBoneMatrices();
      const pose = idolPoseForActor(key, mats);
      const fk = idolForwardKinematics(rig, pose.bones);
      const r = rig.bind.roles;
      const bindFoot = rig.byName.get(r.legL.foot)!.pos;
      expect(Math.abs(fk.get(r.legL.foot)!.pos[1] - bindFoot[1]), key).toBeLessThan(0.02);
      expect(Math.abs(fk.get(r.hips)!.pos[1] - rig.byName.get(r.hips)!.pos[1]), key).toBeLessThan(0.02);
    }
  });

  it("seats each cap and helmet over the generated head and follows the head", () => {
    for (const id of ACTORS) {
      const key = idolKeyForActor(id);
      const fit = idolHeadgearFit(key, headgearKind(id));
      expect(fit.scale, id).toBeGreaterThanOrEqual(1);
      expect(fit.scale, id).toBeLessThan(1.35);
      const pose = idolPoseForActor(key, computeBaseballBoneMatrices());
      const cap = idolHeadgearWorld(pose, fit, [0, 0, 0], 0);
      const crown = IDOL_ATHLETE_BINDS[key]!.head.crownY;
      expect(cap.position[1], id).toBeGreaterThan(crown - 0.16);
      expect(cap.position[1], id).toBeLessThan(crown);
    }
  });
});

describe("Aura Diamond Idol set pieces keep their live parts (MOVING-PARTS pass)", () => {
  const find = (node: any, name: string): any => {
    if (!node || typeof node !== "object") return null;
    if (node.name === name) return node;
    for (const c of node.children ?? node.nodes ?? []) { const hit = find(c, name); if (hit) return hit; }
    return null;
  };
  it("lights the Idol lighthouse lantern with the emissive beacon, inside the lantern room", async () => {
    const { buildParkScene } = await import("../../../apps/showcase-aura-diamond-3d/src/scene");
    const { PARKS } = await import("../../../apps/showcase-aura-diamond-3d/src/rules");
    const snap = buildParkScene(PARKS.sandlot).toJSON();
    const house = find(snap, "harbor-lighthouse");
    expect(house?.kind).toBe("group");
    const beacon = find(house, "harbor-lighthouse-beacon");
    expect(beacon?.material?.emissiveIntensity).toBeGreaterThan(1);
    // lantern room of the 24 m generated tower: 19-21.5 m up
    expect(beacon.position[1]).toBeGreaterThan(19);
    expect(beacon.position[1]).toBeLessThan(21.5);
  });
});

describe("Aura Diamond Idol set pieces stand on the ground (no floating, every park)", () => {
  it("places every Idol set piece with its grounded base at or just below the flat park ground (y in [-0.5, 0])", async () => {
    const { buildParkScene } = await import("../../../apps/showcase-aura-diamond-3d/src/scene");
    const { PARKS, PARK_ORDER } = await import("../../../apps/showcase-aura-diamond-3d/src/rules");
    const { readFileSync } = await import("node:fs");
    // every shipped set-piece GLB is grounded at its lowest vertex (normalised: minY = 0)
    for (const key of ["diaIdolScoreboard", "diaIdolLightPole", "diaIdolLighthouse", "diaIdolWaterTower", "diaIdolLunarRover", "diaIdolJuniper"]) {
      expect(JSON.parse(readFileSync(`apps/showcase-aura-diamond-3d/assets/idol/${key}.idol.json`, "utf8")).normalized.minY, key).toBe(0);
    }
    let seen = 0;
    const walk = (n: any, parentY: number) => {
      if (!n || typeof n !== "object") return;
      const y = parentY + (Array.isArray(n.position) ? n.position[1] : 0);
      const url = String(n.asset?.url ?? "");
      if (n.kind === "model" && /\/diaIdol(Scoreboard|LightPole|Lighthouse|WaterTower|LunarRover|Juniper)\./.test(url)) {
        seen++;
        const ys = n.instances ? n.instances.map((i: any) => parentY + (i.position?.[1] ?? 0)) : [y];
        for (const v of ys) { expect(v, `${n.name}`).toBeLessThanOrEqual(0); expect(v, `${n.name}`).toBeGreaterThanOrEqual(-0.5); }
      }
      for (const c of n.children ?? n.nodes ?? []) walk(c, n.kind === "group" ? y : parentY);
    };
    for (const park of PARK_ORDER) walk(buildParkScene(PARKS[park]).toJSON(), 0);
    expect(seen).toBeGreaterThanOrEqual(8);
  });
});
