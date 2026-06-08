import { Material, type RenderState } from "../Material.js";

/**
 * AnimationToonMaterial — a REAL toon / cel material for the Aura3D rendering engine.
 *
 * Unlike `AnimationMaterialStyle` (which is descriptive metadata consumed by nothing),
 * this module defines an actual material that drives a dedicated GLSL program:
 *
 *  - It quantizes the diffuse lighting term (N·L) into a small number of discrete
 *    bands ("ramp steps") instead of smoothly shading — the defining trait of cel
 *    shading.
 *  - It adds a Fresnel-style rim light that brightens silhouette edges.
 *  - It is wired into the engine the same way `PBRMaterial` / `UnlitMaterial` are:
 *    it extends `Material`, references a `shaderKey`, declares a `uniformSchema`, and
 *    seeds `parameters`. The matching shader source is registered into the default
 *    `ShaderLibrary` via `registerAnimationToonShader` (called from
 *    `createDefaultShaderLibrary`), so any renderer that resolves materials through
 *    the shader library can compile and bind this program.
 *
 * WHAT IS WIRED TO PIXELS:
 *  - The TS ramp/quantize math (`quantizeToonBand`, `toonDiffuseRamp`, `toonRimTerm`,
 *    `toonShadeColor`) is pure, tested, and is the exact same math the GLSL fragment
 *    shader performs (mirrored line-for-line). Any renderer that runs the
 *    `aura3d/animation-toon` program gets banded lighting + rim light on real fragments.
 *  - The material's uniforms (band count, rim color/power, light direction, colors)
 *    flow through the standard `Material` parameter system, so they reach the GPU
 *    through whatever uniform-binding path the active `RenderDevice` uses for other
 *    materials.
 *
 * WHAT IS NOT (yet) WIRED:
 *  - The animation shader is a single-directional-light forward program. It does NOT
 *    consume the full `u_lightData[]` array / shadow maps / IBL that the PBR shader
 *    does. It is intentionally a focused NPR program, not a PBR superset.
 *  - Outlines are NOT drawn by this material. Outlines come from the existing Sobel
 *    `outlinePixels()` post-pass, which `applyAnimationRenderPreset` enables separately.
 */

export const ANIMATION_TOON_SHADER_NAME = "aura3d/animation-toon";
export const ANIMATION_TOON_SHADER_MARKER = "@aura3d-shader:animation-toon";

export const ANIMATION_TOON_MIN_BANDS = 2;
export const ANIMATION_TOON_MAX_BANDS = 16;

export interface AnimationToonMaterialOptions {
  readonly name?: string;
  /** Base albedo (RGBA), each channel in [0, 1]. */
  readonly baseColor?: readonly [number, number, number, number];
  /** Number of discrete lighting bands. Integer in [2, 16]. */
  readonly bands?: number;
  /**
   * Ambient floor in [0, 1] — the darkest band is never fully black, so cel art
   * keeps readable shapes in shadow. Multiplies base color in the lowest band.
   */
  readonly shadowFloor?: number;
  /** Direction the key light travels FROM the surface toward the light (world space). */
  readonly lightDirection?: readonly [number, number, number];
  /** Key light color (RGB), each channel in [0, 1]. */
  readonly lightColor?: readonly [number, number, number];
  /** Rim light color (RGB), each channel in [0, 1]. */
  readonly rimColor?: readonly [number, number, number];
  /** Rim falloff exponent (higher = tighter rim). Finite and >= 0. */
  readonly rimPower?: number;
  /** Rim contribution strength in [0, 1]. */
  readonly rimIntensity?: number;
  /** Alpha discard threshold in [0, 1]. */
  readonly alphaCutoff?: number;
  readonly renderState?: Partial<RenderState>;
}

/* ------------------------------------------------------------------------- *
 * Pure ramp / quantize math.
 *
 * These functions are the single source of truth for the toon lighting model.
 * The GLSL fragment shader below performs the identical computation, so testing
 * these functions validates the actual pixel math (modulo float precision).
 * ------------------------------------------------------------------------- */

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * Quantize a continuous lighting term `t` in [0, 1] into one of `bands` discrete
 * levels, returning the band's representative value in [0, 1].
 *
 * With `bands = 4` the output can only be 0, 1/3, 2/3, or 1 — hard stepped shading.
 * This mirrors GLSL `floor(t * bands) / (bands - 1)` clamped so the brightest band
 * reaches full strength.
 */
