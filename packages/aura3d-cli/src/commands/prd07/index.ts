// PRD-07 P1-T19 — lane CLI commands and codemods (C-39).
// P6-T5: the codemod itself lives in ./codemods.ts (E25 report + rewrites).

import { registerCliCommand, registerCodemod } from "../../contracts/commands";
import { vfxPoolsToEffectsCodemod } from "./codemods";

export function registerPrd07Cli(): void {
  try {
    registerCliCommand({
      name: "vfx validate-atlas",
      owner: "prd07",
      summary: "Check a flipbook atlas JSON against the frame-grid contract",
      usage: "aura3d vfx validate-atlas <atlas.json>",
      async run(argv, io) {
        const file = argv[0];
        if (!file) {
          io.stderr("usage: aura3d vfx validate-atlas <atlas.json|manifest.json>");
          return 2;
        }
        try {
          const { readFile } = await import("node:fs/promises");
          const path = await import("node:path");
          const zlib = await import("node:zlib");
          const raw = await readFile(`${io.cwd}/${file}`, "utf8");
          const atlas = JSON.parse(raw) as {
            columns?: number; rows?: number; frames?: number;
            version?: number;
            pages?: readonly { id: string; uri: string; size: number; premultiplied?: boolean; colorSpace?: string }[];
            sequences?: Readonly<Record<string, { page: string; rect: readonly number[]; columns: number; rows: number; frames: number }>>;
          };
          const errors: string[] = [];

          // Flat per-sequence JSON (legacy path): grid checks only.
          if (!atlas.pages) {
            if (!Number.isInteger(atlas.columns) || (atlas.columns ?? 0) < 1) errors.push("columns must be an integer >= 1");
            if (!Number.isInteger(atlas.rows) || (atlas.rows ?? 0) < 1) errors.push("rows must be an integer >= 1");
            if (atlas.frames !== undefined && atlas.frames > (atlas.columns ?? 0) * (atlas.rows ?? 0)) errors.push("frames exceeds columns*rows");
          } else {
            // AuraVfxAtlasManifest v1: pages premultiplied + POT, rects inside
            // page, ≥1px cell gutter, integral frames.
            const dir = path.dirname(path.resolve(io.cwd, file));
            const pageById = new Map((atlas.pages ?? []).map((p) => [p.id, p]));
            const decodePng = (buf: Buffer): { width: number; height: number; rgba: Buffer } => {
              const width = buf.readUInt32BE(16);
              const height = buf.readUInt32BE(20);
              let offset = 8;
              const idat: Buffer[] = [];
              while (offset < buf.length) {
                const len = buf.readUInt32BE(offset);
                if (buf.toString("ascii", offset + 4, offset + 8) === "IDAT") idat.push(buf.subarray(offset + 8, offset + 8 + len));
                offset += 12 + len;
              }
              const rawScan = zlib.inflateSync(Buffer.concat(idat));
              const stride = width * 4;
              const rgba = Buffer.alloc(stride * height);
              for (let y = 0; y < height; y++) {
                if (rawScan[y * (stride + 1)] !== 0) throw new Error("unsupported PNG filter (bake writes filter-0 rows)");
                rawScan.copy(rgba, y * stride, y * (stride + 1) + 1, (y + 1) * (stride + 1));
              }
              return { width, height, rgba };
            };
            for (const page of atlas.pages ?? []) {
              const uriPng = page.uri.replace(/\.ktx2$/, ".png");
              if (!page.uri.endsWith(".ktx2") && !page.uri.endsWith(".png")) errors.push(`${page.id}: uri must be .png or .ktx2`);
              const pngPath = path.join(dir, page.uri.endsWith(".ktx2") ? uriPng : page.uri);
              let decoded;
              try {
                decoded = decodePng(await readFile(pngPath));
              } catch (error) {
                errors.push(`${page.id}: cannot decode ${pngPath} (${(error as Error).message})`);
                continue;
              }
              const pot = (n: number) => n > 0 && (n & (n - 1)) === 0;
              if (!pot(decoded.width) || !pot(decoded.height)) errors.push(`${page.id}: ${decoded.width}×${decoded.height} not power-of-two`);
              if (decoded.width !== page.size || decoded.height !== page.size) errors.push(`${page.id}: pixel size ${decoded.width}×${decoded.height} ≠ manifest size ${page.size}`);
              let over = 0;
              for (let i = 0; i < decoded.rgba.length; i += 4) {
                const a = decoded.rgba[i + 3];
                over = Math.max(over, decoded.rgba[i] - a, decoded.rgba[i + 1] - a, decoded.rgba[i + 2] - a);
              }
              if (over > 0) errors.push(`${page.id}: not premultiplied (rgb exceeds alpha by ${over})`);
            }
            const rects: { name: string; x0: number; y0: number; x1: number; y1: number }[] = [];
            for (const [name, seq] of Object.entries(atlas.sequences ?? {})) {
              const page = pageById.get(seq.page);
              if (!page) { errors.push(`${name}: unknown page ${seq.page}`); continue; }
              const [x, y, w, h] = seq.rect;
              if (x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > page.size || y + h > page.size) errors.push(`${name}: rect outside page ${seq.page}`);
              if (!Number.isInteger(w / seq.columns) || !Number.isInteger(h / seq.rows)) errors.push(`${name}: non-integral cell size`);
              if (seq.frames > seq.columns * seq.rows) errors.push(`${name}: frames exceeds grid`);
              rects.push({ name, x0: x, y0: y, x1: x + w, y1: y + h });
            }
            for (let i = 0; i < rects.length; i++) {
              for (let j = i + 1; j < rects.length; j++) {
                const a = rects[i], b = rects[j];
                const overlapX = a.x0 < b.x1 && b.x0 < a.x1;
                const overlapY = a.y0 < b.y1 && b.y0 < a.y1;
                if (overlapX && overlapY) {
                  errors.push(`${a.name}/${b.name}: rects overlap`);
                  continue;
                }
                const gap = overlapX
                  ? Math.max(b.y0 - a.y1, a.y0 - b.y1)
                  : overlapY
                    ? Math.max(b.x0 - a.x1, a.x0 - b.x1)
                    : Math.min(Math.max(b.x0 - a.x1, a.x0 - b.x1), Math.max(b.y0 - a.y1, a.y0 - b.y1));
                if (gap < 1) errors.push(`${a.name}/${b.name}: gutter ${gap}px < 1px`);
              }
            }
          }
          if (errors.length) {
            for (const e of errors) io.stderr(`invalid atlas: ${e}`);
            return 1;
          }
          if (!atlas.pages) io.stdout(`atlas ok: ${atlas.columns}x${atlas.rows} (${atlas.frames ?? atlas.columns! * atlas.rows!} frames)`);
          else io.stdout(`manifest ok: ${atlas.pages.length} page(s), ${Object.keys(atlas.sequences ?? {}).length} sequences`);
          return 0;
        } catch (error) {
          io.stderr(`atlas read failed: ${(error as Error).message}`);
          return 1;
        }
      }
    });
  } catch (error) {
    if (!(error instanceof Error && error.message.startsWith("CLI_COMMAND_DUPLICATE"))) throw error;
  }

  try {
    registerCodemod(vfxPoolsToEffectsCodemod());
  } catch (error) {
    if (!(error instanceof Error && error.message.startsWith("CODEMOD_DUPLICATE"))) throw error;
  }
}
