export interface CrowdAnimationAgent {
  readonly id: string;
  readonly clip: string;
  readonly phase: number;
  readonly speed: number;
}

export interface CrowdAnimationSample {
  readonly id: string;
  readonly clip: string;
  readonly time: number;
}

export function sampleCrowdAnimation(agents: readonly CrowdAnimationAgent[], elapsedSeconds: number): readonly CrowdAnimationSample[] {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) {
    throw new Error("Crowd animation elapsedSeconds must be finite and non-negative.");
  }
  return agents.map((agent) => {
    if (!agent.id.trim() || !agent.clip.trim()) throw new Error("Crowd animation agents require id and clip.");
    if (!Number.isFinite(agent.phase) || !Number.isFinite(agent.speed) || agent.speed < 0) {
      throw new Error(`Crowd animation agent ${agent.id} has invalid phase or speed.`);
    }
    return { id: agent.id, clip: agent.clip, time: agent.phase + elapsedSeconds * agent.speed };
  });
}
