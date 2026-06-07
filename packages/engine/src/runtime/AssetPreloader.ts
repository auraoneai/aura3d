import {
  createResourceManager,
  type AuraResourceDescriptor,
  type AuraResourceManager,
  type AuraResourceManagerEvidence,
  type AuraResourceRecord
} from "./ResourceManager.js";

export interface AuraAssetPreloadResult {
  readonly ok: boolean;
  readonly loaded: readonly AuraResourceRecord[];
  readonly failed: readonly AuraResourceRecord[];
  readonly evidence: AuraResourceManagerEvidence;
}

export interface AuraAssetPreloader {
  readonly manager: AuraResourceManager;
  preloadAll(descriptors: readonly AuraResourceDescriptor[]): Promise<AuraAssetPreloadResult>;
  disposeAll(): Promise<AuraResourceManagerEvidence>;
}

export function createAssetPreloader(manager: AuraResourceManager = createResourceManager()): AuraAssetPreloader {
  return {
    manager,
    async preloadAll(descriptors) {
      await Promise.allSettled(descriptors.map((descriptor) => manager.preload(descriptor)));
      const records = manager.records();
      const loaded = records.filter((record) => record.status === "ready");
      const failed = records.filter((record) => record.status === "error");
      return {
        ok: failed.length === 0 && loaded.length >= descriptors.length,
        loaded,
        failed,
        evidence: manager.evidence
      };
    },
    disposeAll() {
      return manager.disposeAll();
    }
  };
}
