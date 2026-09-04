/**
 * muse3jsparity-PRD PART T box T1b — assertNoMultiOwnerPixelExports.
 *
 * Source-verified basis (2026-09-04 against
 * `tests/reports/public-surface-diff.json`, generated 2026-09-03):
 * - A naive "symbol in >1 package" gate can never go green: `@aura3d/engine`
 *   legitimately re-exports hundreds of `@aura3d/rendering`/`@aura3d/scene`/
 *   `@aura3d/assets` types (3224 multi-package names, mostly identical
 *   signatures). Type re-exports and `external-or-local-alias` markers are
 *   single implementations by construction and are NOT violations.
 * - A violation is a pixel-affecting RUNTIME symbol with >1 DISTINCT runtime
 *   implementation signature (aliases collapsed, whitespace normalized),
 *   whether across packages or across subpaths of one package. That is the
 *   1.5.1 "multi-owner symbols" defect class, and it is still live.
 *
 * This module is pure (no fs): tests feed it ownership records captured from
 * the surface-diff report schema ({name, kind, signature} per export subpath).
 */

export type ExportSymbolKind = "runtime" | "type";

export interface ExportOwnershipRecord {
  readonly symbol: string;
  readonly kind: ExportSymbolKind;
  readonly ownerPackage: string;
  readonly subpath: string;
  /** Full signature string from the surface-diff report; "" when absent. */
  readonly signature: string;
}

export interface PixelImplementation {
  readonly ownerPackage: string;
  readonly subpath: string;
  readonly signature: string;
}

export interface MultiOwnerPixelFinding {
  readonly symbol: string;
  readonly implementations: readonly PixelImplementation[];
}

/** Pixel-affecting runtime surface: renderers, passes, materials, lights. */
export const PIXEL_SYMBOL_PATTERN =
  /Renderer|RenderPass|RenderItem|RenderTarget|ForwardPass|WebGL2|WebGPU|Material|Light|Shadow|Texture|Skinned|Morph|PostProcess|Bloom|ToneMapping|FrameGraph|Scene|Camera|Mesh|IBL|PBR|Shader/i;

function isAliasMarker(signature: string): boolean {
  return signature.startsWith("external-or-local-alias:");
}

function normalizeSignature(signature: string): string {
  return signature.replace(/\s+/g, " ").trim();
}

/**
 * Pure scan. Groups records by symbol, drops type-only and alias-marked
 * occurrences, and reports pixel-affecting runtime symbols with more than one
 * distinct implementation signature.
 */
export function findMultiOwnerPixelExports(
  records: readonly ExportOwnershipRecord[],
  isPixelSymbol: (symbol: string) => boolean = (symbol) => PIXEL_SYMBOL_PATTERN.test(symbol)
): readonly MultiOwnerPixelFinding[] {
  const bySymbol = new Map<string, ExportOwnershipRecord[]>();
  for (const record of records) {
    const list = bySymbol.get(record.symbol);
    if (list) list.push(record);
    else bySymbol.set(record.symbol, [record]);
  }
  const findings: MultiOwnerPixelFinding[] = [];
  for (const [symbol, occurrences] of bySymbol) {
    if (!isPixelSymbol(symbol)) continue;
    const implementations = occurrences.filter(
      (occurrence) => occurrence.kind === "runtime" && !isAliasMarker(occurrence.signature)
    );
    const distinct = new Map<string, PixelImplementation>();
    for (const implementation of implementations) {
      const key = normalizeSignature(implementation.signature);
      if (!distinct.has(key)) {
        distinct.set(key, {
          ownerPackage: implementation.ownerPackage,
          subpath: implementation.subpath,
          signature: implementation.signature,
        });
      }
    }
    if (distinct.size > 1) {
      const owners = [...distinct.values()].sort((a, b) =>
        a.ownerPackage < b.ownerPackage
          ? -1
          : a.ownerPackage > b.ownerPackage
            ? 1
            : a.subpath < b.subpath
              ? -1
              : 1
      );
      findings.push({ symbol, implementations: owners });
    }
  }
  return findings.sort((a, b) => (a.symbol < b.symbol ? -1 : 1));
}

/** Fail-closed gate: throws listing every multi-owner pixel symbol. */
export function assertNoMultiOwnerPixelExports(
  records: readonly ExportOwnershipRecord[],
  isPixelSymbol?: (symbol: string) => boolean
): void {
  const findings = findMultiOwnerPixelExports(records, isPixelSymbol);
  if (findings.length > 0) {
    throw new Error(
      `Multi-owner pixel symbols (${findings.length}):\n${findings
        .map(
          (finding) =>
            `  ${finding.symbol}:\n${finding.implementations
              .map((implementation) => `    [${implementation.ownerPackage} ${implementation.subpath}]`)
              .join("\n")}`
        )
        .join("\n")}`
    );
  }
}
