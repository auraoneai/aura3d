/**
 * `prd05.debugView` — C-02 chunk + feature for the look-dev debug views
 * that lane 04's material-channel debug (`prd04.debugView`, C-15) does not
 * cover (PRD-05 §6.7, §8 item 4):
 *
 *   u_prd05DebugView 1 → texel-density heatmap: GLSL `textureSize()` of the
 *     material's base-colour sampler × `fwidth(v_uv)` → texels per screen
 *     pixel, coloured against the G2 band `u_prd05TexelBand` (default
 *     [0.5, 4]): blue = under-dense (blurry), red = over-dense (wasted
 *     mip/VRAM). No `GLTFRenderResources` change — the feature's
 *     `bindUniforms` feeds the existing `u_baseColorTexture` binding into
 *     `a3d_prd05_debugSampler`.
 *   2 → mip level: `textureQueryLod()` heatmap over the same sampler.
 *   3 → facet view: flat world normals from `dFdx/dFdy(v_worldPosition)`.
 *   4 → LOD strip: `u_prd05LodLevel` (stamped from `RenderItem.lodLevel` by
 *     the `prd05.typed-glb-actor-lod` extension) mapped to a per-level hue.
 *
 * Occlusion/base-colour/normal/roughness/metallic/UV views reuse lane 04's
 * `u_prd04DebugView` channels — both features coexist; the look-dev app sets
 * the param for the channel it wants. Activation is the material parameter
 * `u_prd05DebugView` (number), which the look-dev app sets — the
 * pre-declared `debugView` renderer option reaches `u_prd04DebugView` for
 * lane-04 channels; this param carries the prd05-only views so no shared
 * C-15 enum change is needed.
 *
 * The fragment:end body is fully `#ifdef`-gated on the channel defines, so
 * the chunk compiles standalone in the ChunkHarness (which declares none of
 * the material varyings) and only touches varyings (`v_uv`,
 * `v_worldPosition`, `u_baseColorMap`, `u_occlusionMap`) inside programs
 * that declare them.
 */
import type { RenderItem } from "../contracts/renderItem";
import type { ShaderChunk, ShaderFeature } from "../contracts/program";
import type { UniformValue } from "../RenderDevice";

/** `u_prd05DebugView` value → channel define suffix. */
export const PRD05_DEBUG_VIEW_CHANNELS = [
  "TEXEL_DENSITY", "MIP_LEVEL", "FACET", "LOD_LEVEL"
] as const;

export type Prd05DebugViewChannel = "texelDensity" | "mipLevel" | "facet" | "lodLevel";

const CHANNEL_BY_NAME: Readonly<Record<Prd05DebugViewChannel, number>> = {
  texelDensity: 1,
  mipLevel: 2,
  facet: 3,
  lodLevel: 4
};

/** Material-param value for a named channel (what the look-dev app sets). */
export function prd05DebugViewValue(channel: Prd05DebugViewChannel): number {
  return CHANNEL_BY_NAME[channel];
}

export function prd05DebugViewDefineName(value: number): string | undefined {
  const name = PRD05_DEBUG_VIEW_CHANNELS[value - 1];
  return name === undefined ? undefined : `A3D_PRD05_DEBUG_VIEW_${name}`;
}

const glslPars = /* glsl */ `
#if defined(A3D_PRD05_DEBUG_VIEW_TEXEL_DENSITY) || defined(A3D_PRD05_DEBUG_VIEW_MIP_LEVEL) || defined(A3D_PRD05_DEBUG_VIEW_FACET) || defined(A3D_PRD05_DEBUG_VIEW_LOD_LEVEL)
uniform highp sampler2D a3d_prd05_debugSampler;
uniform float u_prd05LodLevel;
uniform vec2 u_prd05TexelBand;

// 0..1 → blue → green → yellow → red heatmap.
vec3 a3dPrd05DebugHeat( float t ) {
	vec3 c = clamp( t, 0.0, 1.0 );
	vec3 cool = mix( vec3( 0.05, 0.1, 0.45 ), vec3( 0.05, 0.55, 0.45 ), clamp( c * 2.0, 0.0, 1.0 ) );
	vec3 hot = mix( vec3( 0.05, 0.55, 0.45 ), vec3( 0.9, 0.12, 0.05 ), clamp( ( c - 0.5 ) * 2.0, 0.0, 1.0 ) );
	return mix( cool, hot, step( 0.5, c ) );
}

// Screen texels/pixel for the bound debug sampler at v_uv.
float a3dPrd05TexelDensity( vec2 uv ) {
	vec2 texSize = vec2( textureSize( a3d_prd05_debugSampler, 0 ) );
	vec2 dudx = dFdx( uv ) * texSize;
	vec2 dudy = dFdy( uv ) * texSize;
	return max( length( dudx ), length( dudy ) );
}
#endif
`;

