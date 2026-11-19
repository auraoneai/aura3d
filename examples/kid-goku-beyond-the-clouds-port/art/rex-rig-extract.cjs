// art/rex-rig-extract.cjs <cdStormTyrantRig.glb> <art/rexRigData.ts> : bakes the tyrant skeleton (rest local TRS) + idle/walk rotation keys into a TS module,
// and prints the leg/head/tail/jaw candidates and the walk stride measured by FK.
const r = require("node:module").createRequire("/Users/gurbakshchahal/platforms/A-LIVE/aura3d/package.json");
const { NodeIO } = r("@gltf-transform/core"); const { ALL_EXTENSIONS } = r("@gltf-transform/extensions");
const fs = require("fs");
const qmul = (a, b) => [a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1], a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0], a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3], a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
const qrot = (q, v) => { const [x,y,z,w] = q; const ix = w*v[0]+y*v[2]-z*v[1], iy = w*v[1]+z*v[0]-x*v[2], iz = w*v[2]+x*v[1]-y*v[0], iw = -x*v[0]-y*v[1]-z*v[2];
  return [ix*w+iw*-x+iy*-z-iz*-y, iy*w+iw*-y+iz*-x-ix*-z, iz*w+iw*-z+ix*-y-iy*-x]; };
const slerp = (a, b, t) => { let d = a[0]*b[0]+a[1]*b[1]+a[2]*b[2]+a[3]*b[3]; const s = d < 0 ? -1 : 1; d *= s; if (d > 0.9995) { const o = a.map((x, i) => x + (s*b[i] - x) * t); const l = Math.hypot(...o); return o.map((x) => x / l); }
  const th = Math.acos(d), sa = Math.sin(th); return a.map((x, i) => (Math.sin((1 - t) * th) * x + Math.sin(t * th) * s * b[i]) / sa); };
(async () => {
  const [inp, out] = process.argv.slice(2);
  const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(inp);
  const skin = doc.getRoot().listSkins()[0]; const J = skin.listJoints(); const idx = new Map(J.map((j, i) => [j, i]));
  const bones = J.map((j) => ({ name: j.getName(), parent: idx.has(j.getParentNode()) ? idx.get(j.getParentNode()) : -1, t: j.getTranslation(), r: j.getRotation(), s: j.getScale() }));
  const clips = {};
  for (const a of doc.getRoot().listAnimations()) {
    let dur = 0; const rot = {}; let rootT = null;
    for (const c of a.listChannels()) { const s = c.getSampler(); const t = Array.from(s.getInput().getArray()); dur = Math.max(dur, t[t.length - 1]);
      const n = idx.get(c.getTargetNode()); if (n === undefined) continue; const v = Array.from(s.getOutput().getArray());
      if (c.getTargetPath() === "rotation") rot[n] = { t, v }; if (c.getTargetPath() === "translation") rootT = { n, t, v }; }
    clips[a.getName()] = { duration: dur, rot, rootT };
  }
  // FK in rig space (skeleton root's parent frame) at a clip time
  const sample = (clip, time) => bones.map((b, i) => { const ch = clips[clip].rot[i]; if (!ch) return b.r; const { t, v } = ch;
    if (time <= t[0]) return v.slice(0, 4); if (time >= t[t.length - 1]) return v.slice(-4);
    let k = 0; while (t[k + 1] < time) k++; const f = (time - t[k]) / (t[k + 1] - t[k]); return slerp(v.slice(k*4, k*4+4), v.slice(k*4+4, k*4+8), f); });
  const fk = (rots) => { const W = []; bones.forEach((b, i) => { const p = b.parent; if (p < 0) W[i] = { q: rots[i], p: b.t.slice() };
    else { const P = W[p]; W[i] = { q: qmul(P.q, rots[i]), p: qrot(P.q, b.t).map((x, k) => x + P.p[k]) }; } }); return W; };
  const rest = fk(bones.map((b) => b.r));
  const kids = bones.map((_, i) => bones.filter((b) => b.parent === i).length);
  const leaves = bones.map((b, i) => i).filter((i) => kids[i] === 0);
  const low = leaves.slice().sort((a, b) => rest[a].p[1] - rest[b].p[1]).slice(0, 6);
  console.log("lowest leaves", low.map((i) => `${i}@${rest[i].p.map((x) => x.toFixed(3))}`).join("  "));
  const high = leaves.slice().sort((a, b) => rest[b].p[1] - rest[a].p[1]).slice(0, 6);
  console.log("highest leaves", high.map((i) => `${i}@${rest[i].p.map((x) => x.toFixed(3))}`).join("  "));
  const chainUp = (i) => { const c = [i]; while (bones[c[0]].parent >= 0) c.unshift(bones[c[0]].parent); return c; };
  console.log("chain to low[0]", chainUp(low[0]).join(","), " low[1]", chainUp(low[1]).join(","));
  // walk: per-foot path over the cycle (rig space)
  if (clips.walk) { const D = clips.walk.duration; for (const f of low.slice(0, 4)) { const ys = [], zs = [], xs = [];
      for (let k = 0; k <= 40; k++) { const W = fk(sample("walk", (k / 40) * D)); xs.push(W[f].p[0]); ys.push(W[f].p[1]); zs.push(W[f].p[2]); }
      console.log("foot", f, "y", Math.min(...ys).toFixed(3), Math.max(...ys).toFixed(3), "x", Math.min(...xs).toFixed(3), Math.max(...xs).toFixed(3), "z", Math.min(...zs).toFixed(3), Math.max(...zs).toFixed(3)); } }
  // root (skeleton parent) transform from the scene graph for world mapping
  const rootNode = J[0].getParentNode(); const wm = rootNode ? rootNode.getWorldMatrix() : null;
  console.log("skeleton parent world matrix", wm ? Array.from(wm).map((x) => +x.toFixed(4)).join(",") : "none");
  const r5 = (a) => a.map((x) => +x.toFixed(5));
  const data = { rootMatrix: wm ? Array.from(wm).map((x) => +x.toFixed(6)) : null, bones: bones.map((b) => ({ name: b.name, parent: b.parent, t: r5(b.t), r: r5(b.r) })),
    clips: Object.fromEntries(Object.entries(clips).map(([n, c]) => [n, { duration: +c.duration.toFixed(4),
      root: c.rootT ? { times: r5(c.rootT.t), values: r5(c.rootT.v) } : null,
      tracks: Object.entries(c.rot).map(([b, ch]) => ({ bone: +b, times: r5(ch.t), quats: r5(ch.v) })) }])) };
  fs.writeFileSync(out, `// Generated by art/rex-rig-extract (Idol cdStormTyrantRig.glb): skeleton rest pose + baked idle/walk rotation keys.\n// Do not edit by hand; re-run the extractor after a re-roll.\nexport const REX_RIG = ${JSON.stringify(data)} as const;\n`);
  console.log("wrote", out, (fs.statSync(out).size / 1024).toFixed(1), "KB");
})();
