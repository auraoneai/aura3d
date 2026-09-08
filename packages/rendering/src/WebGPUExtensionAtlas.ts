import type { UniformValue } from "./RenderDevice";

export const WEBGPU_ATLAS_MAPS = ["baseColor", "normal", "metallicRoughness", "occlusion", "emissive", "clearcoat", "clearcoatRoughness", "clearcoatNormal", "sheenColor", "sheenRoughness", "anisotropy", "iridescence", "iridescenceThickness"] as const;
/** Layout mirrors AtlasUniforms: 13 map records of five vec4s, then seven vec4s. */
export function webgpuExtensionAtlasUniforms(uniforms?: ReadonlyMap<string, UniformValue>): Float32Array {
  const out = new Float32Array(13 * 20 + 28);
  const number = (key: string, fallback = 0) => { const value = uniforms?.get(key); return typeof value === "number" ? value : fallback; };
  const vector = (key: string, fallback: readonly number[]) => { const value = uniforms?.get(key); return Array.isArray(value) || value instanceof Float32Array ? value : fallback; };
  WEBGPU_ATLAS_MAPS.forEach((slot, index) => {
    const offset = index * 20;
    out.set(vector(`u_${slot}TextureOffset`, [0, 0]), offset);
    out.set(vector(`u_${slot}TextureScale`, [1, 1]), offset + 2);
    out.set([number(`u_${slot}TextureRotation`), number(`u_${slot}TextureTexCoord`), number(`u_${slot}TextureEnabled`), number(`u_${slot}AtlasY`)], offset + 4);
    out.set(vector(`u_${slot}TextureWrap`, [0, 0]), offset + 8);
    out.set(vector(`u_${slot}AtlasRect`, [0, 1, 1, 0]), offset + 12);
    out.set(vector(`u_${slot}AtlasFilter`, [0, 0, 0, 1]), offset + 16);
  });
  out.set([number("u_clearcoatFactor"), number("u_clearcoatRoughnessFactor"), number("u_clearcoatNormalScale", 1), number("u_sheenRoughnessFactor")], 260);
  out.set([...vector("u_sheenColorFactor", [0, 0, 0]), number("u_anisotropyStrength")], 264);
  out.set([number("u_anisotropyRotation"), number("u_iridescenceFactor"), number("u_iridescenceIor", 1.3), number("u_iridescenceThicknessMinimum", 100)], 268);
  out.set([number("u_iridescenceThicknessMaximum", 400), number("u_emissiveStrength", 1), number("u_materialEnvironmentSpecularScale", 1), 0], 272);
  out.set([...vector("u_emissiveColor", [0, 0, 0]), 0], 276);
  out.set([number("u_ior", 1.5), number("u_specularFactor", 1), 0, 0], 280);
  out.set([...vector("u_specularColorFactor", [1, 1, 1]), 0], 284);
  return out;
}

