// Skinned actor helpers — extracted from boot.ts for 14-LOC. Clip state lives
// in the factory closure exactly as it did at module scope.

interface ActorHandle {
  crossFadeTo?(clip: string, seconds: number): void;
  animation?: { animationState?: () => { tracksApplied?: number } | undefined };
  animationState?: () => { tracksApplied?: number } | undefined;
}

export function createRooftopActors(
  handle: (name: string) => unknown,
): {
  crossFade(actor: "scorer" | "defender", clip: string, seconds?: number): void;
  actorTracksApplied(actor: "scorer" | "defender"): number;
} {
  const actorClips: Record<"scorer" | "defender", string> = { scorer: "Ready", defender: "Plant" };

  function crossFade(actor: "scorer" | "defender", clip: string, seconds = 0.25): void {
    if (actorClips[actor] === clip) return;
    actorClips[actor] = clip;
    const h = handle(actor === "scorer" ? "skinned-scorer" : "skinned-defender");
    (h as ActorHandle | undefined)?.crossFadeTo?.(clip, seconds);
  }

  function actorTracksApplied(actor: "scorer" | "defender"): number {
    const h = handle(actor === "scorer" ? "skinned-scorer" : "skinned-defender") as ActorHandle | undefined;
    return h?.animation?.animationState?.()?.tracksApplied ?? h?.animationState?.()?.tracksApplied ?? 0;
  }

  return { crossFade, actorTracksApplied };
}
