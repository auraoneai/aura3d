#!/usr/bin/env node
// Partitions Wonder World's 6 cast GLBs + 9 wheeled/hinged prop GLBs into named glTF SceneNodes
// matching `SubPartId` (`TypedGLBActor.part(name)` in @aura3d/engine@5.5.1) (WP-2).
//
// Rest-pose invariant:
//   Every partitioned vertex's world-space position and normal in the rest pose (`rotation = [0,0,0]`
//   on every SubPartId node) matches the original single-mesh GLB within `< 1e-5` (verified by
//   re-reading the written binary GLB via NodeIO and asserting triangle-by-triangle world-space
//   equivalence + bounding-box equivalence + intact UVs).
//
//   node apps/veer-wonder-world/tools/build-articulated-cast.mjs [--only key1,key2] [--force]
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const app = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = join(app, "..", "..");
const rootRequire = createRequire(join(repo, "package.json"));
const { Document, NodeIO } = rootRequire("@gltf-transform/core");
const { ALL_EXTENSIONS } = rootRequire("@gltf-transform/extensions");
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

const modelsDir = join(app, "src", "assets", "models");
const provDir = join(app, "provenance", "models");

const args = process.argv.slice(2);
const only = args.includes("--only") ? new Set(args[args.indexOf("--only") + 1].split(",")) : null;
const force = args.includes("--force");

const SQRT1_2 = Math.SQRT1_2;
// Quaternion for -90 deg around +Y: maps local +X -> world +Z (vehicle axle) and local +Z -> world -X (vehicle nose)
const VEHICLE_AXLE_FRAME_QUAT = [0, -SQRT1_2, 0, SQRT1_2];

function quatMultiply(a, b) {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz
  ];
}

function quatRotateVec3(q, v) {
  const [qx, qy, qz, qw] = q;
  const [vx, vy, vz] = v;
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  return [
    vx + qw * tx + (qy * tz - qz * ty),
    vy + qw * ty + (qz * tx - qx * tz),
    vz + qw * tz + (qx * ty - qy * tx)
  ];
}

function quatConjugate(q) {
  return [-q[0], -q[1], -q[2], q[3]];
}

function computePartBounds(tris) {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const tri of tris) {
    for (const v of tri.verts) {
      const [x, y, z] = v.pos;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (z < minZ) minZ = z;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (z > maxZ) maxZ = z;
    }
  }
  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
    center: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2]
  };
}

/**
 * Per-model articulation blueprints.
 * - `parts`: ordered list of SubPartIds (`parent`: null -> under `<key>_root`, or another SubPartId, or `"@axleFrame"` for vehicle wheels).
 * - `classify(cx, cy, cz)`: assigns each triangle centroid (in model root world space) to a SubPartId.
 * - `pivot(partId, tris, bounds)`: returns the part's pivot in **model root world space**.
 */
