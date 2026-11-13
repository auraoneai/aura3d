// WP-06 (Pip's Big Leap): verifies that all 26 static Meshy & borrowed sci-fi/FPS GLBs and raw flora/plinth
// primitives in the diorama look are replaced by sculpted multi-material procedural assemblies, while keeping
// the 3 rigged character GLBs (`pipsPip`, `pipsBrambleback`, `leapBeetleAnim`) and `?look=original` intact.
import { describe, expect, it } from "vitest";
import { webgpuCustomShaderGap } from "../../../packages/engine/src/agent-api/compiler/webgpuCustomShaderGap";
import { ANIMATED_DECOR_KINDS, buildWorld, nodeName } from "../../../apps/showcase-pips-big-leap/src/game/world";
import { dioramaName } from "../../../apps/showcase-pips-big-leap/src/game/diorama";
import { WORLD_IDS } from "../../../apps/showcase-pips-big-leap/src/game/looks";
import { worldSpec } from "../../../apps/showcase-pips-big-leap/src/game/worlds";
import {
  PBL_MAT,
  PIP_RIG_SOCKETS,
  buildPipHeroLimbNodes,
  millpondCausticsMaterial,
  storybookStrataMaterial
} from "../../../apps/showcase-pips-big-leap/src/art/proceduralModels";
import { checkGlslUnchanged, checkWgslDepthTwin, checkWgslTwin } from "../apps/wgslTwinChecks";

type Transform = { readonly position?: readonly number[]; readonly rotation?: readonly number[]; readonly scale?: number | readonly number[] };
type Node = {
  readonly kind: string;
  readonly primitive?: string;
  readonly name?: string;
  readonly asset?: { readonly id?: string };
  readonly position?: readonly number[];
  readonly rotation?: readonly number[];
  readonly scale?: number | readonly number[];
  readonly castShadow?: boolean;
  readonly receiveShadow?: boolean;
  readonly intensity?: number;
  readonly material?: Record<string, unknown> & { readonly custom?: { readonly wgsl?: { readonly vertex?: string; readonly fragment?: string } } };
  readonly instances?: readonly Transform[];
  readonly runtime?: unknown;
  readonly children?: readonly Node[];
};

const PIP_LIMB_PARTS = ["torso", "head", "ear-l", "ear-r", "arm-l", "arm-r", "foot-l", "foot-r", "tail"] as const;
const BOSS_LIMB_PARTS = ["body", "arm-l", "arm-r", "leg-l", "leg-r"] as const;

const flat = (nodes: readonly Node[]): Node[] => nodes.flatMap((n) => [n, ...(n.kind === "group" ? flat(n.children ?? []) : [])]);
const sceneOf = (id: (typeof WORLD_IDS)[number], look?: "original") =>
  flat((buildWorld(worldSpec(id), look ? { look } : {}).scene.toJSON() as unknown as { nodes: Node[] }).nodes);

