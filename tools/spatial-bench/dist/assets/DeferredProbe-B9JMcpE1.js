import{R as P}from"./aura-Df1rjXw9.js";import"./harness-Bz_nXkdg.js";function c(e,t){throw new P(`Deferred probe ${e} ${t}`,"NATIVE_DRAW_INVALID_INPUT",{field:e})}function a(e){return typeof e=="object"&&e!==null}function f(e,t){return typeof e!="number"||!Number.isFinite(e)||!Number.isFinite(Math.fround(e))?c(t,"must be finite in float32"):e}function d(e,t,r){if(!e||typeof e!="object"||e instanceof DataView||e.length!==t)return c(r,`must contain ${t} values`);const o=e;return Array.from({length:t},(n,i)=>f(o[i],`${r}[${i}]`))}function p(e,t){const r=n=>f(e.get(n),n),o=n=>{const i=d(e.get(n),3,n);return[i[0],i[1],i[2]]};return{lease:t,sh:d(e.get("u_envSH"),28,"u_envSH"),mipCount:r("u_envMipCount"),rotation:r("u_envRotation"),diffuseIntensity:r("u_envDiffuseIntensity"),specularIntensity:r("u_envSpecularIntensity"),ambient:o("u_ambientIrradiance"),hemiSky:o("u_hemiSky"),hemiGround:o("u_hemiGround"),hemiDirection:o("u_hemiDirection")}}function x(e,t){(!e||typeof e!="object")&&c("input","is required");const{lease:r}=e;(!r||typeof r!="object"||!a(t)||r.device!==t)&&c("lease.device","must be the receiving native WebGPU device"),(!a(r.resource)||!a(r.view)||!a(r.sampler)||typeof r.assertUsable!="function")&&c("lease","must provide a native texture, cube view, sampler and liveness check");const o=d(e.sh,28,"sh"),n=f(e.mipCount,"mipCount");(!Number.isSafeInteger(n)||n<1)&&c("mipCount","must be a positive integer");const i=f(e.rotation,"rotation"),u=f(e.diffuseIntensity,"diffuseIntensity"),l=f(e.specularIntensity,"specularIntensity");(u<0||l<0)&&c("intensity","must be non-negative");const m=d(e.ambient,3,"ambient"),b=d(e.hemiSky,3,"hemiSky"),h=d(e.hemiGround,3,"hemiGround"),y=d(e.hemiDirection,3,"hemiDirection");r.assertUsable();const s=new Float32Array(48);return s.set(o,0),s[27]=0,s.set([n,i,u,l],28),s.set(m,32),s.set(b,36),s.set(h,40),s.set(y,44),{uniforms:s,lease:r}}function z(e){const t=[e.group,e.uniformBinding,e.samplerBinding,e.textureBinding];return(!t.every(r=>Number.isSafeInteger(r)&&r>=0&&r<=4294967295)||new Set(t.slice(1)).size!==3)&&c("bindings","must use distinct non-negative u32 binding numbers in one group"),`
struct AuraDeferredProbe {
  sh: array<vec4f, 7>,
  controls: vec4f,
  ambient: vec4f,
  hemiSky: vec4f,
  hemiGround: vec4f,
  hemiDirection: vec4f,
};
@group(${e.group}) @binding(${e.uniformBinding}) var<uniform> deferredProbe: AuraDeferredProbe;
@group(${e.group}) @binding(${e.samplerBinding}) var deferredProbeSampler: sampler;
@group(${e.group}) @binding(${e.textureBinding}) var deferredProbeTexture: texture_cube<f32>;

fn a3dDeferredProbeRotateY(d: vec3f, angle: f32) -> vec3f {
  let c = cos(angle); let s = sin(angle);
  return vec3f(c * d.x - s * d.z, d.y, s * d.x + c * d.z);
}
fn a3dDeferredProbeIrradiance(direction: vec3f) -> vec3f {
  let n = normalize(a3dDeferredProbeRotateY(direction, deferredProbe.controls.y));
  let x = n.x; let y = n.y; let z = n.z;
  let c0 = deferredProbe.sh[0].xyz; let c1 = vec3f(deferredProbe.sh[0].w, deferredProbe.sh[1].xy);
  let c2 = vec3f(deferredProbe.sh[1].zw, deferredProbe.sh[2].x); let c3 = deferredProbe.sh[2].yzw;
  let c4 = deferredProbe.sh[3].xyz; let c5 = vec3f(deferredProbe.sh[3].w, deferredProbe.sh[4].xy);
  let c6 = vec3f(deferredProbe.sh[4].zw, deferredProbe.sh[5].x); let c7 = deferredProbe.sh[5].yzw;
  let c8 = deferredProbe.sh[6].xyz;
  let irradiance = c0 * 0.282095 + c1 * (-0.488603 * y) + c2 * (0.488603 * z) + c3 * (-0.488603 * x)
    + c4 * (1.092548 * x * y) + c5 * (1.092548 * y * z) + c6 * (0.315392 * (3.0 * z * z - 1.0))
    + c7 * (1.092548 * x * z) + c8 * (0.546274 * (x * x - y * y));
  return max(irradiance, vec3f(0.0)) * deferredProbe.controls.z;
}
fn a3dDeferredProbeIndirect(n: vec3f, view: vec3f, material: AuraPhysicalMaterial, dfg: vec2f) -> AuraPhysicalLightResult {
  let roughness = clamp(material.roughness, 0.0525, 1.0);
  let reflected = reflect(-view, n);
  let bent = normalize(mix(reflected, n, roughness * roughness * roughness * roughness));
  let lod = (max(deferredProbe.controls.x, 1.0) - 1.0) * roughness * (2.0 - roughness);
  let radiance = textureSampleLevel(deferredProbeTexture, deferredProbeSampler,
    a3dDeferredProbeRotateY(bent, deferredProbe.controls.y), lod).rgb * deferredProbe.controls.w;
  var result = a3dPhysicalIndirect(dot(n, view), radiance, a3dDeferredProbeIrradiance(n), material, dfg);
  let hemi = mix(deferredProbe.hemiGround.rgb, deferredProbe.hemiSky.rgb,
    dot(n, deferredProbe.hemiDirection.xyz) * 0.5 + 0.5);
  let diffuseColor = clamp(material.baseColor, vec3f(0.0), vec3f(1.0)) * (1.0 - clamp(material.metalness, 0.0, 1.0));
  result.diffuse += (deferredProbe.ambient.rgb + hemi / A3D_PHYSICAL_PI) * diffuseColor;
  return result;
}
`}export{p as deferredProbeFromUniforms,z as deferredProbeWgsl,x as packDeferredProbe};
