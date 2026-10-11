/**
 * r185-golden-cases.ts — the 20 r185 golden cases on the 16×16×8 grid
 * (PRD-04 §14 P1-3). A line-for-line port of `build_cases()` in
 * `tests/qr/prd04/oracles/generate-r185-golden.py`, so the browser generator
 * (`generate-r185-golden.spec.ts`) and the python/llvmpipe script produce the
 * same `r185-golden.json` schema from the same three.js GLSL. Keep the two in
 * step; `call` bodies reference three's own function names verbatim.
 *
 * `axes` are [lo, hi, n] linspaces; `fixed` are constant args (`u_f_<name>`);
 * `u_x<i>` is the i-th `argorder` axis decoded from the pixel index.
 */
export interface R185GoldenCase {
  readonly fn: string;
  readonly desc: string;
  readonly needs: {
    readonly phys?: readonly string[];
    readonly transmission?: readonly string[];
    readonly irid?: readonly string[];
  };
  readonly defines?: readonly string[];
  readonly struct?: "PhysicalMaterial";
  readonly textures?: readonly "dfg"[];
  readonly mat3?: "XYZ_TO_REC709";
  readonly extraDecls?: readonly string[];
  readonly axes: Readonly<Record<string, readonly [number, number, number]>>;
  readonly fixed: Readonly<Record<string, number | readonly number[]>>;
  readonly out: 1 | 3;
  readonly call: string;
  readonly argorder: readonly string[];
}

const V_FROM_NV = "vec3(0.0, sqrt(max(0.0,1.0-u_x0*u_x0)), u_x0)";
const F0S = "vec3 f0s[4] = vec3[4](vec3(0.04), vec3(0.5,0.4,0.3), vec3(0.9), vec3(0.2,0.6,0.9));\n";
const IOR_TO_F0_F =
  "float IorToFresnel0( float transmittedIor, float incidentIor ) { return pow2( ( transmittedIor - incidentIor ) / ( transmittedIor + incidentIor ) ); }";

