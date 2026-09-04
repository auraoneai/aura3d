import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  assertNoMultiOwnerPixelExports,
  findMultiOwnerPixelExports,
  type ExportOwnershipRecord,
} from "../../../tools/root-path-integrity/pixel-export-policy";

function record(
  symbol: string,
  kind: "runtime" | "type",
  ownerPackage: string,
  subpath: string,
  signature: string
): ExportOwnershipRecord {
  return { symbol, kind, ownerPackage, subpath, signature };
}

const ENGINE_LEGACY_SHADOW =
  "class ShadowPass{shadowMap:ShadowMap;constructor(private readonly options: ShadowPassOptions);execute(context: RenderPassContext):ShadowPassResult;}";
const ENGINE_FRAMEGRAPH_SHADOW =
  "class ShadowPass{id:inferred;kind:inferred;reads:readonly string[];writes:readonly string[];constructor(private readonly options: ShadowPassOptions = {});}";

describe("T1b assertNoMultiOwnerPixelExports", () => {
  test("identical-signature re-exports across packages are one implementation", () => {
    const records = [
      record("Renderer", "runtime", "@aura3d/rendering", ".", "class Renderer{create();}"),
      record("Renderer", "runtime", "@aura3d/engine", "./rendering", "class Renderer{create();}"),
    ];
    expect(findMultiOwnerPixelExports(records)).toEqual([]);
  });

  test("alias markers and type-only occurrences are not implementations", () => {
    const records = [
      record("Renderer", "runtime", "@aura3d/engine", "./engine", "external-or-local-alias:Renderer"),
      record("Renderer", "runtime", "@aura3d/rendering", ".", "class Renderer{create();}"),
      record("PBRMaterial", "type", "@aura3d/engine", ".", "export interface PBRMaterial {}"),
      record("PBRMaterial", "type", "@aura3d/rendering", ".", "export interface PBRMaterial {}"),
    ];
    expect(findMultiOwnerPixelExports(records)).toEqual([]);
  });

  test("divergent ShadowPass implementations fail (captured live shapes)", () => {
    const records = [
      record("ShadowPass", "runtime", "@aura3d/engine", "./rendering", ENGINE_LEGACY_SHADOW),
      record("ShadowPass", "runtime", "@aura3d/engine", "./rendering/production-runtime", ENGINE_FRAMEGRAPH_SHADOW),
      record("ShadowPass", "runtime", "@aura3d/rendering", ".", ENGINE_LEGACY_SHADOW),
    ];
    const findings = findMultiOwnerPixelExports(records);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.symbol).toBe("ShadowPass");
    expect(findings[0]?.implementations).toHaveLength(2);
    expect(() => assertNoMultiOwnerPixelExports(records)).toThrow(/ShadowPass/);
  });

  test("non-pixel divergent symbols are out of scope for this gate", () => {
    const records = [
      record("someUtil", "runtime", "@aura3d/engine", ".", "function someUtil(a: string): void"),
      record("someUtil", "runtime", "@aura3d/rendering", ".", "function someUtil(a: number): void"),
    ];
    expect(findMultiOwnerPixelExports(records)).toEqual([]);
  });

  test("live audit: divergent set matches the ratified known set exactly", () => {
    const report = JSON.parse(
      readFileSync("tests/reports/public-surface-diff.json", "utf8")
    ) as SurfaceDiffReport;
    const generatedAt = Date.parse(report.generatedAt);
    if (Number.isFinite(generatedAt) && Date.now() - generatedAt > 14 * 24 * 3600 * 1000) {
      console.warn(
        `public-surface-diff.json is stale (generatedAt ${report.generatedAt}); regenerate with pnpm check:public-surface-diff.`
      );
    }
    const records: ExportOwnershipRecord[] = [];
    const after = report.packages?.after ?? report.packages?.current ?? [];
    for (const pkg of after) {
      for (const entry of pkg.exports ?? []) {
        for (const symbol of entry.symbols ?? []) {
          records.push({
            symbol: symbol.name,
            kind: symbol.kind,
            ownerPackage: pkg.name,
            subpath: entry.subpath,
            signature: symbol.signature ?? "",
          });
        }
      }
    }
    expect(records.length).toBeGreaterThan(1000);
    const findings = findMultiOwnerPixelExports(records);
    const live = findings.map((finding) => finding.symbol).sort();
    // Ratchet, not a waiver: these are the source-verified divergent
    // multi-owner pixel symbols on the audit date (each a real T1 dedup item:
    // legacy PostProcessPass shapes vs production framegraph/pipeline shapes
    // sharing one export name, plus the two A3DRenderer classes and the
    // cross-domain Scene/scene collisions). ANY change — a fix or a new
    // fork — fails this test until KNOWN_DIVERGENT_PIXEL_SYMBOLS is updated
    // with the new source-verified set. The audit-green box closes when this
    // list is empty, which requires barrel dedup (out of T-lane file scope).
    expect(live).toEqual([...KNOWN_DIVERGENT_PIXEL_SYMBOLS].sort());
    for (const finding of findings) {
      expect(finding.implementations.length).toBeGreaterThanOrEqual(2);
    }
  });
});

/**
 * Source-verified 2026-09-04 from tests/reports/public-surface-diff.json
 * (generated 2026-09-03). Reasons recorded per symbol:
 * - BloomPass/ShadowPass/ToneMappingPass: legacy `PostProcessPass` shape
 *   (engine ./rendering + rendering .) vs production shape (engine
 *   ./rendering/production-runtime).
 * - createMorphTargetPlan: full-plan overload vs (targetCount, slots) shape.
 * - A3DRenderer: advanced-runtime wrapper vs production-runtime class
 *   (backend/captureProof shape).
 * - Camera: @aura3d/scene class (re-exported by engine ./scene, identical)
 *   vs @aura3d/react function component.
 * - Scene: @aura3d/scene class vs @aura3d/react function component.
 * - scene: @aura3d/engine AuraSceneBuilder vs @aura3d/lean AuraLeanSceneBuilder.
 */
const KNOWN_DIVERGENT_PIXEL_SYMBOLS: readonly string[] = [
  "A3DRenderer",
  "BloomPass",
  "Camera",
  "Scene",
  "ShadowPass",
  "ToneMappingPass",
  "createMorphTargetPlan",
  "scene",
];

interface SurfaceDiffReport {
  readonly generatedAt: string;
  readonly packages?: {
    readonly after?: readonly SurfacePackage[];
    readonly current?: readonly SurfacePackage[];
  };
}

interface SurfacePackage {
  readonly name: string;
  readonly exports?: readonly SurfaceEntry[];
}

interface SurfaceEntry {
  readonly subpath: string;
  readonly symbols?: readonly SurfaceSymbol[];
}

interface SurfaceSymbol {
  readonly name: string;
  readonly kind: "runtime" | "type";
  readonly signature?: string;
}
