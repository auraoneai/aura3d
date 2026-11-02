import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AuraApp } from "@aura3d/engine";
import { describe, expect, it, vi } from "vitest";
import { createCustomShaderMaterial } from "../../../packages/engine/src/agent-api/compiler/customMaterial";
import { roadSpec } from "../../../examples/saiyan-snake-way-port/materials";
import { buildRoadSamples, frameAt, onRoad } from "../../../examples/saiyan-snake-way-port/road";
import { ROAD_FRAGMENT, ROAD_VERTEX, SCRIPT_ROAD_FRAGMENT } from "../../../examples/saiyan-snake-way-port/shaders";
import { createRun, STEP } from "../../../examples/saiyan-snake-way-port/sim";
import { buildWorld } from "../../../examples/saiyan-snake-way-port/world";

const world = {
  original: buildWorld({ look: { mode: "original", pinnedStage: null } }),
  script: buildWorld({ look: { mode: "script", pinnedStage: null } })
};
const scene = { original: world.original.scene.toJSON(), script: world.script.scene.toJSON() };
const roadNode = (mode: "original" | "script") => {
  const nodes = scene[mode].nodes.filter((node) => node.kind === "primitive" && node.name === "road");
  expect(nodes).toHaveLength(1);
  const node = nodes[0]!;
  if (node.kind !== "primitive" || !node.material?.custom) throw new Error("road custom material missing");
  return { node, spec: node.material.custom };
};
const digest = (text: string): string => createHash("sha256").update(text).digest("hex");

