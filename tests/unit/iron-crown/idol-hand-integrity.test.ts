/**
 * Owner complaint (real-GPU, Iron Crown): hands exploding into shards and forearms twisting thin during strikes.
 * Every Iron Crown fighter and every Bunker Zero enemy, on its shipped rigged GLB, through every logical state the game
 * plays (the generated-motion clips, arm-elevation and twist limits included), skinned on the CPU with the same palette
 * maths the engine uses (the same checks as tests/unit/idol-humanoid/hand-integrity.test.ts):
 *  - hand: a hand or finger vertex stays within its bind distance to the wrist + 12 cm, and never stretches past 1.6x;
 *  - forearm: the mean radial distance of forearm vertices from the elbow->wrist axis keeps >= 55% of its bind value.
 * Also: no NaN anywhere in the posed palette, and no skinned vertex leaves a 3-body-height box (no explosions).
 */
import { readFileSync } from "node:fs";
import { NodeIO, type Node } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { describe, expect, it } from "vitest";
import { IDOL_FIGHTER_KEYS, idolFighterPose } from "../../../apps/showcase-iron-crown/src/game/idolFighters";
import { IC_IDOL_RIGS } from "../../../apps/showcase-iron-crown/src/game/idol-rigs";
import type { IdolSkeleton } from "../../../apps/showcase-iron-crown/src/game/idolHumanoid";
import { computeEnemyRigPose } from "../../../apps/showcase-bunker-zero/src/art/proceduralModels";
import { enemySpec, poseIdolEnemy } from "../../../apps/showcase-bunker-zero/src/art/idolModels";
import { BZ_IDOL_RIGS } from "../../../apps/showcase-bunker-zero/src/art/idol-rigs";

type Mat = number[];
type Bones = Record<string, { rotation: { x: number; y: number; z: number; w: number }; position?: { x: number; y: number; z: number } }>;
const mul = (a: Mat, b: ArrayLike<number>): Mat => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r]! * b[c * 4 + k]!; return o; };
const xf = (m: Mat, v: ArrayLike<number>) => [0, 1, 2].map((r) => m[r]! * v[0]! + m[4 + r]! * v[1]! + m[8 + r]! * v[2]! + m[12 + r]!);
const d3 = (a: number[], b: number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

async function rig(file: string, skel: IdolSkeleton) {
  const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).readBinary(new Uint8Array(readFileSync(file)));
  const skin = doc.getRoot().listSkins()[0]!;
  const joints = skin.listJoints();
  const ibm = skin.getInverseBindMatrices()!.getArray()!;
  const bind = new Map<Node, { r: number[]; t: number[] }>(joints.map((j) => [j, { r: [...j.getRotation()], t: [...j.getTranslation()] }]));
  const prim = doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives()).find((p) => p.getAttribute("JOINTS_0"))!;
  const P = prim.getAttribute("POSITION")!, J = prim.getAttribute("JOINTS_0")!, W = prim.getAttribute("WEIGHTS_0")!;
  const kids = (k: number): number[] => [k, ...joints.flatMap((j, i) => (j.getParentNode() === joints[k] ? kids(i) : []))];
  const ro = skel.roles;
  const sides = ([[ro.handL, ro.forearmL], [ro.handR, ro.forearmR]] as const).map(([hand, lower]) => {
    const handSet = new Set(kids(hand));
    const handV: number[] = [], foreV: number[] = [];
    const jj = [0, 0, 0, 0], ww = [0, 0, 0, 0];
    for (let v = 0; v < P.getCount(); v++) {
      J.getElement(v, jj); W.getElement(v, ww);
      const dom = jj[ww.indexOf(Math.max(...ww))]!;
      if (handSet.has(dom)) handV.push(v); else if (dom === lower) foreV.push(v);
    }
    return { hand, lower, handV, foreV };
  });
  const sampleV = Array.from({ length: 400 }, (_, i) => Math.floor((i * P.getCount()) / 400));
  const skinV = (pal: Mat[], v: number) => {
    const p = [0, 0, 0], jj = [0, 0, 0, 0], ww = [0, 0, 0, 0], out = [0, 0, 0];
    P.getElement(v, p); J.getElement(v, jj); W.getElement(v, ww);
    for (let i = 0; i < 4; i++) { if (!ww[i]) continue; const q = xf(pal[jj[i]!]!, p); for (let c = 0; c < 3; c++) out[c]! += ww[i]! * q[c]!; }
    return out;
  };
  const measure = () => {
    const pal = joints.map((j, k) => mul(j.getWorldMatrix() as unknown as Mat, ibm.slice(k * 16, k * 16 + 16)));
    const finite = pal.every((m) => m.every(Number.isFinite));
    const spread = Math.max(...sampleV.map((v) => Math.max(...skinV(pal, v).map(Math.abs))));
    const per = sides.map((sd) => {
      const wrist = xf(joints[sd.hand]!.getWorldMatrix() as unknown as Mat, [0, 0, 0]), elbow = xf(joints[sd.lower]!.getWorldMatrix() as unknown as Mat, [0, 0, 0]);
      const ax = [wrist[0]! - elbow[0]!, wrist[1]! - elbow[1]!, wrist[2]! - elbow[2]!], al = Math.hypot(...ax);
      const radial = (q: number[]) => { const w = [q[0]! - elbow[0]!, q[1]! - elbow[1]!, q[2]! - elbow[2]!]; const t = (w[0]! * ax[0]! + w[1]! * ax[1]! + w[2]! * ax[2]!) / (al * al); return Math.hypot(w[0]! - t * ax[0]!, w[1]! - t * ax[1]!, w[2]! - t * ax[2]!); };
      const fore = sd.foreV.map((v) => radial(skinV(pal, v)));
      return { handD: sd.handV.map((v) => d3(skinV(pal, v), wrist)), foreMean: fore.reduce((a, b) => a + b, 0) / Math.max(1, fore.length) };
    });
    return { finite, spread, per };
  };
  for (const [j, b] of bind) { j.setRotation(b.r as never); j.setTranslation(b.t as never); }
  const rest = measure();
  const posed = (bones: Bones) => {
    for (const j of joints) {
      const p = bones[j.getName()];
      const b = bind.get(j)!;
      j.setRotation(p ? [p.rotation.x, p.rotation.y, p.rotation.z, p.rotation.w] : (b.r as never));
      j.setTranslation(p?.position ? [p.position.x, p.position.y, p.position.z] : (b.t as never));
    }
    return measure();
  };
  return { rest, posed, counts: sides.map((s) => [s.handV.length, s.foreV.length]) };
}