const ARTICULATION_SPECS = {
  momo: {
    parts: [
      { id: "body", parent: null, pivot: () => [0, 0, 0] },
      { id: "head", parent: "body", pivot: () => [0, 0.03, 0] },
      { id: "armL", parent: "body", pivot: () => [0.38, -0.14, 0] },
      { id: "armR", parent: "body", pivot: () => [-0.38, -0.14, 0] },
      { id: "footL", parent: null, pivot: () => [0.2, -0.7, 0.02] },
      { id: "footR", parent: null, pivot: () => [-0.2, -0.7, 0.02] }
    ],
    classify(cx, cy, _cz) {
      if (cy < -0.7) return cx >= 0 ? "footL" : "footR";
      if (cy > 0.02) return "head";
      if (cy >= -0.68 && cy <= -0.02 && cx > 0.4) return "armL";
      if (cy >= -0.68 && cy <= -0.02 && cx < -0.4) return "armR";
      return "body";
    }
  },

  lulu: {
    parts: [
      { id: "body", parent: null, pivot: () => [0, 0, 0] },
      { id: "head", parent: "body", pivot: () => [0, 0.12, 0.08] },
      { id: "armL", parent: "body", pivot: () => [0.35, -0.05, 0.1] },
      { id: "armR", parent: "body", pivot: () => [-0.35, -0.05, 0.1] },
      { id: "tail", parent: "body", pivot: () => [0, -0.52, -0.3] },
      { id: "footL", parent: null, pivot: () => [0.22, -0.68, 0.05] },
      { id: "footR", parent: null, pivot: () => [-0.22, -0.68, 0.05] }
    ],
    classify(cx, cy, cz) {
      if (cz < -0.32 && cy < -0.25) return "tail";
      if (cy < -0.68) return cx >= 0 ? "footL" : "footR";
      if (cy > 0.12) return "head";
      if (cy >= -0.42 && cy <= 0.12 && cx > 0.38) return "armL";
      if (cy >= -0.42 && cy <= 0.12 && cx < -0.38) return "armR";
      return "body";
    }
  },

  sheru: {
    parts: [
      { id: "body", parent: null, pivot: () => [0, 0, 0] },
      { id: "head", parent: "body", pivot: () => [0, 0.08, 0.24] },
      { id: "earL", parent: "head", pivot: () => [0.26, 0.66, 0.24] },
      { id: "earR", parent: "head", pivot: () => [-0.26, 0.66, 0.24] },
      { id: "tail", parent: "body", pivot: () => [0, -0.34, -0.44] },
      { id: "legFL", parent: null, pivot: () => [0.22, -0.56, 0.32] },
      { id: "legFR", parent: null, pivot: () => [-0.22, -0.56, 0.32] },
      { id: "legBL", parent: null, pivot: () => [0.22, -0.56, -0.22] },
      { id: "legBR", parent: null, pivot: () => [-0.22, -0.56, -0.22] }
    ],
    classify(cx, cy, cz) {
      if (cy > 0.12 && cx > 0.28 && cz < 0.52) return "earL";
      if (cy > 0.12 && cx < -0.28 && cz < 0.52) return "earR";
      if (cy > 0.05 && cz > -0.12) return "head";
      if (cz < -0.45 && cy >= -0.54) return "tail";
      if (cy < -0.56) {
        if (cz >= 0.05) return cx >= 0 ? "legFL" : "legFR";
        return cx >= 0 ? "legBL" : "legBR";
      }
      return "body";
    }
  },

  peeko: {
    parts: [
      { id: "body", parent: null, pivot: () => [0, 0, 0] },
      { id: "head", parent: "body", pivot: () => [0, 0.07, 0.02] },
      { id: "tuft", parent: "head", pivot: () => [0, 0.65, 0] },
      { id: "beakLower", parent: "head", pivot: () => [0, 0.28, 0.32] },
      { id: "wingL", parent: "body", pivot: () => [0.31, -0.1, 0] },
      { id: "wingR", parent: "body", pivot: () => [-0.31, -0.1, 0] },
      { id: "footL", parent: null, pivot: () => [0.14, -0.68, 0] },
      { id: "footR", parent: null, pivot: () => [-0.14, -0.68, 0] }
    ],
    classify(cx, cy, cz) {
      if (cy > 0.65) return "tuft";
      if (cz > 0.32 && cy >= 0.14 && cy <= 0.3 && Math.abs(cx) < 0.18) return "beakLower";
      if (cy > 0.06) return "head";
      if (cy >= -0.54 && cy <= 0.06 && cx > 0.32) return "wingL";
      if (cy >= -0.54 && cy <= 0.06 && cx < -0.32) return "wingR";
      if (cy < -0.68) return cx >= 0 ? "footL" : "footR";
      return "body";
    }
  },

  lumi: {
    parts: [
      { id: "body", parent: null, pivot: () => [0, 0, 0] },
      { id: "head", parent: "body", pivot: () => [0, 0.46, 0] },
      { id: "armL", parent: "body", pivot: () => [0.33, 0.24, 0] },
      { id: "armR", parent: "body", pivot: () => [-0.33, 0.24, 0] },
      { id: "footL", parent: null, pivot: () => [0.16, -0.55, 0] },
      { id: "footR", parent: null, pivot: () => [-0.16, -0.55, 0] }
    ],
    classify(cx, cy, _cz) {
      if (cy > 0.48 && Math.abs(cx) < 0.32) return "head";
      if (cx > 0.35 && cy > -0.1) return "armL";
      if (cx < -0.35 && cy > -0.1) return "armR";
      if (cy < -0.56) return cx >= 0 ? "footL" : "footR";
      return "body";
    }
  },

  gogo: {
    hasAxleFrame: true,
    parts: [
      { id: "body", parent: null, pivot: () => [0, 0, 0] },
      { id: "chimney", parent: "body", pivot: (b) => [b.center[0], b.min[1], 0] },
      { id: "cabDoorL", parent: "body", pivot: (b) => [b.min[0], b.center[1], b.center[2]] },
      { id: "cabDoorR", parent: "body", pivot: (b) => [b.min[0], b.center[1], b.center[2]] },
      { id: "wheelFL", parent: "@axleFrame", pivot: (b) => b.center },
      { id: "wheelFR", parent: "@axleFrame", pivot: (b) => b.center },
      { id: "wheelRL", parent: "@axleFrame", pivot: (b) => b.center },
      { id: "wheelRR", parent: "@axleFrame", pivot: (b) => b.center }
    ],
    classify(cx, cy, cz) {
      if (cx < -0.56 && cy > 0.22) return "chimney";
      if (cy < -0.25 && Math.abs(cz) > 0.18) {
        if (cx < -0.05) return cz > 0 ? "wheelFL" : "wheelFR";
        return cz > 0 ? "wheelRL" : "wheelRR";
      }
      if (cx >= 0.18 && cx <= 0.72 && cy >= -0.22 && cy <= 0.34 && cz > 0.26) return "cabDoorL";
      if (cx >= 0.18 && cx <= 0.72 && cy >= -0.22 && cy <= 0.34 && cz < -0.26) return "cabDoorR";
      return "body";
    }
  },

  gogoCarriage: {
    hasAxleFrame: true,
    parts: [
      { id: "body", parent: null, pivot: () => [0, 0, 0] },
      { id: "cabDoorL", parent: "body", pivot: (b) => [b.min[0], b.center[1], b.center[2]] },
      { id: "wheelFL", parent: "@axleFrame", pivot: (b) => b.center },
      { id: "wheelFR", parent: "@axleFrame", pivot: (b) => b.center },
      { id: "wheelRL", parent: "@axleFrame", pivot: (b) => b.center },
      { id: "wheelRR", parent: "@axleFrame", pivot: (b) => b.center }
    ],
    classify(cx, cy, cz) {
      if (cy < -0.21 && Math.abs(cz) > 0.2) {
        if (cx < 0) return cz > 0 ? "wheelFL" : "wheelFR";
        return cz > 0 ? "wheelRL" : "wheelRR";
      }
      if (Math.abs(cx) < 0.28 && cy >= -0.18 && cy <= 0.32 && cz > 0.28) return "cabDoorL";
      return "body";
    }
  },

  car: {
    hasAxleFrame: true,
    parts: [
      { id: "body", parent: null, pivot: () => [0, 0, 0] },
      { id: "wheelFL", parent: "@axleFrame", pivot: (b) => b.center },
      { id: "wheelFR", parent: "@axleFrame", pivot: (b) => b.center },
      { id: "wheelRL", parent: "@axleFrame", pivot: (b) => b.center },
      { id: "wheelRR", parent: "@axleFrame", pivot: (b) => b.center }
    ],
    classify(cx, cy, cz) {
      if (cy < -0.25 && Math.abs(cz) > 0.26) {
        if (cx < 0) return cz > 0 ? "wheelFL" : "wheelFR";
        return cz > 0 ? "wheelRL" : "wheelRR";
      }
      return "body";
    }
  },

  door: {
    parts: [
      { id: "body", parent: null, pivot: () => [0, 0, 0] },
      // Left X-edge hinge so rotating hingeLeaf on Y swings cleanly around its left edge
      { id: "hingeLeaf", parent: "body", pivot: (b) => [b.min[0], b.center[1], 0] }
    ],
    classify(cx, cy, _cz) {
      const archY = Math.max(0, cy - 0.28);
      if (Math.abs(cx) <= 0.46 && cy >= -0.86 && cy <= 0.7 && (cx / 0.46) ** 2 + (archY / 0.44) ** 2 <= 1.0) {
        return "hingeLeaf";
      }
      return "body";
    }
  },

  barn: {
    parts: [
      { id: "body", parent: null, pivot: () => [0, 0, 0] },
      { id: "hingeLeaf", parent: "body", pivot: (b) => [b.min[0], b.center[1], b.center[2]] },
      { id: "hingeLeafR", parent: "body", pivot: (b) => [b.max[0], b.center[1], b.center[2]] }
    ],
    classify(cx, cy, cz) {
      if (cz > 0.68 && cy >= -0.88 && cy <= 0.04 && cx >= -0.48 && cx < 0) return "hingeLeaf";
      if (cz > 0.68 && cy >= -0.88 && cy <= 0.04 && cx >= 0 && cx <= 0.48) return "hingeLeafR";
      return "body";
    }
  },

  lift: {
    parts: [
      { id: "body", parent: null, pivot: () => [0, 0, 0] },
      { id: "liftCab", parent: null, pivot: () => [0, 0, 0] },
      { id: "liftGate", parent: "liftCab", pivot: (b) => [b.min[0], b.center[1], b.center[2]] }
    ],
    classify(cx, cy, cz) {
      const inCab = Math.abs(cx) <= 0.25 && cz >= -0.25 && cy >= -0.9 && cy <= 0.05;
      if (inCab && cz > 0.16 && cy >= -0.86 && cy <= 0.02) return "liftGate";
      if (inCab) return "liftCab";
      return "body";
    }
  },

  toyBox: {
    parts: [
      { id: "body", parent: null, pivot: () => [0, 0, 0] },
      { id: "lid", parent: "body", pivot: (b) => [0, b.min[1], b.min[2]] }
    ],
    classify(_cx, cy, _cz) {
      return cy > -0.03 ? "lid" : "body";
    }
  },

  storyBox: {
    parts: [
      { id: "body", parent: null, pivot: () => [0, 0, 0] },
      { id: "lid", parent: "body", pivot: (b) => [0, b.min[1], b.min[2]] }
    ],
    classify(_cx, cy, _cz) {
      return cy > 0.05 ? "lid" : "body";
    }
  },

  picnicBasket: {
    parts: [
      { id: "body", parent: null, pivot: () => [0, 0, 0] },
      { id: "lid", parent: "body", pivot: (b) => [0, b.min[1], b.min[2]] }
    ],
    classify(_cx, cy, cz) {
      if (cy > -0.15 && !(cy > 0.08 && Math.abs(cz) <= 0.1)) return "lid";
      return "body";
    }
  },

  flowerBud: {
    parts: [
      { id: "body", parent: null, pivot: () => [0, 0, 0] },
      { id: "petals", parent: "body", pivot: (b) => [0, b.min[1], 0] }
    ],
    classify(_cx, cy, _cz) {
      return cy > -0.18 ? "petals" : "body";
    }
  }
};

