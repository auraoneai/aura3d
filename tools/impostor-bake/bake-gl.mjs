/**
 * PRD-10 T3.6 §9.6 — in-page WebGL2 bake harness (browser side).
 *
 * `BAKE_GL_SOURCE` is plain JS injected into the bake page (and into
 * `tests/browser/qr-prd10-impostor.spec.ts`, which runs the same code). It
 * defines on `window`:
 *   __a3dBakeLoad(gl, mesh)       → GPU resources for a `loadGlbMesh` result
 *   __a3dBakeTile(gl, res, dir, center, radius, size, mode) → RGBA8 pixels of
 *       one orthographic impostor frame (mode 0: albedo + coverage alpha,
 *       mode 1: tile-space normal XY in RG, depth in B, coverage in A)
 *   __a3dBakeAtlas(gl, res, tiles, center, radius, size, views) → { albedo, normalDepth }
 *       full atlases (row 0 = GL bottom row, the texImage2D upload order)
 *   __a3dDrawMesh(gl, res, mvp, mode)  draws LOD0 with any column-major MVP
 *   __a3dTileBasis(dir) / __a3dOrtho(dir, center, radius) / __a3dLookPerspective(...)
 *
 * Tile basis (frozen with ImpostorMaterial.ts): right = normalize(cross(Y,
 * horizontal(dir))), up = cross(dir, right); clip.xy = dot(p - c, right/up)/r.
 */