function check(label: string, rest: Awaited<ReturnType<typeof rig>>["rest"], m: Awaited<ReturnType<typeof rig>>["rest"], failures: string[]) {
  if (!m.finite) failures.push(`${label}: NaN in the skinning palette`);
  if (m.spread > 3) failures.push(`${label}: a vertex left the 3 m box (${m.spread.toFixed(2)})`);
  m.per.forEach((side, si) => {
    const r = rest.per[si]!;
    let worst = 0, worstD0 = 0, worstD = 0;
    side.handD.forEach((d, i) => { const d0 = r.handD[i]!; const ex = Math.max(d - d0 - 0.12, d - d0 * 1.6 - 0.02); if (ex > worst) { worst = ex; worstD0 = d0; worstD = d; } });
    if (worst > 0) failures.push(`${label} ${si ? "R" : "L"} hand vertex ${worstD0.toFixed(3)} -> ${worstD.toFixed(3)} m`);
    if (r.foreMean > 0 && side.foreMean < r.foreMean * 0.55) failures.push(`${label} ${si ? "R" : "L"} forearm section ${((side.foreMean / r.foreMean) * 100).toFixed(0)}%`);
  });
}

const FIGHTER_STATES = ["idle", "walk", "dash", "jump", "crouch", "guard", "light", "heavy", "special", "throw", "hitstun", "ko", "win"] as const;
const ENEMY_STATES = ["idle", "patrol", "alert", "chase", "attack", "pain", "dead"] as const;

describe("Idol hands and forearms stay whole through every played clip (Iron Crown fighters, Bunker Zero enemies)", () => {
  for (const [fighter, sides] of Object.entries(IDOL_FIGHTER_KEYS)) {
    for (const key of Object.values(sides)) {
      it(`${key} (${fighter}): every state x 4 times`, async () => {
        const skel = IC_IDOL_RIGS[key]!;
        const r = await rig(`apps/showcase-iron-crown/assets/idol/${key}.glb`, skel);
        for (const [h, f] of r.counts) { expect(h).toBeGreaterThan(20); expect(f).toBeGreaterThan(20); }
        const failures: string[] = [];
        for (const state of FIGHTER_STATES) {
          for (const u of [0.15, 0.4, 0.65, 0.9]) {
            const hold = state === "special" ? 0.78 : state === "heavy" ? 0.56 : 0.45;
            const solved = idolFighterPose(skel, fighter as never, { clip: state, time: 0.3 + u * 2, clipProgress: u, clipTime: u * 1.6, hold, moveDir: u > 0.5 ? -1 : 1 } as never).solved;
            check(`${key} ${state}@${u}`, r.rest, r.posed(solved.bones as Bones), failures);
          }
        }
        expect(failures.slice(0, 10), `${failures.length} failures`).toEqual([]);
      }, 240_000);
    }
  }

  for (const kind of ["guard", "gunner", "boss"] as const) {
    const key = enemySpec(kind).key;
    it(`${key} (${kind}): every state x 4 times`, async () => {
      const skel = BZ_IDOL_RIGS[key]! as unknown as IdolSkeleton;
      const r = await rig(`apps/showcase-bunker-zero/assets/idol/${key}.glb`, skel);
      const failures: string[] = [];
      for (const state of ENEMY_STATES) {
        for (const u of [0.15, 0.4, 0.65, 0.9]) {
          const t = 0.2 + u * 2;
          let bones: Bones = {};
          const nodes: Record<string, unknown> = {
            "e-idol": { setPosition() {}, setRotation() {}, setAnimationPose: (p: { bones: Bones }) => { bones = p.bones; } },
            "e-idol-gun": { setPosition() {}, setRotation() {} }
          };
          const pose = computeEnemyRigPose({ kind, state: state as never, time: t, stateT: t, painT: 0, deathT: state === "dead" ? t : 0, phaseSeed: 0.4 });
          poseIdolEnemy((n) => (nodes[n] ?? { setPosition() {}, setRotation() {} }) as never, "e", kind, pose, state, t, { stateT: t, deathT: state === "dead" ? t : 0, phase: 0.4 });
          check(`${key} ${state}@${u}`, r.rest, r.posed(bones), failures);
        }
      }
      expect(failures.slice(0, 10), `${failures.length} failures`).toEqual([]);
    }, 240_000);
  }
});
