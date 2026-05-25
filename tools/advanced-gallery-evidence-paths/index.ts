import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  ADVANCED_GALLERY_CONTEXTUAL_REPORT_DIR,
  ADVANCED_GALLERY_LEGACY_REPORT_DIR,
  CONTEXTUAL_REPORT_ALIASES
} from "../naming-taxonomy/contextualAliases";

export {
  ADVANCED_GALLERY_CONTEXTUAL_REPORT_DIR,
  ADVANCED_GALLERY_LEGACY_REPORT_DIR,
  CONTEXTUAL_REPORT_ALIASES
};

export function resolveAdvancedGalleryReportDir(rootDir = process.cwd()): string {
  const contextualPath = join(rootDir, ADVANCED_GALLERY_CONTEXTUAL_REPORT_DIR);
  if (existsSync(contextualPath)) return ADVANCED_GALLERY_CONTEXTUAL_REPORT_DIR;
  return ADVANCED_GALLERY_LEGACY_REPORT_DIR;
}

export function advancedGalleryReportPath(fileName: string, reportDir = ADVANCED_GALLERY_CONTEXTUAL_REPORT_DIR): string {
  return join(reportDir, fileName);
}
