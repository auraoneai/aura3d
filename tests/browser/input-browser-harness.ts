import { InputSystem } from "@aura3d/input";

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

  surface.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
  const keyboardAfterBlur = input.update().key("KeyW").down;

  surface.dispatchEvent(pointerEvent("pointerdown", { clientX: 12, clientY: 16, pointerId: 7, pointerType: "touch", button: 0 }));
  const pointerDownSnapshot = input.update();
  const pointerButtonDown = pointerDownSnapshot.button(0).down;
  const touchCountDuringDown = pointerDownSnapshot.pointer.touches.length;

  surface.dispatchEvent(pointerEvent("pointerup", { clientX: 12, clientY: 16, pointerId: 7, pointerType: "touch", button: 0 }));
  const touchCountAfterUp = input.update().pointer.touches.length;

  publish({
    status: "running",
    keyboardBeforeBlur,
    keyboardAfterBlur,
    pointerButtonDown,
    touchCountDuringDown,
    touchCountAfterUp,
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
    pointerLock: { available: false, requested: false, settled: false, granted: false },
    error: error instanceof Error ? error.message : String(error)
  });
}
