/**
 * Generalized hold / input-buffer / combo detection for the input package.
 *
 * The engine's `createGameInput` already buffers and combos at the route-action
 * layer; this module generalizes the same ideas down at the raw-code layer
 * (keyboard codes, gamepad buttons, touch button ids) so any device feed —
 * including remapped actions resolved back to codes — can drive fighting-game
 * buffering without depending on the engine package.
 */

export interface ComboFrameInput {
  /** Codes pressed *this frame* (rising edges). */
  readonly pressed: readonly string[];
  /** Codes currently held down. */
  readonly down: readonly string[];
  readonly timeMs: number;
}

export interface ComboDefinition {
  readonly id: string;
  /** Ordered press sequence, e.g. `["ArrowDown", "ArrowRight", "KeyP"]`. Single-step + `holdMs` = a hold. */
  readonly steps: readonly string[];
  /** Max gap between consecutive steps. Defaults to `bufferMs`. */
  readonly maxIntervalMs?: number;
  /** Retain presses this long for matching. Defaults to 300. */
  readonly bufferMs?: number;
  /** For single-step combos: fire only after held this long. No repeat until re-press. */
  readonly holdMs?: number;
}

export interface ComboEvent {
  readonly comboId: string;
  readonly timeMs: number;
}

interface PressRecord {
  readonly code: string;
  readonly timeMs: number;
}

const HISTORY_LIMIT = 64;

export class ComboDetector {
  private readonly combos = new Map<string, ComboDefinition>();
  private history: PressRecord[] = [];
  private readonly holdStart = new Map<string, number>();
  private readonly holdFired = new Set<string>();

  defineCombo(definition: ComboDefinition): void {
    if (!definition.id) throw new Error("Combo id must be a non-empty string.");
    if (definition.steps.length === 0) throw new Error(`Combo "${definition.id}" needs at least one step.`);
    const bufferMs = definition.bufferMs ?? 300;
    if (!Number.isFinite(bufferMs) || bufferMs < 0) {
      throw new Error(`Combo "${definition.id}" bufferMs must be a non-negative finite number.`);
    }
    this.combos.set(definition.id, { ...definition, steps: [...definition.steps] });
  }

  removeCombo(id: string): boolean {
    return this.combos.delete(id);
  }

  comboIds(): readonly string[] {
    return [...this.combos.keys()];
  }

  reset(): void {
    this.history = [];
    this.holdStart.clear();
    this.holdFired.clear();
  }

  /**
   * Feed one frame; returns combos whose full sequence matched ending this frame.
   * Hold combos fire once per press when the hold duration is reached.
   */
  update(input: ComboFrameInput): readonly ComboEvent[] {
    const now = input.timeMs;
    const downSet = new Set(input.down);
    for (const code of input.pressed) {
      this.history.push({ code, timeMs: now });
      if (!this.holdStart.has(code)) this.holdStart.set(code, now);
    }
    if (this.history.length > HISTORY_LIMIT) {
      this.history = this.history.slice(this.history.length - HISTORY_LIMIT);
    }
    for (const [code, start] of [...this.holdStart]) {
      if (!downSet.has(code)) {
        this.holdStart.delete(code);
        this.holdFired.delete(code);
      } else if (start > now) {
        this.holdStart.set(code, now);
      }
    }

    const fired: ComboEvent[] = [];
    for (const combo of this.combos.values()) {
      const bufferMs = combo.bufferMs ?? 300;
      const maxInterval = combo.maxIntervalMs ?? bufferMs;
      const recent = this.history.filter((press) => now - press.timeMs <= Math.max(bufferMs, maxInterval));
      if (combo.steps.length === 1 && combo.holdMs !== undefined) {
        const code = combo.steps[0]!;
        const start = this.holdStart.get(code);
        if (start !== undefined && downSet.has(code) && !this.holdFired.has(combo.id) && now - start >= combo.holdMs) {
          this.holdFired.add(combo.id);
          fired.push({ comboId: combo.id, timeMs: now });
        }
        continue;
      }
      if (input.pressed.length === 0) continue;
      if (matchesSequence(recent, combo.steps, maxInterval) && recent[recent.length - 1]?.timeMs === now) {
        fired.push({ comboId: combo.id, timeMs: now });
      }
    }
    return fired;
  }

  /** True while `code` has been continuously held for at least `durationMs` at `nowMs`. */
  held(code: string, durationMs: number, nowMs: number): boolean {
    const start = this.holdStart.get(code);
    return start !== undefined && nowMs - start >= durationMs;
  }
}

function matchesSequence(history: readonly PressRecord[], steps: readonly string[], maxIntervalMs: number): boolean {
  if (history.length < steps.length) return false;
  const tail = history.slice(history.length - steps.length);
  for (let index = 0; index < steps.length; index += 1) {
    if (tail[index]?.code !== steps[index]) return false;
    if (index > 0 && tail[index]!.timeMs - tail[index - 1]!.timeMs > maxIntervalMs) return false;
  }
  return true;
}
