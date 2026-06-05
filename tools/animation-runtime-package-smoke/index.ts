import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  AnimationController,
  type AnimationPose,
  type AuraRuntimeNodeAnimationBindingMetadata,
  type AuraRuntimeNodeAnimationPoseBindingMetadata,
  type RuntimeNodeHandleLike
} from "../../packages/engine/src/index";

const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")) as {
  readonly name?: string;
  readonly exports?: Record<string, unknown>;
};

const poseAt = (x: number): AnimationPose => ({
  bones: {
    root: {
      position: { x, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 }
    }
  },
  morphTargets: { AA: 0.7, EE: 0.2, smile: 0.5 }
});

class SmokeRuntimeNode implements RuntimeNodeHandleLike {
  readonly id = "smoke-node";
  readonly kind = "model";
  readonly tags = ["animation-runtime"];
  position = [0, 0, 0] as const;
  rotation = [0, 0, 0] as const;
  scale = 1;
  visible = true;
  animation?: { readonly clip?: string; readonly captureTime?: number };
  animationBinding?: AuraRuntimeNodeAnimationBindingMetadata;
  animationPoseBinding?: AuraRuntimeNodeAnimationPoseBindingMetadata;
  pose?: AnimationPose;
  morphs: Record<string, number> = {};

  setPosition(): this { return this; }
  translate(): this { return this; }
  setRotation(): this { return this; }
  setScale(): this { return this; }
  setVisible(): this { return this; }
  play(clip: string, options: { readonly captureTime?: number } = {}): this {
    this.animation = { ...options, clip };
    return this;
  }
  setAnimation(animation: { readonly clip?: string; readonly captureTime?: number } | undefined): this {
    this.animation = animation;
    return this;
  }
  setAnimationBinding(binding: AuraRuntimeNodeAnimationBindingMetadata | undefined): this {
    this.animationBinding = binding;
    return this;
  }
  setAnimationPose(pose: AnimationPose | undefined, metadata?: AuraRuntimeNodeAnimationPoseBindingMetadata): this {
    this.pose = pose;
    this.animationPoseBinding = metadata;
    return this;
  }
  animationPose(): AnimationPose | undefined {
    return this.pose;
  }
  setMorphTarget(name: string, weight: number): this {
    this.morphs[name] = weight;
    return this;
  }
  setMorphTargets(weights: Record<string, number>): this {
    this.morphs = { ...weights };
    return this;
  }
  morphTargets(): Record<string, number> {
    return { ...this.morphs };
  }
  snapshot(): unknown {
    return {
      animation: this.animation,
      animationBinding: this.animationBinding,
      animationPoseBinding: this.animationPoseBinding,
      morphTargets: this.morphs
    };
  }
}

const issues: string[] = [];
if (packageJson.name !== "@aura3d/engine") issues.push("Root package name must remain @aura3d/engine.");
for (const exportKey of [".", "./animation", "./animation/browser"]) {
  if (!packageJson.exports?.[exportKey]) issues.push(`Missing package export ${exportKey}.`);
}

const node = new SmokeRuntimeNode();
const controller = new AnimationController<"idle">({
  id: "package-smoke-animation-runtime",
  clips: [{ id: "idle", duration: 1, loop: true, sample: ({ normalizedTime }) => poseAt(normalizedTime) }]
});
controller.bindRuntimeNode(node, { id: "smoke-binding" });
controller.play("idle", { loop: "loop" });
controller.update(0.25);

if (node.animation?.clip !== "idle") issues.push("AnimationController did not forward clip playback to runtime node.");
if (node.animationBinding?.activeClipId !== "idle") issues.push("Runtime node animation binding metadata missing active clip.");
if (node.animationPoseBinding?.boneCount !== 1) issues.push("Runtime node pose binding metadata missing bone count.");
if (Object.keys(node.morphs).length < 3) issues.push("Runtime node morph targets were not applied.");

const report = {
  ok: issues.length === 0,
  status: issues.length === 0 ? "pass" : "blocked",
  schema: "aura3d105-animation-runtime-package-smoke",
  generatedAt: new Date().toISOString(),
  packageName: packageJson.name,
  exportsChecked: [".", "./animation", "./animation/browser"],
  runtimeBinding: node.snapshot(),
  issues
};

console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;

