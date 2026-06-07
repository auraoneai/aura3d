export type EpisodeTemplateId = "short-form" | "standard" | "series-pilot" | "educational" | "music-video";

export interface EpisodeTemplate {
  readonly id: EpisodeTemplateId;
  readonly label: string;
  readonly durationMinutes: readonly [number, number];
  readonly characterRange: readonly [number, number];
  readonly beatRange: readonly [number, number];
  readonly cameraStyle: string;
  readonly musicCue: string;
}

export const episodeTemplates: readonly EpisodeTemplate[] = [
  { id: "short-form", label: "Short Form", durationMinutes: [1, 3], characterRange: [2, 3], beatRange: [3, 5], cameraStyle: "simple establishing, medium, close-up", musicCue: "light bed" },
  { id: "standard", label: "Standard", durationMinutes: [5, 7], characterRange: [3, 5], beatRange: [8, 12], cameraStyle: "multi-location shot/reverse-shot", musicCue: "theme plus underscore" },
  { id: "series-pilot", label: "Series Pilot", durationMinutes: [10, 15], characterRange: [3, 6], beatRange: [12, 18], cameraStyle: "character-introduction coverage", musicCue: "theme, stingers, act breaks" },
  { id: "educational", label: "Educational", durationMinutes: [3, 5], characterRange: [1, 4], beatRange: [5, 9], cameraStyle: "narrator-led topic segments", musicCue: "gentle loop with quiz stings" },
  { id: "music-video", label: "Music Video", durationMinutes: [2, 4], characterRange: [1, 5], beatRange: [4, 10], cameraStyle: "rhythmic choreography", musicCue: "song-driven" }
];

export function episodeTemplate(id: EpisodeTemplateId): EpisodeTemplate {
  const template = episodeTemplates.find((candidate) => candidate.id === id);
  if (!template) throw new Error(`Unknown episode template: ${id}`);
  return template;
}
