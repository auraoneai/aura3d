#!/usr/bin/env python3
"""
glsl_eval.py — headless GLSL ES 3.00 evaluator over Mesa llvmpipe
(PR surfaceless EGL, no X required).

Used by Lane 04's oracle tooling to evaluate *real* three.js r185 GLSL
(extracted verbatim from node_modules) on a grid, producing
r185-golden.json. This is not a visual capture: it evaluates isolated
numeric BRDF functions into a 1-component/4-component float buffer.

Also exposes `compile_check()` used to verify that every a3d_prd04_* chunk
compiles under the ChunkHarness composition without a browser.
"""

import ctypes
import json
import re
import struct
import sys

EGL = ctypes.CDLL("libEGL.so.1")
GL = ctypes.CDLL("libGLESv2.so.2")

EGL.eglGetProcAddress.restype = ctypes.c_void_p
EGL.eglGetProcAddress.argtypes = [ctypes.c_char_p]


def _proc(name, restype, *args):
    addr = EGL.eglGetProcAddress(name.encode())
    if not addr:
        raise RuntimeError(f"missing EGL/GL proc {name}")
    return ctypes.CFUNCTYPE(restype, *args)(addr)


EGL_PLATFORM_SURFACELESS_MESA = 0x31DD
EGL_OPENGL_ES_API = 0x30A0
EGL_CONTEXT_CLIENT_VERSION = 0x3098
EGL_NONE = 0x3038
GL_FALSE = 0
GL_TRUE = 1
GL_COMPILE_STATUS = 0x8B81
GL_LINK_STATUS = 0x8B82
GL_INFO_LOG_LENGTH = 0x8B84
GL_VERTEX_SHADER = 0x8B31
GL_FRAGMENT_SHADER = 0x8B30
GL_RGBA32F = 0x8814
GL_RGBA = 0x1908
GL_FLOAT = 0x1406
GL_FRAMEBUFFER = 0x8D40
GL_COLOR_ATTACHMENT0 = 0x8CE0
GL_TEXTURE_2D = 0x0DE1
GL_TEXTURE_MIN_FILTER = 0x2801
GL_TEXTURE_MAG_FILTER = 0x2800
GL_TEXTURE_WRAP_S = 0x2802
GL_TEXTURE_WRAP_T = 0x2803
GL_NEAREST = 0x2600
GL_LINEAR = 0x2601
GL_CLAMP_TO_EDGE = 0x812F
GL_FRAMEBUFFER_COMPLETE = 0x8CD5
GL_TRIANGLES = 0x0004
GL_ARRAY_BUFFER = 0x8892
GL_STATIC_DRAW = 0x88E4
GL_VERTEX_ATTRIB_ARRAY_BUFFER_BINDING = 0x889F
GL_TEXTURE0 = 0x84C0
GL_RGB16F = 0x881B
GL_RG16F = 0x822F
GL_RG = 0x8227
GL_HALF_FLOAT = 0x140B
GL_COLOR_BUFFER_BIT = 0x4000
GL_DEPTH_BUFFER_BIT = 0x0100
GL_EXTENSIONS = 0x1F03
GL_RENDERER = 0x1F01
GL_VIEWPORT = 0x0BA2


