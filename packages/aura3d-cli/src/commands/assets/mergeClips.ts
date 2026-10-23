/**
 * `aura3d assets merge-clips --base rigged.glb --out hero.glb run=animation_run.glb idle=animation_idle.glb ...`
 *
 * Meshy rigging returns one rigged GLB, and every `animate` task returns a separate GLB that carries one clip on the
 * same skeleton. This copies each source clip onto the base rig by node name and writes ONE GLB with every named clip,
 * ready for AnimationController / cloneSkinned. Source clips that match no node of the base rig are rejected loudly
 * instead of producing a silent T-pose.
 */

import { existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createGltfIo, loadGltfToolkit, type GltfToolkit, type Loose } from "./gltfToolkit.js";

export interface MergeClipInput {
  /** Clip name written to the output GLB (and used by the game: run, idle, jump...). */
  readonly name: string;
  /** A GLB file, or a Meshy download directory containing animation_glb.glb. */
  readonly file: string;
}

export interface MergeClipsOptions {
  /** Rigged GLB, or a Meshy rig download directory containing rigged_character_glb.glb. */
  readonly base: string;
  readonly output: string;
  readonly clips: readonly MergeClipInput[];
  readonly projectDir?: string;
  /** Keep the rest-pose clips the rig task shipped with (default drops them unless a clip reuses the name). */
  readonly keepBaseAnimations?: boolean;
  /** Texture size cap for the written file (default 1024). */
  readonly tex?: number;
  readonly toolkit?: GltfToolkit;
}

export interface MergedClipReport {
  readonly name: string;
  readonly channels: number;
  readonly sourceChannels: number;
  readonly missingNodes: number;
  readonly duration: number;
}

export interface MergeClipsResult {
  readonly output: string;
  readonly bytes: number;
  readonly clips: readonly MergedClipReport[];
  readonly animations: readonly string[];
}

export function parseClipSpec(spec: string): MergeClipInput {
  const index = spec.indexOf("=");
  if (index <= 0 || index === spec.length - 1) throw new Error(`Clip spec "${spec}" must look like name=file.glb (or name=meshy-download-dir).`);
  const name = spec.slice(0, index);
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(name)) throw new Error(`Clip name "${name}" must start with a letter and use letters, digits, "-" or "_".`);
  return { name, file: spec.slice(index + 1) };
}

function resolveGlb(projectDir: string, path: string, directoryEntry: string): string {
  const resolved = resolve(projectDir, path);
  if (!existsSync(resolved)) throw new Error(`File not found: ${path}`);
  if (statSync(resolved).isDirectory()) {
    const inside = join(resolved, directoryEntry);
    if (!existsSync(inside)) throw new Error(`${path} is a directory without ${directoryEntry}.`);
    return inside;
  }
  return resolved;
}

export async function mergeGlbClips(options: MergeClipsOptions): Promise<MergeClipsResult> {
  if (options.clips.length === 0) throw new Error("merge-clips needs at least one name=file clip.");
  const names = new Set<string>();
  for (const clip of options.clips) {
    if (names.has(clip.name)) throw new Error(`Duplicate clip name "${clip.name}".`);
    names.add(clip.name);
  }
  const projectDir = resolve(options.projectDir ?? process.cwd());
  const output = resolve(projectDir, options.output);
  const tex = options.tex ?? 1024;
  if (!Number.isInteger(tex) || tex < 16 || tex > 4096) throw new Error(`--tex must be an integer from 16 to 4096 (got ${tex}).`);
  const toolkit = options.toolkit ?? loadGltfToolkit(projectDir);
  const { dedup, prune, textureCompress, resample, reorder } = toolkit.functions;
  const io = await createGltfIo(toolkit);
  const baseFile = resolveGlb(projectDir, options.base, "rigged_character_glb.glb");
  if (baseFile === output) throw new Error("--out must differ from --base.");
  const base: Loose = await io.read(baseFile);
  const root = base.getRoot();
  const buffer = root.listBuffers()[0] ?? base.createBuffer();
  const nodesByName = new Map<string, Loose>(root.listNodes().map((node: Loose) => [node.getName(), node]));
  const reports: MergedClipReport[] = [];

  for (const clip of options.clips) {
    const source: Loose = await io.read(resolveGlb(projectDir, clip.file, "animation_glb.glb"));
    const animation = source.getRoot().listAnimations()[0];
    if (!animation) throw new Error(`${clip.name}: ${clip.file} has no animation.`);
    const target: Loose = base.createAnimation(clip.name);
    const samplers = new Map<Loose, Loose>();
    let channels = 0;
    let missingNodes = 0;
    for (const channel of animation.listChannels()) {
      const node = nodesByName.get(channel.getTargetNode()?.getName());
      if (!node) {
        missingNodes += 1;
        continue;
      }
      const sourceSampler = channel.getSampler();
      if (!samplers.has(sourceSampler)) {
        const input = base.createAccessor().setType(sourceSampler.getInput().getType()).setArray(sourceSampler.getInput().getArray().slice()).setBuffer(buffer);
        const out = base.createAccessor().setType(sourceSampler.getOutput().getType()).setArray(sourceSampler.getOutput().getArray().slice()).setBuffer(buffer);
        const sampler = base.createAnimationSampler().setInput(input).setOutput(out).setInterpolation(sourceSampler.getInterpolation());
        target.addSampler(sampler);
        samplers.set(sourceSampler, sampler);
      }
      target.addChannel(base.createAnimationChannel().setTargetNode(node).setTargetPath(channel.getTargetPath()).setSampler(samplers.get(sourceSampler)));
      channels += 1;
    }
    if (channels === 0) {
      throw new Error(`${clip.name}: none of ${animation.listChannels().length} channels in ${clip.file} match a node of the base rig (different skeleton?).`);
    }
    const duration = Math.max(0, ...[...samplers.values()].map((sampler) => sampler.getInput().getMax([])[0] ?? 0));
    reports.push({ name: clip.name, channels, sourceChannels: animation.listChannels().length, missingNodes, duration });
  }

  if (options.keepBaseAnimations !== true) {
    for (const animation of root.listAnimations()) if (!names.has(animation.getName())) animation.dispose();
  }
  await base.transform(
    dedup(),
    resample(),
    prune(),
    textureCompress({ encoder: toolkit.sharp, resize: [tex, tex], targetFormat: "jpeg", slots: /^(?!normal)/, quality: 85 }),
    textureCompress({ encoder: toolkit.sharp, resize: [tex, tex], slots: /^normal/ }),
    reorder({ encoder: toolkit.MeshoptEncoder })
  );
  mkdirSync(dirname(output), { recursive: true });
  await io.write(output, base);
  return { output, bytes: statSync(output).size, clips: reports, animations: root.listAnimations().map((animation: Loose) => animation.getName()) };
}

export function mergeClipsUsage(): string {
  return "aura3d assets merge-clips --base rigged.glb|<rig-download-dir> --out hero.glb name=clip.glb|<animate-download-dir> [name=...] [--keep-base-animations] [--tex 1024] [--json]";
}
