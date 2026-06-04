import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export interface ReleaseCheck {
  readonly id: string;
  readonly pass: boolean;
  readonly detail: string;
}

export function existsCheck(path: string, id = path): ReleaseCheck {
  return {
    id,
    pass: existsSync(resolve(path)),
    detail: existsSync(resolve(path)) ? `${path} exists` : `${path} is missing`
  };
}

export function fileIncludes(path: string, terms: readonly string[], id = path): ReleaseCheck {
  const text = existsSync(resolve(path)) ? readFileSync(resolve(path), "utf8") : "";
  const missing = terms.filter((term) => !text.includes(term));
  return {
    id,
    pass: missing.length === 0,
    detail: missing.length === 0 ? `${path} includes required terms` : `${path} missing: ${missing.join(", ")}`
  };
}

export function noFileMatches(paths: readonly string[], patterns: readonly RegExp[], id: string): ReleaseCheck {
  const hits: string[] = [];
  for (const path of paths) {
    if (!existsSync(resolve(path))) continue;
    const text = readFileSync(resolve(path), "utf8");
    for (const pattern of patterns) {
      if (pattern.test(text)) hits.push(`${path}: ${pattern.source}`);
    }
  }
  return {
    id,
    pass: hits.length === 0,
    detail: hits.length === 0 ? "no banned text found" : hits.join("; ")
  };
}

export function writeReport(path: string, schema: string, checks: readonly ReleaseCheck[], extra: Record<string, unknown> = {}): void {
  const failures = checks.filter((check) => !check.pass).map((check) => `${check.id}: ${check.detail}`);
  const report = {
    schema,
    generatedAt: new Date().toISOString(),
    pass: failures.length === 0,
    checks,
    failures,
    ...extra
  };
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(resolve(path), `${JSON.stringify(report, null, 2)}\n`);
  if (failures.length > 0) {
    console.error(failures.join("\n"));
    process.exitCode = 1;
  }
}
