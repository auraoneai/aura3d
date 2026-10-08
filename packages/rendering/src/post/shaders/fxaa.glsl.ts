/**
 * PRD-03 §6.5 — the FXAA finalize shader.
 *
 * `FXAA_185_FRAGMENT_GLSL` is a verbatim port of three r185
 * `node_modules/three/examples/jsm/shaders/FXAAShader.js` (MIT; Jasper Flick's
 * Catlike Coding FXAA, GLSL port by Dave Hoskins — NOT the NVIDIA FXAA 3.11
 * Quality preset 12). It is *not* a fragment inside the present uber-shader:
 * the old `u_hasFxaa` path re-ran `finalColorAt` (the whole tone/grade stack)
 * for every tap, which produced the blur-AA complaint. This program samples a
 * completed LDR image instead.
 *
 * Uniforms: `u_source` (the RGBA8 intermediate), `u_texelSize` (1/source dims,
 * the FXAA tap step), `u_outputTexel` (1/output dims — the base uv, so the
 * present-stage stretch stays intact). `triangularDither` runs on the last
 * write to the 8-bit output (PRD-03 S12).
 */

import { POST_COMMON_GLSL } from "./common.glsl.js";

/**
 * The FXAA function set, shared by the standalone Phase-1 program and the v2
 * fused finalize. `AURA_LUMA_ALPHA` selects the luminance source: `0`
 * recomputes luma per tap from `.rgb` (legacy LDR path, where alpha is
 * coverage), `1` reads the luma the S10b display-grade writes into `.a`
 * (§8.12, so v2 FXAA never re-evaluates the grade).
 */
