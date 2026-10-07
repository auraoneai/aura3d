#!/usr/bin/env python3
"""
generate-r185-golden.py — produce tests/qr/prd04/fixtures/bsdf/r185-golden.json
by evaluating the REAL three.js r185 GLSL (extracted verbatim from
node_modules/three) on a 16x16x8 parameter grid via a headless llvmpipe
fragment shader (glsl_eval.py).

Regenerate after a three bump, or whenever the lane suspects oracle drift:
    python3 tests/qr/prd04/oracles/generate-r185-golden.py

The browser sibling generate-r185-golden.spec.ts performs the same job on
ANGLE Metal in CI for cross-driver parity audits (PRD-04 §14 P1-3).
"""

import glob
import json
import math
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from glsl_eval import (  # noqa: E402
    _Ctx,
    compile_shader,
    eval_grid,
    extract_glsl_decl,
    extract_glsl_function,
    extract_mat3_const,
    upload_rg16f_texture,
    GL,
)

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
THREE_GLOB = os.path.join(REPO, "node_modules", ".pnpm", "three@0.185.1", "node_modules", "three", "src", "renderers", "shaders", "**", "*.glsl.js")
OUT = os.path.join(REPO, "tests", "qr", "prd04", "fixtures", "bsdf", "r185-golden.json")

CHUNK_DIR_GLOB = os.path.join(REPO, "node_modules", ".pnpm", "three@0.185.1", "node_modules", "three", "src", "renderers", "shaders")


def load_three_module(name):
    hits = glob.glob(os.path.join(CHUNK_DIR_GLOB, "**", name), recursive=True)
    if not hits:
        raise FileNotFoundError(name)
    src = open(hits[0]).read()
    m = re.search(r"`(.*)`\s*;?\s*$", src, re.S)
    return (m.group(1) if m else src), hits[0]


def linspace(lo, hi, n):
    if n == 1:
        return [lo]
    return [lo + (hi - lo) * i / (n - 1) for i in range(n)]


PREAMBLE = """#version 300 es
precision highp float;
precision highp int;
"""

HELPERS_COMMON = """
#define PI 3.141592653589793
#define RECIPROCAL_PI 0.3183098861837907
#define EPSILON 1e-6
#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
"""


def tex_decls(dfg=False, transmission=False):
    s = ""
    if dfg:
        s += "uniform sampler2D u_dfgLut;\nvec2 a3dDFG( const in float roughness, const in float dotNX ) {\n\treturn texture( u_dfgLut, vec2( roughness, dotNX ) ).rg;\n}\n"
    if transmission:
        s += "uniform sampler2D a3d_prd04_transmissionSampler;\nuniform vec2 a3d_prd04_transmissionSamplerSize;\nuniform mat4 a3d_prd04_modelMatrix;\nuniform mat4 a3d_prd04_projectionMatrix;\nuniform mat4 a3d_prd04_viewMatrix;\n"
    return s


