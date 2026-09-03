/**
 * Mech Hangar controller — slot UI state + preview turntable.
 *
 * Hangar controls (PRD section 4): 1-4 select slot, left/right cycle the part,
 * Enter locks the build, and mouse drag orbits the preview. Every cycle plays the
 * servo cue; lock-in is refused unless the assembly plan validated.
 */
import type { HangarAudioController } from "./hangar-audio";
import {
  DEFAULT_BUILD,
  MECH_SLOTS,
  PART_OPTIONS,
  catalogReady,
  cycleIndex,
  selectedParts,
  type BuildSelection,
  type MechSlot
} from "./parts-catalog";
import { aggregateStats } from "./stats";

export interface HangarStateSnapshot {
  readonly selection: BuildSelection;
  readonly activeSlotIndex: number;
  readonly activeSlot: MechSlot;
  readonly locked: boolean;
  readonly orbitYaw: number;
  readonly orbitPitch: number;
  readonly turntableYaw: number;
}

export interface HangarCallbacks {
  readonly onSelectionChanged: (selection: BuildSelection, changedSlot: MechSlot | null) => void;
  readonly onLockIn: () => void;
}

export interface HangarOptions {
  /** Reduced motion stops the turntable idle spin entirely (pixel-proof stability). */
  readonly reducedMotion?: boolean;
}

export interface HangarKeyContext {
  /** Returns true when the key was consumed by hangar UI (arena ignores it). */
  handleKeyDown(code: string): boolean;
}

export function createHangarController(audio: HangarAudioController, callbacks: HangarCallbacks, options: HangarOptions = {}) {
  let selection: BuildSelection = { ...DEFAULT_BUILD };
  let activeSlotIndex = 0;
  let locked = false;
  let orbitYaw = 0.62;
  let orbitPitch = 0.34;
  let turntableYaw = 0;
  let dragging = false;
  let lastPointerX = 0;
  let lastPointerY = 0;

  const activeSlot = (): MechSlot => MECH_SLOTS[activeSlotIndex]!;

  function cycle(delta: number): void {
    if (locked || !catalogReady) return;
    const slot = activeSlot();
    const length = PART_OPTIONS[slot].length;
    if (length <= 1) return;
    const next = cycleIndex(length, selection[slot], delta);
    selection = { ...selection, [slot]: next };
    void audio.cue("mechServoCycleSfx");
    callbacks.onSelectionChanged(selection, slot);
  }

  function selectSlot(index: number): void {
    if (locked) return;
    const bounded = Math.max(0, Math.min(MECH_SLOTS.length - 1, index));
    if (bounded === activeSlotIndex) return;
    activeSlotIndex = bounded;
    // Slot changes are silent for the sim but still confirm with the servo whirr.
    void audio.cue("mechServoCycleSfx");
  }

  function requestLock(): void {
    if (locked || !catalogReady) return;
    locked = true;
    void audio.cue("mechLockInSfx");
    callbacks.onLockIn();
  }

  function unlockForRematchEdit(): void {
    locked = false;
  }

  function handleKeyDown(code: string): boolean {
    switch (code) {
      case "Digit1":
        selectSlot(0);
        return true;
      case "Digit2":
        selectSlot(1);
        return true;
      case "Digit3":
        selectSlot(2);
        return true;
      case "Digit4":
        selectSlot(3);
        return true;
      case "ArrowLeft":
        cycle(-1);
        return true;
      case "ArrowRight":
        cycle(1);
        return true;
      case "Enter":
        if (!locked && catalogReady) requestLock();
        return true;
      default:
        return false;
    }
  }

  function attachPointer(target: HTMLElement): () => void {
    const down = (event: PointerEvent) => {
      dragging = true;
      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
    };
    const move = (event: PointerEvent) => {
      if (!dragging || locked) return;
      const dx = event.clientX - lastPointerX;
      const dy = event.clientY - lastPointerY;
      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
      orbitYaw -= dx * 0.008;
      orbitPitch = Math.max(-0.1, Math.min(1.1, orbitPitch + dy * 0.005));
    };
    const up = () => {
      dragging = false;
    };
    target.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      target.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }

  function update(_dt: number): void {
    // Keep the authored front three-quarter pose stable until the user drags
    // the preview.  An idle spin used to advance while typed GLBs were
    // decoding/evidence was settling, so the exact route-primary producer
    // could retain a rear-facing blank chassis on one run and a front-facing
    // visor on the next.  Pointer drag still updates orbitYaw/orbitPitch for
    // deliberate inspection; freezing this automatic turntable motion makes
    // screenshots and accessibility review deterministic without removing the
    // interactive orbit affordance.
  }

  return {
    handleKeyDown,
    attachPointer,
    update,
    requestLock,
    unlockForRematchEdit,
    cycle,
    get selection(): BuildSelection {
      return selection;
    },
    set selection(next: BuildSelection) {
      selection = { ...next };
      callbacks.onSelectionChanged(selection, null);
    },
    snapshot(): HangarStateSnapshot {
      return {
        selection,
        activeSlotIndex,
        activeSlot: activeSlot(),
        locked,
        orbitYaw,
        orbitPitch,
        turntableYaw
      };
    },
    stats() {
      return aggregateStats(selection);
    },
    parts() {
      return selectedParts(selection);
    }
  };
}
