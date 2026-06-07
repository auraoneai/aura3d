import { createPromptAnimationIssue, type PromptAnimationId, type PromptAnimationValidationIssue } from "./PromptAnimationContract.js";

export type ShotCompositionRule = "rule-of-thirds" | "center-safe" | "headroom" | "leading-room";

export interface ShotCompositionGuide {
  readonly rule: ShotCompositionRule;
  readonly lines: readonly { readonly axis: "x" | "y"; readonly value: number }[];
  readonly safeArea: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly notes: readonly string[];
}

export interface ShotSubjectFrameBox {
  readonly subjectId: PromptAnimationId;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly facing?: "left" | "right" | "camera" | "three-quarter" | undefined;
}

export interface ShotCompositionRuleOptions {
  readonly ruleOfThirdsTolerance?: number | undefined;
  readonly minHeadroom?: number | undefined;
  readonly maxHeadroom?: number | undefined;
  readonly minLeadingRoom?: number | undefined;
  readonly safeAreaMargin?: number | undefined;
}

export interface ShotCompositionReport {
  readonly subjectCount: number;
  readonly score: number;
  readonly issues: readonly PromptAnimationValidationIssue[];
  readonly overlays: readonly ShotCompositionOverlay[];
}

export interface ShotCompositionOverlay {
  readonly kind: "rule-of-thirds" | "safe-area" | "headroom" | "leading-room";
  readonly lines?: readonly number[] | undefined;
  readonly margin?: number | undefined;
}

export function createShotCompositionGuide(rule: ShotCompositionRule, aspectRatio = 16 / 9): ShotCompositionGuide {
  const safeX = rule === "center-safe" ? 0.12 : 0.08;
  const safeY = rule === "headroom" ? 0.06 : 0.08;
  return {
    rule,
    lines: rule === "rule-of-thirds"
      ? [{ axis: "x", value: 1 / 3 }, { axis: "x", value: 2 / 3 }, { axis: "y", value: 1 / 3 }, { axis: "y", value: 2 / 3 }]
      : [{ axis: "x", value: 0.5 }, { axis: "y", value: rule === "headroom" ? 0.42 : 0.5 }],
    safeArea: { x: safeX, y: safeY, width: 1 - safeX * 2, height: Math.min(1 - safeY * 2, (1 - safeX * 2) / aspectRatio) },
    notes: rule === "leading-room" ? ["Leave extra room in the subject's facing direction."] : []
  };
}

export function evaluateShotComposition(
  subjects: readonly ShotSubjectFrameBox[],
  options: ShotCompositionRuleOptions = {}
): ShotCompositionReport {
  const issues: PromptAnimationValidationIssue[] = [];
  const thirds = [1 / 3, 2 / 3];
  const tolerance = options.ruleOfThirdsTolerance ?? 0.08;
  const safeAreaMargin = options.safeAreaMargin ?? 0.05;
  const minHeadroom = options.minHeadroom ?? 0.03;
  const maxHeadroom = options.maxHeadroom ?? 0.18;
  const minLeadingRoom = options.minLeadingRoom ?? 0.08;

  for (const subject of subjects) {
    const centerX = subject.x + subject.width / 2;
    const nearThird = thirds.some((third) => Math.abs(centerX - third) <= tolerance);
    if (!nearThird && subjects.length <= 2) {
      issues.push(createPromptAnimationIssue("warning", "shot-composition-thirds", `Subject "${subject.subjectId}" is not near a rule-of-thirds vertical.`, { path: `subjects.${subject.subjectId}` }));
    }
    const headroom = subject.y;
    if (headroom < minHeadroom || headroom > maxHeadroom) {
      issues.push(createPromptAnimationIssue("warning", "shot-composition-headroom", `Subject "${subject.subjectId}" headroom is outside the preferred range.`, { path: `subjects.${subject.subjectId}.y` }));
    }
    if (subject.x < safeAreaMargin || subject.y < safeAreaMargin || subject.x + subject.width > 1 - safeAreaMargin || subject.y + subject.height > 1 - safeAreaMargin) {
      issues.push(createPromptAnimationIssue("error", "shot-composition-safe-area", `Subject "${subject.subjectId}" leaves the safe title area.`, { path: `subjects.${subject.subjectId}` }));
    }
    if (subject.facing === "left" && subject.x < minLeadingRoom) {
      issues.push(createPromptAnimationIssue("warning", "shot-composition-leading-room", `Subject "${subject.subjectId}" needs more leading room to the left.`, { path: `subjects.${subject.subjectId}.x` }));
    }
    if (subject.facing === "right" && 1 - (subject.x + subject.width) < minLeadingRoom) {
      issues.push(createPromptAnimationIssue("warning", "shot-composition-leading-room", `Subject "${subject.subjectId}" needs more leading room to the right.`, { path: `subjects.${subject.subjectId}.x` }));
    }
  }

  return {
    subjectCount: subjects.length,
    score: Math.max(0, 1 - issues.length / Math.max(1, subjects.length * 4)),
    issues,
    overlays: [
      { kind: "rule-of-thirds", lines: thirds },
      { kind: "safe-area", margin: safeAreaMargin },
      { kind: "headroom", lines: [minHeadroom, maxHeadroom] },
      { kind: "leading-room", margin: minLeadingRoom }
    ]
  };
}
