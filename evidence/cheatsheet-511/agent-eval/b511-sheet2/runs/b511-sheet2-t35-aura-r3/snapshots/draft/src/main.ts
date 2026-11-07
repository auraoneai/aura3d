import { camera, createAuraApp, effects, environments, geometry, lights, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

type V3 = [number, number, number];

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
  const f = (n: number): number => {
    const k = (n + h * 12) % 12;
    return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
};

interface CrystalSpec {
  sides: number;
  radius: number;
  height: number;
  tip: number;
  tiltX: number;
  tiltZ: number;
  hue: number;
  /** Position on the pedestal (before cluster rotation). */
  at: [number, number];
}

const SPECS: CrystalSpec[] = [
  { sides: 6, radius: 0.34, height: 1.9, tip: 0.7, tiltX: 0.05, tiltZ: -0.08, hue: 0.52, at: [0, 0] },
  { sides: 6, radius: 0.24, height: 1.3, tip: 0.5, tiltX: 0.42, tiltZ: 0.1, hue: 0.74, at: [0.38, 0.12] },
  { sides: 5, radius: 0.28, height: 1.55, tip: 0.55, tiltX: -0.2, tiltZ: 0.5, hue: 0.9, at: [-0.34, 0.12] },
  { sides: 7, radius: 0.2, height: 0.95, tip: 0.4, tiltX: -0.5, tiltZ: -0.3, hue: 0.62, at: [0.12, -0.42] },
  { sides: 5, radius: 0.18, height: 0.8, tip: 0.38, tiltX: 0.55, tiltZ: -0.55, hue: 0.0, at: [-0.5, -0.32] },
  { sides: 6, radius: 0.16, height: 0.6, tip: 0.3, tiltX: 0.2, tiltZ: 0.8, hue: 0.45, at: [0.62, -0.3] },
  { sides: 6, radius: 0.15, height: 0.7, tip: 0.3, tiltX: -0.75, tiltZ: 0.25, hue: 0.82, at: [0.0, 0.52] }
];

const buildCrystal = (spec: CrystalSpec) => {
  const { sides, radius, height, tip, tiltX, tiltZ, hue } = spec;
  const tilt = (p: V3): V3 => {
    // rotate about X, then about Z; the base stays near the origin
    const cx = Math.cos(tiltX), sx = Math.sin(tiltX);
    const y1 = p[1] * cx - p[2] * sx, z1 = p[1] * sx + p[2] * cx;
    const cz = Math.cos(tiltZ), sz = Math.sin(tiltZ);
    return [p[0] * cz - y1 * sz, p[0] * sz + y1 * cz, z1];
  };
  const bottom: V3[] = [];
  const top: V3[] = [];
  for (let i = 0; i < sides; i += 1) {
    const a = (i / sides) * Math.PI * 2 + 0.3;
    bottom.push(tilt([Math.cos(a) * radius, 0, Math.sin(a) * radius]));
    top.push(tilt([Math.cos(a) * radius, height, Math.sin(a) * radius]));
  }
  const apex = tilt([0, height + tip, 0]);
  const bottomCenter = tilt([0, 0, 0]);
  const center = tilt([0, (height + tip) * 0.4, 0]);

  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  let face = 0;
  const addTri = (a: V3, b: V3, c: V3): void => {
    let n = cross(sub(b, a), sub(c, a));
    const mid: V3 = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    let q = c;
    let r = b;
    if (dot(n, sub(mid, center)) < 0) {
      // flip so the triangle is counter-clockwise seen from outside
      q = b;
      r = c;
      n = cross(sub(r, a), sub(q, a));
    }
    const nn = norm(n);
    const base = pos.length / 3;
    for (const p of [a, r, q]) {
      pos.push(p[0], p[1], p[2]);
      nor.push(nn[0], nn[1], nn[2]);
    }
    idx.push(base, base + 1, base + 2);
  };
  const paint = (count: number): void => {
    // one distinct colour per face (a face may be several triangles)
    const h = (hue + face * 0.055) % 1;
    const l = 0.38 + 0.2 * ((face * 0.37) % 1);
    const [r, g, b] = hslToRgb(h, 0.75, l);
    for (let k = 0; k < count; k += 1) col.push(r, g, b, 1);
    face += 1;
  };
  for (let i = 0; i < sides; i += 1) {
    const j = (i + 1) % sides;
    addTri(bottom[i]!, bottom[j]!, top[j]!);
    addTri(bottom[i]!, top[j]!, top[i]!);
    paint(6);
  }
  for (let i = 0; i < sides; i += 1) {
    const j = (i + 1) % sides;
    addTri(top[i]!, top[j]!, apex);
    paint(3);
  }
  for (let i = 0; i < sides; i += 1) {
    addTri(bottomCenter, bottom[(i + 1) % sides]!, bottom[i]!);
  }
  paint(3 * sides);

  const positions = new Float32Array(pos);
  return geometry.define({
    positions,
    normals: new Float32Array(nor),
    colors: new Float32Array(col),
    indices: idx,
    bounds: geometry.computeBounds({ positions })
  });
};

const crystalMat = material.pbr({ color: "#ffffff", roughness: 0.22, metallic: 0.15 });

let sceneBuilder = scene({ background: "#04050b" })
  .add(environments.neutral({ intensity: 0.12, background: false }))
  .add(lights.directional({ name: "key", position: [3, 4, 5], target: [0, 1, 0], intensity: 0.6, color: "#9fb4ff", shadow: false }))
  .add(lights.directional({ name: "rim-cyan", position: [-5, 3, -5], target: [0, 1, 0], intensity: 4.5, color: "#45d6ff", shadow: false }))
  .add(lights.directional({ name: "rim-magenta", position: [5, 2.5, -4], target: [0, 1, 0], intensity: 4.0, color: "#ff4fd0", shadow: false }))
  .add(lights.point({ name: "glow", position: [0, 0.6, 0.8], intensity: 5, color: "#8a6bff", distance: 7, decay: 2, shadow: false }))
  .add(primitives.cylinder({ name: "ground", size: [5.2, 0.1, 5.2], material: material.pbr({ color: "#10131c", roughness: 0.6, metallic: 0.3 }) }).position(0, -0.25, 0))
  .add(primitives.cylinder({ name: "pedestal", size: [2.2, 0.3, 2.2], material: material.pbr({ color: "#1c2030", roughness: 0.35, metallic: 0.6 }) }).position(0, -0.1, 0))
  .add(primitives.cylinder({ name: "pedestal-top", size: [1.9, 0.06, 1.9], material: material.pbr({ color: "#2a3050", roughness: 0.25, metallic: 0.7 }) }).position(0, 0.07, 0));

SPECS.forEach((spec, i) => {
  sceneBuilder = sceneBuilder.add(
    geometry.custom(buildCrystal(spec), { name: `crystal-${i}`, material: crystalMat })
      .position(spec.at[0], 0.08, spec.at[1])
      .runtime({ id: `crystal-${i}`, mutable: true })
  );
});

// Glittering sparks rising around the cluster
const SPARK_RING = 6;
for (let i = 0; i < SPARK_RING; i += 1) {
  const a = (i / SPARK_RING) * Math.PI * 2;
  sceneBuilder = sceneBuilder.add(
    effects.particles({
      name: `sparks-${i}`,
      position: [Math.cos(a) * 1.0, 0.15, Math.sin(a) * 1.0],
      rate: 7,
      maxParticles: 40,
      lifetime: [2.2, 3.8],
      speed: [0.35, 0.8],
      size: [0.03, 0.07],
      gravity: 0,
      drag: 0.05,
      blend: "additive",
      seed: 21 + i,
      color: i % 3 === 0 ? "#7fe6ff" : i % 3 === 1 ? "#ff8fe6" : "#fff2c0"
    })
  );
}
sceneBuilder = sceneBuilder
  .add(effects.bloom({ intensity: 0.55, threshold: 0.7, radius: 0.5 }))
  .camera(camera.perspective({ position: [0, 2.3, 6.2], target: [0, 1.0, 0], fov: 38 }));

const app = createAuraApp("#app", { scene: sceneBuilder });

app.onFrame((f) => {
  const angle = f.time * 0.3;
  const c = Math.cos(angle), s = Math.sin(angle);
  SPECS.forEach((spec, i) => {
    const [x, z] = spec.at;
    // rotate the base position about the cluster axis; the crystal turns with it
    app.nodes.require(`crystal-${i}`).setPosition(x * c + z * s, 0.08, -x * s + z * c).setRotation(0, angle, 0);
  });
});

await app.ready();
requestAnimationFrame(() => {
  window.__EVAL_READY__ = true;
});
