import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  buildReceipt,
  frameStats,
  parseReceiptLog,
  emitReceipt,
  validateReceipt,
  writeReceipt,
  type HarnessFrame
} from "../../support/motion-receipts";

// 1x1 opaque white PNG.
const WHITE_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4//8/AwAI/AL+hc2rNAAAAABJRU5ErkJggg==";

const frame: HarnessFrame = { name: "a", label: "white", pngBase64: WHITE_PNG, meanLuma: 255, nonBlackRatio: 1 };
const base = { capability: "animation-layers", version: "4.3.7", gitSha: "abc", renderer: "swiftshader", scene: "soldier idle + upper-body layer", tests: ["tests/browser/animation-root-receipts.spec.ts"], frames: [frame], measurements: { handDelta: 0.4 } };

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("motion receipts", () => {
  test("frameStats reports luma and the non-black share", () => {
    const rgba = [255, 255, 255, 255, 0, 0, 0, 255, 4, 4, 4, 255, 0, 255, 0, 255];
    const stats = frameStats(rgba);
    expect(stats.nonBlackRatio).toBeCloseTo(0.5, 6);
    expect(stats.meanLuma).toBeCloseTo((255 + 0 + (0.2126 + 0.7152 + 0.0722) * 4 + 0.7152 * 255) / 4, 4);
    expect(frameStats([])).toEqual({ meanLuma: 0, nonBlackRatio: 0 });
  });

  test("a built receipt satisfies the schema and hashes the PNG bytes", () => {
    const { receipt, pngs } = buildReceipt({ ...base, date: "2026-10-28T00:00:00.000Z" });
    expect(validateReceipt(receipt)).toEqual([]);
    expect(receipt.frames[0]!.file).toBe("evidence/receipts/animation-layers/frames/4.3.7-a.png");
    expect(receipt.frames[0]!.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(pngs.get(receipt.frames[0]!.file)!.length).toBeGreaterThan(0);
  });

  test("validateReceipt names every broken field", () => {
    const { receipt } = buildReceipt(base);
    const broken = { ...receipt, scene: "", tests: [], frames: [{ ...receipt.frames[0]!, sha256: "nope", nonBlackRatio: 0, file: "x.jpg" }] };
    const problems = validateReceipt(broken);
    expect(problems).toEqual(expect.arrayContaining([
      "scene must be a non-empty string",
      "tests must list at least one test path",
      "frames[0].file must be a .png path",
      "frames[0].sha256 must be 64 hex characters",
      "frames[0] is an all-black frame"
    ]));
    expect(validateReceipt(null)).toEqual(["receipt is not an object"]);
  });

  test("emit then parse recovers the receipt and writes identical files", () => {
    const { receipt, pngs } = buildReceipt(base);
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line: string) => { lines.push(line); });
    emitReceipt(receipt, pngs);
    const parsed = parseReceiptLog(`noise before\n${lines.join("\n")}\nnoise after`);
    expect(parsed.receipts).toEqual([receipt]);
    expect(parsed.pngs.get(receipt.frames[0]!.file)!.equals(pngs.get(receipt.frames[0]!.file)!)).toBe(true);

    const root = mkdtempSync(join(tmpdir(), "receipts-"));
    dirs.push(root);
    writeReceipt(root, parsed.receipts[0]!, parsed.pngs);
    const written = JSON.parse(readFileSync(join(root, "evidence/receipts/animation-layers/4.3.7.json"), "utf8"));
    expect(written.capability).toBe("animation-layers");
    expect(readFileSync(join(root, receipt.frames[0]!.file)).equals(pngs.get(receipt.frames[0]!.file)!)).toBe(true);
  });

  test("writeReceipt refuses a receipt that fails the schema", () => {
    const { receipt, pngs } = buildReceipt(base);
    const root = mkdtempSync(join(tmpdir(), "receipts-"));
    dirs.push(root);
    expect(() => writeReceipt(root, { ...receipt, gitSha: "" }, pngs)).toThrow(/gitSha must be a non-empty string/);
  });
});
