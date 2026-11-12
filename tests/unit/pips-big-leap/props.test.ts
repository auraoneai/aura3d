// WP-06 (Pip's Big Leap): verifies that all 26 static Meshy & borrowed sci-fi/FPS GLBs and raw flora/plinth
// primitives in the diorama look are replaced by sculpted multi-material procedural assemblies, while keeping
// the 3 rigged character GLBs (`pipsPip`, `pipsBrambleback`, `leapBeetleAnim`) and `?look=original` intact.
import { describe, expect, it } from "vitest";
import { webgpuCustomShaderGap } from "../../../packages/engine/src/agent-api/compiler/webgpuCustomShaderGap";
import { ANIMATED_DECOR_KINDS, buildWorld, nodeName } from "../../../apps/showcase-pips-big-leap/src/game/world";
import { dioramaName } from "../../../apps/showcase-pips-big-leap/src/game/diorama";
import { WORLD_IDS } from "../../../apps/showcase-pips-big-leap/src/game/looks";
import { worldSpec } from "../../../apps/showcase-pips-big-leap/src/game/worlds";
import { PBL_MAT, millpondCausticsMaterial, storybookStrataMaterial } from "../../../apps/showcase-pips-big-leap/src/art/proceduralModels";
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

const ALLOWED_RIGGED_GLBS = new Set(["pipsPip", "pipsBrambleback", "leapBeetleAnim"]);

const flat = (nodes: readonly Node[]): Node[] => nodes.flatMap((n) => [n, ...(n.kind === "group" ? flat(n.children ?? []) : [])]);
const sceneOf = (id: (typeof WORLD_IDS)[number], look?: "original") =>
  flat((buildWorld(worldSpec(id), look ? { look } : {}).scene.toJSON() as unknown as { nodes: Node[] }).nodes);

describe("pips-big-leap procedural multi-material props (WP-06)", () => {
  it("mounts ONLY the 3 rigged character GLBs across all 7 diorama worlds (zero static Meshy or borrowed props)", () => {
    for (const id of WORLD_IDS) {
      const models = sceneOf(id).filter((n) => n.kind === "model");
      expect(models.length, id).toBeGreaterThanOrEqual(1);
      for (const m of models) {
        expect(ALLOWED_RIGGED_GLBS.has(m.asset?.id ?? ""), `${id} unexpected GLB ${m.asset?.id} on ${m.name}`).toBe(true);
      }
      expect(sceneOf(id).filter((n) => (n.name ?? "").startsWith("pbl-props:")), id).toEqual([]);
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
});
