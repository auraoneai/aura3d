// QR-07 — lane-07 standalone programs must be creatable on a real device.
// Every device's createShaderProgram rejects sources without the program's
// marker (SHADER_MARKER_MISSING). Beam, ribbon and mesh-particle sources
// never carried theirs, so prd07.beams/ribbons/mesh threw on first use and
// took the whole frame down (GPU promote: prd07-volumetric-shafts
// renderer-error). The GLSL half caught on the L4 is also checked here:
// `float == int` in beam/ribbon and the fogged decal variant redeclaring the
// fog chunk's u_cameraPosition/u_sunDirection/u_sunColor
// (prd07-decals "WebGL shader compile failed"). The glslang check runs only
// when glslangValidator is on PATH; marker checks always run.

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { BEAM_SHADER_MARKER, beamFragmentSource, beamVertexSource } from "../../../../packages/rendering/src/vfx/shaders/beam.glsl";
import { RIBBON_SHADER_MARKER, ribbonFragmentSource, ribbonVertexSource } from "../../../../packages/rendering/src/vfx/shaders/ribbon.glsl";
import { MESH_PARTICLE_SHADER_MARKER, meshParticleFragmentSource, meshParticleVertexSource } from "../../../../packages/rendering/src/vfx/shaders/mesh-particle.glsl";
import { DECAL_SHADER_MARKER, decalFragmentSource, decalVertexSource } from "../../../../packages/rendering/src/vfx/shaders/decal.glsl";
import { LOWRES_COMPOSITE_SHADER_MARKER, lowResCompositeFragmentSource, lowResCompositeVertexSource } from "../../../../packages/rendering/src/vfx/shaders/lowresComposite.glsl";
import { PRD07_VOLUMETRIC_MARKER, volumetricInjectFragmentSource, volumetricInjectVertexSource } from "../../../../packages/rendering/src/atmosphere/shaders/volumetric-inject.glsl";
import { volumetricIntegrateFragmentSource, volumetricIntegrateVertexSource } from "../../../../packages/rendering/src/atmosphere/shaders/volumetric-integrate.glsl";
import { volumetricApplyFragmentSource, volumetricApplyVertexSource } from "../../../../packages/rendering/src/atmosphere/shaders/volumetric-apply.glsl";
import { MockRenderDevice } from "../../../../packages/rendering/src/RenderDevice";

interface Program { readonly label: string; readonly marker: string; readonly vertex: string; readonly fragment: string }

const bits = (n: number) => Array.from({ length: 1 << n }, (_, m) => Array.from({ length: n }, (_, i) => (m & (1 << i)) !== 0));

const programs: Program[] = [
  ...bits(2).map(([softParticles, aurora]) => ({ label: `beam.${softParticles ? 1 : 0}${aurora ? 1 : 0}`, marker: BEAM_SHADER_MARKER, vertex: beamVertexSource(), fragment: beamFragmentSource({ softParticles, aurora }) })),
  ...bits(1).map(([softParticles]) => ({ label: `ribbon.${softParticles ? 1 : 0}`, marker: RIBBON_SHADER_MARKER, vertex: ribbonVertexSource(), fragment: ribbonFragmentSource({ softParticles }) })),
  { label: "mesh-particle", marker: MESH_PARTICLE_SHADER_MARKER, vertex: meshParticleVertexSource(), fragment: meshParticleFragmentSource() },
  ...bits(4).map(([albedoTexture, normalTexture, multiply, fog]) => ({
    label: `decal.${[albedoTexture, normalTexture, multiply, fog].map((b) => (b ? 1 : 0)).join("")}`,
    marker: DECAL_SHADER_MARKER,
    vertex: decalVertexSource(),
    fragment: decalFragmentSource({ albedoTexture, normalTexture, multiply, fog })
  })),
  ...bits(1).map(([bilateral]) => ({ label: `lowres.${bilateral ? 1 : 0}`, marker: LOWRES_COMPOSITE_SHADER_MARKER, vertex: lowResCompositeVertexSource(), fragment: lowResCompositeFragmentSource({ bilateral }) })),
  { label: "volumetric.inject", marker: PRD07_VOLUMETRIC_MARKER, vertex: volumetricInjectVertexSource(), fragment: volumetricInjectFragmentSource() },
  { label: "volumetric.integrate", marker: PRD07_VOLUMETRIC_MARKER, vertex: volumetricIntegrateVertexSource(), fragment: volumetricIntegrateFragmentSource() },
  { label: "volumetric.apply", marker: PRD07_VOLUMETRIC_MARKER, vertex: volumetricApplyVertexSource(), fragment: volumetricApplyFragmentSource() }
];

function hasGlslang(): boolean {
  try {
    execFileSync("glslangValidator", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const dir = mkdtempSync(join(tmpdir(), "qr07-glsl-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("prd07 standalone shader programs", () => {
  it.each(programs.map((p) => [p.label, p] as const))("%s carries its marker and creates on the mock device", (_label, p) => {
    expect(p.vertex.includes(p.marker), "vertex marker").toBe(true);
    expect(p.fragment.includes(p.marker), "fragment marker").toBe(true);
    const device = new MockRenderDevice();
    expect(() => device.createShaderProgram({ label: p.label, vertex: p.vertex, fragment: p.fragment, marker: p.marker })).not.toThrow();
  });

  it.runIf(hasGlslang())("every variant compiles as GLSL ES 3.00 (glslangValidator)", () => {
    const failures: string[] = [];
    for (const p of programs) {
      for (const [stage, source] of [["vert", p.vertex], ["frag", p.fragment]] as const) {
        const file = join(dir, `${p.label}.${stage}`);
        writeFileSync(file, source);
        try {
          execFileSync("glslangValidator", [file], { stdio: "pipe" });
        } catch (error) {
          const out = String((error as { stdout?: Buffer }).stdout ?? error);
          failures.push(`${p.label}.${stage}: ${out.split("\n").filter((l) => l.startsWith("ERROR")).slice(0, 2).join(" | ")}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });
});
