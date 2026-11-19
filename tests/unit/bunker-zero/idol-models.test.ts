import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { computeEnemyRigPose } from "../../../apps/showcase-bunker-zero/src/art/proceduralModels";
import {
  IDOL_ENEMIES,
  enemySpec,
  IDOL_VIEWMODELS,
  buildIdolEnemyNode,
  idolModel,
  idolViewmodelNode,
  poseIdolEnemy,
  resolvePlacement
} from "../../../apps/showcase-bunker-zero/src/art/idolModels";
import { BZ_IDOL_RIGS } from "../../../apps/showcase-bunker-zero/src/art/idol-rigs";
import { idolBind } from "../../../apps/showcase-bunker-zero/src/art/idolHumanoid";

const STATES = ["idle", "patrol", "alert", "chase", "attack", "pain", "dead"] as const;

describe("bunker zero Idol models (Idol wow pass)", () => {
  it("the idol-assets slice is current with the shared catalog", () => {
    execFileSync("node", ["apps/showcase-bunker-zero/scripts/extract-idol-assets.mjs", "--check"], { stdio: "pipe" });
  });

  it("all four first-person weapons are Idol models", () => {
    for (const id of ["knife", "pistol", "mg", "rocket"] as const) {
      expect(idolModel(IDOL_VIEWMODELS[id].key), id).toBeDefined();
      const json = JSON.stringify(idolViewmodelNode(id, `vm ${id}`)!.toJSON());
      expect(json).toContain('"kind":"model"');
    }
  });

  it("each enemy kind mounts its Idol body under the sim's body node id", () => {
    for (const kind of ["guard", "gunner", "boss", "dog"] as const) {
      const node = buildIdolEnemyNode(kind, `e ${kind}`, (id) => ({ id, mutable: true }) as never, `f0-en-${kind}`, true);
      expect(node, kind).toBeDefined();
      const json = JSON.stringify(node!.toJSON());
      expect(json).toContain(`f0-en-${kind}-idol`);
    }
  });

  it("biped poses stay finite, keep the gun in the hands and the feet on the floor", () => {
    for (const kind of ["guard", "gunner", "boss"] as const) {
      const skel = BZ_IDOL_RIGS[enemySpec(kind).key]!;
      const b = idolBind(skel);
      for (const state of STATES) {
        for (const t of [0, 0.37, 0.9]) {
          const pose = computeEnemyRigPose({ kind, state, time: t * 3, stateT: t, painT: state === "pain" ? 0.2 : 0, deathT: state === "dead" ? 1 : 0, phaseSeed: 0.4, aimPitch: -0.1 });
          let bones: Record<string, { rotation: { x: number; y: number; z: number; w: number } }> = {};
          let gun: number[] | undefined;
          const nodes: Record<string, unknown> = {
            "e-idol": { setPosition() {}, setRotation() {}, setAnimationPose: (p: { bones: typeof bones }) => { bones = p.bones; } },
            "e-idol-gun": { setPosition: (x: number, y: number, z: number) => { gun = [x, y, z]; }, setRotation() {} }
          };
          expect(poseIdolEnemy((id) => nodes[id] as never, "e", kind, pose, state)).toBe(true);
          expect(Object.keys(bones).length).toBe(skel.joints.length);
          for (const v of Object.values(bones)) for (const c of Object.values(v.rotation)) expect(Number.isFinite(c), `${kind} ${state}`).toBe(true);
          if (enemySpec(kind).gun && state !== "dead") {
            expect(gun![1], `${kind} ${state} gun height`).toBeGreaterThan(b.hipsY * 0.75);
            expect(gun![1], `${kind} ${state} gun height`).toBeLessThan(b.worldT[skel.roles.head]![1]);
            expect(gun![2], `${kind} ${state} gun in front`).toBeGreaterThan(0.05);
          }
        }
      }
    }
  });

  it("grip/tip placements put the grip at the origin", () => {
    for (const kind of ["guard", "gunner"] as const) {
      const p = IDOL_ENEMIES[kind].gun!;
      const r = resolvePlacement(p);
      expect(r.position.every(Number.isFinite)).toBe(true);
    }
  });
});