def build_cases():
    """Case list. `expr` is a GLSL body evaluated in main writing `o` (vec4).
    `args` are decoded per pixel from `axes` (dict name -> [lo,hi,n] or list).
    `fixed` are constant args. `out` = component count."""
    def grid(axes):
        total = 1
        for spec in axes.values():
            total *= spec[2] if isinstance(spec, tuple) else len(spec)
        return total

    cases = [
        {
            "fn": "dCharlie",
            "desc": "r185 D_Charlie (sheen NDF)",
            "needs": {"common": ["pow2(float)", "saturate"], "phys": ["D_Charlie"]},
            "axes": {"roughness": (0.05, 1.0, 16), "dotNH": (0.0, 1.0, 16)},
            "fixed": {},
            "out": 1,
            "call": "o = vec4( D_Charlie( u_x0, u_x1 ), 0.0, 0.0, 1.0 );",
            "argorder": ["roughness", "dotNH"],
        },
        {
            "fn": "vNeubelt",
            "desc": "r185 V_Neubelt (sheen visibility)",
            "needs": {"common": ["saturate"], "phys": ["V_Neubelt"]},
            "axes": {"dotNV": (0.0, 1.0, 16), "dotNL": (0.0, 1.0, 16)},
            "fixed": {},
            "out": 1,
            "call": "o = vec4( V_Neubelt( u_x0, u_x1 ), 0.0, 0.0, 1.0 );",
            "argorder": ["dotNV", "dotNL"],
        },
        {
            "fn": "iblSheenBRDF",
            "desc": "r185 IBLSheenBRDF(n,v,r) with N=(0,0,1), V reconstructed from dotNV",
            "needs": {"common": ["saturate", "pow2"], "phys": ["IBLSheenBRDF"]},
            "axes": {"dotNV": (0.0, 1.0, 16), "roughness": (0.0001, 1.0, 16)},
            "fixed": {},
            "out": 1,
            "call": "o = vec4( IBLSheenBRDF( vec3(0.0,0.0,1.0), vec3(0.0, sqrt(max(0.0,1.0-u_x0*u_x0)), u_x0), u_x1 ), 0.0, 0.0, 1.0 );",
            "argorder": ["dotNV", "roughness"],
        },
        {
            "fn": "dGGXAnisotropic",
            "desc": "r185 D_GGX_Anisotropic(alphaT,alphaB,dotNH,dotTH,dotBH); alphaT=0.49 alphaB=0.09 fixed",
            "needs": {"common": ["saturate", "pow2"], "phys": ["D_GGX_Anisotropic"]},
            "defines": ["USE_ANISOTROPY"],
            "axes": {"dotNH": (0.0, 1.0, 16), "dotTH": (-1.0, 1.0, 16), "dotBH": (-1.0, 1.0, 8)},
            "fixed": {"alphaT": 0.49, "alphaB": 0.09},
            "out": 1,
            "call": "o = vec4( D_GGX_Anisotropic( u_f_alphaT, u_f_alphaB, u_x0, u_x1, u_x2 ), 0.0, 0.0, 1.0 );",
            "argorder": ["dotNH", "dotTH", "dotBH"],
        },
        {
            "fn": "vGGXAnisotropic",
            "desc": "r185 V_GGX_SmithCorrelated_Anisotropic; axes dotNV,dotNL,alphaT; alphaB=0.09, dotTV=0.3, dotBV=0.4, dotTL=0.55, dotBL=0.65 fixed",
            "needs": {"common": ["saturate"], "phys": ["V_GGX_SmithCorrelated_Anisotropic"]},
            "defines": ["USE_ANISOTROPY"],
            "axes": {"dotNV": (0.0, 1.0, 16), "dotNL": (0.0, 1.0, 16), "alphaT": (0.04, 1.0, 8)},
            "fixed": {"alphaB": 0.09, "dotTV": 0.3, "dotBV": 0.4, "dotTL": 0.55, "dotBL": 0.65},
            "out": 1,
            "call": "o = vec4( V_GGX_SmithCorrelated_Anisotropic( u_x2, u_f_alphaB, u_f_dotTV, u_f_dotBV, u_f_dotTL, u_f_dotBL, u_x0, u_x1 ), 0.0, 0.0, 1.0 );",
            "argorder": ["dotNV", "dotNL", "alphaT"],
        },
        {
            "fn": "evalIridescence",
            "desc": "r185 evalIridescence(1.0, eta2, cosTheta1, thickness, baseF0); baseF0=(0.04,0.2,0.5) fixed",
            "needs": {
                "common": ["saturate", "pow2", "F_Schlick(float)", "F_Schlick(vec3)"],
                "irid": ["evalSensitivity", "evalIridescence"],
            },
            "mat3": "XYZ_TO_REC709",
            "extra_decls": [
                "vec3 Fresnel0ToIor( vec3 fresnel0 ) { vec3 sqrtF0 = sqrt( fresnel0 ); return ( vec3( 1.0 ) + sqrtF0 ) / ( vec3( 1.0 ) - sqrtF0 ); }",
                "vec3 IorToFresnel0( vec3 transmittedIor, float incidentIor ) { return pow2( ( transmittedIor - vec3( incidentIor ) ) / ( transmittedIor + vec3( incidentIor ) ) ); }",
                "float IorToFresnel0( float transmittedIor, float incidentIor ) { return pow2( ( transmittedIor - incidentIor ) / ( transmittedIor + incidentIor ) ); }",
            ],
            "defines": ["USE_IRIDESCENCE"],
            "axes": {"cosTheta1": (0.001, 1.0, 16), "thickness": (0.0, 1200.0, 16), "eta2": (1.0, 2.4, 8)},
            "fixed": {"outsideIOR": 1.0, "baseF0": [0.04, 0.2, 0.5]},
            "out": 3,
            "call": "o = vec4( evalIridescence( u_f_outsideIOR, u_x2, u_x0, u_x1, u_f_baseF0 ), 1.0 );",
            "argorder": ["cosTheta1", "thickness", "eta2"],
        },
        {
            "fn": "computeSpecularOcclusion",
            "desc": "r185 computeSpecularOcclusion(dotNV, ao, roughness)",
            "needs": {"common": ["saturate", "pow2"], "phys": ["computeSpecularOcclusion"]},
            "axes": {"dotNV": (0.0, 1.0, 16), "ao": (0.0, 1.0, 16), "roughness": (0.0, 1.0, 8)},
            "fixed": {},
            "out": 1,
            "call": "o = vec4( computeSpecularOcclusion( u_x0, u_x1, u_x2 ), 0.0, 0.0, 1.0 );",
            "argorder": ["dotNV", "ao", "roughness"],
        },
        {
            "fn": "applyIorToRoughness",
            "desc": "r185 applyIorToRoughness(roughness, ior)",
            "needs": {"transmission": ["applyIorToRoughness"], "common": ["saturate"]},
            "defines": ["USE_TRANSMISSION"],
            "axes": {"roughness": (0.0, 1.0, 16), "ior": (1.0, 2.4, 8)},
            "fixed": {},
            "out": 1,
            "call": "o = vec4( applyIorToRoughness( u_x0, u_x1 ), 0.0, 0.0, 1.0 );",
            "argorder": ["roughness", "ior"],
        },
        {
            "fn": "volumeAttenuation",
            "desc": "r185 volumeAttenuation(distance, color, attenuationDistance); color=(0.85,0.62,0.35) fixed",
            "needs": {"transmission": ["volumeAttenuation"], "common": ["saturate"]},
            "defines": ["USE_TRANSMISSION"],
            "axes": {"transmissionDistance": (0.0, 4.0, 16), "attenuationDistance": (0.1, 10.0, 8)},
            "fixed": {"attenuationColor": [0.85, 0.62, 0.35]},
            "out": 3,
            "call": "o = vec4( volumeAttenuation( u_x0, u_f_attenuationColor, u_x1 ), 1.0 );",
            "argorder": ["transmissionDistance", "attenuationDistance"],
        },
        {
            "fn": "iorToF0",
            "desc": "r185 IorToFresnel0(ior,1.0) — the [09] IOR-F0 rule",
            "needs": {"common": ["pow2"], "irid": []},
            "extra_decls": [
                "float IorToFresnel0( float transmittedIor, float incidentIor ) { return pow2( ( transmittedIor - incidentIor ) / ( transmittedIor + incidentIor ) ); }",
            ],
            "axes": {"ior": (1.0, 2.4, 16)},
            "fixed": {"incidentIOR": 1.0},
            "out": 1,
            "call": "o = vec4( IorToFresnel0( u_x0, 1.0 ), 0.0, 0.0, 1.0 );",
            "argorder": ["ior"],
        },
        {
            "fn": "specIorSpecularColor",
            "desc": "r185 specularColor = min(pow2((ior-1)/(ior+1))*specColorFactor,1)*specIntensity (lights_physical_fragment.glsl.js:45)",
            "needs": {"common": ["pow2", "saturate"]},
            "axes": {"ior": (1.0, 2.4, 16), "specularIntensity": (0.0, 1.0, 8)},
            "fixed": {"specularColorFactor": [0.9, 0.8, 0.7]},
            "out": 3,
            "call": "o = vec4( min( pow2( ( u_x0 - 1.0 ) / ( u_x0 + 1.0 ) ) * u_f_specularColorFactor, vec3( 1.0 ) ) * u_x1, 1.0 );",
            "argorder": ["ior", "specularIntensity"],
        },
        {
            "fn": "specIorSpecularF90",
            "desc": "r185 specularF90 = mix( specularIntensity, 1.0, metalness ) (:35)",
            "needs": {"common": []},
            "axes": {"specularIntensity": (0.0, 1.0, 16), "metalness": (0.0, 1.0, 8)},
            "fixed": {},
            "out": 1,
            "call": "o = vec4( mix( u_x0, 1.0, u_x1 ), 0.0, 0.0, 1.0 );",
            "argorder": ["specularIntensity", "metalness"],
        },
        {
            "fn": "clearcoatFccCompose",
            "desc": "r185 meshphysical.glsl.js:205-212: out*(1-cc*Fcc)+(ccD+ccI)*cc; Fcc=F_Schlick(0.04,1,dotNVcc)",
            "needs": {"common": ["F_Schlick(vec3)", "saturate", "pow2"]},
            "axes": {"clearcoat": (0.0, 1.0, 16), "dotNVcc": (0.0, 1.0, 16), "scale": (0.0, 1.0, 8)},
            "fixed": {},
            "out": 3,
            "call": (
                "vec3 outgoing = vec3(0.5,0.4,0.3) * u_x2 + vec3(0.1);\n"
                "vec3 ccD = vec3(0.8,0.2,0.1) * (0.5 + 0.5 * u_x2);\n"
                "vec3 ccI = vec3(0.1,0.3,0.6) * (1.0 - 0.5 * u_x2);\n"
                "vec3 Fcc = F_Schlick( vec3(0.04), 1.0, u_x1 );\n"
                "o = vec4( outgoing * ( 1.0 - u_x0 * Fcc ) + ( ccD + ccI ) * u_x0, 1.0 );"
            ),
            "argorder": ["clearcoat", "dotNVcc", "scale"],
        },
        {
            "fn": "environmentBRDF",
            "desc": "r185 EnvironmentBRDF(n,v,f0,f90,r) over the r185 DFG LUT; f90=1 fixed, f0 cycles",
            "needs": {"common": ["saturate", "pow2"], "phys": ["EnvironmentBRDF"]},
            "textures": ["dfg"],
            "axes": {"dotNV": (0.0, 1.0, 16), "roughness": (0.0, 1.0, 16), "f0idx": (0.0, 3.9999, 4)},
            "fixed": {"f90": 1.0},
            "out": 3,
            "call": (
                "vec3 f0s[4] = vec3[4](vec3(0.04), vec3(0.5,0.4,0.3), vec3(0.9), vec3(0.2,0.6,0.9));\n"
                "vec3 f0 = f0s[int(u_x2)];\n"
                "o = vec4( EnvironmentBRDF( vec3(0,0,1), vec3(0.0, sqrt(max(0.0,1.0-u_x0*u_x0)), u_x0), f0, 1.0, u_x1 ), 1.0 );"
            ),
            "argorder": ["dotNV", "roughness", "f0idx"],
        },
        {
            "fn": "multiscatteringSingle",
            "desc": "r185 computeMultiscattering singleScatter out (env IBL, DFG LUT)",
            "needs": {"common": ["saturate", "pow2"], "phys": ["computeMultiscattering"]},
            "textures": ["dfg"],
            "axes": {"dotNV": (0.0, 1.0, 16), "roughness": (0.0, 1.0, 16), "f0idx": (0.0, 3.9999, 4)},
            "fixed": {"specularF90": 1.0},
            "out": 3,
            "call": (
                "vec3 f0s[4] = vec3[4](vec3(0.04), vec3(0.5,0.4,0.3), vec3(0.9), vec3(0.2,0.6,0.9));\n"
                "vec3 f0 = f0s[int(u_x2)];\n"
                "vec3 single = vec3(0.0); vec3 multi = vec3(0.0);\n"
                "computeMultiscattering( vec3(0,0,1), vec3(0.0, sqrt(max(0.0,1.0-u_x0*u_x0)), u_x0), f0, 1.0, u_x1, single, multi );\n"
                "o = vec4( single, 1.0 );"
            ),
            "argorder": ["dotNV", "roughness", "f0idx"],
        },
        {
            "fn": "multiscatteringMulti",
            "desc": "r185 computeMultiscattering multiScatter out",
            "needs": {"common": ["saturate", "pow2"], "phys": ["computeMultiscattering"]},
            "textures": ["dfg"],
            "axes": {"dotNV": (0.0, 1.0, 16), "roughness": (0.0, 1.0, 16), "f0idx": (0.0, 3.9999, 4)},
            "fixed": {"specularF90": 1.0},
            "out": 3,
            "call": (
                "vec3 f0s[4] = vec3[4](vec3(0.04), vec3(0.5,0.4,0.3), vec3(0.9), vec3(0.2,0.6,0.9));\n"
                "vec3 f0 = f0s[int(u_x2)];\n"
                "vec3 single = vec3(0.0); vec3 multi = vec3(0.0);\n"
                "computeMultiscattering( vec3(0,0,1), vec3(0.0, sqrt(max(0.0,1.0-u_x0*u_x0)), u_x0), f0, 1.0, u_x1, single, multi );\n"
                "o = vec4( multi, 1.0 );"
            ),
            "argorder": ["dotNV", "roughness", "f0idx"],
        },
        {
            "fn": "sheenDirect",
            "desc": "r185 BRDF_Sheen(L,V,N,sheenColor,r); N=(0,0,1), V/L reconstructed, sheenColor=(0.4,0.6,0.9)",
            "needs": {"common": ["saturate", "pow2"], "phys": ["D_Charlie", "V_Neubelt", "BRDF_Sheen"]},
            "axes": {"dotNV": (0.0, 1.0, 16), "dotNL": (0.0, 1.0, 16), "roughness": (0.0, 1.0, 8)},
            "fixed": {"sheenColor": [0.4, 0.6, 0.9]},
            "out": 3,
            "call": (
                "vec3 N = vec3(0.0,0.0,1.0);\n"
                "vec3 V = vec3(0.0, sqrt(max(0.0,1.0-u_x0*u_x0)), u_x0);\n"
                "vec3 L = vec3(0.0, sqrt(max(0.0,1.0-u_x1*u_x1)), u_x1);\n"
                "o = vec4( BRDF_Sheen( L, V, N, u_f_sheenColor, u_x2 ), 1.0 );"
            ),
            "argorder": ["dotNV", "dotNL", "roughness"],
        },
        {
            "fn": "brdfGGXMultiscatter",
            "desc": "r185 BRDF_GGX_Multiscatter(L,V,N,material); N=(0,0,1), V/L reconstructed; specularColorBlended cycles palette, specularF90=1",
            "needs": {
                "common": ["saturate", "pow2", "F_Schlick(vec3)", "F_Schlick(float)"],
                "phys": ["V_GGX_SmithCorrelated", "D_GGX", "BRDF_GGX", "BRDF_GGX_Multiscatter"],
            },
            "struct": "PhysicalMaterial",
            "textures": ["dfg"],
            "axes": {"dotNV": (0.0, 1.0, 16), "dotNL": (0.0, 1.0, 16), "roughness": (0.05, 1.0, 4), "f0idx": (0.0, 3.9999, 4)},
            "fixed": {"specularF90": 1.0},
            "out": 3,
            "call": (
                "vec3 N = vec3(0.0,0.0,1.0);\n"
                "vec3 V = vec3(0.0, sqrt(max(0.0,1.0-u_x0*u_x0)), u_x0);\n"
                "vec3 L = vec3(0.0, sqrt(max(0.0,1.0-u_x1*u_x1)), u_x1);\n"
                "vec3 f0s[4] = vec3[4](vec3(0.04), vec3(0.5,0.4,0.3), vec3(0.9), vec3(0.2,0.6,0.9));\n"
                "PhysicalMaterial material;\n"
                "material.specularColorBlended = f0s[ int(u_x3) ];\n"
                "material.specularF90 = 1.0;\n"
                "material.roughness = u_x2;\n"
                "o = vec4( BRDF_GGX_Multiscatter( L, V, N, material ), 1.0 );"
            ),
            "argorder": ["dotNV", "dotNL", "roughness", "f0idx"],
        },
        {
            "fn": "anisotropyAlphaT",
            "desc": "r185 alphaT = mix( pow2(roughness), 1.0, pow2(anisotropy) ) (lights_physical_fragment:155)",
            "needs": {"common": ["pow2", "saturate"]},
            "axes": {"roughness": (0.0, 1.0, 16), "anisotropy": (0.0, 1.0, 16)},
            "fixed": {},
            "out": 1,
            "call": "o = vec4( mix( pow2(u_x0), 1.0, pow2(u_x1) ), 0.0, 0.0, 1.0 );",
            "argorder": ["roughness", "anisotropy"],
        },
        {
            "fn": "volumeTransmissionRay",
            "desc": "r185 getVolumeTransmissionRay(n,v,thickness,ior,modelMatrix); N=(0,0,1) V from dotNV, identity model",
            "needs": {"transmission": ["getVolumeTransmissionRay"], "common": ["saturate"]},
            "defines": ["USE_TRANSMISSION"],
            "axes": {"dotNV": (0.0, 1.0, 16), "thickness": (0.0, 3.0, 16), "ior": (1.0, 2.4, 8)},
            "fixed": {},
            "out": 3,
            "call": (
                "vec3 N = vec3(0.0,0.0,1.0);\n"
                "vec3 V = vec3(0.0, sqrt(max(0.0,1.0-u_x0*u_x0)), u_x0);\n"
                "mat4 m = mat4(1.0); m[0][0]=1.5; m[1][1]=1.5; m[2][2]=1.5;\n"
                "o = vec4( getVolumeTransmissionRay( N, V, u_x1, u_x2, m ), 1.0 );"
            ),
            "argorder": ["dotNV", "thickness", "ior"],
        },
    ]
    return cases


