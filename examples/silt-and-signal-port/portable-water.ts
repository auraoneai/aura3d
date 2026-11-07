/**
 * A4 pilot (b): the world water (`WATER_FRAGMENT` in shaders.ts, both the original look and the GU47 inked look) as a
 * portable shader graph. Selected only by the default-off `?portable=1` flag (world.ts); `waterSpec()` stays the default and
 * the original. The initial uniform values are read from `waterSpec()` itself, so the two materials cannot drift apart, and the
 * per-frame `setUniform("siltTime", ...)` calls drive either one.
 *
 * Mapping (docs/rendering/portable-conversion-pattern.md): `vWorld` -> `positionWorld`; `cameraPosition` -> built-in; GLSL
 * uniforms -> graph uniforms of the same name (color3 -> vec3); `for (int i < 4)` fbm -> unrolled; `if (inkLook > 0.5) {...}` ->
 * both branches evaluated and chosen by `select` (graph control flow cannot sample or branch on uniforms cheaply, and the cost is
 * small); `outColor = vec4(c, alpha)` -> a vec4 colour output with transparent blending on the material.
 */
import { shaderGraph } from "@aura3d/engine/shader-graph-runtime";
import type { material } from "@aura3d/engine";
import { GraphBuilder, glslLike, type Expr } from "../../apps/showcase-port-shared/portable-graph";

type Material = ReturnType<typeof material.custom>;
type CustomSpec = Parameters<typeof material.custom>[0];

export function waterGraph(): ReturnType<GraphBuilder["build"]> {
  const g = new GraphBuilder();
  const waterColor = g.uniform("waterColor", "vec3");
  const siltTime = g.uniform("siltTime", "f32");
  const canalShift = g.uniform("canalShift", "f32");
  const canalHalf = g.uniform("canalHalf", "f32");
  const fogColor = g.uniform("fogColor", "vec3");
  const fogFar = g.uniform("fogFar", "f32");
  const inkLook = g.uniform("inkLook", "f32");
  const sunDir = g.uniform("sunDir", "vec3");
  const sunColor = g.uniform("sunColor", "vec3");
  const inkSky = g.uniform("inkSky", "vec3");
  const inkSkyTop = g.uniform("inkSkyTop", "vec3");
  const vW = g.input("positionWorld", "vec3");
  const cam = g.input("cameraPosition", "vec3");
  const wx = g.swz(vW, "x"), wz = g.swz(vW, "z");
  const vn = glslLike.noise(g);
  // float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
  const fbm = (p0: Expr): Expr => {
    let p = p0, a = 0.5;
    const terms: Expr[] = [];
    for (let i = 0; i < 4; i++) { terms.push(g.mul(a, vn(p))); p = g.add(g.mul(p, 2.03), 17.1); a *= 0.5; }
    return g.sum(terms[0]!, ...terms.slice(1));
  };
  const scaleAdd = (p: Expr, scale: number, add: number): Expr => g.add(g.mul(p, scale), add);

  // roadX(z) = 82 + sin(z * 0.006) * 8
  const roadX = g.add(82, g.mul(g.sin(g.mul(wz, 0.006)), 8));
  const d = g.abs(g.sub(wx, g.sub(roadX, canalShift)));
  const flow = g.vec(g.mul(wx, 0.12), g.add(g.mul(wz, 0.05), g.mul(siltTime, 0.35)));
  const ripple = g.add(g.mul(fbm(g.mul(flow, 3)), 0.6), g.mul(fbm(scaleAdd(flow, 9, 3.7)), 0.4));
  const toCam = g.sub(cam, vW);
  const view = g.normalize(toCam);
  const fres = g.pow(g.sub(1, g.clamp(g.swz(view, "y"), 0, 1)), 3);
  const body = g.mix(g.mul(waterColor, 0.55), g.mul(waterColor, 1.3), ripple);
  const skyTint = g.mix(g.mul(waterColor, 1.7), g.c(0.78, 0.86, 0.9), 0.55);
  let c = g.mix(body, skyTint, g.mul(fres, 0.6));
  const glint = g.pow(g.mul(g.max(0, g.sub(vn(g.add(g.mul(flow, 24), g.mul(siltTime, 0.4))), 0.8)), 5), 2);
  c = g.add(c, g.mul(g.mul(g.c(1, 0.92, 0.78), glint), 0.5));
  const foam = g.mul(g.smoothstep(g.sub(canalHalf, 4.5), g.sub(canalHalf, 1.2), d), g.add(0.45, g.mul(0.55, vn(g.mul(flow, 15)))));
  c = g.mix(c, g.c(0.93, 0.95, 0.9), g.mul(foam, 0.7));

  // GU47 DG-M3 inked look (inkLook > 0.5), computed from the same c/ripple/foam and selected below
  const n = g.normalize(g.vec(g.mul(g.sub(ripple, 0.5), 0.35), 1, g.mul(g.sub(fbm(scaleAdd(flow, 5, 1.3)), 0.5), 0.35)));
  const negView = g.negate(view);
  // GLSL reflect(I, N) = I - 2 * dot(N, I) * N with I = -view
  const r = g.sub(negView, g.mul(g.mul(2, g.dot(n, negView)), n));
  const sd = g.max(0, g.dot(r, g.normalize(sunDir)));
  const spec = g.pow(sd, 420);
  const skyRef = g.mix(inkSky, inkSkyTop, g.smoothstep(0.02, 0.55, g.swz(r, "y")));
  let ink = g.mix(c, skyRef, g.add(0.28, g.mul(fres, 0.5)));
  ink = g.add(ink, g.mul(sunColor, g.add(g.mul(spec, 1.4), g.mul(g.mul(g.pow(sd, 36), 0.32), g.add(0.6, g.mul(0.8, ripple))))));
  const streak = g.smoothstep(0.62, 0.9, vn(g.vec(g.mul(wx, 0.6), g.add(g.mul(wz, 0.02), g.mul(siltTime, 0.9)))));
  ink = g.mix(ink, g.c(0.86, 0.78, 0.62), g.add(g.mul(streak, 0.18), g.mul(foam, 0.12)));
  c = g.select(g.greater(inkLook, 0.5), ink, c);

  const fogT = g.clamp(g.div(g.length(g.sub(vW, cam)), fogFar), 0, 1);
  const alpha = g.mul(0.92, g.sub(1, g.smoothstep(g.sub(canalHalf, 1.2), canalHalf, d)));
  return g.build({ color: g.vec(g.mix(c, fogColor, g.mul(fogT, fogT)), alpha) });
}

/** The portable water material for a `waterSpec()` (same uniforms, same render state). */
export function portableWaterMaterial(spec: CustomSpec): Material {
  const uniforms: Record<string, unknown> = {};
  for (const [name, u] of Object.entries(spec.uniforms ?? {})) uniforms[name] = typeof u === "string" ? undefined : (u as { value: unknown }).value;
  return shaderGraph.material({
    graph: waterGraph(),
    uniforms,
    transparent: spec.transparent === true,
    depthWrite: spec.depthWrite !== false,
    side: spec.side ?? "double"
  });
}
