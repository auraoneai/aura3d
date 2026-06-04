export const AURA_SHOT_LANGUAGE_GLOSSARY = [
  { term: "push-in", meaning: "Camera moves toward the target over the shot." },
  { term: "orbit", meaning: "Camera circles the target while keeping it framed." },
  { term: "truck", meaning: "Camera moves laterally across the scene." },
  { term: "crane", meaning: "Camera rises or lowers with vertical emphasis." },
  { term: "macro", meaning: "Camera uses tighter framing for product or detail inspection." }
] as const;

export function normalizeShotLanguage(input: string): string {
  const lower = input.toLowerCase();
  if (lower.includes("circle") || lower.includes("around")) return "orbit";
  if (lower.includes("close") || lower.includes("detail")) return "macro close";
  if (lower.includes("slide")) return "truck";
  return lower.trim() || "cinematic push-in";
}
