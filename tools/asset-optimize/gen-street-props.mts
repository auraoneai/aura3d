// Procedural street-furniture props for the K2 kit (props/industrial-urban) —
// generated CC0, same provenance class as gen-flipbooks.py. No toolkit nodes
// cover a street bollard or a wall AC unit, so we author them here.
// Usage: tsx gen-street-props.mts <outDir>
import { Document, NodeIO, Material } from "@gltf-transform/core";

type Vec3 = [number, number, number];
interface Prim { positions: number[]; normals: number[]; indices: number[] }

const norm = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

// Lathe a 2D profile [(radius, y), ...] around +Y. Smooth normals.
function lathe(profile: [number, number][], seg = 32): Prim {
  const positions: number[] = [], normals: number[] = [], indices: number[] = [];
  for (let s = 0; s <= seg; s++) {
    const a = (s / seg) * Math.PI * 2, c = Math.cos(a), si = Math.sin(a);
    for (let i = 0; i < profile.length; i++) {
      const [r, y] = profile[i];
      positions.push(r * c, y, r * si);
      const [r0, y0] = profile[Math.max(0, i - 1)], [r1, y1] = profile[Math.min(profile.length - 1, i + 1)];
      const n = norm([(y1 - y0) * c, -(r1 - r0), (y1 - y0) * si]);
      normals.push(...n);
    }
  }
  const P = profile.length;
  for (let s = 0; s < seg; s++) for (let i = 0; i < P - 1; i++) {
    const a = s * P + i, b = a + P;
    indices.push(a, b, a + 1, a + 1, b, b + 1);
  }
  return { positions, normals, indices };
}

// Axis-aligned box with face normals; c = centre, h = half-extents.
function box(c: Vec3, h: Vec3): Prim {
  const [cx, cy, cz] = c, [hx, hy, hz] = h;
  const f: [Vec3, Vec3, Vec3, Vec3, Vec3][] = [
    [[1, 0, 0], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz], [hx, -hy, hz]],
    [[-1, 0, 0], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz], [-hx, -hy, -hz]],
    [[0, 1, 0], [-hx, hy, -hz], [-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz]],
    [[0, -1, 0], [-hx, -hy, hz], [-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz]],
    [[0, 0, 1], [-hx, -hy, hz], [-hx, hy, hz], [hx, hy, hz], [hx, -hy, hz]],
    [[0, 0, -1], [hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz], [-hx, -hy, -hz]],
  ];
  const positions: number[] = [], normals: number[] = [], indices: number[] = [];
  for (const [n, ...v] of f) {
    const base = positions.length / 3;
    for (const p of v) { positions.push(p[0] + cx, p[1] + cy, p[2] + cz); normals.push(...n); }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return { positions, normals, indices };
}

const cylinder = (r: number, h: number, seg = 32): Prim =>
  lathe([[0, 0], [r, 0], [r, h], [0, h]], seg);

function mk(doc: Document, buf: ReturnType<Document["createBuffer"]>, prim: Prim, mat: Material) {
  const pos = doc.createAccessor().setType("VEC3").setArray(new Float32Array(prim.positions)).setBuffer(buf);
  const nrm = doc.createAccessor().setType("VEC3").setArray(new Float32Array(prim.normals)).setBuffer(buf);
  const idx = doc.createAccessor().setType("SCALAR").setArray(new Uint32Array(prim.indices)).setBuffer(buf);
  return doc.createPrimitive().setAttribute("POSITION", pos).setAttribute("NORMAL", nrm).setIndices(idx).setMaterial(mat);
}

const out = process.argv[2] ?? ".";
const io = new NodeIO();
const tris = (p: Prim) => p.indices.length / 3;

// Bollard: 0.09m-radius body 0.9m tall, domed cap, red reflector band at 0.58-0.66m.
{
  const bd = new Document();
  const buf = bd.createBuffer();
  const steel = bd.createMaterial("galvanized-steel").setBaseColorFactor([0.62, 0.64, 0.67, 1]).setMetallicFactor(0.9).setRoughnessFactor(0.45);
  const refl = bd.createMaterial("reflector-band").setBaseColorFactor([0.85, 0.12, 0.1, 1]).setMetallicFactor(0.1).setRoughnessFactor(0.4);
  const body = lathe([[0, 0], [0.09, 0], [0.09, 0.78], [0.075, 0.86], [0.045, 0.895], [0, 0.9]], 32);
  const band = lathe([[0.091, 0.58], [0.091, 0.66]], 32);
  const mesh = bd.createMesh("streetBollard").addPrimitive(mk(bd, buf, body, steel)).addPrimitive(mk(bd, buf, band, refl));
  bd.createScene().addChild(bd.createNode("streetBollardMetal").setMesh(mesh));
  await io.write(`${out}/streetBollardMetal.glb`, bd);
  console.log(`streetBollardMetal tris=${tris(body) + tris(band)}`);
}

// AC unit: 0.9x0.6x0.3 casing, front fan disc + 4 grille slats (+Z face).
{
  const ad = new Document();
  const buf = ad.createBuffer();
  const cMat = ad.createMaterial("ac-casing").setBaseColorFactor([0.72, 0.73, 0.75, 1]).setMetallicFactor(0.35).setRoughnessFactor(0.6);
  const dMat = ad.createMaterial("ac-grille-dark").setBaseColorFactor([0.16, 0.17, 0.19, 1]).setMetallicFactor(0.5).setRoughnessFactor(0.7);
  const root = ad.createNode("streetACUnit");
  const shell = box([0, 0.3, 0], [0.45, 0.3, 0.15]);
  root.setMesh(ad.createMesh("acShell").addPrimitive(mk(ad, buf, shell, cMat)));
  let total = tris(shell);
  const fan = cylinder(0.19, 0.02, 24);
  root.addChild(ad.createNode("acFan").setMesh(ad.createMesh("acFan").addPrimitive(mk(ad, buf, fan, dMat)))
    .setRotation([-Math.SQRT1_2, 0, 0, Math.SQRT1_2]).setTranslation([0, 0.34, 0.14]));
  total += tris(fan);
  for (let i = 0; i < 4; i++) {
    const slat = box([0, 0.08 + i * 0.07, 0.152], [0.4, 0.018, 0.006]);
    root.addChild(ad.createNode(`acSlat${i}`).setMesh(ad.createMesh(`acSlat${i}`).addPrimitive(mk(ad, buf, slat, dMat))));
    total += tris(slat);
  }
  ad.createScene().addChild(root);
  await io.write(`${out}/streetACUnit.glb`, ad);
  console.log(`streetACUnit tris=${total}`);
}
