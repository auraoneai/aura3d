import{av as rr,aw as $e,ax as ir,R as Q,ay as or,az as ar,aA as Nt,aB as nr,aC as Me,aD as Lt,aE as Et,aF as ot,aG as at,aH as yt,aI as cr,aJ as sr,aK as Ft,aL as Tt,aM as ur,aN as lr,aO as ke,aP as We,aj as Ht,aQ as qe,aR as Gt,aS as bt,aT as wt,aU as At,at as fr,aV as dr,Q as mr}from"./aura-Df1rjXw9.js";import{aW as qi}from"./aura-Df1rjXw9.js";import{assertExpectedPreviousDepthBindingsCurrent as Bt}from"./TemporalHistory-D54JrPBL.js";import"./harness-Bz_nXkdg.js";const zi=`#version 300 es
precision highp float;
uniform sampler2D u_hdr;
uniform vec2 u_texelSize;
uniform float u_threshold;
uniform float u_knee;          // kneeRatio * threshold
uniform vec3 u_tint;
uniform float u_clampLuminance;
in vec2 v_uv;
out vec4 outColor;

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

// One 2x2 box sample averaged at bilinear footprint centre.
vec3 box4(vec2 uv, vec2 halfTexel) {
  vec3 s = texture(u_hdr, uv + vec2(-halfTexel.x, -halfTexel.y)).rgb;
  s += texture(u_hdr, uv + vec2(halfTexel.x, -halfTexel.y)).rgb;
  s += texture(u_hdr, uv + vec2(-halfTexel.x, halfTexel.y)).rgb;
  s += texture(u_hdr, uv + vec2(halfTexel.x, halfTexel.y)).rgb;
  return s * 0.25;
}

void main() {
  // Jimenez 2014 13-tap as five overlapping boxes; Karis weight per box.
  vec2 halfTexel = u_texelSize * 0.5;
  vec3 centre = box4(v_uv, halfTexel);
  vec3 c = centre * (0.5 / (1.0 + luma(centre)));
  vec2 corner = u_texelSize + halfTexel;
  vec3 b;
  b = box4(v_uv + vec2(-corner.x, -corner.y) * 0.5, halfTexel);
  c += b * (0.125 / (1.0 + luma(b)));
  b = box4(v_uv + vec2(corner.x, -corner.y) * 0.5, halfTexel);
  c += b * (0.125 / (1.0 + luma(b)));
  b = box4(v_uv + vec2(-corner.x, corner.y) * 0.5, halfTexel);
  c += b * (0.125 / (1.0 + luma(b)));
  b = box4(v_uv + vec2(corner.x, corner.y) * 0.5, halfTexel);
  c += b * (0.125 / (1.0 + luma(b)));

  c = min(c, vec3(u_clampLuminance));           // firefly clamp
  float br = max(c.r, max(c.g, c.b));           // max channel (Unity/UE)
  float knee = u_threshold * u_knee;
  float soft = clamp(br - u_threshold + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee + 1e-5);
  float w = max(soft, br - u_threshold) / max(br, 1e-5);
  outColor = vec4(c * w * u_tint, 1.0);
}
`,Mi=`#version 300 es
precision highp float;
uniform sampler2D u_src;
uniform vec2 u_texelSize;
in vec2 v_uv;
out vec4 outColor;

vec3 box4(vec2 uv, vec2 halfTexel) {
  vec3 s = texture(u_src, uv + vec2(-halfTexel.x, -halfTexel.y)).rgb;
  s += texture(u_src, uv + vec2(halfTexel.x, -halfTexel.y)).rgb;
  s += texture(u_src, uv + vec2(-halfTexel.x, halfTexel.y)).rgb;
  s += texture(u_src, uv + vec2(halfTexel.x, halfTexel.y)).rgb;
  return s * 0.25;
}

void main() {
  vec2 halfTexel = u_texelSize * 0.5;
  vec3 c = box4(v_uv, halfTexel) * 0.5;
  vec2 corner = u_texelSize + halfTexel;
  c += box4(v_uv + vec2(-corner.x, -corner.y) * 0.5, halfTexel) * 0.125;
  c += box4(v_uv + vec2(corner.x, -corner.y) * 0.5, halfTexel) * 0.125;
  c += box4(v_uv + vec2(-corner.x, corner.y) * 0.5, halfTexel) * 0.125;
  c += box4(v_uv + vec2(corner.x, corner.y) * 0.5, halfTexel) * 0.125;
  outColor = vec4(c, 1.0);
}
`,ki=`#version 300 es
precision highp float;
uniform sampler2D u_lower;      // up_{i+1}
uniform sampler2D u_current;    // down_i
uniform vec2 u_lowerTexel;
uniform float u_scatter;        // radiusTexels
in vec2 v_uv;
out vec4 outColor;

// 9-tap tent (3x3 tent kernel, weights 1-2-1 separable).
vec3 tent9(sampler2D tex, vec2 uv, vec2 radiusTexels) {
  vec2 r = radiusTexels;
  vec3 s = texture(tex, uv + vec2(-r.x, -r.y)).rgb * 1.0;
  s += texture(tex, uv + vec2(0.0, -r.y)).rgb * 2.0;
  s += texture(tex, uv + vec2(r.x, -r.y)).rgb * 1.0;
  s += texture(tex, uv + vec2(-r.x, 0.0)).rgb * 2.0;
  s += texture(tex, uv).rgb * 4.0;
  s += texture(tex, uv + vec2(r.x, 0.0)).rgb * 2.0;
  s += texture(tex, uv + vec2(-r.x, r.y)).rgb * 1.0;
  s += texture(tex, uv + vec2(0.0, r.y)).rgb * 2.0;
  s += texture(tex, uv + vec2(r.x, r.y)).rgb * 1.0;
  return s / 16.0;
}

void main() {
  // up_i = down_i + tent(up_{i+1})
  outColor = vec4(texture(u_current, v_uv).rgb + tent9(u_lower, v_uv, u_lowerTexel * u_scatter), 1.0);
}
`,Oi=`#version 300 es
precision highp float;
uniform sampler2D u_hdr;
uniform sampler2D u_bloom;
uniform float u_exposure;
uniform float u_autoExposure;
uniform float u_bloomIntensity;
uniform float u_caIntensity;
uniform vec3 u_whiteBalance;      // Bradford-cone LMS gain, resolved per temperature/tint
uniform vec3 u_lift;
uniform vec3 u_gamma;
uniform vec3 u_gain;
uniform vec3 u_shadows;
uniform vec3 u_midtones;
uniform vec3 u_highlights;
uniform int u_hasBloom;
in vec2 v_uv;
out vec4 outColor;

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

void main() {
  vec2 centre = v_uv - 0.5;
  vec2 dir = centre * dot(centre, centre) * u_caIntensity;
  vec3 c;
  if (u_caIntensity != 0.0) {
    c = vec3(
      texture(u_hdr, v_uv - dir).r,
      texture(u_hdr, v_uv).g,
      texture(u_hdr, v_uv + dir).b);
  } else {
    c = texture(u_hdr, v_uv).rgb;
  }
  c *= u_exposure * u_autoExposure;
  if (u_hasBloom != 0) {
    c += texture(u_bloom, v_uv).rgb * u_bloomIntensity;
  }

  // Linear grade — Bradford CAT already folded into u_whiteBalance on CPU.
  c *= u_whiteBalance;
  // lift / gamma / gain (ASC-CDL style), per channel.
  vec3 safeGamma = max(u_gamma, vec3(1e-3));
  c = pow(max(c * u_gain + u_lift, vec3(0.0)), vec3(1.0) / safeGamma);
  // Shadows/midtones/highlights from the luma pivot at 0.18.
  float s = clamp(log2(max(luma(c), 1e-6) / 0.18) / 8.0 + 0.5, 0.0, 1.0);
  c *= u_shadows * (1.0 - s) * (1.0 - s)
     + u_midtones * 2.0 * s * (1.0 - s)
     + u_highlights * s * s;

  outColor = vec4(c, texture(u_hdr, v_uv).a);
}
`,vr=`#version 300 es
precision highp float;
uniform sampler2D u_hdr;
uniform float u_caIntensity;
in vec2 v_uv;
out vec4 outColor;

void main() {
  vec2 centre = v_uv - 0.5;
  vec2 dir = centre * dot(centre, centre) * u_caIntensity;
  if (u_caIntensity != 0.0) {
    outColor = vec4(
      texture(u_hdr, v_uv - dir).r,
      texture(u_hdr, v_uv).g,
      texture(u_hdr, v_uv + dir).b,
      texture(u_hdr, v_uv).a);
  } else {
    outColor = texture(u_hdr, v_uv);
  }
}
`,Vt=`uniform int u_lutLattice;
uniform float u_lutBypass;
vec3 a3dDisplayLut(vec3 disp) {
  vec3 lutCoord = clamp(disp, 0.0, 1.0);
  if (u_lutLattice != 0) {
    vec3 lutSize = vec3(textureSize(u_lut3d, 0));
    lutCoord = lutCoord * ((lutSize - 1.0) / lutSize) + 0.5 / lutSize;
  }
  return mix(texture(u_lut3d, lutCoord).rgb, disp, u_lutBypass);
}
`,hr=`#version 300 es
precision highp float;
// GLSL ES 3.00 has no default precision for sampler3D (CI: "'sampler3D' : No precision specified").
precision highp sampler3D;
uniform sampler2D u_source;
uniform sampler3D u_lut3d;
uniform int u_hasLut;
uniform float u_vignetteIntensity;
uniform float u_vignetteSmoothness;
uniform float u_vignetteRoundness;
uniform vec3 u_vignetteColor;
uniform vec2 u_resolution;
in vec2 v_uv;
out vec4 outColor;

${Vt}
void main() {
  vec4 source = texture(u_source, v_uv);
  vec3 disp = source.rgb;
  if (u_hasLut != 0) {
    disp = a3dDisplayLut(disp);
  }
  if (u_vignetteIntensity > 0.0) {
    // §8.12: roundness-aspect corrected len, mix toward vignetteColor.
    vec2 p = (v_uv - 0.5) * 2.0;
    p.x *= (u_resolution.x / u_resolution.y) * u_vignetteRoundness;
    float len = length(p) * u_vignetteIntensity;
    disp *= mix(vec3(1.0), u_vignetteColor, pow(clamp(len, 0.0, 1.0), u_vignetteSmoothness));
  }
  outColor = vec4(disp, source.a);
}
`,Ni=`#version 300 es
precision highp float;
// GLSL ES 3.00 has no default precision for sampler3D (CI: "'sampler3D' : No precision specified").
precision highp sampler3D;
uniform sampler3D u_userLut;
uniform int u_hasUserLut;
uniform float u_lutIntensity;
uniform float u_contrast;
uniform float u_saturation;
uniform float u_vibrance;
uniform float u_slice;          // b texel, [0,1]
in vec2 v_uv;
out vec4 outColor;

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

void main() {
  vec3 disp = vec3(v_uv, u_slice);
  // Contrast, pivot 0.5 — same shape as the legacy present grade.
  vec3 graded = clamp(disp * u_contrast + vec3(0.5 - 0.5 * u_contrast), 0.0, 1.0);
  // Vibrance: boost scales with distance from luma, folded into saturation
  // (verbatim from the legacy present grade).
  float l = luma(graded);
  float distanceFromLuma = min(1.0, abs(graded.r - l) + abs(graded.g - l) + abs(graded.b - l));
  float sat = u_saturation + (u_vibrance == 0.0 ? 0.0 : u_vibrance * (1.0 - distanceFromLuma));
  graded = clamp(vec3(l) + (graded - vec3(l)) * sat, 0.0, 1.0);
  if (u_hasUserLut != 0) {
    graded = mix(graded, texture(u_userLut, graded).rgb, clamp(u_lutIntensity, 0.0, 1.0));
  }
  outColor = vec4(graded, 1.0);
}
`,$t=`
float luma709(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

vec3 rcas(sampler2D tex, vec2 uv, vec2 texel, float sharpness) {
  // Weight neighboring straight colors by opacity before sharpening, so
  // invisible RGB does not create a colored fringe at transparent edges.
  vec4 e = texture(tex, uv);
  vec4 south = texture(tex, uv + vec2(0.0, -texel.y));
  vec4 north = texture(tex, uv + vec2(0.0, texel.y));
  vec4 west = texture(tex, uv + vec2(-texel.x, 0.0));
  vec4 east = texture(tex, uv + vec2(texel.x, 0.0));
  float alphaSum = south.a + north.a + west.a + east.a;
  vec3 cross = alphaSum > 1e-8
    ? (south.rgb * south.a + north.rgb * north.a + west.rgb * west.a + east.rgb * east.a) / alphaSum
    : e.rgb;
  float sharp = min(sharpness, 0.25);
  return clamp(e.rgb + (e.rgb - cross) * sharp, 0.0, 1.0);
}

float filmGrain(vec2 fragCoord, float frame, float intensity, float size, float luminanceResponse, float lumaValue) {
  uvec2 seed = uvec2(fragCoord * size) + uvec2(uint(frame) * 747796405u);
  vec2 rnd = vec2(pcg2d(seed)) / 4294967296.0;
  return (rnd.x - 0.5) * intensity * mix(1.0, 1.0 - lumaValue, luminanceResponse);
}
`,pr=`#version 300 es
precision highp float;
uniform sampler2D u_source;
uniform vec2 u_texelSize;
uniform float u_frame;
uniform float u_grainIntensity;
uniform float u_grainSize;
uniform float u_grainLuminanceResponse;
uniform float u_rcasSharpness;    // 0 disables; FSR1 limit 0.25
uniform int u_outputAlphaMode;    // 0 straight, 1 opaque, 2 premultiplied
in vec2 v_uv;
out vec4 outColor;

${$e}
${$t}

void main() {
  vec4 source = texture(u_source, v_uv);
  vec3 disp = u_rcasSharpness > 0.0
    ? rcas(u_source, v_uv, u_texelSize, u_rcasSharpness)
    : source.rgb;
  disp += filmGrain(gl_FragCoord.xy, u_frame, u_grainIntensity, u_grainSize, u_grainLuminanceResponse, luma709(disp));
  disp += triangularDither(gl_FragCoord.xy, u_frame);
  vec4 result = vec4(clamp(disp, 0.0, 1.0), source.a);
  if (u_outputAlphaMode == 1) result.a = 1.0;
  if (u_outputAlphaMode == 2) result.rgb *= result.a;
  outColor = result;
}
`,_r=`#version 300 es
precision highp float;
uniform sampler2D u_source;
uniform float u_frame;
uniform int u_ditherEnabled;
uniform int u_outputAlphaMode; // 0 straight, 1 opaque, 2 premultiplied
in vec2 v_uv;
out vec4 outColor;

${$e}

void main() {
  vec4 source = texture(u_source, v_uv);
  vec3 encoded = source.rgb;
  if (u_ditherEnabled != 0) encoded += triangularDither(gl_FragCoord.xy, u_frame);
  vec4 result = vec4(clamp(encoded, 0.0, 1.0), source.a);
  if (u_outputAlphaMode == 1) result.a = 1.0;
  if (u_outputAlphaMode == 2) result.rgb *= result.a;
  outColor = result;
}
`,gr=`#version 300 es
precision highp float;
// GLSL ES 3.00 has no default precision for sampler3D (CI: "'sampler3D' : No precision specified").
precision highp sampler3D;
#define AURA_LUMA_ALPHA 0
uniform sampler2D u_source;
uniform sampler3D u_lut3d;
uniform int u_hasLut;
uniform vec2 u_texelSize;
uniform vec2 u_outputTexel;
uniform float u_frame;
uniform float u_grainIntensity;
uniform float u_grainSize;
uniform float u_grainLuminanceResponse;
uniform float u_vignetteIntensity;
uniform float u_vignetteSmoothness;
uniform float u_vignetteRoundness;
uniform int u_outputAlphaMode;
uniform vec3 u_vignetteColor;
uniform vec2 u_resolution;
in vec2 v_uv;
out vec4 outColor;

// S10b inline: the FXAA taps sample the display-graded source — each tap is
// one LUT fetch + vignette, not a re-run of the analytic grade. Forward
// declaration so the AURA_FXAA_SAMPLE hook (inside FXAA_185_FNS_GLSL) resolves.
vec4 sampleGraded(sampler2D tex, vec2 uv);
#define AURA_FXAA_SAMPLE(tex, uvSample) sampleGraded(tex, uvSample)

${rr}

${$e}
${$t}
${Vt}
vec4 sampleGraded(sampler2D tex, vec2 uv) {
  vec4 c = texture(tex, uv);
  vec3 disp = c.rgb;
  if (u_hasLut != 0) {
    disp = a3dDisplayLut(disp);
  }
  if (u_vignetteIntensity > 0.0) {
    vec2 p = (uv - 0.5) * 2.0;
    p.x *= (u_resolution.x / u_resolution.y) * u_vignetteRoundness;
    float len = length(p) * u_vignetteIntensity;
    disp *= mix(vec3(1.0), u_vignetteColor, pow(clamp(len, 0.0, 1.0), u_vignetteSmoothness));
  }
  return vec4(disp, c.a);
}

void main() {
  vec2 uv = gl_FragCoord.xy * u_outputTexel;
  vec4 color = ApplyFXAA(u_source, u_texelSize, uv);
  vec3 disp = color.rgb;
  disp += filmGrain(gl_FragCoord.xy, u_frame, u_grainIntensity, u_grainSize, u_grainLuminanceResponse, luma709(disp));
  disp += triangularDither(gl_FragCoord.xy, u_frame);
  vec4 result = vec4(clamp(disp, 0.0, 1.0), color.a);
  if (u_outputAlphaMode == 1) result.a = 1.0;
  if (u_outputAlphaMode == 2) result.rgb *= result.a;
  outColor = result;
}
`;function Ut(e){return`${e.width}x${e.height}:${e.format}:${e.samples}:${e.depth?1:0}`}class xr{constructor(t,r){this.device=t,this.backingPool=ir.get(r)(t);const i=t;this.unsubscribeLoss=i.onDeviceLost?.(()=>{try{this.retireCached()}catch{}})}device;free=new Map;live=new Map;backingLeases=new Map;retiredBacking=new Set;releasingBacking=new Set;failedReleaseTokens=new Map;leaseBackedTargets=new WeakSet;explicitLeases=new WeakMap;encodedLeaseRevokers=new Map;allocations=0;generation=0;disposed=!1;cleanup;unsubscribed=!1;backingPool;unsubscribeLoss;pool(){return this.backingPool}get allocationCount(){return this.allocations}acquire(t){return this.acquireTracked(t,"legacy").target}acquireLease(t){const{target:r,token:i}=this.acquireTracked(t,"token");return this.createLease(r,i)}claimLease(t){const r=this.claimLeaseIfOwned(t);if(!r)throw new Q("Cannot claim a post target that is not a live target-only acquisition","INVALID_RESOURCE");return r}claimLeaseIfOwned(t){const r=this.live.get(t);if(r){if(r.kind!=="legacy")throw new Q("Cannot claim a post target that is not a live target-only acquisition","INVALID_RESOURCE");return this.live.set(t,{token:r.token,kind:"token"}),this.createLease(t,r.token)}}transferLeaseToLegacy(t){const r=this.explicitLeases.get(t),i=r&&this.live.get(r.target);if(!r||i?.kind!=="token"||i.token!==r.token)throw new Q("Cannot transfer a stale or foreign post target lease","INVALID_RESOURCE");return this.revokeEncodedLease(r.token),this.explicitLeases.delete(t),this.live.set(r.target,{token:Symbol("post-target-legacy"),kind:"legacy"}),r.target}createLease(t,r){const i={target:t,release:()=>this.releaseToken(t,r)};if(this.explicitLeases.set(i,{target:t,token:r}),this.leaseBackedTargets.has(t)){const o=or(i,this.device,t,()=>{const a=this.live.get(t);return!this.disposed&&a?.kind==="token"&&a.token===r});this.encodedLeaseRevokers.set(r,o)}return i}acquireTracked(t,r){if(this.disposed||this.device.disposed)throw new Q("Cannot acquire post resources from a disposed owner or device","DISPOSED_DEVICE");const i=this.device;if(this.device.contextLost||i.isDeviceLost?.()===!0)throw this.retireCached(),new Q("Cannot acquire post resources while the device is lost","CONTEXT_LOST");const o=this.generation,a=Ut(t),u=this.free.get(a);for(;u&&u.length>0;){const Z=u.pop();if(Z.disposed){this.releaseBacking(Z);const ae=this.acquisitionFailure(o);if(ae)throw ae;continue}const k=this.acquisitionFailure(o);if(k)throw k;const te=Symbol("post-target-lease");return this.live.set(Z,{token:te,kind:r}),{target:Z,token:te}}const c=this.acquisitionFailure(o);if(c)throw c;const s=this.pool(),n=s.acquireLease,h={width:t.width,height:t.height,format:t.format,samples:t.samples,depth:t.depth},T=typeof n=="function"?n.call(s,h):ar(s,h),E=T.target;this.allocations+=1,this.backingLeases.set(E,T);const L=this.acquisitionFailure(o);if(L){try{this.releaseBacking(E)}catch{}throw L}typeof n=="function"&&this.leaseBackedTargets.add(E);const G=Symbol("post-target-lease");return this.live.set(E,{token:G,kind:r}),{target:E,token:G}}acquisitionFailure(t){if(this.disposed||this.device.disposed)return new Q("Cannot acquire post resources from a disposed owner or device","DISPOSED_DEVICE");const r=this.device;if(this.device.contextLost||r.isDeviceLost?.()===!0)return new Q("Cannot acquire post resources while the device is lost","CONTEXT_LOST");if(t!==this.generation)return new Q("Cannot acquire post resources after the owner was invalidated","INVALID_RESOURCE")}release(t){const r=this.live.get(t);r?.kind==="legacy"?this.releaseToken(t,r.token):this.failedReleaseTokens.get(t)?.kind==="legacy"&&this.releaseBacking(t)}releaseToken(t,r){const i=this.live.get(t);if(i?.token!==r){this.failedReleaseTokens.get(t)?.token===r&&this.releaseBacking(t);return}if(this.revokeEncodedLease(r),this.live.delete(t),t.disposed){this.failedReleaseTokens.set(t,i),this.releaseBacking(t);return}const o=this.keyForTarget(t),a=this.free.get(o)??[];a.push(t),this.free.set(o,a)}releaseAll(){const t=[...this.live],r=[...this.failedReleaseTokens];this.withCleanup("Post resource release failed",i=>{for(const[o,a]of t)if(a.kind==="legacy")try{this.releaseToken(o,a.token)}catch(u){i.errors.push(u)}for(const[o,a]of r)a.kind==="legacy"&&this.failedReleaseTokens.get(o)?.token===a.token&&this.attemptBacking(i,o)})}resize(t,r){this.generation+=1;const i=new Set;for(const[o,a]of this.free){const[u,c]=o.split(":")[0].split("x").map(Number);if(u!==t||c!==r){this.free.delete(o);for(const s of a)i.add(s)}}for(const[o,a]of[...this.live]){const[u,c]=this.keyForTarget(o).split(":")[0].split("x").map(Number);(u!==t||c!==r)&&(this.revokeEncodedLease(a.token),this.live.delete(o),i.add(o))}for(const o of this.retiredBacking)(o.width!==t||o.height!==r)&&i.add(o);for(const o of i)this.failedReleaseTokens.delete(o),this.retiredBacking.add(o);this.withCleanup("Post resource resize failed",o=>{for(const a of i)this.attemptBacking(o,a)})}trim(t){this.pool().trim(t)}dispose(){this.disposed=!0,this.withCleanup("Post resources disposal failed",t=>{const r=this.detachCached();if(!this.unsubscribed&&!t.unsubscribeAttempted){t.unsubscribeAttempted=!0;try{this.unsubscribeLoss?.(),this.unsubscribed=!0}catch(i){t.errors.push(i)}}for(const i of r)this.attemptBacking(t,i)})}retireCached(){this.withCleanup("Post resource release failed",t=>this.retireCachedInto(t))}retireCachedInto(t){const r=this.detachCached();for(const i of r)this.attemptBacking(t,i)}detachCached(){this.generation+=1;const t=[...this.backingLeases.keys()];for(const r of this.encodedLeaseRevokers.values())r();this.encodedLeaseRevokers.clear(),this.free.clear(),this.live.clear();for(const r of t)this.failedReleaseTokens.delete(r),this.retiredBacking.add(r);return t}attemptBacking(t,r){try{this.releaseBacking(r)}catch(i){t.errors.push(i)}}releaseBacking(t){const r=this.backingLeases.get(t);if(!(!r||this.cleanup?.attempted.has(t))&&(this.cleanup?.attempted.add(t),!this.releasingBacking.has(t))){this.retiredBacking.add(t),this.releasingBacking.add(t);try{r.release(),this.backingLeases.get(t)===r&&(this.backingLeases.delete(t),this.leaseBackedTargets.delete(t),this.retiredBacking.delete(t),this.failedReleaseTokens.delete(t))}finally{this.releasingBacking.delete(t)}}}withCleanup(t,r){const i=!this.cleanup,o=this.cleanup??{attempted:new Set,errors:[],unsubscribeAttempted:!1};this.cleanup=o;try{r(o)}finally{i&&(this.cleanup=void 0)}if(i&&o.errors.length)throw new AggregateError(o.errors,t)}revokeEncodedLease(t){const r=this.encodedLeaseRevokers.get(t);r&&(this.encodedLeaseRevokers.delete(t),r())}keyForTarget(t){const r=t.sampleCount??1,i=t.depthTexture!==void 0||t.depthTextureHandle!=null||t.depthHandle!=null;return Ut({width:t.width,height:t.height,format:t.colorTexture.format,samples:r,depth:i})}}const vt=`#version 300 es
precision highp float;
`,jt=`
uniform float u_near;
uniform float u_far;
uniform bool u_ortho;
uniform mat4 u_invProjMatrix;
uniform bool u_clipRangeZeroToOne;
uniform int u_depthMode; // 0 standard, 1 reversed, 2 logarithmic

const float AURA_SKY_DEPTH = 3e38;

float auraNdcDepth(float depth) {
  return u_clipRangeZeroToOne ? depth : depth * 2.0 - 1.0;
}

float auraLinearDepth(vec2 ndcXY, float depth) {
  // Depth textures alone cannot distinguish a fragment at the exact far plane
  // from a clear pixel. The renderer's depth convention determines the clear.
  if ((u_depthMode == 1 && depth <= 0.0) || (u_depthMode != 1 && depth >= 1.0)) return AURA_SKY_DEPTH;
  if (u_depthMode == 2) {
    // The caller must reject an invalid log range; this guard keeps malformed
    // input from introducing NaNs into the rest of the frame.
    if (!(u_near > 0.0) || !(u_far > u_near) || isinf(u_far)) return AURA_SKY_DEPTH;
    return exp(mix(log(u_near), log(u_far), depth));
  }
  vec4 view = u_invProjMatrix * vec4(ndcXY, auraNdcDepth(depth), 1.0);
  if (abs(view.w) < 1e-20 || isnan(view.w) || isnan(view.z)) return AURA_SKY_DEPTH;
  float viewDepth = -view.z / view.w;
  return isnan(viewDepth) || isinf(viewDepth) ? AURA_SKY_DEPTH : viewDepth;
}

// Given a decoded log depth, solve for the actual projective clip z. This
// preserves asymmetric and orthographic projections because x/y participate
// in the homogeneous inverse-projection equation.
float auraLogNdcDepth(vec2 ndcXY, float viewDepth) {
  vec4 q = u_invProjMatrix * vec4(ndcXY, 0.0, 1.0);
  vec4 zColumn = u_invProjMatrix[2];
  float denominator = zColumn.z + viewDepth * zColumn.w;
  if (abs(denominator) < 1e-20) return 0.0;
  return -(q.z + viewDepth * q.w) / denominator;
}
`,Xt=`${vt}
uniform highp sampler2D u_depth;
uniform vec2 u_outputSize;
uniform vec2 u_jitterClip;
out vec4 o_color;

${jt}

void main() {
  vec2 uv = gl_FragCoord.xy / u_outputSize;
  ivec2 size = textureSize(u_depth, 0);
  ivec2 pixel = clamp(ivec2(uv * vec2(size)), ivec2(0), size - ivec2(1));
  // Depth was rasterized with jitter but the inverse projection is physical.
  vec2 ndcXY = uv * 2.0 - 1.0 - u_jitterClip;
  float depth = texelFetch(u_depth, pixel, 0).r;
  o_color = vec4(auraLinearDepth(ndcXY, depth), 0.0, 0.0, 1.0);
}
`,Sr=`${vt}
uniform highp sampler2D u_linearDepth;
out vec4 o_color;

void main() {
  ivec2 p = ivec2(gl_FragCoord.xy) * 2;
  ivec2 last = textureSize(u_linearDepth, 0) - ivec2(1);
  float d00 = texelFetch(u_linearDepth, min(p, last), 0).r;
  float d10 = texelFetch(u_linearDepth, min(p + ivec2(1, 0), last), 0).r;
  float d01 = texelFetch(u_linearDepth, min(p + ivec2(0, 1), last), 0).r;
  float d11 = texelFetch(u_linearDepth, min(p + ivec2(1, 1), last), 0).r;
  o_color = vec4(min(min(d00, d10), min(d01, d11)),
                 max(max(d00, d10), max(d01, d11)), 0.0, 1.0);
}
`,Lr=`${vt}
uniform highp sampler2D u_depth;
uniform mat4 u_prevViewProjection;
uniform mat4 u_invUnjitteredViewProjection;
uniform vec2 u_jitterClip;
out vec4 o_color;

${jt}

void main() {
  vec2 uv = gl_FragCoord.xy / vec2(textureSize(u_depth, 0));
  // Remove raster jitter before applying the unjittered reprojection matrix.
  vec2 ndcCurr = uv * 2.0 - 1.0 - u_jitterClip;
  float d = texelFetch(u_depth, ivec2(gl_FragCoord.xy), 0).r;
  float linearDepth = auraLinearDepth(ndcCurr, d);
  if (linearDepth >= 2.9e38) {
    o_color = vec4(0.0, 0.0, 0.0, 1.0); return;
  }
  float ndcZ = u_depthMode == 2 ? auraLogNdcDepth(ndcCurr, linearDepth) : auraNdcDepth(d);
  vec4 clipPrev = u_prevViewProjection * u_invUnjitteredViewProjection * vec4(ndcCurr, ndcZ, 1.0);
  if (abs(clipPrev.w) < 1e-20 || isnan(clipPrev.w)) {
    o_color = vec4(0.0, 0.0, 0.0, 1.0); return;
  }
  vec2 velocity = (ndcCurr - clipPrev.xy / clipPrev.w) * 0.5;
  o_color = vec4(velocity, 0.0, 1.0);
}
`,Er=`#version 300 es
precision highp float;
uniform highp sampler2D u_linearDepthHalf;
uniform mat4 u_projMatrix;
uniform mat4 u_invProjMatrix;
uniform float u_near;
uniform float u_far;
uniform bool u_ortho;
uniform float u_radius;
uniform float u_intensity;
uniform float u_falloff;
uniform float u_distanceExponent;
uniform float u_thickness;
uniform int u_frameIndex;
out vec4 o_color;

#ifndef AURA_GTAO_DIRECTIONS
#define AURA_GTAO_DIRECTIONS 4
#endif
#ifndef AURA_GTAO_STEPS
#define AURA_GTAO_STEPS 4
#endif

const float AURA_PI = 3.141592653589793;

float auraRotation(ivec2 pixel, int frame) {
  uint bits = uint(pixel.x) * 1103515245u ^ uint(pixel.y) * 2654435761u ^ uint(frame) * 2246822519u;
  bits ^= bits >> 15u;
  bits *= 3266489917u;
  bits ^= bits >> 16u;
  return float(bits & 0x00ffffffu) / 16777216.0;
}

float auraDepth(ivec2 pixel) {
  ivec2 last = textureSize(u_linearDepthHalf, 0) - ivec2(1);
  return texelFetch(u_linearDepthHalf, clamp(pixel, ivec2(0), last), 0).r;
}

vec3 auraViewPosition(vec2 uv, float depth) {
  vec4 h = u_invProjMatrix * vec4(uv * 2.0 - 1.0, 0.0, 1.0);
  if (u_ortho) return vec3(h.xy / h.w, -depth);
  // The ratio cancels homogeneous w, including an infinite far plane.
  return vec3(h.xy * (depth / max(-h.z, 1e-6)), -depth);
}

vec3 auraDepthNormal(ivec2 pixel, vec2 texel, vec3 center, float depth) {
  float l = auraDepth(pixel + ivec2(-1, 0));
  float r = auraDepth(pixel + ivec2( 1, 0));
  float b = auraDepth(pixel + ivec2(0, -1));
  float t = auraDepth(pixel + ivec2(0,  1));
  // An uncovered neighbor carries the sky sentinel. Extend the center depth
  // instead of differentiating against the sentinel at silhouettes.
  if (l >= 2.9e38 || (!u_ortho && l <= 0.0)) l = depth;
  if (r >= 2.9e38 || (!u_ortho && r <= 0.0)) r = depth;
  if (b >= 2.9e38 || (!u_ortho && b <= 0.0)) b = depth;
  if (t >= 2.9e38 || (!u_ortho && t <= 0.0)) t = depth;
  vec2 uv = (vec2(pixel) + 0.5) * texel;
  vec3 dx = abs(l - depth) < abs(r - depth)
    ? center - auraViewPosition(uv - vec2(texel.x, 0.0), l)
    : auraViewPosition(uv + vec2(texel.x, 0.0), r) - center;
  vec3 dy = abs(b - depth) < abs(t - depth)
    ? center - auraViewPosition(uv - vec2(0.0, texel.y), b)
    : auraViewPosition(uv + vec2(0.0, texel.y), t) - center;
  vec3 n = cross(dx, dy);
  float magnitude = length(n);
  if (magnitude < 1e-12) return vec3(0.0, 0.0, 1.0);
  n /= magnitude;
  vec3 towardCamera = u_ortho ? vec3(0.0, 0.0, 1.0) : -center;
  return dot(n, towardCamera) < 0.0 ? -n : n;
}

float auraOccluder(vec2 sampleUv, vec2 size, vec3 center, vec3 normal) {
  if (any(lessThan(sampleUv, vec2(0.0))) || any(greaterThanEqual(sampleUv, vec2(1.0)))) return 0.0;
  ivec2 samplePixel = ivec2(sampleUv * size);
  float sampleDepth = auraDepth(samplePixel);
  if (sampleDepth >= 2.9e38 || (!u_ortho && sampleDepth <= 0.0)) return 0.0;
  vec2 sampleCenter = (vec2(samplePixel) + 0.5) / size;
  vec3 delta = auraViewPosition(sampleCenter, sampleDepth) - center;
  float distanceToSample = length(delta);
  if (distanceToSample < 1e-6 || distanceToSample >= u_radius || abs(delta.z) > u_thickness) return 0.0;
  float facing = max(dot(normal, delta / distanceToSample) - 0.02, 0.0);
  float attenuation = pow(clamp(1.0 - distanceToSample / u_radius, 0.0, 1.0), max(u_falloff, 0.0001));
  return facing * attenuation;
}

void main() {
  ivec2 pixel = ivec2(gl_FragCoord.xy);
  vec2 size = vec2(textureSize(u_linearDepthHalf, 0));
  vec2 texel = 1.0 / size;
  float depth = auraDepth(pixel);
  if (depth >= 2.9e38 || (!u_ortho && depth <= 0.0) || u_radius <= 0.0 || u_intensity <= 0.0) {
    o_color = vec4(1.0); return;
  }
  vec2 uv = gl_FragCoord.xy * texel;
  vec3 center = auraViewPosition(uv, depth);
  vec3 normal = auraDepthNormal(pixel, texel, center, depth);
  float projectedRadius = u_radius * abs(u_projMatrix[1][1]) * size.y * 0.5;
  float radiusPx = min(projectedRadius / (u_ortho ? 1.0 : max(depth, 1e-6)), 96.0);
  float rotation = auraRotation(pixel, u_frameIndex);
  float sum = 0.0;
  for (int direction = 0; direction < AURA_GTAO_DIRECTIONS; ++direction) {
    float angle = AURA_PI * (float(direction) + rotation) / float(AURA_GTAO_DIRECTIONS);
    vec2 axis = vec2(cos(angle), sin(angle));
    float positive = 0.0;
    float negative = 0.0;
    for (int stepIndex = 0; stepIndex < AURA_GTAO_STEPS; ++stepIndex) {
      float progress = pow(float(stepIndex + 1) / float(AURA_GTAO_STEPS), max(u_distanceExponent, 0.0001));
      vec2 offset = axis * radiusPx * progress * texel;
      positive = max(positive, auraOccluder(uv + offset, size, center, normal));
      negative = max(negative, auraOccluder(uv - offset, size, center, normal));
    }
    sum += positive + negative;
  }
  float occlusion = sum / float(2 * AURA_GTAO_DIRECTIONS);
  float visibility = 1.0 - clamp(u_intensity, 0.0, 1.0) * clamp(occlusion, 0.0, 1.0);
  o_color = vec4(visibility, 0.0, 0.0, 1.0);
}
`,qt=`#version 300 es
precision highp float;
`,Zt=`
// 5-tap gaussian (sigma 1.0) × exponential depth term exp(-|dz|/(0.05*z)).
float aoWeight(float dz, float z, float g) {
  return g * exp(-abs(dz) / max(0.05 * z, 1e-4));
}
const float GAUSS_5[5] = float[5](0.06136, 0.24477, 0.38774, 0.24477, 0.06136);
`,yr=`${qt}
uniform sampler2D u_ao;              // half-res R8
uniform highp sampler2D u_depthHalf; // half-res linear depth (.r)
uniform vec2 u_dir;                  // (texel.x, 0) then (0, texel.y)
out vec4 o_color;

${Zt}

void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec2 texel = vec2(textureSize(u_ao, 0));
  float centerAo = texelFetch(u_ao, p, 0).r;
  float centerZ = texelFetch(u_depthHalf, p, 0).r;
  float total = GAUSS_5[2];
  float sum = centerAo * GAUSS_5[2];
  for (int i = -2; i <= 2; ++i) {
    if (i == 0) continue;
    ivec2 s = p + ivec2(u_dir * texel * float(i));
    s = clamp(s, ivec2(0), ivec2(texel) - 1);
    float z = texelFetch(u_depthHalf, s, 0).r;
    float w = aoWeight(z - centerZ, centerZ, GAUSS_5[i + 2]);
    sum += texelFetch(u_ao, s, 0).r * w;
    total += w;
  }
  o_color = vec4(sum / total, 0.0, 0.0, 1.0);
}
`,Tr=`${qt}
uniform sampler2D u_hdr;             // full-res HDR (linear)
uniform sampler2D u_ao;              // denoised half-res R8
uniform highp sampler2D u_depthFull; // full-res linear depth
uniform highp sampler2D u_depthHalf;
uniform float u_far;
uniform float u_aoFallbackStrength;
uniform bool u_aoMultiBounce;
out vec4 o_color;
${Zt}
// Jimenez 2016 multi-bounce polynomial, albedoProxy ρ = 0.5.
float aoMultiBounce(float ao) {
  float a = 2.0404 * 0.5 - 0.3324;
  float b = -4.7951 * 0.5 + 0.6417;
  float c = 2.7552 * 0.5 + 0.6903;
  return max(ao, ((ao * a + b) * ao + c) * ao);
}

// Joint-bilateral upsample: the four half-res taps around the bilinear
// coordinate, weighted by depth similarity to the full-res texel.
float upsampleAo(vec2 uvHalf, float fullZ, vec2 halfSize) {
  vec2 p = uvHalf * halfSize - 0.5;
  ivec2 p0 = ivec2(floor(p));
  vec2 f = p - vec2(p0);
  float sum = 0.0;
  float total = 0.0;
  for (int y = 0; y < 2; ++y) {
    for (int x = 0; x < 2; ++x) {
      ivec2 s = clamp(p0 + ivec2(x, y), ivec2(0), ivec2(halfSize) - 1);
      float z = texelFetch(u_depthHalf, s, 0).r;
      float w = aoWeight(z - fullZ, fullZ,
                         (x == 0 ? 1.0 - f.x : f.x) * (y == 0 ? 1.0 - f.y : f.y));
      sum += texelFetch(u_ao, s, 0).r * w;
      total += w;
    }
  }
  return total > 0.0 ? sum / total : 1.0;
}

void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 hdr = texelFetch(u_hdr, p, 0);
  float fullZ = texelFetch(u_depthFull, p, 0).r;
  vec2 halfSize = vec2(textureSize(u_ao, 0));
  vec2 uvHalf = gl_FragCoord.xy / vec2(textureSize(u_hdr, 0));
  float ao = upsampleAo(uvHalf, fullZ, halfSize);
  float aoMB = u_aoMultiBounce ? aoMultiBounce(ao) : ao;

  float sky = step(u_far * 0.999, fullZ);
  float w;
  if (hdr.a >= 1.5) {
    // Tagged generated-program pixel: alpha = 2 + f_ind (prd03.indirectFraction).
    w = clamp(hdr.a - 2.0, 0.0, 1.0);
  } else {
    // Legacy / custom-shader pixel: no f_ind, conservative fallback.
    float luma = dot(hdr.rgb, vec3(0.2126, 0.7152, 0.0722));
    w = u_aoFallbackStrength * step(luma, 4.0);
  }
  w *= 1.0 - sky;
  hdr.rgb *= mix(1.0, aoMB, w);
  hdr.a = min(hdr.a, 1.0);
  o_color = hdr;
}
`,br=`#version 300 es
precision highp float;
`,wr=`${br}
uniform sampler2D u_hdr;             // half-res HDR input
uniform highp sampler2D u_depthHalf; // half-res linear depth (.r)
uniform float u_far;
uniform vec2 u_lightUv;              // projected light position, uv space
uniform float u_lightClipW;          // clip-space w of the projected light
uniform vec3 u_color;                // light shaft tint
uniform float u_intensity;
uniform float u_decay;
uniform float u_weight;
uniform float u_diskOuter;           // r1: disk feather outer radius (uv)
uniform float u_diskInner;           // r0: disk core radius (uv)
uniform float u_density;             // GU47: march fraction toward the light, (0, 1]; <= 0 reads as 1
uniform float u_medium;              // GU47 phase 2: shaft medium per metre (volumetricFog density); <= 0: no depth scaling
out vec4 o_color;

#ifndef AURA_GODRAY_SAMPLES
#define AURA_GODRAY_SAMPLES 32
#endif
// GU47 phase 2: emitter falloff radius around the light, in frame heights.
#ifndef AURA_GODRAY_EMIT_RADIUS
#define AURA_GODRAY_EMIT_RADIUS 0.6
#endif

void main() {
  vec2 uv = gl_FragCoord.xy / vec2(textureSize(u_hdr, 0));
  vec2 dir = u_lightUv - uv;
  float dist = length(dir);
  float density = u_density > 0.0 ? u_density : 1.0;
  vec2 stepUv = dist > 0.0 ? dir * density / float(AURA_GODRAY_SAMPLES) : vec2(0.0);

  // Off-screen / behind-camera fade: step(0, w) zeroes lights behind the eye,
  // the linear ramp fades across 25% uv past the frame edge.
  float offScreen = clamp(1.0 - (max(abs(u_lightUv.x - 0.5), abs(u_lightUv.y - 0.5)) - 0.5) * 4.0, 0.0, 1.0)
                  * step(0.0, u_lightClipW);

  vec2 aspect = vec2(float(textureSize(u_hdr, 0).x) / float(max(textureSize(u_hdr, 0).y, 1)), 1.0);
  float marchWeight = 1.0;
  float weightSum = 0.0;
  vec3 accum = vec3(0.0);
  vec2 sampleUv = uv;
  for (int i = 0; i < AURA_GODRAY_SAMPLES; ++i) {
    sampleUv += stepUv;
    vec4 hdr = textureLod(u_hdr, sampleUv, 0.0);
    float linZ = textureLod(u_depthHalf, sampleUv, 0.0).r;
    bool sky = linZ >= u_far * 0.999;
    float luma = dot(hdr.rgb, vec3(0.2126, 0.7152, 0.0722));
    // Emitters: sky pixels (the "gap" through occluders) or HDR highlights,
    // weighted by their closeness to the light (GU47 phase 2).
    float nearLight = 1.0 - smoothstep(0.0, float(AURA_GODRAY_EMIT_RADIUS), length((sampleUv - u_lightUv) * aspect));
    vec3 src = (sky || luma > 4.0) ? hdr.rgb * nearLight : vec3(0.0);
    // The sun disk emits only where the sky is unoccluded. #1185 multiplied
    // the whole source by the disk mask: with a dim sky that leaves nothing
    // to emit, and the S4-isolated A/B measured S4 on == S4 off (GPU run
    // 38163537496). The original additive disk emitted through occluders.
    if (sky) src += vec3(smoothstep(u_diskOuter, u_diskInner, length(sampleUv - u_lightUv)));
    accum += marchWeight * src;
    weightSum += marchWeight;
    marchWeight *= u_decay;
  }
  vec3 shaft = accum / max(weightSum, 1e-4);
  // Distance-scaled medium: the shaft is the light the view ray picks up on
  // its way through the volume, so near geometry gets little of it.
  float viewZ = min(textureLod(u_depthHalf, uv, 0.0).r, u_far);
  float medium = u_medium > 0.0 ? 1.0 - exp(-u_medium * viewZ) : 1.0;

  o_color = vec4(shaft * u_color * u_intensity * offScreen * medium, 1.0);
}
`;class lt{constructor(t){this.resources=t}resources;leases=new Set;closed=!1;acquire(t){if(this.closed)throw new Error("POSTPROCESS_SCRATCH_SCOPE_CLOSED");const r=this.resources.acquireLease(t);return this.leases.add(r),r}release(t){!t||!this.leases.delete(t)||t.release()}take(t){if(!this.leases.delete(t))throw new Error("POSTPROCESS_SCRATCH_LEASE_NOT_OWNED");return t}releaseExcept(t){const r=new Set(t),i=[];for(const o of[...this.leases])if(!r.has(o))try{this.release(o)}catch(a){i.push(a)}if(i.length===1)throw i[0];if(i.length>1)throw new AggregateError(i,"Postprocess scratch release failed")}releaseAll(){if(this.closed)return;this.closed=!0;const t=[...this.leases];this.leases.clear();const r=[];for(const i of t)try{i.release()}catch(o){r.push(o)}if(r.length===1)throw r[0];if(r.length>1)throw new AggregateError(r,"Postprocess scratch release failed")}}const Ar=`#version 300 es
precision highp float;
`,Ur=`${Ar}
uniform highp sampler2D u_velocity;
uniform highp sampler2D u_linearDepth;
uniform bool u_hasExpectedDepth;
uniform float u_depthNear;
out vec4 o_color;

${$e}

void main() {
  ivec2 pixel = ivec2(gl_FragCoord.xy);
  ivec2 size = textureSize(u_velocity, 0);
  float zSelf = texelFetch(u_linearDepth, clamp(pixel, ivec2(0), size - 1), 0).r;
  vec4 selfVelocity = texelFetch(u_velocity, pixel, 0);
  vec4 nearestVelocity = selfVelocity;
  float zBest = zSelf;
  for (int y = -1; y <= 1; y += 1) {
    for (int x = -1; x <= 1; x += 1) {
      ivec2 tap = clamp(pixel + ivec2(x, y), ivec2(0), size - 1);
      float z = texelFetch(u_linearDepth, tap, 0).r;
      if (z < zBest) {
        zBest = z;
        nearestVelocity = texelFetch(u_velocity, tap, 0);
      }
    }
  }
  // A newly exposed current pixel must not acquire history from its neighbor.
  // Keep the selected velocity and depth paired, but only when both samples
  // have a valid previous surface; 3e38 is the shared invalid-depth sentinel.
  bool selfHasPrevious = selfVelocity.a >= u_depthNear && selfVelocity.a < 3.0e38;
  bool nearestHasPrevious = nearestVelocity.a >= u_depthNear && nearestVelocity.a < 3.0e38;
  float expectedPrevious = u_hasExpectedDepth
    ? (selfHasPrevious && nearestHasPrevious ? nearestVelocity.a : 3.0e38)
    : 0.0;
  o_color = vec4(nearestVelocity.rg, zSelf, expectedPrevious);
}
`,Dr=`#version 300 es
precision highp float;
`,Pr=`${Dr}
uniform highp sampler2D u_linearDepth;
uniform mat4 u_invProjMatrix;
uniform bool u_ortho;
out vec4 o_normal;

// The depth preparation pass writes 3e38 for cleared and unbounded pixels.
const float AURA_NORMAL_SKY = 1e37;

bool auraViewPoint(ivec2 pixel, ivec2 size, out vec3 point) {
  float distanceAlongView = texelFetch(u_linearDepth, pixel, 0).r;
  point = vec3(0.0);
  if (!(abs(distanceAlongView) < AURA_NORMAL_SKY)) return false;
  vec2 ndc = (vec2(pixel) + 0.5) / vec2(size) * 2.0 - 1.0;
  vec4 a = u_invProjMatrix * vec4(ndc, -0.5, 1.0);
  vec4 b = u_invProjMatrix * vec4(ndc, 0.5, 1.0);
  if (abs(a.w) < 1e-20 || abs(b.w) < 1e-20) return false;
  vec3 pa = a.xyz / a.w;
  vec3 pb = b.xyz / b.w;
  float dz = pb.z - pa.z;
  if (abs(dz) < 1e-20) return false;
  // Linear depth is the positive distance along -Z.
  point = pa + (pb - pa) * ((-distanceAlongView - pa.z) / dz);
  return true;
}

vec3 auraSmallerStep(vec3 center, bool hasBefore, vec3 before, bool hasAfter, vec3 after, out bool ok) {
  ok = hasBefore || hasAfter;
  if (hasBefore && hasAfter) {
    return abs(center.z - before.z) <= abs(after.z - center.z) ? center - before : after - center;
  }
  return hasBefore ? center - before : after - center;
}

void main() {
  ivec2 size = textureSize(u_linearDepth, 0);
  ivec2 p = ivec2(gl_FragCoord.xy);
  ivec2 last = size - ivec2(1);
  vec3 c, l, r, d, u;
  if (!auraViewPoint(p, size, c)) { o_normal = vec4(0.0); return; }
  bool hasL = p.x > 0 && auraViewPoint(p - ivec2(1, 0), size, l);
  bool hasR = p.x < last.x && auraViewPoint(p + ivec2(1, 0), size, r);
  bool hasD = p.y > 0 && auraViewPoint(p - ivec2(0, 1), size, d);
  bool hasU = p.y < last.y && auraViewPoint(p + ivec2(0, 1), size, u);
  bool okX, okY;
  vec3 dx = auraSmallerStep(c, hasL, l, hasR, r, okX);
  vec3 dy = auraSmallerStep(c, hasD, d, hasU, u, okY);
  vec3 n = cross(dx, dy);
  float len = length(n);
  if (!okX || !okY || !(len > 1e-30)) {
    // A single isolated pixel has no measurable slope; face the camera.
    o_normal = vec4(0.0, 0.0, 1.0, 1.0);
    return;
  }
  n /= len;
  // Face the viewer: the view direction from the surface is -c (perspective)
  // or +Z (orthographic, where c may lie anywhere on a parallel ray).
  vec3 toViewer = u_ortho ? vec3(0.0, 0.0, 1.0) : -c;
  if (dot(n, toViewer) < 0.0) n = -n;
  o_normal = vec4(n, 1.0);
}
`,Wt=`#version 300 es
precision highp float;
`,Rr=`${Wt}
uniform highp sampler2D u_current;
uniform highp sampler2D u_history;
uniform highp sampler2D u_velocityDilate; // rg = motion, b = current linear depth, a = optional expected previous linear depth
uniform highp sampler2D u_linZPrev;
uniform highp sampler2D u_reactive;
uniform bool u_hasReactive;
uniform bool u_hasHistory;
uniform bool u_hasExpectedDepth;
uniform float u_depthNear; // signed near plane; sky/uncovered uses the 3e38 sentinel
uniform vec2 u_jitterUv; // raster offset, in current texture UV coordinates
uniform vec2 u_previousJitterUv; // previous depth remains on the jittered raster grid
uniform float u_feedbackMin;
uniform float u_feedbackMax;
uniform float u_varianceGamma;
out vec4 o_color;

vec4 cubicWeights(float f) {
  float f2 = f * f, f3 = f2 * f;
  return vec4(-0.5*f + f2 - 0.5*f3, 1.0 - 2.5*f2 + 1.5*f3, 0.5*f + 2.0*f2 - 1.5*f3, -0.5*f2 + 0.5*f3);
}

// Four-point separable cubic interpolation of the previous color. All fetches
// are bounded explicitly; this keeps behavior independent of sampler state.
vec4 historyAt(vec2 uv) {
  ivec2 size = textureSize(u_history, 0);
  vec2 position = uv * vec2(size) - 0.5;
  ivec2 base = ivec2(floor(position));
  vec4 wx = cubicWeights(fract(position.x)), wy = cubicWeights(fract(position.y));
  vec4 result = vec4(0.0);
  for (int y = 0; y < 4; y++) for (int x = 0; x < 4; x++) {
    result += texelFetch(u_history, clamp(base + ivec2(x - 1, y - 1), ivec2(0), size - 1), 0) * wx[x] * wy[y];
  }
  return result;
}

// Current raster reconstruction works for both a matching output grid and a
// higher-resolution history grid; at aligned texel centers it is an exact copy.
vec4 currentAt(vec2 uv) {
  ivec2 size = textureSize(u_current, 0);
  vec2 p = uv * vec2(size) - 0.5;
  ivec2 base = ivec2(floor(p));
  vec2 f = fract(p);
  vec4 a = texelFetch(u_current, clamp(base, ivec2(0), size - 1), 0);
  vec4 b = texelFetch(u_current, clamp(base + ivec2(1, 0), ivec2(0), size - 1), 0);
  vec4 c = texelFetch(u_current, clamp(base + ivec2(0, 1), ivec2(0), size - 1), 0);
  vec4 d = texelFetch(u_current, clamp(base + ivec2(1, 1), ivec2(0), size - 1), 0);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

vec3 rgbToYCoCg(vec3 c) { return vec3(c.r * 0.25 + c.g * 0.5 + c.b * 0.25, c.r * 0.5 - c.b * 0.5, -c.r * 0.25 + c.g * 0.5 - c.b * 0.25); }
vec3 ycocgToRgb(vec3 c) { return vec3(c.x + c.y - c.z, c.x + c.z, c.x - c.y - c.z); }
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
bool validDepth(float z) { return z >= u_depthNear && z < 3.0e38; }

void main() {
  ivec2 pixel = ivec2(gl_FragCoord.xy);
  ivec2 outputSize = textureSize(u_history, 0);
  ivec2 currentSize = textureSize(u_current, 0);
  vec2 uv = (vec2(pixel) + 0.5) / vec2(outputSize);
  vec2 currentUv = uv + u_jitterUv;
  ivec2 currentPixel = clamp(ivec2(floor(currentUv * vec2(currentSize))), ivec2(0), currentSize - 1);
  ivec2 velocitySize = textureSize(u_velocityDilate, 0);
  ivec2 velocityPixel = clamp(ivec2(floor(currentUv * vec2(velocitySize))), ivec2(0), velocitySize - 1);
  vec4 velTex = texelFetch(u_velocityDilate, velocityPixel, 0);
  vec2 velocity = velTex.rg;
  vec2 uvPrev = uv - velocity;
  vec4 current = currentAt(currentUv);

  // Reject malformed/extreme vectors before converting reprojected UV to
  // integer texel coordinates; no such vector can land on prior history.
  if (!u_hasHistory || any(notEqual(velocity, velocity)) || any(greaterThan(abs(velocity), vec2(2.0)))) {
    o_color = current;
    return;
  }

  vec3 mu = vec3(0.0), m2 = vec3(0.0);
  float wsum = 0.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 tap = texelFetch(u_current, clamp(currentPixel + ivec2(x, y), ivec2(0), currentSize - 1), 0).rgb;
    float w = 1.0 / (1.0 + max(luma(tap), 0.0));
    vec3 yc = rgbToYCoCg(tap);
    mu += yc * w;
    m2 += yc * yc * w;
    wsum += w;
  }
  mu /= wsum;
  vec3 sigma = sqrt(max(m2 / wsum - mu * mu, vec3(0.0)));

  float motionPx = length(velocity * vec2(outputSize));
  // Direct fetch for static history prevents repeated reconstruction drift.
  vec4 history = motionPx < 1e-3
    ? texelFetch(u_history, clamp(pixel, ivec2(0), outputSize - 1), 0)
    : historyAt(uvPrev);
  float motionFactor = clamp(motionPx / 2.0, 0.0, 1.0);
  float gamma = mix(0.5, max(u_varianceGamma, 0.0), (1.0 - motionFactor) * (1.0 - motionFactor));
  vec3 historyRgb = ycocgToRgb(clamp(rgbToYCoCg(history.rgb), mu - gamma * sigma, mu + gamma * sigma));

  bool outOfBounds = any(lessThan(uvPrev, vec2(0.0))) || any(greaterThanEqual(uvPrev, vec2(1.0)));
  float expectedZ = u_hasExpectedDepth ? velTex.a : velTex.b;
  ivec2 zSize = textureSize(u_linZPrev, 0);
  vec2 previousDepthUv = uvPrev + u_previousJitterUv;
  bool depthOutOfBounds = any(lessThan(previousDepthUv, vec2(0.0))) || any(greaterThanEqual(previousDepthUv, vec2(1.0)));
  ivec2 prevPixel = ivec2(floor(previousDepthUv * vec2(zSize)));
  float nearestError = 3.0e38;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    float z = texelFetch(u_linZPrev, clamp(prevPixel + ivec2(x, y), ivec2(0), zSize - 1), 0).r;
    if (validDepth(z)) nearestError = min(nearestError, abs(z - expectedZ));
  }
  bool disoccluded = depthOutOfBounds || !validDepth(expectedZ) || nearestError > max(0.001, 0.1 * max(expectedZ - u_depthNear, 0.0));

  ivec2 reactiveSize = textureSize(u_reactive, 0);
  ivec2 reactivePixel = clamp(ivec2(floor(currentUv * vec2(reactiveSize))), ivec2(0), reactiveSize - 1);
  float reactive = u_hasReactive ? texelFetch(u_reactive, reactivePixel, 0).r
    : (abs(luma(current.rgb) - luma(history.rgb)) > 0.5 ? 1.0 : 0.0);
  // Values above one are indirect-light tags, not opacity. A changed tag is
  // not a coverage change, though switching representations is reactive.
  bool currentTagged = current.a > 1.0, historyTagged = history.a > 1.0;
  float coverageChange = currentTagged && historyTagged ? 0.0
    : (currentTagged != historyTagged ? 1.0 : clamp(abs(current.a - history.a) * 4.0, 0.0, 1.0));
  reactive = max(clamp(reactive, 0.0, 1.0), coverageChange);
  float feedback = mix(u_feedbackMin, u_feedbackMax, 1.0 - motionFactor) * (1.0 - reactive);
  if (outOfBounds || disoccluded) feedback = 0.0;
  o_color = vec4(mix(current.rgb, historyRgb, clamp(feedback, 0.0, 1.0)), current.a);
}
`,Ir=`${Wt}
uniform highp sampler2D u_resolved; // render-res TAA output (this frame)
uniform vec2 u_renderSize;          // render resolution (input texel space)
uniform vec2 u_outputSize;          // display resolution (draw target size)
out vec4 o_color;

float blackmanHarris(float x) {
  // N=9 window kernel, |x| ∈ [0, 1.5] inside the 3×3 footprint.
  float ax = abs(x) / 1.5;
  if (ax >= 1.0) return 0.0;
  return 0.35875 + 0.48829 * cos(3.14159265 * ax) + 0.14128 * cos(2.0 * 3.14159265 * ax) + 0.01168 * cos(3.0 * 3.14159265 * ax);
}

void main() {
  // Output pixel → render-res source position.
  vec2 srcPos = (gl_FragCoord.xy / u_outputSize) * u_renderSize - 0.5;
  ivec2 base = ivec2(floor(srcPos));
  vec2 f = srcPos - vec2(base);
  vec4 sum = vec4(0.0);
  float wsum = 0.0;
  ivec2 rSize = ivec2(u_renderSize);
  for (int y = -1; y <= 1; y += 1) for (int x = -1; x <= 1; x += 1) {
    float w = blackmanHarris(float(x) - f.x) * blackmanHarris(float(y) - f.y);
    sum += texelFetch(u_resolved, clamp(base + ivec2(x, y), ivec2(0), rSize - 1), 0) * w;
    wsum += w;
  }
  o_color = sum / max(wsum, 1e-6);
}
`,Ye=`#version 300 es
precision highp float;
`,Cr=`${Ye}
uniform highp sampler2D u_color;
uniform highp sampler2D u_linearDepth;
uniform float u_focusDistance;  // metres
uniform float u_focalLengthMm;
uniform float u_fStop;
uniform float u_sensorHeightMm;
uniform float u_frameHeightPx;  // full-res height
uniform float u_maxBlurPx;
uniform vec4 u_tiltShift;       // GU47: x band centre (0 top, 1 bottom), y band width, z angle (rad), w 1 = band mode
out vec4 o_color;

${$e}

float tiltShiftCocPx(ivec2 base, ivec2 fullSize) {
  vec2 uv = (vec2(base) + 1.0) / vec2(fullSize);
  float aspect = float(fullSize.x) / float(max(fullSize.y, 1));
  vec2 p = vec2((uv.x - 0.5) * aspect, (1.0 - uv.y) - 0.5);
  float t = dot(p, vec2(-sin(u_tiltShift.z), cos(u_tiltShift.z))) + 0.5;
  float halfBand = 0.5 * clamp(u_tiltShift.y, 0.0, 1.0);
  float ramp = max(0.05, 0.5 - halfBand);
  return clamp((abs(t - u_tiltShift.x) - halfBand) / ramp, 0.0, 1.0) * u_maxBlurPx;
}

void main() {
  ivec2 pixel = ivec2(gl_FragCoord.xy);
  // u_color is the FULL-res HDR target: box-average its 2×2 block (03-S15 —
  // a texelFetch at the half-res index read only the lower-left quadrant).
  ivec2 fullMax = textureSize(u_color, 0) - 1;
  ivec2 base = pixel * 2;
  vec3 color = 0.25 * (
    texelFetch(u_color, clamp(base, ivec2(0), fullMax), 0).rgb +
    texelFetch(u_color, clamp(base + ivec2(1, 0), ivec2(0), fullMax), 0).rgb +
    texelFetch(u_color, clamp(base + ivec2(0, 1), ivec2(0), fullMax), 0).rgb +
    texelFetch(u_color, clamp(base + ivec2(1, 1), ivec2(0), fullMax), 0).rgb);
  float z = texelFetch(u_linearDepth, clamp(base, ivec2(0), textureSize(u_linearDepth, 0) - 1), 0).r;
  float f = u_focalLengthMm;
  float aperture = f / max(u_fStop, 0.01);
  float zMm = max(z * 1000.0, 1.0);
  float zfMm = u_focusDistance * 1000.0;
  float cocMm = aperture * f * (zMm - zfMm) / (zMm * max(zfMm - f, 1.0));
  float cocPx = clamp(cocMm * (u_frameHeightPx / u_sensorHeightMm), -u_maxBlurPx, u_maxBlurPx);
  // Sky (linear Z at far) never blurs.
  cocPx = zMm >= 9.9e5 ? 0.0 : cocPx;
  if (u_tiltShift.w > 0.5) cocPx = tiltShiftCocPx(base, fullMax + 1);
  o_color = vec4(color, cocPx);
}
`,zr=`${Ye}
uniform highp sampler2D u_prefilter; // half-res, .a = signed cocPx
out vec4 o_color;

void main() {
  ivec2 tile = ivec2(gl_FragCoord.xy);
  ivec2 size = textureSize(u_prefilter, 0);
  float near_ = 0.0;
  for (int y = 0; y < 8; y += 1) for (int x = 0; x < 8; x += 1) {
    ivec2 p = tile * 8 + ivec2(x, y);
    if (p.x >= size.x || p.y >= size.y) continue;
    float coc = texelFetch(u_prefilter, p, 0).a;
    near_ = max(near_, -coc); // near field is the negative-CoC side
  }
  o_color = vec4(near_, 0.0, 0.0, 1.0);
}
`,Mr=`${Ye}
uniform highp sampler2D u_prefilter; // half-res color + signed coc
uniform highp sampler2D u_nearTile;  // 8px tiles, .r = near |coc|
uniform float u_maxBlurPx;           // full-res px (CoC diameter)
out vec4 o_color;

const float DOF_HALF_RES_RADIUS = 0.25;

void main() {
  ivec2 pixel = ivec2(gl_FragCoord.xy);
  ivec2 size = textureSize(u_prefilter, 0);
  vec4 center = texelFetch(u_prefilter, pixel, 0);
  float centerCoc = center.a;
  float centerNear = texelFetch(u_nearTile, pixel / 8, 0).r;
  // .a is the full-res CoC *diameter* in px: the half-res disc radius is
  // diameter / 2 (radius) / 2 (half res) = 0.25 · |coc| (03-S15 — 0.5 drew a
  // bokeh twice the thin-lens diameter).
  float radius = max(abs(centerCoc), centerNear) * DOF_HALF_RES_RADIUS;
  vec3 sum = center.rgb;
  float wsum = 1.0;
  const int RINGS = DOF_RINGS;
  for (int ring = 1; ring <= RINGS; ring += 1) {
    for (int s = 0; s < 8; s += 1) {
      float angle = 2.39996323 * float(ring * 8 + s); // golden-angle Vogel disc
      vec2 dir = vec2(cos(angle), sin(angle));
      ivec2 tap = clamp(pixel + ivec2(dir * radius * (float(ring) / float(RINGS)) + vec2(0.5)), ivec2(0), size - 1);
      vec4 t = texelFetch(u_prefilter, tap, 0);
      float tapNear = texelFetch(u_nearTile, tap / 8, 0).r;
      // A tap contributes when its own blur reaches this pixel, or when the
      // tile's near field does (foreground bleeds over sharp background).
      float reach = max(abs(t.a), tapNear) * DOF_HALF_RES_RADIUS;
      float w = clamp((reach + 0.5) / max(length(vec2(tap - pixel)), 0.5), 0.0, 1.0);
      sum += t.rgb * w;
      wsum += w;
    }
  }
  o_color = vec4(sum / wsum, centerCoc);
}
`,kr=`${Ye}
uniform highp sampler2D u_color;   // full-res HDR
uniform highp sampler2D u_blurred; // half-res gather (.a = signed cocPx)
out vec4 o_color;

void main() {
  ivec2 pixel = ivec2(gl_FragCoord.xy);
  vec4 src = texelFetch(u_color, pixel, 0);
  vec4 blur = texture(u_blurred, (vec2(pixel) + 0.5) / vec2(textureSize(u_color, 0)));
  o_color = vec4(mix(src.rgb, blur.rgb, smoothstep(1.0, 2.0, abs(blur.a))), src.a);
}
`,ht=`#version 300 es
precision highp float;
`,Or=`${ht}
uniform highp sampler2D u_velocity; // dilated velocity (.rg), render res
out vec4 o_color;

void main() {
  ivec2 tile = ivec2(gl_FragCoord.xy);
  ivec2 size = textureSize(u_velocity, 0);
  vec2 best = vec2(0.0);
  float mag = 0.0;
  for (int y = 0; y < MB_TILE_SIZE; y += 1) for (int x = 0; x < MB_TILE_SIZE; x += 1) {
    ivec2 p = tile * MB_TILE_SIZE + ivec2(x, y);
    if (p.x >= size.x || p.y >= size.y) continue;
    vec2 v = texelFetch(u_velocity, p, 0).rg;
    float m = dot(v, v);
    if (m > mag) { mag = m; best = v; }
  }
  o_color = vec4(best, 0.0, 1.0);
}
`,Nr=`${ht}
uniform highp sampler2D u_tileMax;
out vec4 o_color;

void main() {
  ivec2 tile = ivec2(gl_FragCoord.xy);
  ivec2 size = textureSize(u_tileMax, 0);
  vec2 best = vec2(0.0);
  float mag = 0.0;
  for (int y = -1; y <= 1; y += 1) for (int x = -1; x <= 1; x += 1) {
    vec2 v = texelFetch(u_tileMax, clamp(tile + ivec2(x, y), ivec2(0), size - 1), 0).rg;
    float m = dot(v, v);
    if (m > mag) { mag = m; best = v; }
  }
  o_color = vec4(best, 0.0, 1.0);
}
`,Fr=`${ht}
uniform highp sampler2D u_color;
uniform highp sampler2D u_velocity;     // dilated velocity (.rg)
uniform highp sampler2D u_neighbor;     // 3x3 tile max
uniform highp sampler2D u_linearDepth;  // .r = viewZ metres
uniform float u_shutter;                // authored shutter · frameTime scale
uniform float u_maxBlurPx;
uniform int u_samples;                  // bounded to [1, 16]
uniform int u_tileSize;
uniform int u_frameIndex;               // reserved for binding compatibility
out vec4 o_color;

void main() {
  ivec2 size = textureSize(u_color, 0);
  ivec2 pixel = clamp(ivec2(gl_FragCoord.xy), ivec2(0), size - 1);
  vec4 src = texelFetch(u_color, pixel, 0);
  int samples = clamp(u_samples, 1, 16);
  // Avoid a zero denominator, extra reads, and any change to a one-tap image.
  if (samples == 1) { o_color = src; return; }

  ivec2 depthSize = textureSize(u_linearDepth, 0);
  ivec2 depthMax = depthSize - 1;
  ivec2 depthPixel = clamp(ivec2((vec2(pixel) + 0.5) * vec2(depthSize) / vec2(size)), ivec2(0), depthMax);
  float zSelf = texelFetch(u_linearDepth, depthPixel, 0).r;
  ivec2 neighborMax = textureSize(u_neighbor, 0) - 1;
  ivec2 tile = clamp(depthPixel / max(u_tileSize, 1), ivec2(0), neighborMax);
  // Velocity is UV/frame; clamp its magnitude in actual pixels, so the cap
  // also holds on non-square targets. Scale via the largest component to avoid
  // overflow while normalizing very large, finite velocities.
  vec2 velocity = clamp(texelFetch(u_neighbor, tile, 0).rg, vec2(-1e10), vec2(1e10));
  vec2 velocityPx = velocity * clamp(u_shutter, -1e10, 1e10) * vec2(size);
  float component = max(abs(velocityPx.x), abs(velocityPx.y));
  if (component == 0.0) { o_color = src; return; }
  vec2 direction = velocityPx / component;
  float maxLen = clamp(u_maxBlurPx, 0.0, 2.0 * length(vec2(size)));
  velocityPx = direction * min(component, maxLen / length(direction));

  vec4 sum = vec4(0.0);
  float wsum = 0.0;
  for (int i = 0; i < 16; i += 1) {
    if (i >= samples) break;
    // Midpoints form symmetric pairs around zero for odd and even counts.
    float t = (float(i) + 0.5) / float(samples) - 0.5;
    // Manually bilinear-sample with per-texel depth rejection: unlike rounding
    // to a nearest texel, this keeps paired samples centered at half pixels.
    vec2 pos = clamp(vec2(pixel) + velocityPx * t, vec2(0.0), vec2(size - 1));
    ivec2 base = ivec2(floor(pos));
    vec2 fraction = fract(pos);
    for (int y = 0; y < 2; y += 1) for (int x = 0; x < 2; x += 1) {
      float coverage = (x == 0 ? 1.0 - fraction.x : fraction.x)
                     * (y == 0 ? 1.0 - fraction.y : fraction.y);
      if (coverage <= 0.0) continue;
      ivec2 tapPx = clamp(base + ivec2(x, y), ivec2(0), size - 1);
      ivec2 depthTap = clamp(ivec2((vec2(tapPx) + 0.5) * vec2(depthSize) / vec2(size)), ivec2(0), depthMax);
      float zTap = texelFetch(u_linearDepth, depthTap, 0).r;
      // Soft depth compare (0.05 m): different surfaces do not smear.
      float w = coverage * clamp(1.0 - abs(zTap - zSelf) / 0.05, 0.0, 1.0);
      vec4 sampleColor = texelFetch(u_color, tapPx, 0);
      if (src.a <= 1.0) sampleColor.a = clamp(sampleColor.a, 0.0, 1.0);
      sum += sampleColor * w;
      wsum += w;
    }
  }
  // Values above one carry the renderer's indirect-light tag, not opacity.
  // Keep that tag at the center while filtering ordinary premultiplied alpha.
  vec4 filtered = wsum > 0.0 ? sum / wsum : src;
  o_color = src.a > 1.0 ? vec4(filtered.rgb, src.a) : filtered;
}
`,Hr=`#version 300 es
precision highp float;
uniform sampler2D u_hdr;
uniform vec2 u_texelSize;      // 1 / HDR size
uniform int u_centerWeighted;  // 1 = centre-weighted metering, 0 = average
in vec2 v_uv;
out vec4 outColor;

void main() {
	// One output texel covers a 4×4 block of source texels; average the block.
	vec4 acc = vec4(0.0);
	for (int y = 0; y < 4; y++) {
		for (int x = 0; x < 4; x++) {
			vec2 uv = v_uv + (vec2(float(x), float(y)) - 1.5) * u_texelSize;
			acc.rgb += texture(u_hdr, uv).rgb;
			acc.a += 1.0;
		}
	}
	vec3 c = acc.rgb / max(acc.a, 1.0);
	float luma = max(dot(c, vec3(0.2126, 0.7152, 0.0722)), 1e-5);
	// Centre-weighted: w = 1 - (d^2), clamped — an 18% gray card reads weight 1
	// at frame centre and falls to 0 at the corners.
	vec2 centered = v_uv - 0.5;
	float w = u_centerWeighted == 1 ? max(0.0, 1.0 - dot(centered, centered) * 4.0) : 1.0;
	outColor = vec4(log2(luma) * w, w, 0.0, 1.0);
}
`,Gr=`#version 300 es
precision highp float;
uniform sampler2D u_source;
uniform vec2 u_texelSize;      // 1 / source size
in vec2 v_uv;
out vec4 outColor;

void main() {
	vec4 sum = texture(u_source, v_uv + vec2(-0.5, -0.5) * u_texelSize)
		+ texture(u_source, v_uv + vec2( 0.5, -0.5) * u_texelSize)
		+ texture(u_source, v_uv + vec2(-0.5,  0.5) * u_texelSize)
		+ texture(u_source, v_uv + vec2( 0.5,  0.5) * u_texelSize);
	outColor = sum * 0.25;
}
`,Br=`#version 300 es
precision highp float;
uniform sampler2D u_prev;
uniform sampler2D u_avg;
uniform float u_dt;
uniform float u_speedUp;
uniform float u_speedDown;
uniform float u_minEv;
uniform float u_maxEv;
uniform float u_compensationEv;
uniform int u_hasPrev;
out vec4 outColor;

void main() {
	vec4 avg = texelFetch(u_avg, ivec2(0), 0);
	float avgLog2 = avg.r / max(avg.g, 1e-4);   // Σ(l·w)/Σw — weighted mean
	float target = clamp(-avgLog2 + log2(0.18) + u_compensationEv, u_minEv, u_maxEv);
	float prev = texelFetch(u_prev, ivec2(0), 0).r;
	float speed = target > prev ? u_speedUp : u_speedDown;
	float ev = u_hasPrev == 1 ? mix(prev, target, 1.0 - exp(-u_dt * speed)) : target;
	outColor = vec4(ev, 0.0, 0.0, 1.0);
}
`,Vr=`#version 300 es
precision highp float;
uniform sampler2D u_hdr;
uniform sampler2D u_ev;
in vec2 v_uv;
out vec4 outColor;

void main() {
	float ev = texelFetch(u_ev, ivec2(0), 0).r;
	vec4 c = texture(u_hdr, v_uv);
	outColor = vec4(c.rgb * exp2(ev), c.a);
}
`,$r=`#version 300 es
precision highp float;
uniform sampler2D u_hdr;
uniform sampler2D u_ev;           // 1×1 EV target (S8); bound to a blank texel when u_hasEv == 0
uniform int u_hasEv;
uniform int u_hasGrade;
uniform vec3 u_whiteBalance;      // CAT02-cone LMS balance, resolved per temperature/tint on CPU
uniform vec3 u_lift;
uniform vec3 u_gamma;
uniform vec3 u_gain;
uniform vec3 u_shadows;
uniform vec3 u_midtones;
uniform vec3 u_highlights;
in vec2 v_uv;
out vec4 outColor;

float gradeLuma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

void main() {
  vec4 src = texture(u_hdr, v_uv);
  vec3 c = src.rgb;
  if (u_hasEv != 0) {
    c *= exp2(texelFetch(u_ev, ivec2(0), 0).r);
  }
  if (u_hasGrade != 0) {
    c *= u_whiteBalance;
    vec3 safeGamma = max(u_gamma, vec3(1e-3));
    c = pow(max(c * u_gain + u_lift, vec3(0.0)), vec3(1.0) / safeGamma);
    float s = clamp(log2(max(gradeLuma(c), 1e-6) / 0.18) / 8.0 + 0.5, 0.0, 1.0);
    c *= u_shadows * (1.0 - s) * (1.0 - s)
       + u_midtones * 2.0 * s * (1.0 - s)
       + u_highlights * s * s;
  }
  outColor = vec4(c, src.a);
}
`,jr=[.390405,.549941,.00892632,.0708416,.963172,.00135775,.0231082,.128021,.936245],Xr=[2.85847,-1.62879,-.024891,-.210182,1.1582,324281e-9,-.041812,-.118169,1.06867],nt=[.949237,1.03542,1.08728];function Dt(e,t){return[e[0]*t[0]+e[1]*t[1]+e[2]*t[2],e[3]*t[0]+e[4]*t[1]+e[5]*t[2],e[6]*t[0]+e[7]*t[1]+e[8]*t[2]]}function qr(e,t){const i=1*e/t,o=1*(1-e-t)/t;return[.7328*i+.4296*1-.1624*o,-.7036*i+1.6975*1+.0061*o,.003*i+.0136*1+.9834*o]}const Pt=(e,t,r)=>Math.min(r,Math.max(t,e));function Zr(e,t){const r=Pt(Number.isFinite(e)?e:0,-1,1),i=Pt(Number.isFinite(t)?t:0,-1,1);if(r===0&&i===0)return[1,1,1];const o=r*100/65,a=i*100/65,u=.31271-o*(o<0?.1:.05),c=2.87*u-3*u*u-.27509507+a*.05,s=qr(u,c),n=[nt[0]/s[0],nt[1]/s[1],nt[2]/s[2]],h=Dt(jr,[1,1,1]),T=Dt(Xr,[h[0]*n[0],h[1]*n[1],h[2]*n[2]]),E=.2126*T[0]+.7152*T[1]+.0722*T[2],L=E>1e-6?1/E:1;return[Math.max(0,T[0]*L),Math.max(0,T[1]*L),Math.max(0,T[2]*L)]}function ze(e,t){const r=(i,o)=>typeof i=="number"&&Number.isFinite(i)?i:o;if(typeof e=="number"&&Number.isFinite(e))return[e,e,e];if(Array.isArray(e)&&e.length>=3)return[r(e[0],t[0]),r(e[1],t[1]),r(e[2],t[2])];if(e&&typeof e=="object"&&"r"in e){const i=e;return[r(i.r,t[0]),r(i.g,t[1]),r(i.b,t[2])]}return t}const _e=[1,1,1],Rt=[0,0,0],Pe=(e,t)=>e[0]===t[0]&&e[1]===t[1]&&e[2]===t[2];function Wr(e){if(!e||typeof e!="object"||e.enabled===!1)return null;const t={whiteBalance:Zr(e.temperature??0,e.tint??0),lift:ze(e.lift,Rt),gamma:ze(e.gamma,_e).map(i=>Math.max(.001,i)),gain:ze(e.gain,_e).map(i=>Math.max(0,i)),shadows:ze(e.shadows,_e).map(i=>Math.max(0,i)),midtones:ze(e.midtones,_e).map(i=>Math.max(0,i)),highlights:ze(e.highlights,_e).map(i=>Math.max(0,i))};return Pe(t.whiteBalance,_e)&&Pe(t.lift,Rt)&&Pe(t.gamma,_e)&&Pe(t.gain,_e)&&Pe(t.shadows,_e)&&Pe(t.midtones,_e)&&Pe(t.highlights,_e)?null:t}const Yt=`#version 300 es
precision highp float;
`,Yr=`${Yt}
uniform sampler2D u_color;           // reflection source: history (u_reproject = 1) or this frame's HDR
uniform highp sampler2D u_linearDepth; // full-res S1 linear depth (.r, metres)
uniform mat4 u_projection;           // this frame's projection
uniform mat4 u_viewToPrevClip;       // prevViewProj · inv(view); used when u_reproject = 1
uniform int u_reproject;
uniform int u_ortho;
uniform float u_far;
uniform float u_maxDistance;         // metres along the reflected ray
uniform float u_thickness;           // metres behind the depth buffer that still count as a hit
uniform float u_roughness;           // surface roughness hint; cutoff 0.5
out vec4 o_color;

#ifndef AURA_SSR_STEPS
#define AURA_SSR_STEPS 24
#endif

float linearDepthAt(vec2 uv) {
  ivec2 size = textureSize(u_linearDepth, 0);
  ivec2 p = clamp(ivec2(uv * vec2(size)), ivec2(0), size - 1);
  return texelFetch(u_linearDepth, p, 0).r;
}

vec3 viewPosition(vec2 uv, float z) {
  vec2 ndc = uv * 2.0 - 1.0;
  if (u_ortho == 1) {
    return vec3((ndc.x - u_projection[3][0]) / u_projection[0][0], (ndc.y - u_projection[3][1]) / u_projection[1][1], -z);
  }
  return vec3(ndc.x * z / u_projection[0][0], ndc.y * z / u_projection[1][1], -z);
}

vec2 projectToUv(vec3 viewPos) {
  vec4 clip = u_projection * vec4(viewPos, 1.0);
  return clip.w != 0.0 ? clip.xy / clip.w * 0.5 + 0.5 : vec2(-1.0);
}

void main() {
  vec2 halfSize = vec2(textureSize(u_linearDepth, 0)) * 0.5;
  vec2 uv = gl_FragCoord.xy / halfSize;
  float z = linearDepthAt(uv);
  if (z <= 0.0 || z >= u_far * 0.999) { o_color = vec4(0.0); return; }
  vec2 texel = 1.0 / vec2(textureSize(u_linearDepth, 0));
  vec3 p = viewPosition(uv, z);
  vec3 px = viewPosition(uv + vec2(texel.x, 0.0), linearDepthAt(uv + vec2(texel.x, 0.0)));
  vec3 py = viewPosition(uv + vec2(0.0, texel.y), linearDepthAt(uv + vec2(0.0, texel.y)));
  vec3 n = normalize(cross(px - p, py - p));
  vec3 v = u_ortho == 1 ? vec3(0.0, 0.0, -1.0) : normalize(p);
  if (dot(n, v) > 0.0) n = -n;
  vec3 r = normalize(reflect(v, n));

  float roughnessGate = 1.0 - smoothstep(0.35, 0.5, u_roughness);
  // Rays heading back toward the camera leave the screen or hit back faces.
  float facing = 1.0 - smoothstep(0.0, 0.6, r.z);
  if (roughnessGate <= 0.0 || facing <= 0.0) { o_color = vec4(0.0); return; }

  float stepLength = u_maxDistance / float(AURA_SSR_STEPS);
  vec3 prev = p;
  vec3 hitPos = p;
  vec2 hitUv = vec2(-1.0);
  float travelled = 0.0;
  bool prevBehind = false;
  for (int i = 1; i <= AURA_SSR_STEPS; ++i) {
    vec3 q = p + r * (stepLength * float(i));
    vec2 quv = projectToUv(q);
    if (quv.x < 0.0 || quv.x > 1.0 || quv.y < 0.0 || quv.y > 1.0) break;
    float sceneZ = linearDepthAt(quv);
    float rayZ = -q.z;
    bool behind = rayZ > sceneZ;
    // A crossing (in front at the last sample, behind now) is refined first and
    // the thickness test applies to the refined point: a step longer than
    // u_thickness (24 steps over 18 m = 0.75 m) otherwise lands inside or past
    // anything thinner than the step and the hit is lost.
    if (behind && !prevBehind) {
      vec3 a = prev;
      vec3 b = q;
      for (int j = 0; j < 4; ++j) {
        vec3 m = 0.5 * (a + b);
        vec2 muv = projectToUv(m);
        if (-m.z > linearDepthAt(muv)) b = m; else a = m;
      }
      vec2 buv = projectToUv(b);
      if (-b.z - linearDepthAt(buv) < u_thickness) {
        hitPos = b;
        hitUv = buv;
        // Refined distance, not the step index: the index quantised the fade into one band per step
        // (drift-and-deliver-port's 60 m / 24-step wet road showed regular stripes; GU47 phase 2).
        travelled = clamp(length(b - p) / u_maxDistance, 0.0, 1.0);
        break;
      }
    }
    prevBehind = behind;
    prev = q;
  }
  if (hitUv.x < 0.0) { o_color = vec4(0.0); return; }

  vec2 sourceUv = hitUv;
  if (u_reproject == 1) {
    vec4 prevClip = u_viewToPrevClip * vec4(hitPos, 1.0);
    sourceUv = prevClip.w > 0.0 ? prevClip.xy / prevClip.w * 0.5 + 0.5 : hitUv;
  }
  vec2 edge = abs(sourceUv * 2.0 - 1.0);
  float edgeFade = 1.0 - smoothstep(0.85, 1.0, max(edge.x, edge.y));
  float distanceFade = 1.0 - travelled * travelled;
  float cosTheta = clamp(dot(-v, n), 0.0, 1.0);
  float fresnel = 0.04 + 0.96 * pow(1.0 - cosTheta, 5.0);
  float confidence = clamp(edgeFade * distanceFade * facing * roughnessGate * fresnel, 0.0, 1.0);
  vec3 radiance = textureLod(u_color, clamp(sourceUv, vec2(0.0), vec2(1.0)), 0.0).rgb;
  o_color = vec4(radiance, confidence);
}
`,Kr=`${Yt}
uniform sampler2D u_color;      // full-res HDR
uniform sampler2D u_reflection; // half-res trace (.a = confidence)
uniform float u_intensity;
out vec4 o_color;

void main() {
  ivec2 pixel = ivec2(gl_FragCoord.xy);
  vec4 src = texelFetch(u_color, pixel, 0);
  vec4 refl = texture(u_reflection, (vec2(pixel) + 0.5) / vec2(textureSize(u_color, 0)));
  o_color = vec4(src.rgb + refl.rgb * refl.a * u_intensity, src.a);
}
`,Jr=24,Qr=.25,ei=`#version 300 es
precision highp float;
uniform sampler2D u_color;
uniform vec2 u_resolution;
in vec2 v_uv;
out vec4 outColor;

float a3dColorDifference(vec4 a, vec4 b) {
  vec4 d = abs(a - b);
  return max(max(d.r, d.g), max(d.b, d.a));
}

vec4 SMAAColorEdgeDetectionPS(vec2 uv) {
  vec4 center = texture(u_color, uv);
  float left = a3dColorDifference(center, texture(u_color, uv - vec2(u_resolution.x, 0.0)));
  float right = a3dColorDifference(center, texture(u_color, uv + vec2(u_resolution.x, 0.0)));
  float down = a3dColorDifference(center, texture(u_color, uv - vec2(0.0, u_resolution.y)));
  float up = a3dColorDifference(center, texture(u_color, uv + vec2(0.0, u_resolution.y)));
  float localMax = max(max(left, right), max(down, up));
  vec2 contrast = vec2(left, down);
  vec2 strength = smoothstep(vec2(0.04), vec2(0.10), contrast);
  strength *= step(vec2(localMax * 0.35), contrast);
  return vec4(strength, 0.0, 1.0);
}

void main() {
  outColor = SMAAColorEdgeDetectionPS(v_uv);
}
`,ti=`#version 300 es
precision highp float;
uniform sampler2D u_edges;
uniform sampler2D u_area;
uniform sampler2D u_search;
uniform vec2 u_resolution;
in vec2 v_uv;
out vec4 outColor;

// Each edge run has a maximum of eight neighbors in either direction.
const int A3D_MAX_EDGE_RUN = 8;
bool a3dInside(vec2 uv) {
  return all(greaterThanEqual(uv, vec2(0.0))) && all(lessThanEqual(uv, vec2(1.0)));
}

float a3dEdge(vec2 uv, bool vertical) {
  if (!a3dInside(uv)) return 0.0;
  vec2 edge = textureLod(u_edges, uv, 0.0).rg;
  return vertical ? edge.r : edge.g;
}

float a3dEdgeWeight(vec2 uv, bool vertical) {
  float strength = a3dEdge(uv, vertical);
  if (strength <= 0.0) return 0.0;
  vec2 tangent = vertical ? vec2(0.0, u_resolution.y) : vec2(u_resolution.x, 0.0);
  int negative = 0;
  int positive = 0;
  for (int i = 1; i <= A3D_MAX_EDGE_RUN; ++i) {
    if (a3dEdge(uv - tangent * float(i), vertical) <= 0.0) break;
    negative = i;
  }
  for (int i = 1; i <= A3D_MAX_EDGE_RUN; ++i) {
    if (a3dEdge(uv + tangent * float(i), vertical) <= 0.0) break;
    positive = i;
  }
  // Infinite-looking axis-aligned edges already coincide with pixel borders.
  if (negative == A3D_MAX_EDGE_RUN && positive == A3D_MAX_EDGE_RUN) return 0.0;
  float index = float(negative + (A3D_MAX_EDGE_RUN + 1) * positive);
  float area = textureLod(u_area, vec2((index + 0.5) / 81.0, 0.5), 0.0).r;
  float response = textureLod(u_search, vec2((strength * 255.0 + 0.5) / 256.0, 0.5), 0.0).r;
  return 0.25 * area * response;
}

vec4 SMAABlendingWeightCalculationPS(vec2 uv) {
  // Store each boundary once. Its neighbour fetches the same weight, so
  // blending on the two sides is symmetric without repeating the run search.
  return vec4(a3dEdgeWeight(uv, true), a3dEdgeWeight(uv, false), 0.0, 0.0);
}

void main() {
  outColor = SMAABlendingWeightCalculationPS(v_uv);
}
`,ri=`#version 300 es
precision highp float;
uniform sampler2D u_weights;
uniform sampler2D u_color;
uniform vec2 u_resolution;
in vec2 v_uv;
out vec4 outColor;

vec3 a3dToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}
vec3 a3dToDisplay(vec3 c) {
  c = max(c, vec3(0.0));
  return mix(12.92 * c, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}

vec4 SMAANeighborhoodBlendingPS(vec2 uv) {
  vec4 center = texture(u_color, uv);
  vec2 here = texture(u_weights, uv).rg;
  float right = texture(u_weights, uv + vec2(u_resolution.x, 0.0)).r;
  float up = texture(u_weights, uv + vec2(0.0, u_resolution.y)).g;
  float weight = here.r;
  vec2 offset = vec2(-u_resolution.x, 0.0);
  if (right > weight) { weight = right; offset = vec2(u_resolution.x, 0.0); }
  if (here.g > weight) { weight = here.g; offset = vec2(0.0, -u_resolution.y); }
  if (up > weight) { weight = up; offset = vec2(0.0, u_resolution.y); }
  if (weight <= 0.0) return center;
  vec4 other = texture(u_color, uv + offset);
  float alpha = mix(center.a, other.a, weight);
  if (alpha <= 1e-8) return vec4(0.0);
  // RGB is straight alpha on input/output. Interpolate associated linear
  // light so hidden colours in transparent texels cannot bleed into edges.
  vec3 premultiplied = mix(a3dToLinear(center.rgb) * center.a,
                           a3dToLinear(other.rgb) * other.a, weight);
  return vec4(a3dToDisplay(premultiplied / alpha), alpha);
}

void main() {
  outColor = SMAANeighborhoodBlendingPS(v_uv);
}
`;function ii(e){return`c${e.contrast}|s${e.saturation}|v${e.vibrance}|i${e.lutIntensity}|u${String(e.userLut)}`}class oi{constructor(t,r,i={}){this.bake=t,this.destroy=r,this.maxEntries=i.maxEntries!==void 0&&i.maxEntries>=1?Math.floor(i.maxEntries):Number.POSITIVE_INFINITY}bake;destroy;entries=new Map;maxEntries;bakeCount=0;acquire(t){const r=ii(t),i=this.entries.get(r);if(i!==void 0)return this.entries.delete(r),this.entries.set(r,i),i;const o=this.bake(t);for(this.entries.set(r,o),this.bakeCount+=1;this.entries.size>this.maxEntries;){const a=this.entries.keys().next().value,u=this.entries.get(a);this.entries.delete(a),this.destroy(u)}return o}get size(){return this.entries.size}clear(){for(const t of this.entries.values())this.destroy(t);this.entries.clear()}}const It=65;function ct(e){const t=e.trim().split(/\s+/);if(t.length<3)return null;const r=[Number(t[0]),Number(t[1]),Number(t[2])];return r.every(i=>Number.isFinite(i))?r:null}function ai(e){let t=null,r=[0,0,0],i=[1,1,1];const o=[];for(const u of e.split(/\r?\n/)){const c=u.trim();if(c.length===0||c.startsWith("#"))continue;const s=c.split(/\s+/)[0],n=c.slice(s.length).trim();if(s==="LUT_1D_SIZE")throw new Error(`CUBE_LUT_1D_UNSUPPORTED: 1-D LUTs cannot bake into the display-grade TEXTURE_3D (size ${n}).`);if(s==="LUT_3D_SIZE"){const T=Number(n);if(!Number.isInteger(T)||T<=0)throw new Error(`CUBE_LUT_SIZE_INVALID: ${n}`);if(T>It)throw new Error(`CUBE_LUT_SIZE_INVALID: 3-D size ${T} exceeds ${It}.`);t=T;continue}if(s==="DOMAIN_MIN"){const T=ct(n);T&&(r=T);continue}if(s==="DOMAIN_MAX"){const T=ct(n);T&&(i=T);continue}if(s==="TITLE"||s==="LUT_1D_INPUT_RANGE"||s==="LUT_3D_INPUT_RANGE")continue;const h=ct(c);if(!h)throw new Error(`CUBE_LUT_MALFORMED: unrecognised line "${c.slice(0,48)}".`);o.push(h)}if(t===null)throw new Error("CUBE_LUT_MALFORMED: missing LUT_3D_SIZE.");if(o.length!==t*t*t)throw new Error(`CUBE_LUT_MALFORMED: expected ${t*t*t} data rows for size ${t}, found ${o.length}.`);const a=new Float32Array(t*t*t*4);for(let u=0;u<o.length;u+=1){const[c,s,n]=o[u],h=u*4;a[h]=(c-r[0])/(i[0]-r[0]),a[h+1]=(s-r[1])/(i[1]-r[1]),a[h+2]=(n-r[2])/(i[2]-r[2]),a[h+3]=1}return{size:t,data:a}}const st=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]),ut=`#version 300 es
out vec2 v_uv;
void main() {
  vec2 p = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
  v_uv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}
`,we=new WeakMap;function ft(e,t){for(const r of we.get(e)??[])r(t)}function f(e){const t=e;if(!t.framebuffer||!t.colorHandle)throw new Q("v2 post stages require WebGL2 render targets.","POST_GRAPH_V2_UNSUPPORTED");return t}function ni(e,t){const r=e.createTexture();if(!r)throw new Q("LUT texture allocation failed.","POST_GRAPH_V2_UNSUPPORTED");const i=t.size,o=new Uint8Array(i*i*i*4);for(let a=0;a<o.length;a+=1){const u=t.data[a]??1;o[a]=Math.round(Math.min(1,Math.max(0,Number.isFinite(u)?u:0))*255)}return e.bindTexture(e.TEXTURE_3D,r),e.pixelStorei(e.UNPACK_FLIP_Y_WEBGL,!1),e.pixelStorei(e.UNPACK_PREMULTIPLY_ALPHA_WEBGL,!1),e.pixelStorei(e.UNPACK_ALIGNMENT,4),e.texImage3D(e.TEXTURE_3D,0,e.RGBA8,i,i,i,0,e.RGBA,e.UNSIGNED_BYTE,o),e.texParameteri(e.TEXTURE_3D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_3D,e.TEXTURE_MAG_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_3D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_3D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_3D,e.TEXTURE_WRAP_R,e.CLAMP_TO_EDGE),e.bindTexture(e.TEXTURE_3D,null),r}function ci(e,t,r,i){if(!r||typeof r!="object")return null;const o=r;if(typeof o.source!="string"||typeof o.cube!="string"&&!o.data)return o.status==="failed"&&At(`LUT_PENDING:${String(o.source)}`,i),ke(`${o.status==="failed"?"LUT_UNAVAILABLE":"LUT_PENDING"}:${String(o.source)}`,i),null;if(At(`LUT_PENDING:${o.source}`,i),t.lutFailed.has(o.source))return null;const a=e.gl;t.lutCache??=new oi(()=>{const u=t.lutBaking,c=ni(a,u.data??ai(u.cube));return t.lutTextures.add(c),c},u=>{a.deleteTexture(u),t.lutTextures.delete(u)},{maxEntries:4}),t.lutBaking=o;try{const u=t.lutCache.acquire({contrast:1,saturation:1,vibrance:0,lutIntensity:1,userLut:o.source}),c=typeof o.intensity=="number"&&Number.isFinite(o.intensity)?Math.min(1,Math.max(0,o.intensity)):1;return{texture:u,bypass:1-c}}catch(u){t.lutFailed.add(o.source);const c=u instanceof Error?/^[A-Z0-9_]+/.exec(u.message)?.[0]??"LUT_UPLOAD_FAILED":"LUT_UPLOAD_FAILED";return ke(`LUT_INVALID:${o.source}:${c}`,i),null}finally{t.lutBaking=void 0}}const pe=new WeakMap;class si extends AggregateError{constructor(t,r,i){super([t,...r],"v2 post initialization rollback failed",{cause:t}),this.retryCleanup=i,this.name="PostV2InitializationRollbackError"}retryCleanup}const ge=new WeakMap,Re=new WeakMap,Ct=new WeakMap;function dt(e){let t=Ct.get(e);t||(t={cleanupOwner:e,releaseView:(r,i)=>wi(e,r,i),releaseScope:r=>Ai(e,r),dispose:()=>Ui(e)},Ct.set(e,t)),dr(e,t)}function Kt(e){let t=ge.get(e);return t||(t={actions:new Set,running:!1},ge.set(e,t)),t}function pt(e,t,r,i){const o=[];if(t.running)return i?.(o),o;const a=new Set(r),u=new Set([...t.actions].filter(c=>!a.has(c)));t.running=!0;try{for(const c of t.actions)if(!u.has(c))try{c.release(),t.actions.delete(c)}catch(s){o.push(s)}i?.(o)}finally{t.running=!1,t.actions.size===0&&ge.get(e)===t&&ge.delete(e)}return o}function ui(e,t){const r=ge.get(e);if(!r)return;if(r.running)throw new Error("POSTPROCESS_CLEANUP_IN_PROGRESS");const i=pt(e,r,t,o=>{if(ge.get(e)?.actions.size)try{dt(e)}catch(a){o.push(a)}});if(i.length)throw new AggregateError(i,"v2 post initialization cleanup retry failed")}function Ke(e){const t=pe.get(e);if(t)return t;if(Re.has(e))throw new Error("POSTPROCESS_STATE_INITIALIZING");const r=e.gl,i=e.device,o={invalidated:!1},a=[];let u;Re.set(e,o);const c=()=>{if(o.invalidated||Re.get(e)!==o||pe.has(e)||e.gl!==r||e.device!==i)throw new Error("POSTPROCESS_STATE_INVALIDATED");if(e.disposed||i.disposed)throw new Q("Cannot initialize post resources on a disposed device.","DISPOSED_DEVICE");if(e.contextLost||i.contextLost||i.isDeviceLost?.())throw new Q("Cannot initialize post resources while the device is lost.","CONTEXT_LOST");if(i.generation!==u||o.invalidated||Re.get(e)!==o||e.gl!==r||e.device!==i)throw new Error("POSTPROCESS_STATE_INVALIDATED")},s=n=>{n(),c()};try{dt(e),u=i.generation,c();const n=r.createVertexArray();if(n&&a.push({release:()=>r.deleteVertexArray(n)}),c(),!n)throw new Q("v2 post stage GL object allocation failed.","POST_GRAPH_V2_UNSUPPORTED");const h=r.createTexture();if(h&&a.push({release:()=>r.deleteTexture(h)}),c(),!h)throw new Q("v2 post stage GL object allocation failed.","POST_GRAPH_V2_UNSUPPORTED");s(()=>r.bindTexture(r.TEXTURE_3D,h));const T=4,E=new Uint8Array(T*T*T*4);for(let k=0;k<T;k++)for(let te=0;te<T;te++)for(let ae=0;ae<T;ae++){const z=((k*T+te)*T+ae)*4;E[z]=Math.round(ae/(T-1)*255),E[z+1]=Math.round(te/(T-1)*255),E[z+2]=Math.round(k/(T-1)*255),E[z+3]=255}s(()=>r.texImage3D(r.TEXTURE_3D,0,r.RGBA8,T,T,T,0,r.RGBA,r.UNSIGNED_BYTE,E)),s(()=>r.texParameteri(r.TEXTURE_3D,r.TEXTURE_MIN_FILTER,r.LINEAR)),s(()=>r.texParameteri(r.TEXTURE_3D,r.TEXTURE_MAG_FILTER,r.LINEAR)),s(()=>r.texParameteri(r.TEXTURE_3D,r.TEXTURE_WRAP_S,r.CLAMP_TO_EDGE)),s(()=>r.texParameteri(r.TEXTURE_3D,r.TEXTURE_WRAP_T,r.CLAMP_TO_EDGE)),s(()=>r.texParameteri(r.TEXTURE_3D,r.TEXTURE_WRAP_R,r.CLAMP_TO_EDGE)),s(()=>r.bindTexture(r.TEXTURE_3D,null));const L=r.createTexture();L&&L!==h&&a.push({release:()=>r.deleteTexture(L)}),c(),L&&(s(()=>r.bindTexture(r.TEXTURE_2D,L)),s(()=>r.texImage2D(r.TEXTURE_2D,0,r.RGBA8,1,1,0,r.RGBA,r.UNSIGNED_BYTE,new Uint8Array([0,0,0,0]))),s(()=>r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MIN_FILTER,r.NEAREST)),s(()=>r.texParameteri(r.TEXTURE_2D,r.TEXTURE_MAG_FILTER,r.NEAREST)),s(()=>r.bindTexture(r.TEXTURE_2D,null)));const G=new xr(i,Ft(i));a.push({release:()=>G.dispose()}),c();const Z={device:i,programs:new Map,vao:n,pool:G,identityLut:h,blankTex:L??h,frameIndex:0,legacyPostBlackboard:new Map,tokenPostBlackboards:new WeakMap,scopedPostBlackboards:new WeakMap,effectHistory:new Tt,exposureHistory:new Tt,legacyExposureScope:{},timeSeconds:0,smaa:{area:null,search:null,requested:!1},lutTextures:new Set,lutFailed:new Set};return c(),pe.set(e,Z),Z}catch(n){const h=a.length?Kt(e):ge.get(e);if(h)for(const L of a)h.actions.add(L);const E=h?pt(e,h,a,L=>{if(a.length)try{e.stateCache?.invalidate()}catch(G){L.push(G)}if(o.invalidated&&ge.get(e)?.actions.size)try{dt(e)}catch(G){L.push(G)}}):[];throw E.length?new si(n,E,()=>ui(e,a)):n}finally{Re.get(e)===o&&Re.delete(e)}}function li(e){const t=[1,.96,.9];let r;if(Array.isArray(e))r=e;else if(e&&typeof e=="object"){const i=e;r=[i.r,i.g,i.b]}return r?[0,1,2].map(i=>typeof r[i]=="number"&&Number.isFinite(r[i])?r[i]:t[i]):t}function fi(e){const t=e&&typeof e=="object"?e:{},r=(o,a,u,c)=>{const s=t[o];return typeof s=="number"&&Number.isFinite(s)?Math.min(c,Math.max(u,s)):a},i=r("steps",Jr,1,64);return{intensity:r("intensity",.9,0,2),maxDistance:r("maxDistance",18,.5,200),roughness:r("roughness",0,0,1),thickness:r("thickness",Qr,.01,10),steps:i<=16?16:i<=24?24:32}}function di(e){return typeof e=="number"&&Number.isFinite(e)?Math.min(1,Math.max(.05,e)):1}function mi(e){return typeof e=="number"&&Number.isFinite(e)?Math.min(1,Math.max(0,e)):0}function vi(e){if(!e||!Number.isFinite(e.bandCenter)||!Number.isFinite(e.bandWidth))return[0,0,0,0];const t=typeof e.angleDeg=="number"&&Number.isFinite(e.angleDeg)?e.angleDeg:0;return[Math.min(1,Math.max(0,e.bandCenter)),Math.min(1,Math.max(0,e.bandWidth)),t*Math.PI/180,1]}function Be(e,t){const r=Object.entries(t).map(([o,a])=>`#define ${o} ${a}`).join(`
`),i=/^\s*#version[^\n]*\n/.exec(e);return i?`${i[0]}${r}
${e.slice(i[0].length)}`:`${r}
${e}`}function C(e,t,r,i){const o=e.programs.get(r);if(o)return o;const a=(n,h)=>{const T=t.createShader(n);if(t.shaderSource(T,h),t.compileShader(T),!t.getShaderParameter(T,t.COMPILE_STATUS)){const E=t.getShaderInfoLog(T);throw t.deleteShader(T),bt({code:"SHADER_COMPILE_FAILED",details:{log:E??"",stage:n===t.VERTEX_SHADER?"vertex":"fragment"}},{name:`post:${r}`,shaderKey:`post:${r}`},{vertex:ut,fragment:i},"skip","The post stage falls back to the legacy chain; the failing pass is not applied.",wt(e.device)),new Q(`v2 post shader compile failed: ${E}`,"POST_GRAPH_V2_UNSUPPORTED",{key:r})}return T},u=a(t.VERTEX_SHADER,ut),c=a(t.FRAGMENT_SHADER,i),s=t.createProgram();if(t.attachShader(s,u),t.attachShader(s,c),t.deleteShader(u),t.deleteShader(c),t.linkProgram(s),!t.getProgramParameter(s,t.LINK_STATUS)){const n=t.getProgramInfoLog(s);throw t.deleteProgram(s),bt({code:"SHADER_LINK_FAILED",details:{log:n??""}},{name:`post:${r}`,shaderKey:`post:${r}`},{vertex:ut,fragment:i},"skip","The post stage falls back to the legacy chain; the failing pass is not applied.",wt(e.device)),new Q(`v2 post program link failed: ${n}`,"POST_GRAPH_V2_UNSUPPORTED",{key:r})}return e.programs.set(r,s),s}function Ze(e){e.colorMask(!0,!0,!0,!0),e.disable(e.SCISSOR_TEST),e.disable(e.STENCIL_TEST),e.disable(e.CULL_FACE),e.disable(e.POLYGON_OFFSET_FILL),e.disable(e.DEPTH_TEST),e.disable(e.BLEND),e.depthMask(!1)}function M(e,t,r,i,o,a,u){const c=e.gl;c.bindFramebuffer(c.FRAMEBUFFER,i.framebuffer),c.viewport(0,0,i.width,i.height),c.useProgram(r),c.bindVertexArray(t.vao),Ze(c),c.disable(c.DEPTH_TEST),c.disable(c.BLEND);for(let s=0;s<o.length;s++)c.activeTexture(c.TEXTURE0+s),c.bindTexture(c.TEXTURE_2D,o[s]),c.bindSampler(s,null);try{a(c),Jt(e,t,i),u?.(),ft(e,i),c.drawArrays(c.TRIANGLES,0,3)}catch(s){throw e.stateCache.invalidate(),s}finally{for(let s=0;s<o.length;s++)c.activeTexture(c.TEXTURE0+s),c.bindTexture(c.TEXTURE_2D,null);c.bindVertexArray(null)}}function Jt(e,t,r){if(pe.get(e)!==t||t.device!==e.device||e.device.disposed||e.device.contextLost||r.disposed)throw new Error("POSTPROCESS_STATE_INVALIDATED")}const hi=.5;function zt(e,t,r,i,o,a){const u=e.gl;if(!a){if(!o)return;const s=C(t,u,"exposure-mul",Vr);M(e,t,s,f(r),[f(i).colorHandle,f(o).colorHandle],n=>{n.uniform1i(n.getUniformLocation(s,"u_hdr"),0),n.uniform1i(n.getUniformLocation(s,"u_ev"),1)});return}const c=C(t,u,"hdr-grade",$r);M(e,t,c,f(r),[f(i).colorHandle,o?f(o).colorHandle:t.blankTex],s=>{s.uniform1i(s.getUniformLocation(c,"u_hdr"),0),s.uniform1i(s.getUniformLocation(c,"u_ev"),1),s.uniform1i(s.getUniformLocation(c,"u_hasEv"),o?1:0),s.uniform1i(s.getUniformLocation(c,"u_hasGrade"),1),pi(s,c,a)})}function pi(e,t,r){const i=(o,a)=>{e.uniform3f(e.getUniformLocation(t,o),a[0],a[1],a[2])};i("u_whiteBalance",r.whiteBalance),i("u_lift",r.lift),i("u_gamma",r.gamma),i("u_gain",r.gain),i("u_shadows",r.shadows),i("u_midtones",r.midtones),i("u_highlights",r.highlights)}function _i(e){const t=e&&typeof e=="object"?e.mips:void 0;return typeof t=="number"&&Number.isFinite(t)?`-${t}mips`:""}function gi(e,t=!1,r=!1){return`#version 300 es
precision highp float;
uniform sampler2D u_color;
uniform sampler2D u_depthLinear;
uniform sampler2D u_velocity;
${t?`uniform highp sampler2D u_reactive;
`:""}${r?`uniform highp sampler2D u_normal;
`:""}uniform vec2 u_texelSize;
uniform float u_time;
in vec2 v_uv;
out vec4 outColor;
`+e}function Je(e,t,r){const i=new Set,o=[];for(const a of[...e.customPasses??[],...ur()])if(a.postScopeMatches?.(r??t?.scopeId)!==!1&&!i.has(a.id)){i.add(a.id);try{lr(a)}catch{ke(`POSTPROCESS_SPACE_INVALID:${a.id}`,t);continue}o.push(a)}return o}const Mt=e=>typeof e.order=="number"&&Number.isFinite(e.order)?e.order:Number.MAX_SAFE_INTEGER;function Qt(e,t){return e.filter(r=>r.insertAt===t).sort((r,i)=>Mt(r)-Mt(i))}function xi(e,t){if(t?.diagnosticToken){let o=e.tokenPostBlackboards.get(t.diagnosticToken);return o||(o=new Map,e.tokenPostBlackboards.set(t.diagnosticToken,o)),o}if(!t?.scopeId||t.viewId===void 0||!Number.isSafeInteger(t.frameId)||t.frameId<0)return e.legacyPostBlackboard;let r=e.scopedPostBlackboards.get(t.scopeId);r||(r=new Map,e.scopedPostBlackboards.set(t.scopeId,r));let i=r.get(t.viewId);return(!i||i.frameId!==t.frameId)&&(i={frameId:t.frameId,board:new Map},r.set(t.viewId,i)),i.board}function Si(e,t,r,i,o,a){return{device:t.device,width:r,height:i,frameIndex:a?.frameId??e.frameIndex,postScopeId:a?.scopeId,timeSeconds:a?.timeSeconds??e.timeSeconds,camera:o??null,source:a?.source??{},items:a?.items??[],tier:mr.high,flags:Ft(t.device),sceneDepth:a?.sceneDepth??{texture:null,available:!1,linearize:{near:o?.near??.1,far:o?.far??1e3,orthographic:o?.projection==="orthographic"}},blackboard:xi(e,a)}}function er(e,t,r,i,o){const a=t?.v2,u=a?.reactive;if(!(!t||!a||!u))return{bindings:t,v2:a,target:u,texture:u.colorTexture,handle:u.colorHandle,width:r,height:i,device:e.device,generation:e.device.generation,frameToken:e.device.activeFrameToken,context:o,scopeId:o?.scopeId,viewId:o?.viewId,frameId:o?.frameId,contextGeneration:o?.deviceGeneration}}function Ae(e,t,r,i){const o=h=>{throw new Error(`POSTPROCESS_INPUT_UNAVAILABLE:${r}:reactive:${h}`)};if(!t)return o("missing");const{target:a,texture:u,handle:c,context:s}=t;if(!t.frameToken||t.generation===void 0||!Number.isSafeInteger(t.generation)||t.generation<0||t.device!==e.device||e.device.disposed||e.device.contextLost||e.device.generation!==t.generation||e.device.activeFrameToken!==t.frameToken||t.bindings.v2!==t.v2||t.v2.reactive!==a||s&&(s.scopeId!==t.scopeId||s.viewId!==t.viewId||s.frameId!==t.frameId||s.deviceGeneration!==t.contextGeneration))return o("stale-frame");if(!u||!c||a.disposed||u.disposed||a.colorTexture!==u||a.colorHandle!==c||a.width!==t.width||a.height!==t.height||(a.dimension??"2d")!=="2d"||u.dimension!=="2d"||Ht(u)!==e.device||e.textureRegistry?.textures.get(u)!==c)return o("attachment");let n;try{n=qe(a)}catch{return o("attachment")}if(n.texture!==u||n.mipLevel!==0||n.layer!==0||n.sampleCount!==1||!u.usage.includes("sampled")||u.colorSpace!=="linear"||n.format!=="rgba8"&&n.format!=="rgba16f"&&n.format!=="rgba32f")return o("attachment");if(i){if(i===a||i.colorHandle===c)return o("alias");try{Gt([n],[qe(i)])}catch{return o("alias")}}}function Li(e,t,r,i,o){if(!t||!Bt(t,e.device,r,i,o))return;const a=t.velocity;return{bindings:t,target:a,texture:a.colorTexture,handle:a.colorHandle,width:r,height:i,context:o,scopeId:o?.scopeId,viewId:o?.viewId,frameId:o?.frameId,contextGeneration:o?.deviceGeneration,...t.v2?.reactive?{reactive:er(e,t,r,i,o)}:{}}}function Ei(e,t,r=[]){const i=()=>{throw new Q("Expected previous depth attachment is stale or aliases another pass","TEMPORAL_EXPECTED_DEPTH_STALE")},{bindings:o,target:a,texture:u,handle:c,context:s}=t;if(!Bt(o,e.device,t.width,t.height,s)||!c||a.colorTexture!==u||a.colorHandle!==c||e.textureRegistry?.textures.get(u)!==c||Ht(u)!==e.device||s&&(s.scopeId!==t.scopeId||s.viewId!==t.viewId||s.frameId!==t.frameId||s.deviceGeneration!==t.contextGeneration))return i();const n=qe(a);if(t.reactive)try{Ae(e,t.reactive,"expected-depth")}catch{return i()}for(const h of r){if(h===a||h.colorHandle===c)return i();try{Gt([n],[qe(h)]),t.reactive&&h!==t.reactive.target&&Ae(e,t.reactive,"expected-depth",h)}catch{return i()}}}function Ve(e,t,r,i,o,a,u,c){return tr(e,t,r,i,f(o),a,u,c)}function tr(e,t,r,i,o,a,u,c){const s=e.gl,n=Si(t,e,o.width,o.height,u,c);if(i.enabled&&!i.enabled(n))return null;if(!i.fragment?.glsl?.trim())throw new Error(`POSTPROCESS_SHADER_UNAVAILABLE:${i.id}:webgl2`);for(const k of i.inputs)if(k==="depth"&&!a.linZ||k==="velocity"&&!a.velocity||k==="normal"&&!a.normal||k==="reactive"&&!a.reactive)throw new Error(`POSTPROCESS_INPUT_UNAVAILABLE:${i.id}:${k}`);const h=i.inputs.includes("depth"),T=i.inputs.includes("velocity"),E=i.inputs.includes("reactive"),L=i.inputs.includes("normal");E&&Ae(e,a.reactive,i.id),We(`custom:${i.id}@${i.insertAt}`,c?.diagnosticToken);const G=r.acquire({width:o.width,height:o.height,format:i.space==="display"?"rgba8":"rgba16f",samples:1,depth:!1}),Z=G.target;try{E&&Ae(e,a.reactive,i.id,Z);const k=C(t,s,`${E?"custom-reactive":"custom"}${L?"-normal":""}:${i.id}:${i.fragment.glsl}`,gi(i.fragment.glsl,E,L)),te=[o.colorHandle,h&&a.linZ?f(a.linZ).colorHandle:t.blankTex,T&&a.velocity?f(a.velocity).colorHandle:t.blankTex];E&&te.push(a.reactive.handle);const ae=te.length;return L&&te.push(f(a.normal).colorHandle),M(e,t,k,f(Z),te,z=>{z.uniform1i(z.getUniformLocation(k,"u_color"),0),z.uniform1i(z.getUniformLocation(k,"u_depthLinear"),1),z.uniform1i(z.getUniformLocation(k,"u_velocity"),2),E&&z.uniform1i(z.getUniformLocation(k,"u_reactive"),3),L&&z.uniform1i(z.getUniformLocation(k,"u_normal"),ae),z.uniform2f(z.getUniformLocation(k,"u_texelSize"),1/o.width,1/o.height),z.uniform1f(z.getUniformLocation(k,"u_time"),n.timeSeconds);const xe=i.uniforms?.(n);if(Jt(e,t,f(Z)),xe)for(const[Ie,se]of Object.entries(xe)){const ue=z.getUniformLocation(k,Ie);if(!ue)continue;const X=Array.isArray(se)?se:null;X?X.length===2?z.uniform2f(ue,X[0],X[1]):X.length===3?z.uniform3f(ue,X[0],X[1],X[2]):X.length>=4?z.uniform4f(ue,X[0],X[1],X[2],X[3]):z.uniform1f(ue,X[0]??0):z.uniform1f(ue,se)}},E?()=>{if(!i.inputs.includes("reactive"))throw new Error(`POSTPROCESS_INPUT_UNAVAILABLE:${i.id}:reactive:changed-pass`);Ae(e,a.reactive,i.id,Z)}:void 0),G}catch(k){try{r.release(G)}catch{}throw k}}function mt(e,t,r){const{near:i,far:o,orthographic:a,depth:u}=r;if(!Number.isFinite(i)||!a&&i<=0||!(o>i)||o!==1/0&&!Number.isFinite(o)||a&&!Number.isFinite(o)||u?.mode==="logarithmic"&&(i<=0||!Number.isFinite(o)))throw new Error("POSTPROCESS_DEPTH_RANGE_INVALID");let c=r.projectionMatrixInverse;if(!c){if(u&&(u.mode!=="standard"||u.clipRange!=="minus-one-to-one"))throw new Error("POSTPROCESS_PROJECTION_INVERSE_UNAVAILABLE");const s=Number.isFinite(o)?-(o+i)/(o-i):-1,n=Number.isFinite(o)?-2*o*i/(o-i):-2*i;if(a&&!Number.isFinite(o))throw new Error("POSTPROCESS_PROJECTION_INVERSE_UNAVAILABLE");const h=a?[1,0,0,0,0,1,0,0,0,0,-2/(o-i),0,0,0,-(o+i)/(o-i),1]:[1,0,0,0,0,1,0,0,0,0,s,-1,0,0,n,0];c=Float32Array.from(Me(h))}if(c.length!==16||!c.every(Number.isFinite))throw new Error("POSTPROCESS_PROJECTION_INVERSE_INVALID");e.uniform1f(e.getUniformLocation(t,"u_near"),i),e.uniform1f(e.getUniformLocation(t,"u_far"),Number.isFinite(o)?o:3e38),e.uniform1i(e.getUniformLocation(t,"u_ortho"),a?1:0),e.uniformMatrix4fv(e.getUniformLocation(t,"u_invProjMatrix"),!1,c),e.uniform1i(e.getUniformLocation(t,"u_clipRangeZeroToOne"),u?.clipRange==="zero-to-one"?1:0),e.uniform1i(e.getUniformLocation(t,"u_depthMode"),u?.mode==="reversed"?1:u?.mode==="logarithmic"?2:0)}function yi(e,t,r){const i=e.gl;return t.smaa.area&&t.smaa.search?!0:(t.smaa.requested||(t.smaa.requested=!0,fr(()=>import("./textures-BaxllL-N.js"),[]).then(o=>{let a=null,u=null;try{if(pe.get(e)!==t||e.disposed||e.contextLost)return;const c=(s,n)=>{const h=i.createTexture();if(!h)throw new Error("SMAA_TEXTURE_ALLOCATION_FAILED");try{return i.bindTexture(i.TEXTURE_2D,h),i.pixelStorei(i.UNPACK_FLIP_Y_WEBGL,!1),i.pixelStorei(i.UNPACK_PREMULTIPLY_ALPHA_WEBGL,!1),i.pixelStorei(i.UNPACK_ALIGNMENT,1),i.texImage2D(i.TEXTURE_2D,0,i.R8,s.length,1,0,i.RED,i.UNSIGNED_BYTE,s),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MIN_FILTER,n),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_MAG_FILTER,n),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_S,i.CLAMP_TO_EDGE),i.texParameteri(i.TEXTURE_2D,i.TEXTURE_WRAP_T,i.CLAMP_TO_EDGE),i.bindTexture(i.TEXTURE_2D,null),h}catch(T){throw i.deleteTexture(h),T}};a=c(o.generateSmaaAreaData(),i.LINEAR),u=c(o.generateSmaaSearchData(),i.NEAREST),t.smaa.area=a,t.smaa.search=u,e.stateCache.invalidate()}catch{a&&i.deleteTexture(a),u&&i.deleteTexture(u),t.smaa.area=null,t.smaa.search=null,t.smaa.requested=!1,ke("POSTPROCESS_INPUT_UNAVAILABLE:smaa:lookup",r)}finally{i.pixelStorei(i.UNPACK_ALIGNMENT,4),e.stateCache.invalidate()}}).catch(()=>{t.smaa.requested=!1,ke("POSTPROCESS_INPUT_UNAVAILABLE:smaa:lookup",r)})),!1)}function Fi(e,t,r,i,o,a,u){const c=a?.diagnosticToken,s=b=>We(b,c),n=b=>ke(b,c),h=!!r.ao,T=!!r.godRays,E=!!(r.chromaticAberration&&r.chromaticAberration.intensity),L=r.antiAliasing==="taa"||!!r.taa,G=!!r.dof,Z=!!r.motionBlur,k=!!r.ssr,te=r.autoExposure,ae=te!==void 0&&te!==!1,z=Wr(r.grade),xe=z!==null,Ie=Je(r,c,a?.scopeId),se=b=>Qt(Ie,b),ue=Ie.filter(b=>b.insertAt!=="after-tonemap"),X=ue.find(b=>b.inputs.includes("reactive")),Le=X?er(e,o,t.width,t.height,a):void 0,le=Li(e,o,t.width,t.height,a),W=!!le||o?.v2?.previousDepth==="object-velocity",S=(b=[])=>{le&&Ei(e,le,b)};le&&o?.v2&&S([t,o.history,o.historyOutput,o.v2.linZ,o.v2.linZOutput,...o.v2.reactive?[o.v2.reactive]:[]]);const V=[],ne=!!o?.v2,Oe=o?.v2?.reconstruction??"spatial",Ne=Oe!=="temporal"||!!(o?.v2?.reactive&&o.v2.motionSource==="object"),fe=L&&ne&&Ne,Ue=Z&&ne;nr(c),s(`enter:taa=${String(L)}:mb=${String(Z)}:temporal=${String(ne)}`),u?.deferBeforeTonemap&&s(`S9:bloom${_i(r.bloom)}`),L&&!ne&&(V.push("TAA_VELOCITY_COVERAGE"),n("TAA_VELOCITY_COVERAGE:v2-hdr-stages")),L&&ne&&!Ne&&(o?.v2?.reactive||(V.push("POSTPROCESS_REACTIVE_UNAVAILABLE"),n("POSTPROCESS_REACTIVE_UNAVAILABLE:temporal-reconstruction")),o?.v2?.motionSource!=="object"&&(V.push("POSTPROCESS_OBJECT_MOTION_UNAVAILABLE"),n("POSTPROCESS_OBJECT_MOTION_UNAVAILABLE:temporal-reconstruction")));for(const b of o?.v2?.unsupportedMotion??[])n(`POSTPROCESS_MOTION_UNSUPPORTED:${b}`);Z&&!ne&&(V.push("S7_VELOCITY_UNAVAILABLE"),n("S7_VELOCITY_UNAVAILABLE:v2-hdr-stages"));const q=(fe||Ue)&&ne||ue.some(b=>b.inputs.includes("velocity"))&&ne,B=q||h||T||G||k||ue.some(b=>b.inputs.includes("depth")||b.inputs.includes("normal"));if(!h&&!T&&!E&&!fe&&!G&&!Ue&&!k&&!ae&&!xe&&ue.length===0)return{target:t,aoPending:!1,skipped:V};X&&Le&&o?.v2&&(B&&Ae(e,Le,X.id,o.v2.linZOutput),q&&o.v2.motionSource!=="object"&&Ae(e,Le,X.id,o.velocity),fe&&Ae(e,Le,X.id,o.historyOutput));const d=e.gl,l=Ke(e),x=new lt(l.pool),ve=a?.scopeId&&a.viewId!==void 0&&Number.isSafeInteger(a.frameId)&&a.frameId>=0;let Y=null,ie=null,Ee=!1;const K=ae?l.exposureHistory.begin({scopeId:ve?a.scopeId:l.legacyExposureScope,viewId:ve?a.viewId:"legacy",frameId:ve?a.frameId:l.frameIndex,effectIndex:0,width:t.width,height:t.height,cameraCut:ve?a.cameraCut:void 0,deviceGeneration:ve?a.deviceGeneration:void 0},()=>e.device.createRenderTarget({width:1,height:1,format:"rgba32f",depth:!1,label:"post.ev"}),b=>b.dispose()):void 0,F=le?b=>S([t,b]):void 0;if(F){let b=we.get(e);b||we.set(e,b=new Set),b.add(F)}try{le&&K&&S([K.write,...K.read?[K.read]:[]]),e.resolveMultisampleTarget(t);const b=f(t);if((B||q)&&!b.depthTextureHandle)return n("WEBGL_LDR_POSTPROCESS_DEPTH_REQUIRED:v2-hdr-stages"),K?.abort(),{target:t,aoPending:!1,skipped:[...V,"V2_DEPTH_UNAVAILABLE"]};if((h||T||k||q)&&!i)return n("POST_GRAPH_V2_CAMERA_REQUIRED:v2-hdr-stages"),K?.abort(),{target:t,aoPending:!1,skipped:[...V,"V2_CAMERA_UNAVAILABLE"]};const ce=t.width,oe=t.height,P=Math.max(1,ce>>1),Ce=Math.max(1,oe>>1),_t=i?.near??r.depthRange?.near??.1,ye=i?.far??r.depthRange?.far??1e3,je=i?.projection==="orthographic"||r.depthRange?.projection==="orthographic",gt=i,Qe={near:_t,far:ye,orthographic:je,depth:gt?.depth??a?.sceneDepth.linearize.depth,projectionMatrixInverse:gt?.projectionMatrixInverse??a?.sceneDepth.linearize.projectionMatrixInverse??(i?Float32Array.from(Me(i.projectionMatrix)):void 0)};let re=null,et=null,Te=null;if(B){s("S1:depth-prep"),re=o?.v2?.linZOutput??null,re||(Y=x.acquire({width:ce,height:oe,format:"rgba32f",samples:1,depth:!1}),re=Y.target);const _=C(l,d,"depth-linearize",Xt);M(e,l,_,f(re),[b.depthTextureHandle],w=>{w.uniform1i(w.getUniformLocation(_,"u_depth"),0),w.uniform2f(w.getUniformLocation(_,"u_outputSize"),ce,oe),w.uniform2f(w.getUniformLocation(_,"u_jitterClip"),o?.v2?.jitterClip[0]??0,o?.v2?.jitterClip[1]??0),mt(w,_,Qe)},le?()=>S([re]):void 0),et=x.acquire({width:P,height:Ce,format:"rgba32f",samples:1,depth:!1}),Te=et.target;const v=C(l,d,"depth-minmax",Sr);M(e,l,v,f(Te),[f(re).colorHandle],w=>{w.uniform1i(w.getUniformLocation(v,"u_linearDepth"),0)})}let de=null;if(q&&o?.v2){if(o.v2.motionSource!=="object"){const v=C(l,d,"camera-velocity",Lr),w=Me(Array.from(o.v2.unjittered)),R=Float32Array.from(Lt(Array.from(o.v2.previous),w));{let p=0;for(let H=0;H<16;H+=1)p=Math.max(p,Math.abs(R[H]-st[H]));const A=o.v2.jitterClip[0]*ce/2,U=o.v2.jitterClip[1]*oe/2;s(`S1C:reproj-dev=${p.toExponential(2)}:jitter-px=${A.toFixed(3)},${U.toFixed(3)}`)}M(e,l,v,f(o.velocity),[b.depthTextureHandle],p=>{p.uniform1i(p.getUniformLocation(v,"u_depth"),0),p.uniform2f(p.getUniformLocation(v,"u_jitterClip"),o.v2.jitterClip[0],o.v2.jitterClip[1]),mt(p,v,Qe),p.uniformMatrix4fv(p.getUniformLocation(v,"u_prevViewProjection"),!1,R),p.uniformMatrix4fv(p.getUniformLocation(v,"u_invUnjitteredViewProjection"),!1,st)})}S(),ie=x.acquire({width:ce,height:oe,format:W?"rgba32f":"rgba16f",samples:1,depth:!1}),de=ie.target;const _=C(l,d,"velocity-dilate",Ur);M(e,l,_,f(de),[f(o.velocity).colorHandle,f(re).colorHandle],v=>{v.uniform1i(v.getUniformLocation(_,"u_velocity"),0),v.uniform1i(v.getUniformLocation(_,"u_linearDepth"),1),v.uniform1i(v.getUniformLocation(_,"u_hasExpectedDepth"),W?1:0),W&&v.uniform1f(v.getUniformLocation(_,"u_depthNear"),o.v2.depthNear)},le?()=>S([de]):void 0),S()}let be=null;if(re&&i&&ue.some(_=>_.inputs.includes("normal"))){s("S1N:normal-from-depth"),be=x.acquire({width:ce,height:oe,format:"rgba16f",samples:1,depth:!1});const _=C(l,d,"normal-from-depth",Pr),v=Qe.projectionMatrixInverse??Float32Array.from(Me(i.projectionMatrix));M(e,l,_,f(be.target),[f(re).colorHandle],w=>{w.uniform1i(w.getUniformLocation(_,"u_linearDepth"),0),w.uniformMatrix4fv(w.getUniformLocation(_,"u_invProjMatrix"),!1,v),w.uniform1i(w.getUniformLocation(_,"u_ortho"),je?1:0)},le?()=>S([be.target]):void 0)}const Fe={linZ:re,normal:be?.target??null,velocity:de,reactive:Le};let O=t,He;const me=(_,v)=>{He&&He!==v&&x.release(He),O=_,He=v};for(const _ of se("after-depth")){const v=Ve(e,l,x,_,O,Fe,i,a);v&&me(v.target,v)}if(h&&i&&re&&Te){const _=r.ao,v=_.directions??4,w=_.steps??4;s(`S2:gtao-${v}x${w}`);const R=x.acquire({width:P,height:Ce,format:"rgba8",samples:1,depth:!1}),p=R.target,A=Be(Er,{AURA_GTAO_DIRECTIONS:v,AURA_GTAO_STEPS:w}),U=C(l,d,`gtao-${v}x${w}`,A),H=Float32Array.from(Me(i.projectionMatrix));M(e,l,U,f(p),[f(Te).colorHandle],m=>{m.uniform1i(m.getUniformLocation(U,"u_linearDepthHalf"),0),m.uniformMatrix4fv(m.getUniformLocation(U,"u_projMatrix"),!1,i.projectionMatrix),m.uniformMatrix4fv(m.getUniformLocation(U,"u_invProjMatrix"),!1,H),m.uniform1f(m.getUniformLocation(U,"u_near"),_t),m.uniform1f(m.getUniformLocation(U,"u_far"),ye),m.uniform1i(m.getUniformLocation(U,"u_ortho"),je?1:0),m.uniform1f(m.getUniformLocation(U,"u_radius"),_.radius??.35),m.uniform1f(m.getUniformLocation(U,"u_intensity"),_.intensity??1),m.uniform1f(m.getUniformLocation(U,"u_falloff"),_.falloff??1),m.uniform1f(m.getUniformLocation(U,"u_distanceExponent"),1),m.uniform1f(m.getUniformLocation(U,"u_thickness"),1),m.uniform1i(m.getUniformLocation(U,"u_frameIndex"),a?.frameId??l.frameIndex)});const I=C(l,d,"gtao-denoise",yr),g=x.acquire({width:P,height:Ce,format:"rgba8",samples:1,depth:!1}),$=g.target,ee=[1/P,1/Ce];M(e,l,I,f($),[f(p).colorHandle,f(Te).colorHandle],m=>{m.uniform1i(m.getUniformLocation(I,"u_ao"),0),m.uniform1i(m.getUniformLocation(I,"u_depthHalf"),1),m.uniform2f(m.getUniformLocation(I,"u_dir"),ee[0],0)}),M(e,l,I,f(p),[f($).colorHandle,f(Te).colorHandle],m=>{m.uniform1i(m.getUniformLocation(I,"u_ao"),0),m.uniform1i(m.getUniformLocation(I,"u_depthHalf"),1),m.uniform2f(m.getUniformLocation(I,"u_dir"),0,ee[1])});const J=x.acquire({width:ce,height:oe,format:"rgba16f",samples:1,depth:!1}),j=J.target,y=C(l,d,"gtao-apply",Tr);M(e,l,y,f(j),[f(O).colorHandle,f(p).colorHandle,f(re).colorHandle,f(Te).colorHandle],m=>{m.uniform1i(m.getUniformLocation(y,"u_hdr"),0),m.uniform1i(m.getUniformLocation(y,"u_ao"),1),m.uniform1i(m.getUniformLocation(y,"u_depthFull"),2),m.uniform1i(m.getUniformLocation(y,"u_depthHalf"),3),m.uniform1f(m.getUniformLocation(y,"u_far"),ye),m.uniform1f(m.getUniformLocation(y,"u_aoFallbackStrength"),Ti(_.fallbackStrength)),m.uniform1i(m.getUniformLocation(y,"u_aoMultiBounce"),_.multiBounce===!1?0:1)}),me(j,J),x.release(R),x.release(g)}if(k&&i&&re){const _=fi(r.ssr),v=fe&&o?.v2&&Et(o.historyValid,o.v2.unsupportedMotion)?o:void 0,w=v?Float32Array.from(Lt(Array.from(v.v2.previous),Me(Array.from(i.viewMatrix)))):st,R=x.acquire({width:P,height:Ce,format:"rgba16f",samples:1,depth:!1}),p=R.target,A=C(l,d,`ssr-trace-${_.steps}`,Be(Yr,{AURA_SSR_STEPS:_.steps}));s(`S3:ssr-${_.steps}${v?":history":""}`),M(e,l,A,f(p),[f(v?v.history:O).colorHandle,f(re).colorHandle],g=>{g.uniform1i(g.getUniformLocation(A,"u_color"),0),g.uniform1i(g.getUniformLocation(A,"u_linearDepth"),1),g.uniformMatrix4fv(g.getUniformLocation(A,"u_projection"),!1,i.projectionMatrix),g.uniformMatrix4fv(g.getUniformLocation(A,"u_viewToPrevClip"),!1,w),g.uniform1i(g.getUniformLocation(A,"u_reproject"),v?1:0),g.uniform1i(g.getUniformLocation(A,"u_ortho"),je?1:0),g.uniform1f(g.getUniformLocation(A,"u_far"),ye),g.uniform1f(g.getUniformLocation(A,"u_maxDistance"),_.maxDistance),g.uniform1f(g.getUniformLocation(A,"u_thickness"),_.thickness),g.uniform1f(g.getUniformLocation(A,"u_roughness"),_.roughness)});const U=x.acquire({width:ce,height:oe,format:"rgba16f",samples:1,depth:!1}),H=U.target,I=C(l,d,"ssr-composite",Kr);M(e,l,I,f(H),[f(O).colorHandle,f(p).colorHandle],g=>{g.uniform1i(g.getUniformLocation(I,"u_color"),0),g.uniform1i(g.getUniformLocation(I,"u_reflection"),1),g.uniform1f(g.getUniformLocation(I,"u_intensity"),_.intensity)}),x.release(R),me(H,U)}if(T&&i&&Te){const _=r.godRays,v=_.samples??32,w=x.acquire({width:P,height:Ce,format:"rgba16f",samples:1,depth:!1}),R=w.target;let p=_.lightWorld;if(!p&&_.lightDirection){const y=_.lightDirection,m=i.position;p=[m[0]+y[0]*ye*2,m[1]+y[1]*ye*2,m[2]+y[2]*ye*2]}p||(p=[i.position[0],i.position[1]+ye,i.position[2]]);const A=i.viewProjectionMatrix,U=[A[0]*p[0]+A[4]*p[1]+A[8]*p[2]+A[12],A[1]*p[0]+A[5]*p[1]+A[9]*p[2]+A[13],A[3]*p[0]+A[7]*p[1]+A[11]*p[2]+A[15]],H=U[2]!==0?[U[0]/U[2]*.5+.5,U[1]/U[2]*.5+.5]:[.5,.5],I=Be(wr,{AURA_GODRAY_SAMPLES:v}),g=C(l,d,`godrays-${v}`,I);s(`S4:god-rays-${v}`),M(e,l,g,f(R),[f(O).colorHandle,f(Te).colorHandle],y=>{y.uniform1i(y.getUniformLocation(g,"u_hdr"),0),y.uniform1i(y.getUniformLocation(g,"u_depthHalf"),1),y.uniform1f(y.getUniformLocation(g,"u_far"),ye),y.uniform2f(y.getUniformLocation(g,"u_lightUv"),H[0],H[1]),y.uniform1f(y.getUniformLocation(g,"u_lightClipW"),U[2]);const m=li(_.color);y.uniform3f(y.getUniformLocation(g,"u_color"),m[0],m[1],m[2]),y.uniform1f(y.getUniformLocation(g,"u_intensity"),_.intensity??.7),y.uniform1f(y.getUniformLocation(g,"u_decay"),_.decay??.94),y.uniform1f(y.getUniformLocation(g,"u_weight"),_.weight??_.intensity??.7),y.uniform1f(y.getUniformLocation(g,"u_diskOuter"),.08),y.uniform1f(y.getUniformLocation(g,"u_diskInner"),.02),y.uniform1f(y.getUniformLocation(g,"u_density"),di(_.density)),y.uniform1f(y.getUniformLocation(g,"u_medium"),mi(_.medium))});const $=x.acquire({width:ce,height:oe,format:"rgba16f",samples:1,depth:!1}),ee=$.target,J=C(l,d,"v2-add",Pi),j=f(ee);d.bindFramebuffer(d.FRAMEBUFFER,j.framebuffer),d.viewport(0,0,ce,oe),d.useProgram(J),d.bindVertexArray(l.vao),Ze(d),d.disable(d.DEPTH_TEST),d.disable(d.BLEND),d.activeTexture(d.TEXTURE0),d.bindTexture(d.TEXTURE_2D,f(O).colorHandle),d.uniform1i(d.getUniformLocation(J,"u_source"),0),ft(e,f(ee)),d.drawArrays(d.TRIANGLES,0,3),d.enable(d.BLEND),d.blendFunc(d.ONE,d.ONE),d.activeTexture(d.TEXTURE0),d.bindTexture(d.TEXTURE_2D,f(R).colorHandle),ft(e,f(ee)),d.drawArrays(d.TRIANGLES,0,3),d.disable(d.BLEND),d.bindTexture(d.TEXTURE_2D,null),d.bindVertexArray(null),x.release(w),me(ee,$)}if(E){const _=r.chromaticAberration,v=x.acquire({width:ce,height:oe,format:"rgba16f",samples:1,depth:!1}),w=v.target,R=C(l,d,"ca-pass",vr);s("CA:chromatic-aberration"),M(e,l,R,f(w),[f(O).colorHandle],p=>{p.uniform1i(p.getUniformLocation(R,"u_hdr"),0),p.uniform1f(p.getUniformLocation(R,"u_caIntensity"),_.intensity??.0015)}),me(w,v)}for(const _ of se("before-taa")){const v=Ve(e,l,x,_,O,Fe,i,a);v&&me(v.target,v)}if(fe&&s(o?.v2&&de?`S5:${o.historyValid?"history":"seed"}:frames=${o.historyFrames}`:`S5:skip:velocity=${String(!!de)}`),fe&&o?.v2&&de){S([o.historyOutput,de]),X&&Le&&Ae(e,Le,X.id,o.historyOutput);const _=r.taa??{},v=C(l,d,"taa-resolve",Rr),w=o.historyOutput;M(e,l,v,f(w),[f(O).colorHandle,f(o.history).colorHandle,f(de).colorHandle,f(o.v2.linZ).colorHandle,o.v2.reactive?f(o.v2.reactive).colorHandle:l.blankTex],p=>{p.uniform1i(p.getUniformLocation(v,"u_current"),0),p.uniform1i(p.getUniformLocation(v,"u_history"),1),p.uniform1i(p.getUniformLocation(v,"u_velocityDilate"),2),p.uniform1i(p.getUniformLocation(v,"u_linZPrev"),3),p.uniform1i(p.getUniformLocation(v,"u_reactive"),4),p.uniform1i(p.getUniformLocation(v,"u_hasReactive"),o.v2.reactive?1:0),p.uniform1i(p.getUniformLocation(v,"u_hasExpectedDepth"),W?1:0),p.uniform2f(p.getUniformLocation(v,"u_jitterUv"),o.v2.jitterClip[0]*.5,o.v2.jitterClip[1]*.5);const A=o.v2.previousJitterClip??[0,0];p.uniform2f(p.getUniformLocation(v,"u_previousJitterUv"),A[0]*.5,A[1]*.5),p.uniform1i(p.getUniformLocation(v,"u_hasHistory"),Et(o.historyValid,o.v2.unsupportedMotion)?1:0),p.uniform1f(p.getUniformLocation(v,"u_depthNear"),o.v2.depthNear),p.uniform1f(p.getUniformLocation(v,"u_feedbackMin"),_.feedbackMin??.88),p.uniform1f(p.getUniformLocation(v,"u_feedbackMax"),_.feedbackMax??.97),p.uniform1f(p.getUniformLocation(v,"u_varianceGamma"),_.varianceGamma??1)},le?()=>S([w,de]):void 0),S([w,de]),le?Ee=!0:ot(a?.scopeId,a?.viewId,a?.frameId),me(w);const R=r.renderScale??1;if(R<1&&Oe==="spatial"){const p=Math.max(1,Math.round(ce/R)),A=Math.max(1,Math.round(oe/R)),U=x.acquire({width:p,height:A,format:"rgba16f",samples:1,depth:!1}),H=U.target,I=C(l,d,"taa-upscale",Ir);M(e,l,I,f(H),[f(w).colorHandle],g=>{g.uniform1i(g.getUniformLocation(I,"u_resolved"),0),g.uniform2f(g.getUniformLocation(I,"u_renderSize"),ce,oe),g.uniform2f(g.getUniformLocation(I,"u_outputSize"),p,A)}),me(H,U)}}for(const _ of se("after-taa")){const v=Ve(e,l,x,_,O,Fe,i,a);v&&me(v.target,v)}if(G&&re){const _=r.dof??{},v=_.maxBlurPx??16,w=3,R=O.width,p=O.height,A=Math.max(1,Math.round(R/2)),U=Math.max(1,Math.round(p/2)),H=x.acquire({width:A,height:U,format:"rgba16f",samples:1,depth:!1}),I=H.target,g=C(l,d,"dof-prefilter",Cr),$=vi(_.tiltShift);s($[3]>0?`S6:dof-tilt-shift-rings${w}`:`S6:dof-rings${w}`),M(e,l,g,f(I),[f(O).colorHandle,f(re).colorHandle],N=>{N.uniform1i(N.getUniformLocation(g,"u_color"),0),N.uniform1i(N.getUniformLocation(g,"u_linearDepth"),1),N.uniform1f(N.getUniformLocation(g,"u_focusDistance"),_.focusDistance??3),N.uniform1f(N.getUniformLocation(g,"u_focalLengthMm"),_.focalLengthMm??50),N.uniform1f(N.getUniformLocation(g,"u_fStop"),_.fStop??2.8),N.uniform1f(N.getUniformLocation(g,"u_sensorHeightMm"),_.sensorHeightMm??24),N.uniform1f(N.getUniformLocation(g,"u_frameHeightPx"),p),N.uniform1f(N.getUniformLocation(g,"u_maxBlurPx"),v),N.uniform4f(N.getUniformLocation(g,"u_tiltShift"),$[0],$[1],$[2],$[3])});const ee=Math.max(1,Math.ceil(A/8)),J=Math.max(1,Math.ceil(U/8)),j=x.acquire({width:ee,height:J,format:"rgba16f",samples:1,depth:!1}),y=j.target,m=C(l,d,"dof-near-tile",zr);M(e,l,m,f(y),[f(I).colorHandle],N=>{N.uniform1i(N.getUniformLocation(m,"u_prefilter"),0)});const D=x.acquire({width:A,height:U,format:"rgba16f",samples:1,depth:!1}),he=D.target,Se=Be(Mr,{DOF_RINGS:w}),Xe=C(l,d,`dof-gather-${w}`,Se);M(e,l,Xe,f(he),[f(I).colorHandle,f(y).colorHandle],N=>{N.uniform1i(N.getUniformLocation(Xe,"u_prefilter"),0),N.uniform1i(N.getUniformLocation(Xe,"u_nearTile"),1),N.uniform1f(N.getUniformLocation(Xe,"u_maxBlurPx"),v)});const xt=x.acquire({width:R,height:p,format:"rgba16f",samples:1,depth:!1}),St=xt.target,it=C(l,d,"dof-composite",kr);M(e,l,it,f(St),[f(O).colorHandle,f(he).colorHandle],N=>{N.uniform1i(N.getUniformLocation(it,"u_color"),0),N.uniform1i(N.getUniformLocation(it,"u_blurred"),1)}),x.release(H),x.release(j),x.release(D),me(St,xt)}if(Ue&&o?.v2&&de&&re){const _=r.motionBlur??{},v=_.tileSize??16,w=_.samples??12,R=Math.max(1,Math.ceil(ce/v)),p=Math.max(1,Math.ceil(oe/v));s(`S7:motion-blur-${w}x${v}`);const A=x.acquire({width:R,height:p,format:"rgba16f",samples:1,depth:!1}),U=A.target,H=C(l,d,`mb-tile-${v}`,Be(Or,{MB_TILE_SIZE:v}));M(e,l,H,f(U),[f(de).colorHandle],m=>{m.uniform1i(m.getUniformLocation(H,"u_velocity"),0)});const I=x.acquire({width:R,height:p,format:"rgba16f",samples:1,depth:!1}),g=I.target,$=C(l,d,"mb-neighbor",Nr);M(e,l,$,f(g),[f(U).colorHandle],m=>{m.uniform1i(m.getUniformLocation($,"u_tileMax"),0)});const ee=x.acquire({width:O.width,height:O.height,format:"rgba16f",samples:1,depth:!1}),J=ee.target,j=C(l,d,`mb-recon-${w}-${v}`,Fr),y=(_.shutter??.5)*(1/60/Math.max(o.v2.frameTime,1e-4));M(e,l,j,f(J),[f(O).colorHandle,f(de).colorHandle,f(g).colorHandle,f(re).colorHandle],m=>{m.uniform1i(m.getUniformLocation(j,"u_color"),0),m.uniform1i(m.getUniformLocation(j,"u_velocity"),1),m.uniform1i(m.getUniformLocation(j,"u_neighbor"),2),m.uniform1i(m.getUniformLocation(j,"u_linearDepth"),3),m.uniform1f(m.getUniformLocation(j,"u_shutter"),y),m.uniform1f(m.getUniformLocation(j,"u_maxBlurPx"),_.maxBlurPx??32),m.uniform1i(m.getUniformLocation(j,"u_samples"),w),m.uniform1i(m.getUniformLocation(j,"u_tileSize"),v),m.uniform1i(m.getUniformLocation(j,"u_frameIndex"),a?.frameId??l.frameIndex)}),x.release(A),x.release(I),me(J,ee)}if(ae){const _=new Set,v=(R,p)=>{const A=x.acquire({width:R,height:p,format:"rgba16f",samples:1,depth:!1});return _.add(A),A},w=R=>{x.release(R),_.delete(R)};try{const R=te,p=Math.max(1,O.width>>2),A=Math.max(1,O.height>>2),U=v(p,A),H=C(l,d,"exposure-luma",Hr);M(e,l,H,f(U.target),[f(O).colorHandle],D=>{D.uniform1i(D.getUniformLocation(H,"u_hdr"),0),D.uniform2f(D.getUniformLocation(H,"u_texelSize"),1/O.width,1/O.height),D.uniform1i(D.getUniformLocation(H,"u_centerWeighted"),(R.meteringMask??"center-weighted")==="center-weighted"?1:0)});let I=p,g=A,$=U,ee=null;for(;I>1||g>1;){I=Math.max(1,I>>1),g=Math.max(1,g>>1);const D=v(I,g),he=C(l,d,"exposure-reduce",Gr);M(e,l,he,f(D.target),[f($.target).colorHandle],Se=>{Se.uniform1i(Se.getUniformLocation(he,"u_source"),0),Se.uniform2f(Se.getUniformLocation(he,"u_texelSize"),1/(I*2),1/(g*2))}),$!==U&&w($),ee=D,$=D}const J=K.read,j=K.write,y=C(l,d,"exposure-adapt",Br);M(e,l,y,f(j),[J?f(J).colorHandle:l.blankTex,f($.target).colorHandle],D=>{D.uniform1i(D.getUniformLocation(y,"u_prev"),0),D.uniform1i(D.getUniformLocation(y,"u_avg"),1),D.uniform1f(D.getUniformLocation(y,"u_dt"),o?.v2?.frameTime??1/60),D.uniform1f(D.getUniformLocation(y,"u_speedUp"),R.speedUp??3),D.uniform1f(D.getUniformLocation(y,"u_speedDown"),R.speedDown??1),D.uniform1f(D.getUniformLocation(y,"u_minEv"),R.minEv??-4),D.uniform1f(D.getUniformLocation(y,"u_maxEv"),R.maxEv??4),D.uniform1f(D.getUniformLocation(y,"u_compensationEv"),R.compensationEv??0),D.uniform1i(D.getUniformLocation(y,"u_hasPrev"),J?1:0)}),w(U),ee&&w(ee),s("S8:auto-exposure");const m=v(O.width,O.height);zt(e,l,m.target,O,j,z),z&&s("S10:hdr-grade:folded-s8"),me(m.target,m),_.delete(m)}finally{for(const R of _)x.release(R)}}else if(z){const _=x.acquire({width:O.width,height:O.height,format:"rgba16f",samples:1,depth:!1}),v=_.target;zt(e,l,v,O,null,z),s("S10:hdr-grade"),me(v,_)}const tt=se("before-tonemap");let De;if(u?.deferBeforeTonemap&&tt.length>0){const _=l.frameIndex,v=l.timeSeconds,w=Fe,R=Y,p=ie,A=be,U=new lt(l.pool);let H=null,I=!1,g=!1,$=!1;const ee=()=>{if(I)return;I=!0,H=null;const J=[];for(const j of[()=>U.releaseAll(),()=>p?.release(),()=>A?.release(),()=>R?.release()])try{j()}catch(y){J.push(y)}if(J.length===1)throw J[0];if(J.length>1)throw new AggregateError(J,"Deferred postprocess release failed")};De={run:J=>{if(I||$)throw new Error("POSTPROCESS_DEFERRED_STAGE_RELEASED");if(g)throw new Error("POSTPROCESS_DEFERRED_STAGE_REENTRANT");g=!0;let j=!1;const y=l.frameIndex,m=l.timeSeconds;l.frameIndex=_,l.timeSeconds=v;try{if(S([t]),F){let he=we.get(e);he||we.set(e,he=new Set),he.add(F)}let D=J;for(const he of tt){const Se=tr(e,l,U,he,D,w,i,a);if($)throw new Error("POSTPROCESS_DEFERRED_STAGE_RELEASED");Se&&(U.release(H),H=Se,D=f(Se.target))}return S([t]),Ee&&ot(a?.scopeId,a?.viewId,a?.frameId),D}catch(D){throw j=!0,D}finally{if(F){const D=we.get(e);D?.delete(F),D?.size===0&&we.delete(e)}if(l.frameIndex=y,l.timeSeconds=m,g=!1,$)try{ee()}catch(D){if(!j)throw D}}},release:()=>{if(!(I||$)){if(g){$=!0;return}ee()}}}}else for(const _ of tt){const v=Ve(e,l,x,_,O,Fe,i,a);v&&me(v.target,v)}S([t,O]),l.timeSeconds+=o?.v2?.frameTime??1/60,De||(x.release(ie),x.release(be),x.release(Y)),x.release(et),l.frameIndex+=1,e.stateCache.invalidate(),K&&!u?.deferExposureCommit&&K.commit();const Ge=He;x.releaseExcept([Ge,...De?[Y,ie,be]:[]]);let rt;return Ge&&(u?.retainOutputLease?rt=x.take(Ge):(l.pool.transferLeaseToLegacy(Ge),x.take(Ge))),De&&(Y&&x.take(Y),ie&&x.take(ie),be&&x.take(be)),x.releaseAll(),S([t,O]),Ee&&!De&&ot(a?.scopeId,a?.viewId,a?.frameId),{target:O,aoPending:h,skipped:V,...De?{afterBloom:De}:{},...rt?{outputLease:rt}:{},...K&&u?.deferExposureCommit?{exposureCompletion:{commit:()=>{if(pe.get(e)!==l)throw new Error("POST_HISTORY_STALE_LEASE");K.commit()},abort:()=>{if(pe.get(e)!==l)throw new Error("POST_HISTORY_STALE_LEASE");K.abort()}}}:{}}}catch(b){try{x.releaseAll()}catch{}try{K?.abort()}catch{}throw b}finally{if(F){const b=we.get(e);b?.delete(F),b?.size===0&&we.delete(e)}}}const kt=.1;function Ti(e){const t=e??kt;return Math.min(Math.max(Number.isFinite(t)?t:0,0),kt)}function Hi(e,t,r){const i=Je(e,t,r).some(o=>o.insertAt==="after-tonemap");return!!(e.vignette||e.filmGrain||e.lut||e.nativeEffects?.length||e.antiAliasing==="smaa"||i)}function bi(e,t,r){if(e.outputColorSpace!=="display-p3"||e.vignette||e.filmGrain||e.lut||e.antiAliasing!=="off"&&e.antiAliasing!=="msaa"&&e.antiAliasing!=="taa"||e.renderScale!==void 0&&(!Number.isFinite(e.renderScale)||e.renderScale<1)||typeof e.dither!="boolean"||e.alphaMode!==void 0&&e.alphaMode!=="opaque"&&e.alphaMode!=="straight"&&e.alphaMode!=="premultiplied"||!Array.isArray(e.nativeEffects)||e.nativeEffects.length===0||Je(e,t,r).some(o=>o.insertAt==="after-tonemap"))return;const i=[];for(const o of e.nativeEffects){let a;if(o.kind==="pixelation")a={kind:"pixelation",size:o.size};else if(o.kind==="glitch")a={kind:"glitch",intensity:o.intensity,seed:o.seed};else if(o.kind==="afterimage")a={kind:"afterimage",decay:o.decay};else return;Nt(a),i.push(Object.freeze(a))}return Object.freeze({...e,nativeEffects:Object.freeze(i),outputColorSpace:"display-p3"})}function Gi(e,t,r,i,o,a){const u=o?.diagnosticToken,c=S=>We(S,u),s=r.outputColorSpace==="display-p3";if(s){if(i||!a||!bi(r,u,o?.scopeId))throw new Q("Display-P3 postprocessing requires an admitted display surface","OUTPUT_COLOR_SPACE_UNAVAILABLE");at(a,e.device,t),e.device.assertDisplayOutputScope("display-p3")}else if(a)throw new Q("An encoded display surface cannot be sampled as sRGB","OUTPUT_COLOR_SPACE_UNAVAILABLE");const n=e.gl,h=Ke(e),T=f(t),E=t.width,L=t.height,G=r.vignette,Z=r.filmGrain,k=r.antiAliasing==="fxaa",te=r.antiAliasing==="smaa",ae=r.alphaMode==="premultiplied"?2:r.alphaMode==="opaque"?1:0,z=r.nativeEffects??[];for(const S of z)Nt(S);if(z.some(S=>S.kind==="afterimage")&&(!o?.scopeId||o.viewId===void 0||!Number.isSafeInteger(o.frameId)||o.frameId<0))throw new Error("POSTPROCESS_HISTORY_IDENTITY_REQUIRED");const xe=Qt(Je(r,u,o?.scopeId),"after-tonemap");if(s&&xe.length)throw new Q("Display-P3 custom tail passes are not admitted","OUTPUT_COLOR_SPACE_UNAVAILABLE");const Ie=(r.renderScale??1)<1?.2:0,se=ci(e,h,r.lut,u),ue=(S,V)=>{S.activeTexture(S.TEXTURE1),S.bindTexture(S.TEXTURE_3D,se?.texture??h.identityLut),S.bindSampler(1,null),S.uniform1i(S.getUniformLocation(V,"u_lut3d"),1),S.uniform1i(S.getUniformLocation(V,"u_hasLut"),se?1:0),S.uniform1i(S.getUniformLocation(V,"u_lutLattice"),se?1:0),S.uniform1f(S.getUniformLocation(V,"u_lutBypass"),se?.bypass??0)},X=(G?.intensity??0)>0,Le=(Z?.intensity??0)>0,le=S=>{(X||se)&&c(`S10b:display-grade${X?":vignette":""}${se?":lut":""}${S?":fused-fxaa":""}`),Le&&c(`S12:film-grain${S?":fused-fxaa":""}`)};if(k&&xe.length===0&&!r.nativeEffects?.length){const S=C(h,n,"finalize-fxaa-fused",gr);le(!0),c("S11:fxaa:fused"),Ot(e,i,E,L),n.useProgram(S),n.bindVertexArray(h.vao),Ze(n),n.disable(n.DEPTH_TEST),n.disable(n.BLEND),n.activeTexture(n.TEXTURE0),n.bindTexture(n.TEXTURE_2D,T.colorHandle),ue(n,S),n.uniform1i(n.getUniformLocation(S,"u_source"),0),n.uniform1i(n.getUniformLocation(S,"u_outputAlphaMode"),ae),n.uniform2f(n.getUniformLocation(S,"u_texelSize"),1/E,1/L),n.uniform2f(n.getUniformLocation(S,"u_outputTexel"),1/E,1/L),n.uniform1f(n.getUniformLocation(S,"u_frame"),o?.frameId??h.frameIndex),n.uniform1f(n.getUniformLocation(S,"u_grainIntensity"),Z?.intensity??0),n.uniform1f(n.getUniformLocation(S,"u_grainSize"),Z?.size??1),n.uniform1f(n.getUniformLocation(S,"u_grainLuminanceResponse"),Z?.luminanceResponse??1),n.uniform1f(n.getUniformLocation(S,"u_vignetteIntensity"),G?.intensity??0),n.uniform1f(n.getUniformLocation(S,"u_vignetteSmoothness"),G?.smoothness??1),n.uniform1f(n.getUniformLocation(S,"u_vignetteRoundness"),G?.roundness??1);const V=yt(G?.color);if(n.uniform3f(n.getUniformLocation(S,"u_vignetteColor"),V[0],V[1],V[2]),n.uniform2f(n.getUniformLocation(S,"u_resolution"),E,L),!i)try{e.device.assertSrgbOutputFallbackScope?.()}catch(ne){try{n.bindVertexArray(null)}catch{}try{e.stateCache.invalidate()}catch{}throw ne}n.drawArrays(n.TRIANGLES,0,3),n.bindVertexArray(null),e.stateCache.invalidate();return}const W=new lt(h.pool);try{let S=t,V;const ne=(q,B)=>{V&&V!==B&&W.release(V),S=q,V=B};if(le(!1),G||r.lut){const q=W.acquire({width:E,height:L,format:"rgba8",samples:1,depth:!1}),B=q.target,d=C(h,n,"display-grade",hr);M(e,h,d,f(B),[T.colorHandle],l=>{l.uniform1i(l.getUniformLocation(d,"u_source"),0),ue(l,d),l.uniform1f(l.getUniformLocation(d,"u_vignetteIntensity"),G?.intensity??0),l.uniform1f(l.getUniformLocation(d,"u_vignetteSmoothness"),G?.smoothness??1),l.uniform1f(l.getUniformLocation(d,"u_vignetteRoundness"),G?.roundness??1);const x=yt(G?.color);l.uniform3f(l.getUniformLocation(d,"u_vignetteColor"),x[0],x[1],x[2]),l.uniform2f(l.getUniformLocation(d,"u_resolution"),E,L)}),ne(B,q)}const Oe=Di(e,h,W,xe,o,E,L),Ne=Oe?.target;for(const q of xe){const B=Ve(e,h,W,q,S,Ne?{linZ:Ne}:{},null,o);B&&ne(B.target,B)}W.release(Oe);let fe;const Ue=[];try{for(const[B,d]of z.entries()){if(d.kind==="mask"){fe=d;continue}if(d.kind==="clear-mask"){fe=void 0;continue}let l;d.kind==="afterimage"&&(l=h.effectHistory.begin({scopeId:o.scopeId,viewId:o.viewId,frameId:o.frameId,effectIndex:B,width:E,height:L,cameraCut:o.cameraCut,deviceGeneration:o.deviceGeneration,displayColorSpace:s?"display-p3":"srgb"},(Y,ie)=>e.device.createRenderTarget({width:Y,height:ie,format:"rgba8",depth:!1,label:"post-afterimage-history"}),Y=>Y.dispose()),Ue.push(l));let x,ve;try{const Y=S,ie=l?.read;s&&(e.device.assertEncodedDisplayTarget(Y),ie&&e.device.assertEncodedDisplayTarget(ie));const Ee=f(S).colorHandle,K=d.kind==="transition"||d.kind==="lens-dirt"?e.textureRegistry.getTextureHandle(d.texture):l?.read?f(l.read).colorHandle:h.blankTex,F=fe?e.textureRegistry.getTextureHandle(fe.texture):h.blankTex;if(x=l?.write,x||(ve=W.acquire({width:E,height:L,format:"rgba8",samples:1,depth:!1}),x=ve.target),s&&e.device.assertEncodedDisplayTarget(x),f(x).colorHandle===Ee||f(x).colorHandle===K||f(x).colorHandle===F)throw new Error(`POSTPROCESS_INPUT_OUTPUT_ALIAS:${d.kind}`);const b=C(h,n,"native-display-effect",cr),ce=d.kind==="pixelation"?1:d.kind==="halftone"?2:d.kind==="dot-screen"?3:d.kind==="glitch"?4:d.kind==="transition"?5:d.kind==="lens-dirt"?6:7;c(`native:${d.kind}`);const oe=x;M(e,h,b,f(oe),[Ee,K,F],P=>{P.uniform1i(P.getUniformLocation(b,"u_color"),0),P.uniform1i(P.getUniformLocation(b,"u_aux"),1),P.uniform1i(P.getUniformLocation(b,"u_mask"),2),P.uniform2f(P.getUniformLocation(b,"u_resolution"),E,L),P.uniform1i(P.getUniformLocation(b,"u_kind"),ce),P.uniform1f(P.getUniformLocation(b,"u_size"),"size"in d?d.size:1),P.uniform1f(P.getUniformLocation(b,"u_angle"),"angle"in d?d.angle:0),P.uniform1f(P.getUniformLocation(b,"u_strength"),"strength"in d?d.strength:0),P.uniform1f(P.getUniformLocation(b,"u_intensity"),"intensity"in d?d.intensity:0),P.uniform1f(P.getUniformLocation(b,"u_seed"),"seed"in d?d.seed:0),P.uniform1f(P.getUniformLocation(b,"u_frame"),o?.frameId??h.frameIndex),P.uniform1f(P.getUniformLocation(b,"u_progress"),"progress"in d?d.progress:0),P.uniform1f(P.getUniformLocation(b,"u_decay"),"decay"in d?d.decay:0),P.uniform1i(P.getUniformLocation(b,"u_hasHistory"),l?.read?1:0),P.uniform1i(P.getUniformLocation(b,"u_hasMask"),fe?1:0),P.uniform1i(P.getUniformLocation(b,"u_invertMask"),fe?.invert?1:0),P.uniform1f(P.getUniformLocation(b,"u_maskOpacity"),fe?.opacity??0)},s?()=>{at(a,e.device,t),e.device.assertDisplayOutputScope("display-p3"),e.device.assertEncodedDisplayTarget(Y),e.device.assertEncodedDisplayTarget(oe),ie&&e.device.assertEncodedDisplayTarget(ie)}:void 0)}catch(Y){try{l?.abort()}catch{}try{W.release(ve)}catch{}throw Y}ne(x,ve)}if(te&&yi(e,h,u)){c("S11:smaa");const B=W.acquire({width:E,height:L,format:"rgba8",samples:1,depth:!1}),d=B.target,l=C(h,n,"smaa-edges",ei);M(e,h,l,f(d),[f(S).colorHandle],F=>{F.uniform1i(F.getUniformLocation(l,"u_color"),0),F.uniform2f(F.getUniformLocation(l,"u_resolution"),1/E,1/L)});const x=W.acquire({width:E,height:L,format:"rgba8",samples:1,depth:!1}),ve=x.target,Y=C(h,n,"smaa-weights",ti);M(e,h,Y,f(ve),[f(d).colorHandle,h.smaa.area,h.smaa.search],F=>{F.uniform1i(F.getUniformLocation(Y,"u_edges"),0),F.uniform1i(F.getUniformLocation(Y,"u_area"),1),F.uniform1i(F.getUniformLocation(Y,"u_search"),2),F.uniform2f(F.getUniformLocation(Y,"u_resolution"),1/E,1/L)});const ie=W.acquire({width:E,height:L,format:"rgba8",samples:1,depth:!1}),Ee=ie.target,K=C(h,n,"smaa-blend",ri);M(e,h,K,f(Ee),[f(ve).colorHandle,f(S).colorHandle],F=>{F.uniform1i(F.getUniformLocation(K,"u_weights"),0),F.uniform1i(F.getUniformLocation(K,"u_color"),1),F.uniform2f(F.getUniformLocation(K,"u_resolution"),1/E,1/L)}),W.release(B),W.release(x),ne(Ee,ie)}else if(k&&(xe.length>0||z.length>0)){c("S11:fxaa");const B=W.acquire({width:E,height:L,format:"rgba8",samples:1,depth:!1}),d=B.target,l=C(h,n,"fxaa-standalone-nodither",sr.replace("#version 300 es",`#version 300 es
#define AURA_FXAA_NO_DITHER`));M(e,h,l,f(d),[f(S).colorHandle],x=>{x.uniform1i(x.getUniformLocation(l,"u_source"),0),x.uniform2f(x.getUniformLocation(l,"u_texelSize"),1/E,1/L),x.uniform2f(x.getUniformLocation(l,"u_outputTexel"),1/E,1/L)}),ne(d,B)}const q=C(h,n,s?"post-finalize-p3":"finalize",s?_r:pr);if(Ot(e,i,E,L),n.useProgram(q),n.bindVertexArray(h.vao),Ze(n),n.disable(n.DEPTH_TEST),n.disable(n.BLEND),n.activeTexture(n.TEXTURE0),n.bindTexture(n.TEXTURE_2D,f(S).colorHandle),n.uniform1i(n.getUniformLocation(q,"u_source"),0),n.uniform1i(n.getUniformLocation(q,"u_outputAlphaMode"),ae),s&&n.uniform1i(n.getUniformLocation(q,"u_ditherEnabled"),r.dither?1:0),n.uniform2f(n.getUniformLocation(q,"u_texelSize"),1/E,1/L),n.uniform1f(n.getUniformLocation(q,"u_frame"),o?.frameId??h.frameIndex),n.uniform1f(n.getUniformLocation(q,"u_grainIntensity"),Z?.intensity??0),n.uniform1f(n.getUniformLocation(q,"u_grainSize"),Z?.size??1),n.uniform1f(n.getUniformLocation(q,"u_grainLuminanceResponse"),Z?.luminanceResponse??1),n.uniform1f(n.getUniformLocation(q,"u_rcasSharpness"),Ie),!i)try{s?(e.device.assertEncodedDisplayTarget(S),at(a,e.device,t),e.device.assertDisplayOutputScope("display-p3")):e.device.assertSrgbOutputFallbackScope?.()}catch(B){try{n.bindVertexArray(null)}catch{}try{e.stateCache.invalidate()}catch{}throw B}n.drawArrays(n.TRIANGLES,0,3),n.bindVertexArray(null),e.stateCache.invalidate(),W.release(V),V=void 0;for(const B of Ue)B.commit()}catch(q){for(const B of Ue)try{B.abort()}catch{}try{W.release(V)}catch{}throw V=void 0,e.stateCache.invalidate(),q}W.releaseAll()}catch(S){try{W.releaseAll()}catch{}throw S}}function wi(e,t,r){const i=pe.get(e),o=i?.scopedPostBlackboards.get(t);o?.delete(r),o?.size===0&&i?.scopedPostBlackboards.delete(t);const a=new Set;i&&(a.add(i.exposureHistory),a.add(i.effectHistory));const u=ge.get(e);if(u&&!u.running)for(const s of u.actions)s.history&&a.add(s.history);const c=[];for(const s of a)try{s.resetView(t,r)}catch(n){c.push(n)}if(c.length)throw new AggregateError(c,"Native post view disposal failed")}function Ai(e,t){const r=pe.get(e);r?.scopedPostBlackboards.delete(t);const i=new Set;r&&(i.add(r.exposureHistory),i.add(r.effectHistory));const o=ge.get(e);if(o&&!o.running)for(const u of o.actions)u.history&&i.add(u.history);const a=[];for(const u of i)try{u.resetScope(t)}catch(c){a.push(c)}if(a.length)throw new AggregateError(a,"Native post scope disposal failed")}function Ui(e){const t=Re.get(e);t&&(t.invalidated=!0);const r=pe.get(e);let i=ge.get(e);if(r){pe.delete(e),i??=Kt(e);const a=(c,s)=>{i.actions.add({release:c,history:s})};a(()=>r.exposureHistory.dispose(),r.exposureHistory),a(()=>r.effectHistory.dispose(),r.effectHistory),r.legacyPostBlackboard.clear(),a(()=>r.pool.dispose());const u=e.gl;for(const c of r.programs.values())a(()=>u.deleteProgram(c));if(r.programs.clear(),a(()=>u.deleteVertexArray(r.vao)),a(()=>u.deleteTexture(r.identityLut)),r.blankTex!==r.identityLut&&a(()=>u.deleteTexture(r.blankTex)),r.smaa.area){const c=r.smaa.area;a(()=>u.deleteTexture(c))}if(r.smaa.search){const c=r.smaa.search;a(()=>u.deleteTexture(c))}for(const c of r.lutTextures)a(()=>{u.deleteTexture(c),r.lutTextures.delete(c)});r.lutCache=void 0}if(!i||i.running)return;const o=pt(e,i,i.actions);if(o.length)throw new AggregateError(o,"Native post effect disposal failed")}function Di(e,t,r,i,o,a,u){if(!i.some(L=>L.inputs.includes("depth")))return null;const c=o?.sceneDepth;if(!c?.available||!c.texture)return null;const s=e.textureRegistry?.textures.get(c.texture);if(!s)return null;const n=e.gl;We("S1:depth-prep:after-tonemap",o?.diagnosticToken);const h=r.acquire({width:a,height:u,format:"rgba32f",samples:1,depth:!1}),T=h.target,E=C(t,n,"depth-linearize",Xt);return M(e,t,E,f(T),[s],L=>{L.uniform1i(L.getUniformLocation(E,"u_depth"),0),L.uniform2f(L.getUniformLocation(E,"u_outputSize"),a,u),L.uniform2f(L.getUniformLocation(E,"u_jitterClip"),0,0),mt(L,E,c.linearize)}),h}function Ot(e,t,r,i){const o=e.gl;if(t){const a=f(t);o.bindFramebuffer(o.FRAMEBUFFER,a.framebuffer),o.viewport(0,0,a.width,a.height)}else e.lifecycle.bindOutput(null,r,i)}const Pi=`#version 300 es
precision highp float;
uniform sampler2D u_source;
in vec2 v_uv;
out vec4 outColor;
void main() { outColor = texture(u_source, v_uv); }
`;function Bi(e,t){pe.get(e)?.pool.release(t)}function Vi(e,t){return Ke(e).pool.acquire({...t,samples:1,depth:!1})}function $i(e,t){return Ke(e).pool.acquireLease({...t,samples:1,depth:!1})}export{Mi as BLOOM_DOWNSAMPLE_GLSL,zi as BLOOM_PREFILTER_GLSL,ki as BLOOM_UPSAMPLE_GLSL,Lr as CAMERA_VELOCITY_GLSL,vr as CA_PASS_GLSL,Oi as COMPOSITE_GLSL,Xt as DEPTH_LINEARIZE_GLSL,Sr as DEPTH_MINMAX_HALF_GLSL,hr as DISPLAY_GRADE_GLSL,oi as DisplayLutCache,gr as FINALIZE_FXAA_FUSED_GLSL,pr as FINALIZE_GLSL,rr as FXAA_185_FNS_GLSL,wr as GODRAYS_GLSL,Tr as GTAO_APPLY_GLSL,yr as GTAO_DENOISE_GLSL,Er as GTAO_GLSL,Ni as LUT_BAKE_GLSL,xr as PostResources,Vi as acquireV2Target,$i as acquireV2TargetLease,qi as bloomNormalization,ii as displayGradeKey,Ui as disposeNativePostEffects,ai as parseCubeLut,bi as prepareP3DisplayTail,Ai as releaseNativePostEffectScope,wi as releaseNativePostEffectView,Bi as releaseV2Target,Fi as runV2HdrStages,Gi as runV2LdrTail,Hi as v2NeedsLdrTail};
