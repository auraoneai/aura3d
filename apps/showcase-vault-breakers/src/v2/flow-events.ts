// T2 flow-event handling — extracted from boot.ts for 14-LOC (boot stays a
// thin orchestrator). Behavior is unchanged: the counters that index the
// impact-position rings live in this closure, exactly as before.
import type { VaultGameEvent } from "../gameplay/ball-flow";
import { BUMPER_IMPACT_POSITIONS, SLING_IMPACT_POSITIONS } from "./scene/fx";

interface VaultFx {
  onBumper(pos: unknown): void;
  onSling(pos: unknown): void;
  onTarget(id: string): void;
  onVaultOpen(): void;
  onMultiball(): void;
  onDrain(): void;
}

interface EventConsumerDeps {
  pushCue(cue: string): void;
  fx: VaultFx;
  hudBanner(text: string, options: { holdMs: number }): unknown;
  onServe(): void;
}

export function createEventConsumer(
  deps: EventConsumerDeps,
): (events: readonly VaultGameEvent[]) => void {
  const { pushCue, fx, hudBanner, onServe } = deps;
  let bumperIndex = 0;
  let slingIndex = 0;
  return function consumeEvents(events: readonly VaultGameEvent[]): void {
    for (const event of events) {
      switch (event.type) {
        case "serve":
          pushCue("plunger-release");
          onServe();
          break;
        case "bumper": {
          pushCue("bumper-hit");
          const pos = BUMPER_IMPACT_POSITIONS[bumperIndex % BUMPER_IMPACT_POSITIONS.length];
          bumperIndex += 1;
          fx.onBumper(pos);
          break;
        }
        case "sling":
          pushCue("sling-pop");
          fx.onSling(SLING_IMPACT_POSITIONS[slingIndex % SLING_IMPACT_POSITIONS.length]);
          slingIndex += 1;
          break;
        case "target-down":
          pushCue("target-down");
          fx.onTarget(event.id);
          break;
        case "bank-clear":
        case "all-banks-clear":
          pushCue("bank-clear");
          break;
        case "vault-open":
          pushCue("vault-open");
          fx.onVaultOpen();
          break;
        case "multiball-start":
          pushCue("multiball");
          fx.onMultiball();
          break;
        case "orbit-loop":
          pushCue("ramp-roll");
          break;
        case "ball-drain":
          pushCue("ball-drain");
          fx.onDrain();
          break;
        case "tilt-strike":
        case "tilt-lock":
          pushCue("tilt-warn");
          break;
        case "game-over":
          pushCue("ball-drain");
          void hudBanner("GAME OVER", { holdMs: 2600 });
          break;
        default:
          break;
      }
    }
  };
}
