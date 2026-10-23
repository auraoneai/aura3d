import type { InputFrame, ShotPreset } from "../contract";
import type { DeviceInputMapper } from "../input/mapper";
import type { HudState } from "../ui/types";

export interface PlayerFrameContext {
  keys: Record<string, boolean | undefined>;
  stick: { x: number; y: number };
  /** Swipe gameplay or an open overlay means no direct input. */
  inputBlocked: boolean;
  modernServe: boolean;
  strategic: boolean;
  state: Pick<HudState, "server" | "phase" | "practice"> & { player: { selectedShot: ShotPreset } };
}

/** The frame the engine's `readInput('player')` receives each step: M-INPUT's `frame()` fed with the shell's held keys and stick. */
export function playerFrame(input: DeviceInputMapper, ctx: PlayerFrameContext): InputFrame {
  const keysDown = new Set<string>();
  for (const code of Object.keys(ctx.keys)) if (ctx.keys[code]) keysDown.add(code);
  return input.frame(
    { keysDown, pressedThisFrame: new Set(), touchStick: ctx.stick, time: 0 },
    {
      swipeActive: ctx.inputBlocked, modernServe: ctx.modernServe, strategic: ctx.strategic, server: ctx.state.server,
      phase: ctx.state.phase, practice: Boolean(ctx.state.practice), playerSelectedShot: ctx.state.player.selectedShot
    }
  );
}
