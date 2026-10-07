import { recordStep } from "./common.js";

/**
 * §6.3 step 5 — MikkTSpace tangents for every primitive that has a normal
 * map and no TANGENT. Requires TEXCOORD_0; primitives without UVs fail G8
 * (recorded on ctx for the gate report, §6.3 step 5 + §6.4 G8).
 */
export const stepTangents = recordStep("tangents", async (doc, ctx) => {
  const { generateTangents } = await import("mikktspace");

  let generated = 0;
  let missingUv = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const material = prim.getMaterial();
      if (!material?.getNormalTexture() || prim.getAttribute("TANGENT")) continue;
      const position = prim.getAttribute("POSITION");
      const normal = prim.getAttribute("NORMAL");
      const uv = prim.getAttribute("TEXCOORD_0");
      if (!position || !normal || !uv) {
        missingUv += 1;
        continue;
      }
      const pos = position.getArray() as Float32Array;
      const nrm = normal.getArray() as Float32Array;
      const uvs = uv.getArray() as Float32Array;
      // MikkTSpace needs non-indexed streams — unweld indices first.
      const indices = prim.getIndices()?.getArray();
      const idx = indices ? (Array.from(indices) as number[]) : undefined;
      const out = generateTangents(
        idx ? new Float32Array(idx.flatMap((i) => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]])) : pos,
        idx ? new Float32Array(idx.flatMap((i) => [nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]])) : nrm,
        idx ? new Float32Array(idx.flatMap((i) => [uvs[i * 2], uvs[i * 2 + 1]])) : uvs
      );
      if (!idx) {
        const accessor = doc.createAccessor("TANGENT")
          .setType("VEC4").setArray(new Float32Array(out));
        prim.setAttribute("TANGENT", accessor);
      } else {
        // Re-weld to vertex count: MikkTSpace gives identical tangents for
        // identical (pos,norm,uv) triples, so first occurrence per index wins.
        const first = new Map<number, number>();
        idx.forEach((v, j) => { if (!first.has(v)) first.set(v, j); });
        const welded = new Float32Array((pos.length / 3) * 4);
        for (const [v, j] of first) welded.set(out.subarray(j * 4, j * 4 + 4), v * 4);
        const accessor = doc.createAccessor("TANGENT")
          .setType("VEC4").setArray(welded);
        prim.setAttribute("TANGENT", accessor);
      }
      generated += 1;
    }
  }
  if (missingUv > 0) ctx.flags.push("G8:missing-texcoord0");
  ctx.log(`tangents: generated ${generated}, missing TEXCOORD_0 on ${missingUv} normal-mapped prims`);
});
