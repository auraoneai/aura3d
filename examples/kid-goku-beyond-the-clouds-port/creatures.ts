/**
 * Stylised procedural creatures and set pieces for the Cloud Runner: a diving pterosaur, a stomping tyrant lizard
 * (body, head, jaw pivot), a boulder, the staff, the sky cloud and the meat. Original shapes, merged with vertex colours.
 */
import { Mesh, cylinder, hex, icosphere, mix3 } from "./mesh";
import { seeded } from "./sim";
import type { V3 } from "./course";

const ell = (c: readonly [number, number, number], sx: number, sy: number, sz: number, jitter = 0.04, seed = 1): Mesh => {
  const m = icosphere(2, c, jitter, seeded(seed));
  const out = new Mesh();
  out.append(m, [0, 0, 0], [sx, sy, sz]);
  return out;
};

/** Pterosaur body (forward is +Z in local space), a left wing (extends +X from the shoulder pivot at the origin). */
export function pteranodon(): { body: Mesh; wing: Mesh } {
  const body = new Mesh();
  const olive = hex("#8f8a62"), belly = hex("#ddd2a8"), beak = hex("#d9b85e"), crest = hex("#c0502f");
  body.append(ell(olive, 0.55, 0.5, 1.35, 0.03, 2), [0, 0, 0]);
  body.append(ell(belly, 0.42, 0.28, 1.1, 0.02, 3), [0, -0.2, 0.1]);
  body.append(ell(olive, 0.4, 0.38, 0.6, 0.02, 4), [0, 0.12, 1.55]);
  const bk = cylinder(9, 0.22, 0.02, 2.5, beak, mix3(beak, hex("#fff3c0"), 0.5));
  body.append(bk, [0, 0.08, 1.85], [1, 1, 1], 0, Math.PI / 2 - 0.1);
  const cr = cylinder(7, 0.2, 0.01, 1.9, crest, hex("#e87a45"));
  body.append(cr, [0, 0.4, 1.35], [1, 1, 1], 0, -Math.PI / 2 + 0.55);
  const tail = cylinder(6, 0.12, 0.02, 1.4, olive, olive);
  body.append(tail, [0, 0, -1.4], [1, 1, 1], 0, -Math.PI / 2);
  body.computeNormals();
  const wing = new Mesh();
  const membrane = hex("#d6c58f"), edge = hex("#8a6a3d"), dark = hex("#6b5530");
  const v = (x: number, y: number, z: number, c: readonly [number, number, number]): number => wing.vertex([x, y, z], [0, 1, 0], [x / 7, z / 3], c);
  const sh = v(0, 0, 0.5, edge), sb = v(0, 0, -1.0, membrane);
  const e1 = v(2.4, 0.5, 0.25, edge), b1 = v(2.1, 0.1, -1.4, membrane);
  const e2 = v(4.6, 0.7, -0.05, edge), b2 = v(4.0, 0.1, -1.9, membrane);
  const tip = v(7.0, -0.2, -0.9, dark), b3 = v(5.6, 0.0, -1.6, membrane);
  wing.quad(sh, e1, b1, sb); wing.quad(e1, e2, b2, b1); wing.tri(e2, tip, b3); wing.tri(e2, b3, b2);
  wing.computeNormals();
  return { body, wing };
}

