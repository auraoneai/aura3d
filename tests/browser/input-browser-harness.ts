import { FirstPersonControls } from "@aura3d/controls";
import { ActionMap, ComboDetector, InputSystem, createTouchLayoutPreset, playHaptic, probeHaptics } from "@aura3d/input";

interface PointerLockResult {
  readonly available: boolean;
  readonly requested: boolean;
  readonly settled: boolean;
  readonly granted: boolean;
  readonly error?: string;
}

interface InputBrowserResult {
  readonly status: "running" | "ready" | "error";
  readonly keyboardBeforeBlur: boolean;
  readonly keyboardAfterBlur: boolean;
  readonly pointerButtonDown: boolean;
  readonly touchCountDuringDown: number;
  readonly touchCountAfterUp: number;
  readonly gamepadAxis: number;
  readonly gamepadButtonPressed: boolean;
  readonly firstPersonMoved: boolean;
  readonly remapRestored: boolean;
  readonly remapConflictCount: number;
  readonly comboFired: boolean;
  readonly hapticGateHonest: boolean;
  readonly hapticVia: string;
  readonly touchGenres: readonly string[];
  readonly touchFightButtons: number;
  readonly touchRaceButtons: number;
  readonly touchPlatformButtons: number;
  readonly accessibility: {
    readonly focusable: boolean;
    readonly role: string | null;
    readonly label: string | null;
    readonly describedBy: string | null;
  };
  readonly pointerLock: PointerLockResult;
  readonly error?: string;
}

declare global {
  interface Window {
    __AURA3D_INPUT_BROWSER_TEST__?: InputBrowserResult;
  }
}

function publish(result: InputBrowserResult): void {
  window.__AURA3D_INPUT_BROWSER_TEST__ = result;
}

function pointerEvent(type: string, options: PointerEventInit): Event {
  if (typeof PointerEvent === "function") {
    return new PointerEvent(type, { bubbles: true, ...options });
  }
  return new MouseEvent(type, { bubbles: true, clientX: options.clientX, clientY: options.clientY, button: options.button });
}

