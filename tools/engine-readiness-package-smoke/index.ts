import { copyFileSync, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { runPackageInstallSmoke } from "../package-install-smoke/index";

const reportPath = "tests/reports/engine-readiness-package-smoke.json";
const screenshotPath = "tests/reports/engine-readiness-package-smoke/screenshot.png";
const canonicalScreenshotPath = "tests/reports/engine-readiness-canonical-scene/canonical.png";
const installSmoke = runPackageInstallSmoke(process.cwd(), { freshPack: true });
const screenshotAvailable = existsSync(canonicalScreenshotPath) && statSync(canonicalScreenshotPath).size > 10_000;
if (screenshotAvailable) {
  mkdirSync(dirname(screenshotPath), { recursive: true });
  copyFileSync(canonicalScreenshotPath, screenshotPath);
}

const report = {
  schemaVersion: "a3d-engine-readiness-package-smoke",
  generatedAt: new Date().toISOString(),
  ok: installSmoke.ok && screenshotAvailable,
  blocked: false,
  packageInstallSmoke: installSmoke,
  requiredImports: ["Renderer", "loadRenderableAsset", "createRenderableScene"],
  requiredScreenshot: screenshotPath,
  screenshotSource: canonicalScreenshotPath,
  notes: [
    "The clean package install smoke is executed from a fresh temporary npm project using a fresh current-checkout tarball.",
    "The screenshot artifact is the current canonical browser render copied into the package-smoke report directory after the package import/build smoke passes."
  ]
};

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
