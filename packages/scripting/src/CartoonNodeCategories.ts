export const cartoonNodeCategories = [
  "scene",
  "dialogue",
  "camera",
  "audio",
  "timing",
  "publishing"
] as const;

export type CartoonNodeCategory = (typeof cartoonNodeCategories)[number];
