export const animationNodeCategories = [
  "scene",
  "dialogue",
  "camera",
  "audio",
  "timing",
  "publishing"
] as const;

export type AnimationNodeCategory = (typeof animationNodeCategories)[number];
