import * as THREE from 'three';
import { makeBurlapTexture, makeWoodTexture, mulberry32 } from './textures';

export interface CartInfo {
  root: THREE.Group;
  spinners: THREE.Group[];
  wheelCount: number;
  spokeCount: number;
  plankCount: number;
}

const WHEEL_R = 0.6;
const TILT = 0.1; // radians, front dips onto the prop stand
const FLOOR_TOP = 0.765;

export function buildCart(): CartInfo {
  const rnd = mulberry32(1234);
  const woodTex = makeWoodTexture();
  const burlapTex = makeBurlapTexture();

  const ironMat = new THREE.MeshStandardMaterial({ color: 0x4b4e54, metalness: 0.6, roughness: 0.5 });
  const darkIronMat = new THREE.MeshStandardMaterial({ color: 0x33353a, metalness: 0.6, roughness: 0.55 });

  const woodMat = (h: number, s: number, l: number): THREE.MeshStandardMaterial =>
    new THREE.MeshStandardMaterial({
      map: woodTex,
      color: new THREE.Color().setHSL(h, s, l),
      roughness: 0.85,
      metalness: 0,
    });
  const randWood = (lo = 0.4, hi = 0.58): THREE.MeshStandardMaterial =>
    woodMat(0.07 + rnd() * 0.035, 0.35 + rnd() * 0.2, lo + rnd() * (hi - lo));

  /** Box whose UVs make the wood grain follow its longest axis. */
  const grainBox = (w: number, h: number, d: number): THREE.BoxGeometry => {
    const g = new THREE.BoxGeometry(w, h, d);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const uv = g.attributes.uv as THREE.BufferAttribute;
    const dims = [w, h, d];
    let long = 0;
    if (dims[1] > dims[long]) long = 1;
    if (dims[2] > dims[long]) long = 2;
    const others = [0, 1, 2].filter((i) => i !== long);
    const off = rnd() * 4;
    const p = [0, 0, 0];
    for (let i = 0; i < pos.count; i++) {
      p[0] = pos.getX(i);
      p[1] = pos.getY(i);
      p[2] = pos.getZ(i);
      uv.setXY(i, p[long] * 0.8 + off, (p[others[0]] + p[others[1]]) * 2.5 + off * 0.37);
    }
    uv.needsUpdate = true;
    return g;
  };

  const place = <T extends THREE.Object3D>(parent: THREE.Object3D, o: T, x: number, y: number, z: number): T => {
    o.position.set(x, y, z);
    o.traverse((c) => {
      if (c instanceof THREE.Mesh) {
        c.castShadow = true;
        c.receiveShadow = true;
      }
    });
    parent.add(o);
    return o;
  };

  const cart = new THREE.Group();
  let plankCount = 0;

  const plank = (
    parent: THREE.Object3D,
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    mat?: THREE.Material,
  ): THREE.Mesh => {
    return place(parent, new THREE.Mesh(grainBox(w, h, d), mat ?? randWood()), x, y, z);
  };

  // ---------- chassis: beams, handles, axle ----------
  const beamY = 0.68;
  for (const sx of [-1, 1]) {
    // main beam under the bed (z 1.05 .. -0.9)
    plank(cart, 0.07, 0.09, 1.95, sx * 0.45, beamY, 0.075, randWood(0.34, 0.42));
    // round push handle (z -0.9 .. -2.0)
    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 1.1, 12),
      woodMat(0.08, 0.4, 0.4),
    );
    handle.rotation.x = Math.PI / 2;
    place(cart, handle, sx * 0.45, beamY, -1.45);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 8), handle.material);
    place(cart, cap, sx * 0.45, beamY, -2.0);
    // iron ferrule where handle meets beam
    const fer = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.046, 0.05, 12), ironMat);
    fer.rotation.x = Math.PI / 2;
    place(cart, fer, sx * 0.45, beamY, -0.92);
  }
  // handle cross brace
  {
    const brace = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.9, 10), woodMat(0.08, 0.4, 0.38));
    brace.rotation.z = Math.PI / 2;
    place(cart, brace, 0, beamY, -1.5);
  }
  // cross beams under the floor
  for (const z of [-0.65, 0.0, 0.7, 1.0]) {
    plank(cart, 0.9, 0.05, 0.07, 0, 0.7, z, randWood(0.32, 0.4));
  }

  // axle
  {
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 2.0, 16), woodMat(0.07, 0.4, 0.3));
    axle.rotation.z = Math.PI / 2;
    place(cart, axle, 0, WHEEL_R, 0);
    for (const sx of [-1, 1]) {
      const washer = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.015, 16), darkIronMat);
      washer.rotation.z = Math.PI / 2;
      place(cart, washer, sx * 0.935, WHEEL_R, 0);
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.14, 8), ironMat);
      place(cart, pin, sx * 0.96, WHEEL_R, 0);
      // iron strap clamping beam to axle
      place(cart, new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.17, 0.05), ironMat), sx * 0.45, 0.64, 0);
      for (const dz of [-0.04, 0.04]) {
        const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.03, 8), darkIronMat);
        place(cart, bolt, sx * 0.45, 0.72, dz);
      }
    }
  }

  // ---------- front prop stand ----------
  {
    const z = 0.98;
    const footBottom = WHEEL_R + (-WHEEL_R + z * Math.sin(TILT)) / Math.cos(TILT);
    const top = 0.64;
    const len = top - footBottom - 0.0;
    for (const sx of [-1, 1]) {
      plank(cart, 0.06, len, 0.06, sx * 0.45, footBottom + len / 2, z, randWood(0.34, 0.42));
    }
    plank(cart, 1.0, 0.06, 0.12, 0, footBottom + 0.03, z, randWood(0.34, 0.42));
    // diagonal brace
    const dx = 0.84;
    const dy = len - 0.2;
    const diag = plank(cart, 0.04, Math.hypot(dx, dy), 0.03, 0, footBottom + len / 2, z + 0.045, randWood(0.34, 0.42));
    diag.rotation.z = -Math.atan2(dx, dy);
    for (const sx of [-1, 1]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.1, 8), ironMat);
      b.rotation.z = Math.PI / 2;
      place(cart, b, sx * 0.45, top - 0.05, z);
    }
  }

  // ---------- bed: floor planks ----------
  const FLOOR_N = 9;
  const floorW = 1.2;
  const pitch = floorW / FLOOR_N;
  for (let i = 0; i < FLOOR_N; i++) {
    const len = 1.86 + (rnd() - 0.5) * 0.08;
    const w = pitch - 0.008;
    const p = plank(cart, w, 0.04, len, -floorW / 2 + pitch * (i + 0.5), FLOOR_TOP - 0.02, (rnd() - 0.5) * 0.04);
    p.rotation.y = (rnd() - 0.5) * 0.012;
    p.rotation.z = (rnd() - 0.5) * 0.01;
    plankCount++;
  }

  // corner posts
  const postH = 0.63;
  const postY = FLOOR_TOP - 0.04 + postH / 2;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      plank(cart, 0.07, postH, 0.07, sx * 0.6, postY, sz * 0.9, randWood(0.3, 0.38));
      // iron cap on the post top
      place(cart, new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.025, 0.085), darkIronMat), sx * 0.6, postY + postH / 2 + 0.005, sz * 0.9);
    }
  }

  // side walls: three rails per side, end walls: three boards each
  const railY = [0.85, 1.03, 1.21];
  for (const sx of [-1, 1]) {
    for (const y of railY) {
      const len = 1.9 + (rnd() - 0.5) * 0.05;
      const p = plank(cart, 0.03, 0.15, len, sx * 0.65, y, (rnd() - 0.5) * 0.03);
      p.rotation.x = (rnd() - 0.5) * 0.012;
      plankCount++;
    }
  }
  for (const sz of [-1, 1]) {
    for (const y of railY) {
      const len = 1.2 + (rnd() - 0.5) * 0.03;
      const p = plank(cart, len, 0.15, 0.03, (rnd() - 0.5) * 0.02, y + (rnd() - 0.5) * 0.01, sz * 0.94);
      p.rotation.z = (rnd() - 0.5) * 0.015;
      plankCount++;
    }
  }

  // iron straps and bolts on the walls
  for (const sx of [-1, 1]) {
    for (const z of [-0.45, 0.45]) {
      place(cart, new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.56, 0.055), ironMat), sx * 0.670, 1.03, z);
      for (const y of [0.83, 0.95, 1.1, 1.23]) {
        const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.02, 8), darkIronMat);
        bolt.rotation.z = Math.PI / 2;
        place(cart, bolt, sx * 0.678, y, z);
      }
    }
  }
  for (const sz of [-1, 1]) {
    for (const x of [-0.3, 0.3]) {
      place(cart, new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.56, 0.01), ironMat), x, 1.03, sz * 0.960);
      for (const y of [0.85, 1.2]) {
        const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.02, 8), darkIronMat);
        bolt.rotation.x = Math.PI / 2;
        place(cart, bolt, x, y, sz * 0.968);
      }
    }
  }

  // ---------- wheels ----------
  const spinners: THREE.Group[] = [];
  let spokeCount = 0;
  const SPOKES = 12;
  for (const sx of [-1, 1]) {
    const outer = new THREE.Group();
    const spin = new THREE.Group();
    outer.add(spin);
    outer.rotation.y = Math.PI / 2;

    // hub
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.2, 20), woodMat(0.07, 0.4, 0.32));
    hub.rotation.x = Math.PI / 2;
    place(spin, hub, 0, 0, 0);
    for (const dz of [-0.085, 0.085]) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.108, 0.108, 0.03, 20), ironMat);
      band.rotation.x = Math.PI / 2;
      place(spin, band, 0, 0, dz);
    }
    const hubCap = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.215, 16), darkIronMat);
    hubCap.rotation.x = Math.PI / 2;
    place(spin, hubCap, 0, 0, 0);

    // felloes (wooden rim segments)
    const ro = 0.585;
    const ri = 0.5;
    const FEL = 6;
    for (let f = 0; f < FEL; f++) {
      const a0 = (f / FEL) * Math.PI * 2 + 0.01 + 0.26;
      const a1 = ((f + 1) / FEL) * Math.PI * 2 - 0.01 + 0.26;
      const shape = new THREE.Shape();
      shape.absarc(0, 0, ro, a0, a1, false);
      shape.absarc(0, 0, ri, a1, a0, true);
      const g = new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: false, curveSegments: 10 });
      g.translate(0, 0, -0.05);
      // planar UVs for grain
      const pos = g.attributes.position as THREE.BufferAttribute;
      const uv = g.attributes.uv as THREE.BufferAttribute;
      const off = rnd() * 3;
      for (let i = 0; i < pos.count; i++) {
        uv.setXY(i, pos.getX(i) * 1.2 + off, pos.getY(i) * 1.2 + pos.getZ(i) * 2);
      }
      place(spin, new THREE.Mesh(g, randWood(0.36, 0.48)), 0, 0, 0);
    }

    // iron tyre
    {
      const shape = new THREE.Shape();
      shape.absarc(0, 0, WHEEL_R, 0, Math.PI * 2, false);
      const hole = new THREE.Path();
      hole.absarc(0, 0, ro - 0.005, 0, Math.PI * 2, true);
      shape.holes.push(hole);
      const g = new THREE.ExtrudeGeometry(shape, { depth: 0.115, bevelEnabled: false, curveSegments: 64 });
      g.translate(0, 0, -0.0575);
      place(spin, new THREE.Mesh(g, ironMat), 0, 0, 0);
    }
    // nails on the felloe faces
    {
      const nailGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.02, 8);
      for (let n = 0; n < 18; n++) {
        const a = (n / 18) * Math.PI * 2;
        for (const dz of [-0.052, 0.052]) {
          const nail = new THREE.Mesh(nailGeo, darkIronMat);
          nail.rotation.x = Math.PI / 2;
          place(spin, nail, Math.cos(a) * 0.55, Math.sin(a) * 0.55, dz);
        }
      }
    }

    // spokes
    const spokeLen = 0.46;
    const spokeMid = 0.3;
    const spokeMat = woodMat(0.075, 0.4, 0.44);
    for (let s = 0; s < SPOKES; s++) {
      const a = (s / SPOKES) * Math.PI * 2;
      const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.03, spokeLen, 10), spokeMat);
      spoke.rotation.z = a - Math.PI / 2;
      place(spin, spoke, Math.cos(a) * spokeMid, Math.sin(a) * spokeMid, 0);
      spokeCount++;
    }

    place(cart, outer, sx * 0.82, WHEEL_R, 0);
    spinners.push(spin);
  }

  // ---------- cargo ----------
  const barrelProfile = (y: number): number => {
    const t = (y - 0.25) / 0.25;
    return 0.17 + 0.05 * (1 - t * t);
  };
  const makeBarrel = (): THREE.Group => {
    const g = new THREE.Group();
    const pts: THREE.Vector2[] = [new THREE.Vector2(0, 0)];
    for (let i = 0; i <= 12; i++) {
      const y = (i / 12) * 0.5;
      pts.push(new THREE.Vector2(barrelProfile(y), y));
    }
    pts.push(new THREE.Vector2(0.15, 0.485), new THREE.Vector2(0, 0.485));
    const body = new THREE.Mesh(new THREE.LatheGeometry(pts, 28), woodMat(0.075, 0.45, 0.36));
    g.add(body);
    for (const y of [0.07, 0.17, 0.33, 0.43]) {
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(barrelProfile(y) + 0.003, 0.011, 6, 28), darkIronMat);
      hoop.rotation.x = Math.PI / 2;
      hoop.position.y = y;
      g.add(hoop);
    }
    return g;
  };

  const makeSack = (tint: number): THREE.Group => {
    const g = new THREE.Group();
    const prof: [number, number][] = [
      [0, 0], [0.17, 0.0], [0.23, 0.05], [0.26, 0.15], [0.26, 0.28], [0.22, 0.4],
      [0.13, 0.48], [0.07, 0.53], [0.09, 0.58], [0.07, 0.64], [0.0, 0.65],
    ];
    const pts = prof.map(([r, y]) => new THREE.Vector2(r, y));
    const geo = new THREE.LatheGeometry(pts, 24, 0, Math.PI * 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const ang = Math.atan2(z, x);
      const bump = 1 + 0.07 * Math.sin(ang * 3 + y * 9) + 0.04 * Math.sin(ang * 5 - y * 14);
      const squash = 0.82;
      pos.setXYZ(i, x * bump, y, z * bump * squash);
    }
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({
      map: burlapTex,
      color: new THREE.Color().setHSL(0.11, 0.35, tint),
      roughness: 1,
    });
    g.add(new THREE.Mesh(geo, mat));
    const rope = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.014, 6, 16), new THREE.MeshStandardMaterial({ color: 0x6b5030, roughness: 1 }));
    rope.rotation.x = Math.PI / 2;
    rope.position.y = 0.53;
    g.add(rope);
    g.scale.setScalar(0.8);
    return g;
  };

  const makeCrate = (size: number, mat: THREE.MeshStandardMaterial, edgeMat: THREE.MeshStandardMaterial): THREE.Group => {
    const g = new THREE.Group();
    const s = size;
    const t = 0.045;
    const body = new THREE.Mesh(grainBox(s - 0.01, s - 0.01, s - 0.01), mat);
    body.position.y = s / 2;
    g.add(body);
    const half = s / 2;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const post = new THREE.Mesh(grainBox(t, s, t), edgeMat);
        post.position.set(sx * (half - t / 2 + 0.003), s / 2, sz * (half - t / 2 + 0.003));
        g.add(post);
      }
    }
    for (const yy of [t / 2, s - t / 2]) {
      for (const sg of [-1, 1]) {
        const bx = new THREE.Mesh(grainBox(s, t, t), edgeMat);
        bx.position.set(0, yy, sg * (half - t / 2 + 0.003));
        g.add(bx);
        const bz = new THREE.Mesh(grainBox(t, t, s), edgeMat);
        bz.position.set(sg * (half - t / 2 + 0.003), yy, 0);
        g.add(bz);
      }
    }
    // diagonal braces on the front and back
    const dl = Math.hypot(s, s) - 2 * t;
    for (const sg of [-1, 1]) {
      const d = new THREE.Mesh(grainBox(dl, t * 0.8, 0.02), edgeMat);
      d.position.set(0, s / 2, sg * (half + 0.003));
      d.rotation.z = Math.PI / 4;
      g.add(d);
    }
    return g;
  };

  const cargo = new THREE.Group();
  cart.add(cargo);

  // barrels at the front
  place(cargo, makeBarrel(), -0.3, FLOOR_TOP, 0.6);
  place(cargo, makeBarrel(), 0.3, FLOOR_TOP, 0.62);
  // crates in the middle
  const crateMat = woodMat(0.08, 0.35, 0.5);
  const crateEdge = woodMat(0.07, 0.4, 0.36);
  const c1 = place(cargo, makeCrate(0.42, crateMat, crateEdge), -0.33, FLOOR_TOP, -0.05);
  c1.rotation.y = 0.05;
  const c2 = place(cargo, makeCrate(0.4, woodMat(0.09, 0.3, 0.55), woodMat(0.07, 0.4, 0.38)), 0.3, FLOOR_TOP, -0.03);
  c2.rotation.y = 0.22;
  const c3 = place(cargo, makeCrate(0.26, crateMat, crateEdge), -0.31, FLOOR_TOP + 0.42, -0.07);
  c3.rotation.y = -0.35;
  // sacks at the rear
  const s1 = place(cargo, makeSack(0.62), -0.4, FLOOR_TOP, -0.62);
  s1.rotation.y = 0.4;
  const s2 = place(cargo, makeSack(0.68), 0.0, FLOOR_TOP, -0.66);
  s2.rotation.y = -0.3;
  s2.rotation.z = 0.04;
  const s3 = place(cargo, makeSack(0.58), 0.4, FLOOR_TOP, -0.6);
  s3.rotation.y = 1.1;

  // ---------- tilt around axle ----------
  const pivot = new THREE.Group();
  pivot.position.set(0, WHEEL_R, 0);
  pivot.rotation.x = TILT;
  cart.position.y = -WHEEL_R;
  pivot.add(cart);
  const root = new THREE.Group();
  root.add(pivot);

  return { root, spinners, wheelCount: spinners.length, spokeCount, plankCount };
}