/** Extracts every triangle in model root world space (composing node translations & rotations). */
function extractWorldTriangles(doc) {
  const tris = [];
  let firstMaterial = null;
  let hasNormals = false;
  let hasUvs = false;
  let hasTangents = false;
  let hasColors = false;
  let colorComponents = 4;

  const walk = (node, parentPos, parentQuat, parentScale) => {
    const localT = node.getTranslation();
    const localQ = node.getRotation();
    const localS = node.getScale();
    const scaledLocalT = [localT[0] * parentScale[0], localT[1] * parentScale[1], localT[2] * parentScale[2]];
    const rotatedT = quatRotateVec3(parentQuat, scaledLocalT);
    const worldPos = [parentPos[0] + rotatedT[0], parentPos[1] + rotatedT[1], parentPos[2] + rotatedT[2]];
    const worldQuat = quatMultiply(parentQuat, localQ);
    const worldScale = [parentScale[0] * localS[0], parentScale[1] * localS[1], parentScale[2] * localS[2]];

    const mesh = node.getMesh();
    if (mesh) {
      for (const prim of mesh.listPrimitives()) {
        if (!firstMaterial && prim.getMaterial()) firstMaterial = prim.getMaterial();
        const posAcc = prim.getAttribute("POSITION");
        if (!posAcc) continue;
        const normAcc = prim.getAttribute("NORMAL");
        const uvAcc = prim.getAttribute("TEXCOORD_0");
        const tanAcc = prim.getAttribute("TANGENT");
        const colAcc = prim.getAttribute("COLOR_0");
        const idxAcc = prim.getIndices();

        if (normAcc) hasNormals = true;
        if (uvAcc) hasUvs = true;
        if (tanAcc) hasTangents = true;
        if (colAcc) {
          hasColors = true;
          colorComponents = colAcc.getElementSize();
        }

        const triCount = idxAcc ? idxAcc.getCount() / 3 : posAcc.getCount() / 3;
        for (let ti = 0; ti < triCount; ti += 1) {
          const verts = [];
          for (let k = 0; k < 3; k += 1) {
            const vi = idxAcc ? idxAcc.getScalar(3 * ti + k) : 3 * ti + k;
            const lp = [0, 0, 0];
            posAcc.getElement(vi, lp);
            const sp = [lp[0] * worldScale[0], lp[1] * worldScale[1], lp[2] * worldScale[2]];
            const rp = quatRotateVec3(worldQuat, sp);
            const pos = [rp[0] + worldPos[0], rp[1] + worldPos[1], rp[2] + worldPos[2]];

            let norm = null;
            if (normAcc) {
              const ln = [0, 0, 1];
              normAcc.getElement(vi, ln);
              const sn = [
                ln[0] / (worldScale[0] || 1),
                ln[1] / (worldScale[1] || 1),
                ln[2] / (worldScale[2] || 1)
              ];
              const rn = quatRotateVec3(worldQuat, sn);
              const len = Math.hypot(rn[0], rn[1], rn[2]) || 1;
              norm = [rn[0] / len, rn[1] / len, rn[2] / len];
            }

            let uv = null;
            if (uvAcc) {
              uv = [0, 0];
              uvAcc.getElement(vi, uv);
            }

            let tan = null;
            if (tanAcc) {
              const lt = [0, 0, 0, 1];
              tanAcc.getElement(vi, lt);
              const rt = quatRotateVec3(worldQuat, [lt[0], lt[1], lt[2]]);
              const len = Math.hypot(rt[0], rt[1], rt[2]) || 1;
              tan = [rt[0] / len, rt[1] / len, rt[2] / len, lt[3]];
            }

            let col = null;
            if (colAcc) {
              col = new Array(colorComponents).fill(1);
              colAcc.getElement(vi, col);
            }

            verts.push({ pos, norm, uv, tan, col });
          }
          const cx = (verts[0].pos[0] + verts[1].pos[0] + verts[2].pos[0]) / 3;
          const cy = (verts[0].pos[1] + verts[1].pos[1] + verts[2].pos[1]) / 3;
          const cz = (verts[0].pos[2] + verts[1].pos[2] + verts[2].pos[2]) / 3;
          tris.push({ verts, centroid: [cx, cy, cz] });
        }
      }
    }
    for (const child of node.listChildren()) walk(child, worldPos, worldQuat, worldScale);
  };

  for (const scene of doc.getRoot().listScenes()) {
    for (const rootNode of scene.listChildren()) {
      walk(rootNode, [0, 0, 0], [0, 0, 0, 1], [1, 1, 1]);
    }
  }

  return { tris, material: firstMaterial, hasNormals, hasUvs, hasTangents, hasColors, colorComponents };
}

