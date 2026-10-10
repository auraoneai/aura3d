/** Ambient shape of `window.__AURA3D_SHELL__` / `__AURA3D_GAME_TEST__`
 * shared by the harness page and every game-shell spec. */
interface ShellWindow {
  status: "ready" | "error";
  error?: string;
  game?: unknown;
  readPixels?: () => number[] | null;
  readLuma?: () => number | null;
  sparkScreenPos?: { x: number; y: number };
}

interface GameTestHook {
  stepFrames(n: number, dt?: number): Promise<void>;
  presentLog: Array<{ frame: number; overlayOpacity: number; sceneId: number }>;
}

interface Window {
  __AURA3D_SHELL__?: ShellWindow;
  __AURA3D_GAME_TEST__?: GameTestHook;
}
