/**
 * Declared time consumers: scene content whose appearance changes with the render clock
 * (`u_time`) even though the scene declares no timeline, runtime node, animation or frame callback.
 *
 * `shouldContinuouslyRender` (frameLoop.ts) uses this so a static-looking scene whose only motion is
 * a custom shader reading `uTime`, `world.water`, or sky clouds keeps drawing instead of freezing on
 * its first frame. Pure and structural: it reads only snapshot node fields and never touches a renderer.
 *
 * Time use was read per feature before listing it here:
 * - `material.custom` GLSL: `uTime` / `u_time` is bound per draw from the renderer clock (customMaterial.ts prelude).
 * - `world.water` (`kind: "water"`): Gerstner waves and detail normals are evaluated with `timeSeconds` (WaterRuntime.ts), always.
 * - `sky` clouds: `cloudUV += u_time * u_cloudScaleSpeed.y` (sky.glsl.ts); drift multiplier `speed` defaults to 1, `0` is still.
 * - NOT listed: `effects.volumetricFog`: measured on a real GPU with the loop forced on, two frames 3 s apart differ by 0.000 while
 *   the fog is drawn (docs/workflows/render-gate-motion.md, "utime-512 findings"); the effect node cannot set `noiseSpeed` /
 *   `noiseStrength` (default 0), so the fog is time-invariant. Stars (no time term) and `effects.snow` (already animates) are not listed either.
 * - Sky clouds: the production effect system already requests frames for `coverage > 0 && speed > 0`, so the `sky` case here is a
 *   second path to the same decision, not the only one (measured: base loops for such a scene).
 */

interface GlslStages { readonly vertex?: string; readonly fragment?: string }
interface CloudsLike { readonly coverage?: number; readonly speed?: number }

const CLOCK_NAME = /\b(?:uTime|u_time)\b/;
/** The author declared their own clock (the prelude reserves the names, so this only guards odd edits). */
const OWN_CLOCK_DECLARATION = /\b(?:(?:highp|mediump|lowp)\s+)?float\s+(?:uTime|u_time)\b/;

/** True when either GLSL stage names the prelude clock and does not declare its own. */
export function customShaderReadsClock(spec: { readonly glsl?: GlslStages } | undefined): boolean {
  const glsl = spec?.glsl;
  if (!glsl) return false;
  const source = `${glsl.vertex ?? ""}\n${glsl.fragment ?? ""}`;
  return CLOCK_NAME.test(source) && !OWN_CLOCK_DECLARATION.test(source);
}

/** True for a sky spec with a drifting cloud layer (`coverage > 0` and drift `speed !== 0`; speed defaults to 1). */
export function skyHasAnimatedClouds(spec: { readonly clouds?: CloudsLike } | undefined): boolean {
  const clouds = spec?.clouds;
  if (!clouds) return false;
  return typeof clouds.coverage === "number" && clouds.coverage > 0 && clouds.speed !== 0;
}

interface LooseNode {
  readonly kind?: string;
  readonly material?: { readonly kind?: string; readonly custom?: { readonly glsl?: GlslStages } };
  readonly spec?: { readonly clouds?: CloudsLike };
  readonly children?: readonly LooseNode[];
}

/** True when this node (not its children) is a declared time consumer. */
export function nodeConsumesClock(node: LooseNode): boolean {
  switch (node.kind) {
    case "primitive":
      return node.material?.kind === "custom" && customShaderReadsClock(node.material.custom);
    case "water":
      return true;
    case "sky":
      return skyHasAnimatedClouds(node.spec);
    default:
      return false;
  }
}

/** True when any node in the tree (groups included) is a declared time consumer. */
export function sceneConsumesClock(nodes: readonly LooseNode[]): boolean {
  return nodes.some((node) => nodeConsumesClock(node) || (node.children !== undefined && sceneConsumesClock(node.children)));
}