try {
  const surface = document.querySelector<HTMLCanvasElement>("#input-surface");
  const lockTarget = document.querySelector<HTMLButtonElement>("#lock-target");
  if (!surface || !lockTarget) throw new Error("Input harness DOM is incomplete.");

  const input = new InputSystem(surface);
  surface.focus();
  surface.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, code: "KeyW" }));
  const keyboardBeforeBlur = input.update().key("KeyW").down;
  const firstPersonCamera = {
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 }
  };
  const firstPerson = new FirstPersonControls(firstPersonCamera, { moveSpeed: 2 });
  firstPerson.applyInput(input.snapshot, 0.5);
  const firstPersonMoved = Math.hypot(firstPersonCamera.position.x, firstPersonCamera.position.z) > 0.9;

  surface.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
  const keyboardAfterBlur = input.update().key("KeyW").down;

  surface.dispatchEvent(pointerEvent("pointerdown", { clientX: 12, clientY: 16, pointerId: 7, pointerType: "touch", button: 0 }));
  const pointerDownSnapshot = input.update();
  const pointerButtonDown = pointerDownSnapshot.button(0).down;
  const touchCountDuringDown = pointerDownSnapshot.pointer.touches.length;

  surface.dispatchEvent(pointerEvent("pointerup", { clientX: 12, clientY: 16, pointerId: 7, pointerType: "touch", button: 0 }));
  const touchCountAfterUp = input.update().pointer.touches.length;
  const gamepadSnapshot = input.update([{
    id: "browser-proof-gamepad",
    index: 0,
    connected: true,
    axes: [0.75, 0],
    buttons: [{ pressed: true, value: 1 }]
  }]);
  const gamepadAxis = gamepadSnapshot.gamepads[0]?.axes[0] ?? 0;
  const gamepadButtonPressed = gamepadSnapshot.gamepadButton(0, 0).pressed;
  const accessibility = {
    focusable: surface.tabIndex === 0,
    role: surface.getAttribute("role"),
    label: surface.getAttribute("aria-label"),
    describedBy: surface.getAttribute("aria-describedby")
  };

  // I2: remap round-trip + conflict detection on the real ActionMap.
  const remappable = new ActionMap();
  remappable.bind("jump", [{ type: "keyboard", code: "Space" }]);
  remappable.bind("attack", [{ type: "keyboard", code: "KeyJ" }]);
  remappable.rebind("attack", [{ type: "keyboard", code: "Space" }]);
  const remapConflictCount = remappable.findConflicts().length;
  const remapSnapshot = remappable.serializeBindings();
  const remapClone = new ActionMap();
  remapClone.restoreBindings(JSON.parse(JSON.stringify(remapSnapshot)));
  remapClone.rebind("attack", [{ type: "keyboard", code: "KeyG" }]);
  remapClone.resetAction("attack");
  // Reset restores the persisted snapshot value (Space), proving restore→remap→reset.
  const remapRestored = JSON.stringify(remapClone.getBindings("attack")) === JSON.stringify([{ type: "keyboard", code: "Space" }]);

  // I2: generalized combo detection (fighting-game buffering at the code layer).
  const combos = new ComboDetector();
  combos.defineCombo({ id: "fireball", steps: ["ArrowDown", "ArrowRight", "KeyP"], bufferMs: 300 });
  combos.update({ pressed: ["ArrowDown"], down: ["ArrowDown"], timeMs: 0 });
  combos.update({ pressed: ["ArrowRight"], down: ["ArrowRight"], timeMs: 100 });
  const comboFired = combos.update({ pressed: ["KeyP"], down: ["KeyP"], timeMs: 200 }).some((event) => event.comboId === "fireball");

  // I2: haptics capability gate on the real navigator (headless has no vibrate:
  // the honest outcome there is played:false with a cause, never fake success).
  const capability = probeHaptics({ navigatorLike: navigator });
  const hapticResult = await playHaptic({ durationMs: 30 }, capability, { navigatorLike: navigator });
  // Honest iff success is only ever reported via a real sink, and every refusal carries a cause.
  const hapticGateHonest =
    (hapticResult.played && hapticResult.via !== "none") ||
    (!hapticResult.played && hapticResult.via === "none" && hapticResult.reason.length > 0);
  const hapticVia = hapticResult.via;

  // I2: analog-stick touch layouts for the three genres.
  const fightPreset = createTouchLayoutPreset("fight");
  const racePreset = createTouchLayoutPreset("race");
  const platformPreset = createTouchLayoutPreset("platform");
  const touchGenres = [fightPreset.genre, racePreset.genre, platformPreset.genre] as const;
  const touchFightButtons = fightPreset.hold.length + fightPreset.pulse.length;
  const touchRaceButtons = racePreset.hold.length + racePreset.pulse.length;
  const touchPlatformButtons = platformPreset.hold.length + platformPreset.pulse.length;

  publish({
    status: "running",
    keyboardBeforeBlur,
    keyboardAfterBlur,
    pointerButtonDown,
    touchCountDuringDown,
    touchCountAfterUp,
    gamepadAxis,
    gamepadButtonPressed,
    firstPersonMoved,
    remapRestored,
    remapConflictCount,
    comboFired,
    hapticGateHonest,
    hapticVia,
    touchGenres: [...touchGenres],
    touchFightButtons,
    touchRaceButtons,
    touchPlatformButtons,
    accessibility,
    pointerLock: {
      available: typeof surface.requestPointerLock === "function",
      requested: false,
      settled: false,
      granted: false
    }
  });

  lockTarget.addEventListener("click", () => {
    const available = typeof surface.requestPointerLock === "function";
    if (!available) {
      publish({
        status: "ready",
        keyboardBeforeBlur,
        keyboardAfterBlur,
        pointerButtonDown,
        touchCountDuringDown,
        touchCountAfterUp,
        gamepadAxis,
        gamepadButtonPressed,
        firstPersonMoved,
        remapRestored,
        remapConflictCount,
        comboFired,
        hapticGateHonest,
        hapticVia,
        touchGenres: [...touchGenres],
        touchFightButtons,
        touchRaceButtons,
        touchPlatformButtons,
        accessibility,
        pointerLock: { available, requested: false, settled: true, granted: false }
      });
      return;
    }

    let settled = false;
    const finish = (error?: string) => {
      if (settled) return;
      settled = true;
      document.removeEventListener("pointerlockchange", onChange);
      document.removeEventListener("pointerlockerror", onError);
      publish({
        status: "ready",
        keyboardBeforeBlur,
        keyboardAfterBlur,
        pointerButtonDown,
        touchCountDuringDown,
        touchCountAfterUp,
        gamepadAxis,
        gamepadButtonPressed,
        firstPersonMoved,
        remapRestored,
        remapConflictCount,
        comboFired,
        hapticGateHonest,
        hapticVia,
        touchGenres: [...touchGenres],
        touchFightButtons,
        touchRaceButtons,
        touchPlatformButtons,
        accessibility,
        pointerLock: {
          available,
          requested: true,
          settled: true,
          granted: document.pointerLockElement === surface,
          error
        }
      });
      document.exitPointerLock?.();
    };
    const onChange = () => finish();
    const onError = () => finish("pointerlockerror");
    document.addEventListener("pointerlockchange", onChange);
    document.addEventListener("pointerlockerror", onError);

    try {
      const request = surface.requestPointerLock();
      if (request && typeof request.catch === "function") {
        request.catch((error: unknown) => finish(error instanceof Error ? error.message : String(error)));
      }
      setTimeout(() => finish("timeout"), 1000);
    } catch (error) {
      finish(error instanceof Error ? error.message : String(error));
    }
  });
} catch (error) {
  publish({
    status: "error",
    keyboardBeforeBlur: false,
    keyboardAfterBlur: false,
    pointerButtonDown: false,
    touchCountDuringDown: 0,
    touchCountAfterUp: 0,
    gamepadAxis: 0,
    gamepadButtonPressed: false,
    firstPersonMoved: false,
    remapRestored: false,
    remapConflictCount: 0,
    comboFired: false,
    hapticGateHonest: false,
    hapticVia: "none",
    touchGenres: [],
    touchFightButtons: 0,
    touchRaceButtons: 0,
    touchPlatformButtons: 0,
    accessibility: { focusable: false, role: null, label: null, describedBy: null },
    pointerLock: { available: false, requested: false, settled: false, granted: false },
    error: error instanceof Error ? error.message : String(error)
  });
}