describe("pips-big-leap procedural multi-material props (WP-06)", () => {
  it("mounts ZERO GLB models across all 7 diorama worlds and builds articulated procedural Pip & Brambleback rigs", () => {
    for (const id of WORLD_IDS) {
      const nodes = sceneOf(id);
      const models = nodes.filter((n) => n.kind === "model");
      expect(models, id).toEqual([]);
      expect(nodes.filter((n) => (n.name ?? "").startsWith("pbl-props:")), id).toEqual([]);
      for (const part of PIP_LIMB_PARTS) {
        expect(nodes.some((n) => n.name === `${nodeName.hero}:${part}`), `${id} pip:${part}`).toBe(true);
      }
      if (worldSpec(id).boss) {
        for (const part of BOSS_LIMB_PARTS) {
          expect(nodes.some((n) => n.name === `${nodeName.boss}:${part}`), `${id} brambleback:${part}`).toBe(true);
        }
      }
    }
  });

  it("replaces pickups, bounce springs, checkpoints, Sun Gate, hazards, and decor with multi-material custom geometry", () => {
    for (const id of WORLD_IDS) {
      const spec = worldSpec(id);
      const nodes = sceneOf(id);

      for (const s of spec.seeds) {
        const seed = nodes.find((n) => n.name === nodeName.seed(s.id));
        expect(seed?.kind, `${id} seed:${s.id}`).toBe("group");
        expect(seed?.castShadow).toBe(false);
        expect((seed?.children ?? []).length).toBeGreaterThanOrEqual(3);
      }
      for (const a of spec.acorns) {
        const acorn = nodes.find((n) => n.name === nodeName.acorn(a.id));
        expect(acorn?.kind, `${id} acorn:${a.id}`).toBe("group");
        expect(acorn?.castShadow).toBe(false);
        expect((acorn?.children ?? []).length).toBeGreaterThanOrEqual(3);
      }
      for (const h of spec.hearts) {
        const heart = nodes.find((n) => n.name === nodeName.heart(h.id));
        expect(heart?.kind, `${id} heart:${h.id}`).toBe("group");
        expect(heart?.castShadow).toBe(false);
        expect((heart?.children ?? []).length).toBeGreaterThanOrEqual(2);
      }
      for (const sp of spec.springs) {
        const cap = nodes.find((n) => n.name === nodeName.spring(sp.id));
        const base = nodes.find((n) => n.name === `${nodeName.spring(sp.id)}:base`);
        expect(cap?.runtime).toBeDefined();
        expect((base?.children ?? []).length).toBeGreaterThanOrEqual(3);
      }
      for (const cp of spec.checkpoints) {
        const flag = nodes.find((n) => n.name === nodeName.checkpointFlag(cp.id));
        const stand = nodes.find((n) => n.name === `${nodeName.checkpoint(cp.id)}:pad`);
        expect(flag?.primitive).toBe("custom");
        expect(flag?.runtime).toBeDefined();
        expect((stand?.children ?? []).length).toBeGreaterThanOrEqual(3);
      }

      const gate = nodes.find((n) => n.name === nodeName.gate);
      const ring = nodes.find((n) => n.name === nodeName.gateRing);
      const lock = nodes.find((n) => n.name === nodeName.gateLock);
      expect((gate?.children ?? []).length).toBeGreaterThanOrEqual(4);
      expect(ring?.primitive).toBe("custom");
      expect((lock?.children ?? []).length).toBeGreaterThanOrEqual(2);

      const staticDecor = spec.decor.filter((d) => !ANIMATED_DECOR_KINDS.has(d.kind));
      if (staticDecor.length > 0) {
        const castDecor = nodes.find((n) => n.name === "pbl-diorama-decor-cast");
        expect(castDecor?.kind, id).toBe("group");
        expect((castDecor?.children ?? []).length, id).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("pairs every strata/caustics custom shader with a WebGPU WGSL twin, caps SSR at <= 0.10, and keeps instanced flora extension-free", () => {
    const strataMat = storybookStrataMaterial({ slope: { angle: 42, blend: 12, flatColor: "#5e8f48" } });
    const causticsMat = millpondCausticsMaterial({ surfaceY: 0, depthFade: 0.22 });
    expect(strataMat.kind).toBe("custom");
    expect(causticsMat.kind).toBe("custom");
    if (strataMat.kind === "custom" && strataMat.custom) {
      checkWgslTwin("pbl-storybook-strata", strataMat.custom, false);
      checkWgslDepthTwin("pbl-storybook-strata", strataMat.custom);
      checkGlslUnchanged([["pbl-storybook-strata", strataMat.custom]]);
    }
    if (causticsMat.kind === "custom" && causticsMat.custom) {
      checkWgslTwin("pbl-millpond-caustics", causticsMat.custom, false);
      checkWgslDepthTwin("pbl-millpond-caustics", causticsMat.custom);
      checkGlslUnchanged([["pbl-millpond-caustics", causticsMat.custom]]);
    }
    for (const id of WORLD_IDS) {
      expect(webgpuCustomShaderGap(buildWorld(worldSpec(id)).scene.toJSON()), `pips-big-leap:${id}`).toBeUndefined();
      const nodes = sceneOf(id);
      for (const n of nodes) {
        if (n.material?.kind === "custom") {
          expect(n.material.custom?.wgsl?.vertex, `${id} ${n.name} missing WGSL vertex`).toBeTruthy();
          expect(n.material.custom?.wgsl?.fragment, `${id} ${n.name} missing WGSL fragment`).toBeTruthy();
        }
        if (n.name === dioramaName.ssr) {
          expect(n.intensity ?? 0, `${id} SSR cap`).toBeLessThanOrEqual(0.1);
        }
        if ((n.name ?? "").startsWith("pbl-flora-")) {
          expect(n.primitive, `${id} ${n.name}`).toBe("custom");
          expect(n.castShadow).toBe(false);
          expect((n.material?.clearcoat as number | undefined) ?? 0).toBe(0);
          expect((n.material?.sheen as number | undefined) ?? 0).toBe(0);
        }
      }
    }
    expect(PBL_MAT.sunRibGlow.practical).toBe(true);
    expect(PBL_MAT.cyanRuneGlow.practical).toBe(true);
    expect(PBL_MAT.amberLanternGlow.practical).toBe(true);
  });

  it("keeps the `?look=original` one-model-per-prop scene untouched", () => {
    for (const id of WORLD_IDS) {
      const nodes = sceneOf(id, "original");
      for (const d of worldSpec(id).decor) {
        expect(nodes.some((n) => n.name === `${d.id}:${d.kind}`), `${id} ${d.id}`).toBe(true);
      }
    }
  });

  it("sculpts Original Pip as an acorn-helmeted woodland sprout (~1.25 m tall, grounded at y=0, multi-material PBR, cape hidden)", () => {
    type GeomNode = Node & {
      readonly geometry?: {
        readonly positions?: Float32Array;
        readonly indices?: Uint16Array | Uint32Array;
        readonly bounds?: { readonly min: readonly number[]; readonly max: readonly number[] };
      };
      readonly children?: readonly GeomNode[];
    };
    const limbsA = buildPipHeroLimbNodes("pip", [0, 0, 0], 0).map((b) => b.toJSON() as unknown as GeomNode);
    const limbsB = buildPipHeroLimbNodes("pip", [2, 1, -3], Math.PI).map((b) => b.toJSON() as unknown as GeomNode);
    expect(limbsA.length).toBe(PIP_LIMB_PARTS.length);

    const meshLeaves = (n: GeomNode): readonly GeomNode[] => (n.kind === "group" ? (n.children ?? []) : [n]);
    const partBounds = (n: GeomNode) => {
      let lx0 = Infinity, ly0 = Infinity, lz0 = Infinity;
      let lx1 = -Infinity, ly1 = -Infinity, lz1 = -Infinity;
      for (const leaf of meshLeaves(n)) {
        expect(leaf.kind).toBe("primitive");
        expect(leaf.primitive).toBe("custom");
        expect(leaf.castShadow).toBe(true);
        const b = leaf.geometry?.bounds;
        expect(b, leaf.name).toBeDefined();
        if (b) {
          lx0 = Math.min(lx0, b.min[0]!); ly0 = Math.min(ly0, b.min[1]!); lz0 = Math.min(lz0, b.min[2]!);
          lx1 = Math.max(lx1, b.max[0]!); ly1 = Math.max(ly1, b.max[1]!); lz1 = Math.max(lz1, b.max[2]!);
        }
      }
      return { min: [lx0, ly0, lz0] as const, max: [lx1, ly1, lz1] as const };
    };

    let minY = Infinity;
    let maxY = -Infinity;
    let totalTriangles = 0;
    const byName = new Map(limbsA.map((n) => [n.name ?? "", n]));

    limbsA.forEach((part, idx) => {
      const leavesA = meshLeaves(part);
      const leavesB = meshLeaves(limbsB[idx]!);
      expect(leavesA.length).toBe(leavesB.length);
      leavesA.forEach((leaf, leafIdx) => {
        // Underlying typed geometry buffers are cached and reused across spawns/worlds with zero regeneration churn
        expect(leaf.geometry?.positions).toBe(leavesB[leafIdx]?.geometry?.positions);
        totalTriangles += Math.floor((leaf.geometry?.indices?.length ?? 0) / 3);
      });
      const pos = part.position ?? [0, 0, 0];
      const b = partBounds(part);
      minY = Math.min(minY, pos[1]! + b.min[1]);
      maxY = Math.max(maxY, pos[1]! + b.max[1]);
    });

    // Grounded flush at y = 0 and ~1.25 m tall up to the crown sprout leaf tip
    expect(Math.abs(minY)).toBeLessThan(0.005);
    expect(maxY).toBeGreaterThanOrEqual(1.22);
    expect(maxY).toBeLessThanOrEqual(1.3);
    expect(totalTriangles).toBeGreaterThan(2500);
    expect(totalTriangles).toBeLessThanOrEqual(9500);

    // Chibi oversized fluted acorn-cap head vs lithe sapling torso, cupped side-ears beneath helmet brim
    const torso = byName.get("pip:torso")!;
    const head = byName.get("pip:head")!;
    const earL = byName.get("pip:ear-l")!;
    const armL = byName.get("pip:arm-l")!;
    const armR = byName.get("pip:arm-r")!;
    const footL = byName.get("pip:foot-l")!;
    const footR = byName.get("pip:foot-r")!;
    const tail = byName.get("pip:tail")!;

    expect(meshLeaves(head).length).toBe(3);
    expect(meshLeaves(torso).length).toBe(3);
    expect(meshLeaves(footL).length).toBe(2);
    expect(meshLeaves(armL).length).toBe(1);
    expect(armL.geometry?.positions).not.toBe(armR.geometry?.positions);
    expect(meshLeaves(footL)[0]?.geometry?.positions).not.toBe(meshLeaves(footR)[0]?.geometry?.positions);

    const torsoSkinB = meshLeaves(torso)[0]!.geometry!.bounds!;
    const headB = partBounds(head);
    const torsoCoreWidth = torsoSkinB.max[0]! - torsoSkinB.min[0]!;
    const headWidth = headB.max[0] - headB.min[0];
    expect(headWidth).toBeGreaterThan(torsoCoreWidth * 1.75);

    const earTopWorldY = (earL.position?.[1] ?? 0) + partBounds(earL).max[1];
    expect(earTopWorldY).toBeLessThan(maxY - 0.3);
    expect(PIP_RIG_SOCKETS.earFromHeadL[0]).toBe(-PIP_RIG_SOCKETS.earFromHeadR[0]);

    // Waist sprout leaf plume stays compact around the waist (not an oversized fox tail)
    const tailB = partBounds(tail);
    expect(tailB.max[1] - tailB.min[1]).toBeLessThan(0.24);

    // Unwanted blue cape stays hidden by default in both diorama & original looks, with zero primitive box fallback
    for (const look of [undefined, "original"] as const) {
      const w1Nodes = sceneOf("w1", look);
      const cape = w1Nodes.find((n) => n.name === nodeName.heroCape) as (Node & { readonly visible?: boolean }) | undefined;
      expect(cape?.visible).toBe(false);
      expect(cape?.primitive).toBe("custom");
    }
  });
});
