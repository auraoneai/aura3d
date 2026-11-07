// Dump hero.glb skinning: per mesh, per vertex-height band, bone weight shares. usage: node skin.mjs hero.glb
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(process.argv[2]);
const root = doc.getRoot();
for (const s of root.listSkins()) console.log("skin", s.getName(), "joints", s.listJoints().map((j) => j.getName()).join(","));
for (const n of root.listNodes()) if (n.getMesh()) console.log("meshnode", n.getName(), "skin", !!n.getSkin(), "parent", n.getParentNode()?.getName());
for (const n of root.listNodes().filter((x) => x.getMesh() && x.getSkin())) {
  const names = n.getSkin().listJoints().map((j) => j.getName());
  for (const prim of n.getMesh().listPrimitives()) {
    const P = prim.getAttribute("POSITION"), J = prim.getAttribute("JOINTS_0"), W = prim.getAttribute("WEIGHTS_0");
    if (!J) continue;
    const cnt = P.getCount(); let ymin = 1e9, ymax = -1e9;
    const pos = []; for (let i = 0; i < cnt; i++) { const p = P.getElement(i, []); pos.push(p); ymin = Math.min(ymin, p[1]); ymax = Math.max(ymax, p[1]); }
    console.log("\nmesh", n.getMesh().getName(), "prim material", prim.getMaterial()?.getName(), "verts", cnt, "y", ymin.toFixed(3), ymax.toFixed(3));
    const bands = 8, acc = Array.from({ length: bands }, () => ({ n: 0, w: {} }));
    for (let i = 0; i < cnt; i++) {
      const b = Math.min(bands - 1, Math.floor(((pos[i][1] - ymin) / (ymax - ymin)) * bands));
      const j = J.getElement(i, []), w = W.getElement(i, []);
      acc[b].n++;
      for (let k = 0; k < 4; k++) if (w[k] > 0) acc[b].w[names[j[k]]] = (acc[b].w[names[j[k]]] ?? 0) + w[k];
    }
    acc.forEach((a, b) => {
      const top = Object.entries(a.w).sort((x, y) => y[1] - x[1]).slice(0, 6).map(([k, v]) => `${k}:${((v / a.n) * 100).toFixed(0)}%`).join("  ");
      console.log(` band ${b} y[${(ymin + ((ymax - ymin) * b) / bands).toFixed(2)}..] n=${a.n}  ${top}`);
    });
  }
}
console.log("\nanimations");
for (const a of root.listAnimations()) {
  console.log(a.getName());
  const peaks = {};
  for (const ch of a.listChannels()) {
    if (ch.getTargetPath() !== "rotation") continue;
    const s = ch.getSampler(), arr = s.getOutput(), name = ch.getTargetNode().getName(), rest = ch.getTargetNode().getRotation();
    let max = 0; const q = [];
    for (let i = 0; i < arr.getCount(); i++) { arr.getElement(i, q); const d = Math.abs(q[0]*rest[0]+q[1]*rest[1]+q[2]*rest[2]+q[3]*rest[3]); max = Math.max(max, 2 * Math.acos(Math.min(1, d)) * 180 / Math.PI); }
    peaks[name] = max;
  }
  console.log(Object.entries(peaks).sort((x, y) => y[1] - x[1]).slice(0, 14).map(([k, v]) => `${k}:${v.toFixed(0)}deg`).join("  "));
}
