import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { ThreeCompatibilityMatrix } from "../../packages/three-compat/src/ThreeCompatibilityMatrix";

const matrixPath = "tests/reports/three-compat-threejs-compatibility-matrix.json";
const matrix = existsSync(resolve(matrixPath))
  ? JSON.parse(readFileSync(resolve(matrixPath), "utf8")) as ThreeCompatibilityMatrix
  : undefined;

const checks = [
  {
    id: "matrix-exists",
    pass: Boolean(matrix),
    detail: `${matrixPath} must exist.`
  },
  {
    id: "entry-count",
    pass: Number(matrix?.totalEntries ?? 0) >= 250,
    detail: "Compatibility matrix must track at least 250 entries."
  },
  {
    id: "thresholds",
    pass: Array.isArray(matrix?.thresholds) && matrix.thresholds.length >= 13,
    detail: "Compatibility matrix must define overall and category thresholds."
  },
  {
    id: "status-coverage",
    pass: Array.isArray(matrix?.entries) && matrix.entries.every((entry) => ["supported", "partial", "planned", "blocked", "out-of-scope"].includes(entry.status)),
    detail: "Every matrix entry must use a valid V5 compatibility status."
  },
  {
    id: "blocked-boundary",
    pass: Array.isArray(matrix?.entries) && matrix.entries.some((entry) => entry.status === "blocked" && entry.notes.toLowerCase().includes("blocked")),
    detail: "Matrix must preserve blocked categories."
  }
];

const report = {
  schema: "g3d-three-compat-compatibility-matrix-readiness/v1",
  generatedAt: new Date().toISOString(),
  pass: checks.every((entry) => entry.pass),
  matrixPath,
  coverage: matrix?.coverage ?? [],
  checks
};

mkdirSync(dirname(resolve("tests/reports/three-compat-compatibility-matrix-readiness.json")), { recursive: true });
writeFileSync(resolve("tests/reports/three-compat-compatibility-matrix-readiness.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exitCode = 1;