export function quantizeToonBand(t: number, bands: number): number {
  const steps = Math.max(ANIMATION_TOON_MIN_BANDS, Math.min(ANIMATION_TOON_MAX_BANDS, Math.floor(bands)));
  const clamped = clamp01(t);
  // floor into [0, steps-1], then normalize so the top band maps to exactly 1.
  const level = Math.min(steps - 1, Math.floor(clamped * steps));
  return level / (steps - 1);
}

/**
 * Toon diffuse ramp: take raw N·L (already clamped to [0, 1]), quantize it into
 * bands, then lift the darkest band off zero by `shadowFloor` so shadows stay
 * readable. Returns a multiplier in [shadowFloor, 1].
 */
export function toonDiffuseRamp(ndotl: number, bands: number, shadowFloor: number): number {
  const floor = clamp01(shadowFloor);
  const banded = quantizeToonBand(clamp01(ndotl), bands);
  return floor + (1 - floor) * banded;
}

/**
 * Fresnel-style rim term: bright at grazing angles (N·V small), dark facing the
 * camera. `ndotv` is clamped N·V. Returns rim strength in [0, rimIntensity].
 */
export function toonRimTerm(ndotv: number, rimPower: number, rimIntensity: number): number {
  const power = Number.isFinite(rimPower) && rimPower >= 0 ? rimPower : 2;
  const intensity = clamp01(rimIntensity);
  const fresnel = Math.pow(1 - clamp01(ndotv), power);
  return clamp01(fresnel) * intensity;
}

export interface ToonShadeInputs {
  readonly baseColor: readonly [number, number, number];
  readonly ndotl: number;
  readonly ndotv: number;
  readonly bands: number;
  readonly shadowFloor: number;
  readonly lightColor: readonly [number, number, number];
  readonly rimColor: readonly [number, number, number];
  readonly rimPower: number;
  readonly rimIntensity: number;
}

/**
 * Full toon shade for one fragment: banded diffuse * base * light, plus additive
 * rim. Returns linear RGB (unclamped channels are clamped to [0, 1] for output
 * parity with the shader's final clamp). This is exactly what the GLSL `main()`
 * computes per pixel.
 */
export function toonShadeColor(inputs: ToonShadeInputs): [number, number, number] {
  const ramp = toonDiffuseRamp(inputs.ndotl, inputs.bands, inputs.shadowFloor);
  const rim = toonRimTerm(inputs.ndotv, inputs.rimPower, inputs.rimIntensity);
  const out: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 3; i += 1) {
    const lit = inputs.baseColor[i]! * ramp * inputs.lightColor[i]!;
    const rimContribution = inputs.rimColor[i]! * rim;
    out[i] = clamp01(lit + rimContribution);
  }
  return out;
}

/* ------------------------------------------------------------------------- *
 * GLSL program. The fragment shader mirrors the TS math above.
 * Registered into the default ShaderLibrary by `registerAnimationToonShader`.
 * ------------------------------------------------------------------------- */

export const ANIMATION_TOON_VERTEX_SOURCE = `#version 300 es
// ${ANIMATION_TOON_SHADER_MARKER}
precision highp float;
layout(location = 0) in vec3 a_position;
layout(location = 1) in vec3 a_normal;
layout(location = 4) in vec4 a_color;
uniform mat4 u_modelViewProjection;
uniform mat4 u_modelMatrix;
uniform mat4 u_normalMatrix;
out vec3 v_normal;
out vec3 v_worldPosition;
out vec4 v_vertexColor;
void main() {
  v_normal = mat3(u_normalMatrix) * a_normal;
  v_worldPosition = (u_modelMatrix * vec4(a_position, 1.0)).xyz;
  v_vertexColor = a_color;
  gl_Position = u_modelViewProjection * vec4(a_position, 1.0);
}
`;

