export interface RunnerChallengeSnapshot {
  readonly player: {
    readonly vx: number;
    readonly vy: number;
  };
  readonly collected: readonly string[];
  readonly activatedCheckpoints: readonly string[];
  readonly deaths: number;
  readonly checkpointId: string;
  readonly status: string;
  readonly score: number;
}

export interface RunnerChallengeEvidence {
  readonly kind: "skyline-runner-flow-challenge";
  readonly objective: "finish-with-collection-chain";
  readonly elapsedSeconds: number;
  readonly flow: number;
  readonly maxFlow: number;
  readonly collectionChain: number;
  readonly maxCollectionChain: number;
  readonly checkpointSplits: Readonly<Record<string, number>>;
  readonly challengeScore: number;
  readonly deathless: boolean;
  readonly completed: boolean;
  readonly objectiveMet: boolean;
  readonly resets: number;
  readonly recentEvents: readonly string[];
}

export interface RunnerChallenge {
  step(dt: number, previous: RunnerChallengeSnapshot, next: RunnerChallengeSnapshot): RunnerChallengeEvidence;
  reset(): RunnerChallengeEvidence;
  evidence(): RunnerChallengeEvidence;
}

export function createRunnerChallenge(targetSeconds = 45): RunnerChallenge {
  let elapsed = 0;
  let flow = 0;
  let maxFlow = 0;
  let collectionChain = 0;
  let maxCollectionChain = 0;
  let bonusScore = 0;
  let deathless = true;
  let completed = false;
  let resets = 0;
  const checkpointSplits: Record<string, number> = {};
  const recentEvents: string[] = [];
  let latestBaseScore = 0;
  let latestCollections = 0;

  function remember(event: string): void {
    recentEvents.push(event);
    if (recentEvents.length > 8) recentEvents.shift();
  }

  function evidence(): RunnerChallengeEvidence {
    const timeBonus = completed ? Math.max(0, Math.round((targetSeconds - elapsed) * 20)) : 0;
    return {
      kind: "skyline-runner-flow-challenge",
      objective: "finish-with-collection-chain",
      elapsedSeconds: round(elapsed),
      flow: round(flow),
      maxFlow: round(maxFlow),
      collectionChain,
      maxCollectionChain,
      checkpointSplits: { ...checkpointSplits },
      challengeScore: latestBaseScore + bonusScore + timeBonus,
      deathless,
      completed,
      objectiveMet: completed && latestCollections >= 3 && maxCollectionChain >= 2,
      resets,
      recentEvents: recentEvents.slice()
    };
  }

  return {
    step(dt, previous, next) {
      const step = Math.max(0, Math.min(0.1, dt));
      elapsed += step;
      latestBaseScore = next.score;
      latestCollections = next.collected.length;
      const moving = Math.abs(next.player.vx) > 0.05;
      const airborne = Math.abs(next.player.vy) > 0.08;
      flow = clamp(flow + (moving ? 10 * step : -14 * step) + (airborne ? 7 * step : 0), 0, 100);

      const collectedDelta = Math.max(0, next.collected.length - previous.collected.length);
      for (let index = 0; index < collectedDelta; index += 1) {
        collectionChain += 1;
        maxCollectionChain = Math.max(maxCollectionChain, collectionChain);
        flow = clamp(flow + 14, 0, 100);
        bonusScore += 50 * collectionChain;
        remember(`collection-chain:${collectionChain}`);
      }

      if (next.activatedCheckpoints.length > previous.activatedCheckpoints.length) {
        const checkpoint = next.checkpointId;
        checkpointSplits[checkpoint] = round(elapsed);
        bonusScore += Math.round(100 + flow * 2);
        remember(`checkpoint:${checkpoint}@${round(elapsed)}`);
      }

      if (next.deaths > previous.deaths) {
        deathless = false;
        collectionChain = 0;
        flow = 0;
        remember(`retry:${next.checkpointId}`);
      }

      if (next.status === "completed" && previous.status !== "completed") {
        completed = true;
        bonusScore += deathless ? 500 : 150;
        remember(`finish:${round(elapsed)}`);
      }
      maxFlow = Math.max(maxFlow, flow);
      return evidence();
    },
    reset() {
      elapsed = 0;
      flow = 0;
      maxFlow = 0;
      collectionChain = 0;
      maxCollectionChain = 0;
      bonusScore = 0;
      deathless = true;
      completed = false;
      latestBaseScore = 0;
      latestCollections = 0;
      resets += 1;
      for (const key of Object.keys(checkpointSplits)) delete checkpointSplits[key];
      recentEvents.length = 0;
      remember("challenge-reset");
      return evidence();
    },
    evidence
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
