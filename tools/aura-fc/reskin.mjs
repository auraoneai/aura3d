// Re-skins the lower body of a Meshy athlete GLB so each vertex below the crotch follows ONE leg.
// The auto-rig leaves 15 to 20% of the thigh and shorts vertices weighted to both legs; when the legs swing in opposite
// directions those vertices are dragged apart and the cloth tears into shards. Below `crotch` (metres) a vertex whose
// rest x is more than `dead` from the body midline moves all its other-leg weight onto the same-side bone.
//   node tools/aura-fc/reskin.mjs <in.glb> <out.glb> [--crotch 0.70] [--mid -0.025] [--dead 0.012]
import { readGlb, writeGlb } from "./glb.mjs";
import { loadSkinnedMesh } from "./skin.mjs";
import { compact } from "./bridge-cut.mjs";

const swapSide = (name) => name.replace(/^Left/, "\u0000").replace(/^Right/, "Left").replace(/^\u0000/, "Right");

export function reskinLowerBody(glb, { crotch = 0.7, mid = -0.025, dead = 0.012 } = {}) {
  const json = JSON.parse(JSON.stringify(glb.json));
  let bin = Buffer.from(glb.bin);
  const report = [];
  json.meshes[0].primitives.forEach((prim, pi) => {
    if (prim.attributes.JOINTS_0 === undefined) return;
    const mesh = loadSkinnedMesh(glb, pi);
    const nameToIdx = new Map(mesh.jointNames.map((n, i) => [n, i]));
    const nV = mesh.pos.length;
    const J = new Uint16Array(nV * 4), W = new Float32Array(nV * 4);
    let moved = 0;
    for (let v = 0; v < nV; v++) {
      const acc = new Map();
      for (let k = 0; k < 4; k++) if (mesh.weights[v][k] > 0) acc.set(mesh.joints[v][k], (acc.get(mesh.joints[v][k]) ?? 0) + mesh.weights[v][k]);
      const x = mesh.pos[v][0];
      if (mesh.pos[v][1] < crotch && Math.abs(x - mid) > dead) {
        const keepSide = x > mid ? "Left" : "Right";
        let changed = false;
        for (const [j, w] of [...acc]) {
          const n = mesh.jointNames[j];
          if (/^(Left|Right)/.test(n) && !n.startsWith(keepSide) && /Leg|Foot/.test(n)) {
            const target = nameToIdx.get(swapSide(n));
            if (target !== undefined) { acc.delete(j); acc.set(target, (acc.get(target) ?? 0) + w); changed = true; }
          }
        }
        if (changed) moved++;
      }
      const top = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
      const sum = top.reduce((s, [, w]) => s + w, 0) || 1;
      for (let k = 0; k < 4; k++) { J[v * 4 + k] = top[k]?.[0] ?? 0; W[v * 4 + k] = top[k] ? top[k][1] / sum : 0; }
    }
    report.push({ primitive: pi, material: json.materials[prim.material]?.name, vertices: nV, reskinned: moved });
    if (!moved) return;
    const push = (arr, componentType, bytes) => {
      const pad = (4 - (bin.length % 4)) % 4; if (pad) bin = Buffer.concat([bin, Buffer.alloc(pad)]);
      const off = bin.length; const buf = Buffer.alloc(arr.length * bytes);
      arr.forEach((val, i) => (componentType === 5126 ? buf.writeFloatLE(val, i * 4) : buf.writeUInt16LE(val, i * 2)));
      bin = Buffer.concat([bin, buf]);
      json.bufferViews.push({ buffer: 0, byteOffset: off, byteLength: buf.length, target: 34962 });
      json.accessors.push({ bufferView: json.bufferViews.length - 1, componentType, count: nV, type: "VEC4" });
      return json.accessors.length - 1;
    };
    prim.attributes.JOINTS_0 = push(J, 5123, 2);
    prim.attributes.WEIGHTS_0 = push(W, 5126, 4);
  });
  json.buffers[0].byteLength = bin.length;
  return { glb: compact({ json, bin }), report };
}

if (process.argv[1]?.endsWith("reskin.mjs") && process.argv[3]) {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? Number(process.argv[i + 1]) : d; };
  const r = reskinLowerBody(readGlb(process.argv[2]), { crotch: arg("--crotch", 0.7), mid: arg("--mid", -0.025), dead: arg("--dead", 0.012) });
  console.log(JSON.stringify({ report: r.report, ...writeGlb(process.argv[3], r.glb) }));
}
