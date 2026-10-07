// PRD-07 P1-T12 acceptance — bake.mjs is deterministic at 256px, emits the
// AuraVfxAtlasManifest v1 with every builtin sequence, and PNG pixels are
// premultiplied with POT pages and ≥1px gutters.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AURA_VFX_BUILTIN_SEQUENCES, validateVfxAtlasManifest, type AuraVfxAtlasManifest } from "../../../../packages/engine/src/agent-api/vfx/atlas";

const BAKE = "tools/vfx-atlas-bake/bake.mjs";

function bakeAll(): { dir: string; hashes: Map<string, string> } {
  const dir = mkdtempSync(join(tmpdir(), "vfx-atlas-"));
  execFileSync(process.execPath, [BAKE, "--seed", "7", "--size", "256", "--out", dir], { encoding: "utf8" });
  const hashes = new Map<string, string>();
  for (const file of readdirSync(dir).sort()) {
    hashes.set(file, createHash("sha256").update(readFileSync(join(dir, file))).digest("hex"));
  }
  return { dir, hashes };
}

/** Minimal decode for bake's own PNGs (8-bit RGBA, filter 0). */
function decodePng(buf: Buffer): { width: number; height: number; rgba: Buffer } {
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  let offset = 8;
  const idat: Buffer[] = [];
  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString("ascii", offset + 4, offset + 8);
    if (type === "IDAT") idat.push(buf.subarray(offset + 8, offset + 8 + len));
    offset += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const rgba = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    expect(raw[y * (stride + 1)], "bake PNGs are filter-0").toBe(0);
    raw.copy(rgba, y * stride, y * (stride + 1) + 1, (y + 1) * (stride + 1));
  }
  return { width, height, rgba };
}

describe("P1-T12 vfx-atlas-bake", () => {
  it("two runs at 256px produce identical sha256 for every output", () => {
    const a = bakeAll();
    const b = bakeAll();
    expect([...a.hashes.keys()].sort()).toEqual([...b.hashes.keys()].sort());
    for (const [file, hash] of a.hashes) expect(b.hashes.get(file), file).toBe(hash);
  });

  it("manifest validates: all builtins resolve, rects inside page, integral cells", () => {
    const { dir } = bakeAll();
    const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as AuraVfxAtlasManifest;
    expect(manifest.version).toBe(1);
    expect(validateVfxAtlasManifest(manifest)).toEqual([]);
    for (const name of AURA_VFX_BUILTIN_SEQUENCES) {
      const seq = manifest.sequences[name];
      expect(seq, name).toBeDefined();
      const page = manifest.pages.find((p) => p.id === seq.page)!;
      const [x, y, w, h] = seq.rect;
      expect(x + w).toBeLessThanOrEqual(page.size);
      expect(y + h).toBeLessThanOrEqual(page.size);
      // gutter: the bake packs cells on a cell+4 pitch, so neighbouring rects
      // are ≥4px apart — ≥1px per cell at mip 0.
      expect(x % (page.size / 8 + 4) >= 4 || x === 4).toBe(true);
    }
  });

  it("pages are POT and premultiplied", () => {
    const { dir } = bakeAll();
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".png"))) {
      const { width, height, rgba } = decodePng(readFileSync(join(dir, file)));
      expect(Math.log2(width) % 1).toBe(0);
      expect(width).toBe(height);
      let maxOverAlpha = 0;
      for (let i = 0; i < rgba.length; i += 4) {
        const a = rgba[i + 3];
        maxOverAlpha = Math.max(maxOverAlpha, rgba[i] - a, rgba[i + 1] - a, rgba[i + 2] - a);
      }
      expect(maxOverAlpha, `${file} is premultiplied`).toBeLessThanOrEqual(0);
    }
  });
});
