import { readFileSync } from "node:fs";
import { existsCheck, fileIncludes, writeReport, type ReleaseCheck } from "../check-common";

const rootPackage = JSON.parse(readFileSync("package.json", "utf8")) as {
  name?: string;
  exports?: Record<string, string | Record<string, string>>;
};
const enginePackage = JSON.parse(readFileSync("packages/engine/package.json", "utf8")) as { private?: boolean };
const reactPackage = JSON.parse(readFileSync("packages/react/package.json", "utf8")) as {
  peerDependencies?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const publicApiDocs = readFileSync("docs/api/public-api.md", "utf8");
const rootEngineExport = rootPackage.exports?.["."];

const checks: ReleaseCheck[] = [
  existsCheck("packages/engine/src/agent-api/index.ts", "agent api source"),
  existsCheck("packages/react/src/index.ts", "react adapter source"),
  fileIncludes("packages/engine/src/index.ts", ["agent-api", "testing/routeHealth"], "engine exports"),
  fileIncludes("packages/engine/src/agent-api/index.ts", ["defineAuraAssets", "model", "camera", "lights", "material", "effects", "timeline", "interactions", "AuraRuntimeError"], "agent api helpers"),
  fileIncludes("tests/unit/agent-api/agent-api.test.ts", ["@ts-expect-error", "model(\"robot\")"], "type safety test"),
  {
    id: "public-engine-package-name",
    pass:
      rootPackage.name === "@aura3d/engine" &&
      typeof rootEngineExport === "object" &&
      rootEngineExport.browser === "./dist/engine/agent-api/index.js" &&
      enginePackage.private === true &&
      publicApiDocs.includes("## @aura3d/engine") &&
      !publicApiDocs.includes("## @aura3d/engine-runtime"),
    detail: "root @aura3d/engine is public; packages/engine is private implementation; public docs use @aura3d/engine"
  },
  {
    id: "react-adapter-engine-peer",
    pass:
      reactPackage.peerDependencies?.["@aura3d/engine"] === "^1.0.0" &&
      reactPackage.devDependencies?.["@aura3d/engine"] === "workspace:*" &&
      reactPackage.dependencies?.["@aura3d/engine-runtime"] === undefined,
    detail: "React adapter declares @aura3d/engine as public peer and keeps local workspace resolution in devDependencies"
  }
];

writeReport("tests/reports/agent-api-surface.json", "aura3d-agent-api-surface", checks);
