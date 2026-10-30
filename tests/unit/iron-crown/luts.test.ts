/**
 * IRON CROWN grade LUTs (GU47 WP-15 IC47-P2): four venue `.cube` LUTs written by `scripts/make-luts.mjs`, admitted as
 * typed `lut` assets and bound through each look row's `grade.lut`. The served files must pass the CLI admission
 * check, regenerate byte for byte, keep luminance, and move hue the way the acceptance asks (Colosseum warm, Monastery
 * cold, >= 6 deg hue shift on a mid-tone).
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { AuraSceneNode } from "@aura3d/engine";
import { validateCubeLut } from "../../../packages/aura3d-cli/src/admission/cubeLut";
import { assets } from "../../../apps/showcase-iron-crown/src/aura-assets";
import { STAGE_LOOKS, STAGE_ORDER, stageLookNode } from "../../../apps/showcase-iron-crown/src/game/look";

const APP = path.resolve(__dirname, "../../../apps/showcase-iron-crown");
const LUT_KEYS = ["ironcrownLutDockDusk", "ironcrownLutColosseumOchre", "ironcrownLutAirbaseHaze", "ironcrownLutMonasteryFrost"] as const;
type LutKey = (typeof LUT_KEYS)[number];

function servedPath(key: LutKey): string {
  return path.join(APP, "public", assets[key].url.replace(/^\//, ""));
}

function parseCube(text: string): { size: number; rows: number[][] } {
  let size = 0;
  const rows: number[][] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("TITLE")) continue;
    if (line.startsWith("LUT_3D_SIZE")) {
      size = Number(line.split(/\s+/)[1]);
      continue;
    }
    rows.push(line.split(/\s+/).map(Number));
  }
  return { size, rows };
}

/** The LUT output for lattice indices (red fastest, `.cube` order). */
function at(cube: { size: number; rows: number[][] }, r: number, g: number, b: number): number[] {
  return cube.rows[r + g * cube.size + b * cube.size * cube.size]!;
}

function hueDeg([r, g, b]: number[]): number {
  const max = Math.max(r!, g!, b!);
  const min = Math.min(r!, g!, b!);
  if (max === min) return 0;
  const d = max - min;
  const h = max === r ? ((g! - b!) / d) % 6 : max === g ? (b! - r!) / d + 2 : (r! - g!) / d + 4;
  return (h * 60 + 360) % 360;
}

const luma = ([r, g, b]: number[]) => 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;

describe("IRON CROWN LUTs (IC47-P2)", () => {
  const tmp = mkdtempSync(path.join(tmpdir(), "ic-luts-"));
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));

  it("types the four LUTs as lut assets and passes the CLI admission check", () => {
    for (const key of LUT_KEYS) {
      expect(assets[key].type).toBe("lut");
      const text = readFileSync(servedPath(key), "utf8");
      expect(validateCubeLut(text)).toMatchObject({ size: 17, rows: 17 ** 3 });
    }
  });

  it("regenerates byte for byte from scripts/make-luts.mjs", () => {
    execFileSync(process.execPath, [path.join(APP, "scripts", "make-luts.mjs"), tmp]);
    for (const key of LUT_KEYS) {
      expect(readFileSync(path.join(tmp, `${key}.cube`), "utf8")).toBe(readFileSync(servedPath(key), "utf8"));
    }
  });

  it("binds a LUT on the four open-air venues only, through the look grade node", () => {
    const withLut = STAGE_ORDER.filter((id) => STAGE_LOOKS[id].grade.lut !== undefined);
    expect(withLut.sort()).toEqual(["bangkok-dock", "colosseum-ruins", "desert-airbase", "himalayan-monastery"]);
    for (const id of withLut) {
      const grade = (stageLookNode(STAGE_LOOKS[id]).children ?? []).find(
        (child: AuraSceneNode) => child.kind === "effect" && (child as { effect?: string }).effect === "color-grade"
      ) as { lut?: { url?: string } } | undefined;
      expect(grade?.lut?.url).toBe(STAGE_LOOKS[id].grade.lut!.url);
    }
    expect(STAGE_LOOKS["crown-arena"].grade.lut).toBeUndefined();
    expect(STAGE_LOOKS["neo-tokyo-rooftop"].grade.lut).toBeUndefined();
  });

  it("keeps luminance and moves hue: Colosseum warm, Monastery cold, mean hue shift >= 6 deg", () => {
    const cubes = Object.fromEntries(LUT_KEYS.map((key) => [key, parseCube(readFileSync(servedPath(key), "utf8"))])) as Record<
      LutKey,
      { size: number; rows: number[][] }
    >;
    const mid = 8; // 0.5 on a 17-point lattice
    for (const key of LUT_KEYS) {
      const grey = at(cubes[key], mid, mid, mid);
      expect(Math.abs(luma(grey) - 0.5)).toBeLessThan(0.01);
      // Mean hue shift over the lattice's mid-tone, mid-chroma colours (luma 0.25-0.75, chroma 0.06-0.3).
      let total = 0;
      let count = 0;
      for (let b = 0; b < 17; b++) {
        for (let g = 0; g < 17; g++) {
          for (let r = 0; r < 17; r++) {
            const input = [r / 16, g / 16, b / 16];
            const chroma = Math.max(...input) - Math.min(...input);
            const l = luma(input);
            if (chroma < 0.06 || chroma > 0.3 || l < 0.25 || l > 0.75) continue;
            total += Math.abs(((hueDeg(at(cubes[key], r, g, b)) - hueDeg(input) + 540) % 360) - 180);
            count += 1;
          }
        }
      }
      expect(total / count, key).toBeGreaterThanOrEqual(6);
    }
    const colosseum = at(cubes.ironcrownLutColosseumOchre, mid, mid, mid);
    expect(colosseum[0]! / colosseum[2]!).toBeGreaterThanOrEqual(1.15);
    const monastery = at(cubes.ironcrownLutMonasteryFrost, mid, mid, mid);
    expect(monastery[0]! / monastery[2]!).toBeLessThanOrEqual(0.92);
  });
});
