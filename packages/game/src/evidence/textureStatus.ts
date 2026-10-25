/** One textured-material row of `app.diagnostics().renderer.runtime.texturedMaterials`. */
export interface TexturedMaterialRow {
  readonly nodeName: string;
  readonly status: string;
}

export interface TextureUpgradeSummary {
  readonly total: number;
  readonly textured: number;
  readonly pending: number;
  readonly fallback: number;
  /** Rows the upgrade pass has not reached yet, or that carry no texture. */
  readonly none: number;
  /** Node name to status, for waiting on specific nodes. */
  readonly byNode: Readonly<Record<string, string>>;
}

/** Reads the engine's per-material texture upgrade status. Textures upgrade one material at a time after mount, so a frame taken early shows untextured (white) models. */
export function summarizeTextureUpgrade(diagnostics: unknown): TextureUpgradeSummary {
  const rows = ((diagnostics as { renderer?: { runtime?: { texturedMaterials?: readonly TexturedMaterialRow[] } } } | null | undefined)?.renderer?.runtime?.texturedMaterials) ?? [];
  const byNode: Record<string, string> = {};
  let textured = 0, pending = 0, fallback = 0, none = 0;
  for (const row of rows) {
    const previous = byNode[row.nodeName];
    // A node with several resources is as ready as its least ready resource.
    byNode[row.nodeName] = previous === undefined || previous === "textured" ? row.status : previous;
    if (row.status === "textured") textured += 1;
    else if (row.status === "pending") pending += 1;
    else if (row.status === "fallback") fallback += 1;
    else none += 1;
  }
  return { total: rows.length, textured, pending, fallback, none, byNode };
}

/** True when every node whose name matches `test` is textured (or has settled on its scalar fallback), and at least one matches. */
export function texturedNodesReady(summary: TextureUpgradeSummary, test: (nodeName: string) => boolean): { readonly ready: boolean; readonly waiting: readonly string[]; readonly matched: number } {
  const names = Object.keys(summary.byNode).filter(test);
  const waiting = names.filter((name) => summary.byNode[name] !== "textured" && summary.byNode[name] !== "fallback");
  return { ready: names.length > 0 && waiting.length === 0, waiting, matched: names.length };
}