def axis_values(spec):
    if isinstance(spec, tuple):
        return linspace(spec[0], spec[1], spec[2])
    return list(spec)


def make_shader(case, n):
    """Emit the fragment source for a case of `n` samples laid out over a
    width x height texture (width = n, height = 1)."""
    axes = case["axes"]
    argorder = case["argorder"]
    decoded = []
    stride = 1
    for i, name in enumerate(argorder):
        spec = axes[name]
        vals = axis_values(spec)
        cnt = len(vals)
        lo, hi = vals[0], vals[-1]
        decoded.append(
            f"int a{i} = (idx / {stride}) % {cnt};\n"
            f"float u_x{i} = mix( {lo!r}, {hi!r}, float(a{i}) / {max(cnt-1,1)}.0 );".replace("float(a{i})", f"float(a{i})")
        )
        stride *= cnt
    fixed_decls = []
    for name, v in case.get("fixed", {}).items():
        if isinstance(v, (list, tuple)):
            t = {2: "vec2", 3: "vec3", 4: "vec4"}[len(v)]
            fixed_decls.append(f"{t} u_f_{name} = {t}( " + ", ".join(repr(x) for x in v) + " );")
        else:
            fixed_decls.append(f"float u_f_{name} = {v!r};")
    defines = "".join(f"#define {d}\n" for d in case.get("defines", []))
    call = case["call"]
    body = "void main() {\n"
    body += "int idx = int(gl_FragCoord.x);\n"
    body += "\n".join(decoded) + "\n"
    body += "\n".join(fixed_decls) + "\n"
    body += call + "\n}\n"
    return defines, body


