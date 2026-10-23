/**
 * threejs-parity §5.2 lane L2-01/02/06 (SG-03/SG-04) — for every widened
 * primitive kind × 3 parameter sets: vertex count, index count and bounds
 * equal three.js 0.185.1, positions within 1e-6 (index/uv compared exactly).
 *
 * Curve inputs use three's own `CatmullRomCurve3`: `resolveCurve3` wraps any
 * `{ getPoint(t) }` sampler in the three-exact `Curve3Adapter`
 * (arc-length table + Frenet frames), so identical curve objects on both
 * sides keep the comparison honest.
 */

import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { ConvexGeometry } from "three/examples/jsm/geometries/ConvexGeometry.js";
import {
  circleParityMesh,
  coneParityMesh,
  convexParityMesh,
  edgesParityMesh,
  extrudeParityMesh,
  latheParityMesh,
  polyhedronParityMesh,
  ringParityMesh,
  roundedBoxParityMesh,
  shapeParityMesh,
  torusKnotParityMesh,
  tubeParityMesh,
  wireframeParityMesh,
  createPrimitiveGeometry,
  type ParityMesh,
  type PolyhedronVariant
} from "@aura3d/rendering";
import { geometry } from "../../../packages/engine/src/agent-api/nodes/geometry";
import { primitives } from "../../../packages/engine/src/agent-api/nodes/primitives";
import { AuraRuntimeError } from "../../../packages/engine/src/agent-api/compiler/errors";
import { normalizeGeometryAttributes } from "../../../packages/engine/src/agent-api/RootGeometry";

const EPS = 1e-6;

function arr(source: ArrayLike<number>): number[] {
  return Array.from(source as ArrayLike<number>);
}

function bounds(positions: ArrayLike<number>): { min: number[]; max: number[] } {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let c = 0; c < 3; c += 1) {
      const value = positions[i + c]!;
      if (value < min[c]!) min[c] = value;
      if (value > max[c]!) max[c] = value;
    }
  }
  return { min, max };
}

function assertParity(name: string, mesh: ParityMesh, geo: THREE.BufferGeometry): void {
  const threePos = arr((geo.getAttribute("position") as THREE.BufferAttribute).array);
  const threeUv = geo.getAttribute("uv") ? arr((geo.getAttribute("uv") as THREE.BufferAttribute).array) : undefined;
  const threeIdx = geo.getIndex() ? arr((geo.getIndex() as THREE.BufferAttribute).array).map(Number) : undefined;

  // counts
  expect(mesh.positions.length, `${name}: vertex component count`).toBe(threePos.length);
  if (threeIdx !== undefined) {
    expect(mesh.indices?.length ?? 0, `${name}: index count`).toBe(threeIdx.length);
  } else {
    expect(mesh.indices === undefined || mesh.indices.length === 0, `${name}: three is non-indexed`).toBe(true);
  }

  // bounds
  const ours = bounds(mesh.positions);
  const theirs = bounds(threePos);
  for (let c = 0; c < 3; c += 1) {
    expect(ours.min[c], `${name}: bounds.min[${c}]`).toBeCloseTo(theirs.min[c]!, 6);
    expect(ours.max[c], `${name}: bounds.max[${c}]`).toBeCloseTo(theirs.max[c]!, 6);
  }

  // positions within 1e-6
  for (let i = 0; i < threePos.length; i += 1) {
    expect(Math.abs(mesh.positions[i]! - threePos[i]!), `${name}: position[${i}]`).toBeLessThanOrEqual(EPS);
  }

  // uvs within 1e-6
  if (threeUv !== undefined && mesh.uvs !== undefined) {
    expect(mesh.uvs.length, `${name}: uv component count`).toBe(threeUv.length);
    for (let i = 0; i < threeUv.length; i += 1) {
      expect(Math.abs(mesh.uvs[i]! - threeUv[i]!), `${name}: uv[${i}]`).toBeLessThanOrEqual(EPS);
    }
  }

  // index order exact
  if (threeIdx !== undefined && mesh.indices !== undefined) {
    for (let i = 0; i < threeIdx.length; i += 1) {
      expect(mesh.indices[i], `${name}: index[${i}]`).toBe(threeIdx[i]);
    }
  }
}