/** Tyrant lizard: body (torso, legs, tail, arms), head (upper jaw, eye, crest), jaw (lower, pivot at the back). Forward +Z. */
export function trex(): { body: Mesh; head: Mesh; jaw: Mesh } {
  const skin = hex("#5f8c3d"), skin2 = hex("#486f33"), belly = hex("#e6d9a8"), tooth = hex("#fff6dc");
  const body = new Mesh();
  body.append(ell(skin, 1.7, 1.9, 3.1, 0.03, 11), [0, 4.2, 0]);
  body.append(ell(belly, 1.2, 1.2, 2.4, 0.02, 12), [0, 3.5, 0.5]);
  const tail = cylinder(10, 1.1, 0.12, 6.5, skin, skin2);
  body.append(tail, [0, 4.0, -2.6], [1, 1, 1], 0, -Math.PI / 2 + 0.12);
  for (const x of [-1.5, 1.5]) {
    body.append(ell(skin2, 0.9, 2.0, 1.1, 0.03, 13), [x, 2.4, -0.3]);
    const shin = cylinder(8, 0.45, 0.32, 2.2, skin2, skin);
    body.append(shin, [x, 0.3, -0.3], [1, 1, 1], 0, 0);
    body.append(ell(skin, 0.7, 0.3, 1.2, 0.02, 14), [x, 0.15, 0.4]);
    body.append(ell(skin, 0.28, 0.28, 0.8, 0.02, 15), [x * 0.75, 4.1, 2.6]);
  }
  body.append(ell(skin2, 1.1, 1.3, 1.5, 0.03, 16), [0, 5.4, 2.2]);
  body.computeNormals();
  const head = new Mesh();
  head.append(ell(skin, 0.95, 0.85, 1.7, 0.03, 17), [0, 0, 1.0]);
  head.append(ell(skin, 0.75, 0.55, 1.1, 0.02, 18), [0, -0.15, 2.0]);
  head.append(ell(hex("#ffd24a"), 0.18, 0.18, 0.18, 0, 19), [0.62, 0.5, 1.45]);
  head.append(ell(hex("#ffd24a"), 0.18, 0.18, 0.18, 0, 20), [-0.62, 0.5, 1.45]);
  head.append(ell(hex("#1a1a1a"), 0.09, 0.12, 0.1, 0, 21), [0.7, 0.5, 1.48]);
  head.append(ell(hex("#1a1a1a"), 0.09, 0.12, 0.1, 0, 22), [-0.7, 0.5, 1.48]);
  for (let i = 0; i < 6; i++) for (const x of [-0.55, 0.55]) head.append(cylinder(5, 0.1, 0.01, 0.34, tooth, tooth), [x, -0.55, 1.3 + i * 0.28], [1, 1, 1], 0, Math.PI);
  head.computeNormals();
  const jaw = new Mesh();
  jaw.append(ell(skin, 0.78, 0.38, 1.6, 0.02, 23), [0, -0.1, 1.1]);
  jaw.append(ell(belly, 0.6, 0.22, 1.3, 0.02, 24), [0, -0.28, 1.15]);
  for (let i = 0; i < 5; i++) for (const x of [-0.5, 0.5]) jaw.append(cylinder(5, 0.09, 0.01, 0.3, tooth, tooth), [x, 0.2, 0.8 + i * 0.28], [1, 1, 1], 0, 0);
  jaw.computeNormals();
  return { body, head, jaw };
}

export function boulder(): Mesh {
  const m = icosphere(2, hex("#b59a74"), 0.16, seeded(404));
  for (let i = 0; i < m.vertexCount; i++) {
    const y = m.positions[i * 3 + 1]!, x = m.positions[i * 3]!;
    const t = Math.max(0, Math.min(1, 0.5 + 0.5 * Math.sin(x * 4 + y * 3)));
    const c = mix3(hex("#a58a66"), hex("#cdb48a"), t);
    m.colors[i * 4] = c[0]; m.colors[i * 4 + 1] = c[1]; m.colors[i * 4 + 2] = c[2];
  }
  return m;
}

/** A fluffy golden-white cloud to ride: a cluster of lumps. */
export function skyCloud(): Mesh {
  const m = new Mesh();
  const top = hex("#fffbe8"), under = hex("#f2cf7c");
  const rnd = seeded(77);
  const lumps: [V3, V3][] = [[[0, 0, 0], [1.25, 0.5, 1.15]], [[-0.75, 0.1, 0.3], [0.8, 0.42, 0.8]], [[0.8, 0.12, 0.25], [0.85, 0.44, 0.85]], [[0.1, 0.22, -0.7], [0.75, 0.4, 0.75]], [[-0.1, 0.15, 0.8], [0.7, 0.38, 0.7]], [[0, 0.32, 0], [0.8, 0.4, 0.8]]];
  for (const [p, s] of lumps) {
    const b = icosphere(2, top, 0.06, rnd);
    for (let i = 0; i < b.vertexCount; i++) {
      const y = b.positions[i * 3 + 1]!;
      const c = mix3(under, top, Math.max(0, Math.min(1, (y + 0.4) / 1.2)));
      b.colors[i * 4] = c[0]; b.colors[i * 4 + 1] = c[1]; b.colors[i * 4 + 2] = c[2];
    }
    m.append(b, p, s);
  }
  return m;
}

export function meatChunk(): Mesh {
  const m = new Mesh();
  m.append(ell(hex("#b25a2e"), 0.5, 0.42, 0.6, 0.05, 31), [0, 0, 0]);
  m.append(ell(hex("#e6b17b"), 0.32, 0.24, 0.34, 0.04, 32), [0.12, 0.2, 0.05]);
  const bone = cylinder(6, 0.1, 0.1, 0.95, hex("#f4ead0"), hex("#f4ead0"));
  m.append(bone, [-0.1, -0.05, 0], [1, 1, 1], 0, Math.PI / 2 - 0.2);
  m.append(ell(hex("#f4ead0"), 0.16, 0.16, 0.16, 0.02, 33), [-0.1, -0.05, 0.72]);
  m.append(ell(hex("#f4ead0"), 0.16, 0.16, 0.16, 0.02, 34), [-0.1, -0.05, -0.72]);
  m.computeNormals();
  return m;
}

export function pad(): void { /* keep module side-effect free */ }