/** Builds a deduplicated indexed Primitive for one SubPartId in its local coordinate frame. */
function buildPartMesh(doc, buffer, material, partId, tris, worldPivot, invFrameQuat, attrs) {
  const vertMap = new Map();
  const positions = [];
  const normals = [];
  const uvs = [];
  const tangents = [];
  const colors = [];
  const indices = [];

  const f6 = (n) => Math.round(n * 1e6);

  for (const tri of tris) {
    for (const v of tri.verts) {
      const relWorld = [v.pos[0] - worldPivot[0], v.pos[1] - worldPivot[1], v.pos[2] - worldPivot[2]];
      const localPos = invFrameQuat ? quatRotateVec3(invFrameQuat, relWorld) : relWorld;
      const localNorm = v.norm
        ? (invFrameQuat ? quatRotateVec3(invFrameQuat, v.norm) : v.norm)
        : [0, 1, 0];
      const localTan = v.tan
        ? (() => {
            const rt = invFrameQuat ? quatRotateVec3(invFrameQuat, [v.tan[0], v.tan[1], v.tan[2]]) : [v.tan[0], v.tan[1], v.tan[2]];
            return [rt[0], rt[1], rt[2], v.tan[3]];
          })()
        : [1, 0, 0, 1];
      const uv = v.uv ?? [0, 0];

      const key = `${f6(localPos[0])},${f6(localPos[1])},${f6(localPos[2])}|${f6(localNorm[0])},${f6(localNorm[1])},${f6(localNorm[2])}|${f6(uv[0])},${f6(uv[1])}`;
      let idx = vertMap.get(key);
      if (idx === undefined) {
        idx = positions.length / 3;
        vertMap.set(key, idx);
        positions.push(localPos[0], localPos[1], localPos[2]);
        if (attrs.hasNormals) normals.push(localNorm[0], localNorm[1], localNorm[2]);
        if (attrs.hasUvs) uvs.push(uv[0], uv[1]);
        if (attrs.hasTangents) tangents.push(localTan[0], localTan[1], localTan[2], localTan[3]);
        if (attrs.hasColors) {
          const c = v.col ?? (attrs.colorComponents === 3 ? [1, 1, 1] : [1, 1, 1, 1]);
          for (let ci = 0; ci < attrs.colorComponents; ci += 1) colors.push(c[ci]);
        }
      }
      indices.push(idx);
    }
  }

  const prim = doc.createPrimitive();
  if (material) prim.setMaterial(material);

  const posAcc = doc.createAccessor(`${partId}_POSITION`).setType("VEC3").setArray(new Float32Array(positions)).setBuffer(buffer);
  prim.setAttribute("POSITION", posAcc);

  if (attrs.hasNormals) {
    const normAcc = doc.createAccessor(`${partId}_NORMAL`).setType("VEC3").setArray(new Float32Array(normals)).setBuffer(buffer);
    prim.setAttribute("NORMAL", normAcc);
  }
  if (attrs.hasUvs) {
    const uvAcc = doc.createAccessor(`${partId}_TEXCOORD_0`).setType("VEC2").setArray(new Float32Array(uvs)).setBuffer(buffer);
    prim.setAttribute("TEXCOORD_0", uvAcc);
  }
  if (attrs.hasTangents) {
    const tanAcc = doc.createAccessor(`${partId}_TANGENT`).setType("VEC4").setArray(new Float32Array(tangents)).setBuffer(buffer);
    prim.setAttribute("TANGENT", tanAcc);
  }
  if (attrs.hasColors) {
    const colType = attrs.colorComponents === 3 ? "VEC3" : "VEC4";
    const colAcc = doc.createAccessor(`${partId}_COLOR_0`).setType(colType).setArray(new Float32Array(colors)).setBuffer(buffer);
    prim.setAttribute("COLOR_0", colAcc);
  }

  const vertCount = positions.length / 3;
  const idxArray = vertCount <= 65535 ? new Uint16Array(indices) : new Uint32Array(indices);
  const idxAcc = doc.createAccessor(`${partId}_INDICES`).setType("SCALAR").setArray(idxArray).setBuffer(buffer);
  prim.setIndices(idxAcc);

  const mesh = doc.createMesh(`${partId}_mesh`).addPrimitive(prim);
  return { mesh, vertCount, triCount: indices.length / 3 };
}