function assertNormalsParity(name: string, mesh: ParityMesh, geo: THREE.BufferGeometry, eps = 1e-5): void {
  if (!mesh.normals) return;
  const threeNor = arr((geo.getAttribute("normal") as THREE.BufferAttribute).array);
  expect(mesh.normals.length, `${name}: normal component count`).toBe(threeNor.length);
  for (let i = 0; i < threeNor.length; i += 1) {
    expect(Math.abs(mesh.normals[i]! - threeNor[i]!), `${name}: normal[${i}]`).toBeLessThanOrEqual(eps);
  }
}

describe("SG-03 primitive parity vs three 0.185.1", () => {
  it("cone ×3 param sets", () => {
    assertParity("cone(1,2,8,2)", coneParityMesh({ radius: 1, height: 2, radialSegments: 8, heightSegments: 2 }), new THREE.ConeGeometry(1, 2, 8, 2));
    assertParity("cone(0.5,1,32,1,open)", coneParityMesh({ radius: 0.5, height: 1, radialSegments: 32, heightSegments: 1, openEnded: true }), new THREE.ConeGeometry(0.5, 1, 32, 1, true));
    assertParity("cone(2,3,5,4,θ)", coneParityMesh({ radius: 2, height: 3, radialSegments: 5, heightSegments: 4, thetaStart: 0.5, thetaLength: 4 }), new THREE.ConeGeometry(2, 3, 5, 4, false, 0.5, 4));
    assertNormalsParity("cone(1,2,8,2)", coneParityMesh({ radius: 1, height: 2, radialSegments: 8, heightSegments: 2 }), new THREE.ConeGeometry(1, 2, 8, 2));
  });

  it("circle ×3 param sets", () => {
    assertParity("circle(1,16)", circleParityMesh({ radius: 1, segments: 16 }), new THREE.CircleGeometry(1, 16));
    assertParity("circle(2.5,8,0.3,4)", circleParityMesh({ radius: 2.5, segments: 8, thetaStart: 0.3, thetaLength: 4 }), new THREE.CircleGeometry(2.5, 8, 0.3, 4));
    assertParity("circle(0.5,64)", circleParityMesh({ radius: 0.5, segments: 64 }), new THREE.CircleGeometry(0.5, 64));
  });

  it("ring ×3 param sets", () => {
    assertParity("ring(0.5,1,8)", ringParityMesh({ innerRadius: 0.5, outerRadius: 1, thetaSegments: 8 }), new THREE.RingGeometry(0.5, 1, 8));
    assertParity("ring(0.2,2,16,3,0.4,5)", ringParityMesh({ innerRadius: 0.2, outerRadius: 2, thetaSegments: 16, phiSegments: 3, thetaStart: 0.4, thetaLength: 5 }), new THREE.RingGeometry(0.2, 2, 16, 3, 0.4, 5));
    assertParity("ring(1,1.5,32,2)", ringParityMesh({ innerRadius: 1, outerRadius: 1.5, thetaSegments: 32, phiSegments: 2 }), new THREE.RingGeometry(1, 1.5, 32, 2));
  });

  it("torusKnot ×3 param sets", () => {
    assertParity("torusKnot(1,0.4,64,8)", torusKnotParityMesh({ radius: 1, tube: 0.4, tubularSegments: 64, radialSegments: 8 }), new THREE.TorusKnotGeometry(1, 0.4, 64, 8));
    assertParity("torusKnot(0.7,0.2,48,6,3,4)", torusKnotParityMesh({ radius: 0.7, tube: 0.2, tubularSegments: 48, radialSegments: 6, p: 3, q: 4 }), new THREE.TorusKnotGeometry(0.7, 0.2, 48, 6, 3, 4));
    assertParity("torusKnot(2,0.5,24,10,4,5)", torusKnotParityMesh({ radius: 2, tube: 0.5, tubularSegments: 24, radialSegments: 10, p: 4, q: 5 }), new THREE.TorusKnotGeometry(2, 0.5, 24, 10, 4, 5));
  });

  const variants: Record<PolyhedronVariant, (r: number, d: number) => THREE.BufferGeometry> = {
    tetrahedron: (r, d) => new THREE.TetrahedronGeometry(r, d),
    octahedron: (r, d) => new THREE.OctahedronGeometry(r, d),
    icosahedron: (r, d) => new THREE.IcosahedronGeometry(r, d),
    dodecahedron: (r, d) => new THREE.DodecahedronGeometry(r, d)
  };

  it.each(Object.keys(variants) as PolyhedronVariant[])("polyhedron %s ×3 param sets", (variant) => {
    const make = variants[variant];
    for (const [radius, detail] of [[1, 0], [0.7, 2], [1.5, 3]] as const) {
      const mesh = polyhedronParityMesh({ radius, detail, variant });
      const geo = make(radius, detail);
      assertParity(`polyhedron(${variant},${radius},${detail})`, mesh, geo);
      assertNormalsParity(`polyhedron(${variant},${radius},${detail})`, mesh, geo);
    }
  });

  it("roundedBox ×3 param sets", () => {
    assertParity("roundedBox(1,1,1,2,0.1)", roundedBoxParityMesh({ width: 1, height: 1, depth: 1, segments: 2, radius: 0.1 }), new RoundedBoxGeometry(1, 1, 1, 2, 0.1));
    assertParity("roundedBox(2,1,0.5,3,0.2)", roundedBoxParityMesh({ width: 2, height: 1, depth: 0.5, segments: 3, radius: 0.2 }), new RoundedBoxGeometry(2, 1, 0.5, 3, 0.2));
    assertParity("roundedBox(1.5,2,1,4,0.15)", roundedBoxParityMesh({ width: 1.5, height: 2, depth: 1, segments: 4, radius: 0.15 }), new RoundedBoxGeometry(1.5, 2, 1, 4, 0.15));
  });
});

