/**
 * Codemod `prd09-perf-script` (PRD-09): removes a route's
 * `evidence:performance` script + the `scripts/write-performance-report.ts`
 * reference from package.json — the shared `aura3d perf-report` replaces it.
 */
import type { AuraCodemod } from "../../../contracts/commands.js";

export const perfScriptCodemod: AuraCodemod = {
  name: "prd09-perf-script",
  owner: "prd09",
  description: "Drop route-local perf-report scripts for `aura3d perf-report` (PRD-09).",
  transform(source, fileName) {
    const rows: { file: string; line: number; construct: string; mapping: "exact" | "approximate" | "none"; target?: string; note?: string }[] = [];
    const lines = source.split("\n");
    const out: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/"evidence:performance"|write-performance-report/.test(line)) {
        rows.push({ file: fileName, line: i + 1, construct: line.trim(), mapping: "exact", note: "replaced by `aura3d perf-report --route <id> --telemetry <json>`" });
        // keep JSON valid: drop a trailing comma on the previous emitted line
        if (out.length && /,\s*$/.test(out[out.length - 1]) && (i + 1 >= lines.length || /^\s*[}\]]/.test(lines[i + 1]))) {
          out[out.length - 1] = out[out.length - 1].replace(/,\s*$/, "");
        }
        continue;
      }
      out.push(line);
    }
    return { code: out.join("\n"), rows };
  }
};
