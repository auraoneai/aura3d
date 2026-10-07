import { describe, expect, it } from "vitest";
import { selectKTX2TargetFormat, type KTX2BasisTargetFormat } from "@aura3d/assets/contracts";
import table from "./ktx2-target-format.table.json";

interface TableRow {
  readonly caps: { readonly astc: boolean; readonly bptc: boolean; readonly etc2: boolean; readonly s3tc: boolean; readonly s3tcSrgb: boolean };
  readonly source: "uastc" | "etc1s";
  readonly hasAlpha: boolean;
  readonly colorSpace: "srgb" | "linear";
  readonly expect: KTX2BasisTargetFormat;
}

/**
 * Exhaustive truth table: every (capability set × source × alpha × colour
 * space) combination. The checked-in table is generated from PRD-05 §7.4's
 * chains — UASTC: astc-4x4 > bc7 > etc2-rgba8 > rgba8; ETC1S: etc2 >
 * bc1/bc3 > rgba8, with the sRGB-on-s3tc-without-s3tcSrgb escape to bptc.
 */
describe("selectKTX2TargetFormat truth table", () => {
  it("covers 256 rows", () => {
    expect(table).toHaveLength(256);
  });
  for (const row of table as unknown as TableRow[]) {
    it(`${JSON.stringify(row.caps)} ${row.source} alpha=${row.hasAlpha} ${row.colorSpace} → ${row.expect}`, () => {
      expect(selectKTX2TargetFormat(row.caps, row.source, row.hasAlpha, row.colorSpace)).toBe(row.expect);
    });
  }
});
