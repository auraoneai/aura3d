import { Document, Primitive, type Mesh, type Node } from "@gltf-transform/core";
import { MeshoptSimplifier } from "meshoptimizer";
import { MSFT_LOD_EXTENSION_NAME, type MSFTLodNode } from "../extensions/msft-lod.js";
import { hasAncestorInScene, recordStep } from "./common.js";

/**
 * §6.3 step 7 — collider sidecar (`<id>.<hash8>.collision.glb`).
 *
 * Runs after `lod` so the LOD-named source geometry (§6.2 Collider column) is
 * already in the document: convex hulls read LOD2 for vehicle profiles and
 * LOD1 otherwise; trimesh reads LOD1 for `world-chunk` and LOD0 for `track`
 * (drivable surface); box/capsule are analytic from the LOD0 bounds.
 *
 * The sidecar is a separate Document: one node per mesh-bearing scene node,
 * mesh carries POSITION (+indices) only — no materials — and
 * `extras.aura3dCollider = { shape, sourceNode, … }` per mesh. Box/capsule
 * proxies keep the 8 bbox corners as a POINTS primitive purely so the file is
 * a valid glTF; `createCollidersFromSidecar` reads the extras, not the proxy
 * points. Convex inputs are meshopt-simplified to ≤ 64 vertices.
 */

const AURA_COLLIDER_EXTRA = "aura3dCollider";
const CONVEX_VERTEX_CAP = 64;

type ColliderShape = "box" | "capsule" | "convex" | "trimesh";

interface MeshBounds {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

function meshBounds(mesh: Mesh): MeshBounds {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute("POSITION");
    if (!pos) continue;
    const arr = pos.getArray()!;
    for (let i = 0; i < arr.length; i += 3) {
      for (let c = 0; c < 3; c++) {
        const v = arr[i + c]!;
        if (v < min[c]) min[c] = v;
        if (v > max[c]) max[c] = v;
      }
    }
  }
  return { min, max };
}

/** Mesh for LOD `level` (0 = source mesh). Clamps down to the nearest available level. */
function lodSourceMesh(node: Node, level: number): Mesh {
  const prop = node.getExtension(MSFT_LOD_EXTENSION_NAME) as MSFTLodNode | null;
  const lods = prop?.listLods() ?? [];
  for (let l = Math.min(level, lods.length); l >= 1; l--) {
    const mesh = lods[l - 1]!.getMesh();
    if (mesh) return mesh;
  }
  return node.getMesh()!;
}

function copyPrimGeometry(doc: Document, prim: Primitive, out: Mesh): void {
  const pos = prim.getAttribute("POSITION");
  const indices = prim.getIndices();
  if (!pos) return;
  const posAccessor = doc.createAccessor(pos.getName()).setType(pos.getType()).setArray(pos.getArray()!.slice());
  const collPrim = doc.createPrimitive().setMode(Primitive.Mode.TRIANGLES).setAttribute("POSITION", posAccessor);
  if (indices?.getArray()) {
    const idx = doc.createAccessor(indices.getName()).setType(indices.getType()).setArray(indices.getArray()!.slice());
    collPrim.setIndices(idx);
  }
  out.addPrimitive(collPrim);
}

/**
 * Reduce `prim` to ≤ `cap` hull vertices. `MeshoptSimplifier.simplifyPoints`
 * picks a representative vertex subset — exactly what a convex hull needs;
 * no triangle structure survives (POINTS primitive), which is correct since
 * `ColliderDesc.convexHull` consumes positions only.
 */
function hullVertices(prim: Primitive, cap: number): Float32Array | null {
  const pos = prim.getAttribute("POSITION");
  const posArr = pos?.getArray();
  if (!posArr) return null;
  if (posArr.length / 3 <= cap) return posArr.slice() as Float32Array;
  const keep = MeshoptSimplifier.simplifyPoints(posArr as Float32Array, 3, cap);
  const out = new Float32Array(keep.length * 3);
  for (let i = 0; i < keep.length; i++) {
    out[i * 3] = posArr[keep[i]! * 3]!;
    out[i * 3 + 1] = posArr[keep[i]! * 3 + 1]!;
    out[i * 3 + 2] = posArr[keep[i]! * 3 + 2]!;
  }
  return out;
}