export const ANIMATION_TOON_FRAGMENT_SOURCE = `#version 300 es
// ${ANIMATION_TOON_SHADER_MARKER}
precision highp float;
uniform vec4 u_baseColor;
uniform float u_alphaCutoff;
uniform float u_toonBands;
uniform float u_toonShadowFloor;
uniform vec3 u_toonLightDirection;
uniform vec3 u_toonLightColor;
uniform vec3 u_toonRimColor;
uniform float u_toonRimPower;
uniform float u_toonRimIntensity;
uniform vec3 u_cameraPosition;
in vec3 v_normal;
in vec3 v_worldPosition;
in vec4 v_vertexColor;
out vec4 outColor;

// Quantize t in [0,1] into u_toonBands discrete levels — mirrors quantizeToonBand().
float a3dToonQuantize(float t, float bands) {
  float steps = clamp(floor(bands + 0.5), 2.0, 16.0);
  float clamped = clamp(t, 0.0, 1.0);
  float level = min(steps - 1.0, floor(clamped * steps));
  return level / (steps - 1.0);
}

void main() {
  vec3 normal = normalize(v_normal);
  if (!gl_FrontFacing) normal = -normal;
  vec3 lightDir = normalize(u_toonLightDirection);
  vec3 viewDir = normalize(u_cameraPosition - v_worldPosition);

  float ndotl = max(dot(normal, lightDir), 0.0);
  float ndotv = clamp(dot(normal, viewDir), 0.0, 1.0);

  // Banded diffuse ramp lifted off zero by the shadow floor — mirrors toonDiffuseRamp().
  float floorTerm = clamp(u_toonShadowFloor, 0.0, 1.0);
  float banded = a3dToonQuantize(ndotl, u_toonBands);
  float ramp = floorTerm + (1.0 - floorTerm) * banded;

  // Fresnel rim — mirrors toonRimTerm().
  float rim = clamp(pow(1.0 - ndotv, max(u_toonRimPower, 0.0)), 0.0, 1.0) * clamp(u_toonRimIntensity, 0.0, 1.0);

  vec3 base = u_baseColor.rgb * v_vertexColor.rgb;
  vec3 lit = base * ramp * u_toonLightColor;
  vec3 color = clamp(lit + u_toonRimColor * rim, 0.0, 1.0);

  float alpha = u_baseColor.a * v_vertexColor.a;
  if (alpha < u_alphaCutoff) discard;
  outColor = vec4(color, alpha);
}
`;

/**
 * Register the animation toon shader program into a ShaderLibrary-like object.
 * Typed structurally to avoid an import cycle with ShaderLibrary; the real
 * `ShaderLibrary.register` matches this signature.
 */
export interface AnimationToonShaderRegistrar {
  register(shader: {
    readonly name: string;
    readonly marker: string;
    readonly vertex: string;
    readonly fragment: string;
  }): void;
}

export function registerAnimationToonShader(library: AnimationToonShaderRegistrar): void {
  library.register({
    name: ANIMATION_TOON_SHADER_NAME,
    marker: ANIMATION_TOON_SHADER_MARKER,
    vertex: ANIMATION_TOON_VERTEX_SOURCE,
    fragment: ANIMATION_TOON_FRAGMENT_SOURCE
  });
}

function identityMatrix(): Float32Array {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

function validateUnit(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`AnimationToonMaterial ${label} must be finite and within [0, 1]`);
  }
}

function validateColor4(value: readonly number[], label: string): void {
  if (value.length !== 4 || value.some((c) => !Number.isFinite(c) || c < 0 || c > 1)) {
    throw new RangeError(`AnimationToonMaterial ${label} must contain four finite values in [0, 1]`);
  }
}

function validateColor3(value: readonly number[], label: string): void {
  if (value.length !== 3 || value.some((c) => !Number.isFinite(c) || c < 0 || c > 1)) {
    throw new RangeError(`AnimationToonMaterial ${label} must contain three finite values in [0, 1]`);
  }
}

function validateFiniteVec3(value: readonly number[], label: string): void {
  if (value.length !== 3 || value.some((c) => !Number.isFinite(c))) {
    throw new RangeError(`AnimationToonMaterial ${label} must contain three finite values`);
  }
}

