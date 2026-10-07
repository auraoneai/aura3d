/**
 * components.ts — PRD-09 day-0 interim shell/HUD/FX members.
 *
 * The session/shell/capture/beacon surface is real on day-0; HUD widgets,
 * touch layouts and the FX layer deepen in the phase-2/3 PRs. These
 * implementations satisfy the C-24 surface honestly — no panics, values are
 * tracked and inspectable via snapshot() — and carry the same
 * "primitive-pool" backend label the engine stub used.
 */

import type {
  GameSession,
  GameShell,
  Hud,
  GameFxLayer,
  TransitionSpec
} from "@aura3d/engine/contracts";
import type { AuraVec3 } from "@aura3d/engine";
import type { GameSessionImpl } from "./session/GameSession";

export class GameShellImpl implements GameShell {
  public constructor(private readonly session: GameSessionImpl) {}

  public get state() {
    return this.session.state;
  }

  public async showResults(_values: Readonly<Record<string, number>>): Promise<"retry" | "title" | "next"> {
    this.session.transition("results");
    return "retry";
  }

  public async transition<T>(run: () => T | Promise<T>, _spec?: TransitionSpec): Promise<T> {
    const from = this.session.state;
    this.session.transition("transitioning");
    try {
      return await run();
    } finally {
      this.session.transition(from === "transitioning" ? "playing" : from);
    }
  }

  public openMenu(_id: "pause" | "settings" | "about"): void {
    this.session.pause("menu");
  }

  public closeMenus(): void {
    this.session.releasePause("menu");
  }

  public setLoadingProgress(_fraction: number, _label?: string): void {
    /* DOM shell lands in the shell PR — progress is accepted silently here. */
  }

  public track(_promise: Promise<unknown>, _weight: number): void {
    /* loading progress aggregation lands with the shell PR. */
  }
}

export class GameHudImpl implements Hud {
  private readonly values = new Map<string, unknown>();

  public set(id: string, value: unknown): void {
    this.values.set(id, value);
  }

  public async banner(_text: string, _o?: { holdMs?: number; style?: string }): Promise<void> {}

  public toast(_text: string, _o?: { ms?: number }): void {}

  public damageNumber(_value: number, _world: AuraVec3, _o?: { color?: string; crit?: boolean }): void {}

  public setVisible(_v: boolean): void {}

  public snapshot() {
    return {
      widgets: [...this.values.entries()].map(([id, value]) => ({ id, value, screenFraction: 0 }))
    };
  }

  public dispose(): void {
    this.values.clear();
  }
}

export class GameFxLayerImpl implements GameFxLayer {
  private live = 0;

  public burst(_kind: string, _position: AuraVec3, _o?: { count?: number; speed?: number; color?: string; normal?: AuraVec3; seed?: number }): void {
    this.live += 1;
  }

  public trail(_target: string, _o: { width: number; life: number; color?: string }): { stop(): void } {
    this.live += 1;
    return { stop: () => { this.live = Math.max(0, this.live - 1); } };
  }

  public get liveCount(): number {
    return this.live;
  }

  public get backend(): "primitive-pool" | "particle-pass" {
    return "primitive-pool";
  }
}
