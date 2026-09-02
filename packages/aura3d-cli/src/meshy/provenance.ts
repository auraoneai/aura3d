import { realpathSync } from "node:fs";
import { relative } from "node:path";
import type { AuraCliGeneratedAssetProvenance } from "../asset-core-types.js";
import type { SanitizedMeshyMetadata } from "./metadata.js";

export function createMeshyProvenance(projectDir: string, metadataPath: string, rightsPath: string, metadata: SanitizedMeshyMetadata): AuraCliGeneratedAssetProvenance {
  return {
    provider: "meshy",
    providerCli: metadata.providerCli ?? "@meshy-ai/cli@0.2.0",
    ...(metadata.taskId ? { taskId: metadata.taskId } : {}),
    ...(metadata.parentTaskIds?.length ? { parentTaskIds: metadata.parentTaskIds } : {}),
    ...(metadata.operation ? { operation: metadata.operation } : {}),
    ...(metadata.promptHash ? { promptHash: metadata.promptHash } : {}),
    ...(metadata.model ? { model: metadata.model } : {}),
    ...(metadata.settings ? { settings: metadata.settings } : {}),
    ...(metadata.createdAt ? { createdAt: metadata.createdAt } : {}),
    ...(metadata.finishedAt ? { finishedAt: metadata.finishedAt } : {}),
    ...(metadata.consumedCredits !== undefined ? { consumedCredits: metadata.consumedCredits } : {}),
    localMetadata: normalized(relative(realpathSync(projectDir), metadataPath)),
    rightsEvidence: normalized(relative(realpathSync(projectDir), rightsPath))
  };
}
function normalized(path: string): string { return path.replaceAll("\\", "/"); }
