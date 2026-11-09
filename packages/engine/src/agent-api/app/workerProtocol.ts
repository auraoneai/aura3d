import type { AuraBackend, AuraCreateAppRendererOptions, AuraRendererDiagnosticReport, AuraSceneSnapshot } from "../nodes/types.js";
import type { OffscreenCanvasSize } from "./canvas.js";
import type { AuraAssetsOption } from "../../contracts/assets.js";
import type { AuraWorkerNodePatchOp } from "./workerPatch.js";
import type { AuraAssetProgressEvent } from "../nodes/types/runtime.js";

export type { AuraWorkerNodePatchOp } from "./workerPatch.js";

/** Renderer-side quality-rebuild flags and animation mixer mirrored from the host app options. */
export interface AuraWorkerRenderFlags {
  readonly qualityRebuild?: import("../../contracts/flags.js").QrFlagInput;
  readonly animationMixer?: "pose" | "legacy";
  /** The page URL whose `?a3d-qr=` flags apply after the option flags (absent when the app opted out). */
  readonly url?: string;
}

/** A pointer snapshot in content-box CSS pixels, for untransformed or positively axis-scaled canvases. */
export interface AuraWorkerPointer {
  readonly id: number;
  readonly type: string;
  readonly x: number;
  readonly y: number;
  readonly buttons: number;
  readonly pressure: number;
}

/** A sampled pointer event; cancellation also identifies why the pointer was cancelled. */
export type AuraWorkerPointerEvent =
  | { readonly phase: "down" | "move" | "up"; readonly pointer: AuraWorkerPointer; readonly timestamp: number }
  | { readonly phase: "cancel"; readonly pointer: AuraWorkerPointer; readonly timestamp: number; readonly reason: "pointercancel" | "lostpointercapture" | "blur" };

export interface AuraWorkerKeyEvent {
  readonly phase: "down" | "up";
  readonly code: string;
  readonly timestamp: number;
  readonly repeat: boolean;
  readonly reason?: "blur";
}

export interface AuraWorkerInput {
  /** Current pointer and keyboard state at `timestamp`. */
  readonly pointers: readonly AuraWorkerPointer[];
  readonly keys: readonly string[];
  readonly timestamp: number;
  /**
   * Ordered pointer samples since the previous delivered frame. Moves may be
   * coalesced within a run of moves; down/up/cancel are never coalesced.
   * Absent for legacy snapshot-only producers and when no events are pending.
   */
  readonly pointerEvents?: readonly AuraWorkerPointerEvent[];
  /**
   * Event history was lost because a bounded buffer filled (or delivery
   * failed). Discard prior pointer state and reconcile from `pointers` instead
   * of attempting to infer missing transitions. No events accompany a reset.
   */
  readonly pointerEventsOverflow?: boolean;
  readonly keyEvents?: readonly AuraWorkerKeyEvent[];
  readonly keyEventsOverflow?: boolean;
}

/** Maximum number of queued pointer samples between flushes or frames. */
export const MAX_WORKER_POINTER_EVENTS = 128;

export const MAX_WORKER_KEY_EVENTS = 128;

export interface AuraWorkerKeyEventBatch {
  readonly keyEvents: readonly AuraWorkerKeyEvent[];
  readonly keyEventsOverflow?: true;
}

export function createWorkerKeyEventBuffer(): {
  append(events: readonly AuraWorkerKeyEvent[], overflow?: boolean): void;
  markOverflow(): void;
  drain(): AuraWorkerKeyEventBatch;
} {
  let events: AuraWorkerKeyEvent[] = [];
  let overflowed = false;
  const markOverflow = (): void => {
    events = [];
    overflowed = true;
  };
  return {
    append(next, overflow = false) {
      if (overflow) markOverflow();
      if (overflowed) return;
      for (const event of next) {
        if (events.length >= MAX_WORKER_KEY_EVENTS) {
          markOverflow();
          return;
        }
        events.push({ ...event });
      }
    },
    markOverflow,
    drain() {
      const batch: AuraWorkerKeyEventBatch = overflowed
        ? { keyEvents: [], keyEventsOverflow: true }
        : { keyEvents: events };
      events = [];
      overflowed = false;
      return batch;
    }
  };
}

export interface AuraWorkerPointerEventBatch {
  readonly pointerEvents: readonly AuraWorkerPointerEvent[];
  readonly pointerEventsOverflow?: true;
}

/**
 * Buffer ordered pointer samples without allowing a stalled worker or frame to
 * grow memory indefinitely. Within a contiguous move run only the last move
 * per pointer survives, ordered by the time of those surviving moves.
 */
export function createWorkerPointerEventBuffer(): {
  append(events: readonly AuraWorkerPointerEvent[], overflow?: boolean): void;
  markOverflow(): void;
  drain(): AuraWorkerPointerEventBatch;
} {
  let events: AuraWorkerPointerEvent[] = [];
  let overflowed = false;
  const markOverflow = (): void => {
    events = [];
    overflowed = true;
  };
  return {
    append(next, overflow = false) {
      if (overflow) markOverflow();
      if (overflowed) return;
      for (const sample of next) {
        if (sample.phase === "move") {
          for (let i = events.length - 1; i >= 0 && events[i]!.phase === "move"; i--) {
            if (events[i]!.pointer.id === sample.pointer.id) {
              events.splice(i, 1);
              break;
            }
          }
        }
        if (events.length >= MAX_WORKER_POINTER_EVENTS) {
          markOverflow();
          return;
        }
        events.push({ ...sample, pointer: { ...sample.pointer } });
      }
    },
    markOverflow,
    drain() {
      const batch: AuraWorkerPointerEventBatch = overflowed
        ? { pointerEvents: [], pointerEventsOverflow: true }
        : { pointerEvents: events };
      events = [];
      overflowed = false;
      return batch;
    }
  };
}

