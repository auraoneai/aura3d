// Page-side helpers shared by the root receipt harnesses (animation, physics).
// Bundled for the browser by the example dev server; imports no Node modules.
import { changedPixelCount, frameStats } from "../support/frame-stats";

export interface PageFrame {
  readonly name: string;
  readonly label: string;
  readonly pngBase64: string;
  readonly meanLuma: number;
  readonly nonBlackRatio: number;
}

export interface Capture {
  readonly frame: PageFrame;
  readonly rgba: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

export interface CapabilityResult {
  status: "ok" | "error";
  error?: string;
  measurements: Record<string, unknown>;
  frames: PageFrame[];
}

export function newStageCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.style.cssText = `width:${width}px;height:${height}px;display:block`;
  document.getElementById("stage")!.appendChild(canvas);
  return canvas;
}

/** Copy the GL canvas right after a step (same task, so the buffer is still valid) and encode it. */
export function captureCanvas(source: HTMLCanvasElement, name: string, label: string): Capture {
  const copy = document.createElement("canvas");
  copy.width = source.width;
  copy.height = source.height;
  const context = copy.getContext("2d", { willReadFrequently: true })!;
  context.drawImage(source, 0, 0);
  const image = context.getImageData(0, 0, copy.width, copy.height);
  const stats = frameStats(image.data);
  const pngBase64 = copy.toDataURL("image/png").split(",")[1]!;
  return { frame: { name, label, pngBase64, ...stats }, rgba: image.data, width: copy.width, height: copy.height };
}

export function changedBetween(a: Capture, b: Capture, options: { x0?: number; x1?: number; threshold?: number } = {}): number {
  return changedPixelCount(a.rgba, b.rgba, a.width, options);
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export function distance(a: readonly number[], b: readonly number[]): number {
  return Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
}