describe("bunker zero Idol moving parts + idle life (GPU QA)", () => {
  it("an idle guard's bones change over 0.7 s (breath, weight shift, scan) and the visor follows the head", () => {
    const run = (t: number) => {
      let bones: Record<string, { rotation: { x: number; y: number; z: number; w: number } }> = {};
      let visor: number[] = [];
      const nodes: Record<string, unknown> = {
        "e-idol": { setPosition() {}, setRotation() {}, setAnimationPose: (p: { bones: typeof bones }) => { bones = p.bones; } },
        "e-idol-gun": { setPosition() {}, setRotation() {} },
        "e-idol-visor": { setPosition: (x: number, y: number, z: number) => { visor = [x, y, z]; }, setRotation() {} }
      };
      const pose = computeEnemyRigPose({ kind: "guard", state: "idle", time: t, stateT: t, painT: 0, deathT: 0, phaseSeed: 0.4 });
      poseIdolEnemy((id) => nodes[id] as never, "e", "guard", pose, "idle", t);
      return { bones, visor };
    };
    const a = run(3), b = run(3.7);
    const diff = Math.max(...Object.keys(a.bones).map((k) => Math.abs(a.bones[k]!.rotation.y - b.bones[k]!.rotation.y) + Math.abs(a.bones[k]!.rotation.x - b.bones[k]!.rotation.x)));
    expect(diff).toBeGreaterThan(0.02);
    expect(a.visor[1]).toBeGreaterThan(1.3);
  });

  it("drone rotors are visible: blades fill the duct opening, light against the dark ring, with a blur disc", async () => {
    const { IDOL_DRONE, idolDroneNode } = await import("../../../apps/showcase-bunker-zero/src/art/idolModels");
    const json = JSON.stringify((idolDroneNode("d", 0, (id: string) => ({ id }) as never) as unknown as { toJSON(): unknown }).toJSON());
    for (let i = 0; i < 4; i++) {
      expect(json).toContain(`d rotor ${i} blade 0`);
      expect(json).toContain(`d rotor ${i} blur`);
    }
    // The duct's measured inner radius is 0.107 m: blades reach most of it without poking through the ring.
    expect(IDOL_DRONE.bladeLength / 2).toBeGreaterThan(0.08);
    expect(IDOL_DRONE.bladeLength / 2).toBeLessThan(0.107);
    expect(IDOL_DRONE.bladeWidth).toBeGreaterThanOrEqual(0.04);
    for (const d of IDOL_DRONE.ducts) expect(d[1]).toBeGreaterThan(0.32), expect(d[1]).toBeLessThan(0.44);
  });

  it("drone rotors are static slot nodes, so a floor start re-shows them (real-GPU audit: hideAllRuntime left the ducts empty)", async () => {
    const { readFileSync } = await import("node:fs");
    const main = readFileSync("apps/showcase-bunker-zero/src/main.ts", "utf8");
    // hideAllRuntime hides every SLOT_IDS node and re-shows only SLOT_STATIC_IDS of the active slot
    expect(main).toMatch(/for \(const id of SLOT_IDS\[s\]!\) opt\(id\)\?\.setVisible\(false\);\s*if \(s === slot\) for \(const id of SLOT_STATIC_IDS\[s\]!\) opt\(id\)\?\.setVisible\(true\);/);
    const bind = main.match(/idolDroneNode\(`f\$\{slot\} patrol-drone`, slot, \(id\) => (slotNode\([^)]*\))\)/);
    expect(bind?.[1]).toBe('slotNode(slot, id, ["floor-static", "moving-part"], true)');
  });

  it("the gunner's barrels and the drone's rotors turn between frames", async () => {
    const { idolDroneRotorYaw } = await import("../../../apps/showcase-bunker-zero/src/art/idolModels");
    for (let i = 0; i < 4; i++) expect(Math.abs(idolDroneRotorYaw(1.0, i) - idolDroneRotorYaw(1.03, i))).toBeGreaterThan(0.5);
    const spins: number[] = [];
    for (const t of [1, 1.1]) {
      const nodes: Record<string, unknown> = {
        "e-idol": { setPosition() {}, setRotation() {}, setAnimationPose() {} },
        "e-idol-gun": { setPosition() {}, setRotation() {} },
        "e-idol-barrels": { setPosition() {}, setRotation: (_x: number, _y: number, z: number) => void spins.push(z) }
      };
      const pose = computeEnemyRigPose({ kind: "gunner", state: "attack", time: t, stateT: t, painT: 0, deathT: 0, phaseSeed: 0.4 });
      poseIdolEnemy((id) => nodes[id] as never, "e", "gunner", pose, "attack", t);
    }
    expect(spins.length).toBe(2);
    expect(Math.abs(spins[1]! - spins[0]!)).toBeGreaterThan(0.1);
  });
});