describe("SG-03 curve/shape primitive parity vs three 0.185.1", () => {
  const lathePts = [
    [0, 0], [0.4, 0.1], [0.5, 0.4], [0.2, 0.9], [0.35, 1.2], [0, 1.3]
  ] as const;

  it("lathe ×3 param sets", () => {
    const vec2 = lathePts.map((p) => new THREE.Vector2(p[0], p[1]));
    assertParity("lathe(6pt,12)", latheParityMesh({ points: lathePts as unknown as readonly (readonly [number, number])[], segments: 12 }), new THREE.LatheGeometry(vec2, 12));
    assertParity("lathe(6pt,24,0.5,4)", latheParityMesh({ points: lathePts as unknown as readonly (readonly [number, number])[], segments: 24, phiStart: 0.5, phiLength: 4 }), new THREE.LatheGeometry(vec2, 24, 0.5, 4));
    assertParity("lathe(6pt,4,π/2)", latheParityMesh({ points: lathePts as unknown as readonly (readonly [number, number])[], segments: 4, phiStart: Math.PI / 2, phiLength: Math.PI }), new THREE.LatheGeometry(vec2, 4, Math.PI / 2, Math.PI));
  });

  const star: [number, number][] = [];
  for (let i = 0; i < 10; i += 1) {
    const a = (i / 10) * Math.PI * 2;
    const r = i % 2 === 0 ? 1 : 0.45;
    star.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const starShape = new THREE.Shape(star.map((p) => new THREE.Vector2(p[0], p[1])));

  const square: [number, number][] = [[0, 0], [2, 0], [2, 1.5], [1, 1.8], [0, 1.5]];
  const squareShape = new THREE.Shape(square.map((p) => new THREE.Vector2(p[0], p[1])));

  const outer: [number, number][] = [[0, 0], [4, 0], [4, 3], [0, 3]];
  const hole: [number, number][] = [[1, 1], [3, 1], [3, 2], [1, 2]];
  const holedShape = new THREE.Shape(outer.map((p) => new THREE.Vector2(p[0], p[1])));
  holedShape.holes.push(new THREE.Path(hole.map((p) => new THREE.Vector2(p[0], p[1]))));
  const holedInput = { points: outer as readonly (readonly [number, number])[], holes: [hole as readonly (readonly [number, number])[]] };

  it("shape ×3 param sets", () => {
    assertParity("shape(star)", shapeParityMesh({ shape: star }), new THREE.ShapeGeometry(starShape));
    assertParity("shape(square)", shapeParityMesh({ shape: square }), new THREE.ShapeGeometry(squareShape));
    assertParity("shape(holed)", shapeParityMesh({ shape: holedInput }), new THREE.ShapeGeometry(holedShape));
    assertNormalsParity("shape(star)", shapeParityMesh({ shape: star }), new THREE.ShapeGeometry(starShape));
  });

  it("extrude ×3 param sets", () => {
    assertParity(
      "extrude(star,depth1,noBevel)",
      extrudeParityMesh({ shape: star, depth: 1, steps: 1, bevelEnabled: false }),
      new THREE.ExtrudeGeometry(starShape, { depth: 1, steps: 1, bevelEnabled: false })
    );
    assertParity(
      "extrude(star,depth2,bevel)",
      extrudeParityMesh({ shape: star, depth: 2, steps: 2, bevelEnabled: true, bevelThickness: 0.3, bevelSize: 0.2, bevelSegments: 2 }),
      new THREE.ExtrudeGeometry(starShape, { depth: 2, steps: 2, bevelEnabled: true, bevelThickness: 0.3, bevelSize: 0.2, bevelSegments: 2 })
    );
    assertParity(
      "extrude(holed,defaults)",
      extrudeParityMesh({ shape: holedInput }),
      new THREE.ExtrudeGeometry(holedShape, {})
    );
    assertNormalsParity("extrude(star,depth2,bevel)", extrudeParityMesh({ shape: star, depth: 2, steps: 2, bevelEnabled: true, bevelThickness: 0.3, bevelSize: 0.2, bevelSegments: 2 }), new THREE.ExtrudeGeometry(starShape, { depth: 2, steps: 2, bevelEnabled: true, bevelThickness: 0.3, bevelSize: 0.2, bevelSegments: 2 }));
  });

  it("extrude with extrudePath matches three", () => {
    const pathPoints = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0.5, 0.8),
      new THREE.Vector3(0.4, 1.2, 1.4),
      new THREE.Vector3(-0.3, 2, 2)
    ];
    const pathA = new THREE.CatmullRomCurve3(pathPoints);
    const pathB = new THREE.CatmullRomCurve3(pathPoints);
    assertParity(
      "extrude(square,path,steps6)",
      extrudeParityMesh({ shape: square, steps: 6, extrudePath: pathA }),
      new THREE.ExtrudeGeometry(squareShape, { steps: 6, extrudePath: pathB, bevelEnabled: false })
    );
  });

  it("tube ×3 param sets", () => {
    const mkPath = () => new THREE.CatmullRomCurve3([
      new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(-0.5, 0.6, 0.4),
      new THREE.Vector3(0.4, -0.3, -0.5),
      new THREE.Vector3(1, 0.2, 0.3)
    ]);
    assertParity("tube(cr,32,0.2,8)", tubeParityMesh({ path: mkPath(), tubularSegments: 32, radius: 0.2, radialSegments: 8 }), new THREE.TubeGeometry(mkPath(), 32, 0.2, 8));
    assertParity("tube(cr,16,0.35,5,closed)", tubeParityMesh({ path: mkPath(), tubularSegments: 16, radius: 0.35, radialSegments: 5, closed: true }), new THREE.TubeGeometry(mkPath(), 16, 0.35, 5, true));
    assertParity("tube(cr,48,0.1,12)", tubeParityMesh({ path: mkPath(), tubularSegments: 48, radius: 0.1, radialSegments: 12 }), new THREE.TubeGeometry(mkPath(), 48, 0.1, 12));
    assertNormalsParity("tube(cr,32,0.2,8)", tubeParityMesh({ path: mkPath(), tubularSegments: 32, radius: 0.2, radialSegments: 8 }), new THREE.TubeGeometry(mkPath(), 32, 0.2, 8));
  });
});