export const BAKE_GL_SOURCE = String.raw`
(() => {
  const VS = "#version 300 es\nprecision highp float;\n" +
    "in vec3 a_pos; in vec3 a_nrm; in vec2 a_uv;\n" +
    "uniform mat4 u_mvp; uniform vec3 u_right; uniform vec3 u_up; uniform vec4 u_depthAxis; uniform float u_radius;\n" +
    "out vec3 v_nrm; out vec2 v_uv; out float v_depth;\n" +
    "void main() { v_nrm = a_nrm; v_uv = a_uv;\n" +
    "  v_depth = 0.5 + 0.5 * (dot(a_pos, u_depthAxis.xyz) + u_depthAxis.w) / u_radius;\n" +
    "  gl_Position = u_mvp * vec4(a_pos, 1.0); }\n";
  const FS = "#version 300 es\nprecision highp float;\n" +
    "in vec3 v_nrm; in vec2 v_uv; in float v_depth; out vec4 o;\n" +
    "uniform vec4 u_color; uniform sampler2D u_tex; uniform int u_hasTex; uniform float u_cutoff; uniform int u_mode;\n" +
    "uniform vec3 u_right; uniform vec3 u_up;\n" +
    "void main() { vec4 c = u_color; if (u_hasTex == 1) c *= texture(u_tex, v_uv);\n" +
    "  if (u_cutoff > 0.0) { if (c.a < u_cutoff) discard; }\n" +
    "  vec3 n = normalize(v_nrm); if (!gl_FrontFacing) n = -n;\n" +
    "  if (u_mode == 0) o = vec4(c.rgb, 1.0);\n" +
    "  else o = vec4(dot(n, u_right) * 0.5 + 0.5, dot(n, u_up) * 0.5 + 0.5, clamp(v_depth, 0.0, 1.0), 1.0); }\n";

  const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

  window.__a3dTileBasis = (dir) => {
    const d = norm(dir);
    const h = Math.hypot(d[0], d[2]) > 1e-6 ? norm([d[0], 0, d[2]]) : [0, 0, 1];
    const right = norm(cross([0, 1, 0], h));
    const up = norm(cross(d, right));
    return { d, right, up };
  };

  // column-major: clip = M p ; z = -dot(p - c, d)/r * 0.99 (nearer → smaller)
  window.__a3dOrtho = (dir, center, radius) => {
    const { d, right, up } = window.__a3dTileBasis(dir);
    const k = 0.99 / radius;
    const rows = [
      [right[0] / radius, right[1] / radius, right[2] / radius, -dot(right, center) / radius],
      [up[0] / radius, up[1] / radius, up[2] / radius, -dot(up, center) / radius],
      [-d[0] * k, -d[1] * k, -d[2] * k, dot(d, center) * k],
      [0, 0, 0, 1]
    ];
    const m = new Float32Array(16);
    for (let r = 0; r < 4; r += 1) for (let c = 0; c < 4; c += 1) m[c * 4 + r] = rows[r][c];
    return m;
  };

  // perspective look from center + dir*dist toward center, camera axes = tile basis
  window.__a3dLookPerspective = (dir, center, dist, fovYRad, near, far) => {
    const { d, right, up } = window.__a3dTileBasis(dir);
    const eye = [center[0] + d[0] * dist, center[1] + d[1] * dist, center[2] + d[2] * dist];
    const view = [
      [right[0], right[1], right[2], -dot(right, eye)],
      [up[0], up[1], up[2], -dot(up, eye)],
      [d[0], d[1], d[2], -dot(d, eye)],
      [0, 0, 0, 1]
    ];
    const f = 1 / Math.tan(fovYRad / 2);
    const proj = [[f, 0, 0, 0], [0, f, 0, 0], [0, 0, (far + near) / (near - far), (2 * far * near) / (near - far)], [0, 0, -1, 0]];
    const m = new Float32Array(16);
    for (let r = 0; r < 4; r += 1) for (let c = 0; c < 4; c += 1) {
      let s = 0;
      for (let k = 0; k < 4; k += 1) s += proj[r][k] * view[k][c];
      m[c * 4 + r] = s;
    }
    return { mvp: m, eye };
  };

  const compile = (gl, type, src) => {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error("bake shader: " + gl.getShaderInfoLog(sh));
    return sh;
  };

  window.__a3dBakeLoad = async (gl, mesh) => {
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error("bake link: " + gl.getProgramInfoLog(prog));
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const attr = (name, data, size) => {
      const loc = gl.getAttribLocation(prog, name);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
      if (loc >= 0) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0); }
    };
    attr("a_pos", mesh.positions, 3);
    attr("a_nrm", mesh.normals, 3);
    attr("a_uv", mesh.uvs, 2);
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(mesh.indices), gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    const textures = [];
    for (const img of mesh.images) {
      const bytes = Uint8Array.from(atob(img.base64), (ch) => ch.charCodeAt(0));
      const bmp = await createImageBitmap(new Blob([bytes], { type: img.mime }), { imageOrientation: "none", premultiplyAlpha: "none", colorSpaceConversion: "none" });
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, bmp);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      textures.push(tex);
    }
    const u = (n) => gl.getUniformLocation(prog, n);
    return { prog, vao, textures, groups: mesh.groups, loc: {
      mvp: u("u_mvp"), right: u("u_right"), up: u("u_up"), depthAxis: u("u_depthAxis"), radius: u("u_radius"),
      color: u("u_color"), tex: u("u_tex"), hasTex: u("u_hasTex"), cutoff: u("u_cutoff"), mode: u("u_mode")
    } };
  };

  // Draws every group; "basis" feeds the normal/depth encode (mode 1).
  window.__a3dDrawMesh = (gl, res, mvp, mode, basis) => {
    const b = basis ?? { d: [0, 0, 1], right: [1, 0, 0], up: [0, 1, 0], center: [0, 0, 0], radius: 1 };
    gl.useProgram(res.prog);
    gl.bindVertexArray(res.vao);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    gl.uniformMatrix4fv(res.loc.mvp, false, mvp);
    gl.uniform3fv(res.loc.right, b.right);
    gl.uniform3fv(res.loc.up, b.up);
    gl.uniform4f(res.loc.depthAxis, b.d[0], b.d[1], b.d[2], -dot(b.d, b.center));
    gl.uniform1f(res.loc.radius, b.radius);
    gl.uniform1i(res.loc.mode, mode);
    gl.uniform1i(res.loc.tex, 0);
    gl.activeTexture(gl.TEXTURE0);
    for (const g of res.groups) {
      const m = g.material;
      gl.uniform4fv(res.loc.color, m.color);
      gl.uniform1f(res.loc.cutoff, m.alphaCutoff);
      gl.uniform1i(res.loc.hasTex, m.image === null ? 0 : 1);
      gl.bindTexture(gl.TEXTURE_2D, m.image === null ? null : res.textures[m.image]);
      gl.drawElements(gl.TRIANGLES, g.count, gl.UNSIGNED_INT, g.start * 4);
    }
    gl.bindVertexArray(null);
  };

  let fbo = null;
  const target = (gl, size) => {
    if (fbo && fbo.size === size) return fbo;
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    const color = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, color);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA8, size, size);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, color);
    const depth = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, size, size);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error("bake fbo incomplete");
    fbo = { fb, size };
    return fbo;
  };
  window.__a3dBakeTarget = target;

  window.__a3dBakeTile = (gl, res, dir, center, radius, size, mode) => {
    const t = target(gl, size);
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
    gl.viewport(0, 0, size, size);
    gl.clearColor(0, 0, 0, 0);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const basis = { ...window.__a3dTileBasis(dir), center, radius };
    window.__a3dDrawMesh(gl, res, window.__a3dOrtho(dir, center, radius), mode, basis);
    const px = new Uint8Array(size * size * 4);
    gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return px;
  };

  window.__a3dBakeAtlas = (gl, res, tiles, center, radius, size, views) => {
    const A = views * size;
    const albedo = new Uint8Array(A * A * 4);
    const normalDepth = new Uint8Array(A * A * 4);
    for (const t of tiles) {
      const a = window.__a3dBakeTile(gl, res, t.dir, center, radius, size, 0);
      const n = window.__a3dBakeTile(gl, res, t.dir, center, radius, size, 1);
      for (let row = 0; row < size; row += 1) {
        const dst = ((t.tileY * size + row) * A + t.tileX * size) * 4;
        albedo.set(a.subarray(row * size * 4, (row + 1) * size * 4), dst);
        normalDepth.set(n.subarray(row * size * 4, (row + 1) * size * 4), dst);
      }
    }
    return { albedo, normalDepth, atlasSize: A };
  };
})();
`;
