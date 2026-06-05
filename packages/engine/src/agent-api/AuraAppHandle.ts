import type { GameRuntimeEvidence, GameRuntimeEvidenceOptions } from "./GameEvidence";
import type { GameInputController, GameInputOptions } from "./GameRuntime";

export interface AuraAppRuntimeState {
  readonly paused: boolean;
  readonly frame: number;
  readonly time: number;
  readonly fixedDt?: number;
  readonly alpha?: number;
}

export interface AuraAppFrame {
  readonly dt: number;
  readonly fixedDt: number;
  readonly time: number;
  readonly frame: number;
  readonly alpha: number;
  readonly paused: boolean;
  readonly source: "raf" | "manual" | "fixed";
  readonly substep: number;
  readonly substeps: number;
}

export type AuraAppFrameCallback = (frame: AuraAppFrame) => void;

export interface AuraAppNodeRegistryLike<TNode = unknown> {
  get(id: string): TNode | undefined;
  require(id: string): TNode;
  has(id: string): boolean;
  ids(): readonly string[];
  all(): readonly TNode[];
}

export interface AuraAppScreenshot {
  readonly mimeType: "image/png";
  readonly dataUrl: string;
  readonly width: number;
  readonly height: number;
}

export interface AuraAppHandle<TScene = unknown, TDiagnostics = unknown, TNode = unknown> {
  readonly canvas?: HTMLCanvasElement;
  readonly scene: TScene;
  readonly backend: "webgl2" | "webgpu" | "canvas2d" | "headless" | string;
  readonly nodes: AuraAppNodeRegistryLike<TNode>;
  readonly runtime: AuraAppRuntimeState;
  setScene(scene: TScene): void;
  onFrame(callback: AuraAppFrameCallback): () => void;
  offFrame(callback: AuraAppFrameCallback): void;
  input(options: GameInputOptions): GameInputController;
  pause(): void;
  resume(): void;
  step(dt?: number): void;
  diagnostics(): TDiagnostics;
  evidence(options?: GameRuntimeEvidenceOptions): GameRuntimeEvidence;
  screenshot(): AuraAppScreenshot;
  dispose(): void;
}

export function isAuraAppHandle(value: unknown): value is AuraAppHandle {
  const candidate = value as Partial<AuraAppHandle> | undefined;
  return Boolean(
    candidate &&
      typeof candidate === "object" &&
      candidate.nodes &&
      typeof candidate.onFrame === "function" &&
      typeof candidate.pause === "function" &&
      typeof candidate.resume === "function" &&
      typeof candidate.step === "function" &&
      typeof candidate.dispose === "function"
  );
}

export function asAuraAppHandle<TApp extends AuraAppHandle>(app: TApp): AuraAppHandle {
  return app;
}
