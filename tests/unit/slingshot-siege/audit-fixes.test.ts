// Slingshot Siege audit fixes (lane G12): pools, materials, rotation, framing, URL guard.
import { describe, expect, it } from "vitest";
// The renderer composes node rotations with these (compiler/sceneGraph.ts: eulerToQuaternion(rotation, rotationOrder ?? "ZYX")).
import { eulerToQuaternion, localMatrixOf } from "../../../packages/engine/src/agent-api/sceneGraph";
import { assignPoolSlots, fitHalfWidth, maxBlockSlots, orbitAround, quatToEulerZYX } from "../../../apps/showcase-slingshot-siege/src/game/layout";
import { LEVELS, isLevelUnlocked, totalStars } from "../../../apps/showcase-slingshot-siege/src/game/levels";
import { POOL, blockLook, debrisLook } from "../../../apps/showcase-slingshot-siege/src/game/stage";
import { invalidRenderParams } from "../../../apps/showcase-slingshot-siege/src/game/urlGuard";

describe("slingshot-siege pools (SS-5)", () => {
  it("every level fits the node pools", () => {
    for (const level of LEVELS) {
      const slots = assignPoolSlots(level.pieces, POOL);
      expect(slots.filter((s) => s === null), `${level.name} has unassigned pieces`).toHaveLength(0);
      const keys = new Set(slots.map((s) => `${s!.kind}:${s!.slot}`));
      expect(keys.size, `${level.name} shares a node between two pieces`).toBe(level.pieces.length);
    }
  });

  it("Gull Keep (83 pieces) gets a node for every piece and the block pool covers the largest level", () => {
    const gullKeep = LEVELS.find((l) => l.name === "Gull Keep")!;
    expect(gullKeep.pieces.length).toBe(83);
    expect(maxBlockSlots(LEVELS, POOL)).toBeLessThanOrEqual(POOL.blocks);
  });

  it("wood blocks use the wood GLB pools and stone-family blocks the stone block pool", () => {
    const pieces = [
      { material: "wood" as const }, { material: "wood" as const }, { material: "stone" as const },
      { material: "glass" as const }, { material: "wood" as const, visual: "barrel" as const }
    ];
    const slots = assignPoolSlots(pieces, POOL);
    expect(slots.map((s) => s!.kind)).toEqual(["crate", "plank", "block", "block", "barrel"]);
    expect(slots[2]!.slot).toBe(0);
    expect(slots[3]!.slot).toBe(1);
  });
});

describe("slingshot-siege block looks (SS-4, SS-16)", () => {
  it("every material sets an explicit override list, so a pooled node is always reset", () => {
    // GU47 SS47-M1: painted wood now carries a multiply tint too (every family has its own list).
    expect(blockLook("wood")[0]!.colorMode).toBe("multiply");
    const glass = blockLook("glass")[0]!;
    expect(glass.opacity).toBeLessThan(1);
    expect(glass.colorMode).toBe("replace");
    expect(blockLook("stone")[0]!.color).toBeDefined();
    expect(blockLook("obsidian")[0]!.color).toBeDefined();
    expect(blockLook("ice")[0]!.opacity).toBeLessThan(1);
  });

  it("debris takes its material colour", () => {
    expect(debrisLook("glass")[0]!.color).not.toBe(debrisLook("wood")[0]!.color);
    expect(debrisLook("unknown")[0]!.color).toBe(debrisLook("wood")[0]!.color);
  });
});

describe("slingshot-siege rotation (SS-15)", () => {
  const cases: [number, number, number][] = [[0.5, 0.4, 0], [0.3, 0.4, 0.9], [-1.2, 0.7, 2.4], [0.1, Math.PI / 2, 0.3], [2.9, -1.1, -0.6]];
  it("quat → Euler round-trips through the render path's ZYX composition", () => {
    for (const e of cases) {
      const q = eulerToQuaternion(e, "ZYX");
      const fromEuler = localMatrixOf({ rotation: quatToEulerZYX(q) }, new Float32Array(16));
      const fromQuat = localMatrixOf({ quaternion: q }, new Float32Array(16));
      for (let i = 0; i < 16; i += 1) expect(fromEuler[i]!).toBeCloseTo(fromQuat[i]!, 5);
    }
  });
});

