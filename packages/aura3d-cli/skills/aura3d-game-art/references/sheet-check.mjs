#!/usr/bin/env node
// Flipbook sprite-sheet pre-flight for Aura3D `effects.flipbook`.
// Reads a PNG header (no dependencies) and checks that the sheet divides evenly
// into columns x rows, that the declared frame count fits the grid, and that the
// PNG carries an alpha channel. It does not look at pixels; a transparent
// background and clean frame edges still need a visual check.
//
// Usage: node sheet-check.mjs sheet.png --columns 8 --rows 4 [--frames 30]
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const file = args[0];
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : undefined;
};
const columns = opt("columns");
const rows = opt("rows");
if (!file || !columns || !rows) {
  console.error("usage: node sheet-check.mjs sheet.png --columns N --rows N [--frames N]");
  process.exit(2);
}
const frames = opt("frames") ?? columns * rows;

const buf = readFileSync(file);
const PNG_SIGNATURE = "89504e470d0a1a0a";
const failures = [];
if (buf.subarray(0, 8).toString("hex") !== PNG_SIGNATURE || buf.toString("ascii", 12, 16) !== "IHDR") {
  console.log(JSON.stringify({ ok: false, file, failures: ["not a PNG (flipbook sheets must be PNG with alpha)"] }, null, 2));
  process.exit(1);
}
const width = buf.readUInt32BE(16);
const height = buf.readUInt32BE(20);
const colorType = buf[25];
// PNG color types 4 (gray+alpha) and 6 (RGBA) carry alpha; a tRNS chunk adds it to palette images.
const hasAlpha = colorType === 4 || colorType === 6 || buf.includes(Buffer.from("tRNS"));

for (const [name, value] of [["columns", columns], ["rows", rows], ["frames", frames]]) {
  if (!Number.isInteger(value) || value <= 0) failures.push(`${name} must be a positive integer`);
}
if (width % columns !== 0) failures.push(`width ${width} is not divisible by ${columns} columns`);
if (height % rows !== 0) failures.push(`height ${height} is not divisible by ${rows} rows`);
if (frames > columns * rows) failures.push(`frames ${frames} exceed sheet capacity ${columns * rows}`);
if (!hasAlpha) failures.push("PNG has no alpha channel; the background cannot be transparent");

const cell = [width / columns, height / rows];
console.log(JSON.stringify({
  ok: failures.length === 0,
  file,
  size: [width, height],
  grid: [columns, rows],
  cell,
  frames,
  emptyCells: columns * rows - frames,
  hasAlpha,
  failures
}, null, 2));
process.exitCode = failures.length === 0 ? 0 : 1;
