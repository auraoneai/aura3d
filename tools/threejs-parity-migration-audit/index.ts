import { fileExists, readInventory, reportIssue, writeJson } from "../threejs-parity-common";

const outputPath = "tests/reports/threejs-parity/migration-audit.json";
const evidence = [
  "packages/three-compat/src/ThreeApiInventory.ts",
  "packages/three-compat/src/ThreeCompatibilityMatrix.ts",
  "tools/three-compat-migrate-three/index.ts",
  "tests/integration/three-compat-threejs-migration.test.ts"
] as const;
const missing = evidence.filter((path) => !fileExists(path));
const issues = missing.map((path) => reportIssue(`missing-migration-evidence:${path}`, `Missing migration evidence source ${path}.`, "blocker"));
const inventory = readInventory();
const declaredRoutes = inventory.items
  .filter((item) => item.a3dRoute?.startsWith("/apps/"))
  .map((item) => ({
    threeExampleId: item.threeExampleId,
    route: item.a3dRoute!,
    sourceDirectory: item.a3dRoute!.replace(/^\/+|\/+$/g, ""),
    status: item.a3dStatus
  }));
const missingDeclaredRoutes = declaredRoutes.filter((item) => !fileExists(item.sourceDirectory));
const mountedDeclaredRoutes = declaredRoutes.filter((item) => fileExists(item.sourceDirectory));

writeJson(outputPath, {
  schema: "a3d-threejs-parity-migration-audit",
  generatedAt: new Date().toISOString(),
  pass: issues.length === 0,
  evidence,
  routeAudit: {
    declaredRouteCount: declaredRoutes.length,
    mountedRouteCount: mountedDeclaredRoutes.length,
    missingRouteCount: missingDeclaredRoutes.length,
    mountedRoutes: mountedDeclaredRoutes,
    missingRoutes: missingDeclaredRoutes,
    disposition:
      "Missing routes have no current route-local helper to migrate. Their inventory entries must remain partial until a mounted route is restored and audited; retained tests, reports, or screenshots are not current route source."
  },
  issues,
  claim:
    "Migration support is adapter-backed for covered APIs only. Missing historical routes are explicitly enumerated and cannot count as migrated or matched; unsupported Three.js APIs must remain warnings, not silent success."
});
console.log(`Three.js parity migration audit written: ${outputPath}`);
