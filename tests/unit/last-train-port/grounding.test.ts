import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { IDOL_ASSETS } from "../../../apps/showcase-last-train-port/src/idol-assets";
import { footprint, groundAt } from "../../../examples/last-train-port/grounding";
import { landmarkSlim } from "../../../examples/last-train-port/idolModels";
import type { RouteData, SimData, Tables } from "../../../examples/last-train-port/sim";
import { townFrame, townWalkers, walkerPose } from "../../../examples/last-train-port/walkers";
import { buildWorld } from "../../../examples/last-train-port/world";

const data: SimData = {
  route: JSON.parse(readFileSync("examples/last-train-port/data/route.json", "utf8")) as RouteData,
  tables: JSON.parse(readFileSync("examples/last-train-port/data/tables.json", "utf8")) as Tables
};
const bounds = (key: string): readonly number[] => (IDOL_ASSETS as unknown as Record<string, { bounds: readonly number[] }>)[key]!.bounds;

type Node = { kind?: string; name?: string; position?: number[]; rotation?: number[]; asset?: { id?: string }; transforms?: { position: number[]; rotation?: number[]; scale?: number }[]; instances?: { position: number[]; rotation?: number[]; scale?: number }[]; children?: Node[]; scale?: number[] };
function walk(n: Node, out: Node[]): void {
  out.push(n);
  for (const c of n.children ?? []) walk(c, out);
  for (const v of Object.values(n)) if (Array.isArray(v)) for (const c of v) if (c && typeof c === "object" && "kind" in c) walk(c as Node, out);
}

/** Base y vs the ground sampled under the footprint corners: never above the lowest ground (floating), at most 0.25 m into it. */
function expectGrounded(label: string, x: number, y: number, z: number, halfX: number, halfZ: number, yaw: number, maxSink = 0.25): void {
  const g = footprint(x, z, halfX, halfZ, yaw).map(([px, pz]) => groundAt(data, px, pz));
  expect(Math.min(...g), `${label} has ground under it`).toBeGreaterThan(-1e9);
  expect(y, `${label} floats above the lowest ground under its footprint`).toBeLessThanOrEqual(Math.min(...g) + 1e-6);
  expect(y, `${label} sinks too deep`).toBeGreaterThan(Math.max(...g) - maxSink);
}

describe("Lamplight Line Idol grounding (nothing floats on uneven ground)", () => {
  for (const look of ["bands", "original"] as const) {
    it(`every Idol set piece and townsfolk sits on the sampled ground under its footprint (${look})`, { timeout: 120_000 }, () => {
      const world = buildWorld(data, look);
      const nodes: Node[] = [];
      walk(world.scene.toJSON() as unknown as Node, nodes);
      let checked = 0;
      for (const n of nodes) {
        const id = n.asset?.id ?? "";
        if (n.kind !== "model" || !id.startsWith("ll") || id === "llTram" || /^llPax|^llMotorman|^llWalker/.test(id)) continue;
        const list = n.instances ?? n.transforms;
        if (list) {
          // instanced houses / townsfolk
          const [bx, , bz] = bounds(id);
          for (const t of list) {
            const s = t.scale ?? 1;
            expectGrounded(`${n.name} ${id}`, t.position[0]!, t.position[1]!, t.position[2]!, (bx! / 2) * s, (bz! / 2) * s, t.rotation?.[1] ?? 0, id.startsWith("llFolk") ? 0.1 : 0.25);
            checked++;
          }
        } else if (n.position) {
          const [bx, , bz] = bounds(id);
          const slim = id === "llKeep" ? landmarkSlim("keep") : id === "llWatchtower" ? landmarkSlim("tower") : 1;
          expectGrounded(`${n.name} ${id}`, n.position[0]!, n.position[1]!, n.position[2]!, (bx! / 2) * slim, (bz! / 2) * slim, n.rotation?.[1] ?? 0);
          checked++;
        }
      }
      // lighthouse towers sit inside a positioned group
      for (const n of nodes) if (n.kind === "group" && n.name?.startsWith("lighthouse-") && n.position) {
        const [bx, , bz] = bounds("llLighthouse");
        expectGrounded(n.name, n.position[0]!, n.position[1]!, n.position[2]!, bx! / 2, bz! / 2, n.rotation?.[1] ?? 0);
        checked++;
      }
      expect(checked).toBeGreaterThan(36 + 6 + 6 + 12 + 2 + 50);
    });
  }

  it("rigged walkers keep their feet on the platform or the cobbles", () => {
    for (let town = 0; town < data.tables.towns.length; town++) {
      const frame = townFrame(data, town);
      for (const w of townWalkers(town)) for (const t of [0, 7.3, 21]) {
        const p = walkerPose(frame, w, t);
        expectGrounded(`walker ${w.id}`, p.x, p.y, p.z, 0.2, 0.2, p.yaw, 0.08);
      }
    }
  });
});