describe("Serpentine road scale composition", () => {
  it("uses the exact pre-change road shader and camera in original mode", () => {
    const { spec } = roadNode("original");
    expect(spec).toEqual(roadSpec());
    expect(spec.glsl.vertex).toBe(ROAD_VERTEX);
    expect(spec.glsl.fragment).toBe(ROAD_FRAGMENT);
    // Hashes taken at 822f9d071 before this presentation-only change.
    expect(digest(spec.glsl.fragment)).toBe("6be636d7490cdcaafaddda66fdea6873fb46136d9c62c4bd6985f9c94402c019");
    expect(digest(spec.glsl.vertex!)).toBe("066834d806f968fc98a04db7e6462d6c5be3dcb304ba8220a1af4cced44100d8");
    expect(scene.original.camera).toMatchObject({
      mode: "perspective", position: [0, 6, 14], target: [0, 1, 0], fov: 62, near: 0.5, far: 6000
    });
  });

  it("changes only the script road fragment, retaining its geometry, uniforms and initial camera", () => {
    const original = roadNode("original"), script = roadNode("script");
    expect(script.spec).toEqual({ ...original.spec, glsl: { ...original.spec.glsl, fragment: SCRIPT_ROAD_FRAGMENT } });
    expect(script.node.geometry).toEqual(original.node.geometry);
    expect(scene.script.camera).toEqual(scene.original.camera);
    expect(script.spec.uniforms?.lookMode?.value).toBe(0);
    expect(SCRIPT_ROAD_FRAGMENT).not.toBe(ROAD_FRAGMENT);
  });

  it("adds the bow only inside the script branch, after the existing derivative filter", () => {
    const functionEnd = SCRIPT_ROAD_FRAGMENT.indexOf("\nin vec3 vNormal;");
    const bow = SCRIPT_ROAD_FRAGMENT.slice(0, functionEnd);
    expect(bow).toBe(`
float serpentScaleBow(float x, float row) {
  float u = fract(x + mod(row, 2.0) * 0.5);
  return 1.4 * u * (1.0 - u);
}
`);
    const withoutFunction = SCRIPT_ROAD_FRAGMENT.slice(functionEnd);
    const branch = withoutFunction.indexOf("  } else {", withoutFunction.indexOf("// pre-GU47 road (exact)"));
    const insertedAt = branch + "  } else {".length;
    const after = withoutFunction.indexOf("\n    // GU47 SSR-08: living serpent road.", insertedAt);
    const inserted = withoutFunction.slice(insertedAt, after);
    expect(withoutFunction.slice(0, insertedAt) + withoutFunction.slice(after)).toBe(ROAD_FRAGMENT);
    expect(withoutFunction.indexOf("fwidth(cell)")).toBeLessThan(branch);
    expect(inserted).toContain("if (top > 0.0 && detail > 0.0)");
    expect(inserted).toContain("joint = mix(joint, scaleJoint, top)");
    expect(inserted).toContain("max(0.05, fwm * 2.0)");
    expect(inserted).not.toMatch(/\b(?:fwidth|dFdx|dFdy)\s*\(/);
  });

  it("the parabolic seams are staggered, periodic and cannot cross on negative or positive rows", () => {
    // CPU check of the shader's pinned bow formula above, in cell coordinates (the top row is 1.6 m).
    const fract = (x: number) => x - Math.floor(x);
    const bow = (x: number, row: number) => {
      const parity = ((row % 2) + 2) % 2;
      const u = fract(x + parity * 0.5);
      return 1.4 * u * (1 - u);
    };
    expect(bow(0, 0)).toBe(0);
    expect(bow(0.5, 0)).toBeCloseTo(0.35, 12);
    expect(bow(0, 1)).toBeCloseTo(0.35, 12);
    for (let row = -3; row <= 3; row++) for (let x = -2; x <= 2; x += 0.025) {
      expect(bow(x + 1, row)).toBeCloseTo(bow(x, row), 12);
      expect(bow(x, row + 2)).toBeCloseTo(bow(x, row), 12);
      const separation = 1 + bow(x, row + 1) - bow(x, row);
      expect(separation).toBeGreaterThanOrEqual(0.65 - 1e-12);
      expect(separation).toBeLessThanOrEqual(1.35 + 1e-12);
    }
  });

  for (const mode of ["original", "script"] as const) {
    it(`${mode} updates presentation without mutating the run or calling Math.random`, () => {
      const writes = new Map<string, unknown>();
      const setPose = vi.fn();
      const handle = (id: string) => {
        const h: Record<string, unknown> = {};
        const self = () => h;
        Object.assign(h, {
          setPosition: self, setRotation: self, setScale: self, setVisible: self, setInstanceMatrices: self,
          setLight: self,
          setUniform: (name: string, value: unknown) => { writes.set(`${id}.${name}`, value); return h; }
        });
        return h;
      };
      const app = { camera: { setPose }, nodes: { require: handle } } as unknown as AuraApp;
      const runtime = world[mode].bind(app);
      const state = createRun(), before = structuredClone(state);
      const random = vi.spyOn(Math, "random");
      try {
        runtime.setTitle?.(true);
        runtime.update(state, STEP, 1, 16 / 9);
        expect(state).toEqual(before);
        expect(random).not.toHaveBeenCalled();
        expect(writes.get("road.lookMode")).toBe(mode === "script" ? 1 : undefined);
        if (mode === "original") {
          const frame = frameAt(buildRoadSamples(), state.s);
          const p = onRoad(frame, state.laneX, state.y);
          expect(setPose).toHaveBeenCalledWith({
            position: [p[0], p[1] + 3.4, p[2] + 7 + Math.min(1.6, state.speed * 0.03)],
            target: [p[0], p[1] + 1.6, p[2] - 12],
            up: [0, 1, 0], fov: 62
          }, { cut: false });
        }
      } finally {
        random.mockRestore();
      }
    });
  }
});

const glslangAvailable = spawnSync("glslangValidator", ["--version"]).status === 0;
describe("Serpentine road shaders", () => {
  for (const mode of ["original", "script"] as const) {
    it(`${mode} bakes with the engine prelude`, () => {
      const shader = createCustomShaderMaterial(roadNode(mode).spec, `serpent-road-${mode}`);
      try {
        expect(shader.sources.glsl.vertex.startsWith("#version 300 es")).toBe(true);
        expect(shader.sources.glsl.fragment.startsWith("#version 300 es")).toBe(true);
      } finally {
        shader.dispose();
      }
    });
    it.skipIf(!glslangAvailable)(`${mode} links with glslangValidator`, () => {
      const shader = createCustomShaderMaterial(roadNode(mode).spec, `serpent-road-${mode}-glslang`);
      const dir = mkdtempSync(join(tmpdir(), "serpent-road-"));
      try {
        writeFileSync(join(dir, "road.vert"), shader.sources.glsl.vertex);
        writeFileSync(join(dir, "road.frag"), shader.sources.glsl.fragment);
        const result = spawnSync("glslangValidator", ["-l", join(dir, "road.vert"), join(dir, "road.frag")], { encoding: "utf8" });
        expect(result.status, `${result.stdout}${result.stderr}`).toBe(0);
      } finally {
        shader.dispose();
        rmSync(dir, { recursive: true, force: true });
      }
    });
  }
});
