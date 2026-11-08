/**
 * B1 three.js asset bridge: the factory contract.
 *
 * A bridge input is an ES module whose default export (or named export
 * `createScene`) is a scene factory:
 *
 * ```js
 * import * as THREE from "three";
 * export const params = { trees: 12 };                // optional defaults, merged under --params
 * export default function createScene({ THREE, seed, random, params }) {
 *   const scene = new THREE.Scene();
 *   // ... build with `random()` (or Math.random, which is seeded while the factory runs)
 *   return { scene, camera, clips: [], assets: [texturePromise], renderer: { toneMapping: "aces", exposure: 1 } };
 * }
 * ```
 *
 * The factory runs headless at build time (Node, no DOM, no WebGL). It may
 * return a promise. `assets` (array or record of promises) and `ready` are
 * awaited before export, so async geometry/texture generation settles first.
 * three itself is resolved from the factory's own location (its project's
 * dev dependency); no Aura3D runtime package depends on three.
 *
 * Everything below is structural: the CLI never imports three's types.
 */

export interface ThreeLike {
  readonly REVISION: string;
  readonly [key: string]: unknown;
}

export interface ThreeVector3Like { readonly x: number; readonly y: number; readonly z: number }
export interface ThreeColorLike { readonly r: number; readonly g: number; readonly b: number; getHexString(): string }

export interface ThreeObjectLike {
  readonly type: string;
  name: string;
  visible: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
  parent: ThreeObjectLike | null;
  readonly children: ThreeObjectLike[];
  readonly userData: Record<string, unknown>;
  readonly isMesh?: boolean;
  readonly isInstancedMesh?: boolean;
  readonly isSkinnedMesh?: boolean;
  readonly isLight?: boolean;
  readonly isCamera?: boolean;
  readonly isPoints?: boolean;
  readonly isLine?: boolean;
  readonly isSprite?: boolean;
  readonly isScene?: boolean;
  readonly material?: ThreeMaterialLike | ThreeMaterialLike[];
  readonly geometry?: { readonly attributes?: Record<string, unknown>; readonly morphAttributes?: Record<string, unknown[]> };
  readonly instanceColor?: unknown;
  readonly color?: ThreeColorLike;
  readonly groundColor?: ThreeColorLike;
  readonly intensity?: number;
  readonly distance?: number;
  readonly decay?: number;
  readonly angle?: number;
  readonly penumbra?: number;
  readonly fov?: number;
  readonly near?: number;
  readonly far?: number;
  readonly target?: ThreeObjectLike;
  readonly background?: unknown;
  readonly environment?: unknown;
  readonly fog?: { readonly type?: string; readonly isFog?: boolean; readonly isFogExp2?: boolean; readonly color?: ThreeColorLike } | null;
  updateMatrixWorld(force?: boolean): void;
  getWorldPosition(target: ThreeVector3Like): ThreeVector3Like;
  getWorldDirection(target: ThreeVector3Like): ThreeVector3Like;
  traverse(fn: (object: ThreeObjectLike) => void): void;
  removeFromParent(): unknown;
  add(object: ThreeObjectLike): unknown;
}

export interface ThreeMaterialLike {
  readonly type: string;
  readonly name: string;
  readonly uuid: string;
  readonly onBeforeCompile?: unknown;
  readonly isShaderMaterial?: boolean;
  readonly isNodeMaterial?: boolean;
  readonly transparent?: boolean;
  readonly vertexColors?: boolean;
  readonly [key: string]: unknown;
}

export interface ThreeBridgeFactoryContext {
  readonly THREE: ThreeLike;
  readonly seed: number;
  /** Seeded uniform [0, 1); identical sequence for the same seed. */
  readonly random: () => number;
  readonly params: Readonly<Record<string, unknown>>;
  /** Always "headless" when the bridge runs it; the paired three.js page passes "browser". */
  readonly mode: "headless" | "browser";
}

export interface ThreeBridgeRendererHints {
  /** three's renderer.toneMapping as a name; default "none" (three's own default). */
  readonly toneMapping?: "none" | "linear" | "reinhard" | "cineon" | "aces" | "agx" | "neutral";
  readonly exposure?: number;
}

export interface ThreeBridgeFactoryResult {
  readonly scene: ThreeObjectLike;
  readonly camera?: ThreeObjectLike;
  /** Explicit look-at point for the camera (three cameras store only orientation). */
  readonly cameraTarget?: readonly [number, number, number];
  /** Animation clips to export explicitly (GLTFExporter writes only what it is given). */
  readonly clips?: readonly unknown[];
  /** Asset readiness: promises awaited before export. */
  readonly assets?: readonly Promise<unknown>[] | Readonly<Record<string, Promise<unknown>>>;
  readonly ready?: Promise<unknown>;
  readonly renderer?: ThreeBridgeRendererHints;
  /** Image-based light the three.js original uses ("room" = RoomEnvironment PMREM). Mapped to environments.neutral. */
  readonly environment?: { readonly kind: "room"; readonly intensity?: number } | null;
  /** Post-processing passes (EffectComposer passes or names); always reported, never emitted. */
  readonly post?: readonly unknown[];
}

export type ThreeBridgeFactory = (context: ThreeBridgeFactoryContext) => ThreeBridgeFactoryResult | Promise<ThreeBridgeFactoryResult>;

export type CompatStatus = "supported" | "approximated" | "unsupported";

export interface CompatRow {
  readonly status: CompatStatus;
  readonly construct: string;
  /** Stable id of the node (or material name) the row is about. */
  readonly subject: string;
  readonly note: string;
  /** Native Aura3D route for an approximated/unsupported row, when one exists. */
  readonly nativeTarget?: string;
}

export interface BridgeLight {
  readonly kind: "ambient" | "hemisphere" | "directional" | "point" | "spot";
  readonly id: string;
  readonly color: string;
  readonly groundColor?: string;
  readonly intensity: number;
  readonly position?: readonly [number, number, number];
  readonly target?: readonly [number, number, number];
  readonly distance?: number;
  readonly decay?: number;
  readonly angle?: number;
  readonly penumbra?: number;
  readonly shadow?: boolean;
}

export interface BridgeCamera {
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  readonly fov: number;
  readonly near: number;
  readonly far: number;
}

/** Everything the emitter needs; also what `<name>.bridge.json` records. */
export interface BridgeSceneData {
  readonly name: string;
  readonly nodeIds: readonly string[];
  readonly hiddenNodeNames: readonly string[];
  readonly materials: readonly string[];
  readonly clips: readonly string[];
  readonly lights: readonly BridgeLight[];
  readonly camera?: BridgeCamera;
  readonly background?: string;
  readonly toneMapping: NonNullable<ThreeBridgeRendererHints["toneMapping"]>;
  readonly exposure: number;
  readonly environment?: { readonly kind: "room"; readonly intensity: number };
  readonly castShadow: boolean;
  readonly receiveShadow: boolean;
}
