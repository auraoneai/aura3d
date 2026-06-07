import { analyzeAudioVisemes, type AnalyzeAudioVisemesOptions, type AudioVisemeAnalysis } from "./AudioVisemeAnalyzer.js";
import {
  createPromptAnimationIssue,
  normalizePromptAnimationTime,
  type PromptAnimationId,
  type PromptAnimationLanguageCode,
  type PromptAnimationSeconds,
  type PromptAnimationValidationIssue
} from "./PromptAnimationContract.js";

export type ExternalPhonemeAnalyzerStatus = "ready" | "unsupported" | "missing-credentials" | "provider-error";

export interface ExternalPhonemeAnalyzerCapability {
  readonly supported: boolean;
  readonly status: ExternalPhonemeAnalyzerStatus;
  readonly providerId?: string | undefined;
  readonly requiresCredentials: boolean;
  readonly diagnostics: readonly PromptAnimationValidationIssue[];
}

export interface ExternalPhonemeTiming {
  readonly phoneme: string;
  readonly startTime: PromptAnimationSeconds;
  readonly endTime: PromptAnimationSeconds;
  readonly confidence?: number | undefined;
}

export interface ExternalPhonemeAlignment {
  readonly kind: "external-phoneme-alignment";
  readonly providerId: string;
  readonly episodeId: PromptAnimationId;
  readonly characterId: PromptAnimationId;
  readonly lineId?: PromptAnimationId | undefined;
  readonly language: PromptAnimationLanguageCode;
  readonly transcript: string;
  readonly phonemes: readonly ExternalPhonemeTiming[];
  readonly diagnostics: readonly PromptAnimationValidationIssue[];
}

export interface ExternalPhonemeAnalyzerInput extends AnalyzeAudioVisemesOptions {
  readonly transcript: string;
}

export interface ExternalPhonemeAnalyzerProvider {
  analyze(input: ExternalPhonemeAnalyzerInput): Promise<ExternalPhonemeAlignment> | ExternalPhonemeAlignment;
}

export interface ExternalPhonemeAnalyzerAdapter {
  readonly kind: "external-phoneme-analyzer";
  readonly capability: ExternalPhonemeAnalyzerCapability;
  analyze(input: ExternalPhonemeAnalyzerInput): Promise<ExternalPhonemeAnalyzerResult>;
}

export interface ExternalPhonemeAnalyzerResult {
  readonly ok: boolean;
  readonly status: ExternalPhonemeAnalyzerStatus;
  readonly analysis: AudioVisemeAnalysis;
  readonly alignment?: ExternalPhonemeAlignment | undefined;
  readonly diagnostics: readonly PromptAnimationValidationIssue[];
}

export interface CreateExternalPhonemeAnalyzerAdapterOptions {
  readonly providerId?: string | undefined;
  readonly provider?: ExternalPhonemeAnalyzerProvider | undefined;
  readonly requiresCredentials?: boolean | undefined;
  readonly credentialsAvailable?: boolean | undefined;
}

export function createExternalPhonemeAnalyzerAdapter(
  options: CreateExternalPhonemeAnalyzerAdapterOptions = {}
): ExternalPhonemeAnalyzerAdapter {
  const capability = probeExternalPhonemeAnalyzer(options);
  const providerId = options.providerId ?? "external-phoneme-analyzer";

  return {
    kind: "external-phoneme-analyzer",
    capability,
    async analyze(input) {
      const fallbackAnalysis = analyzeAudioVisemes({
        ...input,
        phonemeAlignmentPresent: false
      });
      if (!capability.supported || !options.provider) {
        return {
          ok: false,
          status: capability.status,
          analysis: fallbackAnalysis,
          diagnostics: capability.diagnostics
        };
      }

      try {
        const alignment = normalizeExternalPhonemeAlignment(await options.provider.analyze(input), providerId, input);
        const alignedAnalysis = analyzeAudioVisemes({
          ...input,
          phonemeAlignmentPresent: alignment.phonemes.length > 0
        });
        const diagnostics = alignment.phonemes.length === 0
          ? [
              ...alignment.diagnostics,
              createPromptAnimationIssue(
                "warning",
                "external-phoneme-empty",
                `External phoneme analyzer "${providerId}" returned no phoneme timings.`
              )
            ]
          : alignment.diagnostics;
        return {
          ok: alignment.phonemes.length > 0,
          status: alignment.phonemes.length > 0 ? "ready" : "provider-error",
          analysis: alignedAnalysis,
          alignment: {
            ...alignment,
            diagnostics
          },
          diagnostics
        };
      } catch (error) {
        const diagnostic = createPromptAnimationIssue(
          "error",
          "external-phoneme-provider-error",
          `External phoneme analyzer "${providerId}" failed: ${error instanceof Error ? error.message : String(error)}.`
        );
        return {
          ok: false,
          status: "provider-error",
          analysis: fallbackAnalysis,
          diagnostics: [diagnostic]
        };
      }
    }
  };
}

export function probeExternalPhonemeAnalyzer(
  options: CreateExternalPhonemeAnalyzerAdapterOptions = {}
): ExternalPhonemeAnalyzerCapability {
  const providerId = options.providerId ?? "external-phoneme-analyzer";
  const requiresCredentials = options.requiresCredentials === true;
  if (!options.provider) {
    return {
      supported: false,
      status: "unsupported",
      providerId,
      requiresCredentials,
      diagnostics: [
        createPromptAnimationIssue(
          "warning",
          "external-phoneme-provider-missing",
          `External phoneme analyzer "${providerId}" is not configured; Aura3D will use amplitude-only visemes.`
        )
      ]
    };
  }
  if (requiresCredentials && options.credentialsAvailable !== true) {
    return {
      supported: false,
      status: "missing-credentials",
      providerId,
      requiresCredentials,
      diagnostics: [
        createPromptAnimationIssue(
          "error",
          "external-phoneme-credentials-missing",
          `External phoneme analyzer "${providerId}" requires credentials before phoneme alignment can run.`
        )
      ]
    };
  }
  return {
    supported: true,
    status: "ready",
    providerId,
    requiresCredentials,
    diagnostics: []
  };
}

function normalizeExternalPhonemeAlignment(
  alignment: ExternalPhonemeAlignment,
  providerId: string,
  input: ExternalPhonemeAnalyzerInput
): ExternalPhonemeAlignment {
  return {
    kind: "external-phoneme-alignment",
    providerId: alignment.providerId || providerId,
    episodeId: alignment.episodeId || input.episodeId,
    characterId: alignment.characterId || input.characterId,
    ...(alignment.lineId || input.lineId ? { lineId: alignment.lineId ?? input.lineId } : {}),
    language: alignment.language || input.language,
    transcript: alignment.transcript || input.transcript,
    phonemes: alignment.phonemes.map((phoneme) => ({
      ...phoneme,
      startTime: normalizePromptAnimationTime(phoneme.startTime),
      endTime: normalizePromptAnimationTime(Math.max(phoneme.startTime, phoneme.endTime))
    })),
    diagnostics: alignment.diagnostics
  };
}
