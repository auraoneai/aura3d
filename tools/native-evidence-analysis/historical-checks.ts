/**
 * Pure checks shared with the historical evidence suites. Inputs to these
 * functions are data, not proof: callers must independently authenticate and
 * bind any real report before using the result as an acceptance observation.
 */
type ObjectValue = Record<string, unknown>;

function object(value: unknown): ObjectValue | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as ObjectValue : undefined;
}

function list(value: unknown): readonly unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function number(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function atLeast(value: unknown, minimum: number): boolean {
  return number(value) && value >= minimum;
}

/** Original historical bundle thresholds, applied to supplied data only. */
export function historicalBundleIssues(value: unknown): string[] {
  const issues: string[] = [];
  const report = object(value);
  const scenarios = list(report?.scenarios);
  if (report?.pass !== true) issues.push("bundle report did not pass");
  if (!scenarios || scenarios.length === 0) return [...issues, "bundle scenarios missing"];
  const rows = scenarios.map(object);
  if (rows.some((row) => !row || typeof row.id !== "string") ||
      new Set(rows.map((row) => row?.id)).size !== rows.length) issues.push("bundle scenario identities invalid");
  for (const [id, limit] of [
    ["scenario-1-core-primitive-scene", 1.25],
    ["scenario-2-product-viewer", 1.25],
    ["scenario-3-game-runtime", 1.5]
  ] as const) {
    const row = rows.find((candidate) => candidate?.id === id);
    if (!row || row.maxRatio !== limit || row.pass !== true) issues.push(`bundle scenario invalid: ${id}`);
  }
  if (rows.some((row) => row?.pass !== true || !number(row.maxRatio) || row.maxRatio > 1.5)) {
    issues.push("bundle scenario failed or budget exceeded");
  }
  return issues;
}

/** Historical developer-value conditions, not a live measurement. */
export function historicalDeveloperIssues(value: unknown): string[] {
  const issues: string[] = [];
  const report = object(value);
  const scenarios = list(report?.scenarios);
  if (!scenarios || scenarios.length !== 3) issues.push("developer scenarios missing");
  else for (const item of scenarios) {
    const row = object(item);
    for (const key of ["aura3d", "threejs"]) {
      const side = object(row?.[key]);
      if (!number(side?.authoredLines) || side.authoredLines <= 0) issues.push(`authored lines missing: ${key}`);
    }
  }
  const summary = object(report?.summary);
  if (!summary || !number(summary.totalScenarios) ||
      summary.scenariosWhereAura3dNeedsFewerLines !== summary.totalScenarios ||
      summary.scenariosWhereAura3dNeedsFewerOrEqualDependencies !== summary.totalScenarios ||
      !atLeast(summary.gapReportWorkflows, 6) ||
      summary.gapReportWorkflowsWhereAura3dNeedsFewerLines !== summary.gapReportWorkflows) {
    issues.push("developer comparison summary invalid");
  }
  const startup = object(report?.runtimeStartupToFirstFrame);
  const methodology = object(startup?.methodology);
  if (!atLeast(methodology?.sessions, 3) || methodology?.identicalCameraAndContent !== true) issues.push("startup methodology invalid");
  for (const key of ["aura3d", "threejs"]) {
    const side = object(startup?.[key]);
    if (!number(side?.median) || side.median <= 0 || !atLeast(side.sampleCount, 3)) issues.push(`startup samples invalid: ${key}`);
  }
  const install = object(report?.installToFirstCube);
  const summaries = object(install?.summary);
  for (const state of ["cold", "warm"]) for (const key of ["aura3d", "threejs"]) {
    const side = object(object(summaries?.[state])?.[key]);
    if (!atLeast(side?.sampleCount, 3) || !number(side?.medianMs) || side.medianMs <= 0 || !atLeast(side.varianceMs2, 0)) {
      issues.push(`install samples invalid: ${state}/${key}`);
    }
  }
  const samples = list(install?.samples);
  if (!samples || samples.length !== 12 || samples.some((sample) => !atLeast(object(sample)?.verifiedChangedPixels, 1001))) {
    issues.push("install pixel samples invalid");
  }
  const unmeasured = list(report?.unmeasured);
  if (!unmeasured || unmeasured.length !== 0) issues.push("developer measurement incomplete");
  return issues;
}

/** The separate release rollup requires every named friction field. */
export function historicalFrictionFieldsIssues(value: unknown): string[] {
  const report = object(value);
  const scenarios = list(report?.scenarios);
  if (!scenarios || scenarios.length !== 3) return ["friction scenario inventory invalid"];
  const issues: string[] = [];
  for (const item of scenarios) for (const key of ["aura3d", "threejs"]) {
    const side = object(object(item)?.[key]);
    for (const field of ["authoredLines", "imports", "dependencyCount", "typecheckMs"]) {
      if (!number(side?.[field])) issues.push(`friction field missing: ${key}.${field}`);
    }
  }
  return issues;
}

/** Check disclosure against a supplied historical report, without loading one. */
export function historicalDisclosureIssues(readme: string, value: unknown): string[] {
  const report = object(value);
  if (!report || typeof report.pass !== "boolean") return ["bundle measurement missing"];
  if (report.pass) return [];
  const issues: string[] = [];
  if (!/over budget/i.test(readme)) issues.push("bundle over-budget disclosure missing");
  const scenarios = list(report.scenarios);
  if (!scenarios || scenarios.length === 0) return [...issues, "bundle measurements missing"];
  for (const item of scenarios) {
    const row = object(item);
    if (!number(row?.ratio)) issues.push("bundle ratio missing");
    else if (!readme.includes(`${row.ratio.toFixed(2)}x`)) issues.push(`bundle ratio undisclosed: ${row.ratio.toFixed(2)}x`);
  }
  return issues;
}

export function historicalRouteDisclosureIssues(readme: string, value: unknown): string[] {
  const failures = list(object(value)?.failures);
  if (!failures || failures.some((failure) => typeof failure !== "string")) return ["route-health failures missing"];
  const routes = new Set(failures.map((failure) => (failure as string).split("/")[2]).filter(Boolean));
  return [...routes].filter((route) => !readme.includes(route!)).map((route) => `broken route undisclosed: ${route}`);
}

export function historicalComplexityIssues(value: unknown): string[] {
  const report = object(value), baseline = object(report?.baseline), current = object(report?.current);
  const issues: string[] = [];
  if (!number(baseline?.packageSourceLines) || !number(current?.packageSourceLines) || current.packageSourceLines > baseline.packageSourceLines) {
    issues.push("source complexity increased or is missing");
  }
  if (current?.duplicateOwnershipViolations !== 0) issues.push("duplicate ownership is not zero");
  return issues;
}

export function historicalEngineLayerIssues(value: unknown): string[] {
  const report = object(value);
  return report?.pass === true && number(report.ratio) && number(report.threshold) && report.ratio >= report.threshold
    ? [] : ["engine-layer ratio failed or is missing"];
}

/** Exact comparison preserves duplicates and missing/unexpected paths. */
export function historicalAdditionIssues(actual: readonly string[], expected: readonly string[]): string[] {
  const left = [...actual].sort(), right = [...expected].sort();
  return left.length === right.length && left.every((item, index) => item === right[index])
    ? [] : ["historical additions differ from the approved inventory"];
}
