/**
 * A4 pilot (a): the cloud sea (`CLOUD_FRAGMENT` in shaders.ts) as a portable shader graph. Selected only by the default-off
 * `?portable=1` flag (world.ts); the GLSL `cloudSpec()` stays the default and the original. Uniform names are the GLSL
 * uniform names, so the per-frame `clouds.setUniform("cloudPhase", ...)` calls drive either material unchanged.
 *
 * Mapping (docs/rendering/portable-conversion-pattern.md): `vXZ` (varying from `modelMatrix * position`) -> built-in
 * `positionWorld`; `cameraPosition` -> built-in `cameraPosition`; authored uniforms -> graph uniform resources; the closing
 * `a3dSrgbToLinear(col)` -> `glslLike.srgbToLinear`; `outColor.a = 1` -> no opacity output. Unlit, so no `a3d_lights` analogue is needed.
 */
import { shaderGraph } from "@aura3d/engine/shader-graph-runtime";
import type { material } from "@aura3d/engine";
import { GraphBuilder, glslLike, type Expr } from "../../apps/showcase-port-shared/portable-graph";

type Material = ReturnType<typeof material.custom>;

export function cloudSeaGraph(): ReturnType<GraphBuilder["build"]> {
  const g = new GraphBuilder();
  const cloudPhase = g.uniform("cloudPhase", "f32");
  const nightMix = g.uniform("nightMix", "f32");
  const hazeColor = g.uniform("hazeColor", "vec3");
  const sunDir = g.uniform("sunDir", "vec3");
  const cloudLit = g.uniform("cloudLit", "vec3");
  const cloudValley = g.uniform("cloudValley", "vec3");
  const sunGain = g.uniform("sunGain", "f32");
  const bandMix = g.uniform("bandMix", "f32");
  const vXZ = g.swz(g.input("positionWorld", "vec3"), "xz");
  const camXZ = g.swz(g.input("cameraPosition", "vec3"), "xz");
  const vn = glslLike.noise(g);
  const off = (p: Expr, scale: number, add: number): Expr => g.add(g.mul(p, scale), add);
  // float fbm(vec2 p) { 0.5 * vnoise(p) + 0.27 * vnoise(p * 2.1 + 4.0) + 0.14 * vnoise(p * 4.3 + 9.0) + 0.09 * vnoise(p * 9.1 + 2.0) }
  const fbm = (p: Expr): Expr => g.sum(g.mul(0.5, vn(p)), g.mul(0.27, vn(off(p, 2.1, 4))), g.mul(0.14, vn(off(p, 4.3, 9))), g.mul(0.09, vn(off(p, 9.1, 2))));

  const p = g.add(g.mul(vXZ, 0.0036), g.vec(g.mul(cloudPhase, 0.016), g.mul(cloudPhase, 0.011)));
  const n = fbm(p);
  const e = fbm(g.add(p, g.c(0.03, 0.02)));
  const lit = g.clamp(g.add(0.5, g.mul(g.sub(n, e), 9)), 0, 1);
  const lo = g.mix(g.c(0.66, 0.74, 0.88), g.c(0.04, 0.06, 0.15), nightMix);
  const hi = g.mix(g.c(1.0, 0.98, 0.93), g.c(0.2, 0.25, 0.44), nightMix);
  const t = g.smoothstep(0.25, 0.75, g.add(g.mul(n, 0.75), g.mul(lit, 0.45)));
  let col = g.mix(lo, hi, t);
  // GU47 LT-05 band look
  const toSun = g.normalize(g.add(g.swz(sunDir, "xz"), g.c(1e-5, 1e-5)));
  const rel = g.sub(vXZ, camXZ);
  const sunSide = g.add(0.5, g.mul(0.5, g.dot(g.normalize(g.add(rel, g.c(1e-5, 1e-5))), toSun)));
  const band = g.mix(cloudValley, g.mul(cloudLit, g.mix(1, sunGain, sunSide)), t);
  col = g.mix(col, band, bandMix);
  const dist = g.length(rel);
  col = g.mix(col, hazeColor, g.smoothstep(500, 3000, dist));
  return g.build({ color: g.vec(glslLike.srgbToLinear(g, col), 1) });
}

/** The portable cloud-sea material, with the same initial uniform values as `cloudSpec()`. */
export function portableCloudMaterial(): Material {
  return shaderGraph.material({
    graph: cloudSeaGraph(),
    uniforms: {
      cloudPhase: 0, nightMix: 0, hazeColor: [0.8, 0.9, 0.95], sunDir: [0.7, 0.6, 0.4],
      cloudLit: [1, 0.96, 0.9], cloudValley: [0.74, 0.7, 0.86], sunGain: 1, bandMix: 0
    },
    side: "double"
  });
}