describe("SG-04 edges/wireframe parity vs three 0.185.1", () => {
  const boxGeo = new THREE.BoxGeometry(2, 1, 1, 2, 1, 1);
  const boxPos = arr((boxGeo.getAttribute("position") as THREE.BufferAttribute).array);
  const boxIdx = arr((boxGeo.getIndex() as THREE.BufferAttribute).array);

  const sphereGeo = new THREE.SphereGeometry(1, 12, 8);
  const spherePos = arr((sphereGeo.getAttribute("position") as THREE.BufferAttribute).array);
  const sphereIdx = arr((sphereGeo.getIndex() as THREE.BufferAttribute).array);

  const icosa = new THREE.IcosahedronGeometry(1, 0);
  const icosaPos = arr((icosa.getAttribute("position") as THREE.BufferAttribute).array);

  it("edges segment counts + positions equal three", () => {
    for (const angle of [1, 30, 60]) {
      const ours = edgesParityMesh({ positions: boxPos, indices: boxIdx }, angle);
      const theirs = new THREE.EdgesGeometry(boxGeo, angle);
      const theirPos = arr((theirs.getAttribute("position") as THREE.BufferAttribute).array);
      expect(ours.positions.length, `edges(box,${angle}) vertex count`).toBe(theirPos.length);
      for (let i = 0; i < theirPos.length; i += 1) {
        expect(Math.abs(ours.positions[i]! - theirPos[i]!), `edges(box,${angle}) pos[${i}]`).toBeLessThanOrEqual(EPS);
      }
    }
    // non-indexed input path
    const oursN = edgesParityMesh({ positions: icosaPos }, 1);
    const theirsN = new THREE.EdgesGeometry(icosa, 1);
    const theirN = arr((theirsN.getAttribute("position") as THREE.BufferAttribute).array);
    expect(oursN.positions.length).toBe(theirN.length);
  });

  it("wireframe segment counts + positions equal three", () => {
    const ours = wireframeParityMesh({ positions: boxPos, indices: boxIdx });
    const theirs = new THREE.WireframeGeometry(boxGeo);
    const theirPos = arr((theirs.getAttribute("position") as THREE.BufferAttribute).array);
    expect(ours.positions.length).toBe(theirPos.length);
    for (let i = 0; i < theirPos.length; i += 1) {
      expect(Math.abs(ours.positions[i]! - theirPos[i]!), `wireframe(box) pos[${i}]`).toBeLessThanOrEqual(EPS);
    }

    const oursS = wireframeParityMesh({ positions: spherePos, indices: sphereIdx });
    const theirsS = new THREE.WireframeGeometry(sphereGeo);
    const theirS = arr((theirsS.getAttribute("position") as THREE.BufferAttribute).array);
    expect(oursS.positions.length).toBe(theirS.length);

    const oursN = wireframeParityMesh({ positions: icosaPos });
    const theirsN = new THREE.WireframeGeometry(icosa);
    const theirN = arr((theirsN.getAttribute("position") as THREE.BufferAttribute).array);
    expect(oursN.positions.length).toBe(theirN.length);
  });
});

