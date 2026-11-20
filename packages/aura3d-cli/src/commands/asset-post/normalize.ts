/**
 * `aura3d assets normalize <in.glb> --out out.glb` — scale, ground and turn a GLB so it faces +Z with +Y up, and record
 * `aura3d.orientation` in the asset extras (ported from tools/idol/normalize.mjs).
 *
 * Every scene root goes under one `auraRoot` wrapper that carries the turn, scale and grounding offset. Static meshes then
 * have that transform baked into their vertices (flatten + clearNodeTransform), so the GLB's own bounds, and the bounds
 * `assets add` records, are the true box even for a non-axis yaw. Skinned files keep the wrapper: joints inherit it.
 */

import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createGltfIo, loadGltfToolkit, type GltfToolkit, type Loose } from "../assets/gltfToolkit.js";
import { QUIET_GLTF_LOGGER } from "./logger.js";

export type NormalizeFront = "+z" | "-z" | "+x" | "-x";

/** Target size; one key wins in this order: height (Y), length (Z after turning), width (X), maxDim. */
export interface NormalizeSize {
  readonly height?: number;
  readonly length?: number;
  readonly width?: number;
  readonly maxDim?: number;
}

export interface NormalizeGlbOptions {
  /** Axis the model's front currently faces; it is turned to +Z. Default "+z" (no turn). */
  readonly front?: NormalizeFront | string;
  readonly size?: NormalizeSize;
  /** Extra yaw in degrees applied after the front turn (positive = counter-clockwise seen from above). */
  readonly yawDeg?: number;
  /** Write scale 1 and report the computed scale as `sceneScale` (rigged files: apply it on the scene node instead). */
  readonly keepScale?: boolean;
  /** Merged into `asset.extras.aura3d` next to the orientation record. */
  readonly provenance?: Readonly<Record<string, unknown>>;
  readonly toolkit?: GltfToolkit;
  /** Resolution root for the glTF-Transform packages (default process.cwd()). */
  readonly projectDir?: string;
}

export interface NormalizeGlbResult {
  /** Total yaw applied about +Y, in degrees. */
  readonly yawDeg: number;
  /** Uniform scale written into the file (1 with keepScale). */
  readonly scale: number;
  /** Scale the size target asked for; only present with keepScale. */
  readonly sceneScale?: number;
  /** Written bounds [x width, y height, z length], metres. */
  readonly size: readonly [number, number, number];
  readonly minY: number;
}

export const NORMALIZE_FRONT_YAW: Readonly<Record<NormalizeFront, number>> = { "+z": 0, "-z": 180, "+x": -90, "-x": 90 };

