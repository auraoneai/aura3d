#!/usr/bin/env node
// Usage: node tools/frame-compare/compare.mjs <outDir> <label=log>...   (labels: pre, t, head)
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const [outDir, ...specs] = process.argv.slice(2);
const THRESH = 16;
const frames = {}; // label -> key -> Buffer
const states = {}; // label -> key -> string
const errors = {};
for (const spec of specs) {
  const [label, ...paths] = spec.split("=");
  frames[label] ??= {}; states[label] ??= {}; errors[label] ??= {};
  const chunks = {};
  for (const path of paths.join("=").split(",")) {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      let m;
      if ((m = line.match(/@@FC (\S+) (\S+) (\d+) (\d+) (\S+)/))) {
        const key = `${m[1]}/${m[2]}`;
        (chunks[key] ??= [])[Number(m[3])] = m[5];
      } else if ((m = line.match(/@@FCSTATE (\S+) (\S+) (.*)$/))) states[label][`${m[1]}/${m[2]}`] = m[3];
      else if ((m = line.match(/@@FCERRORS (\S+) (.*)$/))) errors[label][m[1]] = m[2];
    }
  }
  for (const [k, parts] of Object.entries(chunks)) frames[label][k] = Buffer.from(parts.join(""), "base64");
}

async function raw(buf) {
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}
async function diff(a, b) {
  const A = await raw(a), B = await raw(b);
  if (A.w !== B.w || A.h !== B.h) return { error: `size ${A.w}x${A.h} vs ${B.w}x${B.h}` };
  let sum = 0, over = 0, n = A.w * A.h;
  for (let i = 0; i < n; i++) {
    const o = i * 3;
    const la = 0.2126 * A.data[o] + 0.7152 * A.data[o + 1] + 0.0722 * A.data[o + 2];
    const lb = 0.2126 * B.data[o] + 0.7152 * B.data[o + 1] + 0.0722 * B.data[o + 2];
    sum += Math.abs(la - lb);
    if (Math.max(Math.abs(A.data[o] - B.data[o]), Math.abs(A.data[o + 1] - B.data[o + 1]), Math.abs(A.data[o + 2] - B.data[o + 2])) > THRESH) over++;
  }
  return { meanAbsLuma: +(sum / n).toFixed(3), pctOver: +((100 * over) / n).toFixed(3) };
}

mkdirSync(outDir, { recursive: true });
const rows = [];
const labels = Object.keys(frames);
for (const label of labels) {
  const dir = join(outDir, label); mkdirSync(dir, { recursive: true });
  for (const [k, buf] of Object.entries(frames[label])) if (k.endsWith(".a")) writeFileSync(join(dir, `${k.replace("/", "__")}.jpg`), buf);
}
const keys = new Set();
for (const l of labels) for (const k of Object.keys(frames[l])) if (k.endsWith(".a")) keys.add(k.slice(0, -2));
for (const k of [...keys].sort()) {
  const row = { frame: k };
  for (const l of labels) {
    const a = frames[l][`${k}.a`], b = frames[l][`${k}.b`];
    if (a && b) row[`noise_${l}`] = await diff(a, b);
  }
  for (const [x, y] of [["pre", "head"], ["pre", "t"], ["t", "head"]]) {
    const a = frames[x]?.[`${k}.a`], b = frames[y]?.[`${k}.a`];
    if (a && b) row[`${x}_vs_${y}`] = await diff(a, b);
  }
  const sx = states.pre?.[k], sy = states.head?.[k];
  if (sx !== undefined && sy !== undefined) row.simStateIdentical = sx === sy;
  rows.push(row);
}
writeFileSync(join(outDir, "metrics.json"), JSON.stringify({ threshold: THRESH, errors, rows }, null, 2));
for (const r of rows) console.log(r.frame.padEnd(46), "pre→head", JSON.stringify(r.pre_vs_head ?? null), "noise(pre)", JSON.stringify(r.noise_pre ?? null), "state", r.simStateIdentical);
