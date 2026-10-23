// Regenerates the compressed GLB fixtures used by tests/unit/parity/gltf-decoders.test.ts.
// Run from the repo root: node tests/fixtures/gltf/build-fixtures.mjs
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, KHRDracoMeshCompression, EXTMeshoptCompression, KHRTextureBasisu } from "@gltf-transform/extensions";
import { meshopt } from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptDecoder } from "meshoptimizer";
import draco3d from "draco3d";
import { createDefaultContainer, write as writeKtx2, VK_FORMAT_R8G8B8A8_UNORM } from "ktx-parse";

const out = dirname(fileURLToPath(import.meta.url));

/** UV sphere: positions + normals + uv0 + uint16/uint32 indices, deterministic. */
function sphere(widthSegments, heightSegments, radius) {
  const positions = [], normals = [], uvs = [], indices = [];
  for (let y = 0; y <= heightSegments; y += 1) {
    const v = y / heightSegments;
    for (let x = 0; x <= widthSegments; x += 1) {
      const u = x / widthSegments;
      const px = -Math.cos(u * Math.PI * 2) * Math.sin(v * Math.PI);
      const py = Math.cos(v * Math.PI);
      const pz = Math.sin(u * Math.PI * 2) * Math.sin(v * Math.PI);
      positions.push(px * radius, py * radius, pz * radius);
      normals.push(px, py, pz);
      uvs.push(u, 1 - v);
    }
  }
  const row = widthSegments + 1;
  for (let y = 0; y < heightSegments; y += 1) {
    for (let x = 0; x < widthSegments; x += 1) {
      const a = y * row + x + 1, b = y * row + x, c = (y + 1) * row + x, d = (y + 1) * row + x + 1;
      if (y !== 0) indices.push(a, b, d);
      if (y !== heightSegments - 1) indices.push(b, c, d);
    }
  }
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), uvs: new Float32Array(uvs), indices: new Uint32Array(indices) };
}

function buildDocument({ withTexture = false } = {}) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene("scene");
  const material = doc.createMaterial("mat").setBaseColorFactor([0.8, 0.4, 0.2, 1]);
  const mesh = doc.createMesh("spheres");
  // Two primitives with different vertex counts so a count-only match is not accidental.
  for (const [i, spec] of [{ w: 24, h: 12, r: 1 }, { w: 12, h: 8, r: 0.5 }].entries()) {
    const g = sphere(spec.w, spec.h, spec.r);
    const prim = doc.createPrimitive().setMaterial(material)
      .setAttribute("POSITION", doc.createAccessor(`pos${i}`).setType("VEC3").setArray(g.positions).setBuffer(buffer))
      .setAttribute("NORMAL", doc.createAccessor(`nrm${i}`).setType("VEC3").setArray(g.normals).setBuffer(buffer))
      .setAttribute("TEXCOORD_0", doc.createAccessor(`uv${i}`).setType("VEC2").setArray(g.uvs).setBuffer(buffer))
      .setIndices(doc.createAccessor(`idx${i}`).setType("SCALAR").setArray(g.indices).setBuffer(buffer));
    mesh.addPrimitive(prim);
  }
  scene.addChild(doc.createNode("n").setMesh(mesh));
  if (withTexture) {
    const container = createDefaultContainer();
    container.vkFormat = VK_FORMAT_R8G8B8A8_UNORM;
    container.typeSize = 1;
    container.pixelWidth = 4;
    container.pixelHeight = 4;
    container.levels = [{ levelData: new Uint8Array(4 * 4 * 4).fill(200), uncompressedByteLength: 64 }];
    const image = doc.createTexture("basis").setImage(writeKtx2(container)).setMimeType("image/ktx2");
    material.setBaseColorTexture(image);
  }
  return doc;
}

const dracoModules = { "draco3d.decoder": await draco3d.createDecoderModule(), "draco3d.encoder": await draco3d.createEncoderModule() };
await MeshoptEncoder.ready;
await MeshoptDecoder.ready;

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ ...dracoModules, "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });

{ // Draco (edgebreaker keeps connectivity; vertex count may be re-merged, so the test reads counts from the GLB itself)
  const doc = buildDocument();
  doc.createExtension(KHRDracoMeshCompression).setRequired(true).setEncoderOptions({ method: KHRDracoMeshCompression.EncoderMethod.EDGEBREAKER, encodeSpeed: 5, decodeSpeed: 5 });
  await writeFile(join(out, "draco-spheres.glb"), await io.writeBinary(doc));
}
{ // Meshopt
  const doc = buildDocument();
  doc.createExtension(EXTMeshoptCompression).setRequired(true);
  await doc.transform(meshopt({ encoder: MeshoptEncoder, level: "medium" }));
  await writeFile(join(out, "meshopt-spheres.glb"), await io.writeBinary(doc));
}
{ // KTX2 (container is real KTX2 via ktx-parse; pixels are RGBA8 — transcoding needs a GPU and is covered remotely)
  const doc = buildDocument({ withTexture: true });
  doc.createExtension(KHRTextureBasisu).setRequired(false);
  await writeFile(join(out, "ktx2-spheres.glb"), await io.writeBinary(doc));
}
console.log("wrote draco-spheres.glb, meshopt-spheres.glb, ktx2-spheres.glb");