def _bind_gl():
    for n, restype, args in [
        ("glGetString", ctypes.c_char_p, (ctypes.c_int,)),
        ("glGetError", ctypes.c_uint, ()),
        ("glCreateShader", ctypes.c_uint, (ctypes.c_int,)),
        ("glDeleteShader", None, (ctypes.c_uint,)),
        ("glShaderSource", None, (ctypes.c_uint, ctypes.c_int, ctypes.POINTER(ctypes.c_char_p), ctypes.POINTER(ctypes.c_int))),
        ("glCompileShader", None, (ctypes.c_uint,)),
        ("glGetShaderiv", None, (ctypes.c_uint, ctypes.c_int, ctypes.POINTER(ctypes.c_int))),
        ("glGetShaderInfoLog", None, (ctypes.c_uint, ctypes.c_int, ctypes.POINTER(ctypes.c_int), ctypes.c_char_p)),
        ("glCreateProgram", ctypes.c_uint, ()),
        ("glDeleteProgram", None, (ctypes.c_uint,)),
        ("glAttachShader", None, (ctypes.c_uint, ctypes.c_uint)),
        ("glLinkProgram", None, (ctypes.c_uint,)),
        ("glGetProgramiv", None, (ctypes.c_uint, ctypes.c_int, ctypes.POINTER(ctypes.c_int))),
        ("glGetProgramInfoLog", None, (ctypes.c_uint, ctypes.c_int, ctypes.POINTER(ctypes.c_int), ctypes.c_char_p)),
        ("glUseProgram", None, (ctypes.c_uint,)),
        ("glGenVertexArrays", None, (ctypes.c_int, ctypes.POINTER(ctypes.c_uint))),
        ("glBindVertexArray", None, (ctypes.c_uint,)),
        ("glGenBuffers", None, (ctypes.c_int, ctypes.POINTER(ctypes.c_uint))),
        ("glBindBuffer", None, (ctypes.c_int, ctypes.c_uint)),
        ("glBufferData", None, (ctypes.c_int, ctypes.c_ssize_t, ctypes.c_void_p, ctypes.c_int)),
        ("glEnableVertexAttribArray", None, (ctypes.c_uint,)),
        ("glVertexAttribPointer", None, (ctypes.c_uint, ctypes.c_int, ctypes.c_int, ctypes.c_ubyte, ctypes.c_int, ctypes.c_void_p)),
        ("glGenFramebuffers", None, (ctypes.c_int, ctypes.POINTER(ctypes.c_uint))),
        ("glBindFramebuffer", None, (ctypes.c_int, ctypes.c_uint)),
        ("glGenTextures", None, (ctypes.c_int, ctypes.POINTER(ctypes.c_uint))),
        ("glBindTexture", None, (ctypes.c_int, ctypes.c_uint)),
        ("glActiveTexture", None, (ctypes.c_int,)),
        ("glTexParameteri", None, (ctypes.c_int, ctypes.c_int, ctypes.c_int)),
        ("glTexImage2D", None, (ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_void_p)),
        ("glFramebufferTexture2D", None, (ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_uint, ctypes.c_int)),
        ("glCheckFramebufferStatus", ctypes.c_int, (ctypes.c_int,)),
        ("glViewport", None, (ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int)),
        ("glDrawArrays", None, (ctypes.c_int, ctypes.c_int, ctypes.c_int)),
        ("glReadPixels", None, (ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_void_p)),
        ("glGetUniformLocation", ctypes.c_int, (ctypes.c_uint, ctypes.c_char_p)),
        ("glUniform1i", None, (ctypes.c_int, ctypes.c_int)),
        ("glUniform1f", None, (ctypes.c_int, ctypes.c_float)),
        ("glUniform2f", None, (ctypes.c_int, ctypes.c_float, ctypes.c_float)),
        ("glUniform3f", None, (ctypes.c_int, ctypes.c_float, ctypes.c_float, ctypes.c_float)),
        ("glUniform4f", None, (ctypes.c_int, ctypes.c_float, ctypes.c_float, ctypes.c_float, ctypes.c_float)),
        ("glUniform1iv", None, (ctypes.c_int, ctypes.c_int, ctypes.POINTER(ctypes.c_int))),
        ("glUniform1fv", None, (ctypes.c_int, ctypes.c_int, ctypes.POINTER(ctypes.c_float))),
        ("glUniform2iv", None, (ctypes.c_int, ctypes.c_int, ctypes.POINTER(ctypes.c_int))),
        ("glUniformMatrix4fv", None, (ctypes.c_int, ctypes.c_int, ctypes.c_ubyte, ctypes.POINTER(ctypes.c_float))),
        ("glUniformMatrix3fv", None, (ctypes.c_int, ctypes.c_int, ctypes.c_ubyte, ctypes.POINTER(ctypes.c_float))),
        ("glPixelStorei", None, (ctypes.c_int, ctypes.c_int)),
    ]:
        try:
            setattr(GL, n, _proc(n, restype, *args))
        except RuntimeError:
            # core GL functions are exported directly
            f = getattr(GL, n, None)
            if f is None:
                raise
            f.restype = restype
            f.argtypes = list(args)


_bind_gl()


