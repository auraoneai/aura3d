/**
 * Moving-parts pass: the Idol wyvern is split into body + two wings; each wing hangs from its shoulder pivot inside a
 * frame that turns the head onto +Z, and `idolPterosaurFlap` rotates the wings about the head-tail axis with the
 * world's flap phase. The cloud steed breathes while it carries the rider.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { idolCloudBillow, idolCloudNode, idolPterosaurFlap, idolPterosaurNode, wyvernWingEuler } from "../../../examples/kid-goku-beyond-the-clouds-port/idol";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import { createAuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/app/runtimeNodes";
import { flattenAuraSceneSnapshot } from "../../../packages/engine/src/agent-api/compiler/sceneGraph";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene";
import type { AuraSceneNode, AuraSceneSnapshot } from "../../../packages/engine/src/agent-api/nodes/types";

interface N { kind?: string; name?: string; position?: number[]; runtime?: { id?: string }; children?: N[] }
const find = (n: N, id: string): N | undefined => (n.runtime?.id === id ? n : (n.children ?? []).map((c) => find(c, id)).find(Boolean));

describe("Cumulus Dash Idol moving parts", () => {
  it("each wyvern wing is its own pivot node at the shoulder, mirrored either side of the body", () => {
    const n = idolPterosaurNode(0).toJSON() as unknown as N;
    const l = find(n, "ptera-wingL-0"), r = find(n, "ptera-wingR-0");
    expect(l?.kind).toBe("group");
    expect(r?.kind).toBe("group");
    expect(l!.position![1]).toBeGreaterThan(0.9);
    // the wing model is offset back by its pivot, so it stays where it was generated at rest
    expect(l!.children![0]!.position).toEqual(l!.position!.map((v) => -v));
  });

  it("flapping over successive frames rotates both wings, in opposite senses about the body axis", () => {
    const rot = new Map<string, number[]>();
    const node = (id: string) => ({ setRotation: (x: number, y: number, z: number) => { rot.set(id, [x, y, z]); } });
    const seen: string[] = [];
    for (let frame = 0; frame < 6; frame++) {
      const clock = frame / 30;
      idolPterosaurFlap(node, 0, Math.sin(clock * 11) * 0.55);
      seen.push(JSON.stringify(rot.get("ptera-wingL-0")));
    }
    expect(new Set(seen).size).toBeGreaterThan(4);
    const l = wyvernWingEuler(0.5, "L"), r = wyvernWingEuler(0.5, "R");
    expect(l.map((v) => +v.toFixed(6))).toEqual(wyvernWingEuler(-0.5, "R").map((v) => +v.toFixed(6)));
    expect(l).not.toEqual(r);
  });

  it("the cloud steed billows over time, and world.ts drives wings and billow every frame", () => {
    const scales: string[] = [];
    for (let k = 0; k < 4; k++) idolCloudBillow(() => ({ setScale: (s: [number, number, number]) => { scales.push(JSON.stringify(s)); } }), k * 0.2);
    expect(new Set(scales).size).toBe(4);
    const src = readFileSync("examples/kid-goku-beyond-the-clouds-port/world.ts", "utf8");
    expect(src).toMatch(/if \(IDOL\) idolPterosaurFlap\(node, i, (fp\.)?flap\)/);
    expect(src).toMatch(/if \(IDOL\) idolCloudBillow\(node, clock, cloudScale\)/);
  });

  it("Aura3D 5.7.0 (nested setScale is parent-local): the billowing steed draws at its pre-5.7 world transform within 1e-6", () => {
    const flags = resolveQrFlags({ options: ["core"], env: {} });
    const authored = { ...scene().toJSON(), nodes: [idolCloudNode().toJSON() as unknown as AuraSceneNode] } as AuraSceneSnapshot;
    const registry = createAuraRuntimeNodeRegistry(flattenAuraSceneSnapshot(authored, flags), { flags }, authored);
    try {
      const cloud = registry.require("sky-cloud"), steed = registry.require("sky-cloud-model");
      const rotate = (q: readonly number[], v: readonly number[]): number[] => {
        const [x, y, z, w] = q as [number, number, number, number];
        const t = [2 * (y * v[2]! - z * v[1]!), 2 * (z * v[0]! - x * v[2]!), 2 * (x * v[1]! - y * v[0]!)];
        return [v[0]! + w * t[0]! + y * t[2]! - z * t[1]!, v[1]! + w * t[1]! + z * t[0]! - x * t[2]!, v[2]! + w * t[2]! + x * t[1]! - y * t[0]!];
      };
      let worst = 0;
      for (let frame = 0; frame < 90; frame++) {
        const clock = frame / 60, call = frame < 30 ? 0.26 - frame / 120 : 0;
        // world.ts riding branch: group pose (ZYX heading + roll wobble) and the summon-grow scale, then the billow
        const parentScale = call > 0 ? 0.6 + (1 - call / 0.26) * 1.0 : 1.7;
        cloud.setPosition(Math.sin(clock) * 4, 0.6 + 0.1 * frame / 90, -3 + clock * 2).setRotation(0, clock * 0.8, Math.sin(clock * 3) * 0.04).setScale(parentScale);
        const billow: [number, number, number][] = [];
        idolCloudBillow(() => ({ setScale: (v: [number, number, number]) => { billow.push(v.map((c) => c * parentScale) as [number, number, number]); steed.setScale(v); } }), clock, parentScale);
        // pre-5.7: the setScale value was the world scale; the authored local offset (0, 0, -0.78) rode the group
        const q = cloud.getWorldQuaternion(), p = cloud.getWorldPosition();
        const offset = rotate(q, [0, 0, -0.78 * parentScale]);
        const expected = { position: [p[0] + offset[0]!, p[1] + offset[1]!, p[2] + offset[2]!], quaternion: q, scale: billow[0]! };
        const actual = { position: steed.getWorldPosition(), quaternion: steed.getWorldQuaternion(), scale: steed.getWorldScale() };
        for (const key of ["position", "quaternion", "scale"] as const) {
          expected[key].forEach((value, axis) => { worst = Math.max(worst, Math.abs(value - actual[key][axis]!)); });
        }
      }
      expect(worst).toBeLessThanOrEqual(1e-6);
    } finally { registry.dispose(); }
  });
});