export type AuraWorkerRequest =
  | { readonly type: "init"; readonly id: number; readonly canvas: OffscreenCanvas; readonly scene: AuraSceneSnapshot; readonly renderer?: AuraCreateAppRendererOptions; readonly assets?: AuraAssetsOption; readonly size: OffscreenCanvasSize; readonly autoStart: boolean; readonly syncLocalScenes?: boolean; readonly flags?: AuraWorkerRenderFlags; /** 5.4: forward the worker app's asset progress and error events (`asset-progress` / `asset-error`). */ readonly assetEvents?: boolean; /** 5.4: the page's `globalThis.__A3D_*__` renderer switches (string, number or boolean values), installed in the worker before the first mount. */ readonly globals?: Readonly<Record<string, string | number | boolean>> }
  | { readonly type: "scene"; readonly id: number; readonly scene: AuraSceneSnapshot }
  | { readonly type: "input"; readonly id: number; readonly input: AuraWorkerInput }
  /** K1: batched node transform, visibility, material, animation-param and camera changes, applied before the next frame. */
  | { readonly type: "patch"; readonly id: number; readonly ops: readonly AuraWorkerNodePatchOp[] }
  | { readonly type: "resize"; readonly id: number; readonly size: OffscreenCanvasSize }
  | { readonly type: "frame"; readonly id: number; readonly deltaSeconds: number; readonly time?: number }
  | { readonly type: "visibility"; readonly id: number; readonly visible: boolean }
  | { readonly type: "pause"; readonly id: number }
  | { readonly type: "resume"; readonly id: number }
  | { readonly type: "screenshot"; readonly id: number }
  | { readonly type: "recover"; readonly id: number }
  | { readonly type: "scene-ack"; readonly id: number; readonly revision: number; readonly error?: { readonly code: string; readonly message: string } }
  | { readonly type: "cancel"; readonly id: number; readonly targetId: number }
  | { readonly type: "dispose"; readonly id: number };

export interface AuraWorkerFrameResult {
  readonly backend: string;
  readonly drawCalls: number;
  readonly width: number;
  readonly height: number;
  readonly time: number;
  readonly deltaSeconds?: number;
  readonly source?: "automatic" | "manual";
  /**
   * 5.4: the worker renderer's per-material textured status (`diagnostics().renderer.runtime.texturedMaterials`),
   * sent on a presented frame only when it changed since the last one sent.
   */
  readonly texturedMaterials?: AuraRendererDiagnosticReport["runtime"]["texturedMaterials"];
}

export interface AuraWorkerScreenshotPayload {
  readonly blob: Blob;
  readonly width: number;
  readonly height: number;
}

export type AuraWorkerResponse =
  | { readonly type: "result"; readonly id: number; readonly result?: AuraWorkerFrameResult; readonly screenshot?: AuraWorkerScreenshotPayload; readonly backend?: AuraBackend; readonly sceneRevision?: number; readonly syncLocalScenes?: true }
  | { readonly type: "error"; readonly id: number; readonly message: string; readonly code: string; readonly severity: "recoverable" | "terminal"; readonly backend?: AuraBackend }
  | { readonly type: "device"; readonly id: 0; readonly state: "lost" | "restored"; readonly backend?: AuraBackend }
  | { readonly type: "backend"; readonly id: 0; readonly backend: AuraBackend }
  | { readonly type: "scene-proposal"; readonly id: 0; readonly revision: number; readonly scene: AuraSceneSnapshot; readonly backend: AuraBackend }
  | { readonly type: "scene-commit" | "scene-abort"; readonly id: 0; readonly revision: number }
  | { readonly type: "presented"; readonly id: 0; readonly result: AuraWorkerFrameResult }
  | { readonly type: "capture-presented"; readonly id: 0; readonly result: AuraWorkerFrameResult }
  /** 5.4: sanitized asset events of the worker renderer, sent only when `init.assetEvents` is set. */
  | { readonly type: "asset-progress"; readonly id: 0; readonly event: AuraAssetProgressEvent }
  | { readonly type: "asset-error"; readonly id: 0; readonly event: { readonly url?: string; readonly assetId?: string; readonly message: string } };

/** The deliberately small portion of Worker / DedicatedWorkerGlobalScope used by the bridge. */
export interface AuraWorkerEndpoint<Incoming, Outgoing> {
  postMessage(message: Outgoing, transfer?: Transferable[]): void;
  addEventListener(type: "message", listener: (event: MessageEvent<Incoming>) => void): void;
  removeEventListener(type: "message", listener: (event: MessageEvent<Incoming>) => void): void;
}

export interface AuraWorkerHostEndpoint {
  postMessage(message: AuraWorkerRequest, transfer?: Transferable[]): void;
  addEventListener(type: "message", listener: (event: MessageEvent<AuraWorkerResponse>) => void): void;
  removeEventListener(type: "message", listener: (event: MessageEvent<AuraWorkerResponse>) => void): void;
  addEventListener(type: "error" | "messageerror", listener: (event: Event) => void): void;
  removeEventListener(type: "error" | "messageerror", listener: (event: Event) => void): void;
  terminate(): void;
}