function yawQuat(deg: number): [number, number, number, number] {
  const h = (deg * Math.PI) / 360;
  return [0, Math.sin(h), 0, Math.cos(h)];
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function normalizeUsage(): string {
  return [
    "aura3d assets normalize <in.glb> --out <out.glb> [--front +z|-z|+x|-x] [--yaw <deg>] [--height <m> | --length <m> | --width <m> | --max-dim <m>] [--keep-scale] [--json]",
    "  Turns the model so its front faces +Z (+Y up), scales it to the size target, centres it in X/Z and grounds it at y = 0.",
    "  Static meshes get the transform baked into their vertices; skinned meshes keep one `auraRoot` wrapper node.",
    "  Records asset.extras.aura3d = { orientation: { forwardAxis: \"+z\", upAxis: \"+y\" }, grounded: true }.",
    "  --front      axis the model currently faces (default +z = no turn; Idol humanoids usually face +x or +z)",
    "  --keep-scale write scale 1 and report sceneScale (use for rigged files whose skin checks must see rest-length bones)"
  ].join("\n");
}

/**
 * Scale, ground and turn `input` so it faces +Z with +Y up and write it to `output`.
 * Returns the applied yaw/scale and the written bounds (rounded to millimetres).
 */
export async function normalizeGlb(input: string, output: string, opts: NormalizeGlbOptions = {}): Promise<NormalizeGlbResult> {
  const front = String(opts.front ?? "+z").toLowerCase();
  if (!(front in NORMALIZE_FRONT_YAW)) throw new Error(`--front must be one of +z, -z, +x, -x (got "${String(opts.front)}").`);
  const yawDeg = opts.yawDeg ?? 0;
  if (!Number.isFinite(yawDeg)) throw new Error("--yaw must be a number of degrees.");
  for (const [key, value] of Object.entries(opts.size ?? {})) {
    if (value !== undefined && !(typeof value === "number" && Number.isFinite(value) && value > 0)) throw new Error(`size.${key} must be a positive number of metres.`);
  }
  const inputPath = resolve(input);
  const outputPath = resolve(output);
  if (!existsSync(inputPath)) throw new Error(`File not found: ${input}`);

  const toolkit = opts.toolkit ?? loadGltfToolkit(opts.projectDir ?? process.cwd());
  const { getBounds, flatten, clearNodeTransform } = toolkit.functions as Loose;
  const io = await createGltfIo(toolkit);
  const doc: Loose = await io.read(inputPath);
  doc.setLogger(QUIET_GLTF_LOGGER);
  const root = doc.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  if (!scene) throw new Error(`${input} has no scene to normalize.`);

  const wrapper = doc.createNode("auraRoot");
  for (const child of scene.listChildren()) {
    scene.removeChild(child);
    wrapper.addChild(child);
  }
  scene.addChild(wrapper);
  const yaw = NORMALIZE_FRONT_YAW[front as NormalizeFront] + yawDeg;
  wrapper.setRotation(yawQuat(yaw));

  let bounds = getBounds(scene);
  const dims = [bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1], bounds.max[2] - bounds.min[2]];
  if (!dims.every((d: number) => Number.isFinite(d)) || Math.max(...dims) <= 0) throw new Error(`${input} has no measurable mesh bounds to normalize.`);
  const size = opts.size;
  let scale = 1;
  if (size?.height) scale = size.height / dims[1]!;
  else if (size?.length) scale = size.length / dims[2]!;
  else if (size?.width) scale = size.width / dims[0]!;
  else if (size?.maxDim) scale = size.maxDim / Math.max(...dims);
  if (!Number.isFinite(scale) || scale <= 0) throw new Error(`${input}: the size target needs a non-zero extent on that axis (bounds ${dims.map(round3).join(" x ")}).`);
  const sceneScale = scale;
  if (opts.keepScale) scale = 1;
  wrapper.setScale([scale, scale, scale]);
  bounds = getBounds(scene);
  wrapper.setTranslation([-(bounds.min[0] + bounds.max[0]) / 2, -bounds.min[1], -(bounds.min[2] + bounds.max[2]) / 2]);

  if (root.listSkins().length === 0) {
    // Static meshes: bake turn/scale/offset into the vertices. Nodes driven by TRS animation (and their ancestors) keep
    // their transforms, because the animation would overwrite a cleared local transform.
    await doc.transform(flatten());
    const animated = new Set<Loose>();
    for (const animation of root.listAnimations()) {
      for (const channel of animation.listChannels()) {
        const target = channel.getTargetNode();
        if (target && channel.getTargetPath() !== "weights") animated.add(target);
      }
    }
    const keep = new Set<Loose>();
    for (const node of animated) {
      for (let current: Loose = node; current; current = current.getParentNode()) keep.add(current);
    }
    for (const node of root.listNodes()) if (node.getMesh() && !keep.has(node)) clearNodeTransform(node);
  }

  bounds = getBounds(scene);
  const asset = root.getAsset();
  asset.extras = {
    ...(asset.extras ?? {}),
    aura3d: {
      orientation: { forwardAxis: "+z", upAxis: "+y" },
      grounded: true,
      ...(opts.keepScale ? { sceneScale: round3(sceneScale) } : {}),
      ...(opts.provenance ?? {})
    }
  };
  mkdirSync(dirname(outputPath), { recursive: true });
  await io.write(outputPath, doc);
  return {
    yawDeg: yaw,
    scale: round3(scale),
    ...(opts.keepScale ? { sceneScale: round3(sceneScale) } : {}),
    size: [round3(bounds.max[0] - bounds.min[0]), round3(bounds.max[1] - bounds.min[1]), round3(bounds.max[2] - bounds.min[2])],
    minY: round3(bounds.min[1])
  };
}