export const FXAA_185_FNS_GLSL = /* glsl */ `#define EDGE_STEP_COUNT 6
#define EDGE_GUESS 8.0
#define EDGE_STEPS 1.0, 1.5, 2.0, 2.0, 2.0, 4.0
const float edgeSteps[EDGE_STEP_COUNT] = float[EDGE_STEP_COUNT]( EDGE_STEPS );

float _ContrastThreshold = 0.0312;
float _RelativeThreshold = 0.063;
float _SubpixelBlending = 1.0;

#ifndef AURA_FXAA_SAMPLE
#define AURA_FXAA_SAMPLE(tex, uv) texture(tex, uv)
#endif

vec4 Sample( sampler2D tex2D, vec2 uv ) {
  return AURA_FXAA_SAMPLE( tex2D, uv );
}

float SampleLuminance( sampler2D tex2D, vec2 uv ) {
#if AURA_LUMA_ALPHA
  return AURA_FXAA_SAMPLE( tex2D, uv ).a;
#else
  return dot( Sample( tex2D, uv ).rgb, vec3( 0.3, 0.59, 0.11 ) );
#endif
}

float SampleLuminance( sampler2D tex2D, vec2 texSize, vec2 uv, float uOffset, float vOffset ) {
  uv += texSize * vec2(uOffset, vOffset);
  return SampleLuminance(tex2D, uv);
}

struct LuminanceData {
  float m, n, e, s, w;
  float ne, nw, se, sw;
  float highest, lowest, contrast;
};

LuminanceData SampleLuminanceNeighborhood( sampler2D tex2D, vec2 texSize, vec2 uv ) {
  LuminanceData l;
  l.m = SampleLuminance( tex2D, uv );
  l.n = SampleLuminance( tex2D, texSize, uv,  0.0,  1.0 );
  l.e = SampleLuminance( tex2D, texSize, uv,  1.0,  0.0 );
  l.s = SampleLuminance( tex2D, texSize, uv,  0.0, -1.0 );
  l.w = SampleLuminance( tex2D, texSize, uv, -1.0,  0.0 );

  l.ne = SampleLuminance( tex2D, texSize, uv,  1.0,  1.0 );
  l.nw = SampleLuminance( tex2D, texSize, uv, -1.0,  1.0 );
  l.se = SampleLuminance( tex2D, texSize, uv,  1.0, -1.0 );
  l.sw = SampleLuminance( tex2D, texSize, uv, -1.0, -1.0 );

  l.highest = max( max( max( max( l.n, l.e ), l.s ), l.w ), l.m );
  l.lowest = min( min( min( min( l.n, l.e ), l.s ), l.w ), l.m );
  l.contrast = l.highest - l.lowest;
  return l;
}

bool ShouldSkipPixel( LuminanceData l ) {
  float threshold = max( _ContrastThreshold, _RelativeThreshold * l.highest );
  return l.contrast < threshold;
}

float DeterminePixelBlendFactor( LuminanceData l ) {
  float f = 2.0 * ( l.n + l.e + l.s + l.w );
  f += l.ne + l.nw + l.se + l.sw;
  f *= 1.0 / 12.0;
  f = abs( f - l.m );
  f = clamp( f / l.contrast, 0.0, 1.0 );

  float blendFactor = smoothstep( 0.0, 1.0, f );
  return blendFactor * blendFactor * _SubpixelBlending;
}

struct EdgeData {
  bool isHorizontal;
  float pixelStep;
  float oppositeLuminance, gradient;
};

EdgeData DetermineEdge( vec2 texSize, LuminanceData l ) {
  EdgeData e;
  float horizontal =
    abs( l.n + l.s - 2.0 * l.m ) * 2.0 +
    abs( l.ne + l.se - 2.0 * l.e ) +
    abs( l.nw + l.sw - 2.0 * l.w );
  float vertical =
    abs( l.e + l.w - 2.0 * l.m ) * 2.0 +
    abs( l.ne + l.nw - 2.0 * l.n ) +
    abs( l.se + l.sw - 2.0 * l.s );
  e.isHorizontal = horizontal >= vertical;

  float pLuminance = e.isHorizontal ? l.n : l.e;
  float nLuminance = e.isHorizontal ? l.s : l.w;
  float pGradient = abs( pLuminance - l.m );
  float nGradient = abs( nLuminance - l.m );

  e.pixelStep = e.isHorizontal ? texSize.y : texSize.x;

  if (pGradient < nGradient) {
    e.pixelStep = -e.pixelStep;
    e.oppositeLuminance = nLuminance;
    e.gradient = nGradient;
  } else {
    e.oppositeLuminance = pLuminance;
    e.gradient = pGradient;
  }

  return e;
}

float DetermineEdgeBlendFactor( sampler2D tex2D, vec2 texSize, LuminanceData l, EdgeData e, vec2 uv ) {
  vec2 uvEdge = uv;
  vec2 edgeStep;
  if (e.isHorizontal) {
    uvEdge.y += e.pixelStep * 0.5;
    edgeStep = vec2( texSize.x, 0.0 );
  } else {
    uvEdge.x += e.pixelStep * 0.5;
    edgeStep = vec2( 0.0, texSize.y );
  }

  float edgeLuminance = ( l.m + e.oppositeLuminance ) * 0.5;
  float gradientThreshold = e.gradient * 0.25;

  vec2 puv = uvEdge + edgeStep * edgeSteps[0];
  float pLuminanceDelta = SampleLuminance( tex2D, puv ) - edgeLuminance;
  bool pAtEnd = abs( pLuminanceDelta ) >= gradientThreshold;

  for ( int i = 1; i < EDGE_STEP_COUNT && !pAtEnd; i++ ) {
    puv += edgeStep * edgeSteps[i];
    pLuminanceDelta = SampleLuminance( tex2D, puv ) - edgeLuminance;
    pAtEnd = abs( pLuminanceDelta ) >= gradientThreshold;
  }

  if ( !pAtEnd ) {
    puv += edgeStep * EDGE_GUESS;
  }

  vec2 nuv = uvEdge - edgeStep * edgeSteps[0];
  float nLuminanceDelta = SampleLuminance( tex2D, nuv ) - edgeLuminance;
  bool nAtEnd = abs( nLuminanceDelta ) >= gradientThreshold;

  for ( int i = 1; i < EDGE_STEP_COUNT && !nAtEnd; i++ ) {
    nuv -= edgeStep * edgeSteps[i];
    nLuminanceDelta = SampleLuminance( tex2D, nuv ) - edgeLuminance;
    nAtEnd = abs( nLuminanceDelta ) >= gradientThreshold;
  }

  if ( !nAtEnd ) {
    nuv -= edgeStep * EDGE_GUESS;
  }

  float pDistance, nDistance;
  if ( e.isHorizontal ) {
    pDistance = puv.x - uv.x;
    nDistance = uv.x - nuv.x;
  } else {
    pDistance = puv.y - uv.y;
    nDistance = uv.y - nuv.y;
  }

  float shortestDistance;
  bool deltaSign;
  if ( pDistance <= nDistance ) {
    shortestDistance = pDistance;
    deltaSign = pLuminanceDelta >= 0.0;
  } else {
    shortestDistance = nDistance;
    deltaSign = nLuminanceDelta >= 0.0;
  }

  if ( deltaSign == ( l.m - edgeLuminance >= 0.0 ) ) {
    return 0.0;
  }

  return 0.5 - shortestDistance / ( pDistance + nDistance );
}

vec4 ApplyFXAA( sampler2D tex2D, vec2 texSize, vec2 uv ) {
  LuminanceData luminance = SampleLuminanceNeighborhood( tex2D, texSize, uv );
  if ( ShouldSkipPixel( luminance ) ) {
    return Sample( tex2D, uv );
  }

  float pixelBlend = DeterminePixelBlendFactor( luminance );
  EdgeData edge = DetermineEdge( texSize, luminance );
  float edgeBlend = DetermineEdgeBlendFactor( tex2D, texSize, luminance, edge, uv );
  float finalBlend = max( pixelBlend, edgeBlend );

  if (edge.isHorizontal) {
    uv.y += edge.pixelStep * finalBlend;
  } else {
    uv.x += edge.pixelStep * finalBlend;
  }

  return Sample( tex2D, uv );
}
`;

export const FXAA_185_FRAGMENT_GLSL = /* glsl */ `#version 300 es
precision highp float;
#define AURA_LUMA_ALPHA 0
uniform sampler2D u_source;
uniform vec2 u_texelSize;
uniform vec2 u_outputTexel;
out vec4 outColor;

${FXAA_185_FNS_GLSL}

${POST_COMMON_GLSL}

void main() {
  vec2 uv = gl_FragCoord.xy * u_outputTexel;
  vec4 color = ApplyFXAA( u_source, u_texelSize, uv );
  // S12: the triangular-PDF dither belongs to the last write to the 8-bit
  // output — on the legacy present this program IS the last write; on the v2
  // unfused tail S12-finalize follows, so it compiles with AURA_FXAA_NO_DITHER.
  outColor = vec4(color.rgb
#if !defined(AURA_FXAA_NO_DITHER)
    + triangularDither(gl_FragCoord.xy, 0.0)
#endif
    , color.a);
}
`;
