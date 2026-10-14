import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const SOURCE = resolve(import.meta.dirname, "../../../public/aura-assets/showcaseTsukubaCircuit.8c139a57.glb");
const OUTPUT = resolve(import.meta.dirname, "../generated/turboTsukubaVisualTrack.glb");
const bytes = readFileSync(SOURCE);

if (bytes.toString("ascii", 0, 4) !== "glTF" || bytes.readUInt32LE(4) !== 2) {
  throw new Error("Expected a GLB 2.0 source asset.");
}

const jsonLength = bytes.readUInt32LE(12);
const jsonType = bytes.readUInt32LE(16);
if (jsonType !== 0x4e4f534a) throw new Error("First GLB chunk is not JSON.");
const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8").trim());
const binaryHeader = 20 + jsonLength;
const binaryLength = bytes.readUInt32LE(binaryHeader);
const binaryType = bytes.readUInt32LE(binaryHeader + 4);
if (binaryType !== 0x004e4942) throw new Error("Second GLB chunk is not BIN.");
const binary = bytes.subarray(binaryHeader + 8, binaryHeader + 8 + binaryLength);

// Preserve the complete hierarchy and its exact fitted bounds. Unlinking the
// fence/mountain roots also removed their contribution to model bounds, which
// made the safe renderer recenter and rescale the otherwise unchanged road.
// Muting only the two failed alpha-card materials removes their pixels while
// leaving road, kerbs, grass, barriers, buildings and drivable mesh untouched.
const mutedMaterialNames = new Set([
  "fence",
  "outerbarrier",
  "Mountains",
  "Forest",
  "Foilage",
  // The two Warehouse_etc meshes are non-drivable pit buildings. From the
  // elevated hairpin review camera, one roof clips the lower-left corner as a
  // large untextured slab. Keep the hierarchy/bounds but remove those pixels.
  "Warehouse_etc",
  // TSUKUB1 is the remaining cluster of non-drivable paddock buildings. One
  // roof still entered the same lower-left review corner after the warehouse
  // pair was muted; the road, kerbs, grass and concrete barriers use separate
  // materials and remain rendered.
  "TSUKUB1",
  "Grass",
  "Grass2",
  "BrownedGrass"
]);
const mutedMaterials = [];
for (const entry of json.materials ?? []) {
  if (!mutedMaterialNames.has(String(entry.name ?? ""))) continue;
  entry.alphaMode = "BLEND";
  entry.doubleSided = true;
  entry.pbrMetallicRoughness ??= {};
  entry.pbrMetallicRoughness.baseColorFactor = [1, 1, 1, 0];
  mutedMaterials.push(entry.name);
}
if (mutedMaterials.length !== mutedMaterialNames.size) {
  throw new Error(`Expected materials ${[...mutedMaterialNames].join(", ")}; muted ${mutedMaterials.join(", ")}`);
}
json.asset = {
  ...json.asset,
  generator: "Aura3D deterministic clean Tsukuba visual derivative",
  extras: {
    ...(json.asset?.extras ?? {}),
    aura3d: {
      sourceAsset: "showcaseTsukubaCircuit",
      sourceHash: "sha256-8c139a570143ce20a415803d67a46e92d65e2c711a310ad3891f71a69f8ce031",
      mutedNonDrivableMaterials: mutedMaterials
    }
  }
};

const align4 = (value) => (value + 3) & ~3;
const jsonRaw = Buffer.from(JSON.stringify(json), "utf8");
const jsonPadded = Buffer.alloc(align4(jsonRaw.length), 0x20);
jsonRaw.copy(jsonPadded);
const binaryPadded = Buffer.alloc(align4(binary.length));
binary.copy(binaryPadded);
const output = Buffer.alloc(12 + 8 + jsonPadded.length + 8 + binaryPadded.length);
output.write("glTF", 0, "ascii");
output.writeUInt32LE(2, 4);
output.writeUInt32LE(output.length, 8);
output.writeUInt32LE(jsonPadded.length, 12);
output.writeUInt32LE(0x4e4f534a, 16);
jsonPadded.copy(output, 20);
const outputBinaryHeader = 20 + jsonPadded.length;
output.writeUInt32LE(binaryPadded.length, outputBinaryHeader);
output.writeUInt32LE(0x004e4942, outputBinaryHeader + 4);
binaryPadded.copy(output, outputBinaryHeader + 8);

mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, output);
console.log(JSON.stringify({ source: SOURCE, output: OUTPUT, mutedMaterials, bytes: output.length }, null, 2));
