import type {
  AnimationEmotionPose,
  AnimationPerformanceBodyState,
  AnimationPerformanceFacialState,
  AnimationPerformanceGazeState
} from "./AnimationPerformance.js";

export interface PerformancePoseEditorSnapshot {
  readonly kind: "performance-pose-editor";
  readonly poseCount: number;
  readonly poses: readonly AnimationEmotionPose[];
}

export class PerformancePoseEditor {
  private readonly poses = new Map<string, AnimationEmotionPose>();

  constructor(poses: readonly AnimationEmotionPose[] = []) {
    for (const pose of poses) this.poses.set(pose.id, pose);
  }

  definePose(input: {
    readonly id: string;
    readonly emotion: string;
    readonly body: AnimationPerformanceBodyState;
    readonly facial: AnimationPerformanceFacialState;
    readonly gaze?: AnimationPerformanceGazeState | undefined;
    readonly notes?: readonly string[] | undefined;
  }): AnimationEmotionPose {
    const pose: AnimationEmotionPose = { ...input };
    this.poses.set(pose.id, pose);
    return pose;
  }

  getPose(id: string): AnimationEmotionPose | undefined {
    return this.poses.get(id);
  }

  snapshot(): PerformancePoseEditorSnapshot {
    return {
      kind: "performance-pose-editor",
      poseCount: this.poses.size,
      poses: [...this.poses.values()]
    };
  }
}
