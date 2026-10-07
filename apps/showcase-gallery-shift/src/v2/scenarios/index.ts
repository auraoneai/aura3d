// apps/showcase-gallery-shift/src/v2/scenarios/index.ts — real-path scenarios.
// "floor-2" runs the real floor-advance path (the same buildFloorRuntime +
// syncFloorVisuals the exit sensor triggers); "alert" teleports the thief into
// guard-1's live patrol lane through the real ThiefPlayer.teleport path so the
// LOS/detection/guard-state chain produces a genuine alert; "autorun" drives
// scripted thief inputs through the same update loop a player uses.

export type GalleryScenario = "floor-2" | "alert" | "autorun";

export interface GalleryScenarioHooks {
  advanceToFloor2(): void;
  stageAlert(): void;
  startAutorun(): void;
}

export function parseGalleryScenario(raw: string | null): GalleryScenario | null {
  switch (raw) {
    case "floor-2":
    case "floor2":
    case "skyline":
    case "wing":
      return "floor-2";
    case "alert":
    case "caught":
    case "contact":
      return "alert";
    case "autorun":
    case "replay":
    case "capture":
      return "autorun";
    default:
      return null;
  }
}

export function applyGalleryScenario(scenario: GalleryScenario, hooks: GalleryScenarioHooks) {
  switch (scenario) {
    case "floor-2":
      hooks.advanceToFloor2();
      break;
    case "alert":
      hooks.stageAlert();
      break;
    case "autorun":
      hooks.startAutorun();
      break;
  }
}

export function galleryScenarioLook(scenario: GalleryScenario | null): Record<string, unknown> {
  return {
    applied: scenario ?? "default-play",
    kind: "v2-scenario",
    honest: true
  };
}