export const stepColliders = recordStep("colliders", async (doc, ctx) => {
  const mode = ctx.profile.collider;
  if (mode === "none") return;
  await MeshoptSimplifier.ready;

  const coll = new Document();
  coll.createBuffer();
  const collScene = coll.createScene("collision");
  const root = doc.getRoot();

  const sourceNodes = root.listNodes().filter((n) => n.getMesh() && hasAncestorInScene(n, root));
  let written = 0;
  for (const node of sourceNodes) {
    const shape = mode as ColliderShape;
    const level =
      shape === "trimesh" ? (ctx.profile.id === "track" ? 0 : 1)
      : shape === "convex" ? (ctx.profile.id === "hero-vehicle" || ctx.profile.id === "traffic-vehicle" ? 2 : 1)
      : 0;
    const mesh = lodSourceMesh(node, level);
    const collMesh = coll.createMesh(node.getMesh()!.getName());
    // The sidecar node stays identity; the source node's WORLD matrix (incl.
    // ancestors, e.g. Sketchfab scale/rotation wrappers) is baked into the
    // extras so `createCollidersFromSidecar` reproduces the true placement.
    const extras: Record<string, unknown> = {
      shape,
      sourceNode: node.getName(),
      nodeWorldMatrix: Array.from(node.getWorldMatrix())
    };

    if (shape === "box" || shape === "capsule") {
      const { min, max } = meshBounds(node.getMesh()!);
      const half: [number, number, number] = [(max[0] - min[0]) / 2, (max[1] - min[1]) / 2, (max[2] - min[2]) / 2];
      const center: [number, number, number] = [(max[0] + min[0]) / 2, (max[1] + min[1]) / 2, (max[2] + min[2]) / 2];
      if (shape === "box") {
        extras.halfExtents = half;
        extras.center = center;
      } else {
        // Y-axis capsule: radius spans the XZ half-extents, cylinder fills the rest.
        const radius = Math.max(half[0], half[2]);
        extras.radius = radius;
        extras.halfHeight = Math.max(0, half[1] - radius);
        extras.center = center;
      }
      const corners = new Float32Array([
        min[0], min[1], min[2], max[0], min[1], min[2], min[0], max[1], min[2], max[0], max[1], min[2],
        min[0], min[1], max[2], max[0], min[1], max[2], min[0], max[1], max[2], max[0], max[1], max[2]
      ]);
      const accessor = coll.createAccessor(`${node.getName()}.bounds`).setType("VEC3").setArray(corners);
      collMesh.addPrimitive(coll.createPrimitive().setMode(Primitive.Mode.POINTS).setAttribute("POSITION", accessor));
    } else if (shape === "convex") {
      let wrote = false;
      for (const prim of mesh.listPrimitives()) {
        const verts = hullVertices(prim, CONVEX_VERTEX_CAP);
        if (!verts || verts.length === 0) continue;
        if (verts.length / 3 > CONVEX_VERTEX_CAP) ctx.flags.push("collider-vert-cap-missed");
        const pos = coll.createAccessor().setType("VEC3").setArray(verts);
        collMesh.addPrimitive(coll.createPrimitive().setMode(Primitive.Mode.POINTS).setAttribute("POSITION", pos));
        wrote = true;
      }
      if (!wrote) { collMesh.dispose(); continue; }
    } else {
      for (const prim of mesh.listPrimitives()) copyPrimGeometry(coll, prim, collMesh);
      if (collMesh.listPrimitives().length === 0) { collMesh.dispose(); continue; }
    }

    collMesh.setExtras({ [AURA_COLLIDER_EXTRA]: extras });
    const collNode = coll.createNode(node.getName());
    collNode.setMesh(collMesh);
    collScene.addChild(collNode);
    written++;
  }

  if (written === 0) {
    ctx.flags.push("collider-no-nodes");
    return;
  }
  ctx.collisionDoc = coll;
});