class _Ctx:
    _instance = None

    def __init__(self):
        getplat = _proc("eglGetPlatformDisplayEXT", ctypes.c_void_p, ctypes.c_uint, ctypes.c_void_p, ctypes.c_void_p)
        self.dpy = getplat(EGL_PLATFORM_SURFACELESS_MESA, None, None)
        if not self.dpy:
            raise RuntimeError("eglGetPlatformDisplayEXT(SURFACELESS_MESA) failed")
        EGL.eglInitialize.restype = ctypes.c_int
        EGL.eglInitialize.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_int), ctypes.POINTER(ctypes.c_int)]
        if not EGL.eglInitialize(self.dpy, None, None):
            raise RuntimeError("eglInitialize failed")
        EGL.eglBindAPI.argtypes = [ctypes.c_uint]
        EGL.eglBindAPI(EGL_OPENGL_ES_API)
        EGL.eglCreateContext.restype = ctypes.c_void_p
        EGL.eglCreateContext.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p, ctypes.POINTER(ctypes.c_int)]
        attrs = (ctypes.c_int * 3)(EGL_CONTEXT_CLIENT_VERSION, 3, EGL_NONE)
        self.ctx = EGL.eglCreateContext(self.dpy, None, None, attrs)
        if not self.ctx:
            raise RuntimeError("eglCreateContext(ES3) failed")
        EGL.eglMakeCurrent.argtypes = [ctypes.c_void_p] * 4
        if not EGL.eglMakeCurrent(self.dpy, None, None, self.ctx):
            raise RuntimeError("eglMakeCurrent failed")
        ext = (GL.glGetString(GL_EXTENSIONS) or b"").decode()
        if "EXT_color_buffer_float" not in ext:
            raise RuntimeError("EXT_color_buffer_float unavailable")
        self.renderer = (GL.glGetString(GL_RENDERER) or b"").decode()
        vao = ctypes.c_uint()
        GL.glGenVertexArrays(1, ctypes.byref(vao))
        GL.glBindVertexArray(vao.value)
        self.vao = vao.value
        # fullscreen triangle
        vbo = ctypes.c_uint()
        GL.glGenBuffers(1, ctypes.byref(vbo))
        GL.glBindBuffer(GL_ARRAY_BUFFER, vbo.value)
        verts = (ctypes.c_float * 6)(-1, -1, 3, -1, -1, 3)
        GL.glBufferData(GL_ARRAY_BUFFER, 24, verts, GL_STATIC_DRAW)
        GL.glEnableVertexAttribArray(0)
        GL.glVertexAttribPointer(0, 2, GL_FLOAT, GL_FALSE, 0, None)

    @classmethod
    def get(cls):
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance


def _info_log(obj, is_program):
    n = ctypes.c_int()
    if is_program:
        GL.glGetProgramiv(obj, GL_INFO_LOG_LENGTH, ctypes.byref(n))
        buf = ctypes.create_string_buffer(max(n.value, 1))
        GL.glGetProgramInfoLog(obj, n.value, None, buf)
    else:
        GL.glGetShaderiv(obj, GL_INFO_LOG_LENGTH, ctypes.byref(n))
        buf = ctypes.create_string_buffer(max(n.value, 1))
        GL.glGetShaderInfoLog(obj, n.value, None, buf)
    return buf.value.decode(errors="replace")


def compile_shader(stage, src):
    sh = GL.glCreateShader(stage)
    arr = (ctypes.c_char_p * 1)(src.encode())
    GL.glShaderSource(sh, 1, arr, None)
    GL.glCompileShader(sh)
    ok = ctypes.c_int()
    GL.glGetShaderiv(sh, GL_COMPILE_STATUS, ctypes.byref(ok))
    log = _info_log(sh, False)
    if not ok.value:
        raise CompileError(f"shader compile failed:\n{log}\n--- source ---\n{src}")
    return sh


class CompileError(RuntimeError):
    pass


def build_program(fragment_src, vertex_src=None):
    _Ctx.get()  # ensure ctx + vao
    vs = vertex_src or (
        "#version 300 es\nlayout(location=0) in vec2 a_p;\n"
        "void main(){ gl_Position = vec4(a_p, 0.0, 1.0); }\n"
    )
    v = compile_shader(GL_VERTEX_SHADER, vs)
    f = compile_shader(GL_FRAGMENT_SHADER, fragment_src)
    prog = GL.glCreateProgram()
    GL.glAttachShader(prog, v)
    GL.glAttachShader(prog, f)
    GL.glLinkProgram(prog)
    ok = ctypes.c_int()
    GL.glGetProgramiv(prog, GL_LINK_STATUS, ctypes.byref(ok))
    if not ok.value:
        raise CompileError(f"link failed:\n{_info_log(prog, True)}")
    GL.glDeleteShader(v)
    GL.glDeleteShader(f)
    return prog


def compile_check(fragment_src, vertex_src=None):
    """Return (ok, log) for a fragment (and optional vertex) source."""
    try:
        prog = build_program(fragment_src, vertex_src)
        GL.glDeleteProgram(prog)
        return True, ""
    except CompileError as e:
        return False, str(e)