describe("slingshot-siege camera (SS-7, SS-13)", () => {
  const project = (eye: readonly number[], tgt: readonly number[], fov: number, aspect: number, p: readonly number[]) => {
    const f = [tgt[0]! - eye[0]!, tgt[1]! - eye[1]!, tgt[2]! - eye[2]!];
    const fl = Math.hypot(f[0]!, f[1]!, f[2]!);
    const fn = f.map((v) => v / fl);
    const s = [-fn[2]!, 0, fn[0]!];
    const sl = Math.hypot(s[0]!, s[2]!);
    const sn = s.map((v) => v / sl);
    const u = [sn[1]! * fn[2]! - sn[2]! * fn[1]!, sn[2]! * fn[0]! - sn[0]! * fn[2]!, sn[0]! * fn[1]! - sn[1]! * fn[0]!];
    const d = [p[0]! - eye[0]!, p[1]! - eye[1]!, p[2]! - eye[2]!];
    const z = d[0]! * fn[0]! + d[1]! * fn[1]! + d[2]! * fn[2]!;
    const t = Math.tan((fov * Math.PI) / 360);
    return { x: (d[0]! * sn[0]! + d[1]! * sn[1]! + d[2]! * sn[2]!) / (z * t * aspect), y: (d[0]! * u[0]! + d[1]! * u[1]! + d[2]! * u[2]!) / (z * t) };
  };

  it("portrait 390x844 aim pose keeps the sling and the fort on screen", () => {
    const aspect = 390 / 844;
    const tgt = [-0.1, 1.6, 0] as const;
    const pos = fitHalfWidth([-2.5 + 2.4, 4.0, 15.5], tgt, 55, aspect, 9.4);
    for (const p of [[-7.4, 1.68, 0], [-7.4, 0.3, 0], [6.2, 0.6, 0], [8.2, 0.6, 0], [7.2, 5.7, -0.6]]) {
      const ndc = project(pos, tgt, 55, aspect, p);
      expect(Math.abs(ndc.x), `x of ${p}`).toBeLessThan(1);
      expect(Math.abs(ndc.y), `y of ${p}`).toBeLessThan(1);
    }
  });

  it("landscape poses are unchanged", () => {
    expect(fitHalfWidth([-2.5, 4, 15.5], [-0.5, 1.5, 0], 55, 16 / 9, 9.4)).toEqual([-2.5, 4, 15.5]);
  });

  it("orbit offsets move the eye around the target at constant distance", () => {
    const eye = [-2.5, 4, 15.5] as const;
    const tgt = [-0.5, 1.5, 0] as const;
    const moved = orbitAround(eye, tgt, 0.4, 0.1);
    const dist = (a: readonly number[]) => Math.hypot(a[0]! - tgt[0], a[1]! - tgt[1], a[2]! - tgt[2]);
    expect(dist(moved)).toBeCloseTo(dist(eye), 6);
    expect(moved[0]).not.toBeCloseTo(eye[0], 2);
    expect(orbitAround(eye, tgt, 0, 0).map((v) => Number(v.toFixed(6)))).toEqual([...eye]);
  });
});

describe("slingshot-siege stars (SS-9)", () => {
  it("sandbox and unknown ids never count toward unlocks", () => {
    expect(totalStars({ 99: 3, 0: 2, [-1]: 3 })).toBe(2);
    expect(isLevelUnlocked(2, { 99: 3 })).toBe(false);
  });
});

describe("slingshot-siege URL guard (SS-E6)", () => {
  it("flags only invalid render-path values", () => {
    expect(invalidRenderParams("?aura3d-render=prodution&aura3d-bloom-fusion=fused-2d")).toEqual(["aura3d-render"]);
    expect(invalidRenderParams("?aura3d-render=production")).toEqual([]);
    expect(invalidRenderParams("?aura3d-bloom-fusion=fused")).toEqual(["aura3d-bloom-fusion"]);
  });
});

describe("slingshot-siege stage build (RH-04 OPTION_IGNORED, LIGHT-06 switch, SS-E2)", async () => {
  const { buildStage } = await import("../../../apps/showcase-slingshot-siege/src/game/stage");
  const { CHAPTERS } = await import("../../../apps/showcase-slingshot-siege/src/game/levels");
  type Node = { kind?: string; name?: string; effect?: string; ignoredOptions?: readonly string[]; children?: readonly Node[] };
  const walk = (nodes: readonly unknown[]): Node[] => nodes.flatMap((n) => {
    const node = (typeof (n as { toJSON?: unknown }).toJSON === "function" ? (n as { toJSON(): Node }).toJSON() : n) as Node;
    return [node, ...walk(node.children ?? [])];
  });

  it("no node carries ignored options in any chapter", () => {
    for (const chapter of CHAPTERS) {
      const all = walk(buildStage(chapter, { reducedMotion: false }).nodes);
      expect(all.flatMap((n) => n.ignoredOptions ?? [])).toEqual([]);
    }
  });

  it("?ao=0 drops only the AO node; reduced motion keeps FXAA and drops the vignette", () => {
    const chapter = CHAPTERS[0]!;
    const names = (opts: { reducedMotion: boolean; ambientOcclusion?: boolean }) => walk(buildStage(chapter, opts).nodes).map((n) => n.name ?? n.kind ?? "");
    const on = names({ reducedMotion: false });
    const off = names({ reducedMotion: false, ambientOcclusion: false });
    // GU47 SS47-L2: the stage's miniature-radius AO replaces the look's default AO node.
    expect(on).toContain("siege miniature ambient occlusion");
    expect(off).not.toContain("siege miniature ambient occlusion");
    expect(on).not.toContain("look ambient occlusion");
    expect(on.length - off.length).toBe(1);
    const fx = (opts: { reducedMotion: boolean }) => JSON.stringify(walk(buildStage(chapter, opts).nodes).filter((n) => n.kind === "effect"));
    expect(fx({ reducedMotion: true })).toContain("fxaa");
    expect(fx({ reducedMotion: true })).not.toContain("vignette");
    expect(fx({ reducedMotion: false })).toContain("vignette");
  });
});
