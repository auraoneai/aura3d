export function renderBundleSizeMarkdown(results) {
  const lines = [
    "# Aura3D Bundle Sizes",
    "",
    "Generated reproducibly by `pnpm check:bundle-size` from the current source and `tests/reports/bundle-size.json`.",
    "",
    "Measurement method: esbuild ESM splitting, minify, statically reachable critical-path",
    "chunks, conservative per-chunk gzip sum, and `size-limit` against the concatenated gzip members.",
    "",
    "| Target | JavaScript Bytes | Gzip Bytes | Budget | Result |",
    "|---|---:|---:|---:|---:|",
    ...results.map((result) => [
      `\`${result.label}\``,
      formatBytes(result.jsBytes),
      formatBytes(result.gzipBytes),
      formatBytes(result.budget),
      result.enforced
        ? result.gzipBytes <= result.budget && result.sizeLimitPassed ? "pass" : "fail"
        : "informational"
    ].join(" | ")).map((row) => `| ${row} |`),
    "",
    "The authoritative machine-readable report is",
    "`tests/reports/bundle-size.json`.",
    "",
    /*
     * This standing note is emitted by the generator, not hand-maintained in the file.
     *
     * `BUNDLE_SIZES.md` is fully overwritten on every run, so the note previously lived only in the
     * committed markdown and was silently deleted the first time anyone regenerated the report —
     * which is exactly what happened here. A policy that disappears when a tool runs is not a
     * policy. Emitting it keeps it true for every future regeneration.
     */
    "## Production Renderer Bridge Watch",
    "",
    "Any PR that routes the public safe API through production rendering, skinned animation, PBR",
    "material parity, shadows, postprocess, or WebGPU paths must regenerate this report and call out",
    "the bundle delta explicitly. Do not hide renderer-capability work inside showcase patches",
    "without a bundle-size review.",
    "",
    "## Known Overrun",
    "",
    "The `compatibility-root-observation` target retains the compatibility-heavy root as an",
    "informational measurement rather than pretending its bytes disappeared. WS-2.2 explicitly",
    "keeps that root intact for existing consumers; the unchanged 80,000 B new-app budget applies",
    "to `@aura3d/lean`. New product and game apps use `@aura3d/lean/product` or `@aura3d/lean/game`. Those",
    "entries pass the canonical Three.js-relative budgets in `tests/reports/bundle-scenarios.json`,",
    "including a real GLB loader and the solver-free deterministic arcade runtime. Physical simulation",
    "remains an explicit optional-package workload rather than entering the game starter critical path.",
    "This report keeps the separate",
    "root/template debt visible. Do not raise either set of budgets to manufacture a pass.",
    ""
  ];
  return lines.join("\n");
}

function formatBytes(value) {
  return new Intl.NumberFormat("en-US").format(value);
}
