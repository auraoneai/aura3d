import { Primitive, type Document } from "@gltf-transform/core";
import { MeshoptSimplifier } from "meshoptimizer";
import { MSFT_LOD_EXTENSION_NAME, MSFT_SCREENCOVERAGE_EXTRA, msftLodExtension } from "../extensions/msft-lod.js";
import { hasAncestorInScene, recordStep } from "./common.js";

/**
 * §6.3 step 6 — LOD chains via `MeshoptSimplifier.simplifyWithAttributes`.
 *
 * Per profile.lodRatios (index 0 is LOD0), each mesh-bearing scene node gains
 * sibling LOD nodes that share the original vertex accessors and carry only
 * new index buffers — JOINTS/WEIGHTS therefore stay valid for skinned meshes.
 * LOD nodes are intentionally NOT added to any scene: readers that ignore
 * `MSFT_lod` (three.js r185 GLTFLoader) render LOD0 only, while lane runtime
 * resolves `node.extensions.MSFT_lod.ids` by node index.
 *
 * - `targetError` per level comes from `profile.lodTargetErrors` (.01/.02/.05).
 * - `LockBorder` when the source mesh has >1 primitive so per-primitive
 *   chains do not crack at shared borders.
 * - Attribute weights: NORMAL 0.5, TEXCOORD_0 1.0 (§6.3.6).
 * - `lod-target-missed` flag when achieved index count > 1.2 × target.
 * - Skinned meshes cap at 2 total levels.
 * - `extras.MSFT_screencoverage` records `profile.screenCoverage` sliced to
 *   the achieved level count.
 */

interface WeightedAttrs {
  readonly data: Float32Array;
  readonly stride: number;
  readonly weights: number[];
}

function weightedAttributes(prim: Primitive, vertexCount: number): WeightedAttrs {
  const normal = prim.getAttribute("NORMAL")?.getArray();
  const uv = prim.getAttribute("TEXCOORD_0")?.getArray();
  const stride = (normal ? 3 : 0) + (uv ? 2 : 0);
  if (stride === 0) return { data: new Float32Array(0), stride: 0, weights: [] };
  const data = new Float32Array(vertexCount * stride);
  const weights: number[] = [];
  if (normal) weights.push(0.5, 0.5, 0.5);
  if (uv) weights.push(1.0, 1.0);
  for (let v = 0; v < vertexCount; v++) {
    let o = v * stride;
    if (normal) { data[o++] = normal[v * 3]; data[o++] = normal[v * 3 + 1]; data[o++] = normal[v * 3 + 2]; }
    if (uv) { data[o++] = uv[v * 2]; data[o++] = uv[v * 2 + 1]; }
  }
  return { data, stride, weights };
}

function simplifyPrimitive(doc: Document, prim: Primitive, ratio: number, targetError: number, lockBorder: boolean): { primitive: Primitive; achieved: number; target: number } | null {
  const indices = prim.getIndices();
  const position = prim.getAttribute("POSITION");
  if (!indices || !position) return null;
  const indexArray = indices.getArray();
  const posArray = position.getArray();
  if (!indexArray || !posArray || prim.getMode() !== Primitive.Mode.TRIANGLES) return null;

  const sourceIndices = indexArray instanceof Uint32Array ? indexArray : new Uint32Array(indexArray);
  const vertexCount = posArray.length / 3;
  const target = Math.max(3, Math.floor(sourceIndices.length * ratio) - (Math.floor(sourceIndices.length * ratio) % 3));
  const attrs = weightedAttributes(prim, vertexCount);
  const flags = lockBorder ? (["LockBorder"] as const) : ([] as const);
  const [newIndices] = MeshoptSimplifier.simplifyWithAttributes(
    sourceIndices,
    posArray as Float32Array,
    3,
    attrs.data,
    attrs.stride,
    attrs.weights,
    null,
    target,
    targetError,
    [...flags]
  );

  const indicesAccessor = doc.createAccessor(`${prim.getIndices()!.getName()}.lod`).setType(indices.getType()).setArray(newIndices);
  const lodPrim = doc.createPrimitive().setMode(Primitive.Mode.TRIANGLES).setIndices(indicesAccessor).setMaterial(prim.getMaterial());
  for (const semantic of prim.listSemantics()) lodPrim.setAttribute(semantic, prim.getAttribute(semantic));
  for (const target_ of prim.listTargets()) lodPrim.addTarget(target_);
  return { primitive: lodPrim, achieved: newIndices.length, target };
}

export const stepLod = recordStep("lod", async (doc, ctx) => {
  const ratios = ctx.profile.lodRatios;
  if (ratios.length < 2) return;
  await MeshoptSimplifier.ready;
  const ext = msftLodExtension(doc);
  const root = doc.getRoot();

  // Snapshot scene nodes first — LOD nodes are created out-of-scene and must
  // not be revisited as source nodes.
  const sourceNodes = root.listNodes().filter((n) => n.getMesh() && root.listScenes().some((s) => s.listChildren().length && hasAncestorInScene(n, root)));

  for (const node of sourceNodes) {
    const mesh = node.getMesh()!;
    const prims = mesh.listPrimitives();
    const skinned = node.getSkin() !== null || prims.some((p) => p.getAttribute("JOINTS_0") !== null);
    const maxLevels = skinned ? Math.min(2, ratios.length) : ratios.length;
    if (maxLevels < 2) continue;

    const lodProp = ext.createLodNode();
    let levels = 1;
    for (let level = 1; level < maxLevels; level++) {
      const lodMesh = doc.createMesh(`${mesh.getName()}.lod${level}`);
      const lockBorder = prims.length > 1;
      let any = false;
      for (const prim of prims) {
        const result = simplifyPrimitive(doc, prim, ratios[level]!, ctx.profile.lodTargetErrors[level - 1] ?? 0.05, lockBorder);
        if (!result) continue;
        lodMesh.addPrimitive(result.primitive);
        any = true;
        if (result.achieved > Math.ceil(result.target * 1.2)) ctx.flags.push("lod-target-missed");
      }
      if (!any) { lodMesh.dispose(); break; }
      const lodNode = doc.createNode(`${node.getName()}.lod${level}`);
      lodNode.setMesh(lodMesh);
      lodProp.addLod(lodNode);
      levels++;
    }
    if (lodProp.listLods().length === 0) { lodProp.dispose(); continue; }
    node.setExtension(MSFT_LOD_EXTENSION_NAME, lodProp);
    node.setExtras({ ...node.getExtras(), [MSFT_SCREENCOVERAGE_EXTRA]: ctx.profile.screenCoverage.slice(0, levels) });
  }
});

