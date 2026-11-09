// C1 typecheck: the same check as `tsc --noEmit -p tsconfig.json --pretty false`, run through the TypeScript API of the
// sandbox's own `typescript` (5.9.3 in every arm base), inside the run's worker thread. A `tsc` subprocess is matched by
// this Mac's process governor (at most 2 at once, all SIGSTOPped at load >= 24), which would put governor waits into a
// run's tool and wall time, or time a typecheck out. Output keeps tsc's `file(line,col): error TSxxxx: message` form.
import { createRequire } from "node:module";
import { join } from "node:path";

export function inProcessTsc(dir) {
  const ts = createRequire(join(dir, "package.json"))("typescript");
  const host = { getCanonicalFileName: (f) => f, getCurrentDirectory: () => dir, getNewLine: () => "\n" };
  const format = (diags) => ts.formatDiagnostics(diags, host).trim();
  const configFile = join(dir, "tsconfig.json");
  const read = ts.readConfigFile(configFile, ts.sys.readFile);
  if (read.error) return { pass: false, output: format([read.error]) };
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, dir, undefined, configFile);
  const program = ts.createProgram({ rootNames: parsed.fileNames, options: { ...parsed.options, noEmit: true }, projectReferences: parsed.projectReferences });
  const diags = [...parsed.errors, ...ts.getPreEmitDiagnostics(program)];
  const errors = diags.filter((d) => d.category === ts.DiagnosticCategory.Error);
  return { pass: errors.length === 0, output: format(diags) };
}
