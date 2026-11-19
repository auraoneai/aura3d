import { readFileSync } from "node:fs";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { composeMat4, multiplyMat4, quatFromEulerXYZ, type Mat4 } from "@aura3d/scene";
import { describe, expect, it } from "vitest";
import { BeatHopperSim } from "../../../apps/showcase-beat-hopper/src/sim";
import { IDOL_BOT_HEIGHT, IDOL_BOT_LOOK, IDOL_SKATE, buildWorld, skateAttachOffset } from "../../../apps/showcase-beat-hopper/src/world";

/**
 * Beat Hopper skater readability + moving parts: the Idol bot carries a violet emissive lift and a cyan rim, is
 * 1.72 m tall (lane 2 m), and its inline-skate wheels are glowing procedural wheels pinned to the ankle bones
 * (engine bone attach) that spin every frame while rolling.
 */
type N = { name?: string; kind?: string; position?: number[]; children?: N[]; runtime?: { id?: string }; materialOverrides?: { emissiveIntensity?: number; rim?: { intensity?: number } }[] };
const walk = (list: readonly N[], out: N[] = []): N[] => { for (const n of list) { out.push(n); if (n.children) walk(n.children, out); } return out; };

describe("beat-hopper Idol skater readability and spinning skates", () => {
  it("the bot carries an emissive lift and a cyan rim and fits the lane", () => {
    const all = walk(buildWorld({ sim: new BeatHopperSim(7), aspect: 16 / 9 }).scene.toJSON().nodes as unknown as N[]);
    const bot = all.find((n) => n.name === "bot-idol")!;
    const ov = bot.materialOverrides?.[0] as { target?: unknown; emissiveIntensity?: number; rim?: { intensity?: number } };
    // no target = every material slot (a "*" target matched nothing: the GPU frame showed an unlit grey bot)
    expect(ov.target).toBeUndefined();
    expect(bot.materialOverrides?.[0]?.emissiveIntensity).toBeGreaterThanOrEqual(1);
    expect(bot.materialOverrides?.[0]?.rim?.intensity).toBeGreaterThan(2.5);
    expect(IDOL_BOT_LOOK.emissive).toMatch(/^#/);
    expect(IDOL_BOT_HEIGHT).toBeGreaterThan(1.55);
    expect(IDOL_BOT_HEIGHT * 0.3).toBeLessThan(2); // arms-down body ~0.3 of height wide vs the 2 m lane
    for (const foot of IDOL_SKATE.feet) {
      const g = all.find((n) => n.runtime?.id === foot.id)!;
      expect(g.children?.map((c) => c.runtime?.id)).toEqual(IDOL_SKATE.row.map((_, i) => `${foot.id}-${i}`));
    }
  }, 60_000);

  it("the bone-space offset places each wheel row at the sole with the GLB-frame orientation (engine attach math)", async () => {
    const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).readBinary(new Uint8Array(readFileSync("apps/showcase-beat-hopper/assets/idol/bhSkaterBot.glb")));
    const skin = doc.getRoot().listSkins()[0]!;
    const ibm = skin.getInverseBindMatrices()!.getArray()!;
    const idx = new Map(skin.listJoints().map((j, k) => [j.getName(), k] as const));
    for (const foot of IDOL_SKATE.feet) {
      const k = idx.get(foot.bone)!;
      // bind world = inverse(IBM); IBM is rigid (+uniform scale)
      const m = Array.from(ibm.slice(k * 16, k * 16 + 16));
      const s2 = m[0]! * m[0]! + m[1]! * m[1]! + m[2]! * m[2]!;
      const inv = new Array(16).fill(0);
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) inv[c * 4 + r] = m[r * 4 + c]! / s2;
      for (let r = 0; r < 3; r++) inv[12 + r] = -(inv[r]! * m[12]! + inv[4 + r]! * m[13]! + inv[8 + r]! * m[14]!);
      inv[15] = 1;
      const target: [number, number, number] = [0, IDOL_SKATE.sole.y, foot.z];
      const off = skateAttachOffset(inv, target);
      const offset = composeMat4(off.position, quatFromEulerXYZ(off.rotation[0], off.rotation[1], off.rotation[2]), [1, 1, 1]);
      const world = multiplyMat4(inv as unknown as Mat4, offset) as unknown as number[];
      expect(world[12]!).toBeCloseTo(target[0], 4);
      expect(world[13]!).toBeCloseTo(target[1], 4);
      expect(world[14]!).toBeCloseTo(target[2], 4);
      // orientation = the GLB frame at bind (identity rotation, uniform scale only)
      const sc = Math.hypot(world[0]!, world[1]!, world[2]!);
      expect(world[0]! / sc).toBeCloseTo(1, 3);
      expect(world[5]! / sc).toBeCloseTo(1, 3);
      expect(world[10]! / sc).toBeCloseTo(1, 3);
    }
  });

  it("the wheels spin between frames while rolling and attach once the sockets resolve", () => {
    const sim = new BeatHopperSim(7);
    const world = buildWorld({ sim, aspect: 16 / 9 });
    const rot = new Map<string, number[]>();
    const attached: string[] = [];
    const bind = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.01, -0.39, -0.1, 1];
    const anything: unknown = new Proxy(function () {}, { get: () => anything, apply: () => anything });
    const handle = (id: string): unknown => new Proxy({}, {
      get(_t, key: string) {
        if (key === "animation" && id === "bot-idol") return {
          socket: () => ({ valid: true, bindWorldMatrix: () => Float32Array.from(bind) }),
          attach: (spec: { target: string }) => { attached.push(spec.target); return () => {}; }
        };
        if (key === "setRotation") return (x: number, y: number, z: number) => { rot.set(id, [x, y, z]); return handle(id); };
        if (key.startsWith("set") || key === "require") return () => handle(id);
        return anything;
      }
    });
    const app = { nodes: { require: handle, get: handle }, camera: anything } as never;
    const rt = world.bind(app);
    sim.begin();
    const spinAt = () => rot.get("bot-wheels-r-0")?.[2] ?? 0;
    for (let f = 0; f < 3; f++) { sim.advance(); rt.update(sim, 16 / 9); }
    const a = spinAt();
    for (let f = 0; f < 6; f++) { sim.advance(); rt.update(sim, 16 / 9); }
    expect(attached.sort()).toEqual(["bot-wheels-l", "bot-wheels-r"]);
    expect(Math.abs(spinAt() - a)).toBeGreaterThan(0.1);
    expect(rot.get("bot-wheels-l-3")?.[2]).toBe(spinAt());
  }, 60_000);
});