/** Exact O(N) 1-to-1 triangle bijection verifier between original and written GLB in world space. */
function verifyTriangleBijection(key, beforeTris, afterTris) {
  const cellSize = 0.005;
  const cellKey = (x, y, z) => `${Math.floor(x / cellSize)},${Math.floor(y / cellSize)},${Math.floor(z / cellSize)}`;
  const grid = new Map();
  for (let j = 0; j < afterTris.length; j += 1) {
    const [cx, cy, cz] = afterTris[j].centroid;
    const ck = cellKey(cx, cy, cz);
    let arr = grid.get(ck);
    if (!arr) {
      arr = [];
      grid.set(ck, arr);
    }
    arr.push(j);
  }

  const used = new Uint8Array(afterTris.length);
  let maxPosErr = 0;
  let maxUvErr = 0;
  let maxNormErr = 0;

  for (let i = 0; i < beforeTris.length; i += 1) {
    const ta = beforeTris[i];
    const [cx, cy, cz] = ta.centroid;
    const bx = Math.floor(cx / cellSize);
    const by = Math.floor(cy / cellSize);
    const bz = Math.floor(cz / cellSize);

    let bestJ = -1;
    let bestPos = Infinity;
    let bestUv = Infinity;
    let bestNorm = Infinity;

    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
          const candidates = grid.get(`${bx + dx},${by + dy},${bz + dz}`);
          if (!candidates) continue;
          for (const j of candidates) {
            if (used[j]) continue;
            const tb = afterTris[j];
            let pErr = 0;
            let uErr = 0;
            let nErr = 0;
            for (let k = 0; k < 3; k += 1) {
              const va = ta.verts[k];
              const vb = tb.verts[k];
              for (let c = 0; c < 3; c += 1) {
                pErr = Math.max(pErr, Math.abs(va.pos[c] - vb.pos[c]));
                if (va.norm && vb.norm) nErr = Math.max(nErr, Math.abs(va.norm[c] - vb.norm[c]));
              }
              if (va.uv && vb.uv) {
                uErr = Math.max(uErr, Math.abs(va.uv[0] - vb.uv[0]), Math.abs(va.uv[1] - vb.uv[1]));
              }
            }
            if (pErr < bestPos || (pErr === bestPos && uErr < bestUv)) {
              bestPos = pErr;
              bestUv = uErr;
              bestNorm = nErr;
              bestJ = j;
            }
          }
        }
      }
    }

    if (bestJ < 0 || bestPos > 1e-5) {
      throw new Error(`${key}: rest-pose vertex position error ${bestPos} on triangle ${i} exceeds 1e-5!`);
    }
    if (bestUv > 1e-5) {
      throw new Error(`${key}: UV error ${bestUv} on triangle ${i} exceeds 1e-5!`);
    }
    used[bestJ] = 1;
    maxPosErr = Math.max(maxPosErr, bestPos);
    maxUvErr = Math.max(maxUvErr, bestUv);
    maxNormErr = Math.max(maxNormErr, bestNorm);
  }

  return { maxPosErr, maxUvErr, maxNormErr };
}

