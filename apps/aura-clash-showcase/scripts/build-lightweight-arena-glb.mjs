#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(scriptDir, "..");
const sourceDir = resolve(appRoot, "assets/quaternius-source/selected/arena/neon-downtown/gltf");
const sourcePath = resolve(sourceDir, "Building_Small_1.gltf");
const outputPath = resolve(appRoot, "assets/source/arenas/arena-rooftop-building.glb");
const document = JSON.parse(readFileSync(sourcePath, "utf8"));

if (!Array.isArray(document.buffers) || document.buffers.length !== 1 || !document.buffers[0]?.uri) {
  throw new Error("Expected one URI-backed buffer in the lightweight arena source.");
}

let binary = readFileSync(resolve(sourceDir, document.buffers[0].uri));
// This public gameplay backdrop keeps the source mesh while omitting the source pack's 19
// full-resolution texture maps, so the live route can load beside two animated fighter rigs
// without a 40+ MB spike. The complete city asset remains available for offline/poster work.
//
// Stripping the maps is not sufficient on its own. In glTF, `metallicFactor` and
// `roughnessFactor` *multiply* the metallic-roughness texture, and both default to **1.0** when
// absent. Every textured material in this source omits those factors and relies entirely on its
// ORM map, so deleting the map left `metallicFactor: 1.0` -- a fully metallic surface. The
// renderer computes `kd = (1 - metallic)`, which zeroes the diffuse term, so with no environment
// map the whole building rendered as a black mirror: the "typed arena" submitted draws but was
// invisible behind the fighters. `baseColorFactor` has the same problem: absent means white.
//
// So the factors have to carry what the textures used to. These values are *measured* from the
// source PNGs that are being dropped -- mean base colour converted sRGB->linear, and mean
// metallic/roughness read from the ORM packing (G = roughness, B = metallic) -- not chosen by eye.
// Re-run `tmp/sample-tex.mjs` / `tmp/sample-orm.mjs` style sampling if the source pack changes.
const MEASURED_MATERIAL_FACTORS = {
  MI_RedBrick_Pale: { baseColorFactor: [0.1544, 0.083, 0.0542, 1], metallicFactor: 0, roughnessFactor: 0.839 },
  MI_Trim: { baseColorFactor: [0.2888, 0.2424, 0.1329, 1], metallicFactor: 0, roughnessFactor: 0.812 },
  MI_InteriorWall: { baseColorFactor: [0.127, 0.1153, 0.1044, 1], metallicFactor: 0.203, roughnessFactor: 0.826 },
  MI_Trim_MetalConcrete: { baseColorFactor: [0.127, 0.1153, 0.1044, 1], metallicFactor: 0.203, roughnessFactor: 0.826 },
  MI_Trim_Dark: { baseColorFactor: [0.0332, 0.0247, 0.0295, 1], metallicFactor: 0, roughnessFactor: 0.839 },
  MI_Concrete: { baseColorFactor: [0.2129, 0.203, 0.1943, 1], metallicFactor: 0, roughnessFactor: 0.879 },
  MI_Asphalt: { baseColorFactor: [0.0435, 0.0418, 0.0401, 1], metallicFactor: 0, roughnessFactor: 0.879 },
  MI_InteriorFloor: { baseColorFactor: [0.4619, 0.3619, 0.2311, 1], metallicFactor: 0, roughnessFactor: 0.901 },
  // Lit interiors read as emissive window panels once their maps are gone, which is what keeps
  // the façade from reading as one flat mass at night.
  MI_FakeInterior_1: { baseColorFactor: [0.2312, 0.181, 0.1359, 1], metallicFactor: 0, roughnessFactor: 0.5, emissiveFactor: [0.2312, 0.181, 0.1359] },
  MI_FakeInterior_2: { baseColorFactor: [0.1662, 0.1506, 0.1324, 1], metallicFactor: 0, roughnessFactor: 0.5, emissiveFactor: [0.1662, 0.1506, 0.1324] },
  MI_FakeInterior_3: { baseColorFactor: [0.1662, 0.1506, 0.1324, 1], metallicFactor: 0, roughnessFactor: 0.5, emissiveFactor: [0.1662, 0.1506, 0.1324] },
  MI_FakeInterior_4: { baseColorFactor: [0.2312, 0.181, 0.1359, 1], metallicFactor: 0, roughnessFactor: 0.5, emissiveFactor: [0.2312, 0.181, 0.1359] }
  // MI_Glass already declares explicit factors in the source and is left untouched.
};

const unmappedTexturedMaterials = [];
for (const material of document.materials ?? []) {
  const pbr = material.pbrMetallicRoughness;
  const hadTexture = Boolean(pbr?.baseColorTexture || pbr?.metallicRoughnessTexture);
  if (pbr) {
    delete pbr.baseColorTexture;
    delete pbr.metallicRoughnessTexture;
  }
  delete material.normalTexture;
  delete material.occlusionTexture;
  delete material.emissiveTexture;

  const measured = MEASURED_MATERIAL_FACTORS[material.name];
  if (measured) {
    material.pbrMetallicRoughness = { ...(pbr ?? {}), ...measured };
    if (measured.emissiveFactor) material.emissiveFactor = measured.emissiveFactor;
    delete material.pbrMetallicRoughness.emissiveFactor;
  } else if (hadTexture) {
    // Fail loudly rather than silently shipping a black-mirror material.
    unmappedTexturedMaterials.push(material.name ?? "(unnamed)");
  }
}
if (unmappedTexturedMaterials.length > 0) {
  throw new Error(
    `Lightweight arena build dropped textures for materials with no measured replacement factors: ${unmappedTexturedMaterials.join(", ")}. ` +
    "Add measured baseColor/metallic/roughness factors, or the material will inherit glTF's metallicFactor 1.0 default and render black."
  );
}
delete document.images;
delete document.textures;
delete document.samplers;

binary = appendAligned(binary, 4);
document.buffers = [{ byteLength: binary.length }];
const json = appendAligned(Buffer.from(JSON.stringify(document)), 4, 0x20);
const totalLength = 12 + 8 + json.length + 8 + binary.length;
const glb = Buffer.alloc(totalLength);
let offset = 0;
glb.writeUInt32LE(0x46546c67, offset); offset += 4;
glb.writeUInt32LE(2, offset); offset += 4;
glb.writeUInt32LE(totalLength, offset); offset += 4;
glb.writeUInt32LE(json.length, offset); offset += 4;
glb.writeUInt32LE(0x4e4f534a, offset); offset += 4;
json.copy(glb, offset); offset += json.length;
glb.writeUInt32LE(binary.length, offset); offset += 4;
glb.writeUInt32LE(0x004e4942, offset); offset += 4;
binary.copy(glb, offset);

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, glb);
console.log(`[aura-clash lightweight arena] Wrote ${outputPath} (${glb.length} bytes).`);

function appendAligned(buffer, alignment, fill = 0) {
  const padding = (alignment - (buffer.length % alignment)) % alignment;
  return padding === 0 ? buffer : Buffer.concat([buffer, Buffer.alloc(padding, fill)]);
}