def main():
    common_src, _ = load_three_module("common.glsl.js")
    phys_src, phys_path = load_three_module("lights_physical_pars_fragment.glsl.js")
    irid_src, _ = load_three_module("iridescence_fragment.glsl.js")
    trans_src, trans_path = load_three_module("transmission_pars_fragment.glsl.js")
    dfg_src, dfg_path = load_three_module("../DFGLUTData.js")

    # extract helpers from common.glsl.js (verbatim r185 sources)
    helpers_head = PREAMBLE + HELPERS_COMMON
    helpers_fns = ""
    needed_common = [
        ("float", "pow2"), ("vec3", "pow2"), ("float", "pow3"), ("float", "pow4"),
        ("float", "max3"), ("vec3", "F_Schlick"), ("float", "F_Schlick"),
        ("vec3", "BRDF_Lambert"),
    ]
    for ret, nm in needed_common:
        pat = re.compile(rf"^[\t ]*{ret}[\t ]+{nm}[\t ]*\(", re.M)
        m = pat.search(common_src)
        assert m, f"{ret} {nm} not found in common.glsl.js"
        helpers_fns += extract_glsl_function(common_src[m.start():], nm) + "\n\n"

    phys_needed = [
        "Schlick_to_F0",
        "V_GGX_SmithCorrelated", "D_GGX", "V_GGX_SmithCorrelated_Anisotropic",
        "D_GGX_Anisotropic", "BRDF_GGX_Clearcoat", "BRDF_GGX", "D_Charlie",
        "V_Neubelt", "BRDF_Sheen", "IBLSheenBRDF", "EnvironmentBRDF",
        "computeMultiscattering", "computeSpecularOcclusion",
        "BRDF_GGX_Multiscatter",
    ]
    phys_fns = {}
    for nm in phys_needed:
        try:
            phys_fns[nm] = extract_glsl_function(phys_src, nm)
        except KeyError:
            # structured bodies inside #ifdefs may be indented differently
            phys_fns[nm] = extract_glsl_function(phys_src.replace("\t", "    "), nm)

    struct_mat = re.search(r"struct PhysicalMaterial \{.*?^\};", phys_src, re.S | re.M).group(0)
    # strip the #ifdef lines around struct fields (keep all fields unconditional)
    struct_mat = re.sub(r"#ifn?def[^\n]*\n|#endif[^\n]*\n", "", struct_mat)

    trans_fns = {
        nm: extract_glsl_function(trans_src, nm)
        for nm in ["getVolumeTransmissionRay", "applyIorToRoughness", "volumeAttenuation"]
    }
    irid_fns = {
        nm: extract_glsl_function(irid_src, nm)
        for nm in ["evalSensitivity", "evalIridescence"]
    }
    xyz = extract_mat3_const(irid_src, "XYZ_TO_REC709")

    # DFG LUT data
    dfg_data = re.search(r"const DATA = new Uint16Array\(\s*\[(.*?)\]\s*\)", dfg_src, re.S).group(1)
    dfg_vals = [int(x.strip(), 16) for x in dfg_data.split(",") if x.strip()]
    assert len(dfg_vals) == 512, len(dfg_vals)

    # golden driver
    ctx = _Ctx.get()
    print("renderer:", ctx.renderer)

    result_cases = []
    for case in build_cases():
        n = 1
        for spec in case["axes"].values():
            n *= spec[2] if isinstance(spec, tuple) else len(spec)
        assert n <= 4096, (case["fn"], n)

        defines, body = make_shader(case, n)
        fns = []
        # needed common helpers come from `helpers` preamble already assembled;
        # append per-case needs:
        for group in case.get("needs", {}).values():
            pass  # handled below via needs_phys etc.
        src_parts = [helpers_head, defines, helpers_fns]
        if case.get("struct") == "PhysicalMaterial":
            src_parts.append(struct_mat)
        if "dfg" in case.get("textures", []):
            src_parts.append("uniform sampler2D dfgLUT;\n")
        if case.get("mat3"):
            src_parts.append(xyz)
        for d in case.get("extra_decls", []):
            src_parts.append(d)
        for nm in case.get("needs", {}).get("phys", []):
            src_parts.append(phys_fns[nm])
        for nm in case.get("needs", {}).get("transmission", []):
            src_parts.append(trans_fns[nm])
        for nm in case.get("needs", {}).get("irid", []):
            src_parts.append(irid_fns[nm])
        frag = "\n".join(src_parts) + "\nlayout(location=0) out vec4 o;\n" + body

        uniforms = {}
        if "dfg" in case.get("textures", []):
            upload_rg16f_texture(0, dfg_vals, 16, 16)
            uniforms["dfgLUT"] = 0

        # width = n pixels, height = 1
        vals = eval_grid(frag, n, 1, uniforms=uniforms)

        comps = case["out"]
        flat = []
        for i in range(n):
            flat.extend(vals[i * 4 : i * 4 + comps])

        result_cases.append({
            "fn": case["fn"],
            "desc": case["desc"],
            "out": comps,
            "argorder": case["argorder"],
            "axes": {k: axis_values(v) for k, v in case["axes"].items()},
            "fixed": case.get("fixed", {}),
            "values": flat,
        })
        print(f"{case['fn']}: {n} samples ok")

    golden = {
        "meta": {
            "threeVersion": "0.185.1",
            "generatedBy": "tests/qr/prd04/oracles/generate-r185-golden.py",
            "renderer": ctx.renderer,
            "sources": {
                "lights_physical_pars_fragment.glsl.js": phys_path,
                "transmission_pars_fragment.glsl.js": trans_path,
                "iridescence_fragment.glsl.js": os.path.join(CHUNK_DIR_GLOB, "ShaderChunk/iridescence_fragment.glsl.js"),
                "common.glsl.js": os.path.join(CHUNK_DIR_GLOB, "ShaderChunk/common.glsl.js"),
                "DFGLUTData.js": dfg_path,
            },
        },
        "cases": result_cases,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    # JSON cannot encode NaN/Inf: emit null; the oracle test treats null as
    # "non-finite expected" and asserts the JS oracle is non-finite there too.
    def clean(v):
        if isinstance(v, float) and not math.isfinite(v):
            return None
        if isinstance(v, list):
            return [clean(x) for x in v]
        if isinstance(v, dict):
            return {k: clean(x) for k, x in v.items()}
        return v
    with open(OUT, "w") as f:
        json.dump(clean(golden), f, indent=1, allow_nan=False)
    print("wrote", OUT)


if __name__ == "__main__":
    main()