const wgslPars = /* wgsl */ `
var<private> a3d_prd05_debug_dummy: f32 = 0.0;
// WGSL twin lands with the C-02 webgpu emitter; GLSL is the conformance path.
`;

/** fragment:pars chunk — declares the debug sampler/uniforms + helpers. */
export const debugViewParsChunk: ShaderChunk = {
  name: "a3d_prd05_debug_view",
  owner: "prd05",
  stage: "fragment",
  glsl: glslPars,
  wgsl: wgslPars
};

/**
 * fragment:end body. Entirely inside the channel `#ifdef`s: outside a
 * generated program (ChunkHarness) it is empty, so the chunk compiles even
 * though it names `v_uv`/`v_worldPosition`/`u_baseColorMap`.
 */
export const debugViewEndChunk: ShaderChunk = {
  name: "a3d_prd05_debug_view_end",
  owner: "prd05",
  stage: "fragment",
  requires: ["a3d_prd05_debug_view"],
  glsl: /* glsl */ `
#ifdef A3D_PRD05_DEBUG_VIEW_TEXEL_DENSITY
	#ifdef A3D_NEED_UV0
		a3dColor = a3dPrd05DebugHeat( clamp( ( a3dPrd05TexelDensity( v_uv ) - u_prd05TexelBand.x ) / ( u_prd05TexelBand.y - u_prd05TexelBand.x ), 0.0, 1.0 ) );
	#else
		a3dColor = vec3( 0.4 );
	#endif
#elif defined( A3D_PRD05_DEBUG_VIEW_MIP_LEVEL )
	#ifdef A3D_NEED_UV0
		vec2 a3dPrd05Lod = textureQueryLod( a3d_prd05_debugSampler, v_uv );
		a3dColor = a3dPrd05DebugHeat( clamp( a3dPrd05Lod.x / 8.0, 0.0, 1.0 ) );
	#else
		a3dColor = vec3( 0.4 );
	#endif
#elif defined( A3D_PRD05_DEBUG_VIEW_FACET )
	{
		vec3 a3dPrd05Facet = normalize( cross( dFdx( v_worldPosition ), dFdy( v_worldPosition ) ) );
		a3dColor = a3dPrd05Facet * 0.5 + 0.5;
	}
#elif defined( A3D_PRD05_DEBUG_VIEW_LOD_LEVEL )
	a3dColor = a3dPrd05DebugHeat( clamp( u_prd05LodLevel / 4.0, 0.0, 1.0 ) );
#endif
`,
  wgsl: `// fragment:end splice — WGSL twin lands with the C-02 webgpu emitter.`
};

type ParameterSource = { getParameter(name: string): UniformValue | undefined };

/** Forward-pass feature: active only while a material carries `u_prd05DebugView`. */
export const debugViewFeature: ShaderFeature = {
  id: "prd05.debugView",
  owner: "prd05",
  flag: "A3D_QR_ASSETS_LOOKDEV",
  chunks: ["a3d_prd05_debug_view", "a3d_prd05_debug_view_end"],
  hooks: ["fragment:pars", "fragment:end"],
  select(input) {
    if (input.pass !== "forward") return undefined;
    const material = input.item.material as ParameterSource | undefined;
    const value = material?.getParameter("u_prd05DebugView");
    return typeof value === "number" && prd05DebugViewDefineName(value) !== undefined ? value : undefined;
  },
  defines(value) {
    const name = typeof value === "number" ? prd05DebugViewDefineName(value) : undefined;
    return name === undefined ? {} : { [name]: true };
  },
  bindUniforms(_value, item: RenderItem, set: (name: string, v: UniformValue) => void) {
    const material = item.material as ParameterSource | undefined;
    // The debug sampler mirrors the material's base-colour texture binding.
    const baseColorTexture = material?.getParameter("u_baseColorTexture");
    if (baseColorTexture !== undefined) set("a3d_prd05_debugSampler", baseColorTexture);
    set("u_prd05LodLevel", item.lodLevel ?? 0);
    const band = material?.getParameter("u_prd05TexelBand");
    set("u_prd05TexelBand", band ?? [0.5, 4]);
  }
};