describe("AD-07 convex geometry parity vs three 0.185.1 (L2-07)", () => {
  function seededPoints(seed: number, count: number, scale: number): THREE.Vector3[] {
    let st = seed >>> 0;
    const rand = (): number => {
      st = (st + 0x6d2b79f5) >>> 0;
      let t = st;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const out: THREE.Vector3[] = [];
    for (let i = 0; i < count; i += 1) out.push(new THREE.Vector3((rand() * 2 - 1) * scale, (rand() * 2 - 1) * scale, (rand() * 2 - 1) * scale));
    return out;
  }

  for (const [seed, count, scale] of [[0x1c0de, 1000, 10], [0xbeef, 64, 3], [0x5eed, 300, 25]] as const) {
    it(`convexParityMesh ${count} pts: vertex count, normals and positions equal ConvexGeometry`, () => {
      const pts = seededPoints(seed, count, scale);
      const theirs = new ConvexGeometry(pts);
      const theirPos = arr((theirs.getAttribute("position") as THREE.BufferAttribute).array);
      const theirNorm = arr((theirs.getAttribute("normal") as THREE.BufferAttribute).array);
      const ours = convexParityMesh({ points: pts.map((p) => [p.x, p.y, p.z] as const) });
      expect(theirPos.length).toBeGreaterThan(0);
      expect(ours.positions.length).toBe(theirPos.length);
      expect(ours.normals!.length).toBe(theirNorm.length);
      expect(ours.indices).toBeUndefined();
      for (let i = 0; i < theirPos.length; i += 1) {
        expect(Math.abs(ours.positions[i]! - theirPos[i]!), `pos[${i}]`).toBeLessThanOrEqual(EPS);
        expect(Math.abs(ours.normals![i]! - theirNorm[i]!), `normal[${i}]`).toBeLessThanOrEqual(EPS);
      }
      const ob = bounds(ours.positions);
      const tb = bounds(theirPos);
      for (let c = 0; c < 3; c += 1) {
        expect(Math.abs(ob.min[c]! - tb.min[c]!)).toBeLessThanOrEqual(EPS);
        expect(Math.abs(ob.max[c]! - tb.max[c]!)).toBeLessThanOrEqual(EPS);
      }
    });
  }

  it("geometry.convex returns a non-indexed custom-geometry spec with the same counts", () => {
    const pts = seededPoints(0x1c0de, 1000, 10);
    const theirs = new ConvexGeometry(pts);
    const spec = geometry.convex(pts.map((p) => ({ x: p.x, y: p.y, z: p.z })));
    const flat = normalizeGeometryAttributes(spec);
    expect(spec.kind).toBe("aura-custom-geometry");
    expect(flat.positions.length).toBe((theirs.getAttribute("position") as THREE.BufferAttribute).array.length);
    expect(flat.indices?.length ?? 0).toBe(0);
  });

  it("geometry.convex rejects <4 and degenerate input", () => {
    expect(() => geometry.convex([[0, 0, 0], [1, 0, 0], [0, 1, 0]])).toThrow(/at least four/);
    expect(() => geometry.convex([[0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0]])).toThrow();
  });
});

describe("AD-06 geometry.toNonIndexed is public and matches three (R-13)", () => {
  it("expands positions/normals/uvs exactly like BufferGeometry.toNonIndexed", () => {
    const box = new THREE.BoxGeometry(2, 1, 1, 2, 2, 1);
    const spec = geometry.define({
      positions: arr((box.getAttribute("position") as THREE.BufferAttribute).array),
      normals: arr((box.getAttribute("normal") as THREE.BufferAttribute).array),
      uvs: arr((box.getAttribute("uv") as THREE.BufferAttribute).array),
      indices: arr((box.getIndex() as THREE.BufferAttribute).array)
    });
    const theirs = box.toNonIndexed();
    const ours = normalizeGeometryAttributes(geometry.toNonIndexed(spec));
    const tp = arr((theirs.getAttribute("position") as THREE.BufferAttribute).array);
    const tn = arr((theirs.getAttribute("normal") as THREE.BufferAttribute).array);
    const tu = arr((theirs.getAttribute("uv") as THREE.BufferAttribute).array);
    expect(ours.positions.length).toBe(tp.length);
    expect(ours.normals!.length).toBe(tn.length);
    expect(ours.uvs!.length).toBe(tu.length);
    expect(ours.indices?.length ?? 0).toBe(0);
    for (let i = 0; i < tp.length; i += 1) expect(Math.abs(ours.positions[i]! - tp[i]!)).toBeLessThanOrEqual(EPS);
    for (let i = 0; i < tn.length; i += 1) expect(Math.abs(ours.normals![i]! - tn[i]!)).toBeLessThanOrEqual(EPS);
    for (let i = 0; i < tu.length; i += 1) expect(Math.abs(ours.uvs![i]! - tu[i]!)).toBeLessThanOrEqual(EPS);
  });

  it("returns the spec unchanged when already non-indexed", () => {
    const spec = geometry.define({ positions: [[0, 0, 0], [1, 0, 0], [0, 1, 0]], indices: [] });
    expect(geometry.toNonIndexed(spec)).toBe(spec);
  });
});

describe("primitives.box/sphere/plane/cylinder/capsule/torus params are never silently ignored", () => {
  const tier = { primitiveSegments: "full" } as const;
  const count = (kind: "sphere" | "cylinder" | "capsule" | "torus" | "box" | "plane", params?: object): number =>
    createPrimitiveGeometry(kind, params, tier).vertexBuffer.vertexCount;

  it("supported tessellation params change the generated geometry", () => {
    expect(count("sphere", { widthSegments: 8, heightSegments: 4 })).toBe((8 + 1) * (4 + 1));
    expect(count("sphere", { widthSegments: 16, heightSegments: 8 })).toBeGreaterThan(count("sphere", { widthSegments: 8, heightSegments: 4 }));
    expect(count("cylinder", { radialSegments: 8 })).toBeLessThan(count("cylinder", { radialSegments: 24 }));
    expect(count("capsule", { radialSegments: 8, capSegments: 2 })).toBeLessThan(count("capsule", { radialSegments: 24, capSegments: 6 }));
    expect(count("torus", { radialSegments: 8, tubularSegments: 4 })).toBeLessThan(count("torus", { radialSegments: 24, tubularSegments: 12 }));
    expect(count("box", { widthSegments: 3 })).toBeGreaterThan(count("box"));
    expect(count("plane", { widthSegments: 4, heightSegments: 4 })).toBe(25);
    const tapered = Array.from(createPrimitiveGeometry("cylinder", { radiusTop: 0 }, tier).vertexBuffer.floats);
    const straight = Array.from(createPrimitiveGeometry("cylinder", {}, tier).vertexBuffer.floats);
    expect(tapered).not.toEqual(straight);
  });

  it("params that cannot take effect throw a named error that points at `size`", () => {
    for (const [kind, factory] of [
      ["sphere", primitives.sphere],
      ["cylinder", primitives.cylinder],
      ["capsule", primitives.capsule]
    ] as const) {
      let error: unknown;
      try {
        factory({ params: { radius: 0.15 } });
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(AuraRuntimeError);
      expect((error as AuraRuntimeError).code).toBe("invalid-primitive-params");
      expect((error as AuraRuntimeError).message).toContain(`primitives.${kind}`);
      expect((error as AuraRuntimeError).message).toContain('"radius"');
      expect((error as AuraRuntimeError).message).toContain("size:");
    }
    expect(() => primitives.box({ params: { depth: 2, height: 3 } })).toThrowError(/"depth", "height" have no effect/);
    expect(() => primitives.torus({ params: { radius: 1 } })).toThrowError(AuraRuntimeError);
  });

  it("supported params, no params, and the SG-03 kinds still build", () => {
    expect(() => primitives.sphere({ params: { widthSegments: 12, heightSegments: 6 } })).not.toThrow();
    expect(() => primitives.cylinder({ params: { radiusTop: 0.5, radiusBottom: 0.25, openEnded: true } })).not.toThrow();
    expect(() => primitives.capsule()).not.toThrow();
    expect(() => primitives.cone({ params: { radius: 2, height: 3 } })).not.toThrow();
    expect(() => primitives.ring({ params: { innerRadius: 0.2, outerRadius: 1 } })).not.toThrow();
  });
});
