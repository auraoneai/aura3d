import { readFileSync } from "node:fs";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { describe, expect, it, vi } from "vitest";
import { createAuraRuntimeNodeRegistry } from "../../../packages/engine/src/agent-api/app/runtimeNodes.js";
import { applyProductionActorAnimation } from "../../../packages/engine/src/agent-api/compiler/animation.js";
import { createTypedGLBActor } from "../../../packages/engine/src/production-runtime/TypedGLBActor.js";
import { NumberSurgeSim } from "../../../apps/showcase-number-surge/src/sim";
import { buildWorld } from "../../../apps/showcase-number-surge/src/world";

/**
 * Idol wow pass: the Number Surge riot guards are rigged Idol GLBs playing their Idol idle / run clips through
 * `node.animation` (runtime handle -> engine actor dispatch -> pose mixer advanced by frame time). Drives the real GLB
 * through that path: arms leave the T-pose and the body moves. The value-evolution escort squad beside the ball was
 * removed (owner review: unexplained clutter), so no crowd slots are mounted.
 */
type N = { kind?: string; name?: string; scaleMode?: string; children?: N[]; runtime?: { id?: string } };
const walk = (list: readonly N[], out: N[] = []): N[] => { for (const n of list) { out.push(n); if (n.children) walk(n.children, out); } return out; };

async function drive(file: string, clip: string, speed: number) {
  const bytes = readFileSync(file);
  vi.stubGlobal("fetch", async () => new Response(new Uint8Array(bytes), { status: 200 }));
  const actor = await createTypedGLBActor({
    asset: { type: "model", format: "glb", url: `https://offline-idol.invalid/${file.split("/").pop()}` } as never, id: "a", name: "a", width: 64, height: 64, shareTextures: false,
    imageDecoder: async () => ({ width: 1, height: 1, data: new Uint8Array([128, 128, 128, 255]) })
  } as never);
  vi.unstubAllGlobals();
  const snapshot = { nodes: [{ kind: "model", name: "body", scaleMode: "world", asset: { type: "model", format: "glb", url: "x", id: "body" }, runtime: { id: "body" } }] };
  const handle = createAuraRuntimeNodeRegistry(snapshot as never).require("body");
  handle.setAnimation({ clip, loop: true, speed });
  const skin = (await new NodeIO().registerExtensions(ALL_EXTENSIONS).readBinary(new Uint8Array(bytes))).getRoot().listSkins()[0]!;
  const ibm = skin.getInverseBindMatrices()!.getArray()!;
  const n = skin.listJoints().length;
  const bind = Array.from({ length: n }, (_, k) => {
    const m = ibm.slice(k * 16, k * 16 + 16);
    const s2 = m[0]! * m[0]! + m[1]! * m[1]! + m[2]! * m[2]!;
    return [0, 1, 2].map((r) => -(m[r * 4]! * m[12]! + m[r * 4 + 1]! * m[13]! + m[r * 4 + 2]! * m[14]!) / s2);
  });
  // T-pose arms lie along +-Z (the body faces +X): the joint farthest out on each side is that arm's tip.
  const tips = [bind.reduce((b, p, k) => (p[2]! > bind[b]![2]! ? k : b), 0), bind.reduce((b, p, k) => (p[2]! < bind[b]![2]! ? k : b), 0)];
  const feet = bind.map((p, k) => [p[1]!, k] as const).sort((a, b) => a[0] - b[0]).slice(0, 2).map(([, k]) => k);
  const identity = Array.from({ length: 16 }, (_, i) => (i % 5 === 0 ? 1 : 0));
  let ms = 1000;
  const posed = (seconds: number) => {
    for (let f = 0; f < Math.round(seconds * 60); f++) {
      applyProductionActorAnimation({ actor } as never, { kind: "model", animation: handle.snapshot().animation, runtime: { id: "body" } } as never, undefined, (ms += 1000 / 60), new Set(), identity, () => {});
    }
    const pal = Float32Array.from(actor.collectRenderItems().find((i) => i.skinning)!.skinning!.matrices as Float32Array);
    return (k: number) => { const p = bind[k]!, m = pal.subarray(k * 16, k * 16 + 16); return [0, 1, 2].map((r) => m[r]! * p[0]! + m[4 + r]! * p[1]! + m[8 + r]! * p[2]! + m[12 + r]!); };
  };
  return { bind, tips, feet, posed };
}

describe("number-surge rigged Idol riot guards (no escort squad)", () => {
  it("mounts one world-scale rigged body per guard slot and no escort squad", () => {
    const all = walk(buildWorld({ sim: new NumberSurgeSim(7), aspect: 16 / 9 }).scene.toJSON().nodes as unknown as N[]);
    expect(all.some((n) => /crowd/.test(n.name ?? "") || /crowd/.test(n.runtime?.id ?? ""))).toBe(false);
    const bodies = all.filter((n) => n.kind === "model" && /^boss-guards-\d+-body$/.test(n.name ?? ""));
    expect(bodies).toHaveLength(12);
    for (const b of bodies) expect(b.scaleMode).toBe("world");
    const main = readFileSync("apps/showcase-number-surge/src/main.ts", "utf8");
    expect(main).not.toMatch(/app\.step\(0\)/);
  }, 60_000);

  for (const [key, clip] of [["nsGuardRig", "idle"], ["nsGuardRig", "run"]] as const) {
    it(`${key} plays ${clip}: arms leave the T-pose and the body moves over time`, async () => {
      const { bind, tips, feet, posed } = await drive(`apps/showcase-number-surge/assets/idol/${key}.glb`, clip, 2.1);
      const a = posed(0.5);
      for (const k of tips) expect(bind[k]![1]! - a(k)[1]!, `${key} arm tip ${k} drops below its T-pose height`).toBeGreaterThan(0.08);
      const b = posed(clip === "run" ? 0.27 : 0.9);
      const moved = Math.max(...[...tips, ...feet].map((k) => Math.hypot(...a(k).map((v, i) => v - b(k)[i]!))));
      expect(moved, `${key} moves`).toBeGreaterThan(clip === "run" ? 0.05 : 0.005);
    }, 60_000);
  }
});
