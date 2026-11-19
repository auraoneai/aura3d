/**
 * Moving-parts pass: the Idol wyvern is split into body + two wings; each wing hangs from its shoulder pivot inside a
 * frame that turns the head onto +Z, and `idolPterosaurFlap` rotates the wings about the head-tail axis with the
 * world's flap phase. The cloud steed breathes while it carries the rider.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { idolCloudBillow, idolPterosaurFlap, idolPterosaurNode, wyvernWingEuler } from "../../../examples/kid-goku-beyond-the-clouds-port/idol";

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
    expect(src).toMatch(/if \(IDOL\) idolCloudBillow\(node, clock\)/);
  });
});
