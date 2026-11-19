/**
 * Every shipped text-to-motion clip on every game's real rigged Idol GLBs: hands must not explode into shards and
 * forearms must not twist into a candy wrapper. Linear-blend skinning of the hand / finger and forearm vertices (the
 * same palette maths the engine uses) for each clip at several times:
 *  - hand: a hand or finger vertex stays within its bind distance to the wrist + 12 cm, and never stretches past 1.6x;
 *  - forearm: the mean radial distance of forearm vertices from the elbow->wrist axis keeps >= 55% of its bind value.
 * Games are discovered from their `motion.generated.ts` (tools/idol/motion.mjs) and the rigged GLBs next to them.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { describe, expect, it } from "vitest";
import { createHumanoidDriver, parseGlbJson, readIdolSkeleton, sampleHumanoidClip, type HumanoidClip } from "../../../apps/showcase-port-shared/idol/humanoid";

function walk(dir: string, out: string[], depth = 0): string[] {
  if (depth > 5 || !existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === "dist" || e === "public" || e.startsWith(".")) continue;
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out, depth + 1);
    else out.push(p);
  }
  return out;
}

const games = [...readdirSync("apps").map((d) => join("apps", d)), ...readdirSync("examples").map((d) => join("examples", d))]
  .filter((d) => statSync(d).isDirectory())
  .map((dir) => {
    const files = walk(dir, []);
    const clips = files.find((f) => f.endsWith("motion.generated.ts"));
    const glbs = files.filter((f) => f.endsWith(".glb") && /idol/i.test(f)).filter((f) => {
      try { const j = parseGlbJson(readFileSync(f)) as { skins?: unknown[] }; return (j.skins?.length ?? 0) > 0; } catch { return false; }
    });
    return { dir, clips, glbs: glbs.slice(0, 2) };
  })
  .filter((g) => g.clips && g.glbs.length > 0);

type Mat = number[];
const mul = (a: Mat, b: ArrayLike<number>): Mat => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r]! * b[c * 4 + k]!; return o; };
const xf = (m: Mat, v: ArrayLike<number>) => [0, 1, 2].map((r) => m[r]! * v[0]! + m[4 + r]! * v[1]! + m[8 + r]! * v[2]! + m[12 + r]!);
const d3 = (a: number[], b: number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

async function rig(file: string) {
  const bytes = readFileSync(file);
  const driver = createHumanoidDriver(readIdolSkeleton(parseGlbJson(bytes)));
  const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).readBinary(new Uint8Array(bytes));
  const skin = doc.getRoot().listSkins()[0]!;
  const joints = skin.listJoints();
  const ibm = skin.getInverseBindMatrices()!.getArray()!;
  const idx = new Map(joints.map((j, k) => [j.getName(), k] as const));
  const bind = new Map(joints.map((j) => [j, { r: j.getRotation(), t: j.getTranslation() }] as const));
  const prim = doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives()).find((p) => p.getAttribute("JOINTS_0"))!;
  const P = prim.getAttribute("POSITION")!, J = prim.getAttribute("JOINTS_0")!, W = prim.getAttribute("WEIGHTS_0")!;
  const roles = driver.map.roles as Record<string, string>;
  const kids = (k: number): number[] => [k, ...joints.flatMap((j, i) => (j.getParentNode() === joints[k] ? kids(i) : []))];
  const sides = (["left", "right"] as const).map((s) => {
    const hand = idx.get(roles[`${s}Hand`]!)!, lower = idx.get(roles[`${s}LowerArm`]!)!;
    const handSet = new Set(kids(hand));
    const handV: number[] = [], foreV: number[] = [];
    const jj = [0, 0, 0, 0], ww = [0, 0, 0, 0];
    for (let v = 0; v < P.getCount(); v++) {
      J.getElement(v, jj); W.getElement(v, ww);
      const dom = jj[ww.indexOf(Math.max(...ww))]!;
      if (handSet.has(dom)) handV.push(v); else if (dom === lower) foreV.push(v);
    }
    return { s, hand, lower, handV, foreV };
  });
  const palette = () => joints.map((j, k) => mul(j.getWorldMatrix() as unknown as Mat, ibm.slice(k * 16, k * 16 + 16)));
  const skinV = (pal: Mat[], v: number) => {
    const p = [0, 0, 0], jj = [0, 0, 0, 0], ww = [0, 0, 0, 0], out = [0, 0, 0];
    P.getElement(v, p); J.getElement(v, jj); W.getElement(v, ww);
    for (let i = 0; i < 4; i++) { if (!ww[i]) continue; const q = xf(pal[jj[i]!]!, p); for (let c = 0; c < 3; c++) out[c]! += ww[i]! * q[c]!; }
    return out;
  };
  const measure = () => {
    const pal = palette();
    return sides.map((sd) => {
      const wrist = xf(joints[sd.hand]!.getWorldMatrix() as unknown as Mat, [0, 0, 0]), elbow = xf(joints[sd.lower]!.getWorldMatrix() as unknown as Mat, [0, 0, 0]);
      const ax = [wrist[0]! - elbow[0]!, wrist[1]! - elbow[1]!, wrist[2]! - elbow[2]!], al = Math.hypot(...ax);
      const radial = (q: number[]) => { const w = [q[0]! - elbow[0]!, q[1]! - elbow[1]!, q[2]! - elbow[2]!]; const t = (w[0]! * ax[0]! + w[1]! * ax[1]! + w[2]! * ax[2]!) / (al * al); return Math.hypot(w[0]! - t * ax[0]!, w[1]! - t * ax[1]!, w[2]! - t * ax[2]!); };
      const handD = sd.handV.map((v) => d3(skinV(pal, v), wrist));
      const fore = sd.foreV.map((v) => radial(skinV(pal, v)));
      return { handD, foreMean: fore.reduce((a, b) => a + b, 0) / Math.max(1, fore.length) };
    });
  };
  for (const [j, b] of bind) { j.setRotation(b.r); j.setTranslation(b.t); }
  const rest = measure();
  const posed = (clip: HumanoidClip, t: number) => {
    const pose = driver.pose(sampleHumanoidClip(clip, t, { loop: false }));
    for (const j of joints) {
      const p = pose.bones[j.getName()];
      if (!p) continue;
      j.setRotation([p.rotation.x, p.rotation.y, p.rotation.z, p.rotation.w]);
      if (p.position) j.setTranslation([p.position.x, p.position.y, p.position.z]);
    }
    return measure();
  };
  return { rest, posed };
}

describe("Idol hands and forearms stay whole under every shipped motion clip", () => {
  it("discovers the games on the motion lane", () => { expect(games.length).toBeGreaterThan(0); });
  for (const g of games) {
    it(`${g.dir}: ${g.glbs.map((f) => f.split("/").pop()).join(", ")}`, async () => {
      const { MOTION_CLIPS } = (await import(`../../../${g.clips!}`)) as { MOTION_CLIPS: Record<string, HumanoidClip> };
      const failures: string[] = [];
      for (const glb of g.glbs) {
        const { rest, posed } = await rig(glb);
        for (const [name, clip] of Object.entries(MOTION_CLIPS)) {
          for (const u of [0.15, 0.4, 0.65, 0.9]) {
            const m = posed(clip, u * clip.duration);
            m.forEach((side, si) => {
              const r = rest[si]!;
              side.handD.forEach((d, i) => {
                const d0 = r.handD[i]!;
                if (d > d0 + 0.12 || d > d0 * 1.6 + 0.02) failures.push(`${glb.split("/").pop()} ${name}@${u} ${si ? "R" : "L"} hand vertex ${d0.toFixed(3)} -> ${d.toFixed(3)} m`);
              });
              if (r.foreMean > 0 && side.foreMean < r.foreMean * 0.55) failures.push(`${glb.split("/").pop()} ${name}@${u} ${si ? "R" : "L"} forearm section ${(side.foreMean / r.foreMean * 100).toFixed(0)}%`);
            });
          }
        }
      }
      expect(failures.slice(0, 12), `${failures.length} failures`).toEqual([]);
    }, 240_000);
  }
});
