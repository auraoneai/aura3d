import type { AuraSceneBackendPreference, AuraSceneIR, AuraSceneQualityTarget } from "./AuraSceneIR.js";
import type { AuraScenePatch } from "./AuraScenePatch.js";

export interface AuraPromptRequest {
  readonly prompt: string;
  readonly provider?: string;
  readonly model?: string;
  readonly qualityTarget?: AuraSceneQualityTarget;
  readonly backendPreference?: AuraSceneBackendPreference;
  readonly assetManifestIds?: readonly string[];
  readonly timeoutMs?: number;
  readonly retryCount?: number;
  readonly signal?: AbortSignal;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface AuraPatchPromptRequest extends AuraPromptRequest {
  readonly scene: AuraSceneIR;
}

export interface AuraPromptAdapterSuccess<TValue> {
  readonly ok: true;
  readonly value: TValue;
  readonly provider: string;
  readonly model: string;
  readonly networkUsed: boolean;
  readonly warnings: readonly string[];
}

export interface AuraPromptAdapterFailure {
  readonly ok: false;
  readonly provider: string;
  readonly model: string;
  readonly networkUsed: boolean;
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly retryable: boolean;
    readonly recoverableByMock: boolean;
  };
}

export type AuraPromptAdapterResult<TValue> = AuraPromptAdapterSuccess<TValue> | AuraPromptAdapterFailure;

export type AuraPromptToSceneResult = AuraPromptAdapterResult<AuraSceneIR>;
export type AuraPromptToPatchResult = AuraPromptAdapterResult<AuraScenePatch>;