def eval_grid(fragment_src, width, height, uniforms=None):
    """Render `fragment_src` into a width*height RGBA32F FBO; return flat
    list of [r,g,b,a] floats. `uniforms` maps name -> int|float|list."""
    _Ctx.get()
    prog = build_program(fragment_src)
    GL.glUseProgram(prog)

    # Keep unit 0 free for caller-bound textures (e.g. the DFG LUT): the FBO
    # color target lives on unit 1 so a bound sampler is never clobbered.
    GL.glActiveTexture(GL_TEXTURE0 + 1)
    tex = ctypes.c_uint()
    GL.glGenTextures(1, ctypes.byref(tex))
    GL.glBindTexture(GL_TEXTURE_2D, tex.value)
    GL.glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA32F, width, height, 0, GL_RGBA, GL_FLOAT, None)
    GL.glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST)
    GL.glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST)
    GL.glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE)
    GL.glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE)

    fbo = ctypes.c_uint()
    GL.glGenFramebuffers(1, ctypes.byref(fbo))
    GL.glBindFramebuffer(GL_FRAMEBUFFER, fbo.value)
    GL.glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, tex.value, 0)
    st = GL.glCheckFramebufferStatus(GL_FRAMEBUFFER)
    if st != GL_FRAMEBUFFER_COMPLETE:
        raise RuntimeError(f"FBO incomplete: 0x{st:x}")

    for name, val in (uniforms or {}).items():
        loc = GL.glGetUniformLocation(prog, name.encode())
        if loc < 0:
            continue
        if isinstance(val, int):
            GL.glUniform1i(loc, val)
        elif isinstance(val, float):
            GL.glUniform1f(loc, val)
        elif isinstance(val, (list, tuple)):
            n = len(val)
            arr = (ctypes.c_float * n)(*val)
            if n == 2:
                GL.glUniform2f(loc, *val)
            elif n == 3:
                GL.glUniform3f(loc, *val)
            elif n == 4:
                GL.glUniform4f(loc, *val)
            else:
                GL.glUniform1fv(loc, n, arr)

    GL.glViewport(0, 0, width, height)
    GL.glDrawArrays(GL_TRIANGLES, 0, 3)

    out = (ctypes.c_float * (width * height * 4))()
    GL.glPixelStorei(0x0D05, 1)  # GL_PACK_ALIGNMENT
    GL.glReadPixels(0, 0, width, height, GL_RGBA, GL_FLOAT, out)
    GL.glBindFramebuffer(GL_FRAMEBUFFER, 0)
    GL.glDeleteProgram(prog)
    return list(out)


def upload_rg16f_texture(unit, data_u16, width, height):
    """Upload a half-float RG LUT (three's DFGLUTData) to texture `unit`."""
    arr = (ctypes.c_uint16 * len(data_u16))(*data_u16)
    GL.glActiveTexture(GL_TEXTURE0 + unit)
    tex = ctypes.c_uint()
    GL.glGenTextures(1, ctypes.byref(tex))
    GL.glBindTexture(GL_TEXTURE_2D, tex.value)
    GL.glTexImage2D(GL_TEXTURE_2D, 0, GL_RG16F, width, height, 0, GL_RG, GL_HALF_FLOAT, arr)
    GL.glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR)
    GL.glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR)
    GL.glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE)
    GL.glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE)
    return tex.value


def extract_glsl_function(file_src, name):
    """Extract a GLSL function definition `name` from a three .glsl.js module
    source string. Handles optional `highp`/qualifier prefixes on the return
    type and multi-line signatures. Returns the verbatim function text."""
    m = re.search(rf"^[\t ]*(?:highp[\t ]+)?[\w\d]+[\t ]+{name}[\t ]*\(", file_src, re.M)
    if not m:
        raise KeyError(f"{name} not found")
    start = m.start()
    brace = file_src.index("{", m.end())
    depth = 0
    i = brace
    while True:
        c = file_src[i]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                text = file_src[start:i + 1].strip()
                break
        i += 1
    # r185 two-signature pattern: `#ifdef X void f_a(...) {` / `#else` /
    # `void f_b(...) {` / `#endif` — extracting the #else arm leaves the
    # arm-closing `#endif` as the first line inside the braces. Drop it.
    lines = text.split("\n")
    if len(lines) > 1 and re.match(r"^\s*#endif", lines[1]):
        lines.pop(1)
    return "\n".join(lines)


def extract_glsl_decl(file_src, pattern):
    """Extract a single-line declaration/statement matching `pattern`
    (e.g. a const mat3 initializer spanning lines is NOT supported)."""
    m = re.search(pattern, file_src)
    if not m:
        raise KeyError(f"decl {pattern} not found")
    return m.group(0).strip()


def extract_mat3_const(file_src, name):
    """Extract a `const mat3 name = mat3( ... );` block (multi-line)."""
    m = re.search(rf"const[\t ]+mat3[\t ]+{name}[\t ]*=", file_src)
    if not m:
        raise KeyError(f"mat3 {name} not found")
    start = m.start()
    end = file_src.index(";", start)
    return file_src[start:end + 1].strip()


def main():
    # smoke test: compile + render a constant
    src = "#version 300 es\nprecision highp float;\nlayout(location=0) out vec4 o;\nvoid main(){o=vec4(0.25,0.5,0.75,1.0);}\n"
    vals = eval_grid(src, 2, 2)
    print("renderer:", _Ctx.get().renderer)
    print("pixels:", vals[:8])


if __name__ == "__main__":
    main()
