export interface PerformanceScriptCue {
  readonly kind: "performance-script-cue";
  readonly emotion?: string | undefined;
  readonly gesture?: string | undefined;
  readonly delivery?: string | undefined;
  readonly cleanText: string;
}

export function parsePerformanceScriptCue(text: string): PerformanceScriptCue {
  const tags = [...text.matchAll(/\[([^\]]+)\]/g)].map((match) => match[1] ?? "");
  const cleanText = text.replace(/\[[^\]]+\]/g, "").replace(/\s+/g, " ").trim();
  const cue: PerformanceScriptCue = { kind: "performance-script-cue", cleanText };
  return tags.reduce((current, tag) => {
    const [rawKey, rawValue] = tag.split(":");
    const key = rawValue === undefined ? "emotion" : rawKey?.trim().toLowerCase();
    const value = (rawValue ?? rawKey ?? "").trim();
    if (key === "gestures" || key === "gesture") return { ...current, gesture: value };
    if (key === "delivery") return { ...current, delivery: value };
    return { ...current, emotion: value };
  }, cue);
}