export const R185_GOLDEN_CASES: readonly R185GoldenCase[] = [
  {
    fn: "dCharlie", desc: "r185 D_Charlie (sheen NDF)",
    needs: { phys: ["D_Charlie"] },
    axes: { roughness: [0.05, 1.0, 16], dotNH: [0.0, 1.0, 16] }, fixed: {}, out: 1,
    call: "o = vec4( D_Charlie( u_x0, u_x1 ), 0.0, 0.0, 1.0 );", argorder: ["roughness", "dotNH"]
  },
  {
    fn: "vNeubelt", desc: "r185 V_Neubelt (sheen visibility)",
    needs: { phys: ["V_Neubelt"] },
    axes: { dotNV: [0.0, 1.0, 16], dotNL: [0.0, 1.0, 16] }, fixed: {}, out: 1,
    call: "o = vec4( V_Neubelt( u_x0, u_x1 ), 0.0, 0.0, 1.0 );", argorder: ["dotNV", "dotNL"]
  },
  {
    fn: "iblSheenBRDF", desc: "r185 IBLSheenBRDF(n,v,r) with N=(0,0,1), V reconstructed from dotNV",
    needs: { phys: ["IBLSheenBRDF"] },
    axes: { dotNV: [0.0, 1.0, 16], roughness: [0.0001, 1.0, 16] }, fixed: {}, out: 1,
    call: `o = vec4( IBLSheenBRDF( vec3(0.0,0.0,1.0), ${V_FROM_NV}, u_x1 ), 0.0, 0.0, 1.0 );`,
    argorder: ["dotNV", "roughness"]
  },
  {
    fn: "dGGXAnisotropic", desc: "r185 D_GGX_Anisotropic(alphaT,alphaB,dotNH,dotTH,dotBH); alphaT=0.49 alphaB=0.09 fixed",
    needs: { phys: ["D_GGX_Anisotropic"] }, defines: ["USE_ANISOTROPY"],
    axes: { dotNH: [0.0, 1.0, 16], dotTH: [-1.0, 1.0, 16], dotBH: [-1.0, 1.0, 8] },
    fixed: { alphaT: 0.49, alphaB: 0.09 }, out: 1,
    call: "o = vec4( D_GGX_Anisotropic( u_f_alphaT, u_f_alphaB, u_x0, u_x1, u_x2 ), 0.0, 0.0, 1.0 );",
    argorder: ["dotNH", "dotTH", "dotBH"]
  },
  {
    fn: "vGGXAnisotropic",
    desc: "r185 V_GGX_SmithCorrelated_Anisotropic; axes dotNV,dotNL,alphaT; alphaB=0.09, dotTV=0.3, dotBV=0.4, dotTL=0.55, dotBL=0.65 fixed",
    needs: { phys: ["V_GGX_SmithCorrelated_Anisotropic"] }, defines: ["USE_ANISOTROPY"],
    axes: { dotNV: [0.0, 1.0, 16], dotNL: [0.0, 1.0, 16], alphaT: [0.04, 1.0, 8] },
    fixed: { alphaB: 0.09, dotTV: 0.3, dotBV: 0.4, dotTL: 0.55, dotBL: 0.65 }, out: 1,
    call: "o = vec4( V_GGX_SmithCorrelated_Anisotropic( u_x2, u_f_alphaB, u_f_dotTV, u_f_dotBV, u_f_dotTL, u_f_dotBL, u_x0, u_x1 ), 0.0, 0.0, 1.0 );",
    argorder: ["dotNV", "dotNL", "alphaT"]
  },
  {
    fn: "evalIridescence", desc: "r185 evalIridescence(1.0, eta2, cosTheta1, thickness, baseF0); baseF0=(0.04,0.2,0.5) fixed",
    needs: { irid: ["evalSensitivity", "evalIridescence"] }, mat3: "XYZ_TO_REC709",
    extraDecls: [
      "vec3 Fresnel0ToIor( vec3 fresnel0 ) { vec3 sqrtF0 = sqrt( fresnel0 ); return ( vec3( 1.0 ) + sqrtF0 ) / ( vec3( 1.0 ) - sqrtF0 ); }",
      "vec3 IorToFresnel0( vec3 transmittedIor, float incidentIor ) { return pow2( ( transmittedIor - vec3( incidentIor ) ) / ( transmittedIor + vec3( incidentIor ) ) ); }",
      IOR_TO_F0_F
    ],
    defines: ["USE_IRIDESCENCE"],
    axes: { cosTheta1: [0.001, 1.0, 16], thickness: [0.0, 1200.0, 16], eta2: [1.0, 2.4, 8] },
    fixed: { outsideIOR: 1.0, baseF0: [0.04, 0.2, 0.5] }, out: 3,
    call: "o = vec4( evalIridescence( u_f_outsideIOR, u_x2, u_x0, u_x1, u_f_baseF0 ), 1.0 );",
    argorder: ["cosTheta1", "thickness", "eta2"]
  },
  {
    fn: "computeSpecularOcclusion", desc: "r185 computeSpecularOcclusion(dotNV, ao, roughness)",
    needs: { phys: ["computeSpecularOcclusion"] },
    axes: { dotNV: [0.0, 1.0, 16], ao: [0.0, 1.0, 16], roughness: [0.0, 1.0, 8] }, fixed: {}, out: 1,
    call: "o = vec4( computeSpecularOcclusion( u_x0, u_x1, u_x2 ), 0.0, 0.0, 1.0 );", argorder: ["dotNV", "ao", "roughness"]
  },
  {
    fn: "applyIorToRoughness", desc: "r185 applyIorToRoughness(roughness, ior)",
    needs: { transmission: ["applyIorToRoughness"] }, defines: ["USE_TRANSMISSION"],
    axes: { roughness: [0.0, 1.0, 16], ior: [1.0, 2.4, 8] }, fixed: {}, out: 1,
    call: "o = vec4( applyIorToRoughness( u_x0, u_x1 ), 0.0, 0.0, 1.0 );", argorder: ["roughness", "ior"]
  },
  {
    fn: "volumeAttenuation", desc: "r185 volumeAttenuation(distance, color, attenuationDistance); color=(0.85,0.62,0.35) fixed",
    needs: { transmission: ["volumeAttenuation"] }, defines: ["USE_TRANSMISSION"],
    axes: { transmissionDistance: [0.0, 4.0, 16], attenuationDistance: [0.1, 10.0, 8] },
    fixed: { attenuationColor: [0.85, 0.62, 0.35] }, out: 3,
    call: "o = vec4( volumeAttenuation( u_x0, u_f_attenuationColor, u_x1 ), 1.0 );",
    argorder: ["transmissionDistance", "attenuationDistance"]
  },
  {
    fn: "iorToF0", desc: "r185 IorToFresnel0(ior,1.0) — the [09] IOR-F0 rule",
    needs: { irid: [] }, extraDecls: [IOR_TO_F0_F],
    axes: { ior: [1.0, 2.4, 16] }, fixed: { incidentIOR: 1.0 }, out: 1,
    call: "o = vec4( IorToFresnel0( u_x0, 1.0 ), 0.0, 0.0, 1.0 );", argorder: ["ior"]
  },
  {
    fn: "specIorSpecularColor",
    desc: "r185 specularColor = min(pow2((ior-1)/(ior+1))*specColorFactor,1)*specIntensity (lights_physical_fragment.glsl.js:45)",
    needs: {},
    axes: { ior: [1.0, 2.4, 16], specularIntensity: [0.0, 1.0, 8] }, fixed: { specularColorFactor: [0.9, 0.8, 0.7] }, out: 3,
    call: "o = vec4( min( pow2( ( u_x0 - 1.0 ) / ( u_x0 + 1.0 ) ) * u_f_specularColorFactor, vec3( 1.0 ) ) * u_x1, 1.0 );",
    argorder: ["ior", "specularIntensity"]
  },
  {
    fn: "specIorSpecularF90", desc: "r185 specularF90 = mix( specularIntensity, 1.0, metalness ) (:35)",
    needs: {},
    axes: { specularIntensity: [0.0, 1.0, 16], metalness: [0.0, 1.0, 8] }, fixed: {}, out: 1,
    call: "o = vec4( mix( u_x0, 1.0, u_x1 ), 0.0, 0.0, 1.0 );", argorder: ["specularIntensity", "metalness"]
  },
  {
    fn: "clearcoatFccCompose",
    desc: "r185 meshphysical.glsl.js:205-212: out*(1-cc*Fcc)+(ccD+ccI)*cc; Fcc=F_Schlick(0.04,1,dotNVcc)",
    needs: {},
    axes: { clearcoat: [0.0, 1.0, 16], dotNVcc: [0.0, 1.0, 16], scale: [0.0, 1.0, 8] }, fixed: {}, out: 3,
    call:
      "vec3 outgoing = vec3(0.5,0.4,0.3) * u_x2 + vec3(0.1);\n" +
      "vec3 ccD = vec3(0.8,0.2,0.1) * (0.5 + 0.5 * u_x2);\n" +
      "vec3 ccI = vec3(0.1,0.3,0.6) * (1.0 - 0.5 * u_x2);\n" +
      "vec3 Fcc = F_Schlick( vec3(0.04), 1.0, u_x1 );\n" +
      "o = vec4( outgoing * ( 1.0 - u_x0 * Fcc ) + ( ccD + ccI ) * u_x0, 1.0 );",
    argorder: ["clearcoat", "dotNVcc", "scale"]
  },
  {
    fn: "environmentBRDF", desc: "r185 EnvironmentBRDF(n,v,f0,f90,r) over the r185 DFG LUT; f90=1 fixed, f0 cycles",
    needs: { phys: ["EnvironmentBRDF"] }, textures: ["dfg"],
    axes: { dotNV: [0.0, 1.0, 16], roughness: [0.0, 1.0, 16], f0idx: [0.0, 3.9999, 4] }, fixed: { f90: 1.0 }, out: 3,
    call: `${F0S}vec3 f0 = f0s[int(u_x2)];\no = vec4( EnvironmentBRDF( vec3(0,0,1), ${V_FROM_NV}, f0, 1.0, u_x1 ), 1.0 );`,
    argorder: ["dotNV", "roughness", "f0idx"]
  },
  {
    fn: "multiscatteringSingle", desc: "r185 computeMultiscattering singleScatter out (env IBL, DFG LUT)",
    needs: { phys: ["computeMultiscattering"] }, textures: ["dfg"],
    axes: { dotNV: [0.0, 1.0, 16], roughness: [0.0, 1.0, 16], f0idx: [0.0, 3.9999, 4] }, fixed: { specularF90: 1.0 }, out: 3,
    call:
      `${F0S}vec3 f0 = f0s[int(u_x2)];\nvec3 single = vec3(0.0); vec3 multi = vec3(0.0);\n` +
      `computeMultiscattering( vec3(0,0,1), ${V_FROM_NV}, f0, 1.0, u_x1, single, multi );\no = vec4( single, 1.0 );`,
    argorder: ["dotNV", "roughness", "f0idx"]
  },
  {
    fn: "multiscatteringMulti", desc: "r185 computeMultiscattering multiScatter out",
    needs: { phys: ["computeMultiscattering"] }, textures: ["dfg"],
    axes: { dotNV: [0.0, 1.0, 16], roughness: [0.0, 1.0, 16], f0idx: [0.0, 3.9999, 4] }, fixed: { specularF90: 1.0 }, out: 3,
    call:
      `${F0S}vec3 f0 = f0s[int(u_x2)];\nvec3 single = vec3(0.0); vec3 multi = vec3(0.0);\n` +
      `computeMultiscattering( vec3(0,0,1), ${V_FROM_NV}, f0, 1.0, u_x1, single, multi );\no = vec4( multi, 1.0 );`,
    argorder: ["dotNV", "roughness", "f0idx"]
  },
  {
    fn: "sheenDirect", desc: "r185 BRDF_Sheen(L,V,N,sheenColor,r); N=(0,0,1), V/L reconstructed, sheenColor=(0.4,0.6,0.9)",
    needs: { phys: ["D_Charlie", "V_Neubelt", "BRDF_Sheen"] },
    axes: { dotNV: [0.0, 1.0, 16], dotNL: [0.0, 1.0, 16], roughness: [0.0, 1.0, 8] }, fixed: { sheenColor: [0.4, 0.6, 0.9] }, out: 3,
    call:
      `vec3 N = vec3(0.0,0.0,1.0);\nvec3 V = ${V_FROM_NV};\nvec3 L = vec3(0.0, sqrt(max(0.0,1.0-u_x1*u_x1)), u_x1);\n` +
      "o = vec4( BRDF_Sheen( L, V, N, u_f_sheenColor, u_x2 ), 1.0 );",
    argorder: ["dotNV", "dotNL", "roughness"]
  },
  {
    fn: "brdfGGXMultiscatter",
    desc: "r185 BRDF_GGX_Multiscatter(L,V,N,material); N=(0,0,1), V/L reconstructed; specularColorBlended cycles palette, specularF90=1",
    needs: { phys: ["V_GGX_SmithCorrelated", "D_GGX", "BRDF_GGX", "BRDF_GGX_Multiscatter"] },
    struct: "PhysicalMaterial", textures: ["dfg"],
    axes: { dotNV: [0.0, 1.0, 16], dotNL: [0.0, 1.0, 16], roughness: [0.05, 1.0, 4], f0idx: [0.0, 3.9999, 4] },
    fixed: { specularF90: 1.0 }, out: 3,
    call:
      `vec3 N = vec3(0.0,0.0,1.0);\nvec3 V = ${V_FROM_NV};\nvec3 L = vec3(0.0, sqrt(max(0.0,1.0-u_x1*u_x1)), u_x1);\n` +
      `${F0S}PhysicalMaterial material;\nmaterial.specularColorBlended = f0s[ int(u_x3) ];\n` +
      "material.specularF90 = 1.0;\nmaterial.roughness = u_x2;\no = vec4( BRDF_GGX_Multiscatter( L, V, N, material ), 1.0 );",
    argorder: ["dotNV", "dotNL", "roughness", "f0idx"]
  },
  {
    fn: "anisotropyAlphaT", desc: "r185 alphaT = mix( pow2(roughness), 1.0, pow2(anisotropy) ) (lights_physical_fragment:155)",
    needs: {},
    axes: { roughness: [0.0, 1.0, 16], anisotropy: [0.0, 1.0, 16] }, fixed: {}, out: 1,
    call: "o = vec4( mix( pow2(u_x0), 1.0, pow2(u_x1) ), 0.0, 0.0, 1.0 );", argorder: ["roughness", "anisotropy"]
  },
  {
    fn: "volumeTransmissionRay",
    desc: "r185 getVolumeTransmissionRay(n,v,thickness,ior,modelMatrix); N=(0,0,1) V from dotNV, identity model",
    needs: { transmission: ["getVolumeTransmissionRay"] }, defines: ["USE_TRANSMISSION"],
    axes: { dotNV: [0.0, 1.0, 16], thickness: [0.0, 3.0, 16], ior: [1.0, 2.4, 8] }, fixed: {}, out: 3,
    call:
      `vec3 N = vec3(0.0,0.0,1.0);\nvec3 V = ${V_FROM_NV};\n` +
      "mat4 m = mat4(1.0); m[0][0]=1.5; m[1][1]=1.5; m[2][2]=1.5;\n" +
      "o = vec4( getVolumeTransmissionRay( N, V, u_x1, u_x2, m ), 1.0 );",
    argorder: ["dotNV", "thickness", "ior"]
  }
];
