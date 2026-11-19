// Owner QA (Nov 18): from the bird's-eye chase the courier read as a driverless box; the Idol body's big orange roof parcel
// covered the whole cabin roof. This derives `assets/idol/gcCourierGlassRoof.glb` from the admitted `gcCourier.glb` by
// deleting the roof skin, the fused parcel, the front rack crossbar and the beacon inside the rack rails (the opening
// `COURIER_ROOF_OPENING` in ../courierCabin.ts). The game fills the opening with a tinted glass roof, a cabin tub, a
// seated driver and a smaller parcel at the rear of the rack (courierCabin.ts). Geometry outside the opening, the UVs and
// the textures are untouched; no generation, no spend.
// usage (repo root): node examples/drift-and-deliver-port/tools/derive-courier-glass-roof.mjs
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
const require = createRequire(new URL("../../../package.json", import.meta.url).pathname);
const { NodeIO } = require("@gltf-transform/core");
const { ALL_EXTENSIONS } = require("@gltf-transform/extensions");
const { prune, compactPrimitive } = require("@gltf-transform/functions");
const sharp = require("sharp");

// keep in step with COURIER_ROOF_OPENING (courierCabin.ts); the unit test checks the derived file against it
const OPENING = { halfX: 0.4, centreX: 0, zMin: -1.42, zMax: 0.26, yAbove: 1.4 };
// parcel strap ends and post stubs left standing on the rails: nothing of the rack rises above the rail tops (1.66 m)
const RAIL_TOP = { halfX: 0.62, zMin: -1.55, zMax: 0.3, yAbove: 1.665 };
// orange parcel-strap texels wrapped around the rails (same rack zone, above the roof skin)
const STRAP = { halfX: 0.62, zMin: -1.55, zMax: 0.3, yAbove: 1.5 };
const orange = (r, g, b) => r > 140 && r > g + 35 && g > b - 10 && b < 120;
const dir = new URL("../assets/idol/", import.meta.url).pathname;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(`${dir}gcCourier.glb`);
let removed = 0;
let kept = 0;
for (const prim of doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives())) {
  const pos = prim.getAttribute("POSITION");
  const uv = prim.getAttribute("TEXCOORD_0");
  const tex = prim.getMaterial().getBaseColorTexture();
  const img = await sharp(Buffer.from(tex.getImage())).raw().ensureAlpha().toBuffer({ resolveWithObject: true });
  const W = img.info.width, H = img.info.height;
  const t2 = [0, 0];
  const texel = (i) => {
    uv.getElement(i, t2);
    const px = Math.min(W - 1, Math.max(0, Math.floor(t2[0] * W))), py = Math.min(H - 1, Math.max(0, Math.floor(t2[1] * H)));
    const o = (py * W + px) * 4;
    return [img.data[o], img.data[o + 1], img.data[o + 2]];
  };
  const idx = prim.getIndices().getArray();
  const v = [0, 0, 0];
  const out = [];
  for (let t = 0; t < idx.length; t += 3) {
    let cx = 0, cy = 0, cz = 0;
    for (let k = 0; k < 3; k++) {
      pos.getElement(idx[t + k], v);
      cx += v[0] / 3; cy += v[1] / 3; cz += v[2] / 3;
    }
    const inside =
      (Math.abs(cx - OPENING.centreX) < OPENING.halfX && cz > OPENING.zMin && cz < OPENING.zMax && cy > OPENING.yAbove) ||
      (Math.abs(cx) < RAIL_TOP.halfX && cz > RAIL_TOP.zMin && cz < RAIL_TOP.zMax && cy > RAIL_TOP.yAbove) ||
      (Math.abs(cx) < STRAP.halfX && cz > STRAP.zMin && cz < STRAP.zMax && cy > STRAP.yAbove && [0, 1, 2].some((k) => orange(...texel(idx[t + k]))));
    if (inside) removed++;
    else { kept++; out.push(idx[t], idx[t + 1], idx[t + 2]); }
  }
  prim.getIndices().setArray(new Uint32Array(out));
  compactPrimitive(prim);
}
await doc.transform(prune());
const outFile = `${dir}gcCourierGlassRoof.glb`;
await io.write(outFile, doc);
const sha = createHash("sha256").update(readFileSync(outFile)).digest("hex");
console.log(JSON.stringify({ removed, kept, sizeBytes: statSync(outFile).size, sha256: sha }));