export class AnimationToonMaterial extends Material {
  constructor(options: AnimationToonMaterialOptions = {}) {
    const baseColor = options.baseColor ?? [0.92, 0.58, 0.16, 1];
    const lightDirection = options.lightDirection ?? [0.3, 0.8, 0.5];
    const lightColor = options.lightColor ?? [1, 1, 1];
    const rimColor = options.rimColor ?? [0.6, 0.7, 1];
    const bands = options.bands ?? 4;
    const shadowFloor = options.shadowFloor ?? 0.35;
    const rimPower = options.rimPower ?? 3;
    const rimIntensity = options.rimIntensity ?? 0.5;
    const alphaCutoff = options.alphaCutoff ?? 0;

    validateColor4(baseColor, "baseColor");
    validateFiniteVec3(lightDirection, "lightDirection");
    if (Math.hypot(...lightDirection) <= 0) {
      throw new RangeError("AnimationToonMaterial lightDirection must be non-zero");
    }
    validateColor3(lightColor, "lightColor");
    validateColor3(rimColor, "rimColor");
    if (!Number.isInteger(bands) || bands < ANIMATION_TOON_MIN_BANDS || bands > ANIMATION_TOON_MAX_BANDS) {
      throw new RangeError(
        `AnimationToonMaterial bands must be an integer in [${ANIMATION_TOON_MIN_BANDS}, ${ANIMATION_TOON_MAX_BANDS}]`
      );
    }
    validateUnit(shadowFloor, "shadowFloor");
    if (!Number.isFinite(rimPower) || rimPower < 0) {
      throw new RangeError("AnimationToonMaterial rimPower must be finite and non-negative");
    }
    validateUnit(rimIntensity, "rimIntensity");
    validateUnit(alphaCutoff, "alphaCutoff");

    super({
      name: options.name ?? "animation-toon",
      shaderKey: ANIMATION_TOON_SHADER_NAME,
      renderState: options.renderState,
      parameters: {
        u_baseColor: baseColor,
        u_alphaCutoff: alphaCutoff,
        u_toonBands: bands,
        u_toonShadowFloor: shadowFloor,
        u_toonLightDirection: lightDirection,
        u_toonLightColor: lightColor,
        u_toonRimColor: rimColor,
        u_toonRimPower: rimPower,
        u_toonRimIntensity: rimIntensity,
        u_cameraPosition: [0, 0, 0],
        u_modelViewProjection: identityMatrix(),
        u_modelMatrix: identityMatrix(),
        u_normalMatrix: identityMatrix()
      },
      requiredAttributes: ["a_position", "a_normal"],
      uniformSchema: [
        { name: "u_baseColor", kind: "vec4" },
        { name: "u_alphaCutoff", kind: "float" },
        { name: "u_toonBands", kind: "float" },
        { name: "u_toonShadowFloor", kind: "float" },
        { name: "u_toonLightDirection", kind: "vec3" },
        { name: "u_toonLightColor", kind: "vec3" },
        { name: "u_toonRimColor", kind: "vec3" },
        { name: "u_toonRimPower", kind: "float" },
        { name: "u_toonRimIntensity", kind: "float" },
        { name: "u_cameraPosition", kind: "vec3" },
        { name: "u_modelViewProjection", kind: "mat4" },
        { name: "u_modelMatrix", kind: "mat4" },
        { name: "u_normalMatrix", kind: "mat4" }
      ]
    });
  }

  set baseColor(value: readonly [number, number, number, number]) {
    validateColor4(value, "baseColor");
    this.setParameter("u_baseColor", value);
  }

  get baseColor(): readonly [number, number, number, number] {
    return this.getParameter("u_baseColor") as readonly [number, number, number, number];
  }

  set bands(value: number) {
    if (!Number.isInteger(value) || value < ANIMATION_TOON_MIN_BANDS || value > ANIMATION_TOON_MAX_BANDS) {
      throw new RangeError(
        `AnimationToonMaterial bands must be an integer in [${ANIMATION_TOON_MIN_BANDS}, ${ANIMATION_TOON_MAX_BANDS}]`
      );
    }
    this.setParameter("u_toonBands", value);
  }

  get bands(): number {
    return this.getParameter("u_toonBands") as number;
  }

  set shadowFloor(value: number) {
    validateUnit(value, "shadowFloor");
    this.setParameter("u_toonShadowFloor", value);
  }

  get shadowFloor(): number {
    return this.getParameter("u_toonShadowFloor") as number;
  }

  set rimIntensity(value: number) {
    validateUnit(value, "rimIntensity");
    this.setParameter("u_toonRimIntensity", value);
  }

  get rimIntensity(): number {
    return this.getParameter("u_toonRimIntensity") as number;
  }
}