export const WEBGPU_EXTENSION_ATLAS_WGSL = `
struct AtlasMap {
  transform: vec4<f32>,
  control: vec4<f32>,
  wrapMode: vec4<f32>,
  rect: vec4<f32>,
  filterMode: vec4<f32>,
};
struct AtlasUniforms {
  maps: array<AtlasMap, 13>,
  coat: vec4<f32>,
  sheen: vec4<f32>,
  iridescence: vec4<f32>,
  factors: vec4<f32>,
  emissive: vec4<f32>,
  substrate: vec4<f32>,
  specularColor: vec4<f32>,
};
@group(0) @binding(19) var<uniform> u_atlas: AtlasUniforms;
@group(0) @binding(20) var u_scalarAtlas: texture_2d<f32>;
@group(0) @binding(21) var u_coatNormalSampler: sampler;
@group(0) @binding(22) var u_coatNormalTexture: texture_2d<f32>;
@group(0) @binding(23) var u_sheenSampler: sampler;
@group(0) @binding(24) var u_sheenTexture: texture_2d<f32>;
@group(0) @binding(25) var u_anisotropySampler: sampler;
@group(0) @binding(26) var u_anisotropyTexture: texture_2d<f32>;
@group(0) @binding(27) var u_emissiveSampler: sampler;
@group(0) @binding(28) var u_emissiveTexture: texture_2d<f32>;
fn atlasUv(index: u32, uv0: vec2<f32>, uv1: vec2<f32>) -> vec2<f32> {
  let map = u_atlas.maps[index];
  let uv = select(uv0,uv1,map.control.y > 0.5) * map.transform.zw;
  let cosine = cos(map.control.x); let sine = sin(map.control.x);
  return vec2<f32>(cosine*uv.x-sine*uv.y,sine*uv.x+cosine*uv.y)+map.transform.xy;
}
fn atlasWrapIndex(x: i32, size: i32, mode: f32) -> i32 {
  if (mode<0.5) { return clamp(x,0,size-1); }
  let period=select(size,2*size,mode>1.5);
  let index=((x%period)+period)%period;
  return select(index,period-1-index,mode>1.5 && index>=size);
}
fn atlasFetch(point: vec2<i32>, size: vec2<i32>, origin: vec2<i32>, wrapMode: vec2<f32>) -> vec4<f32> {
  let wrapped=vec2<i32>(atlasWrapIndex(point.x,size.x,wrapMode.x),atlasWrapIndex(point.y,size.y,wrapMode.y));
  return textureLoad(u_scalarAtlas,origin+wrapped,0);
}
fn atlasLevel(uv: vec2<f32>, map: AtlasMap, level: i32, nearestFilter: bool) -> vec4<f32> {
  var size=vec2<i32>(map.rect.yz); var origin=vec2<i32>(i32(map.rect.x),i32(map.control.w));
  for (var i=0;i<16;i=i+1) { if (i>=level) { break; } origin.y=origin.y+size.y; size=max(size/2,vec2<i32>(1)); }
  let pixel=uv*vec2<f32>(size)-0.5;
  if (nearestFilter) { return atlasFetch(vec2<i32>(floor(pixel+0.5)),size,origin,map.wrapMode.xy); }
  let low=vec2<i32>(floor(pixel)); let fraction=fract(pixel);
  return mix(mix(atlasFetch(low,size,origin,map.wrapMode.xy),atlasFetch(low+vec2<i32>(1,0),size,origin,map.wrapMode.xy),fraction.x),
             mix(atlasFetch(low+vec2<i32>(0,1),size,origin,map.wrapMode.xy),atlasFetch(low+vec2<i32>(1,1),size,origin,map.wrapMode.xy),fraction.x),fraction.y);
}
fn atlasSample(index: u32, uv0: vec2<f32>, uv1: vec2<f32>) -> vec4<f32> {
  let map=u_atlas.maps[index]; let uv=atlasUv(index,uv0,uv1);
  let dx=dpdx(uv); let dy=dpdy(uv); let lx=length(dx*map.rect.yz); let ly=length(dy*map.rect.yz);
  let major=max(lx,ly); let minor=max(min(lx,ly),0.000001); let magnify=major<=1.0;
  let taps=select(clamp(ceil(major/max(minor,1.0)),1.0,floor(map.filterMode.w)),1.0,magnify);
  let axis=select(dy,dx,lx>=ly);
  var lod=clamp(log2(max(major/taps,1.0)),0.0,map.rect.w);
  if (map.filterMode.z<0.5) { lod=0.0; } else if (map.filterMode.z<1.5) { lod=floor(lod+0.5); }
  let low=i32(floor(lod)); let high=min(low+1,i32(map.rect.w));
  let nearestFilter=select(map.filterMode.y>0.5,map.filterMode.x>0.5,magnify);
  var total=vec4<f32>(0.0);
  for (var i=0;i<16;i=i+1) { if (f32(i)>=taps) { break; }
    let sampleUv=uv+axis*((f32(i)+0.5)/taps-0.5);
    total=total+mix(atlasLevel(sampleUv,map,low,nearestFilter),atlasLevel(sampleUv,map,high,nearestFilter),fract(lod));
  }
  return total/taps;
}
/* Spectral thin-film evaluation adapted from three.js iridescence_fragment (MIT).
The MIT License

Copyright © 2010-2026 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/
// Belcour/Barla Fourier-domain CIE XYZ sensitivity, converted to linear Rec.709.
// Three monochromatic wavelength samples are not RGB tristimulus reflectance.
fn atlasFilmSensitivity(opd: f32, shift: vec3<f32>) -> vec3<f32> {
  let phase=2.0*3.14159265359*opd*1.0e-9;
  let variance=vec3<f32>(4.3278e9,9.3046e9,6.6121e9);
  var xyz=vec3<f32>(5.4856e-13,4.4201e-13,5.2481e-13)*sqrt(2.0*3.14159265359*variance)
    *cos(vec3<f32>(1.6810e6,1.7953e6,2.2084e6)*phase+shift)*exp(-phase*phase*variance);
  xyz.x=xyz.x+9.7470e-14*sqrt(2.0*3.14159265359*4.5282e9)*cos(2.2399e6*phase+shift.x)*exp(-4.5282e9*phase*phase);
  xyz=xyz/1.0685e-7;
  return mat3x3<f32>(vec3<f32>(3.2404542,-0.9692660,0.0556434),vec3<f32>(-1.5371385,1.8760108,-0.2040259),vec3<f32>(-0.4985314,0.0415560,1.0572252))*xyz;
}
fn atlasThinFilm(substrateF0: vec3<f32>, filmIor: f32, thickness: f32, cosine: f32) -> vec3<f32> {
  let c1=clamp(cosine,0.0001,1.0);
  if (thickness<=0.0) { return fresnelSchlick(c1,substrateF0); }
  let n2=mix(1.0,filmIor,smoothstep(0.0,0.03,thickness));
  let c2Squared=1.0-(1.0-c1*c1)/(n2*n2);
  if (c2Squared<0.0) { return vec3<f32>(1.0); }
  let c2=sqrt(c2Squared);
  let f12=(n2-1.0)/(n2+1.0);
  let r12=fresnelSchlick(c1,vec3<f32>(f12*f12)).x;
  let t121=1.0-r12;
  let rootF0=sqrt(clamp(substrateF0,vec3<f32>(0.0),vec3<f32>(0.9999)));
  let n3=(vec3<f32>(1.0)+rootF0)/(vec3<f32>(1.0)-rootF0);
  let f23=(n3-vec3<f32>(n2))/(n3+vec3<f32>(n2));
  let r23=fresnelSchlick(c2,f23*f23);
  let phi21=select(3.14159265359,0.0,n2<1.0);
  let phi=vec3<f32>(phi21)+select(vec3<f32>(0.0),vec3<f32>(3.14159265359),n3<vec3<f32>(n2));
  let opd=2.0*n2*thickness*c2;
  let r123=clamp(r12*r23,vec3<f32>(0.00001),vec3<f32>(0.9999));
  let amplitude=sqrt(r123);
  let rs=t121*t121*r23/(vec3<f32>(1.0)-r123);
  var reflectance=vec3<f32>(r12)+rs;
  var coefficient=rs-vec3<f32>(t121);
  for (var order=1;order<=2;order=order+1) {
    coefficient=coefficient*amplitude;
    reflectance=reflectance+coefficient*2.0*atlasFilmSensitivity(f32(order)*opd,f32(order)*phi);
  }
  return max(reflectance,vec3<f32>(0.0));
}

// KHR_materials_iridescence: a missing thickness map samples 1.0, and
// the dielectric base receives inverse-max Fresnel weighting (rgb_mix).
fn atlasIridescenceFresnel(substrateF0: vec3<f32>, cosine: f32, uv0: vec2<f32>, uv1: vec2<f32>) -> vec3<f32> {
  let strength=clamp(u_atlas.iridescence.y*mix(1.0,atlasSample(11u,uv0,uv1).r,u_atlas.maps[11].control.z),0.0,1.0);
  let thickness=mix(u_atlas.iridescence.w,u_atlas.factors.x,mix(1.0,atlasSample(12u,uv0,uv1).g,u_atlas.maps[12].control.z));
  return mix(fresnelSchlick(cosine,substrateF0),atlasThinFilm(substrateF0,u_atlas.iridescence.z,thickness,cosine),strength);
}

// Recover the Schlick normal-incidence coefficient before applying the split-sum
// BRDF LUT. Multiplying an already Fresnel-weighted environment by a Fresnel
// difference would count Fresnel twice and incorrectly scale the LUT bias term.
fn atlasIridescenceEnvironmentF0(substrateF0: vec3<f32>, cosine: f32, uv0: vec2<f32>, uv1: vec2<f32>) -> vec3<f32> {
  let strength=clamp(u_atlas.iridescence.y*mix(1.0,atlasSample(11u,uv0,uv1).r,u_atlas.maps[11].control.z),0.0,1.0);
  let thickness=mix(u_atlas.iridescence.w,u_atlas.factors.x,mix(1.0,atlasSample(12u,uv0,uv1).g,u_atlas.maps[12].control.z));
  let grazing=clamp(pow(clamp(1.0-cosine,0.0,1.0),5.0),0.0,0.9999);
  let filmF0=(atlasThinFilm(substrateF0,u_atlas.iridescence.z,thickness,cosine)-vec3<f32>(grazing))/(1.0-grazing);
  return mix(substrateF0,filmF0,strength);
}

fn atlasExtensionLighting(normal: vec3<f32>, tangent: vec4<f32>, view: vec3<f32>, light: vec3<f32>, uv0: vec2<f32>, uv1: vec2<f32>, shadow: f32, environment: vec3<f32>, substrateF0: vec3<f32>, substrateRoughness: f32) -> vec3<f32> {
  let coatMask=atlasSample(5u,uv0,uv1).r; let coatRoughMask=atlasSample(6u,uv0,uv1).g;
  let sheenRoughMask=atlasSample(9u,uv0,uv1).a; let filmMask=atlasSample(11u,uv0,uv1).r;
  let thicknessMask=atlasSample(12u,uv0,uv1).g;
  let coatNormalSample=textureSample(u_coatNormalTexture,u_coatNormalSampler,atlasUv(7u,uv0,uv1)).rgb;
  let coatNormal=normalize(mix(normal,perturbNormal(normal,tangent,coatNormalSample,u_atlas.coat.z),u_atlas.maps[7].control.z));
  let sheenSample=textureSample(u_sheenTexture,u_sheenSampler,atlasUv(8u,uv0,uv1)).rgb;
  let anisotropySample=textureSample(u_anisotropyTexture,u_anisotropySampler,atlasUv(10u,uv0,uv1));
  let coat=u_atlas.coat.x*mix(1.0,coatMask,u_atlas.maps[5].control.z);
  let coatRough=max(0.045,u_atlas.coat.y*mix(1.0,coatRoughMask,u_atlas.maps[6].control.z));
  let sheen=u_atlas.sheen.rgb*mix(vec3<f32>(1.0),sheenSample,u_atlas.maps[8].control.z);
  let sheenRough=max(0.045,u_atlas.coat.w*mix(1.0,sheenRoughMask,u_atlas.maps[9].control.z));
  let anisotropy=u_atlas.sheen.w*mix(1.0,anisotropySample.b,u_atlas.maps[10].control.z);
  let film=u_atlas.iridescence.y*mix(1.0,filmMask,u_atlas.maps[11].control.z);
  let thickness=mix(u_atlas.iridescence.w,u_atlas.factors.x,mix(1.0,thicknessMask,u_atlas.maps[12].control.z));
  let halfVector=normalize(light+view); let ndl=max(dot(normal,light),0.0); let ndv=max(dot(normal,view),0.001);
  let coatNdl=max(dot(coatNormal,light),0.0); let coatNdv=max(dot(coatNormal,view),0.001); let coatNdh=max(dot(coatNormal,halfVector),0.001);
  let coatBrdf=coat*ggxDistribution(coatNdh,coatRough)*ggxVisibilitySmithCorrelated(coatNdv,coatNdl,coatRough)*fresnelSchlick(max(dot(view,halfVector),0.0),vec3<f32>(0.04));
  let ndh=max(dot(normal,halfVector),0.0); let inverseRoughness=1.0/(sheenRough*sheenRough);
  let charlie=(2.0+inverseRoughness)*pow(max(1.0-ndh*ndh,0.00001),0.5*inverseRoughness)/(2.0*3.14159265);
  let sheenBrdf=sheen*charlie/max(4.0*(ndl+ndv-ndl*ndv),0.0001);
  let tx=normalize(tangent.xyz-normal*dot(tangent.xyz,normal)); let ty=normalize(cross(normal,tx))*tangent.w;
  let mappedDirection=mix(vec2<f32>(1.0,0.0),anisotropySample.rg*2.0-1.0,u_atlas.maps[10].control.z);
  let angle=u_atlas.iridescence.x+atan2(mappedDirection.y,mappedDirection.x);
  let axis=tx*cos(angle)+ty*sin(angle); let crossAxis=-tx*sin(angle)+ty*cos(angle);
  // Anisotropy and iridescence modify the same substrate specular BRDF.
  // KHR anisotropy broadens the tangent alpha; it is not an extra white lobe.
  let alpha=max(substrateRoughness,0.045)*max(substrateRoughness,0.045);
  let ax=mix(alpha,1.0,clamp(anisotropy*anisotropy,0.0,1.0)); let ay=alpha;
  let tangentH=dot(halfVector,axis)/ax; let bitangentH=dot(halfVector,crossAxis)/ay;
  let denominator=tangentH*tangentH+bitangentH*bitangentH+ndh*ndh;
  let anisotropicD=1.0/max(3.14159265*ax*ay*denominator*denominator,0.0000000000000001);
  let lambdaV=ndl*length(vec3<f32>(ax*dot(axis,view),ay*dot(crossAxis,view),ndv));
  let lambdaL=ndv*length(vec3<f32>(ax*dot(axis,light),ay*dot(crossAxis,light),ndl));
  let anisotropicV=0.5/max(lambdaV+lambdaL,0.00001);
  let isotropicDv=ggxDistribution(ndh,substrateRoughness)*ggxVisibilitySmithCorrelated(ndv,ndl,substrateRoughness);
  let substrateDv=select(isotropicDv,anisotropicD*anisotropicV,anisotropy>0.0);
  let vdh=max(dot(view,halfVector),0.0001);
  let substrateFresnel=fresnelSchlick(vdh,substrateF0);
  let anisotropicBrdf=substrateFresnel*(substrateDv-isotropicDv);
  let filmDirect=film*(atlasThinFilm(substrateF0,u_atlas.iridescence.z,thickness,vdh)-substrateFresnel)*substrateDv;
  // Film environment energy is integrated once in shadePbr through the BRDF LUT.
  let filmEnvironment=vec3<f32>(0.0);
  let direct=(coatBrdf*coatNdl+(sheenBrdf+anisotropicBrdf+filmDirect)*ndl)*2.25*shadow;
  return (direct+environment*(coat*0.04+sheen*pow(1.0-ndv,5.0)+filmEnvironment))*u_atlas.factors.z;

}
`;
