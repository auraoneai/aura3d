export function renderBundleSizeMarkdown(results, candidate = { status: "unbound", reason: "No candidate supplied" }, reportPath = "tests/reports/bundle-size.json") {
  const candidateLines = candidate.status === "bound"
    ? [
        `Candidate: \`${candidate.releasePlan.path}\` (SHA-256 \`${candidate.releasePlan.sha256}\`), version \`${candidate.version}\`.`,
        `Source revision: \`${candidate.source.commit}\`; source fingerprint: \`${candidate.source.fingerprint}\`; lock SHA-256: \`${candidate.source.lockfileSha256}\`.`
      ]
    : [`Candidate: unbound (${candidate.reason}). These observations cannot establish a release pass.`];
  const lines = [
    "# Aura3D Bundle Sizes",
    "",
    "Generated reproducibly by `pnpm check:bundle-size` from the current source and `tests/reports/bundle-size.json`.",
    "",
    "Measurement method: esbuild ESM splitting, minify, statically reachable critical-path",
    "chunks, conservative per-chunk gzip sum, and `size-limit` against the concatenated gzip members.",
    "",
    ...candidateLines,
    "",
    "The enforced core row bundles the public barrel with every export as an entry point;",
    "the informational one-cube row instead measures a consumer importing only its used API.",
    "",
    "| Target | JavaScript Bytes | Gzip Bytes | Budget | Result |",
    "|---|---:|---:|---:|---:|",
    ...results.map((result) => [
      `\`${result.label}\``,
      formatBytes(result.jsBytes),
      formatBytes(result.gzipBytes),
      formatBytes(result.budget),
      result.enforced
        ? candidate.status !== "bound"
          ? result.gzipBytes <= result.budget && result.sizeLimitPassed ? "within budget (unbound)" : "over budget (unbound)"
          : result.gzipBytes <= result.budget && result.sizeLimitPassed ? "pass" : "fail"
        : "informational"
    ].join(" | ")).map((row) => `| ${row} |`),
    "",
    "The authoritative machine-readable report is",
    `\`${reportPath}\`.`,
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
    "## Budget interpretation",
    "",
    "The core and starter rows retain their existing enforced budgets; informational rows",
    "expose other slices without defining a release budget. Values compare the recorded",
    "measurements with those limits. A release pass also requires a bound candidate and",
    "the full machine-readable check report. Do not raise budgets to manufacture a pass.",
    ""
  ];
  return lines.join("\n");
}

function formatBytes(value) {
  return new Intl.NumberFormat("en-US").format(value);
}
