/**
 * C-05 output parity with three r185 (follow-up to #1253's GPU run, where
 * aura first rendered the requested operator/exposure):
 *  - background: three never tone-maps or exposes the clear colour (a raw
 *    glClear; tone mapping is per material). Under A3D_QR_CORE_OUTPUT the HDR
 *    target clears to the linear background with alpha 0, drawn content
 *    writes alpha 1, and OutputPass mixes the untouched clear back in by that
 *    coverage. Additive/multiply accumulate alpha so they mark coverage.
 *  - operators/exposure: aura's bodies are r185's with the exposure line
 *    lifted out to a single `hdr * u_exposure` (ACES keeps its `/ 0.6`).
 */

import { describe, expect, it, vi } from "vitest";
import { outputFragmentGlsl } from "../../../../packages/rendering/src/output/ToneMappingOperators.glsl";
import { resolveBlendMode } from "../../../../packages/rendering/src/contracts/blend";
import { Renderer, UnlitMaterial, type RenderItem } from "../../../../packages/rendering/src";
import { Geometry } from "../../../../packages/rendering/src/Geometry";
import { VertexBuffer } from "../../../../packages/rendering/src/VertexBuffer";
import { VertexFormat } from "../../../../packages/rendering/src/VertexFormat";
import { setRendererQrFlags } from "../../../../packages/rendering/src/renderer/FrameGraph";
import { normalizeProgramFeatures } from "../../../../packages/rendering/src/program/ProgramFeatures";
import { generateProgramImpl } from "../../../../packages/rendering/src/program/ProgramGenerator";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";

const V2 = resolveQrFlags({ env: { A3D_QR_CORE: "v2" } });
const OFF = resolveQrFlags({ options: ["none"] });

function item(): RenderItem {
  const vertices = new VertexBuffer(VertexFormat.P3N3, 3);
  vertices.setAttribute(0, "position", [-1, -1, 0]);
  vertices.setAttribute(1, "position", [3, -1, 0]);
  vertices.setAttribute(2, "position", [-1, 3, 0]);
  for (let i = 0; i < 3; i++) vertices.setAttribute(i, "normal", [0, 0, 1]);
  const geometry = new Geometry(vertices, null, "triangles", { min: [-1, -1, 0], max: [3, 3, 0] });
  return { geometry, material: new UnlitMaterial(), modelMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] } as RenderItem;
}

async function clearsOf(flags: typeof V2, options: Parameters<typeof Renderer.create>[0]): Promise<(readonly number[])[]> {
  setRendererQrFlags(flags);
  try {
    const renderer = await Renderer.create({ backend: "mock", width: 8, height: 8, ...options });
    const clear = vi.spyOn(renderer.device, "clear");
    renderer.render([item()]);
    const seen = clear.mock.calls.map((call) => [...call[0]]);
    renderer.dispose();
    return seen;
  } finally {
    setRendererQrFlags(OFF);
  }
}

describe("C-05 background passthrough (three r185 clear semantics)", () => {
  it("OutputPass mixes the untouched HDR value back in by coverage (HDR alpha without the MRT)", () => {
    const src = outputFragmentGlsl({ toneMapping: "agx", backgroundCoverage: false, overlay: false });
    expect(src).toContain("float a3dCoverage = clamp(scene.a, 0.0, 1.0);");
    expect(src).toContain("vec3 display = mix(clamp(hdr, 0.0, 1.0), TONE_MAP(hdr * u_exposure), a3dCoverage);");
    const mrt = outputFragmentGlsl({ toneMapping: "agx", backgroundCoverage: true, overlay: false });
    expect(mrt).toContain("float a3dCoverage = texture(u_coverage, v_uv).r;");
  });

  it("exposure is applied exactly once and never inside an operator body", () => {
    for (const op of ["none", "linear", "reinhard", "aces", "agx", "neutral"]) {
      const src = outputFragmentGlsl({ toneMapping: op, backgroundCoverage: false, overlay: false });
      expect(src.match(/u_exposure/g)?.length, op).toBe(2); // declaration + one multiply
      expect(src).not.toContain("toneMappingExposure");
    }
  });

  it("under A3D_QR_CORE the HDR target clears to outputClearColor (alpha 0)", async () => {
    const outputClearColor = [0.033, 0.133, 0.319, 0] as const;
    const clears = await clearsOf(V2, { clearColor: [0.5, 0.5, 0.5, 1], outputClearColor });
    expect(clears[0]).toEqual([...outputClearColor]);
  });

  it("flag-off keeps the legacy clearColor", async () => {
    const clears = await clearsOf(OFF, { clearColor: [0.5, 0.5, 0.5, 1], outputClearColor: [0, 0, 0, 0] });
    expect(clears[0]).toEqual([0.5, 0.5, 0.5, 1]);
  });

  it("additive and multiply accumulate alpha (mark coverage); alpha/premultiplied unchanged", () => {
    for (const mode of ["additive", "multiply"] as const) {
      const resolved = resolveBlendMode({ blendMode: mode } as never);
      expect(resolved, mode).not.toBe("opaque");
      expect((resolved as { alpha: unknown }).alpha, mode).toEqual({ equation: "add", src: "one", dst: "one" });
    }
    const alpha = resolveBlendMode({ blendMode: "alpha" } as never) as { alpha: unknown };
    expect(alpha.alpha).toEqual({ equation: "add", src: "one", dst: "one-minus-src-alpha" });
  });

  it("generated opaque and masked programs write coverage alpha 1; blend keeps its alpha", () => {
    const fragment = (alphaMode: "opaque" | "mask" | "blend") =>
      generateProgramImpl(normalizeProgramFeatures({ lighting: "unlit", pass: "forward", alphaMode })).fragment;
    expect(fragment("opaque")).toContain("a3dAlpha = 1.0;");
    expect(fragment("mask")).toMatch(/#ifndef ALPHA_TO_COVERAGE\n\s+a3dAlpha = 1\.0;\n#endif/);
    expect(fragment("blend")).not.toContain("a3dAlpha = 1.0;");
  });
});
