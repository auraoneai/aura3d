/**
 * Thermal Drift HS-15 custom materials: the chevron heat gain (+25% at 90% core heat), the reduced-motion molten flow,
 * the scene wiring (chevrons and the slag-gutter node on one custom program each, instanced in one draw), and the
 * baked GLSL compiled with the reference compiler when `glslangValidator` is installed.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createCustomShaderMaterial } from "../../../packages/engine/src/agent-api/compiler/customMaterial";
import type { AuraCustomMaterialSpec } from "../../../packages/engine/src/agent-api/nodes/types";
import { CIRCUITS } from "../../../apps/showcase-heatsink/src/data";
import { CIRCUIT_LOOKS } from "../../../apps/showcase-heatsink/src/look";
import { buildThermalDriftScene, GUTTER, INSTANCE_COUNTS, LAVA_POOL, LAVA_POOL_SCALE, WALL_SEGMENT_COUNT } from "../../../apps/showcase-heatsink/src/scene";
import {
  CHEVRON_FRAGMENT_GLSL,
  CHEVRON_HEAT_GAIN,
  CHEVRON_HEAT_UNIFORM,
  chevronHeatGain,
  chevronHeatMaterial,
  MOLTEN_FLOW,
  MOLTEN_FRAGMENT_GLSL,
  moltenFlow,
  moltenMaterial,
  quantisedHeat,
  REDUCED_MOTION_FLOW_SHARE,
  skylineFacadeMaterial
} from "../../../apps/showcase-heatsink/src/shaders";

type Uniform = { type: string; value: unknown };
type Node = { kind: string; name?: string; castShadow?: boolean; instances?: unknown[]; material?: { kind: string; custom?: AuraCustomMaterialSpec & { uniforms: Record<string, Uniform> } }; children?: Node[] };
const flatten = (nodes: readonly Node[]): Node[] => nodes.flatMap((n) => [n, ...flatten(n.children ?? [])]);
const nodesOf = (id: keyof typeof CIRCUITS, reducedMotion = false) =>
  flatten((buildThermalDriftScene({ circuit: CIRCUITS[id], reducedMotion }).toJSON() as unknown as { nodes: Node[] }).nodes);

describe("heatsink HS-15 chevron heat response", () => {
  it("adds +25% at 90% core heat and nothing below 50%", () => {
    expect(chevronHeatGain(0)).toBe(1);
    expect(chevronHeatGain(0.5)).toBe(1);
    expect(chevronHeatGain(0.9)).toBeCloseTo(1 + CHEVRON_HEAT_GAIN, 10);
    expect(chevronHeatGain(1)).toBeCloseTo(1.25, 10);
    let last = 0;
    for (let h = 0; h <= 1.0001; h += 0.05) {
      const g = chevronHeatGain(h);
      expect(g).toBeGreaterThanOrEqual(last);
      last = g;
    }
  });
  it("the shader evaluates the same smoothstep as the CPU mirror", () => {
    expect(CHEVRON_FRAGMENT_GLSL).toContain("smoothstep(0.50, 0.90, u_heat)");
    expect(CHEVRON_FRAGMENT_GLSL).toContain("1.0 + 0.25 * response");
  });
  it("quantises the uniform write to 1/256", () => {
    expect(quantisedHeat(-1)).toBe(0);
    expect(quantisedHeat(2)).toBe(1);
    expect(quantisedHeat(0.5)).toBe(0.5);
    expect(quantisedHeat(0.5 + 1 / 1024)).toBe(0.5);
  });
});

describe("heatsink HS-15 molten material", () => {
  it("slows the flow to 30% on reduced motion (secondary motion)", () => {
    expect(moltenFlow(false)).toBe(MOLTEN_FLOW);
    expect(moltenFlow(true)).toBeCloseTo(MOLTEN_FLOW * REDUCED_MOTION_FLOW_SHARE, 10);
    expect(MOLTEN_FRAGMENT_GLSL).toContain("u_flow");
  });
  it("puts the chevrons and the slag gutters on custom programs read per instance (one draw each)", () => {
    for (const id of ["grand", "dustfall", "vesper"] as const) {
      const all = nodesOf(id);
      for (const name of ["wall-chevrons-a", "wall-chevrons-b"]) {
        const node = all.find((n) => n.name === name)!;
        expect(node.material?.kind, `${id} ${name}`).toBe("custom");
        expect(node.material!.custom!.uniforms[CHEVRON_HEAT_UNIFORM]).toEqual({ type: "f32", value: 0 });
        expect(node.material!.custom!.glsl.vertex).toContain("instanceMatrix");
        expect(node.castShadow).toBe(false);
      }
      const gutters = all.find((n) => n.name === "slag-gutters")!;
      expect(gutters.material?.kind, id).toBe("custom");
      expect(gutters.material!.custom!.fog).toBe(true);
      expect(gutters.instances).toHaveLength(INSTANCE_COUNTS.gutters);
      expect(gutters.castShadow).toBe(false);
      expect(gutters.material!.custom!.uniforms.u_glow!.value).toBe(CIRCUIT_LOOKS[id].molten.glow);
    }
    expect(INSTANCE_COUNTS.gutters).toBe(WALL_SEGMENT_COUNT * 2 + 1);
  });
  it("mounts the reduced-motion values: 30% flow and a still chevron scan", () => {
    const all = nodesOf("grand", true);
    const flow = all.find((n) => n.name === "slag-gutters")!.material!.custom!.uniforms.u_flow!.value as number;
    expect(flow).toBeCloseTo(MOLTEN_FLOW * REDUCED_MOTION_FLOW_SHARE, 10);
    expect(all.find((n) => n.name === "wall-chevrons-a")!.material!.custom!.uniforms.u_motion!.value).toBe(0);
    expect(nodesOf("grand").find((n) => n.name === "wall-chevrons-a")!.material!.custom!.uniforms.u_motion!.value).toBe(1);
  });
  it("keeps the gutters on the deck inside the walls and scales the gutter box into the lava pool", () => {
    expect(GUTTER.lateral + GUTTER.size[0] / 2).toBeLessThan(10.83);
    expect(GUTTER.lateral - GUTTER.size[0] / 2).toBeGreaterThan(8.9);
    for (let i = 0; i < 3; i += 1) expect(GUTTER.size[i]! * LAVA_POOL_SCALE[i]!).toBeCloseTo(LAVA_POOL.size[i]!, 10);
  });
});

const available = spawnSync("glslangValidator", ["--version"]).status === 0;

describe.skipIf(!available)("heatsink HS-15 GLSL compiles under #version 300 es", () => {
  const specs: [string, AuraCustomMaterialSpec][] = [
    ["molten", (moltenMaterial({ hot: "#ff8a1f", crust: "#241812", glow: 6 }) as unknown as { custom: AuraCustomMaterialSpec }).custom],
    ["chevron", (chevronHeatMaterial("#ff8a1f", 1.65) as unknown as { custom: AuraCustomMaterialSpec }).custom],
    ["skyline facade", (skylineFacadeMaterial({ body: "#2a2630", foot: "#5a2a10", window: "#ffb46a", window2: "#ffe2b8", cell: [3.2, 3.6], lit: 0.3, glow: 3 }) as unknown as { custom: AuraCustomMaterialSpec }).custom]
  ];
  for (const [name, spec] of specs) {
    it(`${name} bakes and links`, () => {
      const material = createCustomShaderMaterial(spec, `td-${name}`);
      try {
        const { vertex, fragment } = material.sources.glsl;
        const dir = mkdtempSync(join(tmpdir(), "td-glsl-"));
        try {
          writeFileSync(join(dir, "p.vert"), vertex);
          writeFileSync(join(dir, "p.frag"), fragment);
          const result = spawnSync("glslangValidator", [join(dir, "p.vert"), join(dir, "p.frag")], { encoding: "utf8" });
          expect(`${result.stdout}${result.stderr}`.trim(), `glslangValidator output for ${name}`).not.toMatch(/ERROR/);
          expect(result.status, `${result.stdout}${result.stderr}`).toBe(0);
        } finally {
          rmSync(dir, { recursive: true, force: true });
        }
      } finally {
        material.dispose();
      }
    });
  }
});
