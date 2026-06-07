import type {
  CartoonEmotionPose,
  CartoonPerformanceBodyState,
  CartoonPerformanceFacialState,
  CartoonPerformanceGazeState
} from "./CartoonPerformance.js";

export interface PerformancePoseEditorSnapshot {
  readonly kind: "performance-pose-editor";
  readonly poseCount: number;
  readonly poses: readonly CartoonEmotionPose[];
}

export class PerformancePoseEditor {
  private readonly poses = new Map<string, CartoonEmotionPose>();

  constructor(poses: readonly CartoonEmotionPose[] = []) {
    for (const pose of poses) this.poses.set(pose.id, pose);
  }

  definePose(input: {
    readonly id: string;
    readonly emotion: string;
    readonly body: CartoonPerformanceBodyState;
    readonly facial: CartoonPerformanceFacialState;
    readonly gaze?: CartoonPerformanceGazeState | undefined;
    readonly notes?: readonly string[] | undefined;
  }): CartoonEmotionPose {
    const pose: CartoonEmotionPose = { ...input };
    this.poses.set(pose.id, pose);
    return pose;
  }

  getPose(id: string): CartoonEmotionPose | undefined {
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
