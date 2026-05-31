export interface FpsSummary {
  readonly sampleCount: number;
  readonly totalFrameTimeMs: number;
  readonly minFrameTimeMs: number | null;
  readonly maxFrameTimeMs: number | null;
  readonly p50FrameTimeMs: number | null;
  readonly p95FrameTimeMs: number | null;
  readonly p50Fps: number | null;
  readonly timedOut: boolean;
}

export interface FpsCalibrationThresholds {
  readonly emptyRafMinFps: number;
  readonly webglControlMinFps: number;
  readonly maxP95FrameTimeMs: number;
  readonly minControlSamples: number;
}

export interface FpsCalibrationInput {
  readonly emptyRaf?: Partial<FpsSummary>;
  readonly webglControl?: Partial<FpsSummary>;
}

export interface FpsCalibrationVerdict {
  readonly status: "pass" | "invalid";
  readonly failures: readonly string[];
  readonly thresholds: FpsCalibrationThresholds;
}

export interface FpsCalibrationResult {
  readonly emptyRaf: FpsSummary;
  readonly webglControl: FpsSummary;
  readonly verdict: FpsCalibrationVerdict;
}

export const DEFAULT_FPS_CALIBRATION_THRESHOLDS: FpsCalibrationThresholds;

export function summarizeFrameTimes(
  frameTimes: readonly number[],
  options?: {
    readonly timedOut?: boolean;
  }
): FpsSummary;

export function classifyFpsCalibration(
  calibration: FpsCalibrationInput,
  thresholds?: FpsCalibrationThresholds
): FpsCalibrationVerdict;

export function samplePageFps(
  page: {
    waitForTimeout(ms: number): Promise<unknown>;
    evaluate<T>(fn: (arg: number) => Promise<T>, arg: number): Promise<T>;
  },
  options?: {
    readonly warmupMs?: number;
    readonly sampleMs?: number;
    readonly timeoutSlackMs?: number;
  }
): Promise<FpsSummary>;

export function runFpsCalibration(
  browser: {
    newPage(options?: unknown): Promise<{
      setContent(html: string): Promise<unknown>;
      waitForFunction(fn: () => boolean, arg?: unknown, options?: { timeout?: number }): Promise<unknown>;
      waitForTimeout(ms: number): Promise<unknown>;
      evaluate<T>(fn: (arg: number) => Promise<T>, arg: number): Promise<T>;
      close(): Promise<unknown>;
    }>;
  },
  options?: {
    readonly viewport?: { readonly width: number; readonly height: number };
    readonly controlWarmupMs?: number;
    readonly controlSampleMs?: number;
    readonly thresholds?: FpsCalibrationThresholds;
  }
): Promise<FpsCalibrationResult>;

export function applyFpsCalibrationToMetrics(
  metrics: Record<string, unknown>,
  calibration: FpsCalibrationResult | (FpsCalibrationInput & { readonly verdict?: FpsCalibrationVerdict })
): Record<string, unknown> & {
  readonly p50Fps?: null;
  readonly p95FrameTimeMs?: null;
  readonly fpsInstrumentationStatus?: "invalid";
  readonly fpsInstrumentationFailures?: readonly string[];
  readonly fpsCalibration: FpsCalibrationResult | (FpsCalibrationInput & { readonly verdict?: FpsCalibrationVerdict });
};
