(() => {
  const P = WebGL2RenderingContext.prototype;
  const srcOf = new WeakMap(); const progShaders = new WeakMap(); const progId = new WeakMap(); const fbId = new WeakMap();
  let nextProg = 0, nextFb = 0, cur = null;
  const tr = (window.__tr = { armed: false, left: 0, rows: [], progs: {} });
  const ss = P.shaderSource; P.shaderSource = function (s, src) { srcOf.set(s, src); return ss.call(this, s, src); };
  const as = P.attachShader; P.attachShader = function (p, s) { const l = progShaders.get(p) || []; l.push(s); progShaders.set(p, l); return as.call(this, p, s); };
  const up = P.useProgram; P.useProgram = function (p) { cur = p; return up.call(this, p); };
  const sig = (p) => {
    if (!p) return "none";
    let id = progId.get(p);
    if (id === undefined) {
      id = nextProg++; progId.set(p, id);
      const srcs = (progShaders.get(p) || []).map((s) => srcOf.get(s) || "");
      const frag = srcs.find((s) => /gl_FragColor|out\s+vec4|fragColor/.test(s) && !/gl_Position/.test(s)) || srcs[1] || "";
      const keys = ["u_environmentBackground", "u_envSH", "u_baseColor", "u_fog", "u_shadowMap", "u_contactShadow", "u_bloom", "u_lut3d", "u_exposure", "u_vignette", "u_hdr", "u_source", "u_instanceMatrices", "u_ao", "u_color", "u_whitePoint", "u_sky", "u_stars", "u_horizon", "u_zenith"].filter((k) => frag.includes(k) || srcs.some((s) => s.includes(k)));
      tr.progs[id] = { keys, head: frag.replace(/\s+/g, " ").slice(0, 160), len: frag.length, mainHint: (frag.match(/void main\(\)\s*\{[\s\S]{0,400}/) || [""])[0].replace(/\s+/g, " ") };
    }
    return id;
  };
  let mine = null;
  const readPx = (gl) => {
    const vp = gl.getParameter(gl.VIEWPORT);
    if (vp[2] !== 1280 || vp[3] !== 720) return null;
    const dfb = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING); const rfb = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING);
    let fid = dfb ? fbId.get(dfb) : "null"; if (dfb && fid === undefined) { fid = nextFb++; fbId.set(dfb, fid); }
    const out = { fb: fid };
    for (const fmt of [["RGBA16F", gl.RGBA16F, gl.FLOAT], ["RGBA8", gl.RGBA8, gl.UNSIGNED_BYTE], ["RGBA32F", gl.RGBA32F, gl.FLOAT], ["R11F_G11F_B10F", gl.R11F_G11F_B10F, gl.FLOAT]]) {
      if (!mine || mine.fmt !== fmt[0]) {
        const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texStorage2D(gl.TEXTURE_2D, 1, fmt[1], 1280, 720);
        const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, f); gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
        mine = { fmt: fmt[0], f, type: fmt[2] };
      }
      while (gl.getError()) {}
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, dfb); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, mine.f);
      gl.blitFramebuffer(0, 0, 1280, 720, 0, 0, 1280, 720, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      if (gl.getError() === 0) {
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, mine.f);
        const pts = [[640, 675], [100, 120], [1000, 670], [645, 300]];
        out.fmt = fmt[0];
        out.px = pts.map(([x, y]) => { const a = mine.type === gl.FLOAT ? new Float32Array(4) : new Uint8Array(4); gl.readPixels(x, y, 1, 1, gl.RGBA, mine.type, a); return Array.from(a).map((v) => +v.toFixed(3)); });
        while (gl.getError()) {}
        break;
      }
      mine = null;
    }
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, rfb); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, dfb);
    return out;
  };
  for (const fn of ["drawElements", "drawArrays", "drawElementsInstanced", "drawArraysInstanced", "drawRangeElements"]) {
    const o = P[fn];
    P[fn] = function (...a) {
      const r = o.apply(this, a);
      if (tr.armed && tr.left > 0) {
        tr.left--;
        try { const id = sig(cur); const px = readPx(this); if (px) tr.rows.push({ i: tr.rows.length, fn, prog: id, n: a[1], ...px, blend: this.isEnabled(this.BLEND), depth: this.isEnabled(this.DEPTH_TEST) }); } catch (e) { tr.rows.push({ err: String(e) }); }
      }
      return r;
    };
  }
  const raf = window.requestAnimationFrame.bind(window);
  window.__trArm = (n) => new Promise((res) => raf(() => { tr.armed = true; tr.left = n; tr.rows = []; raf(() => raf(() => { tr.armed = false; res(true); })); }));
})();