const targetKeys = Object.keys(ARTICULATION_SPECS);
const summary = [];
const skipped = [];

for (const key of targetKeys) {
  if (only && !only.has(key)) continue;
  const provPath = join(provDir, `${key}.json`);
  const prov = JSON.parse(readFileSync(provPath, "utf8"));

  if (!force && prov.processing?.articulatedSubNodes?.version === 2) {
    skipped.push(key);
    continue;
  }

  const oldPath = join(app, prov.file);
  if (!existsSync(oldPath)) throw new Error(`${key}: missing GLB ${prov.file}`);
  const beforeBytes = readFileSync(oldPath);
  const inDoc = await io.readBinary(new Uint8Array(beforeBytes));

  const extracted = extractWorldTriangles(inDoc);
  const origBounds = computePartBounds(extracted.tris);
  const spec = ARTICULATION_SPECS[key];

  // Partition triangles into candidate SubPartId buckets, then fold any sub-part that shares
  // welded boundary vertices (`1e-4` m) with another sub-part back into watertight `body`
  // so rotating sub-parts at runtime never tears cracks or holes in single-shell Meshy meshes.
  const buckets = new Map(spec.parts.map((p) => [p.id, []]));
  for (const tri of extracted.tris) {
    const [cx, cy, cz] = tri.centroid;
    const partId = spec.classify(cx, cy, cz);
    const bucket = buckets.get(partId);
    if (!bucket) throw new Error(`${key}: unknown classified partId "${partId}"`);
    bucket.push(tri);
  }

  const posBucketKey = (pos) =>
    `${Math.round(pos[0] * 1e4)},${Math.round(pos[1] * 1e4)},${Math.round(pos[2] * 1e4)}`;

  let mergedAny = true;
  while (mergedAny) {
    mergedAny = false;
    const ownersByPos = new Map();
    for (const [partId, tris] of buckets.entries()) {
      for (const tri of tris) {
        for (const v of tri.verts) {
          const pk = posBucketKey(v.pos);
          let set = ownersByPos.get(pk);
          if (!set) {
            set = new Set();
            ownersByPos.set(pk, set);
          }
          set.add(partId);
        }
      }
    }

    const weldedParts = new Set();
    for (const owners of ownersByPos.values()) {
      if (owners.size > 1) {
        for (const pid of owners) {
          if (pid !== "body") weldedParts.add(pid);
        }
      }
    }

    // Also fold any child whose parent SubPartId was folded or empty
    for (const partDef of spec.parts) {
      if (partDef.id === "body") continue;
      if (
        partDef.parent &&
        partDef.parent !== "@axleFrame" &&
        partDef.parent !== "body" &&
        (weldedParts.has(partDef.parent) || (buckets.get(partDef.parent)?.length ?? 0) === 0)
      ) {
        if ((buckets.get(partDef.id)?.length ?? 0) > 0) weldedParts.add(partDef.id);
      }
    }

    if (weldedParts.size > 0) {
      const bodyTris = buckets.get("body");
      for (const pid of weldedParts) {
        const tris = buckets.get(pid);
        if (tris && tris.length > 0) {
          for (const t of tris) bodyTris.push(t);
          buckets.set(pid, []);
          mergedAny = true;
        }
      }
    }
  }

  const activeParts = spec.parts.filter((partDef) => (buckets.get(partDef.id)?.length ?? 0) > 0);
  if (activeParts.length === 0) {
    throw new Error(`${key}: 0 active parts after watertight component check`);
  }

  const partBoundsMap = new Map();
  const worldPivotMap = new Map();
  for (const partDef of activeParts) {
    const partTris = buckets.get(partDef.id);
    const pb = computePartBounds(partTris);
    partBoundsMap.set(partDef.id, pb);
    const wp = partDef.pivot(pb);
    worldPivotMap.set(partDef.id, [
      Math.round(wp[0] * 1e5) / 1e5,
      Math.round(wp[1] * 1e5) / 1e5,
      Math.round(wp[2] * 1e5) / 1e5
    ]);
  }

  // Rebuild clean scene hierarchy in a fresh Document sharing cloned textures & material properties
  // (Operating directly on inDoc preserves every texture binary & material property bit-for-bit!)
  const root = inDoc.getRoot();
  const oldMeshes = [...root.listMeshes()];
  const oldNodes = [...root.listNodes()];
  const oldMeshAccessors = new Set();
  for (const m of oldMeshes) {
    for (const p of m.listPrimitives()) {
      for (const a of p.listAttributes()) oldMeshAccessors.add(a);
      if (p.getIndices()) oldMeshAccessors.add(p.getIndices());
    }
  }
  let buffer = root.listBuffers()[0];
  if (!buffer) buffer = inDoc.createBuffer();

  const scene = root.listScenes()[0] ?? inDoc.createScene("Scene");
  for (const child of [...scene.listChildren()]) scene.removeChild(child);

  const actorRoot = inDoc.createNode(`${key}_root`).setTranslation([0, 0, 0]);
  scene.addChild(actorRoot);

  let axleFrameNode = null;
  const invAxleQuat = quatConjugate(VEHICLE_AXLE_FRAME_QUAT);
  const needsAxleFrame = spec.hasAxleFrame && activeParts.some((p) => p.parent === "@axleFrame");
  if (needsAxleFrame) {
    axleFrameNode = inDoc
      .createNode(`${key}_axle_frame`)
      .setTranslation([0, 0, 0])
      .setRotation(VEHICLE_AXLE_FRAME_QUAT);
    actorRoot.addChild(axleFrameNode);
  }

  const createdNodes = new Map();
  const partStats = {};
  let totalVertsAfter = 0;
  let totalTrisAfter = 0;

  for (const partDef of activeParts) {
    const partTris = buckets.get(partDef.id);
    const worldPivot = worldPivotMap.get(partDef.id);
    const onAxleFrame = partDef.parent === "@axleFrame";

    let localTranslation;
    if (onAxleFrame) {
      localTranslation = quatRotateVec3(invAxleQuat, worldPivot);
    } else if (partDef.parent) {
      const parentWorldPivot = worldPivotMap.get(partDef.parent);
      localTranslation = [
        worldPivot[0] - parentWorldPivot[0],
        worldPivot[1] - parentWorldPivot[1],
        worldPivot[2] - parentWorldPivot[2]
      ];
    } else {
      localTranslation = [...worldPivot];
    }

    const { mesh, vertCount, triCount } = buildPartMesh(
      inDoc,
      buffer,
      extracted.material,
      partDef.id,
      partTris,
      worldPivot,
      onAxleFrame ? invAxleQuat : null,
      extracted
    );

    const partNode = inDoc
      .createNode(partDef.id)
      .setTranslation(localTranslation)
      .setRotation([0, 0, 0, 1])
      .setScale([1, 1, 1])
      .setMesh(mesh);

    if (onAxleFrame) {
      axleFrameNode.addChild(partNode);
    } else if (partDef.parent) {
      const parentNode = createdNodes.get(partDef.parent);
      if (!parentNode) throw new Error(`${key}: parent "${partDef.parent}" must precede "${partDef.id}" in activeParts`);
      parentNode.addChild(partNode);
    } else {
      actorRoot.addChild(partNode);
    }

    createdNodes.set(partDef.id, partNode);
    totalVertsAfter += vertCount;
    totalTrisAfter += triCount;
    partStats[partDef.id] = {
      parent: partDef.parent ?? `${key}_root`,
      worldPivot,
      localTranslation: localTranslation.map((v) => Math.round(v * 1e5) / 1e5),
      triangles: triCount,
      vertices: vertCount
    };
  }

  // Dispose unreferenced pre-partition nodes, meshes, and geometry accessors
  for (const n of oldNodes) n.dispose();
  for (const m of oldMeshes) m.dispose();
  for (const a of oldMeshAccessors) a.dispose();

  // Preserve orientation metadata required by model-orientation tests & CLI
  const asset = root.getAsset();
  asset.extras = {
    ...(asset.extras ?? {}),
    aura3d: {
      ...(asset.extras?.aura3d ?? {}),
      orientation: asset.extras?.aura3d?.orientation ?? {
        forwardAxis: "+z",
        upAxis: "+y",
        source: "Meshy export convention (faces +z)"
      }
    }
  };

  const afterBytes = Buffer.from(await io.writeBinary(inDoc));

  // ---- Strict Rest-Pose Roundtrip Verification on Written Binary GLB ----
  const verifyDoc = await io.readBinary(new Uint8Array(afterBytes));
  const verifyNodeNames = new Set(verifyDoc.getRoot().listNodes().map((n) => n.getName()));
  for (const partDef of activeParts) {
    if (!verifyNodeNames.has(partDef.id)) {
      throw new Error(`${key}: written GLB missing SceneNode "${partDef.id}"`);
    }
    const verifyNode = verifyDoc.getRoot().listNodes().find((n) => n.getName() === partDef.id);
    const q = verifyNode.getRotation();
    if (Math.hypot(q[0], q[1], q[2], q[3] - 1) > 1e-6) {
      throw new Error(`${key}: SubPartId "${partDef.id}" rest rotation is not [0,0,0,1]: ${JSON.stringify(q)}`);
    }
  }

  const verifyExtracted = extractWorldTriangles(verifyDoc);
  if (verifyExtracted.tris.length !== extracted.tris.length) {
    throw new Error(`${key}: triangle count mismatch (${verifyExtracted.tris.length} !== ${extracted.tris.length})`);
  }

  const verifyBounds = computePartBounds(verifyExtracted.tris);
  for (let axis = 0; axis < 3; axis += 1) {
    const dMin = Math.abs(verifyBounds.min[axis] - origBounds.min[axis]);
    const dMax = Math.abs(verifyBounds.max[axis] - origBounds.max[axis]);
    if (dMin > 1e-5 || dMax > 1e-5) {
      throw new Error(`${key}: rest-pose bbox drift on axis ${axis} (dMin=${dMin}, dMax=${dMax})`);
    }
  }

  const { maxPosErr, maxUvErr, maxNormErr } = verifyTriangleBijection(key, extracted.tris, verifyExtracted.tris);

  const newSha = createHash("sha256").update(afterBytes).digest("hex");
  const newFile = `src/assets/models/${key}.${newSha.slice(0, 8)}.glb`;
  const newFullPath = join(app, newFile);

  const previous = (prov.processing?.articulatedSubNodes && prov.previous)
    ? prov.previous
    : { file: prov.file, sha256: prov.sha256, sizeBytes: prov.sizeBytes };
  for (const stale of readdirSync(modelsDir).filter((f) => f.startsWith(`${key}.`) && f.endsWith(".glb"))) {
    rmSync(join(modelsDir, stale));
  }
  writeFileSync(newFullPath, afterBytes);

  prov.previous = previous;
  prov.file = newFile;
  prov.sha256 = newSha;
  prov.sizeBytes = afterBytes.length;
  prov.processing = {
    ...(prov.processing ?? {}),
    articulatedSubNodes: {
      version: 2,
      watertightPreserved: true,
      partIds: activeParts.map((p) => p.id),
      hasAxleFrame: Boolean(needsAxleFrame),
      trianglesBefore: extracted.tris.length,
      trianglesAfter: totalTrisAfter,
      verticesAfter: totalVertsAfter,
      maxRestPosePosError: Number(maxPosErr.toExponential(3)),
      maxRestPoseNormalError: Number(maxNormErr.toExponential(3)),
      maxUvError: Number(maxUvErr.toExponential(3)),
      parts: partStats
    }
  };
  prov.inspection = {
    ...(prov.inspection ?? {}),
    vertexCount: totalVertsAfter
  };
  writeFileSync(provPath, `${JSON.stringify(prov, null, 2)}\n`);

  const partSummary = activeParts.map((p) => `${p.id}(${partStats[p.id].triangles}t)`).join(", ");
  summary.push(
    `${key.padEnd(14)} ${(previous.sizeBytes / 1024).toFixed(0).padStart(5)} KB -> ${(afterBytes.length / 1024).toFixed(0).padStart(5)} KB | err=${maxPosErr.toExponential(2)} | [${partSummary}]`
  );
}

const totalBytes = readdirSync(modelsDir)
  .filter((f) => f.endsWith(".glb"))
  .reduce((sum, f) => sum + readFileSync(join(modelsDir, f)).length, 0);

console.log(`build-articulated-cast: partitioned ${summary.length}, skipped ${skipped.length}; total models dir = ${(totalBytes / 1024 / 1024).toFixed(2)} MiB`);
for (const line of summary) console.log(`  ${line}`);
