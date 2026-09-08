/** Deterministic analytical RGBA vectors; asset registration is owned by the CLI. */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { deflateSync } from "node:zlib";
import { addAsset } from "../../packages/aura3d-cli/src/index.js";

const projectDir = resolve("tests/browser/fixtures/c1-extension");
mkdirSync(`${projectDir}/source`, { recursive: true });
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(name: string, data: Buffer): Buffer {
  const tag = Buffer.from(name); const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([tag, data])));
  return Buffer.concat([length, tag, data, crc]);
}
for (const variant of ["white", "rgba", "swapped", "direction", "decoyR", "decoyG", "decoyB", "decoyA"] as const) {
  const size = 32; const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    // Nonperiodic, distinct channels including variable alpha; no canvas premultiplication.
    const channels = [24 + ((x * 7 + y * 3) % 220), 20 + ((x * 3 + y * 11) % 230), 32 + ((x * 13 + y * 5) % 208), 30 + ((x * 5 + y * 17) % 220)];
    const values = variant === "white" ? [255, 255, 255, 255] : variant === "swapped" ? [channels[1]!, channels[2]!, channels[3]!, channels[0]!] : [...channels];
    if (variant === "direction") { values[0] = 255 - channels[1]!; values[1] = channels[0]!; }
    if (variant.startsWith("decoy")) {
      const preserved = "RGBA".indexOf(variant.slice(-1));
      for (let c = 0; c < 4; c++) if (c !== preserved) values[c] = 255 - values[c]!;
    }
    raw.set(values, y * (1 + size * 4) + 1 + x * 4);
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  const png = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
  writeFileSync(`${projectDir}/source/${variant}.png`, png);
  addAsset({ projectDir, file: `source/${variant}.png`, name: variant, type: "texture", outputDir: "generated", publicPath: "/tests/browser/fixtures/c1-extension/generated/", typegen: "assets.ts", sourceFamily: "authored-analytical-fixture", author: "Aura3D", provenanceEvidence: ["Producer: tools/root-textured-fixtures/index.ts", "Deterministic unpremultiplied RGBA channel vectors; no external content"], suitabilityReason: "Independent extension-map channel and UV test input", retrievedAt: "2026-09-05T00:00:00.000Z" });
}
for (const name of ["checker", "rough", "normal", "occlusion", "emissive"]) {
  const file = existsSync(`${projectDir}/../c1-${name}.png`) ? `../c1-${name}.png` : `generated/${readdirSync(`${projectDir}/generated`).find((entry) => entry.startsWith(`${name}.`) && entry.endsWith(".png"))}`;
  addAsset({ projectDir, file, name, type: "texture", outputDir: "generated", publicPath: "/tests/browser/fixtures/c1-extension/generated/", typegen: "assets.ts", sourceFamily: "repository-test-fixture", provenanceEvidence: [`Existing source: tests/browser/fixtures/c1-${name}.png`, "Registered by tools/root-textured-fixtures/index.ts; SHA256 derived from bytes"], retrievedAt: "2026-09-05T00:00:00.000Z" });
}
