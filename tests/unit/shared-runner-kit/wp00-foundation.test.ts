import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createCustomShaderMaterial } from "../../../packages/engine/src/agent-api/compiler/customMaterial";
import { Batch, CORRIDOR_BOUNDS, createGpuSplatMap, type MeshData } from "../../../examples/shared/runner-kit";
import {
  dualAnimatedWaterSpec,
  dualCelRimSpec,
  dualEnergyFieldSpec,
  dualWetInkSurfaceSpec
} from "../../../apps/showcase-port-shared/dual-shaders";
import { createImpactRig } from "../../../apps/showcase-port-shared/feel";
import { createFlipbookAtlas, createGradingLut } from "../../../apps/showcase-port-shared/vfx-pack";

const glslangAvailable = spawnSync("glslangValidator", ["--version"]).status === 0;

const quad = (): MeshData => ({
  positions: [-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5],
  normals: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
  uvs: [0, 0, 1, 0, 1, 1, 0, 1],
  indices: [0, 1, 2, 0, 2, 3]
});

describe("WP-00 shared foundation", () => {
  it("Batch.flush marks skipBoundsRefresh: true and supports CORRIDOR_BOUNDS", () => {
    const batch = new Batch(quad(), 2, [1, 0.5, 0.2], CORRIDOR_BOUNDS);
    const updates: Array<{ name: string; skipBoundsRefresh?: boolean }> = [];
    const handle = {
      updateAttribute(name: string, u: { skipBoundsRefresh?: boolean }) {
        updates.push({ name, skipBoundsRefresh: u.skipBoundsRefresh });
      }
    } as unknown as Parameters<Batch["flush"]>[0];

    batch.place(0, 1, 2, -10, 0, 1, 1, 1);
    batch.setTone(0, [0.2, 0.8, 1.0]);
    batch.flush(handle);
    expect(updates.length).toBe(3);
    expect(updates.every((u) => u.skipBoundsRefresh === true)).toBe(true);
    expect(batch.geometry().bounds).toEqual(CORRIDOR_BOUNDS);
  });

  it("createGpuSplatMap stamps organic wet-ink coverage into RGBA8 pixels", () => {
    const splat = createGpuSplatMap({ width: 64, height: 64 });
    splat.stamp({ u: 0.5, v: 0.5, radius: 0.15, rgba: [255, 64, 180, 255], seed: 2 });
    const centerIdx = (32 * 64 + 32) * 4;
    expect(splat.pixels[centerIdx]).toBe(255);
    expect(splat.pixels[centerIdx + 3]).toBeGreaterThan(200);
    expect(splat.toTexture()).toBeDefined();
  });

  it("createFlipbookAtlas and createGradingLut build typed RGBA8 textures", () => {
    const sparks = createFlipbookAtlas("sparks");
    expect(sparks.columns).toBe(8);
    expect(sparks.rows).toBe(4);
    expect(sparks.frameCount).toBe(32);
    const lut = createGradingLut("cinema-warm", 16);
    expect(lut.size).toBe(16);
    expect(lut.texture).toBeDefined();
  });

  it("createImpactRig unfreezes on real dt rather than locking up", () => {
    const rig = createImpactRig({ reducedMotion: false });
    rig.trigger({ freezeSeconds: 0.05, trauma: 0.6, fovKickDeg: 3 });
    const frozenStep = rig.step(0.016);
    expect(frozenStep.frozen).toBe(true);
    expect(frozenStep.simDt).toBe(0);
    const resumedStep = rig.step(0.06);
    expect(resumedStep.simDt).toBeGreaterThan(0);
  });

  it("dual-shaders pair GLSL 300 es + WGSL stages without duplicate uniforms", () => {
    const splat = createGpuSplatMap({ width: 32, height: 32 }).toTexture();
    const presets = [
      ["cel-rim", dualCelRimSpec()],
      ["energy-field", dualEnergyFieldSpec()],
      ["animated-water", dualAnimatedWaterSpec()],
      ["wet-ink", dualWetInkSurfaceSpec({ splatMap: splat })]
    ] as const;

    for (const [name, spec] of presets) {
      const mat = createCustomShaderMaterial(spec, `wp00-${name}`);
      try {
        expect(mat.sources.glsl.vertex.startsWith("#version 300 es")).toBe(true);
        expect(mat.sources.glsl.fragment.startsWith("#version 300 es")).toBe(true);
        expect(mat.sources.wgsl?.vertex).toContain("@aura3d-bindings");
        expect(mat.sources.wgsl?.vertex).toContain("a3dRasterPosition");
        expect(mat.sources.wgsl?.fragment).toContain("@aura3d-bindings");

        for (const [stage, src] of [["vertex", mat.sources.glsl.vertex], ["fragment", mat.sources.glsl.fragment]] as const) {
          const declared = [...src.matchAll(/^\s*uniform\s+\w+\s+(\w+)\s*(?:\[\d+\])?\s*;/gm)].map((m) => m[1]!);
          expect(new Set(declared).size, `${name} ${stage} duplicate uniform`).toBe(declared.length);
        }

        if (glslangAvailable) {
          const dir = mkdtempSync(join(tmpdir(), `wp00-${name}-`));
          try {
            writeFileSync(join(dir, "p.vert"), mat.sources.glsl.vertex);
            writeFileSync(join(dir, "p.frag"), mat.sources.glsl.fragment);
            const res = spawnSync("glslangValidator", [join(dir, "p.vert"), join(dir, "p.frag")], { encoding: "utf8" });
            expect(res.status, `${name}: ${res.stdout}${res.stderr}`).toBe(0);
          } finally {
            rmSync(dir, { recursive: true, force: true });
          }
        }
      } finally {
        mat.dispose();
      }
    }
  });
});
