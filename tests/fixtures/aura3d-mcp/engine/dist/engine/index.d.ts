import type { Vec3 } from "./math.js";
export * from "./lights.js";
export type { Vec3 } from "./math.js";

/** Options for {@link createAuraApp}. */
export interface AuraCreateAppOptions {
  /** The scene to mount. */
  scene: object;
  /**
   * Pixel ratio cap.
   * @default 2
   */
  maxPixelRatio?: number;
  /** Throw from ready() when the renderer fails to mount. Defaults to false. */
  strict?: boolean;
}

export interface AuraApp {
  /** Register a per-frame callback; returns an unsubscribe function. */
  onFrame(callback: (frame: { dt: number }) => void): () => void;
  ready(): Promise<void>;
}

/**
 * Mounts the scene, owns renderer, resize, loop and disposal.
 * @example
 * const app = createAuraApp("#app", { scene: scene({ background: "#101418" }) });
 * await app.ready();
 */
export declare function createAuraApp(target: string | HTMLElement, options: AuraCreateAppOptions): AuraApp;

/** Orbit camera around a target. */
export declare const camera: {
  orbit(options: { position: Vec3; target: Vec3; autoRotate?: number }): object;
};
