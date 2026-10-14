// Flow scoring, re-authored fresh for the rebuilt route from the salvaged
// design numbers (the trashed runner-challenge module is deleted, not
// ported): flow 0..100 rises +10/s while moving and +7/s while airborne,
// decays -14/s while idle, +14 per collect; collects chained within 3 s
// build a chain worth +50 bonus score each beyond the first; checkpoint
// splits are recorded; a death zeroes flow and the chain and ends a
// deathless run. Pure snapshot-diff logic — no engine/DOM imports beyond
// the kit snapshot type.
import type { GamePlatformerSnapshot } from "@aura3d/engine";

// GamePlatformerSnapshot is re-exported by the engine root (the mini-game
// template imports it the same way).

export interface SkylineFlowState {
  readonly elapsedSeconds: number;
  readonly flowScore: number;
  readonly collectionChain: number;
  readonly maxCollectionChain: number;
  readonly collections: number;
  readonly checkpointSplits: Readonly<Record<string, number>>;
  readonly challengeScore: number;
  readonly deathless: boolean;
  readonly completed: boolean;
  readonly objectiveMet: boolean;
  readonly resets: number;
}

const CHAIN_WINDOW_SECONDS = 3;
const CHAIN_BONUS = 50;
const DEATHLESS_FINISH_BONUS = 250;
const FINISH_BONUS = 100;

const INITIAL: SkylineFlowState = {
  elapsedSeconds: 0,
  flowScore: 0,
  collectionChain: 0,
  maxCollectionChain: 0,
  collections: 0,
  checkpointSplits: {},
  challengeScore: 0,
  deathless: true,
  completed: false,
  objectiveMet: false,
  resets: 0
};

export function createSkylineFlow() {
  let state: SkylineFlowState = INITIAL;
  let lastCollectAt = Number.NEGATIVE_INFINITY;
  let finishBonusAwarded = false;
  let bonusScore = 0;

  function step(
    dt: number,
    previous: GamePlatformerSnapshot,
    next: GamePlatformerSnapshot
  ): SkylineFlowState {
    const elapsed = state.elapsedSeconds + Math.max(0, dt);
    let flow = state.flowScore;
    const moving = Math.abs(next.player.vx) > 0.1;
    if (!next.player.grounded) flow += 7 * dt;
    else if (moving) flow += 10 * dt;
    else flow -= 14 * dt;

    let chain = state.collectionChain;
    let maxChain = state.maxCollectionChain;
    let bonus = 0;
    const newCollects = next.collected.filter((id) => !previous.collected.includes(id));
    for (const _id of newCollects) {
      flow += 14;
      chain = elapsed - lastCollectAt <= CHAIN_WINDOW_SECONDS ? chain + 1 : 1;
      lastCollectAt = elapsed;
      maxChain = Math.max(maxChain, chain);
      if (chain > 1) bonus += CHAIN_BONUS;
    }
    if (newCollects.length === 0 && elapsed - lastCollectAt > CHAIN_WINDOW_SECONDS) chain = 0;

    const splits: Record<string, number> = { ...state.checkpointSplits };
    for (const id of next.activatedCheckpoints) {
      if (!previous.activatedCheckpoints.includes(id) && splits[id] === undefined) {
        splits[id] = Math.round(elapsed * 10) / 10;
      }
    }

    const died = next.deaths > previous.deaths;
    if (died) {
      flow = 0;
      chain = 0;
    }

    const completed = next.status === "completed";
    if (completed && !finishBonusAwarded) {
      bonus += FINISH_BONUS + (next.deaths === 0 ? DEATHLESS_FINISH_BONUS : 0);
      finishBonusAwarded = true;
    }

    state = {
      elapsedSeconds: elapsed,
      flowScore: Math.min(100, Math.max(0, flow)),
      collectionChain: chain,
      maxCollectionChain: maxChain,
      collections: next.collected.length,
      checkpointSplits: splits,
      challengeScore: next.score + (bonusScore += bonus),
      deathless: next.deaths === 0,
      completed,
      objectiveMet: completed && next.collected.length >= 3 && maxChain >= 2,
      resets: state.resets
    };
    return state;
  }

  function reset(): SkylineFlowState {
    const resets = state.resets + 1;
    state = { ...INITIAL, resets };
    lastCollectAt = Number.NEGATIVE_INFINITY;
    finishBonusAwarded = false;
    bonusScore = 0;
    return state;
  }

  return {
    step,
    reset,
    snapshot: (): SkylineFlowState => state
  };
}
